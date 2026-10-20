import { Link } from '@tanstack/react-router'
import Hls from 'hls.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { create } from 'zustand'
import {
	api,
	authHeaders,
	getAuthGeneration,
	setBeforeLogout,
	useAuth,
} from './api'
import { duration } from './catalog'
import { CastControl } from './features/player/CastControl'
import {
	castSnapshot,
	loadCast,
	seekCast,
	setCastPlaying,
	setCastRate,
	setCastVolume,
	stopCast,
	useCast,
} from './features/player/cast'
import {
	readPlayerSettings,
	savePlayerSetting,
} from './features/player/settings'
import { candidateAt } from './features/player/skipping'
import { originalTime, trackAt } from './features/player/timeline'
import { Button } from './shared/components/ui/button'

const segment = z
	.object({ start: z.number().nonnegative(), end: z.number().positive() })
	.refine((s) => s.end > s.start)
const analysis = z
	.object({
		status: z.string(),
		sourceSha256: z.string().nullish(),
		segments: z.array(segment).optional(),
	})
	.passthrough()
export const sessionSchema = z
	.object({
		id: z.string().min(1),
		episodeId: z.string().nullable(),
		currentTime: z.number().nonnegative(),
		duration: z.number().positive(),
		libraryItemId: z.string().optional(),
		displayTitle: z.string().nullish(),
		displayAuthor: z.string().nullish(),
		coverPath: z.string().nullish(),
		chapters: z
			.array(
				z.object({
					id: z.union([z.string(), z.number()]),
					start: z.number().nonnegative(),
					end: z.number().nonnegative(),
					title: z.string(),
				}),
			)
			.optional(),
		audioTracks: z
			.array(
				z.object({
					contentUrl: z.string().min(1),
					index: z.number().int().nonnegative().optional(),
					title: z.string().optional(),
					mimeType: z.string().optional(),
					duration: z.number().positive().optional(),
					startOffset: z.number().nonnegative().optional(),
				}),
			)
			.min(1),
		libraryItem: z
			.object({
				media: z.object({
					episodes: z
						.array(z.object({ id: z.string(), adAnalysis: analysis.nullish() }))
						.optional(),
				}),
			})
			.nullable(),
	})
	.passthrough()
type Session = z.infer<typeof sessionSchema>
export function sessionSegments(session: Session) {
	const result = session.libraryItem?.media.episodes?.find(
		(e) => e.id === session.episodeId,
	)?.adAnalysis
	return result?.status === 'candidates'
		? (result.segments ?? []).filter((s) => s.end <= session.duration)
		: []
}
export const usePlayer = create<{
	session: Session | null
	error: string
	set: (session: Session | null, error?: string) => void
}>((set) => ({
	session: null,
	error: '',
	set: (session, error = '') => set({ session, error }),
}))
export function authorizeHlsRequest(xhr: XMLHttpRequest, source: string) {
	const url = new URL(source, window.location.origin)
	if (
		url.origin !== window.location.origin ||
		!['http:', 'https:'].includes(url.protocol)
	) {
		xhr.abort()
		throw new Error('Unsafe audio stream URL. Use Classic.')
	}
	for (const [key, value] of Object.entries(authHeaders()))
		xhr.setRequestHeader(key, value)
}
let closeCurrent: (() => Promise<void>) | undefined
let seekCurrent: ((time: number) => void) | undefined
let snapshotCurrent:
	| (() => { currentTime: number; paused: boolean; rate: number })
	| undefined
export async function handoffPlayback(target: 'local' | 'cast') {
	const session = usePlayer.getState().session
	const snapshot = snapshotCurrent?.()
	if (!session?.libraryItemId || !snapshot)
		throw new Error('Start playback before transferring audio')
	return playEpisode(
		session.libraryItemId,
		session.episodeId || undefined,
		false,
		snapshot.currentTime,
		{ target, autoplay: !snapshot.paused, rate: snapshot.rate },
	)
}
export function seekPlayback(time: number) {
	if (Number.isFinite(time)) seekCurrent?.(time)
}
export type QueueEntry = {
	itemId: string
	episodeId?: string
	title: string
	queueId?: string
}
export const useQueue = create<{
	entries: QueueEntry[]
	add: (entry: QueueEntry) => void
	remove: (index: number) => void
	move: (index: number, direction: number) => void
}>((set) => ({
	entries: [],
	add: (entry) =>
		set((state) => ({
			entries: [...state.entries, { ...entry, queueId: crypto.randomUUID() }],
		})),
	remove: (index) =>
		set((state) => ({ entries: state.entries.filter((_, i) => i !== index) })),
	move: (index, direction) =>
		set((state) => {
			const entries = [...state.entries]
			const target = index + direction
			if (target >= 0 && target < entries.length)
				[entries[index], entries[target]] = [entries[target], entries[index]]
			return { entries }
		}),
}))
useAuth.subscribe((state, previous) => {
	if (state.user?.id !== previous.user?.id) {
		playbackTarget = undefined
		stopCast()
		useQueue.setState({ entries: [] })
		usePlayer.getState().set(null)
	}
})

export function enqueueEpisode(
	itemId: string,
	episodeId: string | undefined,
	title: string,
) {
	useQueue.getState().add({ itemId, episodeId, title })
}
export function enqueue(
	items: { libraryItemId: string; episodeId?: string; title?: string }[],
) {
	for (const item of items)
		enqueueEpisode(
			item.libraryItemId,
			item.episodeId,
			item.title || 'Queued item',
		)
}
export async function playQueue(
	items: { libraryItemId: string; episodeId?: string; title?: string }[],
) {
	if (!items.length) return
	const [first, ...rest] = items
	useQueue.setState({ entries: [] })
	enqueue(rest)
	return playEpisode(first.libraryItemId, first.episodeId)
}
export async function playNext() {
	const next = useQueue.getState().entries[0]
	if (next) {
		await playEpisode(next.itemId, next.episodeId)
		useQueue.setState((state) => ({
			entries: state.entries.filter((entry) => entry.queueId !== next.queueId),
		}))
	}
}
let starting = false
let playbackTarget: 'local' | 'cast' | undefined
export async function playEpisode(
	itemId: string,
	episodeId?: string,
	forceTranscode = false,
	startTime?: number,
	transfer?: { target: 'local' | 'cast'; autoplay: boolean; rate: number },
) {
	if (starting) throw new Error('Playback is already starting')
	starting = true
	const generation = getAuthGeneration()
	const remote =
		(transfer?.target ?? playbackTarget) === 'cast' ||
		(!transfer && !playbackTarget && useCast.getState().connected)
	if (remote && forceTranscode) {
		starting = false
		throw new Error(
			'Cast supports direct audio only. Return to local playback for transcoding.',
		)
	}
	let deviceId = localStorage.getItem('absDeviceId')
	if (!deviceId) {
		deviceId = crypto.randomUUID()
		localStorage.setItem('absDeviceId', deviceId)
	}
	try {
		await closeCurrent?.()
		if (generation !== getAuthGeneration())
			throw new Error('Session changed. Retry signing in.')
		usePlayer.getState().set(null)
		const session = await api(
			`/api/items/${encodeURIComponent(itemId)}/play${episodeId ? `/${encodeURIComponent(episodeId)}` : ''}`,
			sessionSchema,
			{
				method: 'POST',
				body: JSON.stringify({
					mediaPlayer: remote ? 'chromecast' : 'html5',
					deviceInfo: { clientName: 'Abs Web Modern Preview', deviceId },
					forceDirectPlay: remote,
					forceTranscode,
					supportedMimeTypes: [
						'audio/mpeg',
						'audio/mp4',
						'audio/aac',
						'audio/ogg',
						'audio/wav',
					],
				}),
			},
		)
		if (
			session.audioTracks.length > 1 &&
			session.audioTracks.some((track) => !track.duration)
		) {
			await api(
				`/api/session/${encodeURIComponent(session.id)}/close`,
				z.unknown(),
				{
					method: 'POST',
					body: JSON.stringify({
						currentTime: session.currentTime,
						timeListened: 0,
					}),
				},
			)
			throw new Error(
				'Server returned multi-track audio without track durations',
			)
		}
		if (startTime !== undefined) {
			if (!Number.isFinite(startTime))
				throw new Error('Invalid playback start time')
			session.currentTime = Math.min(session.duration, Math.max(0, startTime))
		}
		if (generation !== getAuthGeneration())
			throw new Error('Session changed. Retry signing in.')
		Object.assign(session, {
			modernCast: remote,
			modernAutoplay: transfer?.autoplay ?? true,
			modernRate: transfer?.rate ?? readPlayerSettings().playbackRate ?? 1,
		})
		if (remote) {
			try {
				await loadCast(session, {
					currentTime: session.currentTime,
					autoplay: transfer?.autoplay ?? true,
					playbackRate:
						transfer?.rate ?? readPlayerSettings().playbackRate ?? 1,
				})
			} catch (error) {
				stopCast()
				if (generation === getAuthGeneration()) {
					usePlayer.getState().set(session)
					usePlayer.setState({
						error: error instanceof Error ? error.message : 'Cast load failed',
					})
				}
				throw error
			}
			if (generation !== getAuthGeneration()) {
				stopCast()
				throw new Error('Session changed. Retry signing in.')
			}
			session.modernCastLoaded = true
		}
		playbackTarget = remote ? 'cast' : 'local'
		usePlayer.getState().set(session)
		return session
	} finally {
		starting = false
	}
}
export function Player() {
	const { session, error } = usePlayer()
	const casting = useCast()
	const remote = session?.modernCast === true
	const playing = useCallback(
		(value: boolean) => {
			if (remote) setCastPlaying(value)
			else if (value)
				void audio.current
					?.play()
					.catch((error) => usePlayer.setState({ error: String(error) }))
			else audio.current?.pause()
		},
		[remote],
	)
	const [position, setPosition] = useState(0)
	const [settings, setSettings] = useState(readPlayerSettings)
	function updateSetting(
		key: 'playbackRate' | 'jumpForwardAmount' | 'jumpBackwardAmount',
		value: number,
	) {
		try {
			setSettings(savePlayerSetting(key, value))
			if (key === 'playbackRate') {
				if (remote)
					void setCastRate(value).catch((error) =>
						usePlayer.setState({ error: String(error) }),
					)
				else if (audio.current) audio.current.playbackRate = value
			}
		} catch (error) {
			usePlayer.setState({
				error:
					error instanceof Error
						? error.message
						: 'Could not save playback setting',
			})
		}
	}
	const audio = useRef<HTMLAudioElement>(null)
	const trackIndex = useRef(0)
	const queue = useQueue()
	const [sleepAt, setSleepAt] = useState<number | null>(null)
	const [sleepChapter, setSleepChapter] = useState<number | null>(null)
	useEffect(() => {
		const key = (event: KeyboardEvent) => {
			const target = event.target
			if (
				event.altKey ||
				event.ctrlKey ||
				event.metaKey ||
				(target instanceof HTMLElement &&
					(target.isContentEditable ||
						target.closest('input,textarea,select,button,a')))
			)
				return
			if (event.code === 'Space') {
				event.preventDefault()
				playing(
					remote ? castSnapshot()?.paused !== false : !!audio.current?.paused,
				)
			} else if (event.code === 'ArrowLeft') {
				event.preventDefault()
				seekPlayback(position - 10)
			} else if (event.code === 'ArrowRight') {
				event.preventDefault()
				seekPlayback(position + 30)
			}
		}
		if (session) window.addEventListener('keydown', key)
		return () => window.removeEventListener('keydown', key)
	}, [session, position, remote, playing])
	const [bookmarks, setBookmarks] = useState<{ time: number; title: string }[]>(
		[],
	)
	const [bookmarkTitle, setBookmarkTitle] = useState('')
	useEffect(() => {
		if (!sleepAt) return
		const timer = window.setTimeout(
			() => {
				playing(false)
				setSleepAt(null)
			},
			Math.max(0, sleepAt - Date.now()),
		)
		return () => clearTimeout(timer)
	}, [sleepAt, playing])
	useEffect(() => {
		if (remote && sleepChapter !== null && position >= sleepChapter) {
			playing(false)
			setSleepChapter(null)
		}
	}, [remote, position, sleepChapter, playing])
	useEffect(() => {
		if (!session?.libraryItemId || session.episodeId) {
			setBookmarks([])
			return
		}
		void api(
			`/api/me/bookmarks/${encodeURIComponent(session.libraryItemId)}`,
			z.object({
				bookmarks: z.array(
					z.object({ time: z.number().nonnegative(), title: z.string() }),
				),
			}),
		)
			.then((result) => setBookmarks(result.bookmarks))
			.catch((error) =>
				usePlayer.setState({
					error:
						error instanceof Error ? error.message : 'Bookmarks unavailable',
				}),
			)
	}, [session?.libraryItemId, session?.episodeId])
	useEffect(() => {
		if (!session || !('mediaSession' in navigator)) return
		navigator.mediaSession.metadata = new MediaMetadata({
			title: session.displayTitle || 'Audiobookshelf',
		})
		const handlers: Partial<
			Record<MediaSessionAction, MediaSessionActionHandler>
		> = {
			play: () => playing(true),
			pause: () => playing(false),
			seekbackward: (details) =>
				seekPlayback(position - (details.seekOffset ?? 10)),
			seekforward: (details) =>
				seekPlayback(position + (details.seekOffset ?? 10)),
			seekto: (details) => {
				if (details.seekTime !== undefined) seekPlayback(details.seekTime)
			},
			nexttrack: () => {
				void playNext().catch((error) =>
					usePlayer.setState({ error: String(error) }),
				)
			},
		}
		for (const [action, handler] of Object.entries(handlers)) {
			try {
				navigator.mediaSession.setActionHandler(
					action as MediaSessionAction,
					handler,
				)
			} catch {
				/* Browser may not implement every MediaSession action. */
			}
		}
		return () => {
			for (const action of Object.keys(handlers)) {
				try {
					navigator.mediaSession.setActionHandler(
						action as MediaSessionAction,
						null,
					)
				} catch {
					/* Unsupported platform action. */
				}
			}
		}
	}, [session, position, playing])
	const [streamMessage, setStreamMessage] = useState('')
	useEffect(() => {
		const receive = (event: Event) => {
			if (!(event instanceof CustomEvent)) return
			const detail = z
				.object({ event: z.string(), payload: z.unknown() })
				.safeParse(event.detail)
			if (!detail.success || !detail.data.event.startsWith('stream_')) return
			const data = z
				.object({
					stream: z.string().optional(),
					id: z.string().optional(),
					streamId: z.string().optional(),
					percent: z
						.union([
							z.number(),
							z
								.string()
								.regex(/^\d+(?:\.\d+)?%$/)
								.transform((value) => Number(value.slice(0, -1))),
						])
						.pipe(z.number().min(0).max(100))
						.optional(),
					startTime: z.number().nonnegative().optional(),
					error: z.string().optional(),
				})
				.safeParse(detail.data.payload)
			if (!data.success && typeof detail.data.payload !== 'string') return
			const streamId =
				typeof detail.data.payload === 'string'
					? detail.data.payload
					: data.success
						? data.data.stream || data.data.streamId || data.data.id
						: undefined
			if (!session || (streamId && streamId !== session.id)) return
			if (
				detail.data.event === 'stream_reset' &&
				data.success &&
				data.data.startTime !== undefined
			) {
				seekPlayback(data.data.startTime)
				setStreamMessage('Stream restarted')
			} else if (detail.data.event === 'stream_closed') {
				audio.current?.pause()
				usePlayer.setState({
					error: 'Server closed audio stream. Retry playback.',
				})
			} else if (detail.data.event === 'stream_ready')
				setStreamMessage('Stream ready')
			else if (detail.data.event === 'stream_error')
				usePlayer.setState({
					error:
						data.success && data.data.error
							? data.data.error
							: 'Audio stream failed',
				})
			else if (detail.data.event === 'stream_progress')
				setStreamMessage(
					data.success && data.data.percent !== undefined
						? `Transcoding ${Math.round(data.data.percent)}%`
						: 'Transcoding audio…',
				)
		}
		window.addEventListener('abs:socket', receive)
		return () => window.removeEventListener('abs:socket', receive)
	}, [session])
	const [optIn, setOptIn] = useState(true)
	const optInRef = useRef(optIn)
	optInRef.current = optIn
	const skipped = useRef(new Set<number>())
	const skippedIdentity = useRef('')
	const segments = session ? sessionSegments(session) : []
	useEffect(() => {
		const identity = session
			? JSON.stringify([
					getAuthGeneration(),
					useAuth.getState().user?.id,
					session.libraryItemId,
					session.episodeId,
				])
			: ''
		if (session && identity !== skippedIdentity.current) {
			skipped.current.clear()
			skippedIdentity.current = identity
		}
		if (!session || !audio.current) return
		const element = audio.current
		const remote = session.modernCast === true
		const generation = getAuthGeneration()
		let active = true
		let disconnected = false
		let remotePosition = session.currentTime
		const rate =
			typeof session.modernRate === 'number'
				? session.modernRate
				: readPlayerSettings().playbackRate || 1
		const initial = trackAt(
			session.audioTracks,
			session.currentTime,
			session.duration,
		)
		trackIndex.current = initial.index
		let pendingSeek = initial.localTime
		let playWhenReady = session.modernAutoplay !== false
		const raw = session.audioTracks[initial.index].contentUrl
		const prefix = window.__ABS_WEB_CONFIG__?.apiBasePath ?? ''
		const source =
			raw.startsWith('/') && prefix && !raw.startsWith(`${prefix}/`)
				? `${prefix}${raw}`
				: raw
		let url: URL
		try {
			url = new URL(source, window.location.origin)
			if (
				url.origin !== window.location.origin ||
				!['http:', 'https:'].includes(url.protocol)
			)
				throw new Error('Server returned unsafe audio URL. Use Classic.')
		} catch (cause) {
			usePlayer.setState({
				session: null,
				error: cause instanceof Error ? cause.message : 'Invalid audio URL',
			})
			void api(
				`/api/session/${encodeURIComponent(session.id)}/close`,
				z.unknown(),
				{
					method: 'POST',
					body: JSON.stringify({
						currentTime: session.currentTime,
						timeListened: 0,
					}),
				},
			).catch(() =>
				usePlayer.setState({
					error:
						'Invalid audio URL; session close failed. Reload before retrying.',
				}),
			)
			return
		}
		let listened = 0
		let initialized = false
		let lastTick = performance.now()
		let closed = false
		let finishing = false
		let chain = Promise.resolve()
		const report = (caught: unknown) => {
			if (active && generation === getAuthGeneration())
				usePlayer.setState({
					error: caught instanceof Error ? caught.message : 'Playback failed',
				})
		}
		const payload = () => ({
			currentTime: remote
				? remotePosition
				: initialized && Number.isFinite(element.currentTime)
					? originalTime(
							session.audioTracks,
							trackIndex.current,
							element.currentTime,
						)
					: originalTime(session.audioTracks, trackIndex.current, pendingSeek),
			timeListened: listened,
		})
		const sync = (close = false) => {
			if (closed) return chain
			chain = chain
				.catch(() => {})
				.then(async () => {
					if (closed) return
					const data = payload()
					await api(
						`/api/session/${encodeURIComponent(session.id)}/${close ? 'close' : 'sync'}`,
						z.unknown(),
						{ method: 'POST', body: JSON.stringify(data), keepalive: close },
					)
					listened = Math.max(0, listened - data.timeListened)
					if (close) closed = true
				})
			chain.catch(report)
			return chain
		}
		closeCurrent = async () => {
			if (remote) {
				const snapshot = castSnapshot()
				if (snapshot) remotePosition = snapshot.currentTime
				setCastPlaying(false)
			} else element.pause()
			await sync(true)
			if (remote) stopCast()
		}
		snapshotCurrent = () =>
			remote
				? {
						currentTime: castSnapshot()?.currentTime ?? remotePosition,
						paused: castSnapshot()?.paused ?? true,
						rate: readPlayerSettings().playbackRate || rate,
					}
				: {
						currentTime: payload().currentTime,
						paused: element.paused,
						rate: element.playbackRate,
					}
		setBeforeLogout(async () => {
			await closeCurrent?.()
			usePlayer.getState().set(null)
		})
		const ready = () => {
			if (remote || !active || initialized) return
			element.currentTime = pendingSeek
			element.playbackRate = rate
			initialized = true
			setPosition(
				originalTime(
					session.audioTracks,
					trackIndex.current,
					element.currentTime,
				),
			)
			if (playWhenReady) void element.play().catch(report)
		}
		const pause = () => {
			if (!remote && active) void sync()
		}
		const ended = () => {
			if (!active || finishing || closed || (remote && !initialized)) return
			if (remote) finishing = true
			if (!remote && trackIndex.current < session.audioTracks.length - 1) {
				seekCurrent?.(
					originalTime(session.audioTracks, trackIndex.current + 1, 0),
				)
				return
			}
			void sync(true)
				.then(() => {
					if (!active || generation !== getAuthGeneration()) return
					if (usePlayer.getState().session?.id === session.id)
						usePlayer.getState().set(null)
					void playNext().catch(report)
				})
				.catch(report)
		}
		const pagehide = () => {
			void sync(true)
		}
		element.addEventListener('loadedmetadata', ready)
		element.addEventListener('pause', pause)
		element.addEventListener('ended', ended)
		window.addEventListener('pagehide', pagehide)
		setOptIn(true)
		let engine: Hls | undefined
		const loadSource = (nextUrl: URL) => {
			engine?.destroy()
			engine = undefined
			if (
				/\.m3u8(?:$|\?)/i.test(nextUrl.href) &&
				!element.canPlayType('application/vnd.apple.mpegurl') &&
				Hls.isSupported()
			) {
				engine = new Hls({
					xhrSetup: (xhr, requestUrl) => {
						try {
							authorizeHlsRequest(xhr, requestUrl)
						} catch (error) {
							report(error)
							throw error
						}
					},
				})
				engine.loadSource(nextUrl.href)
				engine.attachMedia(element)
				engine.on(Hls.Events.ERROR, (_event, data) => {
					if (data.fatal)
						report(new Error(`Audio stream error: ${data.details}`))
				})
			} else {
				const token = localStorage.getItem('token')
				if (token) nextUrl.searchParams.set('token', token)
				element.src = nextUrl.href
			}
		}
		seekCurrent = (time) => {
			if (remote) {
				void seekCast(time).catch(report)
				return
			}
			const target = trackAt(session.audioTracks, time, session.duration)
			pendingSeek = target.localTime
			if (target.index === trackIndex.current && initialized) {
				element.currentTime = target.localTime
				setPosition(time)
				return
			}
			const raw = session.audioTracks[target.index].contentUrl
			try {
				const nextUrl = new URL(
					raw.startsWith('/') && prefix && !raw.startsWith(`${prefix}/`)
						? `${prefix}${raw}`
						: raw,
					window.location.origin,
				)
				if (
					nextUrl.origin !== window.location.origin ||
					!['http:', 'https:'].includes(nextUrl.protocol)
				)
					throw new Error('Unsafe audio URL')
				playWhenReady = !element.paused || element.ended
				pendingSeek = target.localTime
				trackIndex.current = target.index
				initialized = false
				loadSource(nextUrl)
			} catch (error) {
				report(error)
			}
		}
		if (remote) {
			element.pause()
			initialized = session.modernCastLoaded === true
			setPosition(session.currentTime)
		} else loadSource(url)
		const timer = window.setInterval(() => {
			const now = performance.now()
			if (remote) {
				const snapshot = castSnapshot()
				if (
					snapshot &&
					initialized &&
					active &&
					generation === getAuthGeneration()
				) {
					disconnected = false
					remotePosition = snapshot.currentTime
					setPosition(remotePosition)
					if (!snapshot.paused) {
						listened += Math.min((now - lastTick) / 1000, 2)
						const index = candidateAt(
							sessionSegments(session),
							remotePosition,
							skipped.current,
						)
						if (optInRef.current && index >= 0) {
							skipped.current.add(index)
							void seekCast(
								Math.min(sessionSegments(session)[index].end, session.duration),
							).catch(report)
						}
					}
					if (snapshot.ended) ended()
				} else if (initialized && !disconnected) {
					disconnected = true
					report(
						new Error('Cast disconnected. Choose Return to local to resume.'),
					)
				}
			} else if (!element.paused && !element.seeking && element.readyState >= 2)
				listened += Math.min((now - lastTick) / 1000, 2)
			lastTick = now
		}, 1000)
		const syncTimer = window.setInterval(() => {
			if (listened > 0) void sync()
		}, 10000)
		return () => {
			active = false
			clearInterval(timer)
			clearInterval(syncTimer)
			element.removeEventListener('loadedmetadata', ready)
			element.removeEventListener('pause', pause)
			element.removeEventListener('ended', ended)
			window.removeEventListener('pagehide', pagehide)
			element.pause()
			void sync(true)
			if (remote && !closed) stopCast()
			engine?.destroy()
			closeCurrent = undefined
			seekCurrent = undefined
			snapshotCurrent = undefined
			setBeforeLogout(undefined)
		}
	}, [session])
	function update() {
		const element = audio.current
		if (!element || !session || session.modernCast === true) return
		const current = originalTime(
			session.audioTracks,
			trackIndex.current,
			element.currentTime,
		)
		if (sleepChapter !== null && current >= sleepChapter) {
			element.pause()
			setSleepChapter(null)
		}
		if (optIn && !element.paused) {
			const index = candidateAt(segments, current, skipped.current)
			if (index >= 0) {
				skipped.current.add(index)
				seekPlayback(Math.min(segments[index].end, session.duration))
			}
		}
		setPosition(current)
	}
	if (!session && !error)
		return <CastControl remote={false} onTransfer={handoffPlayback} />
	return (
		<section
			aria-label="Audio player"
			className="fixed inset-x-0 bottom-0 z-20 border-t bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg"
		>
			<div className="mx-auto max-h-[60vh] max-w-6xl space-y-2 overflow-y-auto">
				{streamMessage && <p role="status">{streamMessage}</p>}
				{error && (
					<p role="alert" className="text-destructive">
						{error}
						{session?.libraryItemId && !remote && (
							<Button
								variant="outline"
								onClick={() =>
									void playEpisode(
										session.libraryItemId || '',
										session.episodeId || undefined,
										true,
									).catch((error) =>
										usePlayer.setState({ error: String(error) }),
									)
								}
							>
								Retry with transcoding
							</Button>
						)}
					</p>
				)}
				{session && (
					<>
						<div className="flex items-center gap-3">
							{session.libraryItemId && session.coverPath && (
								<img
									alt=""
									className="size-12 rounded object-cover"
									src={`${window.__ABS_WEB_CONFIG__?.apiBasePath || ''}/api/items/${encodeURIComponent(session.libraryItemId)}/cover`}
								/>
							)}
							<div>
								<p className="font-medium">
									{session.libraryItemId ? (
										<Link
											className="underline"
											to="/item/$id"
											params={{ id: session.libraryItemId }}
										>
											{session.displayTitle || 'Now playing'}
										</Link>
									) : (
										session.displayTitle || 'Now playing'
									)}
								</p>
								{session.displayAuthor && (
									<p className="text-sm text-muted-foreground">
										{session.displayAuthor}
									</p>
								)}
							</div>
						</div>
						<CastControl remote={remote} onTransfer={handoffPlayback} />
						<div className="flex flex-wrap items-center gap-4">
							{remote && (
								<>
									<Button
										variant="outline"
										disabled={!casting.connected}
										onClick={() => playing(true)}
									>
										Play on Cast
									</Button>
									<Button
										variant="outline"
										disabled={!casting.connected}
										onClick={() => playing(false)}
									>
										Pause Cast
									</Button>
								</>
							)}
							<audio
								ref={audio}
								className={
									remote ? 'hidden' : 'w-[300px] min-w-0 max-w-full shrink-0'
								}
								controls
								onTimeUpdate={update}
								onSeeked={update}
								onError={() =>
									usePlayer.setState({
										error:
											'Audio could not load. Retry playback or retry with transcoding.',
									})
								}
								aria-label="Audio playback"
							>
								<track kind="captions" />
							</audio>
							{!remote && 'setSinkId' in HTMLMediaElement.prototype && (
								<Button
									variant="outline"
									onClick={() => {
										const devices = navigator.mediaDevices as MediaDevices & {
											selectAudioOutput?: () => Promise<MediaDeviceInfo>
										}
										if (!devices?.selectAudioOutput) {
											usePlayer.setState({
												error:
													'This browser does not support audio-output selection. Use OS output settings.',
											})
											return
										}
										void devices
											.selectAudioOutput()
											.then((device) =>
												audio.current?.setSinkId(device.deviceId),
											)
											.catch((error) =>
												usePlayer.setState({
													error:
														error instanceof Error
															? error.message
															: 'Audio output selection failed',
												}),
											)
									}}
								>
									Audio output
								</Button>
							)}
							<label>
								Playback speed{' '}
								<select
									aria-label="Playback speed"
									className="rounded-md border bg-background p-2"
									value={settings.playbackRate || 1}
									onChange={(event) =>
										updateSetting('playbackRate', Number(event.target.value))
									}
								>
									{[0.75, 1, 1.25, 1.5, 2].map((rate) => (
										<option key={rate} value={rate}>
											{rate}×
										</option>
									))}
								</select>
							</label>
							<Button
								variant="outline"
								onClick={() =>
									void closeCurrent?.().then(() =>
										usePlayer.getState().set(null),
									)
								}
							>
								Close player
							</Button>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<Button
								variant="outline"
								disabled={!session.chapters?.length}
								onClick={() =>
									seekPlayback(
										[...(session.chapters || [])]
											.reverse()
											.find((chapter) => chapter.start < position - 3)?.start ||
											0,
									)
								}
							>
								Previous chapter
							</Button>
							<Button
								variant="outline"
								disabled={
									!session.chapters?.some((chapter) => chapter.start > position)
								}
								onClick={() =>
									seekPlayback(
										session.chapters?.find(
											(chapter) => chapter.start > position,
										)?.start || session.duration,
									)
								}
							>
								Next chapter
							</Button>
							<Button
								variant="outline"
								onClick={() =>
									seekPlayback(position - (settings.jumpBackwardAmount || 10))
								}
							>
								Back {settings.jumpBackwardAmount || 10} s
							</Button>
							<Button
								variant="outline"
								onClick={() =>
									seekPlayback(position + (settings.jumpForwardAmount || 10))
								}
							>
								Forward {settings.jumpForwardAmount || 10} s
							</Button>
							<Button
								variant="outline"
								disabled={!queue.entries.length}
								onClick={() =>
									void playNext().catch((error) =>
										usePlayer.setState({ error: String(error) }),
									)
								}
							>
								Next queued
							</Button>
							<label>
								Volume{' '}
								<input
									aria-label="Volume"
									type="range"
									min="0"
									max="1"
									step="0.01"
									defaultValue="1"
									onChange={(event) => {
										if (remote) setCastVolume(Number(event.target.value))
										else if (audio.current)
											audio.current.volume = Number(event.target.value)
									}}
								/>
							</label>
							<label>
								Sleep{' '}
								<select
									aria-label="Sleep timer"
									className="rounded-md border bg-background p-2"
									value={
										sleepChapter !== null
											? 'chapter'
											: sleepAt
												? 'active'
												: 'off'
									}
									onChange={(event) => {
										if (event.target.value === 'chapter') {
											setSleepAt(null)
											setSleepChapter(
												session.chapters?.find(
													(chapter) =>
														chapter.start <= position && chapter.end > position,
												)?.end ?? session.duration,
											)
											return
										}
										setSleepChapter(null)
										const minutes = Number(event.target.value)
										setSleepAt(
											minutes > 0 ? Date.now() + minutes * 60000 : null,
										)
									}}
								>
									<option value="off">Off</option>
									<option value="chapter">End of current chapter</option>
									{sleepAt && (
										<option value="active">
											Active until{' '}
											{new Date(sleepAt).getHours().toString().padStart(2, '0')}
											:
											{new Date(sleepAt)
												.getMinutes()
												.toString()
												.padStart(2, '0')}
										</option>
									)}
									{[5, 10, 15, 30, 60].map((minutes) => (
										<option key={minutes} value={minutes}>
											{minutes} minutes
										</option>
									))}
								</select>
							</label>
						</div>
						<label className="flex items-center gap-3">
							Original timeline{' '}
							<span className="relative flex min-w-0 flex-1 items-center">
								<span
									aria-hidden="true"
									className="pointer-events-none absolute inset-x-0 flex h-2"
								>
									{segments.map((s) => (
										<span
											key={`${s.start}-${s.end}`}
											className="absolute h-2 bg-yellow-400"
											style={{
												left: `${(s.start / session.duration) * 100}%`,
												width: `${((s.end - s.start) / session.duration) * 100}%`,
											}}
										/>
									))}
								</span>
								<input
									className="relative w-full accent-primary opacity-75"
									aria-label="Seek position"
									aria-valuetext={`${duration(position)} of ${duration(session.duration)}`}
									type="range"
									min="0"
									max={session.duration}
									step="0.1"
									value={position}
									onChange={(event) => {
										seekPlayback(Number(event.target.value))
										setPosition(Number(event.target.value))
									}}
								/>
							</span>
							<span className="text-xs tabular-nums">
								{duration(position)} / {duration(session.duration)}
							</span>
						</label>
						<details>
							<summary>Chapters, bookmarks, queue and settings</summary>
							<div className="flex flex-wrap gap-3 py-2">
								{(['jumpBackwardAmount', 'jumpForwardAmount'] as const).map(
									(key) => (
										<label key={key}>
											{key === 'jumpBackwardAmount'
												? 'Jump back (seconds)'
												: 'Jump forward (seconds)'}
											<input
												className="ml-2 w-20 rounded border bg-background p-1"
												type="number"
												min="1"
												max="600"
												value={settings[key] || 10}
												onChange={(event) =>
													updateSetting(key, Number(event.target.value))
												}
											/>
										</label>
									),
								)}
							</div>
							<div className="max-h-60 space-y-3 overflow-auto py-3">
								<ol>
									{session.chapters?.map((chapter) => (
										<li key={chapter.id}>
											<Button
												variant="link"
												onClick={() => seekPlayback(chapter.start)}
											>
												{duration(chapter.start)} {chapter.title}
											</Button>
										</li>
									))}
								</ol>
								{session.libraryItemId && !session.episodeId && (
									<>
										<form
											className="flex flex-wrap gap-2"
											onSubmit={(event) => {
												event.preventDefault()
												const id = session.libraryItemId
												if (!id || !bookmarkTitle.trim()) return
												void api(
													`/api/me/item/${encodeURIComponent(id)}/bookmark`,
													z
														.object({ time: z.number(), title: z.string() })
														.passthrough(),
													{
														method: 'POST',
														body: JSON.stringify({
															time: Math.floor(position),
															title: bookmarkTitle.trim(),
														}),
													},
												)
													.then((bookmark) => {
														setBookmarks((list) => [
															...list.filter(
																(entry) => entry.time !== bookmark.time,
															),
															bookmark,
														])
														setBookmarkTitle('')
													})
													.catch((error) =>
														usePlayer.setState({ error: String(error) }),
													)
											}}
										>
											<label htmlFor="player-bookmark-title">
												Bookmark title
											</label>
											<input
												id="player-bookmark-title"
												aria-label="Bookmark title"
												className="rounded-md border bg-background p-2"
												value={bookmarkTitle}
												onChange={(event) =>
													setBookmarkTitle(event.target.value)
												}
												required
												maxLength={500}
											/>
											<Button>Add bookmark</Button>
										</form>
										<ul>
											{bookmarks.map((bookmark) => (
												<li
													key={bookmark.time}
													className="flex items-center gap-2"
												>
													<Button
														variant="link"
														onClick={() => seekPlayback(bookmark.time)}
													>
														{duration(bookmark.time)} {bookmark.title}
													</Button>
													<Button
														variant="outline"
														onClick={() => {
															const title = window.prompt(
																'Bookmark title',
																bookmark.title,
															)
															if (!title?.trim()) return
															void api(
																`/api/me/item/${encodeURIComponent(session.libraryItemId || '')}/bookmark`,
																z.object({
																	time: z.number(),
																	title: z.string(),
																}),
																{
																	method: 'PATCH',
																	body: JSON.stringify({
																		time: bookmark.time,
																		title: title.trim(),
																	}),
																},
															)
																.then((updated) =>
																	setBookmarks((list) =>
																		list.map((entry) =>
																			entry.time === updated.time
																				? updated
																				: entry,
																		),
																	),
																)
																.catch((error) =>
																	usePlayer.setState({ error: String(error) }),
																)
														}}
													>
														Edit bookmark
													</Button>
													<Button
														variant="outline"
														onClick={() => {
															if (
																!window.confirm(
																	`Delete bookmark “${bookmark.title}”?`,
																)
															)
																return
															void api(
																`/api/me/item/${encodeURIComponent(session.libraryItemId || '')}/bookmark/${bookmark.time}`,
																z.unknown(),
																{ method: 'DELETE' },
															)
																.then(() =>
																	setBookmarks((list) =>
																		list.filter(
																			(entry) => entry.time !== bookmark.time,
																		),
																	),
																)
																.catch((error) =>
																	usePlayer.setState({ error: String(error) }),
																)
														}}
													>
														Delete bookmark
													</Button>
												</li>
											))}
										</ul>
									</>
								)}
								<Button
									variant="outline"
									disabled={!queue.entries.length}
									onClick={() => {
										if (window.confirm('Clear playback queue?'))
											useQueue.setState({ entries: [] })
									}}
								>
									Clear queue
								</Button>
								<ol>
									{queue.entries.map((entry, index) => (
										<li
											key={entry.queueId}
											className="flex flex-wrap items-center gap-2"
										>
											<span>{entry.title}</span>
											<Button
												variant="outline"
												disabled={index === 0}
												onClick={() => queue.move(index, -1)}
											>
												Move up
											</Button>
											<Button
												variant="outline"
												disabled={index === queue.entries.length - 1}
												onClick={() => queue.move(index, 1)}
											>
												Move down
											</Button>
											<Button
												variant="outline"
												onClick={() => queue.remove(index)}
											>
												Remove
											</Button>
										</li>
									))}
								</ol>
							</div>
						</details>
						<label className="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={optIn}
								disabled={!segments.length}
								onChange={(event) => setOptIn(event.target.checked)}
							/>
							Skip detected inserted audio
						</label>
						<p className="text-xs text-muted-foreground">
							{segments.length
								? `${segments.length} candidate segments. May include false positives; original audio unchanged. Each candidate skips once.`
								: 'No applicable candidate segments. Skipping unavailable.'}
						</p>
						{!!segments.length && (
							<p className="text-xs text-muted-foreground">
								Candidate markers:{' '}
								{segments
									.map((s) => `${duration(s.start)}–${duration(s.end)}`)
									.join(', ')}
							</p>
						)}
					</>
				)}
			</div>
		</section>
	)
}
