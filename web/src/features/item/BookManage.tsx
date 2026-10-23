import { Link } from '@tanstack/react-router'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../api'
import { Button } from '../../shared/components/ui/button'
import { Input } from '../../shared/components/ui/input'
import { NativeSelect } from '../../shared/components/ui/native-select'
import { BookMatch } from './BookMatch'
import { BookTools } from './BookTools'
import {
	audibleChapters,
	type Chapter,
	findChapters,
	removeCover,
	saveChapters,
	saveTrackOrder,
	searchCovers,
	setCoverUrl,
	setLocalCover,
	updateMetadata,
	uploadCover,
	validateChapters,
} from './book-manage'
import type { Item } from './schemas'
import { getItem } from './service'

type Props = { id: string; section: 'chapters' | 'edit' | 'manage' }
type Track = {
	ino: number
	index: number
	filename: string
	exclude?: boolean
	metadata?: { filename?: string; size?: number }
	trackNumFromMeta?: number | null
	trackNumFromFilename?: number | null
	discNumFromMeta?: number | null
	discNumFromFilename?: number | null
	duration?: number
	error?: string | null
}

export function BookManage(props: Props) {
	const ownerId = useAuth((state) => state.user?.id)
	return (
		<BookEditor
			key={JSON.stringify([props.id, ownerId])}
			{...props}
			ownerId={ownerId}
		/>
	)
}
function BookEditor({ id, section, ownerId }: Props & { ownerId?: string }) {
	const active = useRef(true)
	const lock = useRef(false)
	const currentOwner = useCallback(
		() =>
			active.current && !!ownerId && useAuth.getState().user?.id === ownerId,
		[ownerId],
	)
	const user = useAuth((state) => state.user)
	const permissions = user as
		| (typeof user & {
				permissions?: { update?: boolean; upload?: boolean; delete?: boolean }
				type?: 'root' | 'admin' | 'user' | 'guest'
		  })
		| null
	const isAdmin = permissions?.type === 'root' || permissions?.type === 'admin'
	const canUpdate = !!permissions?.permissions?.update
	const canUpload = !!permissions?.permissions?.upload
	const canDelete = !!permissions?.permissions?.delete
	const uploadInput = useRef<HTMLInputElement>(null)
	const [item, setItem] = useState<Item | null>(null)
	const [chapters, setChapters] = useState<Chapter[]>([])
	const [tracks, setTracks] = useState<Track[]>([])
	const [metadata, setMetadata] = useState<Record<string, unknown>>({})
	const [lockedChapters, setLockedChapters] = useState<Set<number>>(new Set())
	const lastLock = useRef<number | null>(null)
	const [preview, setPreview] = useState<{
		url: string
		time: number
		title: string
	} | null>(null)
	const previewAudio = useRef<HTMLAudioElement>(null)
	const [bulkTitle, setBulkTitle] = useState('')
	const [shiftSeconds, setShiftSeconds] = useState('0')
	const [asin, setAsin] = useState('')
	const [region, setRegion] = useState('us')
	const [lookup, setLookup] = useState<unknown>(null)
	const [coverUrl, setCover] = useState('')
	const [searchTerm, setSearchTerm] = useState('')
	const [coverResults, setCoverResults] = useState<string[]>([])
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState('')
	const [notice, setNotice] = useState('')
	async function load() {
		const value = await getItem(id)
		if (!currentOwner() || value.id !== id) return
		setItem(value)
		setMetadata({
			...value.media.metadata,
			authorName:
				value.media.metadata.authors?.map((author) => author.name).join(', ') ||
				value.media.metadata.authorName ||
				'',
			tags: value.media.tags || [],
		})
		setChapters((value.media.chapters ?? []).map((chapter) => ({ ...chapter })))
		setTracks(
			((value.media.audioFiles ?? []) as Track[]).map((track) => ({
				...track,
			})),
		)
	}
	useEffect(() => {
		active.current = true
		let loading = true
		void getItem(id)
			.then((value) => {
				if (!loading || !currentOwner() || value.id !== id) return
				setItem(value)
				setMetadata({
					...value.media.metadata,
					authorName:
						value.media.metadata.authors
							?.map((author) => author.name)
							.join(', ') ||
						value.media.metadata.authorName ||
						'',
					tags: value.media.tags || [],
				})
				setChapters(
					(value.media.chapters ?? []).map((chapter) => ({ ...chapter })),
				)
				setTracks(
					((value.media.audioFiles ?? []) as Track[]).map((track) => ({
						...track,
					})),
				)
			})
			.catch((e) => {
				if (loading && currentOwner())
					setError(e instanceof Error ? e.message : 'Could not load item')
			})
		return () => {
			loading = false
			active.current = false
		}
	}, [id, currentOwner])
	async function action(
		run: () => Promise<unknown>,
		refresh = true,
		message = 'Changes saved',
	) {
		if (!currentOwner() || lock.current || item?.id !== id) return
		lock.current = true
		setBusy(true)
		setError('')
		setNotice('')
		try {
			await run()
			if (!currentOwner()) return
			if (refresh) await load()
			if (currentOwner()) setNotice(message)
		} catch (e) {
			if (currentOwner())
				setError(e instanceof Error ? e.message : 'Request failed')
		} finally {
			lock.current = false
			if (currentOwner()) setBusy(false)
		}
	}
	if (!item)
		return (
			<section aria-busy="true">
				{error ? <p role="alert">{error}</p> : <p>Loading audiobook…</p>}
			</section>
		)
	if (item.mediaType !== 'book')
		return <p role="alert">Audiobook management requires a book item.</p>
	if (section === 'manage' && !isAdmin)
		return <p role="alert">Administrator permission required.</p>
	if (section !== 'manage' && !canUpdate)
		return <p role="alert">Update permission required.</p>
	const duration = item.media.duration ?? 0
	const coverPath = `${window.__ABS_WEB_CONFIG__?.apiBasePath || ''}/api/items/${encodeURIComponent(id)}/cover`
	const coverToken =
		new URL(coverPath, window.location.origin).origin === window.location.origin
			? localStorage.getItem('token')
			: null
	const setChapter = (index: number, patch: Partial<Chapter>) =>
		setChapters((current) =>
			current.map((chapter, i) =>
				i === index ? { ...chapter, ...patch } : chapter,
			),
		)
	const moveTrack = (index: number, amount: number) =>
		setTracks((current) => {
			const next = [...current]
			const target = index + amount
			if (target < 0 || target >= next.length) return current
			;[next[index], next[target]] = [next[target], next[index]]
			return next
		})
	const title = item.media.metadata.title || 'Untitled audiobook'
	const heading =
		section === 'chapters'
			? 'Chapters'
			: section === 'edit'
				? 'Tracks and metadata'
				: 'Encoding and metadata embedding'
	return (
		<section className="mx-auto min-w-0 max-w-5xl space-y-5 p-4 [overflow-wrap:anywhere]">
			<nav aria-label="Audiobook navigation">
				<Link className="underline" to="/item/$id" params={{ id }}>
					Return to audiobook {title}
				</Link>
			</nav>
			<h1 className="text-2xl font-semibold">{title}</h1>
			{section !== 'edit' && (
				<h2 className="text-xl font-semibold">{heading}</h2>
			)}
			{error && (
				<p role="alert" className="text-destructive">
					{error}
				</p>
			)}
			{notice && <p role="status">{notice}</p>}
			{section === 'chapters' && (
				<>
					<p>Duration: {duration.toFixed(2)} s</p>
					<Button
						variant="outline"
						disabled={
							!Array.isArray(item.media.tracks) || !item.media.tracks.length
						}
						onClick={() => {
							if (!window.confirm('Replace draft chapters with audio tracks?'))
								return
							let start = 0
							setChapters(
								(
									(item.media.tracks ?? []) as Array<{
										duration: number
										startOffset?: number
										title?: string
										metadata?: { filename?: string }
									}>
								).map((track, index) => {
									const offset = track.startOffset ?? start
									start = offset + track.duration
									return {
										id: index,
										title:
											track.title ||
											track.metadata?.filename ||
											`Chapter ${index + 1}`,
										start: offset,
										end: start,
									}
								}),
							)
						}}
					>
						Set chapters from tracks
					</Button>
					<div className="flex flex-wrap gap-2">
						<Button
							variant="outline"
							disabled={busy}
							onClick={() => {
								setChapters(
									(item.media.chapters ?? []).map((chapter) => ({
										...chapter,
									})),
								)
								setLockedChapters(new Set())
								setPreview(null)
							}}
						>
							Reset chapters
						</Button>
						<Button
							variant="destructive"
							disabled={busy || !chapters.length}
							onClick={() => {
								if (
									window.confirm(
										'Remove all chapters from draft? Save chapters to write changes.',
									)
								) {
									setChapters([])
									setLockedChapters(new Set())
									setPreview(null)
								}
							}}
						>
							Remove all chapters
						</Button>
						<Button
							variant="outline"
							onClick={() =>
								setLockedChapters(
									lockedChapters.size === chapters.length
										? new Set()
										: new Set(chapters.map((_, index) => index)),
								)
							}
						>
							{lockedChapters.size === chapters.length && chapters.length
								? 'Unlock all chapters'
								: 'Lock all chapters'}
						</Button>
					</div>
					{preview && (
						<div>
							<p>
								{preview.title}: track time {preview.time.toFixed(3)} s
							</p>
							<audio
								ref={previewAudio}
								aria-label="Chapter preview"
								onError={() =>
									setError('Chapter preview audio could not be loaded')
								}
								controls
								src={preview.url}
								onLoadedMetadata={() => {
									if (previewAudio.current)
										previewAudio.current.currentTime = preview.time
								}}
							>
								<track kind="captions" />
							</audio>
						</div>
					)}
					{chapters.map((chapter, index) => (
						<div
							key={chapter.id ?? index}
							className="grid items-end gap-2 rounded border p-3 sm:grid-cols-[1fr_9rem_9rem_auto]"
						>
							<label
								className="grid content-start gap-1"
								htmlFor={`book-input-1-${index}`}
							>
								Title
								<Input
									id={`book-input-1-${index}`}
									className="block w-full rounded border bg-background p-2"
									value={chapter.title}
									onChange={(e) => setChapter(index, { title: e.target.value })}
								/>
							</label>
							<label
								className="grid content-start gap-1"
								htmlFor={`book-input-2-${index}`}
							>
								Start (seconds)
								<Input
									id={`book-input-2-${index}`}
									type="number"
									min="0"
									step="0.001"
									className="block w-full rounded border bg-background p-2"
									value={chapter.start}
									onChange={(e) =>
										setChapter(index, { start: Number(e.target.value) })
									}
								/>
							</label>
							<label
								className="grid content-start gap-1"
								htmlFor={`book-input-3-${index}`}
							>
								End (seconds)
								<Input
									id={`book-input-3-${index}`}
									type="number"
									min="0"
									step="0.001"
									className="block w-full rounded border bg-background p-2"
									value={chapter.end}
									onChange={(e) =>
										setChapter(index, { end: Number(e.target.value) })
									}
								/>
							</label>
							<div className="flex flex-wrap gap-2">
								<Button
									variant="outline"
									aria-label={`Subtract one second from chapter ${index + 1}`}
									disabled={chapter.start < 1}
									onClick={() =>
										setChapter(index, { start: chapter.start - 1 })
									}
								>
									−1 s
								</Button>
								<Button
									variant="outline"
									aria-label={`Add one second to chapter ${index + 1}`}
									disabled={chapter.start + 1 >= duration}
									onClick={() =>
										setChapter(index, { start: chapter.start + 1 })
									}
								>
									+1 s
								</Button>
								<Button
									variant="outline"
									aria-label={`Lock chapter ${index + 1}`}
									aria-pressed={lockedChapters.has(index)}
									onClick={(event) => {
										const next = new Set(lockedChapters)
										const start =
											event.shiftKey && lastLock.current !== null
												? Math.min(lastLock.current, index)
												: index
										const end =
											event.shiftKey && lastLock.current !== null
												? Math.max(lastLock.current, index)
												: index
										for (let i = start; i <= end; i++) {
											if (lockedChapters.has(index)) next.delete(i)
											else next.add(i)
										}
										lastLock.current = index
										setLockedChapters(next)
									}}
								>
									{lockedChapters.has(index) ? 'Locked' : 'Unlocked'}
								</Button>
								<Button
									variant="outline"
									disabled={
										!Array.isArray(item.media.tracks) ||
										!item.media.tracks.length
									}
									onClick={() => {
										const audioTracks = (item.media.tracks ?? []) as Array<{
											contentUrl: string
											startOffset?: number
											duration?: number
											index?: number
										}>
										let offset = 0
										for (const track of audioTracks) {
											const start = track.startOffset ?? offset
											if (
												chapter.start >= start &&
												chapter.start < start + (track.duration ?? 0)
											) {
												const url = new URL(
													track.contentUrl.startsWith('/api/')
														? `${window.__ABS_WEB_CONFIG__?.apiBasePath ?? ''}${track.contentUrl}`
														: track.contentUrl,
													window.location.origin,
												)
												if (url.origin !== window.location.origin) {
													setError('Preview audio must use this server')
													return
												}
												const token = localStorage.getItem('token')
												if (token) url.searchParams.set('token', token)
												setPreview({
													url: url.href,
													time: chapter.start - start,
													title: `${chapter.title} — track ${track.index ?? audioTracks.indexOf(track) + 1}`,
												})
												return
											}
											offset = start + (track.duration ?? 0)
										}
									}}
								>
									Preview chapter {index + 1}
								</Button>
							</div>
							<Button
								variant="destructive"
								disabled={busy}
								onClick={() => {
									if (window.confirm(`Delete chapter “${chapter.title}”?`))
										setChapters((current) =>
											current.filter((_, i) => i !== index),
										)
								}}
							>
								Delete
							</Button>
						</div>
					))}
					<div className="flex flex-wrap items-end gap-2">
						<label
							className="grid content-start gap-1"
							htmlFor={'book-input-4'}
						>
							Bulk title prefix
							<Input
								id={'book-input-4'}
								className="block rounded border bg-background p-2"
								value={bulkTitle}
								onChange={(e) => setBulkTitle(e.target.value)}
								placeholder="Chapter"
							/>
						</label>
						<Button
							variant="outline"
							onClick={() =>
								setChapters((current) =>
									current.map((chapter, index) => ({
										...chapter,
										title: `${bulkTitle.trim() || 'Chapter'} ${index + 1}`,
									})),
								)
							}
						>
							Apply titles
						</Button>
						<label
							className="grid content-start gap-1"
							htmlFor={'book-input-5'}
						>
							Shift seconds
							<Input
								id={'book-input-5'}
								className="block rounded border bg-background p-2"
								type="number"
								step="0.001"
								value={shiftSeconds}
								onChange={(e) => setShiftSeconds(e.target.value)}
							/>
						</label>
						<Button
							variant="outline"
							onClick={() => {
								try {
									const amount = Number(shiftSeconds)
									if (!Number.isFinite(amount))
										throw new Error('Shift must be a finite number')
									setChapters((current) =>
										current.map((chapter, index) =>
											lockedChapters.has(index)
												? chapter
												: {
														...chapter,
														start:
															index === 0
																? 0
																: Math.max(0, chapter.start + amount),
														end: Math.min(duration, chapter.end + amount),
													},
										),
									)
								} catch (e) {
									setError(e instanceof Error ? e.message : 'Invalid shift')
								}
							}}
						>
							Shift all
						</Button>
						<label
							className="grid content-start gap-1"
							htmlFor={'book-input-6'}
						>
							ASIN
							<Input
								id={'book-input-6'}
								className="block rounded border bg-background p-2"
								value={asin}
								onChange={(e) => setAsin(e.target.value)}
							/>
						</label>
						<label
							className="grid content-start gap-1"
							htmlFor="book-control-1"
						>
							Region
							<NativeSelect
								id="book-control-1"
								className="block rounded border bg-background p-2"
								value={region}
								onChange={(e) => setRegion(e.target.value)}
							>
								{[
									'us',
									'uk',
									'ca',
									'au',
									'de',
									'fr',
									'it',
									'es',
									'jp',
									'in',
								].map((value) => (
									<option key={value}>{value}</option>
								))}
							</NativeSelect>
						</label>
						<Button
							variant="outline"
							disabled={busy || !asin.trim()}
							onClick={() =>
								void action(
									async () => {
										const data = await findChapters(asin.trim(), region)
										if (currentOwner()) setLookup(data)
									},
									false,
									'Chapter lookup loaded',
								)
							}
						>
							Find chapters
						</Button>
						{lookup != null && (
							<Button variant="outline" onClick={() => setLookup(null)}>
								Clear lookup
							</Button>
						)}
					</div>
					{lookup != null && (
						<div className="space-y-2">
							{(() => {
								try {
									return (
										<ol>
											{audibleChapters(lookup, duration).map((chapter) => (
												<li key={`${chapter.start}-${chapter.title}`}>
													{chapter.start.toFixed(3)}–{chapter.end.toFixed(3)} s:{' '}
													{chapter.title}
												</li>
											))}
										</ol>
									)
								} catch {
									return <p role="alert">Invalid chapter lookup data</p>
								}
							})()}
							<p>
								Found chapter data. Applying replaces unsaved chapters; review
								before saving.
							</p>
							<Button
								variant="outline"
								disabled={busy}
								onClick={() => {
									try {
										const found = audibleChapters(lookup, duration)
										const problem = validateChapters(found, duration)
										if (problem) throw new Error(problem)
										if (
											window.confirm(
												'Replace unsaved chapters with Audible chapters?',
											)
										) {
											setChapters(found)
											setLookup(null)
										}
									} catch (error) {
										setError(
											error instanceof Error
												? error.message
												: 'Invalid chapter response',
										)
									}
								}}
							>
								Apply found chapters
							</Button>
						</div>
					)}
					<div className="flex flex-wrap gap-2">
						<Button
							variant="outline"
							disabled={busy}
							onClick={() =>
								setChapters((current) => [
									...current,
									{
										title: `Chapter ${current.length + 1}`,
										start: current.at(-1)?.end ?? 0,
										end: duration,
									},
								])
							}
						>
							Add chapter
						</Button>
						<Button
							disabled={busy}
							onClick={() => {
								const problem = validateChapters(chapters, duration)
								if (problem) {
									setError(problem)
									return
								}
								if (!window.confirm('Save chapter changes?')) return
								void action(() => saveChapters(id, chapters, duration))
							}}
						>
							Save chapters
						</Button>
					</div>
				</>
			)}
			{section === 'edit' && (
				<>
					<h2 className="text-xl font-semibold">Audio tracks</h2>
					<div className="flex flex-wrap gap-2">
						<Button
							variant="outline"
							onClick={() =>
								setTracks(
									((item.media.audioFiles ?? []) as Track[]).map((track) => ({
										...track,
									})),
								)
							}
						>
							Reset track order
						</Button>
						{(
							[
								'filename',
								'trackNumFromMeta',
								'trackNumFromFilename',
								'discNumFromMeta',
								'discNumFromFilename',
							] as const
						).map((field) => (
							<Button
								key={field}
								variant="outline"
								onClick={() =>
									setTracks((current) =>
										[...current].sort((a, b) =>
											field === 'filename'
												? (a.metadata?.filename ?? a.filename).localeCompare(
														b.metadata?.filename ?? b.filename,
														undefined,
														{ numeric: true },
													)
												: (a[field] ?? Infinity) - (b[field] ?? Infinity),
										),
									)
								}
							>
								{
									{
										filename: 'Sort by filename',
										trackNumFromMeta: 'Sort by metadata track',
										trackNumFromFilename: 'Sort by filename track',
										discNumFromMeta: 'Sort by metadata disc',
										discNumFromFilename: 'Sort by filename disc',
									}[field]
								}
							</Button>
						))}
					</div>
					{tracks.map((track, index) => (
						<div
							key={track.ino}
							className="flex min-w-0 flex-wrap items-center gap-3 rounded border p-3"
						>
							<span className="min-w-0 grow">
								{index + 1}. {track.metadata?.filename ?? track.filename}
							</span>
							<dl className="flex flex-wrap gap-3 text-sm">
								{Object.entries({
									'Current order': track.index,
									'Track from filename': track.trackNumFromFilename,
									'Track from metadata': track.trackNumFromMeta,
									'Disc from filename': track.discNumFromFilename,
									'Disc from metadata': track.discNumFromMeta,
									'Size (bytes)': track.metadata?.size,
									'Duration (seconds)': track.duration,
									Notes: track.error,
								}).map(([label, value]) => (
									<div key={label}>
										<dt>{label}</dt>
										<dd>{value ?? '—'}</dd>
									</div>
								))}
							</dl>
							<label>
								<input
									type="checkbox"
									checked={!track.exclude}
									onChange={(e) =>
										setTracks((current) =>
											current.map((row) =>
												row.ino === track.ino
													? { ...row, exclude: !e.target.checked }
													: row,
											),
										)
									}
								/>{' '}
								Include
							</label>
							<Button
								variant="outline"
								size="icon"
								aria-label={`Move ${track.metadata?.filename ?? track.filename} up`}
								disabled={index === 0}
								onClick={() => moveTrack(index, -1)}
							>
								<ChevronUp aria-hidden="true" />
							</Button>
							<Button
								variant="outline"
								size="icon"
								aria-label={`Move ${track.metadata?.filename ?? track.filename} down`}
								disabled={index === tracks.length - 1}
								onClick={() => moveTrack(index, 1)}
							>
								<ChevronDown aria-hidden="true" />
							</Button>
						</div>
					))}
					<Button
						variant="outline"
						disabled={busy || !tracks.length}
						onClick={() => {
							const orderedFileData = tracks.map((track, index) => ({
								index,
								filename: track.metadata?.filename ?? track.filename,
								ino: track.ino,
								exclude: !!track.exclude,
							}))
							void action(() => saveTrackOrder(id, orderedFileData))
						}}
					>
						Save track order
					</Button>
					<h2 className="text-xl font-semibold">Metadata</h2>
					<form
						id="book-metadata-form"
						className="grid items-start gap-3 sm:grid-cols-2"
						onSubmit={(e) => {
							e.preventDefault()
							const { tags, authorName, ...mediaMetadata } = metadata
							if (Array.isArray(mediaMetadata.series))
								mediaMetadata.series = mediaMetadata.series.map(
									(row: {
										id?: string
										name: string
										sequence?: string | null
									}) => ({ ...row, name: row.name.trim() }),
								)
							if (typeof authorName === 'string')
								mediaMetadata.authors = authorName
									.split(',')
									.map((name) => ({ name: name.trim() }))
									.filter((author) => author.name)
							void action(() =>
								updateMetadata(id, {
									metadata: mediaMetadata,
									...(Array.isArray(tags) ? { tags } : {}),
								}),
							)
						}}
					>
						{(
							[
								'title',
								'subtitle',
								'description',
								'authorName',
								'publisher',
								'publishedYear',
								'isbn',
								'asin',
								'language',
								'narrators',
								'genres',
								'tags',
							] as const
						).map((key) => (
							<div key={key} className="grid content-start gap-1">
								<label
									className="grid content-start gap-1"
									htmlFor={`metadata-${key}`}
								>
									{
										(
											{
												title: 'Title',
												subtitle: 'Subtitle',
												description: 'Description',
												authorName: 'Authors',
												publisher: 'Publisher',
												publishedYear: 'Published year',
												isbn: 'ISBN',
												asin: 'ASIN',
												language: 'Language',
												narrators: 'Narrators',
												genres: 'Genres',
												tags: 'Tags',
											} as const
										)[key]
									}
								</label>
								{key === 'description' ? (
									<textarea
										id={`metadata-${key}`}
										className="min-h-32 rounded border bg-background p-2"
										value={String(metadata[key] ?? '')}
										onChange={(e) =>
											setMetadata((current) => ({
												...current,
												[key]: e.target.value,
											}))
										}
									/>
								) : (
									<Input
										id={`metadata-${key}`}
										className="rounded border bg-background p-2"
										value={
											Array.isArray(metadata[key])
												? (metadata[key] as string[]).join(', ')
												: String(metadata[key] ?? '')
										}
										onChange={(e) =>
											setMetadata((current) => ({
												...current,
												[key]: ['narrators', 'genres', 'tags'].includes(key)
													? e.target.value
															.split(',')
															.map((value) => value.trim())
															.filter(Boolean)
													: e.target.value,
											}))
										}
									/>
								)}
							</div>
						))}
						<fieldset className="space-y-2 sm:col-span-2">
							<legend>Series membership</legend>
							{(
								(metadata.series ?? []) as Array<{
									id?: string
									name: string
									sequence?: string | null
								}>
							).map((series, index) => (
								<div key={series.id} className="flex flex-wrap gap-2">
									<label htmlFor={`series-name-${index}`}>
										Series name {index + 1}
										<Input
											id={`series-name-${index}`}
											required
											value={series.name}
											onChange={(event) =>
												setMetadata((current) => ({
													...current,
													series: (current.series as (typeof series)[]).map(
														(row, i) =>
															i === index
																? { ...row, name: event.target.value }
																: row,
													),
												}))
											}
										/>
									</label>
									<label htmlFor={`series-sequence-${index}`}>
										Series sequence {index + 1}
										<Input
											id={`series-sequence-${index}`}
											value={series.sequence ?? ''}
											onChange={(event) =>
												setMetadata((current) => ({
													...current,
													series: (current.series as (typeof series)[]).map(
														(row, i) =>
															i === index
																? { ...row, sequence: event.target.value }
																: row,
													),
												}))
											}
										/>
									</label>
									<Button
										type="button"
										variant="outline"
										aria-label={`Remove series ${index + 1}`}
										onClick={() =>
											setMetadata((current) => ({
												...current,
												series: (current.series as (typeof series)[]).filter(
													(_, i) => i !== index,
												),
											}))
										}
									>
										Remove series
									</Button>
								</div>
							))}
							<Button
								type="button"
								variant="outline"
								onClick={() =>
									setMetadata((current) => ({
										...current,
										series: [
											...(Array.isArray(current.series) ? current.series : []),
											{
												id: `new-${crypto.randomUUID()}`,
												name: '',
												sequence: '',
											},
										],
									}))
								}
							>
								Add series
							</Button>
						</fieldset>
						{(['explicit', 'abridged'] as const).map((key) => (
							<label key={key}>
								<input
									type="checkbox"
									checked={Boolean(metadata[key])}
									onChange={(e) =>
										setMetadata((current) => ({
											...current,
											[key]: e.target.checked,
										}))
									}
								/>{' '}
								{key === 'explicit' ? 'Explicit content' : 'Abridged'}
							</label>
						))}
					</form>
					<Button form="book-metadata-form" disabled={busy}>
						Save metadata
					</Button>
					<BookMatch id={id} metadata={metadata} onApplied={load} />
				</>
			)}
			{section === 'manage' && (
				<BookTools
					id={id}
					hasAudio={
						!item.isMissing &&
						((item.media.audioFiles ?? []) as Track[]).some(
							(track) => !track.exclude,
						)
					}
				/>
			)}
			{section === 'edit' && (
				<section className="space-y-4 border-t pt-4">
					<h2 className="text-xl font-semibold">Cover</h2>
					<div className="grid items-start gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
						{item.media.coverPath ? (
							<img
								className="w-32 rounded"
								src={`${coverPath}${coverToken ? `?token=${encodeURIComponent(coverToken)}` : ''}`}
								alt={`${item.media.metadata.title ?? 'Audiobook'} cover`}
							/>
						) : (
							<div />
						)}
						<div className="min-w-0 space-y-3">
							<form
								className="flex flex-wrap items-end gap-2"
								onSubmit={(e) => {
									e.preventDefault()
									void action(() => setCoverUrl(id, coverUrl))
								}}
							>
								<label
									className="grid min-w-0 grow gap-1"
									htmlFor={'book-input-7'}
								>
									Cover URL
									<Input
										id={'book-input-7'}
										type="url"
										className="block w-full rounded border bg-background p-2"
										value={coverUrl}
										onChange={(e) => setCover(e.target.value)}
									/>
								</label>
								<Button variant="outline" disabled={busy}>
									Set cover URL
								</Button>
							</form>
							<div className="flex flex-wrap items-end gap-2">
								<label
									className="grid min-w-0 grow gap-1"
									htmlFor={'book-input-8'}
								>
									Search cover title
									<Input
										id={'book-input-8'}
										className="block w-full rounded border bg-background p-2"
										value={searchTerm}
										onChange={(e) => setSearchTerm(e.target.value)}
									/>
								</label>
								<Button
									variant="outline"
									disabled={busy || !searchTerm.trim()}
									onClick={() =>
										void action(
											async () => {
												const result = await searchCovers(
													'best',
													searchTerm.trim(),
													String(metadata.authorName ?? ''),
												)
												if (currentOwner()) setCoverResults(result.results)
											},
											false,
											'Cover search loaded',
										)
									}
								>
									Search covers
								</Button>
							</div>
							{coverResults.map((url) => (
								<button
									type="button"
									key={url}
									className="rounded border p-2"
									onClick={() => void action(() => setCoverUrl(id, url))}
								>
									<img className="h-24" src={url} alt="Cover search result" />
								</button>
							))}
							{item.libraryFiles
								?.filter((file) => file.fileType === 'image')
								.map((file) => (
									<Button
										key={file.ino}
										variant="outline"
										onClick={() => {
											const path = (
												file as typeof file & { metadata?: { path?: string } }
											).metadata?.path
											if (path) void action(() => setLocalCover(id, path))
										}}
									>
										Use local cover {file.metadata?.filename}
									</Button>
								))}
							{canUpload && (
								<div>
									<Button
										type="button"
										variant="outline"
										disabled={busy}
										onClick={() => uploadInput.current?.click()}
									>
										Upload cover
									</Button>
									<Input
										id={'book-input-9'}
										ref={uploadInput}
										className="hidden"
										aria-label="Upload cover file"
										type="file"
										accept="image/*"
										disabled={busy}
										onChange={(e) => {
											const file = e.target.files?.[0]
											if (file) void action(() => uploadCover(id, file))
											e.currentTarget.value = ''
										}}
									/>
								</div>
							)}
							{canDelete && item.media.coverPath && (
								<Button
									variant="outline"
									className="text-destructive hover:text-destructive"
									disabled={busy}
									onClick={() => {
										if (window.confirm('Remove audiobook cover?'))
											void action(() => removeCover(id))
									}}
								>
									Remove cover
								</Button>
							)}
						</div>
					</div>
				</section>
			)}
		</section>
	)
}
