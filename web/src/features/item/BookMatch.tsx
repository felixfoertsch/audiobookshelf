import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { api, useAuth } from '../../api'
import { Button } from '../../shared/components/ui/button'
import { Input } from '../../shared/components/ui/input'
import { NativeSelect } from '../../shared/components/ui/native-select'

const providersSchema = z.object({
	providers: z.object({
		books: z.array(z.object({ value: z.string(), text: z.string() })),
	}),
})
const resultSchema = z
	.object({
		title: z.string().optional(),
		subtitle: z.string().nullable().optional(),
		author: z
			.union([z.string(), z.array(z.string())])
			.nullable()
			.optional(),
		narrator: z
			.union([z.string(), z.array(z.string())])
			.nullable()
			.optional(),
		description: z.string().nullable().optional(),
		publisher: z.string().nullable().optional(),
		publishedYear: z.union([z.string(), z.number()]).nullable().optional(),
		series: z
			.array(
				z.object({
					series: z.string(),
					sequence: z.union([z.string(), z.number()]).nullable().optional(),
				}),
			)
			.nullable()
			.optional(),
		genres: z
			.union([z.array(z.string()), z.string()])
			.nullable()
			.optional(),
		tags: z
			.union([z.array(z.string()), z.string()])
			.nullable()
			.optional(),
		language: z.string().nullable().optional(),
		isbn: z.string().nullable().optional(),
		asin: z.string().nullable().optional(),
		explicit: z.boolean().nullable().optional(),
		abridged: z.boolean().nullable().optional(),
		cover: z.string().url().nullable().optional(),
	})
	.passthrough()
const resultsSchema = z
	.union([z.array(resultSchema), z.null()])
	.transform((results) => results ?? [])
const responseSchema = z
	.object({ updated: z.boolean().optional() })
	.passthrough()
type Match = z.infer<typeof resultSchema>
type SeriesRow = { key: string; series: string; sequence: string }
type Props = {
	id: string
	metadata: Record<string, unknown>
	onApplied: () => Promise<void>
}
const fields = [
	'title',
	'subtitle',
	'author',
	'narrator',
	'description',
	'publisher',
	'publishedYear',
	'series',
	'genres',
	'tags',
	'language',
	'isbn',
	'asin',
	'explicit',
	'abridged',
] as const
const labels: Record<string, string> = {
	title: 'Title',
	subtitle: 'Subtitle',
	author: 'Authors',
	narrator: 'Narrators',
	description: 'Description',
	publisher: 'Publisher',
	publishedYear: 'Published year',
	series: 'Series',
	genres: 'Genres',
	tags: 'Tags',
	language: 'Language',
	isbn: 'ISBN',
	asin: 'ASIN',
	explicit: 'Explicit',
	abridged: 'Abridged',
	cover: 'Cover',
}
function httpUrl(value: unknown): value is string {
	if (typeof value !== 'string') return false
	try {
		const url = new URL(value)
		return url.protocol === 'http:' || url.protocol === 'https:'
	} catch {
		return false
	}
}

export function BookMatch({ id, metadata, onApplied }: Props) {
	const ownerId = useAuth((state) => state.user?.id)
	const canUpdate = Boolean(
		(
			useAuth((state) => state.user) as {
				permissions?: { update?: boolean }
			} | null
		)?.permissions?.update,
	)
	const active = useRef(true)
	const lock = useRef(false)
	const searchButton = useRef<HTMLButtonElement>(null)
	const reviewHeading = useRef<HTMLHeadingElement>(null)
	const identity = useRef({ id, ownerId, permission: canUpdate })
	identity.current = { id, ownerId, permission: canUpdate }
	const currentOwner = useCallback(
		() =>
			active.current &&
			!!ownerId &&
			identity.current.id === id &&
			identity.current.ownerId === ownerId &&
			identity.current.permission &&
			useAuth.getState().user?.id === ownerId &&
			Boolean(
				(
					useAuth.getState().user as {
						permissions?: { update?: boolean }
					} | null
				)?.permissions?.update,
			),
		[id, ownerId],
	)
	const [providers, setProviders] = useState<{ value: string; text: string }[]>(
		[],
	)
	const [provider, setProvider] = useState('google')
	const [title, setTitle] = useState(String(metadata.title ?? ''))
	const [author, setAuthor] = useState(String(metadata.authorName ?? ''))
	const [results, setResults] = useState<Match[]>([])
	const [selected, setSelected] = useState<Match | null>(null)
	const [values, setValues] = useState<Match>({})
	const [series, setSeries] = useState<SeriesRow[]>([])
	const [checked, setChecked] = useState<Record<string, boolean>>({})
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState('')
	const [searched, setSearched] = useState(false)
	useEffect(() => {
		if (selected) reviewHeading.current?.focus()
	}, [selected])
	useEffect(() => {
		active.current = true
		void api('/api/search/providers', providersSchema)
			.then((data) => {
				if (currentOwner()) setProviders(data.providers.books)
			})
			.catch((e) => {
				if (currentOwner())
					setError(e instanceof Error ? e.message : 'Provider loading failed')
			})
		return () => {
			active.current = false
		}
	}, [currentOwner])
	async function search(e: React.FormEvent) {
		e.preventDefault()
		if (!currentOwner() || !canUpdate || !title.trim() || lock.current) return
		lock.current = true
		setBusy(true)
		setError('')
		setSearched(true)
		setResults([])
		setSelected(null)
		try {
			const query = new URLSearchParams({
				provider,
				title: title.trim(),
				author: author.trim(),
				id,
			})
			const found =
				(await api(`/api/search/books?${query}`, resultsSchema)) ?? []
			if (currentOwner())
				setResults(found.filter((row) => typeof row.title === 'string'))
		} catch (e) {
			if (currentOwner())
				setError(e instanceof Error ? e.message : 'Search failed')
		} finally {
			lock.current = false
			if (currentOwner()) setBusy(false)
		}
	}
	function choose(match: Match) {
		setSelected(match)
		setValues({ ...match })
		setSeries(
			(match.series ?? []).map((row) => ({
				key: crypto.randomUUID(),
				series: row.series,
				sequence: String(row.sequence ?? ''),
			})),
		)
		setChecked(
			Object.fromEntries([
				...fields
					.filter((field) => match[field] != null)
					.map((field) => [field, true]),
				...(match.cover ? [['cover', true]] : []),
			]),
		)
	}
	async function apply() {
		if (!currentOwner() || !canUpdate || !selected || lock.current) return
		const metadataUpdate: Record<string, unknown> = {}
		for (const field of fields)
			if (checked[field] && values[field] !== undefined) {
				if (field === 'author')
					metadataUpdate.authors = (
						Array.isArray(values.author)
							? values.author
							: String(values.author).split(',')
					)
						.map((name) => ({ name: String(name).trim() }))
						.filter((row) => row.name)
				else if (field === 'narrator')
					metadataUpdate.narrators = (
						Array.isArray(values.narrator)
							? values.narrator
							: String(values.narrator).split(',')
					)
						.map((name) => String(name).trim())
						.filter(Boolean)
				else if (field === 'series')
					metadataUpdate.series = series
						.map((row) => ({
							series: row.series.trim(),
							sequence: row.sequence.trim(),
						}))
						.filter((row) => row.series)
						.map(({ series: seriesName, sequence }) => ({
							name: seriesName,
							sequence,
						}))
				else if (field === 'genres' || field === 'tags') {
					/* mapped below */
				} else metadataUpdate[field] = values[field]
			}
		for (const field of ['genres', 'tags'] as const)
			if (checked[field] && values[field] !== undefined)
				metadataUpdate[field] = Array.isArray(values[field])
					? values[field]
					: String(values[field])
							.split(',')
							.map((s) => s.trim())
							.filter(Boolean)
		const payload: {
			metadata?: Record<string, unknown>
			tags?: string[]
			url?: string
		} = {}
		if (Object.keys(metadataUpdate).length) payload.metadata = metadataUpdate
		if (checked.tags && Array.isArray(metadataUpdate.tags)) {
			payload.tags = metadataUpdate.tags as string[]
			delete metadataUpdate.tags
		}
		if (checked.cover) {
			if (!httpUrl(values.cover)) {
				setError('Cover URL must use HTTP or HTTPS.')
				return
			}
			payload.url = values.cover
		}
		if (!Object.keys(payload).length) return
		lock.current = true
		setBusy(true)
		setError('')
		try {
			await api(`/api/items/${encodeURIComponent(id)}/media`, responseSchema, {
				method: 'PATCH',
				body: JSON.stringify(payload),
			})
			if (currentOwner()) {
				await onApplied()
				setSelected(null)
				searchButton.current?.focus()
			}
		} catch (e) {
			if (currentOwner())
				setError(e instanceof Error ? e.message : 'Apply failed')
		} finally {
			lock.current = false
			if (currentOwner()) setBusy(false)
		}
	}
	return (
		<section className="space-y-3">
			{error && <p role="alert">{error}</p>}
			{!canUpdate && <p role="alert">Update permission required.</p>}
			<form className="flex flex-wrap items-end gap-2" onSubmit={search}>
				<label htmlFor={'match-control-1'} className="grid gap-1">
					Provider
					<NativeSelect
						id={'match-control-1'}
						aria-label="Provider"
						value={provider}
						onChange={(e) => setProvider(e.target.value)}
					>
						{providers.map((p) => (
							<option key={p.value} value={p.value}>
								{p.text}
							</option>
						))}
					</NativeSelect>
				</label>
				<label htmlFor={'match-control-2'} className="grid gap-1">
					Search title
					<Input
						id={'match-control-2'}
						aria-label="Search title"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
					/>
				</label>
				<label htmlFor={'match-control-3'} className="grid gap-1">
					Author
					<Input
						id={'match-control-3'}
						aria-label="Search author"
						value={author}
						onChange={(e) => setAuthor(e.target.value)}
					/>
				</label>
				<Button
					ref={searchButton}
					disabled={!canUpdate || busy || !title.trim()}
				>
					Search
				</Button>
			</form>
			{busy && <p role="status">Searching or applying…</p>}
			{searched && !busy && !results.length && <p>No results.</p>}
			{results.map((result) => (
				<Button
					key={JSON.stringify(result)}
					variant="outline"
					onClick={() => choose(result)}
				>
					{result.title}
					{result.author
						? ` — ${Array.isArray(result.author) ? result.author.join(', ') : result.author}`
						: ''}
				</Button>
			))}
			{selected && (
				<div className="space-y-2 border-t pt-3">
					<h3 className="font-semibold" tabIndex={-1} ref={reviewHeading}>
						Review match
					</h3>
					<Button
						variant="outline"
						onClick={() => {
							setSelected(null)
							searchButton.current?.focus()
						}}
					>
						Back to results
					</Button>
					<label>
						<input
							type="checkbox"
							checked={
								Object.values(checked).length > 0 &&
								Object.values(checked).every(Boolean)
							}
							onChange={(event) =>
								setChecked((current) =>
									Object.fromEntries(
										Object.keys(current).map((field) => [
											field,
											event.target.checked,
										]),
									),
								)
							}
						/>{' '}
						Select all match fields
					</label>
					{(['cover', ...fields] as const)
						.filter((field) =>
							field === 'cover'
								? values.cover != null
								: values[field] !== undefined && values[field] !== null,
						)
						.map((field) => (
							<div key={field} className="flex items-center gap-2">
								<input
									aria-label={`Apply ${labels[field]}`}
									type="checkbox"
									checked={!!checked[field]}
									onChange={(e) =>
										setChecked((old) => ({ ...old, [field]: e.target.checked }))
									}
								/>
								{field === 'series' ? (
									<fieldset disabled={!checked.series} className="grow">
										<legend>{labels.series}</legend>
										{series.map((row, index) => (
											<div key={row.key} className="grid gap-2 sm:grid-cols-2">
												<label htmlFor={`match-control-4-${index}`}>
													Series name
													<Input
														id={`match-control-4-${index}`}
														value={row.series}
														onChange={(e) =>
															setSeries((old) =>
																old.map((r, i) =>
																	i === index
																		? { ...r, series: e.target.value }
																		: r,
																),
															)
														}
													/>
												</label>
												<label htmlFor={`match-control-5-${index}`}>
													Sequence
													<Input
														id={`match-control-5-${index}`}
														value={row.sequence}
														onChange={(e) =>
															setSeries((old) =>
																old.map((r, i) =>
																	i === index
																		? { ...r, sequence: e.target.value }
																		: r,
																),
															)
														}
													/>
												</label>
											</div>
										))}
									</fieldset>
								) : field === 'cover' ? (
									<div className="grow">
										<label htmlFor={'match-control-6'}>
											{labels.cover}
											<Input
												id={'match-control-6'}
												aria-label="Cover URL"
												disabled={!checked.cover}
												value={String(values.cover ?? '')}
												onChange={(e) =>
													setValues((old) => ({
														...old,
														cover: e.target.value,
													}))
												}
											/>
										</label>
										{httpUrl(values.cover) && (
											<img
												className="mt-2 h-28"
												src={values.cover}
												alt="Selected cover preview"
											/>
										)}
										{httpUrl(metadata.cover) && (
											<img
												className="mt-2 h-28"
												src={metadata.cover}
												alt="Current cover"
											/>
										)}
									</div>
								) : typeof values[field] === 'boolean' ? (
									<label className="grow">
										{labels[field]}
										<input
											aria-label={labels[field]}
											type="checkbox"
											disabled={!checked[field]}
											checked={values[field] as boolean}
											onChange={(e) =>
												setValues((old) => ({
													...old,
													[field]: e.target.checked,
												}))
											}
										/>
									</label>
								) : (
									<label
										htmlFor={`match-control-7-${field}`}
										className="grid grow gap-1"
									>
										{labels[field]}
										<Input
											id={`match-control-7-${field}`}
											disabled={!checked[field]}
											value={
												Array.isArray(values[field])
													? values[field].join(', ')
													: String(values[field] ?? '')
											}
											onChange={(e) =>
												setValues((old) => ({
													...old,
													[field]: e.target.value,
												}))
											}
										/>
									</label>
								)}
								{metadata[field] != null && field !== 'cover' && (
									<span className="text-sm">
										Current: {String(metadata[field])}
									</span>
								)}
							</div>
						))}
					<Button
						disabled={
							!canUpdate || busy || !Object.values(checked).some(Boolean)
						}
						onClick={() => void apply()}
					>
						Apply selected fields
					</Button>
				</div>
			)}
		</section>
	)
}
