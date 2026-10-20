import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { api, authHeaders, useAuth } from '../../api'
import { Button } from '../../shared/components/ui/button'
import { groupsFromFiles, type UploadFile } from './model'

const librariesSchema = z.object({
	libraries: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			mediaType: z.string(),
			folders: z
				.array(z.object({ id: z.string(), fullPath: z.string() }))
				.optional(),
			provider: z.string().nullish(),
		}),
	),
})
const pathSchema = z.object({
	exists: z.boolean(),
	libraryItemTitle: z.string().optional(),
})
const providersSchema = z.object({
	providers: z
		.object({
			books: z
				.array(z.object({ value: z.string(), text: z.string() }))
				.optional(),
		})
		.passthrough(),
})
const candidatesSchema = z.array(
	z
		.object({
			title: z.string(),
			author: z.string().nullish(),
			series: z.array(z.object({ series: z.string() })).optional(),
		})
		.passthrough(),
)
type Item = {
	id: number
	title: string
	author: string
	series: string
	files: File[]
	directory: string
	ignored: File[]
	status: string
	progress: number
	xhr?: XMLHttpRequest
	metadataError?: string
}
export function UploadPage() {
	const user = useAuth((state) => state.user)
	const allowed =
		!!user &&
		(['root', 'admin'].includes(String(user.type)) ||
			(user.permissions as { upload?: boolean } | undefined)?.upload === true)
	const cancelled = useRef(false)
	const activeUpload = useRef<XMLHttpRequest | null>(null)
	useEffect(
		() => () => {
			cancelled.current = true
			activeUpload.current?.abort()
		},
		[],
	)
	const [libraries, setLibraries] = useState<
		z.infer<typeof librariesSchema>['libraries']
	>([])
	const [libraryId, setLibraryId] = useState('')
	const [folderId, setFolderId] = useState('')
	const [items, setItems] = useState<Item[]>([])
	const [ignored, setIgnored] = useState<File[]>([])
	const [error, setError] = useState('')
	const [pending, setPending] = useState(false)
	const [providers, setProviders] = useState<{ value: string; text: string }[]>(
		[],
	)
	const [provider, setProvider] = useState('google')
	const [autoMetadata, setAutoMetadata] = useState(false)
	const [dragging, setDragging] = useState(false)
	const metadataRequests = useRef(new Set<number>())
	const library = libraries.find((x) => x.id === libraryId)
	const folders = library?.folders ?? []
	useEffect(() => {
		let active = true
		void api('/api/libraries', librariesSchema)
			.then((x) => {
				if (!active) return
				setLibraries(x.libraries)
				setLibraryId(x.libraries[0]?.id ?? '')
				setFolderId(x.libraries[0]?.folders?.[0]?.id ?? '')
				setProvider((current) => x.libraries[0]?.provider || current)
			})
			.catch((e) => {
				if (active) setError(e.message)
			})
		void api('/api/search/providers', providersSchema)
			.then((x) => {
				if (!active) return
				const ps = x.providers.books ?? []
				setProviders(ps)
				setProvider((current) =>
					current === 'google' ? ps[0]?.value || 'google' : current,
				)
			})
			.catch((e) => {
				if (active) setError(e.message)
			})
		return () => {
			active = false
		}
	}, [])
	const fetchMetadata = async (
		item: Item,
		selectedProvider = provider,
	): Promise<void> => {
		if (!item.title.trim() || metadataRequests.current.has(item.id)) return
		metadataRequests.current.add(item.id)
		setItems((old) =>
			old.map((x) =>
				x.id === item.id ? { ...x, metadataError: undefined } : x,
			),
		)
		try {
			const query = new URLSearchParams({
				title: item.title,
				author: item.author,
				provider: selectedProvider,
			})
			const [candidate] = await api(
				`/api/search/books?${query}`,
				candidatesSchema,
			)
			if (!candidate) {
				setItems((old) =>
					old.map((x) =>
						x.id === item.id
							? { ...x, metadataError: 'No metadata results' }
							: x,
					),
				)
				return
			}
			setItems((old) =>
				old.map((x) =>
					x.id === item.id
						? {
								...x,
								title: candidate.title,
								author: candidate.author ?? '',
								series: candidate.series?.[0]?.series ?? '',
								metadataError: undefined,
							}
						: x,
				),
			)
		} catch (cause) {
			const message =
				cause instanceof Error ? cause.message : 'Metadata search failed'
			setItems((old) =>
				old.map((x) =>
					x.id === item.id ? { ...x, metadataError: message } : x,
				),
			)
		} finally {
			metadataRequests.current.delete(item.id)
		}
	}
	const addFiles = (files: Iterable<UploadFile>) => {
		const groups = groupsFromFiles(files, library?.mediaType ?? 'book')
		const next = groups
			.filter((g) => g.files.length)
			.map((g, i) => ({
				id: Date.now() + i,
				title:
					g.directory.split('/').pop() ||
					g.files[0].name.replace(/\.[^.]+$/, ''),
				author: '',
				series: '',
				files: [...g.files, ...g.other],
				ignored: g.ignored,
				directory: g.directory,
				status: 'ready',
				progress: 0,
			}))
		setItems(next)
		setIgnored(groups.flatMap((g) => g.ignored))
		if (!next.length) setError('No uploadable media found')
		else {
			setError('')
			if (autoMetadata && library?.mediaType !== 'podcast')
				for (const item of next) void fetchMetadata(item)
		}
	}
	const addDrop = async (e: React.DragEvent) => {
		e.preventDefault()
		setDragging(false)
		const found: UploadFile[] = []
		const traverse = async (
			entry: FileSystemEntry,
			path = '',
		): Promise<void> => {
			if (entry.isFile) {
				const file = await new Promise<File>((resolve) =>
					(entry as FileSystemFileEntry).file(resolve),
				)
				Object.defineProperty(file, 'webkitRelativePath', {
					value: `${path}${file.name}`,
				})
				found.push(file as UploadFile)
			} else if (entry.isDirectory) {
				const reader = (entry as FileSystemDirectoryEntry).createReader()
				let entries: FileSystemEntry[] = []
				do {
					entries = await new Promise<FileSystemEntry[]>((resolve) =>
						reader.readEntries(resolve),
					)
					for (const child of entries)
						await traverse(child, `${path}${entry.name}/`)
				} while (entries.length)
			}
		}
		await Promise.all(
			Array.from(e.dataTransfer.items)
				.map((x) => x.webkitGetAsEntry())
				.filter((x): x is FileSystemEntry => !!x)
				.map((x) => traverse(x)),
		)
		if (found.length) addFiles(found)
		else addFiles(e.dataTransfer.files)
	}
	const upload = (item: Item) =>
		new Promise<boolean>((resolve) => {
			const form = new FormData()
			form.set('title', item.title)
			form.set('author', item.author)
			form.set('series', item.series)
			form.set('library', libraryId)
			form.set('folder', folderId)
			item.files.forEach((f, i) => {
				form.set(String(i), f)
			})
			const xhr = new XMLHttpRequest()
			activeUpload.current = xhr
			item.xhr = xhr
			xhr.open(
				'POST',
				`${window.__ABS_WEB_CONFIG__?.apiBasePath || ''}/api/upload`,
			)
			for (const [k, v] of Object.entries(authHeaders()))
				xhr.setRequestHeader(k, v)
			xhr.withCredentials = true
			xhr.upload.onprogress = (e) => {
				if (e.lengthComputable)
					setItems((old) =>
						old.map((x) =>
							x.id === item.id
								? { ...x, progress: (e.loaded / e.total) * 100 }
								: x,
						),
					)
			}
			xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300)
			xhr.onerror = () => resolve(false)
			xhr.onabort = () => resolve(false)
			xhr.send(form)
		})
	const submit = async () => {
		if (!libraryId || !folderId || items.some((x) => !x.title.trim())) {
			setError('Select library and folder, and provide title for every item')
			return
		}
		if (!allowed) {
			setError('Upload permission required')
			return
		}
		cancelled.current = false
		setPending(true)
		setError('')
		let failed = false
		for (const item of items) {
			if (cancelled.current) break
			if (item.status === 'success') continue
			try {
				const check = await api('/api/filesystem/pathexists', pathSchema, {
					method: 'POST',
					body: JSON.stringify({
						directory:
							library?.mediaType === 'podcast'
								? item.title
								: [item.author, item.series, item.title]
										.filter(Boolean)
										.join('/'),
						folderPath: folders.find((x) => x.id === folderId)?.fullPath,
					}),
				})
				if (check.exists) {
					setItems((old) =>
						old.map((x) =>
							x.id === item.id
								? {
										...x,
										status: check.libraryItemTitle
											? `exists: ${check.libraryItemTitle}`
											: 'exists',
									}
								: x,
						),
					)
					failed = true
					continue
				}
			} catch (e) {
				setError(e instanceof Error ? e.message : 'Path check failed')
				failed = true
				break
			}
			setItems((old) =>
				old.map((x) => (x.id === item.id ? { ...x, status: 'uploading' } : x)),
			)
			const ok = await upload(item)
			setItems((old) =>
				old.map((x) =>
					x.id === item.id ? { ...x, status: ok ? 'success' : 'failed' } : x,
				),
			)
			if (!ok) failed = true
		}
		setPending(false)
		if (failed)
			setError('Some items were not uploaded. Review item status and retry.')
	}
	if (!allowed) return <p role="alert">Upload permission required.</p>
	return (
		<section
			aria-label="Upload media drop area"
			onDragEnter={(e) => {
				if (e.dataTransfer.types.includes('Files')) {
					e.preventDefault()
					setDragging(true)
				}
			}}
			onDragOver={(e) => e.preventDefault()}
			onDragLeave={() => setDragging(false)}
			onDrop={(e) => void addDrop(e)}
			className={`space-y-6 ${dragging ? 'bg-primary/20' : ''}`}
		>
			<h1 className="text-3xl font-semibold">Upload media</h1>
			<div className="grid gap-4 sm:grid-cols-3">
				<label>
					Library
					<select
						className="block w-full rounded border bg-background p-2"
						disabled={!!items.length}
						value={libraryId}
						onChange={(e) => {
							const selected = libraries.find((x) => x.id === e.target.value)
							setLibraryId(e.target.value)
							setFolderId(selected?.folders?.[0]?.id ?? '')
							setProvider(
								(current) =>
									selected?.provider ||
									current ||
									providers[0]?.value ||
									'google',
							)
							setAutoMetadata(false)
						}}
					>
						<option value="">Select library</option>
						{libraries.map((l) => (
							<option key={l.id} value={l.id}>
								{l.name}
							</option>
						))}
					</select>
				</label>
				<label>
					Folder
					<select
						className="block w-full rounded border bg-background p-2"
						disabled={!!items.length}
						value={folderId}
						onChange={(e) => setFolderId(e.target.value)}
					>
						<option value="">Select folder</option>
						{folders.map((f) => (
							<option key={f.id} value={f.id}>
								{f.fullPath}
							</option>
						))}
					</select>
				</label>
			</div>
			{library?.mediaType !== 'podcast' && (
				<div className="flex flex-wrap items-center gap-3">
					<label className="inline-flex items-center gap-2">
						<input
							type="checkbox"
							checked={autoMetadata}
							onChange={(e) => setAutoMetadata(e.target.checked)}
						/>
						Fetch metadata automatically
					</label>
					<label>
						Provider
						<select
							className="ml-2 rounded border bg-background p-2"
							value={provider}
							onChange={(e) => setProvider(e.target.value)}
						>
							{providers.map((p) => (
								<option key={p.value} value={p.value}>
									{p.text}
								</option>
							))}
						</select>
					</label>
				</div>
			)}
			<div className="flex gap-2">
				<label className="cursor-pointer rounded border p-2">
					Choose files
					<input
						aria-label="Choose files"
						className="sr-only"
						type="file"
						multiple
						accept=".png,.jpg,.jpeg,.webp,.m4b,.mp3,.m4a,.flac,.opus,.ogg,.oga,.mp4,.aac,.wma,.aiff,.aif,.wav,.webm,.webma,.mka,.awb,.caf,.mpeg,.mpg,.epub,.pdf,.mobi,.azw3,.cbr,.cbz,.nfo,.txt,.opf,.abs,.xml,.json"
						onChange={(e) =>
							e.target.files &&
							addFiles(
								e.target.files as FileList as unknown as Iterable<UploadFile>,
							)
						}
					/>
				</label>
				{library?.mediaType === 'book' && (
					<label className="cursor-pointer rounded border p-2">
						Choose folder
						<input
							aria-label="Choose folder"
							className="sr-only"
							type="file"
							multiple
							{...({
								webkitdirectory: '',
							} as React.InputHTMLAttributes<HTMLInputElement>)}
							onChange={(e) =>
								e.target.files &&
								addFiles(
									e.target.files as FileList as unknown as Iterable<UploadFile>,
								)
							}
						/>
					</label>
				)}
			</div>
			{ignored.length > 0 && (
				<aside className="rounded border border-yellow-600 p-4">
					<h2>Unsupported files</h2>
					<ul>
						{ignored.map((f) => (
							<li
								key={`${f.name}-${f.size}-${f.lastModified}-${f.webkitRelativePath}`}
							>
								{f.name}
							</li>
						))}
					</ul>
				</aside>
			)}
			{error && (
				<p role="alert" className="text-destructive">
					{error}
				</p>
			)}
			{items.map((item) => (
				<article key={item.id} className="space-y-3 rounded border p-4">
					<header className="flex justify-between">
						<strong>{item.directory || item.title}</strong>
						<span role="status">
							{item.metadataError ? `Metadata: ${item.metadataError} · ` : ''}
							{item.status}
							{item.status === 'uploading'
								? ` ${Math.round(item.progress)}%`
								: ''}
						</span>
					</header>
					<label>
						Title
						<input
							className="ml-2 rounded border bg-background p-2"
							value={item.title}
							disabled={pending || metadataRequests.current.has(item.id)}
							onChange={(e) =>
								setItems((xs) =>
									xs.map((x) =>
										x.id === item.id ? { ...x, title: e.target.value } : x,
									),
								)
							}
						/>
					</label>
					{library?.mediaType !== 'podcast' && (
						<>
							<label>
								Author
								<input
									className="ml-2 rounded border bg-background p-2"
									value={item.author}
									disabled={pending || metadataRequests.current.has(item.id)}
									onChange={(e) =>
										setItems((xs) =>
											xs.map((x) =>
												x.id === item.id ? { ...x, author: e.target.value } : x,
											),
										)
									}
								/>
							</label>
							<label>
								Series
								<input
									className="ml-2 rounded border bg-background p-2"
									value={item.series}
									disabled={pending || metadataRequests.current.has(item.id)}
									onChange={(e) =>
										setItems((xs) =>
											xs.map((x) =>
												x.id === item.id ? { ...x, series: e.target.value } : x,
											),
										)
									}
								/>
							</label>
							<Button
								variant="outline"
								disabled={pending || metadataRequests.current.has(item.id)}
								onClick={() => void fetchMetadata(item)}
							>
								Fetch metadata
							</Button>
						</>
					)}
					<ul>
						{[...item.files, ...item.ignored].map((f) => (
							<li
								key={`${f.name}-${f.size}-${f.lastModified}-${f.webkitRelativePath}`}
							>
								{f.name}
							</li>
						))}
					</ul>
					{item.status === 'uploading' && (
						<Button
							variant="outline"
							onClick={() => {
								cancelled.current = true
								activeUpload.current?.abort()
							}}
						>
							Cancel upload
						</Button>
					)}
					<Button
						variant="outline"
						disabled={pending || item.status === 'success'}
						onClick={() => setItems((xs) => xs.filter((x) => x.id !== item.id))}
					>
						Remove
					</Button>
				</article>
			))}
			<div className="flex gap-2">
				<Button
					disabled={pending || !items.length}
					onClick={() => void submit()}
				>
					{pending ? 'Uploading…' : 'Upload'}
				</Button>
				<Button
					variant="outline"
					disabled={pending}
					onClick={() => {
						setItems([])
						setIgnored([])
						setError('')
					}}
				>
					Reset
				</Button>
			</div>
		</section>
	)
}
