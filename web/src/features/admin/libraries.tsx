import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { api, useAuth } from '../../api'
import { Button } from '../../shared/components/ui/button'
import { Checkbox } from '../../shared/components/ui/checkbox'
import {
	Dialog,
	DialogContent,
	DialogTitle,
} from '../../shared/components/ui/dialog'
import { Input } from '../../shared/components/ui/input'
import { Label } from '../../shared/components/ui/label'
import { NativeSelect } from '../../shared/components/ui/native-select'

const folderSchema = z
	.object({ id: z.string().optional(), fullPath: z.string() })
	.passthrough()
const librarySchema = z
	.object({
		id: z.string(),
		name: z.string(),
		mediaType: z.enum(['book', 'podcast']),
		provider: z.string(),
		icon: z.string().optional(),
		folders: z.array(folderSchema),
		displayOrder: z.number().optional(),
		settings: z.record(z.string(), z.unknown()).default({}),
	})
	.passthrough()
const responseSchema = z.object({ libraries: z.array(librarySchema) })
const orderResponseSchema = z.object({ libraries: z.array(librarySchema) })
type Library = z.infer<typeof librarySchema>
const defaults = [
	'folderStructure',
	'audioMetatags',
	'nfoFile',
	'txtFiles',
	'opfFile',
	'absMetadata',
]
const sources = [
	'folderStructure',
	'audioMetatags',
	'nfoFile',
	'txtFiles',
	'opfFile',
	'absMetadata',
]
const podcastRegions = {
	au: 'Australia',
	br: 'Brasil',
	be: 'België / Belgique / Belgien',
	by: 'Беларусь',
	cz: 'Česko',
	dk: 'Danmark',
	de: 'Deutschland',
	ee: 'Eesti',
	es: 'España / Espanya / Espainia',
	fr: 'France',
	hr: 'Hrvatska',
	il: 'ישראל / إسرائيل',
	it: 'Italia',
	jp: '日本',
	lu: 'Luxembourg / Luxemburg / Lëtezebuerg',
	hu: 'Magyarország',
	nl: 'Nederland',
	no: 'Norge',
	nz: 'New Zealand',
	at: 'Österreich',
	pl: 'Polska',
	pt: 'Portugal',
	ru: 'Россия',
	ch: 'Schweiz / Suisse / Svizzera',
	sk: 'Slovensko',
	se: 'Sverige',
	vn: 'Việt Nam',
	ua: 'Україна',
	gb: 'United Kingdom',
	us: 'United States',
	cn: '中国',
}
const providerResponseSchema = z.object({
	providers: z.object({
		books: z.array(
			z.object({ value: z.string(), text: z.string() }).passthrough(),
		),
		podcasts: z.array(
			z.object({ value: z.string(), text: z.string() }).passthrough(),
		),
	}),
})
const authResponseSchema = z
	.object({
		serverSettings: z
			.object({ scannerDisableWatcher: z.boolean() })
			.passthrough(),
	})
	.passthrough()
function isAdmin(user: unknown): boolean {
	return (
		!!user &&
		typeof user === 'object' &&
		'type' in user &&
		((user as { type?: unknown }).type === 'admin' ||
			(user as { type?: unknown }).type === 'root')
	)
}
const errText = (e: unknown) =>
	e instanceof Error ? e.message : 'Request failed'

export function LibrariesPage() {
	const user = useAuth((s) => s.user),
		allowed = isAdmin(user),
		[libraries, setLibraries] = useState<Library[]>([]),
		[loading, setLoading] = useState(true),
		[error, setError] = useState(''),
		[busy, setBusy] = useState(false),
		[editing, setEditing] = useState<Library | null>(null),
		[create, setCreate] = useState(false)
	const load = useCallback(async () => {
		setLoading(true)
		setError('')
		try {
			const x = await api('/libraries', responseSchema)
			const next = x.libraries.sort(
				(a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0),
			)
			setLibraries(next)
			setEditing((current) =>
				current && next.some((item) => item.id === current.id) ? current : null,
			)
		} catch (e) {
			setError(errText(e))
		} finally {
			setLoading(false)
		}
	}, [])
	useEffect(() => {
		if (!allowed) return
		void load()
		const onSocket = (event: Event) => {
			const name = (event as CustomEvent<{ event?: string }>).detail?.event
			if (
				name === 'library_added' ||
				name === 'library_updated' ||
				name === 'library_removed' ||
				name === 'reconnect'
			)
				void load()
		}
		window.addEventListener('abs:socket', onSocket)
		return () => window.removeEventListener('abs:socket', onSocket)
	}, [allowed, load])
	const saveOrder = async (next: Library[]) => {
		if (busy) return
		setBusy(true)
		setLibraries(next)
		try {
			const r = await api('/libraries/order', orderResponseSchema, {
				method: 'POST',
				body: JSON.stringify(
					next.map((l, i) => ({
						id: l.id,
						newOrder: i + 1,
						oldOrder: l.displayOrder,
					})),
				),
			})
			setLibraries(r.libraries)
		} catch (e) {
			setError(errText(e))
			void load()
		} finally {
			setBusy(false)
		}
	}
	const scan = async (id: string, force = false) => {
		if (busy) return
		setBusy(true)
		try {
			await api(
				`/libraries/${encodeURIComponent(id)}/scan?force=${force ? 1 : 0}`,
				z.unknown(),
				{ method: 'POST' },
			)
		} catch (e) {
			setError(errText(e))
		} finally {
			setBusy(false)
		}
	}
	if (!allowed) return <p role="alert">Administrator access required.</p>
	return (
		<section className="space-y-4">
			<h1 className="text-2xl">Libraries</h1>
			<Button onClick={() => setCreate(true)}>Add library</Button>
			{error && (
				<div role="alert">
					<p>{error}</p>
					<Button disabled={loading} onClick={() => void load()}>
						Retry
					</Button>
				</div>
			)}
			{loading ? (
				<p>Loading libraries…</p>
			) : !error && !libraries.length ? (
				<p>No libraries yet.</p>
			) : null}
			<ol className="space-y-2">
				{libraries.map((l, i) => (
					<li
						key={l.id}
						className="flex flex-wrap items-center gap-2 border p-3"
					>
						<strong className="grow">
							{l.name} · {l.mediaType}
						</strong>
						<Button
							disabled={i === 0 || busy}
							aria-label={`Move ${l.name} up`}
							onClick={() =>
								void saveOrder(
									libraries.map((x, j) =>
										j === i ? libraries[i - 1] : j === i - 1 ? libraries[i] : x,
									),
								)
							}
						>
							↑
						</Button>
						<Button
							disabled={i === libraries.length - 1 || busy}
							aria-label={`Move ${l.name} down`}
							onClick={() =>
								void saveOrder(
									libraries.map((x, j) =>
										j === i ? libraries[i + 1] : j === i + 1 ? libraries[i] : x,
									),
								)
							}
						>
							↓
						</Button>
						<Button disabled={busy} onClick={() => void scan(l.id)}>
							Scan
						</Button>
						<Button disabled={busy} onClick={() => void scan(l.id, true)}>
							Force scan
						</Button>
						{l.mediaType === 'book' && (
							<Button
								disabled={busy}
								onClick={() => {
									if (busy) return
									setBusy(true)
									void api(
										`/libraries/${encodeURIComponent(l.id)}/matchall`,
										z.unknown(),
									)
										.catch((e) => setError(errText(e)))
										.finally(() => setBusy(false))
								}}
							>
								Match books
							</Button>
						)}
						<Button onClick={() => setEditing(l)}>Edit</Button>
						<Button
							onClick={() => {
								if (
									!busy &&
									window.confirm(
										`Delete library ${l.name} (${l.id})? This cannot be undone.`,
									)
								) {
									setBusy(true)
									void api(
										`/libraries/${encodeURIComponent(l.id)}`,
										z.unknown(),
										{ method: 'DELETE' },
									)
										.then(load)
										.catch((e) => setError(errText(e)))
										.finally(() => setBusy(false))
								}
							}}
						>
							Delete
						</Button>
					</li>
				))}
			</ol>
			{(create || editing) && (
				<LibraryEditor
					key={editing?.id ?? 'new'}
					library={editing}
					close={() => {
						setCreate(false)
						setEditing(null)
					}}
					done={() => {
						setCreate(false)
						setEditing(null)
						void load()
					}}
				/>
			)}
		</section>
	)
}

function CronSchedule({
	value,
	onChange,
}: {
	value: string
	onChange: (value: string) => void
}) {
	const [mode, setMode] = useState(
		[
			'0 0 * * *',
			'0 */12 * * *',
			'0 */6 * * *',
			'0 */2 * * *',
			'0 * * * *',
			'*/30 * * * *',
			'*/15 * * * *',
		].includes(value)
			? value
			: 'custom',
	)
	const presets = [
		['custom', 'Custom weekly/daily'],
		['0 0 * * *', 'Every day'],
		['0 */12 * * *', 'Every 12 hours'],
		['0 */6 * * *', 'Every 6 hours'],
		['0 */2 * * *', 'Every 2 hours'],
		['0 * * * *', 'Every hour'],
		['*/30 * * * *', 'Every 30 minutes'],
		['*/15 * * * *', 'Every 15 minutes'],
	]
	const [hour, setHour] = useState('0'),
		[minute, setMinute] = useState('0'),
		[days, setDays] = useState<number[]>([])
	useEffect(() => {
		const p = value.split(' ')
		if (p.length === 5) {
			setMinute(p[0])
			setHour(p[1])
			setDays(p[4] === '*' ? [] : p[4].split(',').map(Number))
		}
	}, [value])
	const update = (nextMode: string) => {
		setMode(nextMode)
		if (nextMode !== 'custom') onChange(nextMode)
		else onChange(`${minute} ${hour} * * ${days.length ? days.join(',') : '*'}`)
	}
	return (
		<div className="space-y-2">
			<Label className="block">
				Interval
				<NativeSelect
					className="ml-2 border bg-transparent p-1"
					value={mode}
					onChange={(e) => update(e.target.value)}
				>
					{presets.map(([v, t]) => (
						<option key={v} value={v}>
							{t}
						</option>
					))}
				</NativeSelect>
			</Label>
			{mode === 'custom' && (
				<>
					<div className="flex flex-wrap gap-3">
						{[
							'Monday',
							'Tuesday',
							'Wednesday',
							'Thursday',
							'Friday',
							'Saturday',
							'Sunday',
						].map((d, i) => (
							<Label key={d}>
								<Checkbox
									checked={days.includes((i + 1) % 7)}
									onCheckedChange={(checked) => {
										const next = checked
											? [...days, (i + 1) % 7]
											: days.filter((x) => x !== (i + 1) % 7)
										setDays(next)
										onChange(
											`${minute} ${hour} * * ${next.length ? next.join(',') : '*'}`,
										)
									}}
								/>{' '}
								{d}
							</Label>
						))}
					</div>
					<Label>
						Hour (0–23)
						<Input
							className="ml-2 w-20 border bg-transparent p-1"
							type="number"
							min="0"
							max="23"
							value={hour}
							onChange={(e) => {
								setHour(e.target.value)
								onChange(
									`${minute} ${e.target.value} * * ${days.length ? days.join(',') : '*'}`,
								)
							}}
						/>
					</Label>
					<Label className="ml-3">
						Minute (0–59)
						<Input
							className="ml-2 w-20 border bg-transparent p-1"
							type="number"
							min="0"
							max="59"
							value={minute}
							onChange={(e) => {
								setMinute(e.target.value)
								onChange(
									`${e.target.value} ${hour} * * ${days.length ? days.join(',') : '*'}`,
								)
							}}
						/>
					</Label>
				</>
			)}
			<Label className="block">
				Advanced custom cron expression
				<Input
					className="ml-2 border bg-transparent p-1 font-mono"
					aria-label="Advanced custom cron expression"
					value={value}
					onChange={(e) => {
						setMode('custom')
						onChange(e.target.value)
					}}
				/>
			</Label>
		</div>
	)
}

function LibraryEditor({
	library,
	close,
	done,
}: {
	library: Library | null
	close: () => void
	done: () => void
}) {
	const returnFocus = useRef(document.activeElement as HTMLElement | null)
	const [name, setName] = useState(library?.name ?? ''),
		[mediaType, setMedia] = useState<'book' | 'podcast'>(
			library?.mediaType ?? 'book',
		),
		[provider, setProvider] = useState(library?.provider ?? 'google'),
		[icon, setIcon] = useState(library?.icon ?? 'database'),
		[folders, setFolders] = useState(library?.folders ?? []),
		[providers, setProviders] = useState<
			Array<{ value: string; text: string }>
		>([]),
		[globalWatcherDisabled, setGlobalWatcherDisabled] = useState(false),
		[posix, setPosix] = useState(true),
		[tab, setTab] = useState('Details'),
		[settings, setSettings] = useState<Record<string, unknown>>(
			library?.settings ?? {
				coverAspectRatio: 1,
				disableWatcher: false,
				skipMatchingMediaWithAsin: false,
				skipMatchingMediaWithIsbn: false,
				audiobooksOnly: false,
				epubsAllowScriptedContent: false,
				podcastSearchRegion: 'us',
				autoScanCronExpression: null,
				hideSingleBookSeries: false,
				onlyShowLaterBooksInContinueSeries: false,
				metadataPrecedence: defaults,
				markAsFinishedPercentComplete: null,
				markAsFinishedTimeRemaining: 10,
			},
		),
		[busy, setBusy] = useState(false),
		[error, setError] = useState(''),
		[path, setPath] = useState(''),
		[dirs, setDirs] = useState<
			Array<{ path: string; dirname: string; level: number }>
		>([])
	useEffect(() => {
		void api('/search/providers', providerResponseSchema)
			.then((r) =>
				setProviders(
					mediaType === 'book' ? r.providers.books : r.providers.podcasts,
				),
			)
			.catch((e) => setError(errText(e)))
		void api('/authorize', authResponseSchema, { method: 'POST' })
			.then((r) =>
				setGlobalWatcherDisabled(r.serverSettings.scannerDisableWatcher),
			)
			.catch((e) => setError(errText(e)))
	}, [mediaType])
	const update = (key: string, value: unknown) =>
		setSettings((s) => ({ ...s, [key]: value }))
	const listDirs = async (p = '', level = 0) => {
		try {
			const r = await api(
				`/filesystem?path=${encodeURIComponent(p)}&level=${level}`,
				z.object({
					directories: z.array(
						z.object({
							path: z.string(),
							dirname: z.string(),
							level: z.number(),
						}),
					),
					posix: z.boolean(),
				}),
			)
			setDirs(r.directories)
			setPosix(r.posix)
			setPath(p)
		} catch (e) {
			setError(errText(e))
		}
	}
	const save = async () => {
		if (busy) return
		if (!name.trim() || !folders.length) {
			setError('Name and at least one folder are required.')
			return
		}
		setBusy(true)
		setError('')
		const data = {
			name: name.trim(),
			mediaType,
			provider,
			icon,
			folders,
			settings,
		}
		try {
			if (library) {
				const changed: Record<string, unknown> = {}
				for (const k of ['name', 'provider', 'icon'])
					if (data[k as keyof typeof data] !== library[k as keyof Library])
						changed[k] = data[k as keyof typeof data]
				if (JSON.stringify(folders) !== JSON.stringify(library.folders))
					changed.folders = folders
				if (JSON.stringify(settings) !== JSON.stringify(library.settings))
					changed.settings = Object.fromEntries(
						Object.entries(settings).filter(
							([k, v]) =>
								JSON.stringify(v) !== JSON.stringify(library.settings[k]),
						),
					)
				if (Object.keys(changed).length)
					await api(
						`/libraries/${encodeURIComponent(library.id)}`,
						z.unknown(),
						{ method: 'PATCH', body: JSON.stringify(changed) },
					)
			} else
				await api('/libraries', z.unknown(), {
					method: 'POST',
					body: JSON.stringify(data),
				})
			done()
		} catch (e) {
			setError(errText(e))
		} finally {
			setBusy(false)
		}
	}
	const removeMeta = async (ext: 'json' | 'abs') => {
		if (
			busy ||
			!library ||
			!window.confirm(
				`Remove all ${ext} metadata files from library ${library.name} (${library.id})?`,
			)
		)
			return
		setBusy(true)
		try {
			const r = await api(
				`/libraries/${encodeURIComponent(library.id)}/remove-metadata?ext=${ext}`,
				z.object({ found: z.number(), removed: z.number() }),
				{ method: 'POST' },
			)
			setError(
				r.found
					? `${r.removed} ${ext} files removed.`
					: `No ${ext} metadata files found.`,
			)
		} catch (e) {
			setError(errText(e))
		} finally {
			setBusy(false)
		}
	}
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) close()
			}}
		>
			<DialogContent
				onCloseAutoFocus={(event) => {
					event.preventDefault()
					returnFocus.current?.focus()
				}}
				className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"
				aria-describedby={undefined}
			>
				<section className="mx-auto max-w-3xl space-y-3 bg-background p-5">
					<DialogTitle>{library ? 'Edit' : 'Create'} library</DialogTitle>
					<nav className="flex flex-wrap gap-2">
						{[
							'Details',
							'Settings',
							...(mediaType === 'book' ? ['Scanner'] : []),
							'Schedule',
							...(library ? ['Tools'] : []),
						].map((t) => (
							<Button
								key={t}
								aria-pressed={tab === t}
								onClick={() => setTab(t)}
							>
								{t}
							</Button>
						))}
					</nav>
					{tab === 'Details' && (
						<div className="space-y-3">
							<Label className="block">
								Media type
								<NativeSelect
									disabled={!!library}
									value={mediaType}
									onChange={(e) =>
										setMedia(e.target.value as 'book' | 'podcast')
									}
									className="ml-2"
								>
									<option value="book">Books</option>
									<option value="podcast">Podcasts</option>
								</NativeSelect>
							</Label>
							<Label className="block">
								Name
								<Input
									className="ml-2 border bg-transparent p-1"
									value={name}
									onChange={(e) => setName(e.target.value)}
								/>
							</Label>
							<Label className="block">
								Metadata provider
								<NativeSelect
									className="ml-2 border bg-transparent p-1"
									value={provider}
									onChange={(e) => setProvider(e.target.value)}
								>
									{providers.map((p) => (
										<option key={p.value} value={p.value}>
											{p.text}
										</option>
									))}
								</NativeSelect>
							</Label>
							<Label className="block">
								Icon
								<Input
									className="ml-2 border bg-transparent p-1"
									value={icon}
									onChange={(e) => setIcon(e.target.value)}
								/>
							</Label>
							<h3>Folders</h3>
							{folders.map((f, i) => (
								<p key={f.id ?? `${f.fullPath}-${i}`} className="flex gap-2">
									<code className="grow">{f.fullPath}</code>
									<Button
										disabled={busy || folders.length < 2}
										aria-label={`Remove folder ${f.fullPath}`}
										onClick={() =>
											setFolders((x) => x.filter((_, j) => i !== j))
										}
									>
										Remove
									</Button>
								</p>
							))}
							<Label>
								Add folder path
								<Input
									className="ml-2 border bg-transparent p-1"
									value={path}
									onChange={(e) => setPath(e.target.value)}
								/>
							</Label>
							<Button
								onClick={() => setFolders((x) => [...x, { fullPath: path }])}
								disabled={
									!path.trim() || folders.some((f) => f.fullPath === path)
								}
							>
								Add path
							</Button>
							<Button onClick={() => void listDirs()}>Browse folders</Button>
							{(dirs.length > 0 || path) && (
								<fieldset
									aria-label="Folder chooser"
									className="max-h-48 space-y-1 overflow-auto"
								>
									<p>
										Current path: <code>{path || '/'}</code>
									</p>
									{path && (
										<Button
											onClick={() => {
												const bits = posix
													? path.split('/').filter(Boolean)
													: path.split(/[\\/]/).filter(Boolean)
												bits.pop()
												const parent = posix
													? `/${bits.join('/')}`
													: bits.join('\\')
												void listDirs(parent, bits.length)
											}}
										>
											Back to parent
										</Button>
									)}
									{dirs.map((d) => (
										<Button
											key={d.path}
											onClick={() => {
												setPath(d.path)
												void listDirs(d.path, d.level + 1)
											}}
										>
											{d.dirname} ({d.path})
										</Button>
									))}
									<Button
										onClick={() => {
											if (path && !folders.some((f) => f.fullPath === path))
												setFolders((x) => [...x, { fullPath: path }])
											setDirs([])
										}}
									>
										Select current folder: {path || '/'}
									</Button>
								</fieldset>
							)}
						</div>
					)}
					{tab === 'Settings' && (
						<div className="grid gap-3 sm:grid-cols-2">
							{(
								[
									'disableWatcher',
									'audiobooksOnly',
									'skipMatchingMediaWithAsin',
									'skipMatchingMediaWithIsbn',
									'hideSingleBookSeries',
									'onlyShowLaterBooksInContinueSeries',
									'epubsAllowScriptedContent',
								] as const
							)
								.filter((k) => mediaType === 'book' || k === 'disableWatcher')
								.map((k) => (
									<Label key={k} className="block">
										<Checkbox
											disabled={k === 'disableWatcher' && globalWatcherDisabled}
											checked={
												k === 'disableWatcher' && globalWatcherDisabled
													? true
													: Boolean(settings[k])
											}
											onCheckedChange={(checked) => update(k, checked)}
										/>{' '}
										{k === 'disableWatcher'
											? 'Enable filesystem watcher'
											: k === 'audiobooksOnly'
												? 'Audio files only (ignore ebook files)'
												: k === 'skipMatchingMediaWithAsin'
													? 'Skip matching books that already have ASIN'
													: k === 'skipMatchingMediaWithIsbn'
														? 'Skip matching books that already have ISBN'
														: k === 'hideSingleBookSeries'
															? 'Hide single-book series'
															: k === 'onlyShowLaterBooksInContinueSeries'
																? 'Show only later books in continue-series shelves'
																: 'Allow scripted EPUB content'}
										{k === 'disableWatcher' && globalWatcherDisabled && (
											<span className="block text-amber-500">
												Disabled globally in server settings; per-library
												watcher cannot override this.
											</span>
										)}
									</Label>
								))}
							<p className="text-sm text-muted-foreground">
								Cover shape affects book cover display. Matching skip options
								prevent replacing existing identifiers. Series options affect
								series shelves.
							</p>
							{mediaType === 'podcast' && (
								<Label>
									Podcast search region
									<NativeSelect
										value={String(settings.podcastSearchRegion ?? 'us')}
										onChange={(e) =>
											update('podcastSearchRegion', e.target.value)
										}
									>
										{Object.entries(podcastRegions).map(([code, label]) => (
											<option key={code} value={code}>
												{label}
											</option>
										))}
									</NativeSelect>
								</Label>
							)}
							<Label>
								Cover aspect ratio
								<NativeSelect
									value={String(settings.coverAspectRatio ?? '1')}
									onChange={(e) =>
										update('coverAspectRatio', Number(e.target.value))
									}
								>
									<option value="1">Square</option>
									<option value="0">Standard</option>
								</NativeSelect>
							</Label>
							<Label>
								Mark finished by
								<NativeSelect
									value={
										settings.markAsFinishedTimeRemaining !== null
											? 'time'
											: 'percent'
									}
									onChange={(e) => {
										update(
											'markAsFinishedTimeRemaining',
											e.target.value === 'time' ? 10 : null,
										)
										update(
											'markAsFinishedPercentComplete',
											e.target.value === 'percent' ? 90 : null,
										)
									}}
								>
									<option value="time">Time remaining (minutes)</option>
									<option value="percent">Percent complete</option>
								</NativeSelect>
							</Label>
							<Label>
								Threshold
								<Input
									type="number"
									min="0"
									max={
										settings.markAsFinishedTimeRemaining !== null
											? undefined
											: 100
									}
									value={String(
										settings.markAsFinishedTimeRemaining ??
											settings.markAsFinishedPercentComplete ??
											10,
									)}
									onChange={(e) =>
										update(
											settings.markAsFinishedTimeRemaining !== null
												? 'markAsFinishedTimeRemaining'
												: 'markAsFinishedPercentComplete',
											Number(e.target.value),
										)
									}
								/>
							</Label>
						</div>
					)}
					{tab === 'Scanner' && (
						<div className="space-y-2">
							<p>Metadata precedence (highest priority first)</p>
							<Button onClick={() => update('metadataPrecedence', defaults)}>
								Reset to default
							</Button>
							{sources.map((s) => {
								const precedence =
										(settings.metadataPrecedence as string[] | undefined) ??
										defaults,
									index = precedence.indexOf(s),
									enabled = index >= 0
								return (
									<div key={s} className="flex items-center gap-2">
										<Label className="grow">
											<Checkbox
												checked={enabled}
												onCheckedChange={(checked) =>
													update(
														'metadataPrecedence',
														checked
															? [...precedence, s]
															: precedence.filter((x) => x !== s),
													)
												}
											/>{' '}
											{s} {enabled && `— priority ${index + 1}`}
										</Label>
										{enabled && (
											<>
												<Button
													aria-label={`Move ${s} up`}
													disabled={index === 0}
													onClick={() => {
														const a = [...precedence]
														a.splice(index, 1)
														a.splice(index - 1, 0, s)
														update('metadataPrecedence', a)
													}}
												>
													↑
												</Button>
												<Button
													aria-label={`Move ${s} down`}
													disabled={index === precedence.length - 1}
													onClick={() => {
														const a = [...precedence]
														a.splice(index, 1)
														a.splice(index + 1, 0, s)
														update('metadataPrecedence', a)
													}}
												>
													↓
												</Button>
											</>
										)}
									</div>
								)
							})}
						</div>
					)}
					{tab === 'Schedule' && (
						<div className="space-y-2">
							<Label>
								<Checkbox
									checked={Boolean(settings.autoScanCronExpression)}
									onCheckedChange={(checked) =>
										update(
											'autoScanCronExpression',
											checked ? '0 0 * * 1' : null,
										)
									}
								/>{' '}
								Enable automatic scan
							</Label>
							{Boolean(settings.autoScanCronExpression) && (
								<CronSchedule
									value={String(settings.autoScanCronExpression)}
									onChange={(v) => update('autoScanCronExpression', v)}
								/>
							)}
							<p>
								Scans new and changed media on schedule. Times use server local
								time; cron uses five fields (minute hour day-of-month month
								day-of-week). Default schedule: 0 0 * * 1.
							</p>
						</div>
					)}
					{tab === 'Tools' && (
						<div className="flex gap-3">
							<Button disabled={busy} onClick={() => void removeMeta('json')}>
								Remove all JSON metadata
							</Button>
							<Button disabled={busy} onClick={() => void removeMeta('abs')}>
								Remove all ABS metadata
							</Button>
						</div>
					)}
					{error && <p role="alert">{error}</p>}
					<footer className="flex justify-end gap-2">
						<Button disabled={busy} onClick={close}>
							Cancel
						</Button>
						{tab !== 'Tools' && (
							<Button disabled={busy} onClick={() => void save()}>
								{busy ? 'Saving…' : library ? 'Save' : 'Create'}
							</Button>
						)}
					</footer>
				</section>
			</DialogContent>
		</Dialog>
	)
}
