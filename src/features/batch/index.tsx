import { useBlocker, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { api, useAuth } from '../../api'
import { Button } from '../../shared/components/ui/button'
import { appendUnique, seriesValues, splitNames } from './model'

const entry = z
	.object({
		id: z.string(),
		libraryId: z.string().optional(),
		mediaType: z.enum(['book', 'podcast']),
		media: z
			.object({
				tags: z.array(z.string()).optional(),
				metadata: z.object({ title: z.string().nullish() }).passthrough(),
			})
			.passthrough(),
	})
	.passthrough()
const batchSchema = z.object({ libraryItems: z.array(entry) })
const resultSchema = z.object({
	success: z.boolean().optional(),
	updates: z.number().optional(),
})
const fields = [
	'subtitle',
	'authors',
	'publishedYear',
	'series',
	'genres',
	'tags',
	'narrators',
	'publisher',
	'language',
	'explicit',
	'abridged',
] as const
const bookDetails = ['title', ...fields, 'description', 'isbn', 'asin'] as const
const podcastDetails = [
	'title',
	'author',
	'feedUrl',
	'description',
	'genres',
	'tags',
	'releaseDate',
	'itunesId',
	'language',
	'explicit',
	'type',
] as const
type Field = (typeof bookDetails)[number] | (typeof podcastDetails)[number]
type Item = z.infer<typeof entry>
export const batchSearch = z.object({ ids: z.string().catch('') })
export function BatchPage({ ids }: { ids: string }) {
	const navigate = useNavigate()
	const [items, setItems] = useState<Item[]>([])
	const [original, setOriginal] = useState<Item[]>([])
	const dirty = JSON.stringify(items) !== JSON.stringify(original)
	useBlocker({
		shouldBlockFn: () =>
			dirty && !window.confirm('Discard unsaved changes and leave this page?'),
		enableBeforeUnload: false,
	})
	useEffect(() => {
		if (!dirty) return
		const prevent = (event: BeforeUnloadEvent) => {
			event.preventDefault()
			event.returnValue = ''
		}
		window.addEventListener('beforeunload', prevent)
		return () => window.removeEventListener('beforeunload', prevent)
	}, [dirty])
	const [error, setError] = useState('')
	const [busy, setBusy] = useState(false)
	const [mapValues, setMapValues] = useState<Partial<Record<Field, string>>>({})
	const [usage, setUsage] = useState<Partial<Record<Field, boolean>>>({})
	const [mode, setMode] = useState<'overwrite' | 'append'>('overwrite')
	const [open, setOpen] = useState(false)
	const [loaded, setLoaded] = useState(false)
	const user = useAuth((s) => s.user)
	const idList = useMemo(() => ids.split(',').filter(Boolean), [ids])
	useEffect(() => {
		let active = true
		setLoaded(false)
		if (!idList.length) {
			setItems([])
			setError('Select items from a library first. No batch item IDs provided.')
			setLoaded(true)
			return () => {
				active = false
			}
		}
		void api('/api/items/batch/get', batchSchema, {
			method: 'POST',
			body: JSON.stringify({ libraryItemIds: idList }),
		})
			.then((d) => {
				if (active) {
					setItems(d.libraryItems)
					setOriginal(d.libraryItems)
					setError('')
				}
			})
			.catch((e) => {
				if (active)
					setError(e instanceof Error ? e.message : 'Failed to load items')
			})
			.finally(() => {
				if (active) setLoaded(true)
			})
		return () => {
			active = false
		}
	}, [idList])
	const get = (item: Item, key: Field): unknown =>
		key === 'tags' ? (item.media.tags ?? []) : item.media.metadata[key]
	const set = (item: Item, key: Field, value: unknown): Item =>
		key === 'tags'
			? { ...item, media: { ...item.media, tags: value as string[] } }
			: {
					...item,
					media: {
						...item.media,
						metadata: { ...item.media.metadata, [key]: value },
					},
				}
	const edit = (id: string, key: Field, value: unknown) =>
		setItems((xs) => xs.map((x) => (x.id === id ? set(x, key, value) : x)))
	const podcast = items.every((x) => x.mediaType === 'podcast')
	const editable = fields.filter(
		(k) =>
			!(
				podcast &&
				[
					'subtitle',
					'authors',
					'publishedYear',
					'series',
					'narrators',
					'publisher',
					'abridged',
				].includes(k)
			),
	)
	const appendable: Field[] = [
		'authors',
		'genres',
		'tags',
		'narrators',
		'series',
	]
	const text = (item: Item, key: Field) => {
		const value = get(item, key)
		return Array.isArray(value)
			? value
					.map((v) =>
						typeof v === 'string' ? v : (v as { name: string }).name,
					)
					.join(', ')
			: String(value ?? '')
	}
	const apply = () => {
		const keys = editable.filter((k) => usage[k])

		if (!keys.length) return
		setItems((xs) =>
			xs.map((original) => {
				let item = original
				for (const key of keys) {
					const old = get(item, key)
					const names = splitNames(mapValues[key] ?? '')
					let value: unknown = names.join(', ')
					if (key === 'explicit' || key === 'abridged')
						value = names[0] === 'true'
					else if (key === 'authors' || key === 'series') {
						const existing = items.flatMap(
							(x) =>
								(get(x, key) as
									| Array<{ id: string; name: string }>
									| undefined) ?? [],
						)
						const resolved = seriesValues(names, existing)
						value =
							mode === 'append'
								? appendUnique(
										(old as Array<{ id: string; name: string }> | undefined) ??
											[],
										resolved,
										(x) => `${x.id}|${x.name.toLowerCase()}`,
									)
								: resolved
					} else if (appendable.includes(key)) {
						const strings = names
						if (mode === 'append')
							value = appendUnique(
								(old as string[] | undefined) ?? [],
								strings,
								(x) => x,
							)
					}
					item = set(item, key, value)
				}
				return item
			}),
		)
		setOpen(false)
	}
	const allowed =
		!!user &&
		((user as unknown as { permissions?: { update?: boolean } }).permissions
			?.update === true ||
			['admin', 'root'].includes(
				(user as unknown as { type?: string }).type || '',
			))
	const saveChanges = async () => {
		if (!allowed || !dirty) return
		setBusy(true)
		setError('')
		try {
			const updates = items
				.filter(
					(item) =>
						JSON.stringify(item) !==
						JSON.stringify(original.find((entry) => entry.id === item.id)),
				)
				.map((item) => {
					const metadata = { ...item.media.metadata }
					for (const key of [
						'authors',
						'series',
						'genres',
						'narrators',
					] as const)
						if (item.media.metadata[key] !== undefined)
							metadata[key] = item.media.metadata[key]
					delete metadata.tags
					const payload: Record<string, unknown> = { metadata }
					if (item.media.tags !== undefined) payload.tags = item.media.tags
					return { id: item.id, mediaPayload: payload }
				})
			const result = await api('/api/items/batch/update', resultSchema, {
				method: 'POST',
				body: JSON.stringify(updates),
			})
			if (result.success) {
				setItems([])
				setOriginal([])
				await navigate({ to: '/' })
			} else setError('Server did not confirm batch update')
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Batch update failed')
		} finally {
			setBusy(false)
		}
	}
	return (
		<section className="space-y-6">
			<h1 className="text-3xl font-semibold">Batch edit</h1>
			{error && (
				<p role="alert" className="text-destructive">
					{error}
				</p>
			)}
			{!loaded && <p role="status">Loading selected items…</p>}
			{items.length > 0 && (
				<>
					<div className="rounded border">
						<button
							type="button"
							className="w-full p-4 text-left"
							aria-expanded={open}
							onClick={() => setOpen(!open)}
						>
							Map details across items {open ? '−' : '+'}
						</button>
						{open && (
							<div className="space-y-4 p-4">
								<fieldset>
									<legend>Mapping mode</legend>
									<label className="mr-4">
										<input
											type="radio"
											checked={mode === 'overwrite'}
											onChange={() => setMode('overwrite')}
										/>
										Overwrite
									</label>
									<label>
										<input
											type="radio"
											checked={mode === 'append'}
											onChange={() => setMode('append')}
										/>
										Append
									</label>
								</fieldset>
								{editable.map((k) => (
									<div key={k} className="mb-3">
										<label className="inline-flex items-center gap-2">
											<input
												type="checkbox"
												checked={!!usage[k]}
												onChange={(e) =>
													setUsage({ ...usage, [k]: e.target.checked })
												}
											/>
											{k}
										</label>
										{k === 'explicit' || k === 'abridged' ? (
											<select
												className="ml-2 rounded border bg-background p-2"
												value={mapValues[k] ?? 'false'}
												onChange={(e) =>
													setMapValues({ ...mapValues, [k]: e.target.value })
												}
											>
												<option value="false">False</option>
												<option value="true">True</option>
											</select>
										) : (
											<input
												aria-label={`${k} mapped value`}
												className="ml-2 rounded border bg-background p-2"
												value={mapValues[k] ?? ''}
												onChange={(e) =>
													setMapValues({ ...mapValues, [k]: e.target.value })
												}
												placeholder="Comma-separated lists"
											/>
										)}
									</div>
								))}
								<Button
									disabled={!Object.values(usage).some(Boolean)}
									onClick={apply}
								>
									Apply selected fields
								</Button>
							</div>
						)}
					</div>
					{items.map((item) => (
						<article key={item.id} className="space-y-3 rounded border p-4">
							<h2>
								{item.media.metadata.title || item.id} ({item.mediaType})
							</h2>
							<div className="grid gap-3 sm:grid-cols-2">
								{(item.mediaType === 'podcast'
									? podcastDetails
									: bookDetails
								).map((k) => (
									<div key={k} className="block">
										<label htmlFor={`${item.id}-${k}`}>{k}</label>
										{k === 'explicit' || k === 'abridged' ? (
											<input
												id={`${item.id}-${k}`}
												className="ml-2"
												type="checkbox"
												checked={!!get(item, k)}
												onChange={(e) => edit(item.id, k, e.target.checked)}
											/>
										) : k === 'description' ? (
											<textarea
												id={`${item.id}-${k}`}
												className="mt-1 block w-full rounded border bg-background p-2"
												rows={4}
												value={text(item, k)}
												onChange={(e) => edit(item.id, k, e.target.value)}
											/>
										) : k === 'type' ? (
											<select
												id={`${item.id}-${k}`}
												className="mt-1 block w-full rounded border bg-background p-2"
												value={text(item, k) || 'episodic'}
												onChange={(e) => edit(item.id, k, e.target.value)}
											>
												<option value="episodic">Episodic</option>
												<option value="serial">Serial</option>
											</select>
										) : (
											<input
												id={`${item.id}-${k}`}
												className="mt-1 block w-full rounded border bg-background p-2"
												value={text(item, k)}
												onChange={(e) => {
													const names = splitNames(e.target.value)
													if (k === 'authors' || k === 'series') {
														const current =
															(get(item, k) as
																| Array<{ id: string; name: string }>
																| undefined) ?? []
														edit(
															item.id,
															k,
															names.map(
																(name) =>
																	current.find(
																		(x) =>
																			x.name.toLowerCase() ===
																			name.toLowerCase(),
																	) ?? { id: `new-${name}`, name },
															),
														)
													} else if (appendable.includes(k))
														edit(item.id, k, names)
													else edit(item.id, k, e.target.value || null)
												}}
											/>
										)}
									</div>
								))}
							</div>
							{item.mediaType === 'book' &&
								(
									(get(item, 'series') as
										| Array<{
												id: string
												name: string
												sequence?: string | null
										  }>
										| undefined) ?? []
								).map((series) => (
									<label key={series.id} className="block">
										{series.name} · Sequence
										<input
											className="ml-3 rounded border bg-background p-2"
											value={series.sequence ?? ''}
											onChange={(event) =>
												edit(
													item.id,
													'series',
													(
														(get(item, 'series') as Array<{ id: string }>) ?? []
													).map((entry) =>
														entry.id === series.id
															? {
																	...entry,
																	sequence: event.target.value || null,
																}
															: entry,
													),
												)
											}
										/>
									</label>
								))}
						</article>
					))}
					<Button
						disabled={busy || !allowed || !dirty}
						onClick={() => void saveChanges()}
					>
						{busy ? 'Saving…' : 'Save changes'}
					</Button>
					<Button
						variant="outline"
						className="ml-3"
						disabled={busy || !dirty}
						onClick={() => {
							if (window.confirm('Discard unsaved changes?')) setItems(original)
						}}
					>
						Reset changes
					</Button>
					{!allowed && <p role="note">Account lacks item-update permission.</p>}
				</>
			)}
		</section>
	)
}
