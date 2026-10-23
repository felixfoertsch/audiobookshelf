import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { ChevronRight, SlidersHorizontal } from 'lucide-react'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { api, getAuthGeneration, useAuth } from '../../api'
import { duration, episodeSchema, itemSchema } from '../../catalog'
import { playEpisode, playQueue } from '../../player'
import { Button } from '../../shared/components/ui/button'
import { Input } from '../../shared/components/ui/input'
import { NativeSelect } from '../../shared/components/ui/native-select'
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '../../shared/components/ui/sheet'
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from '../../shared/components/ui/sidebar'
import { episodeProgress, refreshProgress } from '../item/progress'
import { getItem, writeProgress } from '../item/service'
import { WorkflowSheet } from '../item/WorkflowSheet'
import {
	type BrowseSearch,
	browseSearch,
	type Entry,
	encodeFilter,
	entitySchema,
	loadBrowse,
	type loadFilters,
	type loadHome,
	type loadNarrators,
	type loadSeries,
	type loadStats,
	saveNarrator,
	searchLibrary,
} from './browse-api'
import { persistSearch, useCoverSize, useShelfPosition } from './preferences'
import { SelectionTools } from './selection-tools'

export async function updateSelectedProgress(
	ids: string[],
	podcast: boolean,
	isFinished: boolean,
	options: {
		owner: string
		generation: number
		isActive: () => boolean
		onProgress: (written: number, skipped: number, remaining: number) => void
	},
) {
	let written = 0
	let skipped = 0
	let failed = 0
	let error = ''
	const targets: { id: string; episodeId?: string }[] = []
	const current = () =>
		options.isActive() &&
		useAuth.getState().user?.id === options.owner &&
		getAuthGeneration() === options.generation
	try {
		await refreshProgress()
	} catch {
		throw new Error(
			'Could not verify listening status; refresh before bulk changes',
		)
	}
	if (!current())
		return {
			written: 0,
			skipped: 0,
			failed: 0,
			remaining: ids.length,
			error: '',
			refreshWarning: '',
			cancelled: true,
		}
	if (useAuth.getState().user?.progressWarning)
		throw new Error(
			'Could not verify listening status; refresh before bulk changes',
		)
	for (const id of ids) {
		if (!current()) break
		if (podcast) {
			const item = await getItem(id)
			for (const episode of item.media.episodes || [])
				targets.push({ id, episodeId: episode.id })
		} else targets.push({ id })
	}
	if (!isFinished && current()) {
		const resets = targets.filter((target) => {
			const existing = episodeProgress(
				useAuth.getState().user,
				target.id,
				target.episodeId,
			)
			return existing?.isFinished && (existing.currentTime || 0) > 0
		}).length
		if (
			resets &&
			!window.confirm(
				`Mark unfinished? This resets saved listening positions to the beginning for ${resets} finished ${resets === 1 ? 'episode or book' : 'episodes or books'}.`,
			)
		)
			return {
				written: 0,
				skipped: 0,
				failed: 0,
				remaining: targets.length,
				error: '',
				refreshWarning: '',
				cancelled: true,
			}
	}
	for (const target of targets) {
		if (!current()) break
		const existing = episodeProgress(
			useAuth.getState().user,
			target.id,
			target.episodeId,
		)
		if (
			(isFinished && existing?.isFinished) ||
			(!isFinished && !existing?.isFinished)
		)
			skipped++
		else {
			try {
				await writeProgress(target.id, { isFinished }, target.episodeId)
				written++
			} catch (cause) {
				failed++
				error = cause instanceof Error ? cause.message : 'Progress write failed'
				break
			}
		}
		options.onProgress(
			written,
			skipped,
			targets.length - written - skipped - failed,
		)
	}
	let refreshWarning = ''
	if (
		written &&
		useAuth.getState().user?.id === options.owner &&
		getAuthGeneration() === options.generation
	) {
		try {
			await refreshProgress()
		} catch {
			refreshWarning = 'Changes saved, but listening status could not refresh.'
		}
	}
	return {
		written,
		skipped,
		failed,
		remaining: targets.length - written - skipped - failed,
		error,
		refreshWarning,
		cancelled: !current(),
	}
}

export const LibraryNameContext = createContext('')

function CatalogHeading({ title }: { title: string }) {
	const libraryName = useContext(LibraryNameContext)
	return (
		<header className="space-y-1">
			{libraryName && (
				<p className="text-sm text-muted-foreground">{libraryName}</p>
			)}
			<h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
		</header>
	)
}

function humanLabel(value: string) {
	const labels: Record<string, string> = {
		'feed-open': 'RSS feed open',
		'share-open': 'Public share active',
		publishedYear: 'Publication year',
		publishedDecades: 'Publication decades',
		asin: 'ASIN',
		isbn: 'ISBN',
		tracks: 'Audio tracks',
		ebooks: 'Ebooks',
		missing: 'Missing metadata',
		none: 'No audio tracks',
		single: 'One audio track',
		multi: 'Multiple audio tracks',
		ebook: 'Has ebook',
		'no-ebook': 'No ebook',
		supplementary: 'Has supplementary ebook',
		'no-supplementary': 'No supplementary ebook',
	}
	const text = labels[value] || value.replaceAll('-', ' ')
	return text.charAt(0).toUpperCase() + text.slice(1)
}

function currentFilterLabel(filter: string) {
	const [group, encoded] = filter.split('.')
	if (!encoded) return humanLabel(group)
	try {
		return `${humanLabel(group)} · ${humanLabel(decodeURIComponent(escape(atob(encoded))))}`
	} catch {
		return filter
	}
}

export function useCatalogRefresh() {
	const router = useRouter()
	useEffect(() => {
		let timer = 0
		let batchOwner: string | null = null
		const schedule = () => {
			window.clearTimeout(timer)
			timer = window.setTimeout(() => void router.invalidate(), 80)
		}
		const refresh = (event: Event) => {
			const detail = (
				event as CustomEvent<{ event?: unknown; payload?: unknown }>
			).detail
			const name = detail?.event
			if (
				typeof name === 'string' &&
				/^(reconnect|init|library_|item_|items_|author_|series_|collection_|playlist_|rss_feed_|share_)/.test(
					name,
				)
			)
				schedule()
			if (name === 'user_updated' && !batchOwner) {
				const user = useAuth.getState().user
				if (
					user &&
					typeof detail.payload === 'object' &&
					detail.payload !== null &&
					'id' in detail.payload &&
					detail.payload.id === user.id
				)
					schedule()
			}
			if (name === 'user_item_progress_updated' && !batchOwner) schedule()
		}
		const progress = () => {
			if (!batchOwner) schedule()
		}
		const batch = (event: Event) => {
			if (!(event instanceof CustomEvent)) return
			const detail = event.detail as { active?: boolean; owner?: string }
			if (detail.active && detail.owner === useAuth.getState().user?.id) {
				batchOwner = detail.owner || null
				window.clearTimeout(timer)
			} else if (!detail.active && detail.owner === batchOwner) {
				batchOwner = null
				if (detail.owner === useAuth.getState().user?.id) schedule()
			}
		}
		window.addEventListener('abs:socket', refresh)
		window.addEventListener('abs:progress-changed', progress)
		window.addEventListener('abs:progress-batch', batch)
		return () => {
			window.clearTimeout(timer)
			window.removeEventListener('abs:socket', refresh)
			window.removeEventListener('abs:progress-changed', progress)
			window.removeEventListener('abs:progress-batch', batch)
		}
	}, [router])
}
export function LibraryNav({
	library,
	podcast = false,
	icons = {},
}: {
	library: string
	podcast?: boolean
	icons?: Record<string, React.ReactNode>
}) {
	const { setOpenMobile } = useSidebar()
	const router = useRouter()
	useEffect(
		() =>
			router.subscribe('onBeforeNavigate', ({ hrefChanged }) => {
				if (hrefChanged) setOpenMobile(false)
			}),
		[router, setOpenMobile],
	)
	const user = useAuth((state) => state.user)
	const admin = user?.type === 'root' || user?.type === 'admin'
	return (
		<nav aria-label="Library">
			<SidebarGroup>
				<SidebarGroupLabel>Discover</SidebarGroupLabel>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton asChild>
							<Link
								to="/library/$library"
								params={{ library }}
								activeOptions={{ exact: true, includeSearch: false }}
								activeProps={{ 'data-active': true }}
							>
								{icons.Home}
								Home
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
					{podcast && (
						<SidebarMenuItem>
							<SidebarMenuButton asChild>
								<Link
									to="/library/$library/podcast/latest"
									params={{ library }}
									activeProps={{ 'data-active': true }}
								>
									{icons['Latest episodes']}
									Latest episodes
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
					)}
					{podcast && admin && (
						<SidebarMenuItem>
							<SidebarMenuButton asChild>
								<Link
									to="/library/$library/podcast/search"
									params={{ library }}
									activeProps={{ 'data-active': true }}
								>
									{icons['Add podcast']}
									Add podcast
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
					)}
				</SidebarMenu>
			</SidebarGroup>
			<SidebarGroup>
				<SidebarGroupLabel>Library</SidebarGroupLabel>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton asChild>
							<Link
								to="/library/$library/bookshelf"
								params={{ library }}
								activeOptions={{ exact: true, includeSearch: false }}
								activeProps={{ 'data-active': true }}
							>
								{icons.Library}
								Library
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
					{!podcast &&
						['series', 'authors', 'collections'].map((id) => (
							<SidebarMenuItem key={id}>
								<SidebarMenuButton asChild>
									<Link
										to="/library/$library/bookshelf/$id"
										params={{ library, id }}
										activeOptions={{ exact: true, includeSearch: false }}
										activeProps={{ 'data-active': true }}
									>
										{icons[id]}
										{humanLabel(id)}
									</Link>
								</SidebarMenuButton>
							</SidebarMenuItem>
						))}
					{!podcast && (
						<SidebarMenuItem>
							<SidebarMenuButton asChild>
								<Link
									to="/library/$library/narrators"
									params={{ library }}
									activeProps={{ 'data-active': true }}
								>
									{icons.Narrators}
									Narrators
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
					)}
				</SidebarMenu>
			</SidebarGroup>
			<SidebarGroup>
				<SidebarGroupLabel>Playlists</SidebarGroupLabel>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton asChild>
							<Link
								to="/library/$library/bookshelf/$id"
								params={{ library, id: 'playlists' }}
								activeProps={{ 'data-active': true }}
							>
								{icons.Playlists}
								Playlists
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarGroup>
			{admin && (
				<SidebarGroup>
					<SidebarGroupLabel>Library tools</SidebarGroupLabel>
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton asChild>
								{podcast ? (
									<Link
										to="/library/$library/podcast/download-queue"
										params={{ library }}
										activeProps={{ 'data-active': true }}
									>
										{icons['Download queue']}
										Download queue
									</Link>
								) : (
									<Link
										to="/library/$library/stats"
										params={{ library }}
										activeProps={{ 'data-active': true }}
									>
										{icons.Statistics}
										Statistics
									</Link>
								)}
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarGroup>
			)}
		</nav>
	)
}

export function EntryCard({
	entry,
	library,
	view = 'grid',
	select,
	shelfId,
	headingLevel = 2,
}: {
	entry: Entry
	library: string
	headingLevel?: 2 | 3
	view?: string
	shelfId?: string
	select?: { checked: boolean; toggle: () => void }
}) {
	const [shelfError, setShelfError] = useState('')
	const [hidden, setHidden] = useState(false)
	const parsed = itemSchema.safeParse(entry)
	const item = parsed.success ? parsed.data : null
	const shelfUser = useAuth((state) => state.user)
	const progressResult = z
		.object({
			id: z.string().optional(),
			currentTime: z.number().nullish(),
			duration: z.number().nullish(),
		})
		.safeParse(
			episodeProgress(shelfUser, item?.id || '') ?? item?.userMediaProgress,
		)
	const shelfProgress = progressResult.success ? progressResult.data : undefined
	const parsedEntity = entitySchema.safeParse(entry)
	const entity = parsedEntity.success ? parsedEntity.data : null
	const recent =
		'recentEpisode' in entry
			? episodeSchema.safeParse(entry.recentEpisode)
			: null
	const episode =
		entry._type === 'episode' && recent?.success ? recent.data : null
	const recentDuration = recent?.success
		? (recent.data.duration ?? recent.data.audioFile?.duration)
		: null
	const Heading = headingLevel === 3 ? 'h3' : 'h2'
	const collapsed =
		'collapsedSeries' in entry
			? z
					.object({ id: z.string(), name: z.string().nullish() })
					.safeParse(entry.collapsedSeries)
			: null
	if (hidden) return null
	const name =
		item?.media.metadata.title ||
		(typeof entry.name === 'string' ? entry.name : '') ||
		entity?.title ||
		'Untitled'
	return (
		<article className="min-w-0 space-y-1 text-sm [&_p]:text-muted-foreground [overflow-wrap:anywhere]">
			{select && (
				<label className="flex gap-2">
					<input
						type="checkbox"
						checked={select.checked}
						onChange={select.toggle}
					/>
					Select {name}
				</label>
			)}
			{collapsed?.success ? (
				<Link
					to="/library/$library/series/$id"
					params={{ library, id: collapsed.data.id }}
				>
					{collapsed.data.name} · Series
				</Link>
			) : item ? (
				<>
					<Link
						to="/item/$id"
						params={{ id: item.id }}
						className={`${view === 'grid' ? 'block space-y-2' : 'flex items-center gap-3'} rounded-md focus-visible:outline-2 focus-visible:outline-ring`}
					>
						{item.media.coverPath && (
							<img
								className={`${view === 'grid' ? 'aspect-square w-full' : 'size-16 shrink-0'} rounded-lg bg-muted object-cover`}
								loading="lazy"
								alt=""
								src={`${window.__ABS_WEB_CONFIG__?.apiBasePath || ''}/api/items/${encodeURIComponent(item.id)}/cover?token=${encodeURIComponent(localStorage.getItem('token') || '')}`}
							/>
						)}
						<Heading className="line-clamp-2 text-sm font-medium text-foreground">
							{episode?.title || name}
						</Heading>
					</Link>
					<p className="truncate">
						{episode
							? name
							: item.media.metadata.author ||
								item.media.metadata.authorName ||
								item.media.metadata.authors?.map((a) => a.name).join(', ')}
					</p>
					{episode
						? recentDuration != null && (
								<p className="truncate text-xs">{duration(recentDuration)}</p>
							)
						: item.mediaType === 'podcast'
							? item.media.numEpisodes != null && (
									<p className="truncate text-xs">
										{item.media.numEpisodes.toLocaleString()}{' '}
										{item.media.numEpisodes === 1 ? 'episode' : 'episodes'}
									</p>
								)
							: item.media.duration != null && (
									<p className="truncate text-xs">
										{duration(item.media.duration)}
									</p>
								)}

					{item.isMissing && <p role="status">Missing media files</p>}
					{item.isInvalid && <p role="status">Invalid media files</p>}
					{(item.numEpisodesIncomplete != null ||
						item.rssFeed ||
						item.mediaItemShare) && (
						<details className="text-xs text-muted-foreground">
							<summary className="cursor-pointer">Details</summary>
							{item.numEpisodesIncomplete != null && (
								<p>
									{item.numEpisodesIncomplete} unfinished{' '}
									{item.numEpisodesIncomplete === 1 ? 'episode' : 'episodes'}
								</p>
							)}
							{item.rssFeed && (
								<p>
									RSS feed open
									{item.rssFeed.feedUrl && (
										<>
											{' '}
											·{' '}
											<a
												className="underline"
												href={item.rssFeed.feedUrl}
												target="_blank"
												rel="noreferrer"
											>
												Feed
											</a>
										</>
									)}
								</p>
							)}
							{item.mediaItemShare && <p>Public share active</p>}
						</details>
					)}

					{item.mediaType === 'book' &&
						(shelfId === 'continue-listening' ||
							shelfId === 'continue-series') &&
						!hidden && (
							<div className="space-y-1 text-xs">
								{shelfProgress?.currentTime != null && (
									<p>
										Progress: {duration(shelfProgress.currentTime)}
										{shelfProgress.duration != null
											? ` / ${duration(shelfProgress.duration)}`
											: ''}
									</p>
								)}
								{item.media.metadata.series?.map((series) => (
									<p key={series.id}>
										<Link
											to="/library/$library/series/$id"
											params={{ library, id: series.id }}
										>
											{series.name}
											{series.sequence ? ` · ${series.sequence}` : ''}
										</Link>
									</p>
								))}
								<Button
									size="sm"
									variant="outline"
									onClick={() =>
										void playEpisode(
											item.id,
											undefined,
											false,
											shelfProgress?.currentTime ?? 0,
										).catch((error: unknown) =>
											setShelfError(
												error instanceof Error
													? error.message
													: 'Could not resume audiobook',
											),
										)
									}
								>
									Resume
								</Button>
								{shelfId === 'continue-listening' && shelfProgress?.id && (
									<Button
										size="sm"
										variant="ghost"
										onClick={() => {
											void api(
												`/api/me/progress/${encodeURIComponent(String(shelfProgress.id))}/remove-from-continue-listening`,
												z.unknown(),
											)
												.then(() => {
													setHidden(true)
													window.dispatchEvent(
														new CustomEvent('abs:progress-changed', {
															detail: { libraryItemId: item.id },
														}),
													)
												})
												.catch((error: unknown) =>
													setShelfError(
														error instanceof Error
															? error.message
															: 'Could not hide audiobook',
													),
												)
										}}
									>
										Hide from Continue Listening
									</Button>
								)}
								{shelfError && <p role="alert">{shelfError}</p>}
							</div>
						)}

					{view === 'detail' && (
						<>
							<p>{item.media.metadata.description?.replace(/<[^>]*>/g, '')}</p>
							<p>{item.media.metadata.narrators?.join(', ')}</p>
							<p>{item.media.metadata.genres?.join(', ')}</p>
						</>
					)}
				</>
			) : (
				<>
					<Heading className="line-clamp-2 text-sm font-medium">
						<EntityLink entry={entry} library={library}>
							{name}
						</EntityLink>
					</Heading>
					{entity?.numBooks != null && (
						<p>
							{entity.numBooks} {entity.numBooks === 1 ? 'book' : 'books'}
						</p>
					)}
					<p className={view === 'detail' ? undefined : 'line-clamp-1'}>
						{entity?.description}
					</p>
				</>
			)}
		</article>
	)
}
function EntityLink({
	entry,
	library,
	children,
}: {
	entry: Entry
	library: string
	children: React.ReactNode
}) {
	const type = typeof entry._type === 'string' ? entry._type : 'series'
	if (type === 'authors')
		return (
			<Link to="/author/$id" params={{ id: entry.id }}>
				{children}
			</Link>
		)
	if (type === 'collections')
		return (
			<Link to="/collection/$id" params={{ id: entry.id }}>
				{children}
			</Link>
		)
	if (type === 'playlists')
		return (
			<Link to="/playlist/$id" params={{ id: entry.id }}>
				{children}
			</Link>
		)
	return (
		<Link to="/library/$library/series/$id" params={{ library, id: entry.id }}>
			{children}
		</Link>
	)
}
export function HomePage({
	library,
	data,
}: {
	library: string
	data: Awaited<ReturnType<typeof loadHome>>
	podcast: boolean
}) {
	useCatalogRefresh()
	useEffect(() => {
		localStorage.setItem('currentLibraryId', library)
	}, [library])
	return (
		<section className="min-w-0 space-y-8">
			<CatalogHeading title="Home" />

			{!data.length && (
				<p>No shelves available. Browse library to start listening.</p>
			)}
			{data.map((shelf) => (
				<section key={shelf.id} className="space-y-3">
					<h2 className="text-xl font-semibold">
						{shelf.id === 'newest-episodes' ? (
							<Link
								className="inline-flex items-center gap-1"
								to="/library/$library/podcast/latest"
								params={{ library }}
							>
								{shelf.label}
								<ChevronRight
									aria-hidden="true"
									className="size-4 text-muted-foreground"
								/>
							</Link>
						) : shelf.id === 'recently-added' ? (
							<Link
								className="inline-flex items-center gap-1"
								to="/library/$library/bookshelf"
								params={{ library }}
								search={{ sort: 'addedAt', desc: '1' }}
							>
								{shelf.label}
								<ChevronRight
									aria-hidden="true"
									className="size-4 text-muted-foreground"
								/>
							</Link>
						) : ['recent-series', 'newest-authors'].includes(shelf.id) ? (
							<Link
								className="inline-flex items-center gap-1"
								to="/library/$library/bookshelf/$id"
								params={{
									library,
									id: shelf.id === 'recent-series' ? 'series' : 'authors',
								}}
								search={{ sort: 'addedAt', desc: '1' }}
							>
								{shelf.label}
								<ChevronRight
									aria-hidden="true"
									className="size-4 text-muted-foreground"
								/>
							</Link>
						) : (
							shelf.label
						)}
					</h2>
					<div className="flex w-screen -ml-[calc(var(--shelf-sidebar)+var(--shelf-gutter))] snap-x snap-mandatory gap-4 overflow-x-auto pl-[calc(var(--shelf-sidebar)+var(--shelf-gutter))] pr-[var(--shelf-gutter)] scroll-pl-[calc(var(--shelf-sidebar)+var(--shelf-gutter))] scroll-pr-[var(--shelf-gutter)] pb-2 [&>article]:w-[140px] [&>article]:shrink-0 [&>article]:snap-start sm:[&>article]:w-[160px]">
						{shelf.entities.map((entry) => (
							<EntryCard
								key={entry.id}
								shelfId={shelf.id}
								headingLevel={3}
								library={library}
								entry={{
									...entry,
									_type:
										shelf.type === 'author'
											? 'authors'
											: shelf.type === 'collection'
												? 'collections'
												: shelf.type === 'playlist'
													? 'playlists'
													: shelf.type,
								}}
							/>
						))}
					</div>
				</section>
			))}
		</section>
	)
}
export function SearchForm({
	library,
	q = '',
}: {
	library: string
	q?: string
}) {
	const navigate = useNavigate()
	const [term, setTerm] = useState(q)
	const [suggestions, setSuggestions] = useState<Awaited<
		ReturnType<typeof searchLibrary>
	> | null>(null)
	useEffect(() => {
		setTerm(q)
		setSuggestions(null)
	}, [q])
	useEffect(() => {
		if (term.trim().length < 2) {
			setSuggestions(null)
			return
		}
		const controller = new AbortController()
		const timeout = window.setTimeout(() => {
			void searchLibrary(library, term, 3)
				.then((data) => {
					if (!controller.signal.aborted) setSuggestions(data)
				})
				.catch(() => {
					if (!controller.signal.aborted) setSuggestions(null)
				})
		}, 250)
		return () => {
			controller.abort()
			window.clearTimeout(timeout)
		}
	}, [term, library])
	return (
		<div>
			<form
				className="flex gap-2"
				onSubmit={(event) => {
					event.preventDefault()
					const value = new FormData(event.currentTarget).get('q')
					if (typeof value === 'string')
						void navigate({
							to: '/library/$library/search',
							params: { library },
							search: { q: value },
						})
				}}
			>
				<label htmlFor="library-search" className="min-w-0 flex-1">
					Search library
					<Input
						id="library-search"
						name="q"
						type="search"
						value={term}
						onChange={(event) => setTerm(event.target.value)}
						maxLength={200}
					/>
				</label>
				<Button className="sr-only focus:not-sr-only" type="submit">
					Search
				</Button>
			</form>
			{suggestions && (
				<ul
					aria-label="Search suggestions"
					className="mt-2 rounded border bg-card p-3"
				>
					{[...(suggestions.book || []), ...(suggestions.podcast || [])].map(
						(match) => (
							<li key={match.libraryItem.id}>
								<Link
									to="/item/$id"
									params={{ id: match.libraryItem.id }}
									onClick={() => setSuggestions(null)}
								>
									{match.libraryItem.media.metadata.title}
								</Link>
							</li>
						),
					)}
					{suggestions.authors?.map((author) => (
						<li key={author.id}>
							<Link
								to="/author/$id"
								params={{ id: author.id }}
								onClick={() => setSuggestions(null)}
							>
								{author.name}
							</Link>
						</li>
					))}
				</ul>
			)}
		</div>
	)
}
const sortOptions = [
	['media.metadata.title', 'Title'],
	['media.metadata.authorName', 'Author first last'],
	['media.metadata.authorNameLF', 'Author last first'],
	['media.metadata.author', 'Podcast author'],
	['media.metadata.publishedYear', 'Publish year'],
	['addedAt', 'Added'],
	['size', 'Size'],
	['media.duration', 'Duration'],
	['media.numTracks', 'Audio track count'],
	['birthtimeMs', 'File birth time'],
	['mtimeMs', 'File modified'],
	['progress', 'Progress'],
	['progress.createdAt', 'Started'],
	['progress.finishedAt', 'Finished'],
	['random', 'Random'],
	['name', 'Name'],
	['numBooks', 'Book count'],
]
function applicableSorts(section: string, podcast: boolean) {
	if (section === 'authors')
		return [
			['name', 'Name'],
			['lastFirst', 'Last name first'],
			['numBooks', 'Book count'],
			['addedAt', 'Added'],
			['updatedAt', 'Updated'],
		]
	if (section === 'series')
		return [
			['name', 'Name'],
			['numBooks', 'Book count'],
			['addedAt', 'Added'],
			['totalDuration', 'Duration'],
			['lastBookAdded', 'Last book added'],
			['lastBookUpdated', 'Last book updated'],
			['random', 'Random'],
		]
	if (section) return []
	return sortOptions
		.filter(([value]) =>
			podcast
				? [
						'media.metadata.title',
						'media.metadata.author',
						'addedAt',
						'size',
						'media.numTracks',
						'birthtimeMs',
						'mtimeMs',
						'random',
					].includes(value)
				: ![
						'media.metadata.author',
						'media.numTracks',
						'name',
						'numBooks',
					].includes(value),
		)
		.map(([value, label]) => [
			value,
			podcast && value === 'media.numTracks' ? 'Episode count' : label,
		])
}
export function BrowsePage({
	library,
	section,
	search,
	data,
	filters,
	podcast,
}: {
	library: string
	section: string
	search: BrowseSearch
	data: Awaited<ReturnType<typeof loadBrowse>>
	filters: Awaited<ReturnType<typeof loadFilters>>
	podcast: boolean
}) {
	useCatalogRefresh()
	const coverSize = useCoverSize()
	const sorts = applicableSorts(section, podcast)
	const itemView = !section
	const seriesView = section === 'series'
	const view = itemView ? search.view : 'grid'
	useShelfPosition(`${library}/${section}/${JSON.stringify(search)}`)
	useEffect(() => {
		persistSearch(search, section)
	}, [search, section])
	useEffect(() => {
		localStorage.setItem('currentLibraryId', library)
	}, [library])
	const navigate = useNavigate()
	const router = useRouter()
	const [selected, setSelected] = useState<string[]>([])
	const [selectMode, setSelectMode] = useState(false)
	const [actionsOpen, setActionsOpen] = useState(false)
	const [error, setError] = useState('')
	const [pending, setPending] = useState(false)
	const [collections, setCollections] = useState<Entry[]>([])
	const [progressStatus, setProgressStatus] = useState('')
	const progressCancel = useRef<(() => void) | null>(null)
	useEffect(() => () => progressCancel.current?.(), [])
	const runProgress = async (isFinished: boolean) => {
		const owner = useAuth.getState().user?.id
		if (!owner) return
		let active = true
		progressCancel.current = () => {
			active = false
		}
		const generation = getAuthGeneration()
		setPending(true)
		setError('')
		setProgressStatus('')
		window.dispatchEvent(
			new CustomEvent('abs:progress-batch', {
				detail: { active: true, owner },
			}),
		)
		try {
			const result = await updateSelectedProgress(
				selected,
				podcast,
				isFinished,
				{
					owner,
					generation,
					isActive: () => active,
					onProgress: (written, skipped, remaining) => {
						if (
							!active ||
							useAuth.getState().user?.id !== owner ||
							getAuthGeneration() !== generation
						)
							return
						setProgressStatus(
							`${written} written · ${skipped} skipped · ${remaining} remaining`,
						)
					},
				},
			)
			if (
				useAuth.getState().user?.id !== owner ||
				getAuthGeneration() !== generation
			)
				return
			setProgressStatus(
				`${result.written} written · ${result.failed} failed · ${result.skipped} skipped · ${result.remaining} remaining${result.cancelled ? ' · Cancelled' : ''}${result.refreshWarning ? ` · ${result.refreshWarning}` : ''}`,
			)
			if (
				useAuth.getState().user?.id !== owner ||
				getAuthGeneration() !== generation
			)
				return
			if (result.error) setError(result.error)
			if (active && !result.failed && result.remaining === 0) {
				setSelected([])
				setActionsOpen(false)
			}
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : 'Progress update failed',
			)
			if (
				useAuth.getState().user?.id === owner &&
				getAuthGeneration() === generation
			)
				setProgressStatus(`Progress operation stopped · selection retained`)
		} finally {
			window.dispatchEvent(
				new CustomEvent('abs:progress-batch', {
					detail: { active: false, owner },
				}),
			)
			progressCancel.current = null
			setPending(false)
		}
	}
	useEffect(() => {
		if (!selected.length || podcast) return
		let active = true
		void loadBrowse(library, 'collections', browseSearch.parse({}))
			.then((result) => {
				if (active) setCollections(result.results)
			})
			.catch((cause: unknown) => {
				if (active)
					setError(
						cause instanceof Error
							? cause.message
							: 'Could not load collections',
					)
			})
		return () => {
			active = false
		}
	}, [library, selected.length, podcast])
	const user = useAuth((s) => s.user)
	const canUpdate = z
		.object({
			permissions: z
				.object({
					update: z.boolean().optional(),
					delete: z.boolean().optional(),
					download: z.boolean().optional(),
				})
				.optional(),
			type: z.string().optional(),
		})
		.safeParse(user)
	const allowed =
		canUpdate.success &&
		(canUpdate.data.permissions?.update ||
			['root', 'admin'].includes(canUpdate.data.type || ''))
	const admin =
		canUpdate.success && ['root', 'admin'].includes(canUpdate.data.type || '')
	const canDelete =
		admin || (canUpdate.success && canUpdate.data.permissions?.delete)
	useEffect(() => {
		setSelected((ids) =>
			ids.filter((id) => data.results.some((item) => item.id === id)),
		)
	}, [data])
	const update = (patch: Partial<BrowseSearch>) =>
		void navigate({
			to: section
				? '/library/$library/bookshelf/$id'
				: '/library/$library/bookshelf',
			params: { library, id: section },
			search: { ...search, page: 0, ...patch },
		})
	useEffect(() => {
		if (!selected.length) setActionsOpen(false)
	}, [selected.length])
	const run = async (action: () => Promise<unknown>) => {
		setError('')
		setPending(true)
		try {
			await action()
			setSelected([])
			setActionsOpen(false)
			await router.invalidate()
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Action failed')
		} finally {
			setPending(false)
		}
	}
	return (
		<section className="space-y-5">
			<CatalogHeading title={section ? humanLabel(section) : 'Library'} />
			{progressStatus && <p role="status">{progressStatus}</p>}

			<div className="flex flex-wrap items-center gap-2">
				{(sorts.length > 0 || itemView || seriesView) && (
					<Sheet>
						<SheetTrigger asChild>
							<Button variant="outline" size="sm">
								<SlidersHorizontal aria-hidden="true" />
								View options
							</Button>
						</SheetTrigger>
						<SheetContent className="w-full overflow-y-auto p-4 sm:max-w-md">
							<SheetHeader>
								<SheetTitle>View options</SheetTitle>
								<SheetDescription>
									Sort, filter and display this library.
								</SheetDescription>
							</SheetHeader>
							<div className="grid gap-4 py-4 text-sm [&_label]:min-w-0 [&_label]:space-y-1 [&_select]:w-full">
								{sorts.length > 0 && (
									<>
										{' '}
										<label htmlFor="catalog-sort">
											Sort
											<NativeSelect
												id="catalog-sort"
												className="block"
												value={search.sort}
												onChange={(e) => update({ sort: e.target.value })}
											>
												{!sorts.some(([value]) => value === search.sort) && (
													<option disabled value={search.sort}>
														Current sort:{' '}
														{sortOptions.find(
															([value]) => value === search.sort,
														)?.[1] || humanLabel(search.sort)}
													</option>
												)}
												{sorts.map(([value, name]) => (
													<option key={value} value={value}>
														{name}
													</option>
												))}
											</NativeSelect>
										</label>
										<label htmlFor="catalog-order">
											Order
											<NativeSelect
												id="catalog-order"
												className="block"
												value={search.desc}
												onChange={(e) => update({ desc: e.target.value })}
											>
												<option value="0">Ascending</option>
												<option value="1">Descending</option>
											</NativeSelect>
										</label>
									</>
								)}
								{(itemView || seriesView) && (
									<label htmlFor="catalog-filter">
										Filter
										<NativeSelect
											id="catalog-filter"
											className="max-w-64"
											value={search.filter}
											onChange={(e) => update({ filter: e.target.value })}
										>
											<option value="all">All</option>
											{!podcast &&
												[
													'finished',
													'not-finished',
													'in-progress',
													'not-started',
												].map((v) => (
													<option key={v} value={`progress.${encodeFilter(v)}`}>
														{humanLabel(v)}
													</option>
												))}
											{itemView && <option value="issues">Issues</option>}
											{(seriesView
												? []
												: podcast
													? ['feed-open', 'explicit']
													: ['feed-open', 'share-open', 'abridged', 'explicit']
											).map((value) => (
												<option key={value} value={value}>
													{humanLabel(value)}
												</option>
											))}
											{Object.entries(
												podcast || seriesView
													? {}
													: {
															tracks: ['none', 'single', 'multi'],
															ebooks: [
																'ebook',
																'no-ebook',
																'supplementary',
																'no-supplementary',
															],
															missing: [
																'asin',
																'isbn',
																'authors',
																'chapters',
																'cover',
																'description',
																'genres',
																'language',
																'narrators',
																'publishedYear',
																'publisher',
																'series',
																'subtitle',
																'tags',
															],
														},
											).map(([group, values]) => (
												<optgroup key={group} label={humanLabel(group)}>
													{values.map((value) => (
														<option
															key={value}
															value={`${group}.${encodeFilter(value)}`}
														>
															{humanLabel(value)}
														</option>
													))}
												</optgroup>
											))}
											{Object.entries(filters)
												.filter(
													([group, value]) =>
														Array.isArray(value) &&
														(podcast
															? ['genres', 'tags', 'languages'].includes(group)
															: seriesView
																? [
																		'genres',
																		'tags',
																		'authors',
																		'narrators',
																		'publishers',
																		'languages',
																	].includes(group)
																: true),
												)
												.map(([group, values]) => (
													<optgroup key={group} label={humanLabel(group)}>
														{(
															values as (
																| string
																| { id: string; name: string }
															)[]
														).map((value) => {
															const label =
																typeof value === 'string' ? value : value.name
															const id =
																typeof value === 'string' ? value : value.id
															return (
																<option
																	key={id}
																	value={`${group}.${encodeFilter(id)}`}
																>
																	{label}
																</option>
															)
														})}
													</optgroup>
												))}
											<option hidden disabled value={search.filter}>
												Current filter: {currentFilterLabel(search.filter)}
											</option>
										</NativeSelect>
									</label>
								)}
								{itemView && (
									<>
										{' '}
										{view === 'grid' && (
											<label>
												Cover size
												<input
													className="block"
													type="range"
													min={60}
													max={220}
													step={20}
													value={coverSize.size}
													onChange={(event) =>
														coverSize.setSize(Number(event.target.value))
													}
												/>
											</label>
										)}
										<label htmlFor="catalog-view">
											View
											<NativeSelect
												id="catalog-view"
												className="block"
												value={search.view}
												onChange={(e) =>
													update({
														view: e.target.value as BrowseSearch['view'],
													})
												}
											>
												<option value="grid">Grid</option>
												<option value="list">List</option>
												<option value="detail">Detailed</option>
											</NativeSelect>
										</label>
										{!podcast && (
											<label className="self-center">
												<input
													type="checkbox"
													checked={search.collapse === '1'}
													onChange={(e) =>
														update({ collapse: e.target.checked ? '1' : '0' })
													}
												/>{' '}
												Group series
											</label>
										)}{' '}
									</>
								)}
							</div>
						</SheetContent>
					</Sheet>
				)}
				{!section && (
					<div className="flex flex-wrap items-center gap-2">
						{!selectMode ? (
							<Button
								size="sm"
								variant="outline"
								onClick={() => setSelectMode(true)}
							>
								Select
							</Button>
						) : (
							<>
								<Button
									variant="outline"
									onClick={() => {
										progressCancel.current?.()
										setActionsOpen(false)
										setSelectMode(false)
										setSelected([])
									}}
								>
									Done
								</Button>
								<Button
									variant="outline"
									onClick={() =>
										setSelected(
											data.results
												.filter((entry) => 'media' in entry)
												.map((entry) => entry.id),
										)
									}
								>
									Select page
								</Button>
								<Button variant="outline" onClick={() => setSelected([])}>
									Clear selection ({selected.length})
								</Button>
								<span role="status" aria-live="polite">
									{selected.length} selected
								</span>
							</>
						)}
						{selectMode && selected.length > 0 && (
							<WorkflowSheet
								title="More actions"
								description={`${selected.length} selected items`}
								open={actionsOpen}
								onOpenChange={setActionsOpen}
							>
								<div className="space-y-3">
									<Button
										disabled={pending}
										onClick={() => void runProgress(true)}
									>
										{podcast ? 'Mark all episodes finished' : 'Mark finished'}
									</Button>
									<Button
										disabled={pending}
										onClick={() => void runProgress(false)}
									>
										{podcast
											? 'Mark all episodes unfinished'
											: 'Mark unfinished'}
									</Button>
									{pending && (
										<Button
											variant="outline"
											onClick={() => progressCancel.current?.()}
										>
											Cancel
										</Button>
									)}

									{!podcast && (
										<Button
											disabled={pending}
											onClick={() =>
												void run(() =>
													playQueue(
														selected.map((libraryItemId) => ({
															libraryItemId,
														})),
													),
												)
											}
										>
											Play selected
										</Button>
									)}
									{allowed && (
										<Link to="/batch" search={{ ids: selected.join(',') }}>
											Batch edit
										</Link>
									)}
									<SelectionTools
										library={library}
										ids={selected}
										podcast={podcast}
										pending={pending}
										run={run}
									/>
								</div>

								{admin &&
									['scan'].map((action) => (
										<Button
											key={action}
											disabled={pending}
											onClick={() => {
												if (
													window.confirm(
														`${action === 'scan' ? 'Rescan' : 'Quick match'} ${selected.length} selected items?`,
													)
												)
													void run(() =>
														api(`/api/items/batch/${action}`, z.unknown(), {
															method: 'POST',
															body: JSON.stringify({
																libraryItemIds: selected,
															}),
														}),
													)
											}}
										>
											{action === 'scan' ? 'Rescan' : 'Quick match'}
										</Button>
									))}
								{admin && !podcast && (
									<Button
										disabled={pending}
										onClick={() => {
											if (
												window.confirm(
													'Embed metadata in selected audio files? This changes media files.',
												)
											)
												void run(() =>
													api('/api/tools/batch/embed-metadata', z.unknown(), {
														method: 'POST',
														body: JSON.stringify({ libraryItemIds: selected }),
													}),
												)
										}}
									>
										Embed metadata
									</Button>
								)}
								{allowed && !podcast && (
									<form
										className="flex gap-2"
										onSubmit={(event) => {
											event.preventDefault()
											const id = new FormData(event.currentTarget).get(
												'collection',
											)
											if (typeof id === 'string' && id)
												void run(() =>
													api(
														`/api/collections/${encodeURIComponent(id)}/batch/add`,
														z.unknown(),
														{
															method: 'POST',
															body: JSON.stringify({ books: selected }),
														},
													),
												)
										}}
									>
										<label htmlFor="catalog-collection">
											Collection
											<NativeSelect
												id="catalog-collection"
												name="collection"
												required
												className="block"
											>
												<option value="">Choose collection</option>
												{collections.map((entry) => (
													<option key={entry.id} value={entry.id}>
														{typeof entry.name === 'string'
															? entry.name
															: entry.id}
													</option>
												))}
											</NativeSelect>
										</label>
										<Button type="submit" disabled={pending}>
											Add selected to collection
										</Button>
									</form>
								)}
							</WorkflowSheet>
						)}
					</div>
				)}
			</div>
			{['collections', 'playlists'].includes(section) && (
				<form
					className="flex flex-wrap gap-2"
					onSubmit={(e) => {
						e.preventDefault()
						const name = new FormData(e.currentTarget).get('name')
						if (typeof name === 'string' && name.trim())
							void run(() =>
								api(
									`/api/${section}`,
									z.object({ id: z.string() }).passthrough(),
									{
										method: 'POST',
										body: JSON.stringify({
											libraryId: library,
											name: name.trim(),
											description: '',
											[section === 'collections' ? 'books' : 'items']: [],
										}),
									},
								),
							)
					}}
				>
					<label htmlFor="catalog-new-name">
						New {section === 'collections' ? 'collection' : 'playlist'}
						<Input
							id="catalog-new-name"
							name="name"
							required
							maxLength={255}
							className="block rounded border bg-background p-2"
						/>
					</label>
					<Button
						type="submit"
						disabled={pending || (section === 'collections' && !allowed)}
					>
						Create
					</Button>
				</form>
			)}
			<p>
				{data.total.toLocaleString()} items · Page {search.page + 1}
			</p>
			{error && <p role="alert">{error}</p>}
			{search.filter === 'issues' && canDelete && data.total > 0 && (
				<Button
					variant="destructive"
					disabled={pending}
					onClick={() => {
						if (
							window.confirm(
								`Remove all ${data.total} items with missing or invalid files from library?`,
							)
						)
							void run(() =>
								api(
									`/api/libraries/${encodeURIComponent(library)}/issues`,
									z.unknown(),
									{ method: 'DELETE' },
								),
							)
					}}
				>
					Remove all items with issues
				</Button>
			)}

			<div
				className={view === 'grid' ? 'grid gap-4' : 'space-y-3'}
				style={
					view === 'grid'
						? {
								gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${coverSize.size}px), 1fr))`,
							}
						: undefined
				}
			>
				{data.results.map((entry) => (
					<EntryCard
						key={entry.id}
						library={library}
						entry={{ ...entry, _type: section }}
						view={view}
						select={
							selectMode && !section && 'media' in entry
								? {
										checked: selected.includes(entry.id),
										toggle: () =>
											setSelected((ids) =>
												ids.includes(entry.id)
													? ids.filter((id) => id !== entry.id)
													: [...ids, entry.id],
											),
									}
								: undefined
						}
					/>
				))}
			</div>
			{!data.results.length && (
				<div className="space-y-3">
					<p>
						{search.filter === 'all'
							? `No ${section || 'items'} in this library.`
							: 'No items match this filter.'}
					</p>
					{search.filter !== 'all' && (
						<Button variant="outline" onClick={() => update({ filter: 'all' })}>
							Clear filter
						</Button>
					)}
					{admin && (
						<>
							<Button
								disabled={pending}
								onClick={() => {
									if (window.confirm('Scan library for media files?'))
										void run(() =>
											api(
												`/api/libraries/${encodeURIComponent(library)}/scan`,
												z.unknown(),
												{ method: 'POST' },
											),
										)
								}}
							>
								Scan library
							</Button>
							<Link to="/config/libraries">Configure libraries</Link>
						</>
					)}
				</div>
			)}
			<nav aria-label="Pagination" className="flex gap-4">
				<Button
					variant="outline"
					disabled={search.page === 0}
					onClick={() => update({ page: search.page - 1 })}
				>
					Previous
				</Button>
				<Button
					variant="outline"
					disabled={(search.page + 1) * 48 >= data.total}
					onClick={() => update({ page: search.page + 1 })}
				>
					Next
				</Button>
			</nav>
		</section>
	)
}
export function SearchPage({
	library,
	q,
	data,
}: {
	library: string
	q: string
	data: Awaited<ReturnType<typeof searchLibrary>>
}) {
	useCatalogRefresh()
	const count = Object.values(data).reduce(
		(total, values) => total + (values?.length ?? 0),
		0,
	)
	return (
		<section className="space-y-5">
			<CatalogHeading title="Search" />
			<p className="text-sm text-muted-foreground">Results for “{q}”</p>
			{count === 0 && <p>No search results.</p>}

			{(['book', 'podcast'] as const).map((type) => (
				<section key={type}>
					<h2 className="text-xl">{type === 'book' ? 'Books' : 'Podcasts'}</h2>
					<div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,140px),1fr))] gap-4 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
						{data[type]?.map((match) => (
							<EntryCard
								key={match.libraryItem.id}
								library={library}
								entry={match.libraryItem}
								headingLevel={3}
							/>
						))}
					</div>
				</section>
			))}
			<section>
				<h2 className="text-xl">Episodes</h2>
				{data.episodes?.map((match) => (
					<div key={`${match.libraryItem.id}-${match.episode?.id ?? ''}`}>
						<EntryCard
							library={library}
							headingLevel={3}
							view="list"
							entry={{
								...match.libraryItem,
								_type: 'episode',
								recentEpisode: match.episode,
							}}
						/>
						{match.episode && (
							<Button
								onClick={() =>
									void playEpisode(match.libraryItem.id, match.episode?.id)
								}
							>
								Play episode
							</Button>
						)}
					</div>
				))}
			</section>
			{(['authors', 'series'] as const).map((type) => (
				<section key={type}>
					<h2 className="text-xl">{humanLabel(type)}</h2>
					{data[type]?.map((entry) => (
						<EntryCard
							key={entry.id}
							library={library}
							entry={{ ...entry, _type: type }}
							headingLevel={3}
						/>
					))}
				</section>
			))}
			{(['tags', 'narrators', 'genres'] as const).map((type) => (
				<section key={type}>
					<h2 className="text-xl">{humanLabel(type)}</h2>
					{data[type]?.map(({ name: value, numItems, numBooks }) => (
						<Link
							key={value}
							className="mr-4 underline"
							to="/library/$library/bookshelf"
							params={{ library }}
							search={{ filter: `${type}.${encodeFilter(value)}` }}
						>
							{value} ({numItems ?? numBooks ?? 0})
						</Link>
					))}
				</section>
			))}
		</section>
	)
}
export function NarratorsPage({
	library,
	data,
}: {
	library: string
	data: Awaited<ReturnType<typeof loadNarrators>>
}) {
	const router = useRouter()
	const user = useAuth((s) => s.user)
	const permissions = z
		.object({
			type: z.string().optional(),
			permissions: z
				.object({
					update: z.boolean().optional(),
					delete: z.boolean().optional(),
					download: z.boolean().optional(),
				})
				.optional(),
		})
		.safeParse(user)
	const allowed =
		permissions.success &&
		(permissions.data.permissions?.update ||
			['root', 'admin'].includes(permissions.data.type || ''))
	const [editing, setEditing] = useState('')
	const [name, setName] = useState('')
	const [pending, setPending] = useState(false)
	const [error, setError] = useState('')
	async function save(id: string, value?: string) {
		setPending(true)
		setError('')
		try {
			await saveNarrator(library, id, value)
			setEditing('')
			await router.invalidate()
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Update failed')
		} finally {
			setPending(false)
		}
	}
	return (
		<section className="space-y-5">
			<CatalogHeading title="Narrators" />
			{error && <p role="alert">{error}</p>}
			<table className="w-full">
				<thead>
					<tr>
						<th className="text-left">Name</th>
						<th>Books</th>
						{allowed && <th>Actions</th>}
					</tr>
				</thead>
				<tbody>
					{data.narrators.map((n) => (
						<tr key={n.id}>
							<td>
								{editing === n.id ? (
									<form
										onSubmit={(e) => {
											e.preventDefault()
											void save(n.id, name)
										}}
									>
										<label>
											New narrator name
											<input
												required
												className="border bg-background p-2"
												value={name}
												onChange={(e) => setName(e.target.value)}
											/>
										</label>
										<Button disabled={pending} type="submit">
											Save
										</Button>
										<Button variant="outline" onClick={() => setEditing('')}>
											Cancel
										</Button>
									</form>
								) : (
									<Link
										to="/library/$library/bookshelf"
										params={{ library }}
										search={{ filter: `narrators.${n.id}` }}
									>
										{n.name}
									</Link>
								)}
							</td>
							<td className="text-center">{n.numBooks}</td>
							{allowed && (
								<td className="text-right">
									<Button
										disabled={pending}
										variant="outline"
										onClick={() => {
											setEditing(n.id)
											setName(n.name)
										}}
									>
										Edit {n.name}
									</Button>
									<Button
										disabled={pending}
										variant="outline"
										onClick={() => {
											if (
												window.confirm(
													`Remove narrator “${n.name}” from all books?`,
												)
											)
												void save(n.id)
										}}
									>
										Remove {n.name}
									</Button>
								</td>
							)}
						</tr>
					))}
				</tbody>
			</table>
		</section>
	)
}
export function StatsPage({
	library,
	data,
}: {
	library: string
	data: Awaited<ReturnType<typeof loadStats>>
}) {
	return (
		<section className="space-y-6">
			<CatalogHeading title="Library statistics" />
			<dl className="grid grid-cols-2 gap-3">
				{[
					['Items', data.totalItems],
					['Authors', data.totalAuthors ?? 0],
					['Genres', data.totalGenres],
					['Audio tracks', data.numAudioTracks],
					['Size (MB)', (data.totalSize / 1e6).toFixed(2)],
					['Duration', duration(data.totalDuration)],
				].map(([name, value]) => (
					<div key={name}>
						<dt>{name}</dt>
						<dd className="text-2xl font-semibold">{value}</dd>
					</div>
				))}
			</dl>
			<h2 className="text-xl">Top 5 genres</h2>
			{data.genresWithCount.slice(0, 5).map((g) => (
				<div key={g.genre}>
					<Link
						to="/library/$library/bookshelf"
						params={{ library }}
						search={{ filter: `genres.${encodeFilter(g.genre)}` }}
					>
						{g.genre}
					</Link>{' '}
					— {g.count} (
					{data.totalItems ? Math.round((100 * g.count) / data.totalItems) : 0}
					%)
				</div>
			))}
			<h2 className="text-xl">Top 10 authors</h2>
			{data.authorsWithCount?.slice(0, 10).map((a) => (
				<div key={a.id}>
					<Link to="/author/$id" params={{ id: a.id }}>
						{a.name}
					</Link>{' '}
					— {a.count}
				</div>
			))}
			<h2 className="text-xl">Longest items</h2>
			{data.longestItems.map((item) => (
				<div key={item.id}>
					<Link to="/item/$id" params={{ id: item.id }}>
						{item.title}
					</Link>{' '}
					—{' '}
					{item.duration === null
						? 'Duration unavailable'
						: duration(item.duration)}
				</div>
			))}
			<h2 className="text-xl">Largest items</h2>
			{data.largestItems.map((item) => (
				<div key={item.id}>
					<Link to="/item/$id" params={{ id: item.id }}>
						{item.title}
					</Link>{' '}
					— {(item.size / 1e6).toFixed(2)} MB
				</div>
			))}
		</section>
	)
}
export function SeriesPage({
	library,
	data,
}: {
	library: string
	data: Awaited<ReturnType<typeof loadSeries>>
}) {
	useCatalogRefresh()
	const [pending, setPending] = useState(false)
	const [error, setError] = useState('')
	const user = useAuth((state) => state.user)
	const admin = user?.type === 'root' || user?.type === 'admin'
	const router = useRouter()
	async function readd() {
		setPending(true)
		setError('')
		try {
			await api(
				`/api/me/series/${encodeURIComponent(data.id)}/readd-to-continue-listening`,
				z.unknown(),
			)
			await router.invalidate()
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Update failed')
		} finally {
			setPending(false)
		}
	}
	async function feedAction(body?: {
		slug: string
		serverAddress: string
		metadataDetails: { preventIndexing: boolean }
	}) {
		setPending(true)
		setError('')
		try {
			await api(
				body
					? `/api/feeds/series/${encodeURIComponent(data.id)}/open`
					: `/api/feeds/${encodeURIComponent(data.rssFeed?.id || '')}/close`,
				z.unknown(),
				{ method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) },
			)
			await router.invalidate()
		} catch (e) {
			setError(e instanceof Error ? e.message : 'RSS action failed')
		} finally {
			setPending(false)
		}
	}
	async function mark(isFinished: boolean) {
		if (
			!window.confirm(
				`Mark all books in this series ${isFinished ? 'finished' : 'unfinished'}?`,
			)
		)
			return
		setPending(true)
		setError('')
		try {
			await api('/api/me/progress/batch/update', z.unknown(), {
				method: 'PATCH',
				body: JSON.stringify(
					(data.books || data.libraryItems || []).map((item) => ({
						libraryItemId: item.id,
						isFinished,
					})),
				),
			})
			await router.invalidate()
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Update failed')
		} finally {
			setPending(false)
		}
	}
	return (
		<section className="space-y-5">
			<CatalogHeading title={data.name || 'Series'} />
			<p>{data.description}</p>
			<p>
				{data.progress?.libraryItemIdsFinished.length ?? 0} /{' '}
				{data.books.length} finished ·{' '}
				{data.progress?.isFinished ? 'Finished' : 'Unfinished'}
			</p>
			{data.rssFeed && (
				<p>RSS feed: {data.rssFeed.feedUrl || data.rssFeed.slug}</p>
			)}
			{admin &&
				(data.rssFeed ? (
					<Button
						disabled={pending}
						variant="outline"
						onClick={() => {
							if (
								window.confirm(
									'Close RSS feed? Existing subscribers lose access.',
								)
							)
								void feedAction()
						}}
					>
						Close RSS feed
					</Button>
				) : (
					<form
						className="flex flex-wrap gap-3"
						onSubmit={(event) => {
							event.preventDefault()
							const form = new FormData(event.currentTarget)
							void feedAction({
								slug: String(form.get('slug')),
								serverAddress: String(form.get('serverAddress')),
								metadataDetails: {
									preventIndexing: form.get('preventIndexing') === 'on',
								},
							})
						}}
					>
						<label>
							RSS slug
							<input
								name="slug"
								pattern="[A-Za-z0-9_-]+"
								required
								className="block"
							/>
						</label>
						<label>
							Server address
							<input
								name="serverAddress"
								type="url"
								required
								defaultValue={`${window.location.origin}${window.__ABS_WEB_CONFIG__?.apiBasePath || ''}`}
								className="block"
							/>
						</label>
						<label>
							<input name="preventIndexing" type="checkbox" defaultChecked />
							Prevent indexing
						</label>
						<Button disabled={pending} type="submit">
							Open RSS feed
						</Button>
					</form>
				))}
			{error && <p role="alert">{error}</p>}
			<div className="flex flex-wrap gap-3">
				<Button disabled={pending} onClick={() => void readd()}>
					Re-add series to continue listening
				</Button>
				<Button disabled={pending} onClick={() => void mark(true)}>
					Mark series finished
				</Button>
				<Button disabled={pending} onClick={() => void mark(false)}>
					Mark series unfinished
				</Button>
			</div>
			<div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,140px),1fr))] gap-4 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
				{(data.books || data.libraryItems || []).map((item) => (
					<EntryCard key={item.id} library={library} entry={item} />
				))}
			</div>
		</section>
	)
}
