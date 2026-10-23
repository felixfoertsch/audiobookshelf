import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import {
	ArrowDown,
	ArrowUp,
	MoreHorizontal,
	Music2,
	Play,
	Plus,
	Shuffle,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { api, useAuth } from '../../api'
import { duration, getItem, getItems } from '../../catalog'
import { enqueue, playEpisode, playQueue } from '../../player'
import { Button } from '../../shared/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '../../shared/components/ui/dialog'
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
} from '../../shared/components/ui/sheet'
import { episodeProgress } from '../item/progress'
import { useCatalogRefresh } from './browse'
import { CollectionFeed } from './collection-feed'
import {
	type Author,
	addCollectionBook,
	addPlaylistItem,
	type Collection,
	createPlaylistFromCollection,
	deleteAuthor,
	deleteCollection,
	deletePlaylist,
	type Playlist,
	removeCollectionBook,
	removePlaylistItem,
	updateAuthor,
	updateCollection,
	updatePlaylist,
} from './entities-api'

function shuffled<T>(items: T[]) {
	const result = [...items]
	for (let index = result.length - 1; index > 0; index--) {
		const target = Math.floor(Math.random() * (index + 1))
		const current = result[index]
		result[index] = result[target]
		result[target] = current
	}
	return result
}
function playlistItems(playlist: Playlist) {
	return playlist.items.map((item) => ({
		libraryItemId: item.libraryItemId,
		episodeId: item.episodeId,
		title:
			item.episode?.title ||
			item.libraryItem.media.metadata.title ||
			'Untitled',
	}))
}
function canPlayPlaylistItem(item: Playlist['items'][number]) {
	if (item.libraryItem.isMissing || item.libraryItem.isInvalid) return false
	if (item.episodeId) return !!item.episode?.audioFile
	return (item.libraryItem.media.numAudioFiles ?? 0) > 0
}
function moved<T>(items: T[], from: number, to: number) {
	const result = [...items]
	const [item] = result.splice(from, 1)
	result.splice(to, 0, item)
	return result
}
type Action = (work: () => Promise<unknown>) => Promise<void>
type MutationTools = { act: Action; pending: boolean }
function EntityPage({
	title,
	description,
	imagePath,
	imageUrl,
	headerContent,
	canUpdate = false,
	canDelete = false,
	children,
	onSave,
	onDelete,
	asin,
}: {
	title: string
	description?: string | null
	imagePath?: string | null
	imageUrl?: string
	headerContent?: React.ReactNode
	canUpdate?: boolean
	canDelete?: boolean
	children?: React.ReactNode | ((tools: MutationTools) => React.ReactNode)
	onSave?: (
		name: string,
		description: string,
		asin?: string,
	) => Promise<unknown>
	onDelete?: () => Promise<unknown>
	asin?: string | null
}) {
	useCatalogRefresh()
	const user = useAuth((state) => state.user)
	const navigate = useNavigate()
	const router = useRouter()
	const [name, setName] = useState(title)
	const [text, setText] = useState(description ?? '')
	const [authorAsin, setAuthorAsin] = useState(asin ?? '')
	useEffect(() => {
		setName(title)
		setText(description ?? '')
		setAuthorAsin(asin ?? '')
	}, [title, description, asin])
	const [error, setError] = useState('')
	const [pending, setPending] = useState(false)
	const mutationLock = useRef(false)
	async function act(action: () => Promise<unknown>) {
		if (mutationLock.current) return
		mutationLock.current = true
		setPending(true)
		setError('')
		try {
			await action()
			await router.invalidate()
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Action failed')
		} finally {
			mutationLock.current = false
			setPending(false)
		}
	}
	return (
		<section className="space-y-5">
			<Button
				variant="outline"
				onClick={() => {
					if (history.length > 1) history.back()
					else void navigate({ to: '/' })
				}}
			>
				Back
			</Button>
			<header className="flex flex-wrap items-start gap-5">
				{imagePath && (
					<img
						className="h-48 w-48 rounded object-cover"
						src={imageUrl}
						alt={`${title} cover`}
					/>
				)}
				<div className="min-w-0 flex-1">
					<h1 className="text-3xl font-semibold">{title || 'Untitled'}</h1>
					{description && (
						<p className="mt-3 max-w-3xl whitespace-pre-wrap text-muted-foreground">
							{description}
						</p>
					)}
					{headerContent}
				</div>
			</header>
			{typeof children === 'function' ? children({ act, pending }) : children}
			{user && ((onSave && canUpdate) || (onDelete && canDelete)) && (
				<div className="space-y-3 rounded-lg border bg-card p-4">
					<h2 className="font-medium">Manage</h2>
					{onSave && canUpdate && (
						<>
							<label className="block">
								Name
								<input
									aria-label="Name"
									className="mt-1 block w-full rounded border bg-background p-2"
									value={name}
									onChange={(e) => setName(e.target.value)}
								/>
							</label>
							{asin !== undefined && (
								<label className="block">
									ASIN
									<input
										aria-label="ASIN"
										className="mt-1 block w-full rounded border bg-background p-2"
										value={authorAsin}
										onChange={(e) => setAuthorAsin(e.target.value)}
									/>
								</label>
							)}
							<label className="block">
								Description
								<textarea
									aria-label="Description"
									className="mt-1 block w-full rounded border bg-background p-2"
									value={text}
									onChange={(e) => setText(e.target.value)}
								/>
							</label>
							<Button
								disabled={pending}
								onClick={() =>
									void act(() => onSave(name, text, authorAsin.trim()))
								}
							>
								Save changes
							</Button>
						</>
					)}
					{onDelete && canDelete && (
						<Button
							variant="destructive"
							disabled={pending}
							onClick={() => {
								if (window.confirm(`Delete “${title}”?`))
									void act(async () => {
										await onDelete()
										await navigate({ to: '/' })
									})
							}}
						>
							Delete
						</Button>
					)}
				</div>
			)}
			{error && (
				<p role="alert" className="text-destructive">
					{error}
				</p>
			)}
		</section>
	)
}
function ItemLink({ id, title }: { id: string; title: string }) {
	return (
		<Link className="hover:underline" to="/item/$id" params={{ id }}>
			{title || 'Untitled'}
		</Link>
	)
}
function PlayButton({
	id,
	episodeId,
	act,
	pending,
	disabled = false,
}: {
	id: string
	episodeId?: string
	act: Action
	pending: boolean
	disabled?: boolean
}) {
	return (
		<Button
			disabled={pending || disabled}
			onClick={() => void act(() => playEpisode(id, episodeId))}
		>
			Play
		</Button>
	)
}
function AddItem({
	libraryId,
	excluded,
	pending,
	onAdd,
	allowEpisodes = false,
}: {
	libraryId: string
	excluded: Set<string>
	pending: boolean
	onAdd: (id: string, episodeId?: string) => void
	allowEpisodes?: boolean
}) {
	const [items, setItems] = useState<
		Awaited<ReturnType<typeof getItems>>['results']
	>([])
	const [selected, setSelected] = useState('')
	const [episodeId, setEpisodeId] = useState('')
	const [query, setQuery] = useState('')
	const [page, setPage] = useState(0)
	const [total, setTotal] = useState(0)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState('')
	async function load(nextPage = 0) {
		setError('')
		setLoading(true)
		try {
			const result = await getItems(libraryId, query, nextPage)
			setItems(
				result.results.filter(
					(item) =>
						!excluded.has(item.id) &&
						(allowEpisodes || item.mediaType === 'book'),
				),
			)
			setTotal(result.total)
			setPage(nextPage)
			setSelected('')
			setEpisodeId('')
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Items could not load')
		} finally {
			setLoading(false)
		}
	}
	async function selectItem(id: string) {
		setSelected(id)
		setEpisodeId('')
		if (!id) return
		try {
			const item = await getItem(id)
			if (item.mediaType === 'podcast')
				setItems((current) =>
					current.map((entry) => (entry.id === id ? item : entry)),
				)
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Item could not load')
		}
	}
	const selectedItem = items.find((item) => item.id === selected)
	const episodes =
		selectedItem?.mediaType === 'podcast'
			? (selectedItem.media.episodes ?? [])
			: []
	return (
		<div className="space-y-2">
			<form
				className="flex gap-2"
				onSubmit={(event) => {
					event.preventDefault()
					void load(0)
				}}
			>
				<label className="min-w-0 flex-1">
					Search items
					<input
						aria-label="Search items"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						className="block w-full rounded border bg-background p-2"
					/>
				</label>
				<Button variant="outline" disabled={pending || loading}>
					Search
				</Button>
			</form>
			<Button
				variant="outline"
				disabled={pending || loading || page === 0}
				onClick={() => void load(page - 1)}
			>
				Previous page
			</Button>
			<Button
				variant="outline"
				disabled={pending || loading || (page + 1) * 48 >= total}
				onClick={() => void load(page + 1)}
			>
				Next page
			</Button>
			{loading && <p role="status">Loading items…</p>}
			{items.length > 0 && (
				<div className="flex gap-2">
					<select
						aria-label="Item to add"
						className="min-w-0 flex-1 rounded border bg-background p-2"
						value={selected}
						onChange={(e) => void selectItem(e.target.value)}
					>
						<option value="">Choose item</option>
						{items.map((item) => (
							<option key={item.id} value={item.id}>
								{item.media.metadata.title || 'Untitled'}
							</option>
						))}
					</select>
					{episodes.length > 0 && (
						<select
							aria-label="Podcast episode"
							className="min-w-0 rounded border bg-background p-2"
							value={episodeId}
							onChange={(event) => setEpisodeId(event.target.value)}
						>
							<option value="">Choose episode</option>
							{episodes.map((episode) => (
								<option key={episode.id} value={episode.id}>
									{episode.title || episode.id}
								</option>
							))}
						</select>
					)}
					<Button
						disabled={
							pending ||
							!selected ||
							(allowEpisodes &&
								selectedItem?.mediaType === 'podcast' &&
								!episodeId)
						}
						onClick={() => onAdd(selected, episodeId || undefined)}
					>
						Add
					</Button>
				</div>
			)}
			{error && (
				<p role="alert" className="text-destructive">
					{error}
				</p>
			)}
		</div>
	)
}
export function AuthorDetail({ author }: { author: Author }) {
	const [matchResult, setMatchResult] = useState('')
	const navigate = useNavigate()
	const user = useAuth((state) => state.user)
	return (
		<EntityPage
			title={author.name}
			description={author.description}
			asin={author.asin || ''}
			imagePath={author.imagePath}
			imageUrl={`${window.__ABS_WEB_CONFIG__?.apiBasePath ?? ''}/api/authors/${encodeURIComponent(author.id)}/image?token=${encodeURIComponent(localStorage.getItem('token') || '')}`}
			canUpdate={
				!!(user?.permissions as { update?: boolean } | undefined)?.update
			}
			canDelete={
				!!(user?.permissions as { delete?: boolean } | undefined)?.delete
			}
			onSave={async (name, description, asin) => {
				const result = await updateAuthor(author.id, {
					name,
					description,
					asin: asin || null,
				})
				if (result.merged)
					await navigate({
						to: '/author/$id',
						params: { id: result.author.id },
					})
			}}
			onDelete={() => deleteAuthor(author.id)}
		>
			{({ act, pending }) => (
				<>
					{(user?.permissions as { update?: boolean } | undefined)?.update && (
						<>
							<form
								className="flex flex-wrap gap-3"
								onSubmit={(event) => {
									event.preventDefault()
									const data = new FormData(event.currentTarget)
									setMatchResult('')
									void act(async () => {
										const result = await api(
											`/api/authors/${encodeURIComponent(author.id)}/match`,
											z.object({
												updated: z.boolean(),
												author: z.unknown().optional(),
											}),
											{
												method: 'POST',
												body: JSON.stringify({
													...(data.get('asin')
														? { asin: data.get('asin') }
														: { q: author.name }),
													region: data.get('region'),
												}),
											},
										)
										setMatchResult(
											result.updated
												? 'Author metadata updated'
												: 'No author updates found',
										)
									})
								}}
							>
								<label>
									ASIN
									<input
										name="asin"
										defaultValue={author.asin || ''}
										className="block rounded border bg-background p-2"
									/>
								</label>
								<label>
									Region
									<input
										name="region"
										defaultValue="us"
										required
										className="block rounded border bg-background p-2"
									/>
								</label>
								<Button disabled={pending} type="submit">
									Match author
								</Button>
								{matchResult && <p role="status">{matchResult}</p>}
							</form>
							<form
								onSubmit={(event) => {
									event.preventDefault()
									const data = new FormData(event.currentTarget)
									void act(() =>
										api(
											`/api/authors/${encodeURIComponent(author.id)}/image`,
											z.object({ author: z.unknown() }),
											{
												method: 'POST',
												body: JSON.stringify({
													url: z.url().parse(data.get('url')),
												}),
											},
										),
									)
								}}
							>
								<label>
									Author image URL
									<input
										type="url"
										name="url"
										required
										className="block rounded border bg-background p-2"
									/>
								</label>
								<Button disabled={pending} type="submit">
									Upload image
								</Button>
							</form>
							{author.imagePath && (
								<Button
									disabled={pending}
									variant="destructive"
									onClick={() => {
										if (window.confirm('Remove author image?'))
											void act(() =>
												api(
													`/api/authors/${encodeURIComponent(author.id)}/image`,
													z.object({ author: z.unknown() }),
													{ method: 'DELETE' },
												),
											)
									}}
								>
									Remove image
								</Button>
							)}
						</>
					)}
					<h2 className="text-xl font-semibold">
						Books ({author.libraryItems?.length ?? 0})
					</h2>
					<ul className="grid gap-3 sm:grid-cols-2">
						{author.libraryItems?.map((item) => (
							<li
								key={item.id}
								className="flex items-center justify-between gap-2 rounded border p-3"
							>
								<ItemLink
									id={item.id}
									title={item.media.metadata.title || ''}
								/>
								<PlayButton id={item.id} act={act} pending={pending} />
							</li>
						))}
					</ul>
					{author.series?.map((series) => (
						<div key={series.id}>
							<h2 className="text-xl font-semibold">{series.name}</h2>
							{series.items.map((item) => (
								<p key={item.id}>
									<ItemLink
										id={item.id}
										title={item.media.metadata.title || ''}
									/>
								</p>
							))}
						</div>
					))}
				</>
			)}
		</EntityPage>
	)
}
export function CollectionDetail({ collection }: { collection: Collection }) {
	const navigate = useNavigate()
	const user = useAuth((state) => state.user)
	const permissions = user?.permissions as
		| { update?: boolean; delete?: boolean }
		| undefined
	const canUpdate = !!permissions?.update
	const canDelete = !!permissions?.delete
	return (
		<EntityPage
			title={collection.name ?? ''}
			description={collection.description}
			canUpdate={canUpdate}
			canDelete={canDelete}
			onSave={async (name, description) =>
				updateCollection(collection.id, {
					name,
					description,
					books: collection.books.map((b) => b.id),
				})
			}
			onDelete={() => deleteCollection(collection.id)}
		>
			{({ act, pending }) => (
				<>
					<h2 className="text-xl font-semibold">
						Books ({collection.books.length})
					</h2>
					<Button
						disabled={pending || !collection.books.length}
						onClick={() =>
							void act(() =>
								playQueue(
									collection.books.map((book) => ({
										libraryItemId: book.id,
										title: book.media.metadata.title || 'Untitled',
									})),
								),
							)
						}
					>
						Play collection
					</Button>
					<Button
						disabled={pending || !collection.books.length}
						onClick={() =>
							void act(async () => {
								const playlist = await createPlaylistFromCollection(
									collection.id,
								)
								await navigate({
									to: '/playlist/$id',
									params: { id: playlist.id },
								})
							})
						}
					>
						Create playlist from collection
					</Button>
					<div
						className="flex gap-2 overflow-x-auto"
						role="img"
						aria-label="Collection cover"
					>
						{collection.books
							.slice(0, 2)
							.map((book) =>
								book.media.coverPath ? (
									<img
										key={book.id}
										className="h-48 rounded object-cover"
										alt={book.media.metadata.title || 'Book cover'}
										src={`${window.__ABS_WEB_CONFIG__?.apiBasePath || ''}/api/items/${encodeURIComponent(book.id)}/cover?token=${encodeURIComponent(localStorage.getItem('token') || '')}`}
									/>
								) : null,
							)}
					</div>
					<CollectionFeed collection={collection} act={act} pending={pending} />
					<ol className="space-y-2">
						{collection.books.map((book, index) => (
							<li
								key={book.id}
								className="flex items-center gap-3 rounded border p-3"
							>
								<span className="flex-1">
									<ItemLink
										id={book.id}
										title={book.media.metadata.title || ''}
									/>
								</span>
								<PlayButton id={book.id} act={act} pending={pending} />
								{canUpdate && (
									<>
										<Button
											variant="outline"
											disabled={pending || index === 0}
											aria-label="Move up"
											onClick={() =>
												void act(() =>
													updateCollection(collection.id, {
														books: moved(
															collection.books.map((b) => b.id),
															index,
															index - 1,
														),
													}),
												)
											}
										>
											↑
										</Button>
										<Button
											variant="outline"
											disabled={
												pending || index === collection.books.length - 1
											}
											aria-label="Move down"
											onClick={() =>
												void act(() =>
													updateCollection(collection.id, {
														books: moved(
															collection.books.map((b) => b.id),
															index,
															index + 1,
														),
													}),
												)
											}
										>
											↓
										</Button>
										<Button
											variant="outline"
											disabled={pending}
											onClick={() => {
												if (window.confirm('Remove this book?'))
													void act(() =>
														removeCollectionBook(collection.id, book.id),
													)
											}}
										>
											Remove
										</Button>
									</>
								)}
							</li>
						))}
					</ol>
					{canUpdate && (
						<AddItem
							libraryId={collection.libraryId}
							excluded={new Set(collection.books.map((b) => b.id))}
							pending={pending}
							onAdd={(id) =>
								void act(() => addCollectionBook(collection.id, id))
							}
						/>
					)}
				</>
			)}
		</EntityPage>
	)
}
function PlaylistOverlay({
	title,
	open,
	onOpenChange,
	children,
}: {
	title: string
	open: boolean
	onOpenChange: (open: boolean) => void
	children: React.ReactNode
}) {
	const [mobile, setMobile] = useState(false)
	useEffect(() => {
		if (!window.matchMedia) return
		const query = window.matchMedia('(max-width: 639px)')
		const update = () => setMobile(query.matches)
		update()
		query.addEventListener('change', update)
		return () => query.removeEventListener('change', update)
	}, [])
	return mobile ? (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="overflow-y-auto p-6">
				<SheetHeader>
					<SheetTitle>{title}</SheetTitle>
					<SheetDescription>Manage your playlist.</SheetDescription>
				</SheetHeader>
				{children}
			</SheetContent>
		</Sheet>
	) : (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>Manage your playlist.</DialogDescription>
				</DialogHeader>
				{children}
			</DialogContent>
		</Dialog>
	)
}
export function PlaylistDetail({ playlist }: { playlist: Playlist }) {
	useCatalogRefresh()
	const user = useAuth((state) => state.user)
	const router = useRouter()
	const navigate = useNavigate()
	const owner = user?.id === playlist.userId
	const [pending, setPending] = useState(false)
	const lock = useRef(false)
	const [error, setError] = useState('')
	const [overlay, setOverlay] = useState<'add' | 'edit' | null>(null)
	const addTrigger = useRef<HTMLButtonElement>(null)
	const moreTrigger = useRef<HTMLButtonElement>(null)
	const [name, setName] = useState(playlist.name || '')
	const [description, setDescription] = useState(playlist.description || '')
	useEffect(() => {
		setName(playlist.name || '')
		setDescription(playlist.description || '')
	}, [playlist.name, playlist.description])
	const closeOverlay = () => {
		const target = overlay === 'add' ? addTrigger : moreTrigger
		setOverlay(null)
		requestAnimationFrame(() => target.current?.focus())
	}
	async function act(action: () => Promise<unknown>) {
		if (lock.current) return
		lock.current = true
		setPending(true)
		setError('')
		try {
			await action()
			await router.invalidate()
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Action failed')
		} finally {
			lock.current = false
			setPending(false)
		}
	}
	const playableItems = playlist.items.filter(canPlayPlaylistItem)
	const seconds = (item: Playlist['items'][number]) =>
		item.episodeId
			? (item.episode?.duration ?? item.episode?.audioFile?.duration ?? 0)
			: (item.libraryItem.media.duration ?? 0)
	const total = playlist.items.reduce((sum, item) => sum + seconds(item), 0)
	const cover = (id: string) =>
		`${window.__ABS_WEB_CONFIG__?.apiBasePath || ''}/api/items/${encodeURIComponent(id)}/cover?token=${encodeURIComponent(localStorage.getItem('token') || '')}`
	const coverItem = playlist.items.find(
		(item) => item.libraryItem.media.coverPath,
	)
	const reorder = (index: number, direction: number) =>
		void act(() =>
			updatePlaylist(playlist.id, {
				items: moved(playlist.items, index, index + direction).map(
					({ libraryItemId, episodeId }) => ({ libraryItemId, episodeId }),
				),
			}),
		)
	return (
		<section className="space-y-8">
			<nav
				aria-label="Breadcrumb"
				className="flex gap-2 text-sm text-muted-foreground"
			>
				<Link
					to="/library/$library/bookshelf/$id"
					params={{ library: playlist.libraryId, id: 'playlists' }}
				>
					Playlists
				</Link>
				<span aria-hidden="true">›</span>
				<span aria-current="page">{playlist.name}</span>
			</nav>
			<header className="flex flex-col gap-6 sm:flex-row sm:items-end">
				<div className="mx-auto flex size-48 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-muted shadow-lg sm:mx-0 sm:size-60">
					{coverItem ? (
						<img
							className="size-full object-cover"
							src={cover(coverItem.libraryItemId)}
							alt={`${playlist.name} cover`}
						/>
					) : (
						<Music2 className="size-20 text-muted-foreground" />
					)}
				</div>
				<div className="min-w-0 flex-1 space-y-3">
					<p className="text-sm font-semibold text-primary">Playlist</p>
					<h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
						{playlist.name || 'Untitled'}
					</h1>
					{playlist.description && (
						<p className="max-w-2xl text-muted-foreground">
							{playlist.description}
						</p>
					)}
					<p className="text-sm text-muted-foreground">
						{playlist.items.length} items · {duration(total)}
					</p>
					<div className="flex flex-wrap items-center gap-2 pt-2">
						<Button
							disabled={pending || !playableItems.length}
							onClick={() =>
								void act(() =>
									playQueue(
										playlistItems({ ...playlist, items: playableItems }),
									),
								)
							}
						>
							<Play />
							Play playlist
						</Button>
						<Button
							variant="outline"
							disabled={pending || !playableItems.length}
							onClick={() =>
								void act(() =>
									playQueue(
										playlistItems({
											...playlist,
											items: shuffled(playableItems),
										}),
									),
								)
							}
						>
							<Shuffle />
							Shuffle playlist
						</Button>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									ref={moreTrigger}
									variant="outline"
									size="icon"
									aria-label="Playlist actions"
								>
									<MoreHorizontal />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem
									disabled={pending || !playableItems.length}
									onSelect={() =>
										void act(async () =>
											enqueue(
												playlistItems({ ...playlist, items: playableItems }),
											),
										)
									}
								>
									Add to queue
								</DropdownMenuItem>
								{owner && (
									<>
										<DropdownMenuItem onSelect={() => setOverlay('edit')}>
											Edit details
										</DropdownMenuItem>
										<DropdownMenuItem
											variant="destructive"
											onSelect={() => {
												if (window.confirm(`Delete “${playlist.name}”?`))
													void act(async () => {
														await deletePlaylist(playlist.id)
														await navigate({
															to: '/library/$library/bookshelf/$id',
															params: {
																library: playlist.libraryId,
																id: 'playlists',
															},
														})
													})
											}}
										>
											Delete playlist
										</DropdownMenuItem>
									</>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
						{owner && (
							<Button
								ref={addTrigger}
								variant="ghost"
								onClick={() => setOverlay('add')}
							>
								<Plus />
								Add items
							</Button>
						)}
					</div>
				</div>
			</header>
			{error && (
				<p role="alert" className="text-destructive">
					{error}
				</p>
			)}
			{!playlist.items.length && (
				<div className="rounded-2xl border border-dashed p-10 text-center">
					<h2 className="font-semibold">No items in this playlist.</h2>
					<p className="text-muted-foreground">
						Add books or episodes from this library to start listening.
					</p>
				</div>
			)}
			<ol className="divide-y divide-border/60">
				{playlist.items.map((item, index) => {
					const title =
						item.episode?.title ||
						item.libraryItem.media.metadata.title ||
						'Untitled'
					const metadata = item.libraryItem.media.metadata
					const secondary = item.episodeId
						? metadata.title
						: metadata.author ||
							metadata.authorName ||
							metadata.authors?.map((author) => author.name).join(', ')
					const progress = episodeProgress(
						user,
						item.libraryItemId,
						item.episodeId,
					)
					const available = canPlayPlaylistItem(item)
					return (
						<li
							key={`${item.libraryItemId}:${item.episodeId || ''}`}
							className="group flex min-w-0 items-center gap-2 rounded-lg py-2 hover:bg-accent/50 focus-within:bg-accent/50"
						>
							<button
								type="button"
								className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-left focus-visible:outline-2 focus-visible:outline-ring"
								aria-label={`Play ${title}`}
								disabled={pending || !available}
								onClick={() =>
									void act(() =>
										playEpisode(item.libraryItemId, item.episodeId),
									)
								}
							>
								<span className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
									{item.libraryItem.media.coverPath ? (
										<img
											className="size-full object-cover"
											src={cover(item.libraryItemId)}
											alt=""
										/>
									) : (
										<Music2 className="size-5 text-muted-foreground" />
									)}
									<span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
										<Play className="size-5" />
									</span>
								</span>
								<span className="min-w-0 flex-1">
									<span className="block truncate font-medium">{title}</span>
									<span className="block truncate text-xs text-muted-foreground">
										{secondary ? `${secondary} · ` : ''}
										{item.episodeId ? 'Episode' : 'Audiobook'}
									</span>
									<span className="block text-xs text-muted-foreground">
										{!available
											? 'Audio unavailable'
											: progress?.isFinished
												? 'Finished'
												: (progress?.currentTime || 0) > 0
													? 'In progress'
													: 'Not started'}
									</span>
								</span>
								<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
									{seconds(item) ? duration(seconds(item)) : '—'}
								</span>
							</button>
							{owner && (
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											variant="ghost"
											size="icon"
											aria-label={`Actions for ${title}`}
										>
											<MoreHorizontal />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										<DropdownMenuItem
											disabled={pending || index === 0}
											onSelect={() => reorder(index, -1)}
										>
											<ArrowUp />
											Move up
										</DropdownMenuItem>
										<DropdownMenuItem
											disabled={pending || index === playlist.items.length - 1}
											onSelect={() => reorder(index, 1)}
										>
											<ArrowDown />
											Move down
										</DropdownMenuItem>
										<DropdownMenuItem
											variant="destructive"
											disabled={pending}
											onSelect={() => {
												if (window.confirm('Remove this item?'))
													void act(() => removePlaylistItem(playlist.id, item))
											}}
										>
											Remove
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							)}
						</li>
					)
				})}
			</ol>
			<PlaylistOverlay
				title={overlay === 'add' ? 'Add items' : 'Edit details'}
				open={overlay !== null}
				onOpenChange={(open) => {
					if (!open) closeOverlay()
				}}
			>
				{overlay === 'add' ? (
					<AddItem
						allowEpisodes
						libraryId={playlist.libraryId}
						excluded={
							new Set(
								playlist.items
									.filter((item) => !item.episodeId)
									.map((item) => item.libraryItemId),
							)
						}
						pending={pending}
						onAdd={(libraryItemId, episodeId) =>
							void act(() =>
								addPlaylistItem(playlist.id, { libraryItemId, episodeId }),
							)
						}
					/>
				) : (
					<form
						className="space-y-4"
						onSubmit={(event) => {
							event.preventDefault()
							if (name.trim())
								void act(async () => {
									await updatePlaylist(playlist.id, {
										name: name.trim(),
										description,
										items: playlist.items.map(
											({ libraryItemId, episodeId }) => ({
												libraryItemId,
												episodeId,
											}),
										),
									})
									closeOverlay()
								})
						}}
					>
						<label className="block space-y-1">
							Name
							<input
								className="block w-full rounded-md border bg-background p-2"
								required
								maxLength={255}
								value={name}
								onChange={(event) => setName(event.target.value)}
							/>
						</label>
						<label className="block space-y-1">
							Description
							<textarea
								className="block w-full rounded-md border bg-background p-2"
								value={description}
								onChange={(event) => setDescription(event.target.value)}
							/>
						</label>
						<Button disabled={pending} type="submit">
							Save changes
						</Button>
					</form>
				)}
				{error && (
					<p role="alert" className="text-destructive">
						{error}
					</p>
				)}
			</PlaylistOverlay>
		</section>
	)
}
