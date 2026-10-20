import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
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
import { PodcastManagementSettings } from '../podcast'
import { Reader, readerItemSchema } from '../reader'
import { EpisodeEdit } from './EpisodeEdit'
import { ItemActions } from './ItemActions'
import type { Item } from './schemas'
import {
	checkPodcastFeed,
	deleteEpisode,
	getItem,
	updateProgress,
} from './service'
import { WorkflowSheet } from './WorkflowSheet'

export function ItemView({ id }: { id: string }) {
	const user = useAuth((state) => state.user)
	const admin = user?.type === 'root' || user?.type === 'admin'
	const canDownload = !!(
		user?.permissions as { download?: boolean } | undefined
	)?.download
	const [item, setItem] = useState<Item | null>(null)
	const [error, setError] = useState('')
	const [busy, setBusy] = useState(false)
	const [hardDeleteEpisode, setHardDeleteEpisode] = useState(false)
	const episodeDrafts = useRef(new Map<string, Record<string, string>>())
	const [page, setPage] = useState(0)
	const [expanded, setExpanded] = useState<Set<string>>(new Set())
	const [progress, setProgress] = useState(false)
	const [reader, setReader] = useState<{
		fileId?: string
		keepProgress: boolean
	} | null>(null)
	const canUpdate = !!(
		user as (typeof user & { permissions?: { update?: boolean } }) | null
	)?.permissions?.update
	useEffect(() => {
		let active = true
		setItem(null)
		setReader(null)
		episodeDrafts.current.clear()
		setPage(0)
		setExpanded(new Set())
		setError('')
		const reload = () => {
			void getItem(id)
				.then((value) => {
					if (active) {
						setItem(value)
						setProgress(value.userMediaProgress?.isFinished ?? false)
					}
				})
				.catch((error) => {
					if (active)
						setError(
							error instanceof Error ? error.message : 'Item update failed',
						)
				})
		}
		const receive = (event: Event) => {
			if (
				!(event instanceof CustomEvent) ||
				!event.detail ||
				typeof event.detail !== 'object'
			)
				return
			const detail = event.detail as { event?: unknown; payload?: unknown }
			if (
				[
					'item_updated',
					'user_item_progress_updated',
					'reconnect',
					'init',
				].includes(String(detail.event))
			)
				reload()
		}
		window.addEventListener('abs:socket', receive)
		void getItem(id)
			.then((value) => {
				if (active) {
					setItem(value)
					setProgress(value.userMediaProgress?.isFinished ?? false)
				}
			})
			.catch((e) => {
				if (active)
					setError(e instanceof Error ? e.message : 'Could not load item')
			})
		return () => {
			active = false
			window.removeEventListener('abs:socket', receive)
		}
	}, [id])
	if (!item)
		return (
			<section aria-busy="true">
				{error ? <p role="alert">{error}</p> : <p>Loading item…</p>}
			</section>
		)
	const media = item.media
	const metadata = media.metadata
	const episodes = media.episodes ?? []
	const episodePage = Math.min(
		page,
		Math.max(0, Math.ceil(episodes.length / 25) - 1),
	)
	async function action(run: () => Promise<unknown>) {
		setBusy(true)
		setError('')
		try {
			await run()
			setItem(await getItem(id))
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Action failed')
		} finally {
			setBusy(false)
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

			<header className="flex flex-col gap-5 sm:flex-row">
				{media.coverPath && (
					<img
						className="w-52 self-start rounded-md object-cover"
						src={`${window.__ABS_WEB_CONFIG__?.apiBasePath || ''}/api/items/${encodeURIComponent(id)}/cover`}
						alt={`${metadata.title ?? 'Item'} cover`}
					/>
				)}
				<div className="min-w-0 space-y-2">
					<p className="text-sm text-muted-foreground">
						{item.mediaType === 'book' ? 'Audiobook' : 'Podcast'}
					</p>
					<h1 className="text-3xl font-semibold">
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
					{!!metadata.genres?.length && (
						<p className="text-sm text-muted-foreground">
							{metadata.genres.join(' · ')}
						</p>
					)}
					{media.duration != null && <p>Duration {duration(media.duration)}</p>}
					{item.mediaType === 'book' && !media.numAudioFiles && (
						<p id="audio-unavailable">Audio unavailable</p>
					)}
					<div className="flex flex-wrap gap-2">
						{item.mediaType === 'book' && (
							<Button
								disabled={busy || !media.numAudioFiles}
								aria-describedby={
									!media.numAudioFiles ? 'audio-unavailable' : undefined
								}
								onClick={() => void play()}
							>
								Play audiobook
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
									void action(async () => {
										await updateProgress(id, { isFinished: !progress })
										setProgress(!progress)
									})
								}
							>
								{progress ? 'Mark unfinished' : 'Mark finished'}
							</Button>
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
			{error && (
				<p role="alert" className="text-destructive">
					{error}
				</p>
			)}
			{item.mediaType === 'podcast' && admin && (
				<PodcastManagementSettings key={`${user?.id}:${id}`} itemId={id}>
					{(content) => (
						<WorkflowSheet
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
						</WorkflowSheet>
					)}
				</PodcastManagementSettings>
			)}
			<dl className="grid grid-cols-2 gap-2 text-sm">
				{[
					['Published', metadata.publishedYear],
					['Publisher', metadata.publisher],
					['Language', metadata.language],
					['ISBN', metadata.isbn],
					['ASIN', metadata.asin],
					['Size (bytes)', media.size],
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
			{metadata.explicit === true && <p>Explicit content</p>}
			{metadata.abridged === true && <p>Abridged</p>}
			{item.isMissing && <p role="alert">Item files missing</p>}
			{item.isInvalid && <p role="alert">Item files invalid</p>}
			{item.userMediaProgress && (
				<p>
					Progress {Math.round((item.userMediaProgress.progress || 0) * 100)}% ·{' '}
					{duration(item.userMediaProgress.currentTime || 0)} listened
				</p>
			)}
			{metadata.description && (
				<section>
					<h2 className="text-xl font-semibold">Description</h2>
					<RichText text={metadata.description} />
				</section>
			)}
			{item.mediaType === 'podcast' && (
				<section className="space-y-3">
					<h2 className="text-2xl font-semibold">Episodes</h2>

					{episodes.length === 0 && <p>No downloaded episodes.</p>}
					<ol className="space-y-3">
						{episodes
							.slice(episodePage * 25, (episodePage + 1) * 25)
							.map((ep) => (
								<li key={ep.id} className="min-w-0 space-y-2 border-b py-3">
									<div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
										<div className="min-w-0 flex-1">
											<h3 className="font-medium">
												{ep.title ?? 'Untitled episode'}
											</h3>
											<p className="text-sm text-muted-foreground">
												{ep.duration != null
													? duration(ep.duration)
													: ep.audioFile?.duration != null
														? duration(ep.audioFile.duration)
														: 'Audio unavailable'}
												{ep.publishedAt
													? ` · ${new Date(ep.publishedAt).toISOString().slice(0, 10)}`
													: ''}
											</p>
										</div>
										<div className="flex flex-wrap gap-2">
											<Button
												disabled={busy || !ep.audioFile}
												onClick={() => void play(ep.id)}
											>
												Play
											</Button>
											<Button
												variant="outline"
												disabled={busy || !ep.audioFile}
												onClick={() =>
													enqueueEpisode(id, ep.id, ep.title ?? 'Episode')
												}
											>
												Queue
											</Button>
											<WorkflowSheet
												title="Episode controls"
												description={ep.title ?? 'Untitled episode'}
											>
												<div className="flex flex-wrap gap-2">
													{error && <p role="alert">{error}</p>}
													<Button
														variant="outline"
														disabled={busy}
														onClick={() =>
															void action(() =>
																updateProgress(id, { isFinished: true }, ep.id),
															)
														}
													>
														Mark finished
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
											</WorkflowSheet>
											{canUpdate && (
												<EpisodeEdit
													itemId={id}
													episode={ep}
													drafts={episodeDrafts.current}
													onSaved={() => void action(async () => {})}
												/>
											)}
										</div>
									</div>
									{ep.subtitle && <p className="text-sm">{ep.subtitle}</p>}
									{ep.description && (
										<div>
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
												{expanded.has(ep.id) ? 'Read less' : 'Read more'}
											</Button>
											{expanded.has(ep.id) && (
												<RichText text={ep.description} className="text-sm" />
											)}
										</div>
									)}
								</li>
							))}
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
			<ItemActions item={item} onChanged={() => void action(async () => {})} />
		</article>
	)
}
