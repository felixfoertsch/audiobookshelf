import { Link } from '@tanstack/react-router'
import {
	Check,
	Circle,
	Ellipsis,
	Play,
	Settings2,
	SlidersHorizontal,
} from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../api'
import { duration } from '../../catalog'
import {
	enqueueEpisode,
	playEpisode,
	seekPlayback,
	usePlayer,
} from '../../player'
import { RichText } from '../../shared/components/RichText'
import { Button } from '../../shared/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '../../shared/components/ui/dropdown-menu'
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '../../shared/components/ui/sheet'
import { PodcastManagementSettings } from '../podcast'
import { Reader, readerItemSchema } from '../reader'
import { EpisodeEdit } from './EpisodeEdit'
import { ItemActions } from './ItemActions'
import { episodeProgress, refreshProgress } from './progress'
import type { Item } from './schemas'
import {
	checkPodcastFeed,
	deleteEpisode,
	getItem,
	updateProgress,
} from './service'

function DetailSheet({
	title,
	description,
	children,
}: {
	title: string
	description: string
	children: ReactNode
}) {
	return (
		<Sheet>
			<SheetTrigger asChild>
				<Button
					variant="outline"
					size="icon"
					className="rounded-full"
					aria-label={title}
				>
					{title === 'Podcast settings' ? (
						<Settings2 aria-hidden="true" />
					) : (
						<SlidersHorizontal aria-hidden="true" />
					)}
				</Button>
			</SheetTrigger>
			<SheetContent className="w-full overflow-y-auto p-4 sm:max-w-2xl">
				<SheetHeader>
					<SheetTitle>{title}</SheetTitle>
					<SheetDescription>{description}</SheetDescription>
				</SheetHeader>
				{children}
			</SheetContent>
		</Sheet>
	)
}

export function ItemView({ id }: { id: string }) {
	const user = useAuth((state) => state.user)
	const admin = user?.type === 'root' || user?.type === 'admin'
	const canDownload = !!(
		user?.permissions as { download?: boolean } | undefined
	)?.download
	const [item, setItem] = useState<Item | null>(null)
	const [error, setError] = useState('')
	const [warning, setWarning] = useState('')
	const [progressError, setProgressError] = useState('')
	const [progressUnavailable, setProgressUnavailable] = useState(false)
	const [busy, setBusy] = useState(false)
	const [hardDeleteEpisode, setHardDeleteEpisode] = useState(false)
	const episodeDrafts = useRef(new Map<string, Record<string, string>>())
	const [page, setPage] = useState(0)
	const [descriptionOpen, setDescriptionOpen] = useState(false)
	const [expanded, setExpanded] = useState<Set<string>>(new Set())
	const request = useRef(0)
	const owner = useRef(user?.id)
	owner.current = user?.id
	const [episodeBusy, setEpisodeBusy] = useState<string | null>(null)
	const bookProgress = episodeProgress(user, id) ?? item?.userMediaProgress
	const progress = bookProgress?.isFinished ?? false
	const [reader, setReader] = useState<{
		fileId?: string
		keepProgress: boolean
	} | null>(null)
	const canUpdate = !!(
		user as (typeof user & { permissions?: { update?: boolean } }) | null
	)?.permissions?.update
	useEffect(() => {
		const userId = user?.id
		let active = true
		setItem(null)
		setReader(null)
		episodeDrafts.current.clear()
		setPage(0)
		setExpanded(new Set())
		setDescriptionOpen(false)
		setError('')
		setWarning('')
		setProgressUnavailable(!!userId)
		setProgressError('')
		const reload = () => {
			const sequence = ++request.current
			void getItem(id)
				.then((value) => {
					if (
						active &&
						owner.current === userId &&
						sequence === request.current
					)
						setItem(value)
				})
				.catch((error: unknown) => {
					if (active && sequence === request.current)
						setError(
							error instanceof Error ? error.message : 'Item update failed',
						)
				})
		}
		const reloadProgress = async () => {
			try {
				await refreshProgress()
				if (active && owner.current === userId) {
					setProgressUnavailable(false)
					setProgressError('')
					setWarning('')
				}
			} catch (error) {
				if (active && owner.current === userId) {
					setProgressUnavailable(true)
					setProgressError(
						error instanceof Error ? error.message : 'Progress update failed',
					)
				}
			}
		}
		const receive = (event: Event) => {
			if (!(event instanceof CustomEvent)) return
			const detail = event.detail as {
				event?: unknown
				payload?: { id?: unknown }
			} | null
			if (detail?.event === 'item_updated' && detail.payload?.id === id)
				reload()
			if (detail?.event === 'init' || detail?.event === 'reconnect')
				void reloadProgress()
		}
		window.addEventListener('abs:socket', receive)
		if (userId) void reloadProgress()
		reload()
		return () => {
			active = false
			request.current++
			window.removeEventListener('abs:socket', receive)
		}
	}, [id, user?.id])
	if (!item)
		return (
			<section aria-busy="true">
				{error ? <p role="alert">{error}</p> : <p>Loading item…</p>}
			</section>
		)
	const media = item.media
	const metadata = media.metadata
	const episodes = media.episodes ?? []
	const latestEpisode = episodes.reduce<(typeof episodes)[number] | undefined>(
		(latest, episode) =>
			!latest || (episode.publishedAt ?? 0) > (latest.publishedAt ?? 0)
				? episode
				: latest,
		undefined,
	)
	const episodePage = Math.min(
		page,
		Math.max(0, Math.ceil(episodes.length / 25) - 1),
	)
	async function action(run: () => Promise<unknown>) {
		const userId = user?.id
		const sequence = ++request.current
		setBusy(true)
		setError('')
		try {
			const result = await run()
			if (owner.current === userId && result && typeof result === 'object')
				setWarning(
					'refreshWarning' in result ? String(result.refreshWarning || '') : '',
				)
			const value = await getItem(id)
			if (owner.current === userId && sequence === request.current)
				setItem(value)
		} catch (e) {
			if (owner.current === userId && sequence === request.current)
				setError(e instanceof Error ? e.message : 'Action failed')
		} finally {
			if (owner.current === userId) setBusy(false)
		}
	}
	async function finishEpisode(episodeId: string, isFinished: boolean) {
		const userId = user?.id
		setEpisodeBusy(episodeId)
		setError('')
		try {
			const result = await updateProgress(id, { isFinished }, episodeId)
			if (owner.current === userId) setWarning(result?.refreshWarning || '')
		} catch (error) {
			if (owner.current === userId)
				setError(
					error instanceof Error ? error.message : 'Progress update failed',
				)
		} finally {
			if (owner.current === userId) setEpisodeBusy(null)
		}
	}
	async function play(episodeId?: string) {
		try {
			await playEpisode(id, episodeId)
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Playback failed')
		}
	}
	return (
		<article className="mx-auto min-w-0 max-w-5xl space-y-6 p-4 [overflow-wrap:anywhere]">
			{reader && (
				<Reader
					item={readerItemSchema.parse({
						...item,
						media: {
							...item.media,
							metadata: {
								...item.media.metadata,
								title: item.media.metadata.title || '',
								authorName: item.media.metadata.authorName || '',
							},
						},
					})}
					fileId={reader.fileId}
					keepProgress={reader.keepProgress}
					onClose={() => setReader(null)}
				/>
			)}

			<header className="flex flex-col gap-6 sm:flex-row sm:gap-8">
				{media.coverPath && (
					<img
						className="aspect-square w-60 max-w-full self-center rounded-xl object-cover shadow-sm sm:w-72 sm:self-start"
						src={`${window.__ABS_WEB_CONFIG__?.apiBasePath || ''}/api/items/${encodeURIComponent(id)}/cover`}
						alt={`${metadata.title ?? 'Item'} cover`}
					/>
				)}
				<div className="min-w-0 flex-1 space-y-3">
					<p className="text-sm text-muted-foreground">
						{item.mediaType === 'book' ? 'Audiobook' : 'Podcast'}
					</p>
					<h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
						{metadata.title ?? 'Untitled'}
					</h1>
					{metadata.subtitle && <p className="text-xl">{metadata.subtitle}</p>}
					<p>
						{metadata.author ??
							metadata.authorName ??
							metadata.authors?.map((a) => a.name).join(', ') ??
							''}
					</p>
					{metadata.narrators?.length ? (
						<p>Narrated by {metadata.narrators.join(', ')}</p>
					) : null}
					{metadata.series?.map((s) => (
						<p key={s.id}>
							Series: {s.name}
							{s.sequence ? ` #${s.sequence}` : ''}
						</p>
					))}
					{(!!metadata.genres?.length || item.mediaType === 'podcast') && (
						<p className="text-sm text-muted-foreground">
							{[
								...(metadata.genres ?? []),
								...(item.mediaType === 'podcast'
									? [
											media.episodes
												? `${episodes.length} episodes`
												: 'Episode count unavailable',
										]
									: []),
							].join(' · ')}
						</p>
					)}
					{media.duration != null && <p>Duration {duration(media.duration)}</p>}
					{item.mediaType === 'book' && !media.numAudioFiles && (
						<p id="audio-unavailable">Audio unavailable</p>
					)}
					{metadata.description && (
						<div>
							<RichText
								text={metadata.description}
								className={
									descriptionOpen
										? 'text-sm'
										: 'line-clamp-3 text-sm text-muted-foreground'
								}
							/>
							<Button
								variant="link"
								className="h-auto px-0"
								aria-expanded={descriptionOpen}
								onClick={() => setDescriptionOpen(!descriptionOpen)}
							>
								{descriptionOpen ? 'Less' : 'More'}
							</Button>
						</div>
					)}
					<div className="flex flex-wrap gap-2">
						{item.mediaType === 'podcast' && latestEpisode && (
							<Button
								className="rounded-full px-6"
								disabled={busy || !latestEpisode.audioFile}
								onClick={() => void play(latestEpisode.id)}
							>
								<Play aria-hidden="true" className="size-4" />
								Play latest episode
							</Button>
						)}
						{item.mediaType === 'book' && (
							<Button
								className="rounded-full px-6"
								disabled={busy || !media.numAudioFiles}
								aria-describedby={
									!media.numAudioFiles ? 'audio-unavailable' : undefined
								}
								onClick={() => void play()}
							>
								<Play aria-hidden="true" className="size-4" />
								{bookProgress?.currentTime && !progress
									? 'Resume audiobook'
									: 'Play audiobook'}
							</Button>
						)}
						{item.mediaType === 'book' && (
							<Button
								variant="outline"
								disabled={!media.numAudioFiles}
								onClick={() =>
									enqueueEpisode(id, undefined, metadata.title ?? 'Untitled')
								}
							>
								Queue
							</Button>
						)}
						{item.mediaType === 'book' && (
							<Button
								variant="outline"
								disabled={busy}
								onClick={() =>
									void action(() =>
										updateProgress(id, { isFinished: !progress }),
									)
								}
							>
								{progress ? 'Mark unfinished' : 'Mark finished'}
							</Button>
						)}
						{item.mediaType === 'podcast' && admin && (
							<PodcastManagementSettings key={`${user?.id}:${id}`} itemId={id}>
								{(content) => (
									<DetailSheet
										title="Podcast settings"
										description={metadata.title ?? 'Podcast'}
									>
										<Button
											variant="outline"
											disabled={busy}
											onClick={() => void action(() => checkPodcastFeed(id))}
										>
											Check feed
										</Button>
										{error && <p role="alert">{error}</p>}
										{content}
									</DetailSheet>
								)}
							</PodcastManagementSettings>
						)}
					</div>
				</div>
			</header>
			{item.mediaType === 'book' && (
				<nav aria-label="Audiobook actions" className="flex flex-wrap gap-4">
					{canUpdate && (
						<Link to="/audiobook/$id/chapters" params={{ id }}>
							Edit chapters
						</Link>
					)}
					{canUpdate && (
						<Link to="/audiobook/$id/edit" params={{ id }}>
							Edit tracks, metadata and cover
						</Link>
					)}
					{admin && (
						<Link to="/audiobook/$id/manage" params={{ id }}>
							Encoding and metadata embedding
						</Link>
					)}
					{media.ebookFile && (
						<Button
							variant="outline"
							onClick={() => setReader({ keepProgress: true })}
						>
							Read ebook
						</Button>
					)}
				</nav>
			)}
			{item.libraryFiles
				?.filter(
					(file) =>
						['epub', 'pdf', 'cbz', 'cbr', 'mobi', 'azw3'].includes(
							(
								file.ebookFormat ||
								file.metadata?.ext?.replace(/^\./, '') ||
								''
							).toLowerCase(),
						) && String(file.ino) !== String(media.ebookFile?.ino),
				)
				.map((file) => (
					<Button
						key={String(file.ino)}
						variant="outline"
						onClick={() =>
							setReader({ fileId: String(file.ino), keepProgress: false })
						}
					>
						Read {file.metadata?.filename || 'supplementary ebook'}
					</Button>
				))}
			{!!(warning || user?.progressWarning) && (
				<p role="status">{warning || String(user?.progressWarning || '')}</p>
			)}
			{progressError && <p role="alert">{progressError}</p>}
			{error && (
				<p role="alert" className="text-destructive">
					{error}
				</p>
			)}
			{metadata.explicit === true && <p>Explicit content</p>}
			{metadata.abridged === true && <p>Abridged</p>}
			{item.isMissing && <p role="alert">Item files missing</p>}
			{item.isInvalid && <p role="alert">Item files invalid</p>}
			{item.mediaType === 'book' && bookProgress && (
				<p>
					Progress {Math.round((bookProgress.progress || 0) * 100)}% ·{' '}
					{duration(bookProgress.currentTime || 0)} listened
				</p>
			)}
			{item.mediaType === 'podcast' && media.episodes && (
				<section className="space-y-3">
					<h2 className="text-2xl font-semibold">Episodes</h2>

					{episodes.length === 0 && <p>No downloaded episodes.</p>}
					<ol className="space-y-3">
						{episodes
							.slice(episodePage * 25, (episodePage + 1) * 25)
							.map((ep) => {
								const progress = episodeProgress(user, id, ep.id)
								const seconds = ep.duration ?? ep.audioFile?.duration
								const remaining = seconds
									? Math.max(
											0,
											seconds -
												(!progress?.isFinished
													? (progress?.currentTime ?? 0)
													: 0),
										)
									: 0
								return (
									<li key={ep.id} className="min-w-0 space-y-2 border-b py-3">
										<div className="flex flex-col items-stretch gap-3">
											<div className="min-w-0 flex-1">
												{ep.publishedAt ? (
													<p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
														{new Date(ep.publishedAt)
															.toISOString()
															.slice(0, 10)}
													</p>
												) : null}
												<h3 className="font-semibold">
													{ep.title ?? 'Untitled episode'}
												</h3>

												{ep.subtitle &&
													!ep.description
														?.replace(/<[^>]*>/g, '')
														.trim()
														.startsWith(ep.subtitle.trim()) && (
														<p className="text-sm">{ep.subtitle}</p>
													)}
												{ep.description && (
													<div>
														<RichText
															text={ep.description}
															className={
																expanded.has(ep.id)
																	? 'text-sm'
																	: 'line-clamp-2 text-sm text-muted-foreground'
															}
														/>
														<Button
															variant="link"
															aria-expanded={expanded.has(ep.id)}
															onClick={() =>
																setExpanded((current) => {
																	const next = new Set(current)
																	if (next.has(ep.id)) next.delete(ep.id)
																	else next.add(ep.id)
																	return next
																})
															}
														>
															{expanded.has(ep.id)
																? 'Read less'
																: 'Read description'}
														</Button>
													</div>
												)}
												<p className="flex items-center gap-1 text-xs text-muted-foreground">
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
															: progressUnavailable ||
																	warning ||
																	user?.progressWarning
																? 'Status unavailable'
																: 'Unplayed'}
												</p>
											</div>
											<div className="flex flex-wrap gap-2">
												<Button
													className="rounded-full"
													aria-label={`Play ${ep.title ?? 'episode'}`}
													disabled={busy || !ep.audioFile}
													title={
														!ep.audioFile
															? 'Episode audio is not downloaded'
															: busy
																? 'Starting playback'
																: undefined
													}
													onClick={() => void play(ep.id)}
												>
													<Play aria-hidden="true" className="size-3" />
													{seconds
														? `${remaining < 60 ? '<1' : Math.ceil(remaining / 60)} min${!progress?.isFinished && progress?.currentTime ? ' left' : ''}`
														: 'Play'}
												</Button>
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button
															variant="ghost"
															className="order-last ml-auto"
															size="icon"
															aria-label={`More actions for ${ep.title ?? 'episode'}`}
														>
															<Ellipsis aria-hidden="true" />
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														<DropdownMenuItem
															disabled={episodeBusy !== null}
															onSelect={() =>
																void (progress?.isFinished &&
																(progress.currentTime || 0) > 0
																	? window.confirm(
																			'Mark unfinished? This resets the saved listening position to the beginning.',
																		) && finishEpisode(ep.id, false)
																	: finishEpisode(ep.id, !progress?.isFinished))
															}
														>
															{progress?.isFinished
																? 'Mark unfinished'
																: 'Mark finished'}
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
												<DetailSheet
													title="Episode controls"
													description={ep.title ?? 'Untitled episode'}
												>
													<div className="flex flex-wrap gap-2">
														{error && <p role="alert">{error}</p>}
														<Button
															variant="outline"
															disabled={busy || !ep.audioFile}
															onClick={() =>
																enqueueEpisode(id, ep.id, ep.title ?? 'Episode')
															}
														>
															Queue
														</Button>

														<Button
															variant="outline"
															disabled={busy}
															onClick={() => {
																if (
																	window.confirm(
																		'Reset episode progress and mark unfinished?',
																	)
																)
																	void action(() =>
																		updateProgress(
																			id,
																			{ isFinished: false, currentTime: 0 },
																			ep.id,
																		),
																	)
															}}
														>
															Reset progress
														</Button>
														{canDownload && ep.audioFile?.ino && (
															<a
																className="inline-flex items-center underline"
																href={`${window.__ABS_WEB_CONFIG__?.apiBasePath || ''}/api/items/${encodeURIComponent(id)}/file/${encodeURIComponent(ep.audioFile.ino)}/download${localStorage.getItem('token') ? `?token=${encodeURIComponent(localStorage.getItem('token') || '')}` : ''}`}
																download
															>
																Download audio
															</a>
														)}
														{!!(
															user?.permissions as
																| { delete?: boolean }
																| undefined
														)?.delete && (
															<>
																<label className="flex basis-full gap-2">
																	<input
																		type="checkbox"
																		checked={hardDeleteEpisode}
																		onChange={(event) =>
																			setHardDeleteEpisode(event.target.checked)
																		}
																	/>
																	Also delete audio file from filesystem when
																	deleting an episode
																</label>
																<Button
																	variant="destructive"
																	disabled={busy}
																	onClick={() => {
																		if (
																			window.confirm(
																				`Delete episode “${ep.title ?? 'Untitled episode'}”?${hardDeleteEpisode ? ' This also permanently deletes its audio file from the filesystem.' : ' Audio file stays on the filesystem.'}`,
																			)
																		)
																			void action(() =>
																				deleteEpisode(
																					id,
																					ep.id,
																					hardDeleteEpisode,
																				),
																			)
																	}}
																>
																	Delete
																</Button>
															</>
														)}
													</div>
													{canUpdate && (
														<EpisodeEdit
															itemId={id}
															episode={ep}
															drafts={episodeDrafts.current}
															onSaved={() => void action(async () => {})}
														/>
													)}
												</DetailSheet>
											</div>
										</div>
									</li>
								)
							})}
					</ol>
					<nav
						aria-label="Episode pages"
						className="flex flex-wrap items-center gap-3"
					>
						<Button
							variant="outline"
							disabled={episodePage === 0}
							onClick={() => setPage(episodePage - 1)}
						>
							Previous episodes
						</Button>
						<p role="status">
							{episodes.length
								? `${episodePage * 25 + 1}–${Math.min((episodePage + 1) * 25, episodes.length)} of ${episodes.length}`
								: '0 episodes'}
						</p>
						<Button
							variant="outline"
							disabled={(episodePage + 1) * 25 >= episodes.length}
							onClick={() => setPage(episodePage + 1)}
						>
							Next episodes
						</Button>
					</nav>
				</section>
			)}
			{item.mediaType === 'book' && (
				<section>
					<h2 className="text-2xl font-semibold">Chapters</h2>
					<ol>
						{media.chapters?.map((ch) => (
							<li key={ch.id}>
								<Button
									variant="link"
									onClick={() => {
										if (usePlayer.getState().session?.libraryItemId === id)
											seekPlayback(ch.start)
										else
											void playEpisode(id, undefined, false, ch.start).catch(
												(error) => setError(String(error)),
											)
									}}
								>
									{duration(ch.start)} · {ch.title}
								</Button>
							</li>
						))}
					</ol>
				</section>
			)}
			<section className="space-y-3 border-t pt-5">
				<h2 className="text-xl font-semibold">Information</h2>
				<dl className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
					{[
						['Published', metadata.publishedYear],
						['Publisher', metadata.publisher],
						['Language', metadata.language],
						['ISBN', metadata.isbn],
						['ASIN', metadata.asin],
						[
							'Size',
							typeof media.size !== 'number'
								? undefined
								: `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(media.size / (media.size >= 1e9 ? 1e9 : 1e6))} ${media.size >= 1e9 ? 'GB' : 'MB'}`,
						],
						['Path', item.path],
					]
						.filter(
							([, value]) =>
								typeof value === 'string' || typeof value === 'number',
						)
						.map(([label, value]) => (
							<div key={String(label)}>
								<dt className="font-medium">{String(label)}</dt>
								<dd className="break-all">{String(value)}</dd>
							</div>
						))}
				</dl>
			</section>
			<ItemActions item={item} onChanged={() => void action(async () => {})} />
		</article>
	)
}
