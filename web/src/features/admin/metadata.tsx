import { useEffect, useState } from 'react'
import { z } from 'zod'
import { api } from '../../api'
import { Button } from '../../shared/components/ui/button'
import { Input } from '../../shared/components/ui/input'
import { Label } from '../../shared/components/ui/label'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '../../shared/components/ui/table'

const tagsSchema = z.object({ tags: z.array(z.string()) })
const genresSchema = z.object({ genres: z.array(z.string()) })
const countSchema = z.object({
	numItemsUpdated: z.number(),
	tagMerged: z.boolean().optional(),
	genreMerged: z.boolean().optional(),
})
const providersSchema = z.object({
	providers: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			url: z.string(),
			authHeaderValue: z.string().nullish(),
		}),
	),
})
const providerSchema = z.object({
	provider: providersSchema.shape.providers.element,
})

export function MetadataList({ kind }: { kind: 'tags' | 'genres' }) {
	const [values, setValues] = useState<string[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')
	const [editing, setEditing] = useState('')
	const [replacement, setReplacement] = useState('')
	const field = kind === 'tags' ? 'tag' : 'genre'
	useEffect(() => {
		let live = true
		setLoading(true)
		const request =
			kind === 'tags' ? api('/tags', tagsSchema) : api('/genres', genresSchema)
		void request
			.then((data) => {
				if (!live) return
				const items = 'tags' in data ? data.tags : data.genres
				setValues(
					items.sort((a, b) =>
						a.localeCompare(b, undefined, { sensitivity: 'base' }),
					),
				)
				setError('')
			})
			.catch((e: unknown) => {
				if (live) setError(e instanceof Error ? e.message : 'Load failed')
			})
			.finally(() => {
				if (live) setLoading(false)
			})
		return () => {
			live = false
		}
	}, [kind])
	async function save(oldValue: string) {
		if (loading) return
		const name = replacement.trim()
		if (!name || name === oldValue) {
			setEditing('')
			return
		}
		const existing = values.find(
			(value) =>
				value !== oldValue && value.toLowerCase() === name.toLowerCase(),
		)
		if (existing) {
			const detail =
				existing === name
					? `This will merge with "${existing}".`
					: `This differs only by case from "${existing}".`
			if (!window.confirm(`Rename "${oldValue}" to "${name}"? ${detail}`))
				return
		}
		setLoading(true)
		try {
			const result = await api(`/${kind}/rename`, countSchema, {
				method: 'POST',
				body: JSON.stringify({
					[field]: oldValue,
					[kind === 'tags' ? 'newTag' : 'newGenre']: name,
				}),
			})
			setValues((current) =>
				[
					...new Set(
						current
							.filter(
								(value) =>
									value !== oldValue &&
									!(
										(kind === 'tags' ? result.tagMerged : result.genreMerged) &&
										value === name
									),
							)
							.concat(name),
					),
				].sort((a, b) =>
					a.localeCompare(b, undefined, { sensitivity: 'base' }),
				),
			)
			setEditing('')
			setError(`${result.numItemsUpdated} items updated`)
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Rename failed')
		} finally {
			setLoading(false)
		}
	}
	async function remove(value: string) {
		if (loading) return
		if (
			!window.confirm(
				`Remove ${kind === 'tags' ? 'tag' : 'genre'} "${value}" from all items?`,
			)
		)
			return
		setLoading(true)
		try {
			const base64 = btoa(
				String.fromCharCode(...new TextEncoder().encode(value)),
			)
			const result = await api(
				`/${kind}/${encodeURIComponent(base64)}`,
				z.object({ numItemsUpdated: z.number() }),
				{ method: 'DELETE' },
			)
			setValues((current) => current.filter((entry) => entry !== value))
			setError(`${result.numItemsUpdated} items updated`)
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Remove failed')
		} finally {
			setLoading(false)
		}
	}
	return (
		<section className="space-y-4">
			<h1 className="text-2xl">Manage {kind}</h1>
			<Button variant="outline" onClick={() => history.back()}>
				Back
			</Button>
			{loading && <p role="status">Loading {kind}…</p>}
			{error && <p role="status">{error}</p>}
			{!loading && values.length === 0 && !error && <p>No {kind}.</p>}
			<ul className="divide-y rounded border">
				{values.map((value) => (
					<li key={value} className="flex items-center gap-2 p-2">
						{editing === value ? (
							<>
								<Input
									aria-label={`Rename ${value}`}
									value={replacement}
									onChange={(event) => setReplacement(event.target.value)}
								/>
								<Button disabled={loading} onClick={() => void save(value)}>
									Save
								</Button>
								<Button variant="outline" onClick={() => setEditing('')}>
									Cancel
								</Button>
							</>
						) : (
							<>
								<span className="flex-1">{value}</span>
								<Button
									variant="outline"
									onClick={() => {
										setEditing(value)
										setReplacement(value)
									}}
								>
									Edit
								</Button>
								<Button
									variant="destructive"
									disabled={loading}
									onClick={() => void remove(value)}
								>
									Delete
								</Button>
							</>
						)}
					</li>
				))}
			</ul>
		</section>
	)
}

export function Providers() {
	const [providers, setProviders] = useState<
		z.infer<typeof providersSchema>['providers']
	>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')
	const [adding, setAdding] = useState(false)
	const [name, setName] = useState('')
	const [url, setUrl] = useState('')
	const [authHeaderValue, setAuth] = useState('')
	useEffect(() => {
		let live = true
		const load = () => api('/custom-metadata-providers', providersSchema)
		void load()
			.then((data) => {
				if (live) {
					setProviders(data.providers)
					setError('')
				}
			})
			.catch((e: unknown) => {
				if (live) setError(e instanceof Error ? e.message : 'Load failed')
			})
			.finally(() => {
				if (live) setLoading(false)
			})
		const onSocket = (event: Event) => {
			const eventName = (event as CustomEvent<{ event?: string }>).detail?.event
			if (
				eventName === 'reconnect' ||
				eventName === 'custom_metadata_provider_added' ||
				eventName === 'custom_metadata_provider_removed'
			) {
				void load()
					.then((data) => {
						if (live) {
							setProviders(data.providers)
							setError('')
						}
					})
					.catch((e: unknown) => {
						if (live)
							setError(
								e instanceof Error ? e.message : 'Provider refresh failed',
							)
					})
			}
		}
		window.addEventListener('abs:socket', onSocket)
		return () => {
			live = false
			window.removeEventListener('abs:socket', onSocket)
		}
	}, [])
	async function add(event: React.FormEvent) {
		event.preventDefault()
		if (loading) return
		if (!name.trim() || !url.trim()) {
			setError('Name and URL required')
			return
		}
		let parsedUrl: URL
		try {
			parsedUrl = new URL(url.trim())
		} catch {
			setError('Enter a valid HTTP or HTTPS URL')
			return
		}
		if (
			!['http:', 'https:'].includes(parsedUrl.protocol) ||
			!parsedUrl.hostname
		) {
			setError('Enter a valid HTTP or HTTPS URL')
			return
		}
		setLoading(true)
		try {
			const result = await api('/custom-metadata-providers', providerSchema, {
				method: 'POST',
				body: JSON.stringify({
					name: name.trim(),
					url: url.trim(),
					mediaType: 'book',
					authHeaderValue,
				}),
			})
			setProviders((current) => [...current, result.provider])
			setAdding(false)
			setName('')
			setUrl('')
			setAuth('')
			setError('Provider created')
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Create failed')
		} finally {
			setLoading(false)
		}
	}
	async function remove(id: string) {
		if (loading) return
		if (!window.confirm('Delete this metadata provider?')) return
		setLoading(true)
		try {
			await api(
				`/custom-metadata-providers/${encodeURIComponent(id)}`,
				z.object({}),
				{ method: 'DELETE' },
			)
			setProviders((current) =>
				current.filter((provider) => provider.id !== id),
			)
			setError('Provider removed')
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Remove failed')
		} finally {
			setLoading(false)
		}
	}
	return (
		<section className="space-y-4">
			<h1 className="text-2xl">Custom metadata providers</h1>
			<Button variant="outline" onClick={() => history.back()}>
				Back
			</Button>
			<Button disabled={loading} onClick={() => setAdding(!adding)}>
				Add
			</Button>
			{loading && <p role="status">Loading providers…</p>}
			{error && <p role="status">{error}</p>}
			{adding && (
				<form className="grid gap-3" onSubmit={(event) => void add(event)}>
					<Label>
						Name
						<Input
							required
							value={name}
							onChange={(event) => setName(event.target.value)}
						/>
					</Label>
					<Label>
						Media type
						<Input readOnly value="Book" />
					</Label>
					<Label>
						URL
						<Input
							required
							type="url"
							value={url}
							onChange={(event) => setUrl(event.target.value)}
						/>
					</Label>
					<Label>
						Authorization header value
						<Input
							type="password"
							value={authHeaderValue}
							onChange={(event) => setAuth(event.target.value)}
						/>
					</Label>
					<Button disabled={loading} type="submit">
						Save provider
					</Button>
				</form>
			)}
			{!loading && providers.length === 0 && !error && (
				<p>No custom metadata providers.</p>
			)}
			<div className="overflow-x-auto">
				<Table className="w-full text-left">
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>URL</TableHead>
							<TableHead>Authorization Header Value</TableHead>
							<TableHead />
						</TableRow>
					</TableHeader>
					<TableBody>
						{providers.map((provider) => (
							<TableRow key={provider.id}>
								<TableCell>{provider.name}</TableCell>
								<TableCell>{provider.url}</TableCell>
								<TableCell>
									<span
										role="status"
										aria-label={
											provider.authHeaderValue
												? 'Authorization value configured'
												: 'No authorization value'
										}
									>
										{provider.authHeaderValue ? 'Configured' : '—'}
									</span>
								</TableCell>
								<TableCell>
									<Button
										variant="destructive"
										disabled={loading}
										onClick={() => void remove(provider.id)}
									>
										Delete
									</Button>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</section>
	)
}
