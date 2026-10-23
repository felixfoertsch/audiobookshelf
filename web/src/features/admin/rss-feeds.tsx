import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import { api, useAuth } from '../../api'
import { Button } from '../../shared/components/ui/button'
import { Input } from '../../shared/components/ui/input'
import { Label } from '../../shared/components/ui/label'
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '../../shared/components/ui/sheet'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '../../shared/components/ui/table'
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
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')
	const load = useCallback(async () => {
		if (!admin) {
			setLoading(false)
			return
		}
		setLoading(true)
		setError('')
		try {
			const r = await api('/api/feeds', schema)
			setFeeds(r.feeds)
		} catch (e) {
			setError(message(e))
		} finally {
			setLoading(false)
		}
	}, [admin])
	useEffect(() => {
		void load()
	}, [load])
	return (
		<section className="space-y-4">
			<h1 className="text-2xl">RSS feeds</h1>
			{error ? (
				<div>
					<p role="alert">{error}</p>
					<Button onClick={() => void load()}>Retry</Button>
				</div>
			) : loading ? (
				<p role="status">Loading RSS feeds…</p>
			) : !admin ? (
				<p>Administrator permission required to view RSS feeds.</p>
			) : feeds.length === 0 ? (
				<p>No RSS feeds.</p>
			) : (
				<div className="overflow-x-auto">
					<Table className="w-full text-left">
						<TableHeader>
							<TableRow>
								<TableHead>Title</TableHead>
								<TableHead>Slug</TableHead>
								<TableHead>Type</TableHead>
								<TableHead>Episodes</TableHead>
								<TableHead>Prevent indexing</TableHead>
								<TableHead>Updated</TableHead>
								<TableHead>Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{feeds.map((f) => (
								<TableRow className="border-t" key={f.id}>
									<TableCell>
										<Sheet>
											<SheetTrigger asChild>
												<button type="button" className="underline">
													{f.meta.title || f.slug}
												</button>
											</SheetTrigger>
											<SheetContent className="w-full overflow-y-auto p-6 sm:max-w-xl">
												<SheetHeader>
													<SheetTitle>{f.meta.title || f.slug}</SheetTitle>
													<SheetDescription>
														RSS feed details and episodes
													</SheetDescription>
												</SheetHeader>
												<Label className="block">
													Feed URL
													<Input
														className="w-full"
														readOnly
														value={`${window.location.origin}${window.__ABS_WEB_CONFIG__?.basePath || ''}${f.feedUrl}`}
													/>
												</Label>
												<p>
													Prevent indexing:{' '}
													{f.meta.preventIndexing ? 'Yes' : 'No'}
												</p>
												{f.meta.ownerName && <p>Owner: {f.meta.ownerName}</p>}
												{f.meta.ownerEmail && (
													<p>Owner email: {f.meta.ownerEmail}</p>
												)}
												<h3>Episodes</h3>
												<ul className="max-h-64 overflow-auto">
													{f.episodes.map((e) => (
														<li key={e.id}>{e.title}</li>
													))}
												</ul>
												<SheetClose asChild>
													<Button>Close</Button>
												</SheetClose>
											</SheetContent>
										</Sheet>
									</TableCell>
									<TableCell>{f.slug}</TableCell>
									<TableCell>{f.entityType}</TableCell>
									<TableCell>{f.episodes.length}</TableCell>
									<TableCell>{f.meta.preventIndexing ? 'Yes' : 'No'}</TableCell>
									<TableCell>
										{f.updatedAt ? dateTime(f.updatedAt) : ''}
									</TableCell>
									<TableCell>
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
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}
		</section>
	)
}
function message(e: unknown) {
	return e instanceof Error ? e.message : 'Request failed'
}
