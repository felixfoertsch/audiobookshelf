import { Link } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { duration } from '../../catalog'
import { Button } from '../../shared/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '../../shared/components/ui/dialog'
import { Input } from '../../shared/components/ui/input'
import type { Playlist } from './entities-api'

export function PlaylistList({
	playlists,
	pending,
	create,
}: {
	playlists: Playlist[]
	pending: boolean
	create: (name: string) => Promise<boolean>
}) {
	const [open, setOpen] = useState(false)
	const [error, setError] = useState('')
	const trigger = useRef<HTMLButtonElement>(null)
	return (
		<section aria-label="Playlists" className="space-y-5">
			<div className="flex items-center justify-between gap-3">
				{playlists.length === 0 && (
					<p className="text-muted-foreground">
						No playlists yet. Create one to get started.
					</p>
				)}
				<Dialog open={open} onOpenChange={setOpen}>
					<DialogTrigger asChild>
						<Button ref={trigger} onClick={() => setError('')}>
							Create playlist
						</Button>
					</DialogTrigger>
					<DialogContent
						onCloseAutoFocus={(event) => {
							event.preventDefault()
							trigger.current?.focus()
						}}
					>
						<DialogHeader>
							<DialogTitle>New playlist</DialogTitle>
							<DialogDescription>
								Choose a name for your playlist.
							</DialogDescription>
						</DialogHeader>
						<form
							className="space-y-4"
							onSubmit={(event) => {
								event.preventDefault()
								const name = new FormData(event.currentTarget).get('name')
								if (typeof name === 'string' && name.trim()) {
									setError('')
									void create(name.trim())
										.then((success) => {
											if (success) setOpen(false)
											else setError('Could not create playlist')
										})
										.catch((cause: unknown) =>
											setError(
												cause instanceof Error
													? cause.message
													: 'Could not create playlist',
											),
										)
								}
							}}
						>
							<label htmlFor="playlist-name">
								Name
								<Input
									id="playlist-name"
									name="name"
									required
									maxLength={255}
									autoFocus
								/>
							</label>
							{error && <p role="alert">{error}</p>}
							<Button type="submit" disabled={pending}>
								Create playlist
							</Button>
						</form>
					</DialogContent>
				</Dialog>
			</div>
			{playlists.length > 0 && (
				<div className="grid grid-cols-2 gap-4 lg:grid-cols-[repeat(auto-fill,minmax(min(100%,180px),1fr))]">
					{playlists.map((playlist) => {
						const totalDuration = playlist.items.reduce(
							(total, item) =>
								total +
								(item.episodeId
									? (item.episode?.duration ??
										item.episode?.audioFile?.duration ??
										0)
									: (item.libraryItem.media.duration ?? 0)),
							0,
						)
						const covers = playlist.items
							.filter((item) => item.libraryItem.media.coverPath)
							.slice(0, 4)
						return (
							<article key={playlist.id} className="min-w-0 space-y-2">
								<Link
									to="/playlist/$id"
									params={{ id: playlist.id }}
									className="block rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
								>
									<div className="aspect-square overflow-hidden rounded-lg bg-muted">
										{covers.length > 0 && covers.length < 4 ? (
											<img
												alt=""
												loading="lazy"
												className="size-full object-cover"
												src={`${window.__ABS_WEB_CONFIG__?.apiBasePath || ''}/api/items/${encodeURIComponent(covers[0].libraryItemId)}/cover?token=${encodeURIComponent(localStorage.getItem('token') || '')}`}
											/>
										) : covers.length > 1 ? (
											<div className="grid h-full grid-cols-2">
												{covers.map((item) => (
													<img
														key={`${item.libraryItemId}-${item.episodeId ?? ''}`}
														alt=""
														loading="lazy"
														className="size-full object-cover"
														src={`${window.__ABS_WEB_CONFIG__?.apiBasePath || ''}/api/items/${encodeURIComponent(item.libraryItemId)}/cover?token=${encodeURIComponent(localStorage.getItem('token') || '')}`}
													/>
												))}
											</div>
										) : (
											<div
												role="img"
												aria-label="No playlist cover"
												className="grid h-full place-items-center text-muted-foreground"
											>
												No cover
											</div>
										)}
									</div>
									<h2 className="truncate font-medium">
										{playlist.name || 'Untitled playlist'}
									</h2>
									<p className="text-sm text-muted-foreground">
										{playlist.items.length}{' '}
										{playlist.items.length === 1 ? 'item' : 'items'} ·{' '}
										{duration(totalDuration)}
									</p>
								</Link>
							</article>
						)
					})}
				</div>
			)}
		</section>
	)
}
