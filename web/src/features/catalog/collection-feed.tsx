import { useState } from 'react'
import { z } from 'zod'
import { api, useAuth } from '../../api'
import { Button } from '../../shared/components/ui/button'
import { feedAddress } from '../item/item-actions'
import type { Collection } from './entities-api'

export function CollectionFeed({
	collection,
	act,
	pending,
}: {
	collection: Collection
	act: (work: () => Promise<unknown>) => Promise<void>
	pending: boolean
}) {
	const user = useAuth((state) => state.user)
	const admin = user?.type === 'root' || user?.type === 'admin'
	const [copyError, setCopyError] = useState('')
	if (!admin && !collection.rssFeed) return null
	return (
		<section className="space-y-3 rounded border p-4">
			<h2 className="text-xl">Collection RSS feed</h2>
			{collection.rssFeed ? (
				<>
					<label>
						Feed URL
						<input
							className="block w-full border bg-background p-2"
							readOnly
							value={
								collection.rssFeed.feedUrl
									? feedAddress(collection.rssFeed.feedUrl)
									: ''
							}
						/>
					</label>
					<p>
						Prevent indexing:{' '}
						{collection.rssFeed.meta?.preventIndexing ? 'Yes' : 'No'}
					</p>
					<Button
						variant="outline"
						onClick={() => {
							void navigator.clipboard
								.writeText(
									collection.rssFeed?.feedUrl
										? feedAddress(collection.rssFeed.feedUrl)
										: '',
								)
								.catch((cause: unknown) =>
									setCopyError(
										cause instanceof Error ? cause.message : 'Copy failed',
									),
								)
						}}
					>
						Copy feed URL
					</Button>
					{admin && (
						<Button
							disabled={pending}
							variant="destructive"
							onClick={() => {
								if (
									window.confirm(
										'Close collection RSS feed? Subscribers lose access.',
									)
								)
									void act(() =>
										api(
											`/api/feeds/${encodeURIComponent(collection.rssFeed?.id || '')}/close`,
											z.unknown(),
											{ method: 'POST' },
										),
									)
							}}
						>
							Close RSS feed
						</Button>
					)}
				</>
			) : (
				<form
					className="space-y-3"
					onSubmit={(event) => {
						event.preventDefault()
						const form = new FormData(event.currentTarget)
						void act(() =>
							api(
								`/api/feeds/collection/${encodeURIComponent(collection.id)}/open`,
								z.object({ feed: z.object({ id: z.string() }).passthrough() }),
								{
									method: 'POST',
									body: JSON.stringify({
										serverAddress: form.get('serverAddress'),
										slug: form.get('slug'),
										metadataDetails: {
											preventIndexing: form.has('preventIndexing'),
											ownerName: form.get('ownerName'),
											ownerEmail: form.get('ownerEmail'),
										},
									}),
								},
							),
						)
					}}
				>
					<label className="block">
						Server address
						<input
							name="serverAddress"
							type="url"
							required
							defaultValue={`${window.location.origin}${window.__ABS_WEB_CONFIG__?.apiBasePath || ''}`}
							className="block w-full border bg-background p-2"
						/>
					</label>
					<label className="block">
						Slug
						<input
							name="slug"
							pattern="[A-Za-z0-9_-]+"
							required
							className="block border bg-background p-2"
						/>
					</label>
					{[
						['ownerName', 'Owner name', ''],
						['ownerEmail', 'Owner email', ''],
					].map(([name, label, value]) => (
						<label className="block" key={name}>
							{label}
							<input
								name={name}
								defaultValue={value}
								type={name === 'ownerEmail' ? 'email' : 'text'}
								className="block w-full border bg-background p-2"
							/>
						</label>
					))}
					<label className="block">
						<input name="preventIndexing" type="checkbox" defaultChecked />
						Prevent indexing
					</label>
					<Button disabled={pending} type="submit">
						Open RSS feed
					</Button>
				</form>
			)}
			{copyError && <p role="alert">{copyError}</p>}
		</section>
	)
}
