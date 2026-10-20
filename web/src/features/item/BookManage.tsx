import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { api, useAuth } from '../../api'
import { Button } from '../../shared/components/ui/button'
import {
	audibleChapters,
	type Chapter,
	findChapters,
	matchItem,
	removeCover,
	saveChapters,
	saveTrackOrder,
	searchCovers,
	setCoverUrl,
	setLocalCover,
	shiftChapters,
	updateMetadata,
	uploadCover,
	validateChapters,
} from './book-manage'
import type { Item } from './schemas'
import { getItem } from './service'

const itemResult = z.object({}).passthrough()
type Props = { id: string; section: 'chapters' | 'edit' | 'manage' }
type Track = {
	ino: number
	index: number
	filename: string
	exclude?: boolean
	metadata?: { filename?: string }
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
	const [item, setItem] = useState<Item | null>(null)
	const [chapters, setChapters] = useState<Chapter[]>([])
	const [tracks, setTracks] = useState<Track[]>([])
	const [metadata, setMetadata] = useState<Record<string, unknown>>({})
	const [bulkTitle, setBulkTitle] = useState('')
	const [shiftSeconds, setShiftSeconds] = useState('0')
	const [asin, setAsin] = useState('')
	const [region, setRegion] = useState('us')
	const [lookup, setLookup] = useState<unknown>(null)
	const [coverUrl, setCover] = useState('')
	const [searchTerm, setSearchTerm] = useState('')
	const [coverResults, setCoverResults] = useState<string[]>([])
	const [codec, setCodec] = useState('aac')
	const [bitrate, setBitrate] = useState('128k')
	const [channels, setChannels] = useState('2')
	const [backup, setBackup] = useState(true)
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
	if (!canUpdate && !(section === 'manage' && isAdmin))
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
	return (
		<section className="mx-auto max-w-5xl space-y-5 p-4">
			<h2 className="text-2xl font-semibold">
				{section === 'chapters'
					? 'Chapters'
					: section === 'edit'
						? 'Tracks and metadata'
						: 'Manage audiobook'}
			</h2>
			{error && (
				<p role="alert" className="text-destructive">
					{error}
				</p>
			)}
			{notice && <p role="status">{notice}</p>}
			{section === 'chapters' && (
				<>
					<p>Duration: {duration.toFixed(2)} s</p>
					{chapters.map((chapter, index) => (
						<div
							key={chapter.id ?? index}
							className="grid gap-2 rounded border p-3 sm:grid-cols-[1fr_9rem_9rem_auto]"
						>
							<label>
								Title
								<input
									className="block w-full rounded border bg-background p-2"
									value={chapter.title}
									onChange={(e) => setChapter(index, { title: e.target.value })}
								/>
							</label>
							<label>
								Start (seconds)
								<input
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
							<label>
								End (seconds)
								<input
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
						<label>
							Bulk title prefix
							<input
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
						<label>
							Shift seconds
							<input
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
									setChapters((current) =>
										shiftChapters(current, Number(shiftSeconds)),
									)
								} catch (e) {
									setError(e instanceof Error ? e.message : 'Invalid shift')
								}
							}}
						>
							Shift all
						</Button>
						<label>
							ASIN
							<input
								className="block rounded border bg-background p-2"
								value={asin}
								onChange={(e) => setAsin(e.target.value)}
							/>
						</label>
						<label>
							Region
							<select
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
							</select>
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
					<div className="flex gap-2">
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
					<h3 className="text-lg font-semibold">Audio tracks</h3>
					{tracks.map((track, index) => (
						<div
							key={track.ino}
							className="flex items-center gap-3 rounded border p-3"
						>
							<span className="grow">
								{index + 1}. {track.metadata?.filename ?? track.filename}
							</span>
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
								disabled={index === 0}
								onClick={() => moveTrack(index, -1)}
							>
								Up
							</Button>
							<Button
								variant="outline"
								disabled={index === tracks.length - 1}
								onClick={() => moveTrack(index, 1)}
							>
								Down
							</Button>
						</div>
					))}
					<Button
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
					<h3 className="text-lg font-semibold">Metadata</h3>
					<form
						className="grid gap-3 sm:grid-cols-2"
						onSubmit={(e) => {
							e.preventDefault()
							const { tags, authorName, ...mediaMetadata } = metadata
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
							<label key={key} className="grid gap-1">
								{key}
								<input
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
							</label>
						))}
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
								{key}
							</label>
						))}
						<Button disabled={busy}>Save all metadata</Button>
					</form>
					<form
						className="flex gap-2"
						onSubmit={(e) => {
							e.preventDefault()
							void action(() =>
								matchItem(id, {
									provider: 'google',
									title: String(metadata.title ?? ''),
									author: String(metadata.authorName ?? ''),
									isbn: String(metadata.isbn ?? ''),
									asin: String(metadata.asin ?? ''),
									overrideDetails: true,
									overrideCover: false,
								}),
							)
						}}
					>
						<Button disabled={busy}>Apply match</Button>
					</form>
				</>
			)}
			{section === 'manage' && (
				<>
					<p>
						Metadata object and audio encoding require administrator access and
						are not exposed as update-permission controls.
					</p>
					{isAdmin && (
						<div className="grid gap-3">
							<Button
								disabled={busy}
								onClick={() =>
									void action(
										async () => {
											await api(
												`/api/items/${encodeURIComponent(id)}/metadata-object`,
												itemResult,
											)
										},
										false,
										'Metadata object retrieved. No changes made.',
									)
								}
							>
								Check metadata object
							</Button>
							<label>
								<input
									type="checkbox"
									checked={backup}
									onChange={(e) => setBackup(e.target.checked)}
								/>{' '}
								Back up audio before embedding metadata
							</label>
							<Button
								disabled={busy}
								onClick={() => {
									if (
										window.confirm('Embed metadata into audiobook audio files?')
									)
										void action(
											() =>
												api(
													`/api/tools/item/${encodeURIComponent(id)}/embed-metadata?backup=${backup ? 1 : 0}`,
													itemResult,
													{ method: 'POST' },
												),
											false,
											'Metadata embed started',
										)
								}}
							>
								Start metadata embed
							</Button>
							<label>
								Codec
								<select
									className="rounded border bg-background p-2"
									value={codec}
									onChange={(e) => setCodec(e.target.value)}
								>
									{['copy', 'aac', 'opus'].map((value) => (
										<option key={value}>{value}</option>
									))}
								</select>
							</label>
							<label>
								Bitrate
								<select
									className="rounded border bg-background p-2"
									value={bitrate}
									onChange={(e) => setBitrate(e.target.value)}
								>
									{['32k', '64k', '128k', '192k'].map((value) => (
										<option key={value}>{value}</option>
									))}
								</select>
							</label>
							<label>
								Channels
								<select
									className="rounded border bg-background p-2"
									value={channels}
									onChange={(e) => setChannels(e.target.value)}
								>
									<option value="1">1 (mono)</option>
									<option value="2">2 (stereo)</option>
								</select>
							</label>
							<Button
								disabled={busy}
								onClick={() =>
									void action(
										() =>
											api(
												`/api/tools/item/${encodeURIComponent(id)}/encode-m4b?${new URLSearchParams({ codec, bitrate, channels })}`,
												itemResult,
												{ method: 'POST' },
											),
										false,
										'M4B encoding started',
									)
								}
							>
								Start M4B encoding
							</Button>
							<Button
								variant="destructive"
								disabled={busy}
								onClick={() =>
									void action(
										() =>
											api(
												`/api/tools/item/${encodeURIComponent(id)}/encode-m4b`,
												itemResult,
												{ method: 'DELETE' },
											),
										false,
										'M4B cancellation requested',
									)
								}
							>
								Cancel M4B encoding
							</Button>
						</div>
					)}
				</>
			)}
			<section className="space-y-2 border-t pt-4">
				<h3 className="font-semibold">Cover</h3>
				{item.media.coverPath && (
					<img
						className="w-32 rounded"
						src={`${coverPath}${coverToken ? `?token=${encodeURIComponent(coverToken)}` : ''}`}
						alt={`${item.media.metadata.title ?? 'Audiobook'} cover`}
					/>
				)}
				<form
					className="flex gap-2"
					onSubmit={(e) => {
						e.preventDefault()
						void action(() => setCoverUrl(id, coverUrl))
					}}
				>
					<label className="grow">
						Cover URL
						<input
							type="url"
							className="block w-full rounded border bg-background p-2"
							value={coverUrl}
							onChange={(e) => setCover(e.target.value)}
						/>
					</label>
					<Button disabled={busy}>Set cover URL</Button>
				</form>
				<label>
					Search cover title
					<input
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
					<label>
						Upload cover
						<input
							type="file"
							accept="image/*"
							disabled={busy}
							onChange={(e) => {
								const file = e.target.files?.[0]
								if (file) void action(() => uploadCover(id, file))
								e.currentTarget.value = ''
							}}
						/>
					</label>
				)}
				{canDelete && item.media.coverPath && (
					<Button
						variant="destructive"
						disabled={busy}
						onClick={() => {
							if (window.confirm('Remove audiobook cover?'))
								void action(() => removeCover(id))
						}}
					>
						Remove cover
					</Button>
				)}
			</section>
		</section>
	)
}
