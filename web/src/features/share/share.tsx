import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { Button } from '../../shared/components/ui/button'

const trackSchema = z.object({
	index: z.number(),
	startOffset: z.number().nonnegative(),
	duration: z.number().nonnegative(),
	contentUrl: z.string(),
	title: z.string().optional(),
})
export const shareSchema = z.object({
	slug: z.string(),
	isDownloadable: z.boolean(),
	playbackSession: z.object({
		displayTitle: z.string().nullish(),
		displayAuthor: z.string().nullish(),
		coverPath: z.string().nullish(),
		currentTime: z.number().optional(),
		duration: z.number().nonnegative(),
		audioTracks: z.array(trackSchema),
		chapters: z
			.array(
				z.object({ title: z.string(), start: z.number(), end: z.number() }),
			)
			.optional(),
	}),
})
const serverBase = () =>
	(window.__ABS_WEB_CONFIG__?.apiBasePath ?? '').replace(/\/$/, '')
export function publicShareUrl(slug: string, suffix = '') {
	return `${serverBase()}/public/share/${encodeURIComponent(slug)}${suffix}`
}
export function safeTrackUrl(value: string, slug: string) {
	const url = new URL(value, location.origin)
	// Native responses retain configured server prefix even through root aliases.
	// Validate raw namespace before URL parsing can erase traversal segments, then
	// rebuild transport URL from trusted runtime prefix, never supplied prefix.
	const rawPath = value.startsWith('/')
		? value
		: value.replace(/^https?:\/\/[^/]+/i, '')
	const match =
		/^(?:\/[-A-Za-z0-9._~]+)*\/public\/share\/([^/]+)\/track\/(\d+)$/.exec(
			rawPath,
		)
	if (
		url.origin !== location.origin ||
		!['http:', 'https:'].includes(url.protocol) ||
		url.username ||
		url.password ||
		value.includes('\\') ||
		rawPath.split('/').some((segment) => segment === '.' || segment === '..') ||
		!match ||
		match[1] !== encodeURIComponent(slug) ||
		!Number.isSafeInteger(Number(match[2])) ||
		url.search ||
		url.hash
	)
		throw new Error('Invalid public audio URL')
	return new URL(publicShareUrl(slug, `/track/${match[2]}`), location.origin)
		.href
}
export async function loadShare(slug: string, time?: number) {
	const response = await fetch(
		publicShareUrl(slug, time === undefined ? '' : `?t=${time}`),
		{ credentials: 'same-origin' },
	)
	if (!response.ok)
		throw new Error(
			response.status === 404
				? 'Media item not found or expired'
				: `Unable to load share (${response.status})`,
		)
	const share = shareSchema.parse(await response.json())
	if (share.slug !== slug) throw new Error('Invalid public share')
	for (const track of share.playbackSession.audioTracks)
		safeTrackUrl(track.contentUrl, slug)
	return share
}
export function SharePlayer({ slug, time }: { slug: string; time?: number }) {
	const [share, setShare] = useState<z.infer<typeof shareSchema> | null>(null)
	const [error, setError] = useState('')
	const [current, setCurrent] = useState(0)
	const [trackIndex, setTrackIndex] = useState(0)
	const [rate, setRate] = useState(1)
	const [attempt, setAttempt] = useState(0)
	const audio = useRef<HTMLAudioElement>(null)
	const chaptersSelect = useRef<HTMLSelectElement>(null)
	const resume = useRef(false)
	const desired = useRef(0)
	const lastSync = useRef(0)
	useEffect(() => {
		void attempt // Explicit retry restarts this request.
		let active = true
		setShare(null)
		setError('')
		loadShare(slug, time)
			.then((value) => {
				if (!active) return
				const start = value.playbackSession.currentTime ?? 0
				desired.current = start
				setCurrent(start)
				setTrackIndex(
					Math.max(
						0,
						value.playbackSession.audioTracks.findIndex(
							(track) => track.startOffset + track.duration > start,
						),
					),
				)
				setShare(value)
			})
			.catch((cause: unknown) => {
				if (active)
					setError(
						cause instanceof Error ? cause.message : 'Unable to load share',
					)
			})
		return () => {
			active = false
		}
	}, [slug, time, attempt])
	const session = share?.playbackSession
	const track = session?.audioTracks[trackIndex]
	async function sync(value: number) {
		try {
			const response = await fetch(publicShareUrl(slug, '/progress'), {
				method: 'PATCH',
				credentials: 'same-origin',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ currentTime: value }),
			})
			if (!response.ok)
				throw new Error(
					`Unable to save listening progress (${response.status})`,
				)
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : 'Unable to save progress',
			)
		}
	}
	const seek = useCallback(
		(value: number) => {
			if (!session) return
			const next = Math.min(session.duration, Math.max(0, value))
			const found = session.audioTracks.findIndex(
				(entry) => entry.startOffset + entry.duration > next,
			)
			const index =
				found < 0 ? Math.max(0, session.audioTracks.length - 1) : found
			desired.current = next
			setCurrent(next)
			if (index === trackIndex && audio.current && track)
				audio.current.currentTime = next - track.startOffset
			else {
				resume.current = !!audio.current && !audio.current.paused
				setTrackIndex(index)
			}
		},
		[session, trackIndex, track],
	)
	useEffect(() => {
		if (!session || !('mediaSession' in navigator)) return
		navigator.mediaSession.metadata = new MediaMetadata({
			title: session.displayTitle || 'No title',
			artist: session.displayAuthor || 'Unknown',
		})
		const handlers: Partial<
			Record<MediaSessionAction, MediaSessionActionHandler>
		> = {
			play: () => {
				void audio.current
					?.play()
					.catch(() => setError('Playback could not start'))
			},
			pause: () => audio.current?.pause(),
			stop: () => audio.current?.pause(),
			seekbackward: () => seek(current - 10),
			seekforward: () => seek(current + 10),
			seekto: (details) => {
				if (details.seekTime !== undefined) seek(details.seekTime)
			},
			previoustrack: () => seek(current - 10),
			nexttrack: () => seek(current + 10),
		}
		for (const [action, handler] of Object.entries(handlers))
			navigator.mediaSession.setActionHandler(
				action as MediaSessionAction,
				handler,
			)
		return () => {
			for (const action of Object.keys(handlers))
				navigator.mediaSession.setActionHandler(
					action as MediaSessionAction,
					null,
				)
		}
	}, [session, current, seek])
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (
				!audio.current ||
				(event.target instanceof HTMLElement &&
					['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A'].includes(
						event.target.tagName,
					))
			)
				return
			const player = audio.current
			if (event.code === 'Space') {
				if (player.paused)
					void player.play().catch(() => setError('Playback could not start'))
				else player.pause()
			} else if (event.code === 'ArrowRight') seek(current + 10)
			else if (event.code === 'ArrowLeft') seek(current - 10)
			else if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
				const direction = event.code === 'ArrowUp' ? 1 : -1
				if (event.shiftKey) {
					const next = Math.min(3, Math.max(0.5, rate + direction * 0.25))
					setRate(next)
					player.playbackRate = next
				} else
					player.volume = Math.min(
						1,
						Math.max(0, player.volume + direction * 0.1),
					)
			} else if (event.code === 'KeyM') player.muted = !player.muted
			else if (event.code === 'KeyL') chaptersSelect.current?.focus()
			else if (event.code === 'Escape') player.pause()
			else return
			event.preventDefault()
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [current, rate, seek])
	if (!share)
		return (
			<main className="mx-auto max-w-2xl p-8">
				{error ? (
					<div>
						<p role="alert">{error}</p>
						<Button
							className="mt-4"
							onClick={() => setAttempt((value) => value + 1)}
						>
							Retry
						</Button>
					</div>
				) : (
					<p role="status">Loading share…</p>
				)}
			</main>
		)
	return (
		<main className="mx-auto max-w-2xl space-y-5 p-6">
			{session?.coverPath && (
				<img
					className="mx-auto max-h-80 rounded-lg object-contain"
					src={publicShareUrl(slug, '/cover')}
					alt="Cover"
				/>
			)}
			<h1 className="text-center text-3xl font-semibold">
				{session?.displayTitle || 'No title'}
			</h1>
			<p className="text-center text-muted-foreground">
				{session?.displayAuthor}
			</p>
			{error && (
				<p role="alert" className="text-destructive">
					{error}
				</p>
			)}
			{track ? (
				<>
					{/* Native shares expose audio only; backend supplies no caption resource. */}
					{/* biome-ignore lint/a11y/useMediaCaption: Audio-only share has no server caption resource. */}
					<audio
						ref={audio}
						controls
						controlsList={share.isDownloadable ? undefined : 'nodownload'}
						className="w-full"
						src={safeTrackUrl(track.contentUrl, slug)}
						onLoadedMetadata={() => {
							if (audio.current) {
								audio.current.currentTime = Math.max(
									0,
									desired.current - track.startOffset,
								)
								audio.current.playbackRate = rate
								if (resume.current) {
									resume.current = false
									void audio.current
										.play()
										.catch(() => setError('Playback could not start'))
								}
							}
						}}
						onTimeUpdate={() => {
							if (!audio.current) return
							const value = track.startOffset + audio.current.currentTime
							setCurrent(value)
							if (
								!audio.current.paused &&
								Date.now() - lastSync.current >= 30000
							) {
								lastSync.current = Date.now()
								void sync(value)
							}
						}}
						onPause={() => {
							if ('mediaSession' in navigator)
								navigator.mediaSession.playbackState = 'paused'
							if (audio.current)
								void sync(track.startOffset + audio.current.currentTime)
						}}
						onEnded={() => {
							if (session && trackIndex + 1 < session.audioTracks.length) {
								desired.current =
									session.audioTracks[trackIndex + 1].startOffset
								resume.current = true
								setTrackIndex(trackIndex + 1)
							} else if (session) void sync(session.duration)
						}}
						onPlay={() => {
							if ('mediaSession' in navigator)
								navigator.mediaSession.playbackState = 'playing'
						}}
						onError={() => setError('Failed to play audio on device')}
					/>
					<label className="block">
						Position ({Math.floor(current)} /{' '}
						{Math.floor(session?.duration ?? 0)} seconds)
						<input
							className="w-full"
							aria-label="Position"
							type="range"
							min="0"
							max={session?.duration ?? 0}
							step="1"
							value={current}
							onChange={(e) => seek(Number(e.target.value))}
						/>
					</label>
					<div className="flex flex-wrap gap-3">
						<Button variant="outline" onClick={() => seek(current - 10)}>
							Back 10 seconds
						</Button>
						<Button variant="outline" onClick={() => seek(current + 10)}>
							Forward 10 seconds
						</Button>
						<label>
							Speed
							<select
								className="ml-2 border bg-background p-2"
								value={rate}
								onChange={(e) => {
									const value = Number(e.target.value)
									setRate(value)
									if (audio.current) audio.current.playbackRate = value
								}}
							>
								{[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3].map((value) => (
									<option key={value} value={value}>
										{value}×
									</option>
								))}
							</select>
						</label>
					</div>
					{session?.chapters?.length ? (
						<label className="block">
							Chapter
							<select
								ref={chaptersSelect}
								className="ml-2 max-w-full border bg-background p-2"
								value={session.chapters.findIndex(
									(chapter) =>
										chapter.start <= current && current < chapter.end,
								)}
								onChange={(e) => {
									const chapter = session.chapters?.[Number(e.target.value)]
									if (chapter) seek(chapter.start)
								}}
							>
								{session.chapters.map((chapter, index) => (
									<option
										key={`${chapter.start}-${chapter.end}-${chapter.title}`}
										value={index}
									>
										{chapter.title}
									</option>
								))}
							</select>
						</label>
					) : null}
				</>
			) : (
				<p>No audio tracks available.</p>
			)}
			{share.isDownloadable && (
				<a
					className="inline-block rounded-md border px-4 py-2"
					href={publicShareUrl(slug, '/download')}
					download
				>
					Download
				</a>
			)}
		</main>
	)
}
