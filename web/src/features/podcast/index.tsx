import { Link } from '@tanstack/react-router'
import { Check, Circle, Ellipsis, Play } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import { api, getAuthGeneration, useAuth } from '../../api'
import { enqueueEpisode, playEpisode } from '../../player'
import { IsoDateTimeField } from '../../shared/components/IsoDateTimeField'
import { RichText } from '../../shared/components/RichText'
import { Button } from '../../shared/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '../../shared/components/ui/dropdown-menu'
import { useT } from '../i18n'
import { episodeProgress, refreshProgress } from '../item/progress'
import { updateProgress } from '../item/service'
import { AdAnalysisStatus } from './AdAnalysisStatus'
import { OpmlImport } from './opml'

const searchSchema = z.array(
	z
		.object({
			id: z.union([z.string(), z.number()]),
			title: z.string(),
			artistName: z.string().optional(),
			feedUrl: z.string().optional(),
			pageUrl: z.string().optional(),
			cover: z.string().optional(),
			genres: z.array(z.string()).optional(),
			trackCount: z.number().optional(),
			explicit: z.boolean().optional(),
			description: z.string().optional(),
			releaseDate: z.string().optional(),
			language: z.string().optional(),
			type: z.string().optional(),
			artistId: z.union([z.string(), z.number()]).optional(),
		})
		.passthrough(),
)
const feedSchema = z.object({
	podcast: z
		.object({
			episodes: z.array(z.unknown()).optional(),
			metadata: z
				.object({
					title: z.string().nullish(),
					author: z.string().nullish(),
					description: z.string().nullish(),
					descriptionPlain: z.string().nullish(),
					feedUrl: z.string().nullish(),
					image: z.string().nullish(),
					categories: z.array(z.string()).nullish(),
					language: z.string().nullish(),
					type: z.string().nullish(),
					explicit: z.union([z.string(), z.boolean()]).nullish(),
					imageUrl: z.string().nullish(),
					itunesPageUrl: z.string().nullish(),
					itunesId: z.union([z.string(), z.number()]).nullish(),
					itunesArtistId: z.union([z.string(), z.number()]).nullish(),
					episodes: z.array(z.unknown()).optional(),
				})
				.passthrough(),
		})
		.passthrough(),
})
const librarySchema = z
	.object({
		id: z.string(),
		mediaType: z.string(),
		folders: z.array(z.object({ id: z.string(), fullPath: z.string() })),
	})
	.passthrough()
const libraryResponseSchema = z.object({ library: librarySchema })
const createSchema = z.object({ id: z.string() }).passthrough()
const itemSchema = z
	.object({
		id: z.string(),
		media: z
			.object({
				autoDownloadEpisodes: z.boolean().optional(),
				autoDownloadSchedule: z.string().nullish(),
				lastEpisodeCheck: z.number().nullish(),
				maxEpisodesToKeep: z.number().nonnegative().optional(),
				maxNewEpisodesToDownload: z.number().nonnegative().optional(),
				metadata: z
					.object({
						episodes: z.array(z.unknown()).optional(),
						feedUrl: z.string().nullish(),
						title: z.string().nullish(),
					})
					.optional(),
			})
			.passthrough(),
	})
	.passthrough()
const mediaUpdatedSchema = z.object({ updated: z.boolean() })
const feedEpisodeSchema = z
	.object({
		title: z.string().optional(),
		episodeTitle: z.string().optional(),
		guid: z.string().optional(),
		cleanUrl: z.string().optional(),
		url: z.string().optional(),
		enclosure: z.object({ url: z.string() }),
		publishedAt: z.union([z.string(), z.number()]).optional(),
	})
	.passthrough()
const feedEpisodesSchema = z.object({ episodes: z.array(feedEpisodeSchema) })
const episodeSchema = z
	.object({
		id: z.string(),
		title: z.string().nullish(),
		subtitle: z.string().nullish(),
		description: z.string().nullish(),
		publishedAt: z.number().nullish(),
		duration: z.number().nullish(),
		libraryItemId: z.string(),
		podcast: z
			.object({
				metadata: z.object({
					title: z.string().nullish(),
					explicit: z.boolean().optional(),
				}),
			})
			.passthrough(),
	})
	.passthrough()
const latestSchema = z.object({
	episodes: z.array(episodeSchema),
	limit: z.union([z.string(), z.number()]).optional(),
	page: z.union([z.string(), z.number()]).optional(),
})
const downloadSchema = z
	.object({
		id: z.string(),
		episodeTitle: z.string().optional(),
		episodeDisplayTitle: z.string().optional(),
		podcastTitle: z.string().optional(),
		libraryId: z.string(),
		libraryItemId: z.string(),
	})
	.passthrough()
const queueSchema = z.object({
	queue: z.array(downloadSchema),
	currentDownload: downloadSchema.nullish(),
})
const emptySchema = z.object({})
const adminSchema = z.object({ type: z.enum(['root', 'admin']) }).passthrough()
export const canManagePodcasts = (user: unknown) =>
	adminSchema.safeParse(user).success
const isAdmin = canManagePodcasts
function formatDateTimeInput(timestamp: number) {
	const date = new Date(timestamp)
	const pad = (part: number) => String(part).padStart(2, '0')
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function makePodcastPayload(input: {
	libraryId: string
	folderId: string
	folderPath: string
	podcast: z.infer<typeof searchSchema>[number]
	feed: z.infer<typeof feedSchema>['podcast']
	title?: string
}) {
	const metadata = input.feed.metadata
	const title = (
		input.title ||
		input.podcast.title ||
		metadata.title ||
		''
	).trim()
	if (!title || (!input.podcast.feedUrl && !metadata.feedUrl))
		throw new Error('Podcast title and RSS feed URL required')
	const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_').trim()
	if (!input.folderPath || !input.folderId || !input.libraryId)
		throw new Error('Podcast library and destination folder required')
	return {
		path: `${input.folderPath.replace(/[\\/]+$/, '')}/${safeTitle}`,
		folderId: input.folderId,
		libraryId: input.libraryId,
		media: {
			metadata: {
				title,
				author: input.podcast.artistName || metadata.author || '',
				description: input.podcast.description || metadata.description || '',
				releaseDate: input.podcast.releaseDate || '',
				genres: input.podcast.genres || metadata.categories || [],
				feedUrl: input.podcast.feedUrl || metadata.feedUrl,
				imageUrl: input.podcast.cover || metadata.imageUrl || '',
				itunesPageUrl: input.podcast.pageUrl || metadata.itunesPageUrl || '',
				itunesId: String(input.podcast.id || metadata.itunesId || ''),
				itunesArtistId: String(
					input.podcast.artistId || metadata.itunesArtistId || '',
				),
				language: input.podcast.language || metadata.language || '',
				explicit:
					input.podcast.explicit ??
					(metadata.explicit === 'yes' || metadata.explicit === true),
				type: input.podcast.type || metadata.type || 'episodic',
			},
			autoDownloadEpisodes: false,
		},
	}
}
export async function createPodcast(
	payload: ReturnType<typeof makePodcastPayload>,
) {
	return api('/api/podcasts', createSchema, {
		method: 'POST',
		body: JSON.stringify(payload),
	})
}
export async function clearPodcastDownloadQueue(itemId: string) {
	return api(
		`/api/podcasts/${encodeURIComponent(itemId)}/clear-queue`,
		emptySchema,
	)
}
export async function updatePodcastMedia(
	itemId: string,
	payload: {
		autoDownloadEpisodes?: boolean
		autoDownloadSchedule?: string
		lastEpisodeCheck?: number
		maxEpisodesToKeep?: number
		maxNewEpisodesToDownload?: number
	},
) {
	return api(
		`/api/items/${encodeURIComponent(itemId)}/media`,
		mediaUpdatedSchema,
		{ method: 'PATCH', body: JSON.stringify(payload) },
	)
}
export async function downloadPodcastEpisodes(
	itemId: string,
	episodes: z.infer<typeof feedEpisodesSchema>['episodes'],
) {
	return api(
		`/api/podcasts/${encodeURIComponent(itemId)}/download-episodes`,
		emptySchema,
		{ method: 'POST', body: JSON.stringify(episodes) },
	)
}
export async function getPodcast(id: string) {
	return api(`/api/items/${encodeURIComponent(id)}?expanded=1`, itemSchema)
}

export function PodcastSearch({ libraryId }: { libraryId: string }) {
	const admin = useAuth((s) => isAdmin(s.user))
	const userId = useAuth((s) => s.user?.id)
	const [term, setTerm] = useState('')
	const [results, setResults] = useState<z.infer<typeof searchSchema>>([])
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState('')
	const [message, setMessage] = useState('')
	const [feed, setFeed] = useState<
		z.infer<typeof feedSchema>['podcast'] | null
	>(null)
	const [selection, setSelection] = useState<
		z.infer<typeof searchSchema>[number] | null
	>(null)
	const [folders, setFolders] = useState<
		z.infer<typeof librarySchema>['folders']
	>([])
	const [folderId, setFolderId] = useState('')
	const [title, setTitle] = useState('')
	const [autoDownload, setAutoDownload] = useState(false)
	const [opmlLibrary, setOpmlLibrary] = useState<z.infer<
		typeof librarySchema
	> | null>(null)
	useEffect(() => {
		setOpmlLibrary(null)
		if (!admin) return
		let active = true
		const generation = getAuthGeneration()
		const controller = new AbortController()
		void api(
			`/api/libraries/${encodeURIComponent(libraryId)}?include=filterdata`,
			libraryResponseSchema,
			{ signal: controller.signal },
		)
			.then(({ library }) => {
				if (
					active &&
					generation === getAuthGeneration() &&
					useAuth.getState().user?.id === userId &&
					library.id === libraryId &&
					library.mediaType === 'podcast'
				) {
					setOpmlLibrary(library)
					setFolders(library.folders)
					setFolderId(library.folders[0]?.id || '')
				}
			})
			.catch((e) => {
				if (active)
					setError(
						e instanceof Error ? e.message : 'Could not load library folders',
					)
			})
		return () => {
			active = false
			controller.abort()
		}
	}, [admin, libraryId, userId])
	async function lookup(event: React.FormEvent) {
		event.preventDefault()
		if (!admin || !term.trim()) return
		setBusy(true)
		setError('')
		setMessage('')
		setFeed(null)
		setSelection(null)
		try {
			if (/^https?:\/\//i.test(term.trim())) {
				const value = await api('/api/podcasts/feed', feedSchema, {
					method: 'POST',
					body: JSON.stringify({ rssFeed: term.trim() }),
				})
				setSelection({
					id: value.podcast.metadata.feedUrl || term.trim(),
					title: value.podcast.metadata.title || '',
					feedUrl: term.trim(),
				})
				setFeed(value.podcast)
				setTitle(value.podcast.metadata.title || '')
			} else
				setResults(
					(
						await api(
							`/api/search/podcast?${new URLSearchParams({ term: term.trim(), country: 'us' })}`,
							searchSchema,
						)
					).filter((x) => x.feedUrl),
				)
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Podcast lookup failed')
		} finally {
			setBusy(false)
		}
	}
	async function choose(podcast: z.infer<typeof searchSchema>[number]) {
		if (!podcast.feedUrl) return
		setBusy(true)
		setError('')
		try {
			const value = await api('/api/podcasts/feed', feedSchema, {
				method: 'POST',
				body: JSON.stringify({ rssFeed: podcast.feedUrl }),
			})
			setSelection(podcast)
			setFeed(value.podcast)
			setTitle(podcast.title)
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Could not load RSS feed')
		} finally {
			setBusy(false)
		}
	}
	async function subscribe(event: React.FormEvent) {
		event.preventDefault()
		if (!admin || !feed || !selection || !folderId) return
		setBusy(true)
		setError('')
		setMessage('')
		try {
			const payload = makePodcastPayload({
				libraryId,
				folderId,
				folderPath: folders.find((f) => f.id === folderId)?.fullPath || '',
				podcast: selection,
				feed,
				title,
			})
			const result = await createPodcast({
				...payload,
				media: { ...payload.media, autoDownloadEpisodes: autoDownload },
			})
			setMessage(`Podcast added: ${result.id}`)
			setFeed(null)
			setSelection(null)
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Could not add podcast')
		} finally {
			setBusy(false)
		}
	}
	return (
		<section className="space-y-5">
			<h1 className="text-2xl font-semibold">Find podcasts</h1>
			{admin && opmlLibrary?.id === libraryId && (
				<OpmlImport key={libraryId} library={opmlLibrary} />
			)}
			{!admin && <p role="alert">Administrator permission required.</p>}
			<form className="flex gap-2" onSubmit={lookup}>
				<label htmlFor="podcast-search" className="sr-only">
					Podcast name or RSS URL
				</label>
				<input
					id="podcast-search"
					className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3"
					value={term}
					onChange={(e) => setTerm(e.target.value)}
					maxLength={2000}
					placeholder="Search podcasts or paste RSS URL"
				/>
				<Button disabled={!admin || busy || !term.trim()}>
					{busy ? 'Loading…' : 'Search'}
				</Button>
			</form>
			{error && <p role="alert">{error}</p>}
			<p role="status">{message}</p>
			{!results.length && term && !busy && !feed && !error && (
				<p>No matching podcasts.</p>
			)}
			<ul className="space-y-3">
				{results.map((p) => (
					<li
						key={String(p.id)}
						className="flex items-center gap-3 rounded-md border p-3"
					>
						{p.cover && (
							<img
								src={p.cover}
								alt=""
								className="size-16 rounded object-cover"
							/>
						)}
						<div className="min-w-0 flex-1">
							<a
								href={p.pageUrl || p.feedUrl}
								target="_blank"
								rel="noreferrer"
								className="font-medium underline"
							>
								{p.title}
							</a>
							<p className="text-sm text-muted-foreground">
								{p.artistName} · {p.trackCount ?? '—'} episodes
							</p>
						</div>
						<Button
							disabled={!admin || busy || !p.feedUrl}
							onClick={() => void choose(p)}
						>
							Subscribe
						</Button>
					</li>
				))}
			</ul>
			{feed && selection && (
				<form className="space-y-3 rounded-lg border p-4" onSubmit={subscribe}>
					<h2 className="text-lg font-semibold">Add podcast</h2>
					<label className="block">
						Title
						<input
							className="mt-1 h-10 w-full rounded-md border bg-background px-3"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							required
							maxLength={300}
						/>
					</label>
					<label className="block">
						Destination folder
						<select
							className="mt-1 h-10 w-full rounded-md border bg-background px-3"
							value={folderId}
							onChange={(e) => setFolderId(e.target.value)}
							required
						>
							<option value="">Select folder</option>
							{folders.map((f) => (
								<option key={f.id} value={f.id}>
									{f.fullPath}
								</option>
							))}
						</select>
					</label>
					<label className="flex items-center gap-2">
						<input
							type="checkbox"
							checked={autoDownload}
							onChange={(e) => setAutoDownload(e.target.checked)}
						/>
						Automatically download new episodes
					</label>
					<Button disabled={!admin || busy || !folderId}>
						{busy ? 'Adding…' : 'Add podcast'}
					</Button>
				</form>
			)}
		</section>
	)
}

function EpisodeDescription({ text }: { text: string }) {
	const [open, setOpen] = useState(false)
	return (
		<div className="mt-2">
			<RichText
				text={text}
				className={
					open ? 'text-sm' : 'line-clamp-2 text-sm text-muted-foreground'
				}
			/>
			<details onToggle={(event) => setOpen(event.currentTarget.open)}>
				<summary className="cursor-pointer text-sm text-primary">
					Read description
				</summary>
			</details>
		</div>
	)
}

export function PodcastLatest({ libraryId }: { libraryId: string }) {
	const user = useAuth((state) => state.user)
	const [progressUnavailable, setProgressUnavailable] = useState(true)
	const [progressBusy, setProgressBusy] = useState(false)
	const [warning, setWarning] = useState('')
	useEffect(() => {
		let active = true
		if (!user?.id) return
		const reload = () => {
			void refreshProgress()
				.then(() => {
					if (active) {
						setProgressUnavailable(false)
						setWarning('')
					}
				})
				.catch((error: unknown) => {
					if (active) {
						setProgressUnavailable(true)
						setWarning(
							error instanceof Error ? error.message : 'Progress update failed',
						)
					}
				})
		}
		const receive = (event: Event) => {
			if (
				event instanceof CustomEvent &&
				['init', 'reconnect'].includes(event.detail?.event)
			)
				reload()
		}
		setProgressUnavailable(true)
		reload()
		window.addEventListener('abs:socket', receive)
		return () => {
			active = false
			window.removeEventListener('abs:socket', receive)
		}
	}, [user?.id])
	const [episodes, setEpisodes] = useState<
		z.infer<typeof latestSchema>['episodes']
	>([])
	const [error, setError] = useState('')
	const [busy, setBusy] = useState(true)
	useEffect(() => {
		let active = true
		void api(
			`/api/libraries/${encodeURIComponent(libraryId)}/recent-episodes?limit=50&page=0`,
			latestSchema,
		)
			.then((x) => {
				if (active) setEpisodes(x.episodes)
			})
			.catch((e) => {
				if (active)
					setError(e instanceof Error ? e.message : 'Could not load episodes')
			})
			.finally(() => {
				if (active) setBusy(false)
			})
		return () => {
			active = false
		}
	}, [libraryId])
	return (
		<section className="space-y-4">
			<h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
				Latest episodes
			</h1>
			{busy && <p role="status">Loading episodes…</p>}
			{error && <p role="alert">{error}</p>}
			{!!(warning || user?.progressWarning) && (
				<p role="status">{warning || String(user?.progressWarning)}</p>
			)}
			{!busy && !episodes.length && !error && <p>No episodes found.</p>}
			<ul className="divide-y">
				{episodes.map((e) => {
					const progress = episodeProgress(user, e.libraryItemId, e.id)
					return (
						<li
							key={e.id}
							className="flex min-w-0 gap-4 py-5 [overflow-wrap:anywhere]"
						>
							<img
								className="size-16 shrink-0 rounded-lg object-cover sm:size-20"
								src={`${window.__ABS_WEB_CONFIG__?.apiBasePath || ''}/api/items/${encodeURIComponent(e.libraryItemId)}/cover`}
								alt={`${e.podcast.metadata.title || 'Podcast'} cover`}
								loading="lazy"
							/>
							<div className="min-w-0 flex-1">
								{e.publishedAt ? (
									<p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
										{new Date(e.publishedAt).toISOString().slice(0, 10)}
									</p>
								) : null}
								<h2 className="font-semibold">
									{e.title || 'Untitled episode'}
								</h2>
								<p className="text-sm text-muted-foreground">
									<Link
										to="/items/$itemId"
										params={{ itemId: e.libraryItemId }}
										className="underline"
									>
										{e.podcast.metadata.title}
									</Link>
								</p>
								{(e.subtitle || e.description) && (
									<EpisodeDescription
										text={e.subtitle || e.description || ''}
									/>
								)}
								<p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
									{progress?.isFinished ? (
										<Check aria-hidden="true" className="size-3" />
									) : (
										<Circle
											aria-hidden="true"
											className="size-2 fill-current"
										/>
									)}
									{progress?.isFinished
										? 'Finished'
										: progress?.currentTime || progress?.progress
											? 'In progress'
											: progressUnavailable || warning || user?.progressWarning
												? 'Status unavailable'
												: 'Unplayed'}
								</p>
								<div className="mt-2 flex flex-wrap gap-2">
									<AdAnalysisStatus itemId={e.libraryItemId} episode={e} />
									<Button
										className="rounded-full"
										aria-label={`Play ${e.title || 'episode'}`}
										onClick={() =>
											void playEpisode(e.libraryItemId, e.id).catch((error) =>
												setError(
													error instanceof Error
														? error.message
														: 'Playback failed',
												),
											)
										}
									>
										<Play aria-hidden="true" className="size-3" />
										{e.duration == null
											? 'Play'
											: `${Math.ceil(Math.max(0, e.duration - (!progress?.isFinished ? (progress?.currentTime ?? 0) : 0)) / 60)} min${!progress?.isFinished && progress?.currentTime ? ' left' : ''}`}
									</Button>
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button
												variant="ghost"
												size="icon"
												aria-label={`More actions for ${e.title || 'episode'}`}
											>
												<Ellipsis aria-hidden="true" />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem
												disabled={progressBusy}
												onSelect={() => {
													if (
														progress?.isFinished &&
														(progress.currentTime || 0) > 0 &&
														!window.confirm(
															'Mark unfinished? This resets the saved listening position to the beginning.',
														)
													)
														return
													const userId = user?.id
													setProgressBusy(true)
													void updateProgress(
														e.libraryItemId,
														{ isFinished: !progress?.isFinished },
														e.id,
													)
														.then((result) => {
															if (useAuth.getState().user?.id === userId)
																setWarning(result?.refreshWarning || '')
														})
														.catch((error: unknown) => {
															if (useAuth.getState().user?.id === userId)
																setError(
																	error instanceof Error
																		? error.message
																		: 'Progress update failed',
																)
														})
														.finally(() => {
															if (useAuth.getState().user?.id === userId)
																setProgressBusy(false)
														})
												}}
											>
												{progress?.isFinished
													? 'Mark unfinished'
													: 'Mark finished'}
											</DropdownMenuItem>
											<DropdownMenuItem
												onSelect={() =>
													enqueueEpisode(
														e.libraryItemId,
														e.id,
														e.title || 'Podcast episode',
													)
												}
											>
												Add to player queue
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</div>
							</div>
						</li>
					)
				})}
			</ul>
		</section>
	)
}

export function PodcastDownloadQueue({ libraryId }: { libraryId: string }) {
	const t = useT()
	const admin = useAuth((s) => isAdmin(s.user))
	const [queue, setQueue] = useState<z.infer<typeof queueSchema>['queue']>([])
	const [error, setError] = useState('')
	const [busy, setBusy] = useState(false)
	const [loading, setLoading] = useState(true)
	const load = useCallback(
		async (isActive: () => boolean = () => true) => {
			setLoading(true)
			setError('')
			try {
				const data = await api(
					`/api/libraries/${encodeURIComponent(libraryId)}/episode-downloads`,
					queueSchema,
				)
				if (isActive())
					setQueue([
						...data.queue,
						...(data.currentDownload ? [data.currentDownload] : []),
					])
			} catch (e) {
				if (isActive())
					setError(e instanceof Error ? e.message : 'Could not load queue')
			} finally {
				if (isActive()) setLoading(false)
			}
		},
		[libraryId],
	)
	useEffect(() => {
		let active = true
		void load(() => active)
		const receive = (event: Event) => {
			const detail = (event as CustomEvent<{ event: string; payload: unknown }>)
				.detail
			if (
				[
					'episode_download_queued',
					'episode_download_started',
					'episode_download_finished',
					'episode_download_queue_cleared',
				].includes(detail?.event)
			)
				void load(() => active).then(() => {
					const failure = z
						.object({
							failed: z.literal(true),
							episodeDisplayTitle: z.string().nullish(),
						})
						.safeParse(detail.payload)
					if (
						active &&
						detail.event === 'episode_download_finished' &&
						failure.success
					)
						setError(
							t(
								'Podcast.downloadFailed',
								[failure.data.episodeDisplayTitle || 'Podcast episode'],
								'Download failed: {0}',
							),
						)
				})
		}
		window.addEventListener('abs:socket', receive)
		return () => {
			active = false
			window.removeEventListener('abs:socket', receive)
		}
	}, [load, t])
	async function clear(itemId: string) {
		if (!window.confirm('Clear all queued downloads for this podcast?')) return
		setBusy(true)
		setError('')
		try {
			await clearPodcastDownloadQueue(itemId)
			await load()
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Could not clear queue')
		} finally {
			setBusy(false)
		}
	}
	return (
		<section className="space-y-4">
			<h1 className="text-2xl font-semibold">Podcast download queue</h1>
			{loading && <p role="status">Loading downloads…</p>}
			{error && (
				<div>
					<p role="alert">{error}</p>
					<Button onClick={() => void load()}>Retry</Button>
				</div>
			)}
			{!loading && !queue.length && !error && <p>No queued downloads.</p>}
			<ul className="divide-y">
				{queue.map((item) => (
					<li
						key={item.id}
						className="flex items-center justify-between gap-3 py-3"
					>
						<span className="min-w-0 [overflow-wrap:anywhere]">
							{item.episodeDisplayTitle ||
								item.episodeTitle ||
								item.podcastTitle ||
								item.id}
						</span>
						{admin && item.libraryItemId && (
							<Button
								variant="destructive"
								disabled={busy}
								onClick={() => void clear(item.libraryItemId)}
							>
								Clear podcast queue
							</Button>
						)}
					</li>
				))}
			</ul>
			{!admin && (
				<p>Administrator permission required to clear download queues.</p>
			)}
		</section>
	)
}

export function PodcastManagementSettings({
	itemId,
	children,
}: {
	itemId: string
	children?: (content: ReactNode) => ReactNode
}) {
	const admin = useAuth((s) => isAdmin(s.user))
	const [item, setItem] = useState<z.infer<typeof itemSchema> | null>(null)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState('')
	const [message, setMessage] = useState('')
	const [autoDownload, setAutoDownload] = useState(false)
	const [schedule, setSchedule] = useState('')
	const [lastCheck, setLastCheck] = useState('')
	const [keep, setKeep] = useState(0)
	const [limit, setLimit] = useState(3)
	const [episodes, setEpisodes] = useState<
		z.infer<typeof feedEpisodesSchema>['episodes']
	>([])
	const [selected, setSelected] = useState<string[]>([])
	useEffect(() => {
		let active = true
		const generation = getAuthGeneration()
		setItem(null)
		setError('')
		if (!admin) return
		void getPodcast(itemId)
			.then((value) => {
				if (!active || generation !== getAuthGeneration()) return
				setItem(value)
				setAutoDownload(!!value.media.autoDownloadEpisodes)
				setSchedule(value.media.autoDownloadSchedule || '')
				setLastCheck(
					value.media.lastEpisodeCheck
						? formatDateTimeInput(value.media.lastEpisodeCheck)
						: '',
				)
				setKeep(value.media.maxEpisodesToKeep || 0)
				setLimit(value.media.maxNewEpisodesToDownload ?? 3)
			})
			.catch((e) => {
				if (active)
					setError(e instanceof Error ? e.message : 'Could not load podcast')
			})
		return () => {
			active = false
		}
	}, [itemId, admin])
	async function save() {
		setBusy(true)
		setError('')
		try {
			const patch = {
				autoDownloadEpisodes: autoDownload,
				...(autoDownload && schedule ? { autoDownloadSchedule: schedule } : {}),
				maxEpisodesToKeep: keep,
				maxNewEpisodesToDownload: limit,
				...(lastCheck
					? { lastEpisodeCheck: new Date(lastCheck).valueOf() }
					: {}),
			}
			await updatePodcastMedia(itemId, patch)
			setMessage('Podcast settings saved.')
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Could not save settings')
		} finally {
			setBusy(false)
		}
	}
	async function check() {
		setBusy(true)
		setError('')
		try {
			const result = await api(
				`/api/podcasts/${encodeURIComponent(itemId)}/checknew?limit=${limit}`,
				z.object({ episodes: z.array(z.unknown()) }),
			)
			setMessage(`${result.episodes.length} new episodes found.`)
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Could not check feed')
		} finally {
			setBusy(false)
		}
	}
	async function findEpisodes() {
		setBusy(true)
		setError('')
		try {
			const value = await api(`/api/podcasts/feed`, feedSchema, {
				method: 'POST',
				body: JSON.stringify({ rssFeed: item?.media.metadata?.feedUrl }),
			})
			setEpisodes(
				value.podcast.episodes?.map((raw) => feedEpisodeSchema.parse(raw)) ||
					[],
			)
			setSelected([])
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Could not load RSS episodes')
		} finally {
			setBusy(false)
		}
	}
	async function download() {
		setBusy(true)
		setError('')
		try {
			await downloadPodcastEpisodes(
				itemId,
				episodes.filter((e) =>
					selected.includes(e.cleanUrl || e.enclosure?.url || e.url || ''),
				),
			)
			setMessage('Selected episodes added to download queue.')
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Could not queue episodes')
		} finally {
			setBusy(false)
		}
	}
	const content = (
		<section className="space-y-4">
			<h2 className="text-xl font-semibold">Podcast management</h2>
			{error && <p role="alert">{error}</p>}
			<p role="status">{message}</p>
			{item && (
				<>
					<label className="flex items-center gap-2">
						<input
							type="checkbox"
							checked={autoDownload}
							disabled={!admin || busy}
							onChange={(e) => setAutoDownload(e.target.checked)}
						/>
						Automatically download new episodes
					</label>
					<label className="block">
						Download schedule (cron)
						<input
							className="mt-1 h-10 w-full rounded-md border bg-background px-3"
							value={schedule}
							disabled={!admin || busy || !autoDownload}
							onChange={(e) => setSchedule(e.target.value)}
							placeholder="0 6 * * *"
						/>
					</label>
					<label className="block">
						Maximum episodes to keep
						<input
							className="mt-1 h-10 rounded-md border bg-background px-3"
							type="number"
							min="0"
							value={keep}
							disabled={!admin || busy}
							onChange={(e) => setKeep(Math.max(0, Number(e.target.value)))}
						/>
					</label>
					<label className="block">
						Maximum new episodes per check
						<input
							className="mt-1 h-10 rounded-md border bg-background px-3"
							type="number"
							min="0"
							value={limit}
							disabled={!admin || busy}
							onChange={(e) => setLimit(Math.max(0, Number(e.target.value)))}
						/>
					</label>
					<IsoDateTimeField
						label="Look for episodes after"
						value={lastCheck}
						isDisabled={!admin || busy}
						onChange={setLastCheck}
					/>
					<div className="flex flex-wrap gap-2">
						<Button disabled={!admin || busy} onClick={() => void save()}>
							Save settings
						</Button>
						<Button
							variant="outline"
							disabled={!admin || busy}
							onClick={() => void check()}
						>
							Check and download new episodes
						</Button>
						<Button
							variant="outline"
							disabled={!admin || busy}
							onClick={() => void findEpisodes()}
						>
							Browse feed episodes
						</Button>
					</div>
					<ul className="divide-y">
						{episodes.map((episode, index) => {
							const key =
								episode.cleanUrl ||
								episode.enclosure?.url ||
								episode.url ||
								String(index)
							return (
								<li key={key} className="flex gap-2 py-2">
									<input
										aria-label={`Select ${episode.title || episode.episodeTitle || 'episode'}`}
										type="checkbox"
										checked={selected.includes(key)}
										disabled={!admin || busy}
										onChange={(e) =>
											setSelected(
												e.target.checked
													? [...selected, key]
													: selected.filter((value) => value !== key),
											)
										}
									/>
									<span>{episode.title || episode.episodeTitle || key}</span>
								</li>
							)
						})}
					</ul>
					{episodes.length > 0 && (
						<Button
							disabled={!admin || busy || !selected.length}
							onClick={() => void download()}
						>
							Download selected episodes ({selected.length})
						</Button>
					)}
				</>
			)}
			{!admin && (
				<p>
					Administrator permission required to manage podcast downloads and
					settings.
				</p>
			)}
		</section>
	)
	return children ? children(content) : content
}
