import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import { api, useAuth } from '../../api'
import { Button } from '../../shared/components/ui/button'
import { dateTime } from '../../shared/date-time'

const feed = z
	.object({
		id: z.string(),
		slug: z.string(),
		entityType: z.string(),
		feedUrl: z.string(),
		coverPath: z.string().nullable().optional(),
		updatedAt: z.number().optional(),
		meta: z
			.object({
				title: z.string().optional(),
				preventIndexing: z.boolean().optional(),
				ownerName: z.string().optional(),
				ownerEmail: z.string().optional(),
			})
			.passthrough(),
		episodes: z.array(
			z
				.object({
					id: z.string(),
					title: z.string(),
					pubDate: z.string().nullable().optional(),
				})
				.passthrough(),
		),
	})
	.passthrough()
const schema = z.object({ feeds: z.array(feed) }).passthrough(),
	ok = z.object({}).passthrough()
export function RssFeeds() {
	const admin = useAuth(
		(s) => s.user?.type === 'root' || s.user?.type === 'admin',
	)
	const [feeds, setFeeds] = useState<z.infer<typeof feed>[]>([])
	const [selected, setSelected] = useState<z.infer<typeof feed> | null>(null)
	const [error, setError] = useState('')
	const load = useCallback(async () => {
		if (!admin) return
		try {
			const r = await api('/api/feeds', schema)
			setFeeds(r.feeds)
		} catch (e) {
			setError(message(e))
		}
	}, [admin])
	useEffect(() => {
		void load()
	}, [load])
	return (
		<section className="space-y-4">
			<h1 className="text-2xl">RSS feeds</h1>
			{error && <p role="alert">{error}</p>}
			{!feeds.length ? (
				<p>No RSS feeds.</p>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full text-left">
						<thead>
							<tr>
								<th>Title</th>
								<th>Slug</th>
								<th>Type</th>
								<th>Episodes</th>
								<th>Prevent indexing</th>
								<th>Updated</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{feeds.map((f) => (
								<tr className="border-t" key={f.id}>
									<td>
										<button
											type="button"
											className="underline"
											onClick={() => setSelected(f)}
										>
											{f.meta.title || f.slug}
										</button>
									</td>
									<td>{f.slug}</td>
									<td>{f.entityType}</td>
									<td>{f.episodes.length}</td>
									<td>{f.meta.preventIndexing ? 'Yes' : 'No'}</td>
									<td>{f.updatedAt ? dateTime(f.updatedAt) : ''}</td>
									<td>
										<Button
											variant="destructive"
											disabled={!admin}
											onClick={() => {
												if (window.confirm(`Close RSS feed ${f.slug}?`))
													void api(
														`/api/feeds/${encodeURIComponent(f.id)}/close`,
														ok,
														{ method: 'POST' },
													)
														.then(load)
														.catch((e) => setError(message(e)))
											}}
										>
											Close
										</Button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			{selected && (
				<dialog
					open
					aria-label="RSS feed details"
					className="fixed inset-0 m-auto max-h-[80vh] overflow-auto rounded border bg-background p-6"
				>
					<h2 className="text-xl">{selected.meta.title || selected.slug}</h2>
					<label className="block">
						Feed URL
						<input
							className="w-full"
							readOnly
							value={`${window.location.origin}${window.__ABS_WEB_CONFIG__?.basePath || ''}${selected.feedUrl}`}
						/>
					</label>
					<p>
						Prevent indexing: {selected.meta.preventIndexing ? 'Yes' : 'No'}
					</p>
					{selected.meta.ownerName && <p>Owner: {selected.meta.ownerName}</p>}
					{selected.meta.ownerEmail && (
						<p>Owner email: {selected.meta.ownerEmail}</p>
					)}
					<h3>Episodes</h3>
					<ul className="max-h-64 overflow-auto">
						{selected.episodes.map((e) => (
							<li key={e.id}>{e.title}</li>
						))}
					</ul>
					<Button onClick={() => setSelected(null)}>Close</Button>
				</dialog>
			)}
		</section>
	)
}
function message(e: unknown) {
	return e instanceof Error ? e.message : 'Request failed'
}
