import { useState } from 'react'
import type { z } from 'zod'
import { api, useAuth } from '../../api'
import { Button } from '../../shared/components/ui/button'
import { Input } from '../../shared/components/ui/input'
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '../../shared/components/ui/sheet'
import {
	addCollectionBook,
	addPlaylistItem,
	collectionMembershipsSchema,
	createMembershipCollection,
	createMembershipPlaylist,
	playlistMembershipsSchema,
} from '../catalog/entities-api'
import type { Item } from './schemas'

export function BookMembership({
	item,
	onChanged,
}: {
	item: Item
	onChanged: () => void
}) {
	const user = useAuth((state) => state.user)
	const [open, setOpen] = useState(false)
	const [collections, setCollections] = useState<
		z.infer<typeof collectionMembershipsSchema>['collections']
	>([])
	const [playlists, setPlaylists] = useState<
		z.infer<typeof playlistMembershipsSchema>['playlists']
	>([])
	const [name, setName] = useState('')
	const [kind, setKind] = useState<'collection' | 'playlist'>(
		(user?.permissions as { update?: boolean } | undefined)?.update
			? 'collection'
			: 'playlist',
	)
	const [error, setError] = useState('')
	const [busy, setBusy] = useState(false)
	if (item.mediaType !== 'book' || !user) return null
	async function load() {
		setError('')
		setBusy(true)
		try {
			const [c, p] = await Promise.all([
				api('/api/collections', collectionMembershipsSchema),
				api('/api/playlists', playlistMembershipsSchema),
			])
			setCollections(
				c.collections.filter((entry) => entry.libraryId === item.libraryId),
			)
			setPlaylists(
				p.playlists.filter((entry) => entry.libraryId === item.libraryId),
			)
			setOpen(true)
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : 'Could not load memberships',
			)
		} finally {
			setBusy(false)
		}
	}
	async function act(work: () => Promise<unknown>) {
		setBusy(true)
		setError('')
		try {
			await work()
			onChanged()
			setOpen(false)
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Action failed')
		} finally {
			setBusy(false)
		}
	}
	return (
		<div className="space-y-2">
			<Sheet open={open} onOpenChange={setOpen}>
				<SheetTrigger asChild>
					<Button
						variant="outline"
						disabled={busy}
						onClick={(event) => {
							event.preventDefault()
							void load()
						}}
					>
						Add to collection or playlist
					</Button>
				</SheetTrigger>
				<SheetContent className="w-full overflow-y-auto p-4 sm:max-w-2xl">
					<SheetHeader>
						<SheetTitle>Add book to collection or playlist</SheetTitle>
						<SheetDescription>
							{item.media.metadata.title || 'Book'}
						</SheetDescription>
					</SheetHeader>
					<div className="space-y-2">
						{collections
							.filter(
								() =>
									(user.permissions as { update?: boolean } | undefined)
										?.update === true,
							)
							.map((collection) => (
								<Button
									key={collection.id}
									variant="outline"
									disabled={
										busy || collection.books.some((book) => book.id === item.id)
									}
									onClick={() =>
										void act(() => addCollectionBook(collection.id, item.id))
									}
								>
									Collection: {collection.name || 'Untitled'}
								</Button>
							))}
						{playlists
							.filter((p) => p.userId === user.id)
							.map((playlist) => (
								<Button
									key={playlist.id}
									variant="outline"
									disabled={
										busy ||
										playlist.items.some(
											(entry) => entry.libraryItemId === item.id,
										)
									}
									onClick={() =>
										void act(() =>
											addPlaylistItem(playlist.id, { libraryItemId: item.id }),
										)
									}
								>
									Playlist: {playlist.name || 'Untitled'}
								</Button>
							))}
						<form
							onSubmit={(event) => {
								event.preventDefault()
								const clean = name.trim()
								if (!clean || !item.libraryId) return
								const libraryId = item.libraryId
								void act(() =>
									kind === 'collection'
										? createMembershipCollection(libraryId, clean, item.id)
										: createMembershipPlaylist(libraryId, clean, item.id),
								)
							}}
							className="flex flex-wrap items-end gap-2"
						>
							<label>
								New{' '}
								<select
									aria-label="New membership type"
									value={kind}
									onChange={(event) =>
										setKind(event.target.value as typeof kind)
									}
								>
									{(user.permissions as { update?: boolean } | undefined)
										?.update === true && (
										<option value="collection">collection</option>
									)}
									<option value="playlist">playlist</option>
								</select>
								<Input
									aria-label="New name"
									value={name}
									onChange={(event) => setName(event.target.value)}
									required
									maxLength={200}
								/>
							</label>
							<Button disabled={busy || !name.trim()}>Create</Button>
						</form>
						{error && <p role="alert">{error}</p>}
					</div>
				</SheetContent>
			</Sheet>
			{error && !open && <p role="alert">{error}</p>}
		</div>
	)
}
