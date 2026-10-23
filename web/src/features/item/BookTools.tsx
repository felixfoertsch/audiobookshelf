import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { api, useAuth } from '../../api'
import { Button } from '../../shared/components/ui/button'
import { NativeSelect } from '../../shared/components/ui/native-select'
import { getItem } from './service'

type Props = { id: string; hasAudio: boolean }
type Task = {
	id?: string
	action?: string
	isFinished?: boolean
	isFailed?: boolean
	error?: string | null
	data?: { libraryItemId?: string; encodeOptions?: Record<string, unknown> }
}
type Track = {
	ino: number
	filename: string
	index: number
	exclude?: boolean
	codec?: string
	channels?: number
	bitRate?: number
	channelLayout?: string
	metadata?: { filename?: string; size?: number }
}
const taskSchema = z.object({
	id: z.string().optional(),
	action: z.string().optional(),
	isFinished: z.boolean().optional(),
	isFailed: z.boolean().optional(),
	error: z.string().nullable().optional(),
	data: z
		.object({
			libraryItemId: z.string().optional(),
			encodeOptions: z.record(z.string(), z.unknown()).optional(),
		})
		.optional(),
})
const itemSchema = z.object({}).passthrough()
const taskListSchema = z.object({
	tasks: z.array(taskSchema),
	queuedTaskData: z
		.object({
			embedMetadata: z.array(
				z.object({ libraryItemId: z.string() }).passthrough(),
			),
		})
		.optional(),
})
const metadataSchema = z.record(z.string(), z.unknown())
export function BookTools({ id, hasAudio }: Props) {
	const user = useAuth((state) => state.user)
	const owner = user?.id
	const currentItemId = useRef(id)
	currentItemId.current = id
	const permissions = user as (typeof user & { type?: string }) | null
	const admin = permissions?.type === 'admin' || permissions?.type === 'root'
	const current = useCallback(
		() =>
			active.current &&
			!!owner &&
			currentItemId.current === id &&
			useAuth.getState().user?.id === owner &&
			['admin', 'root'].includes(String(useAuth.getState().user?.type)),
		[owner, id],
	)
	const [item, setItem] = useState<Awaited<ReturnType<typeof getItem>> | null>(
		null,
	)
	const [metadata, setMetadata] = useState<Record<string, unknown>>({})
	const [tool, setTool] = useState<'embed' | 'm4b'>('embed')
	const [backup, setBackup] = useState(
		() => localStorage.getItem('embedMetadataShouldBackup') !== '0',
	)
	const [codec, setCodec] = useState(
		() => localStorage.getItem('embedMetadataCodec') || 'aac',
	)
	const [bitrate, setBitrate] = useState(
		() => localStorage.getItem('embedMetadataBitrate') || '128k',
	)
	const [channels, setChannels] = useState(
		() => localStorage.getItem('embedMetadataChannels') || '2',
	)
	const [advanced, setAdvanced] = useState(false)
	const [customCodec, setCustomCodec] = useState(
		() => localStorage.getItem('embedMetadataCodec') || 'aac',
	)
	const [customBitrate, setCustomBitrate] = useState(
		() => localStorage.getItem('embedMetadataBitrate') || '128k',
	)
	const [customChannels, setCustomChannels] = useState(
		() => localStorage.getItem('embedMetadataChannels') || '2',
	)
	const [tasks, setTasks] = useState<Task[]>([])
	const [queued, setQueued] = useState(false)
	const [requestPendingState, setRequestPendingState] = useState(false)
	const [progress, setProgress] = useState(0)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState('')
	const [notice, setNotice] = useState('')
	const active = useRef(true)
	const busyRef = useRef(false)
	const requestPending = useRef(false)
	useEffect(() => {
		active.current = true
		return () => {
			active.current = false
		}
	}, [])
	useEffect(() => {
		let active = true
		setItem(null)
		setTasks([])
		setQueued(false)
		setRequestPendingState(false)
		requestPending.current = false
		setProgress(0)
		setNotice('')
		setError('')
		if (!admin || !current())
			return () => {
				active = false
			}
		void Promise.all([
			getItem(id),
			api('/api/tasks?include=queue', taskListSchema),
		])
			.then(async ([value, taskData]) => {
				if (!active || !current() || value.id !== id) return
				setItem(value)
				setTasks(
					taskData.tasks.filter(
						(task) =>
							task.data?.libraryItemId === id &&
							['embed-metadata', 'encode-m4b'].includes(task.action ?? ''),
					),
				)
				setQueued(
					taskData.queuedTaskData?.embedMetadata.some(
						(data) => data.libraryItemId === id,
					) ?? false,
				)
				const object = await api(
					`/api/items/${encodeURIComponent(id)}/metadata-object`,
					metadataSchema,
				)
				if (active && current()) setMetadata(object)
			})
			.catch((cause) => {
				if (active && current())
					setError(
						cause instanceof Error ? cause.message : 'Could not load tools',
					)
			})
		return () => {
			active = false
		}
	}, [id, admin, current])
	useEffect(() => {
		const receive = (event: Event) => {
			if (!(event instanceof CustomEvent)) return
			if (!active.current || !current() || currentItemId.current !== id) return
			const { event: name, payload } = event.detail ?? {}
			if (name === 'task_started' || name === 'task_finished') {
				const parsed = taskSchema.safeParse(payload)
				if (
					!parsed.success ||
					parsed.data.data?.libraryItemId !== id ||
					!['embed-metadata', 'encode-m4b'].includes(parsed.data.action ?? '')
				)
					return
				setTasks((existing) => [
					...existing.filter(
						(task) =>
							task.id !== parsed.data.id &&
							!(
								task.action === parsed.data.action &&
								task.data?.libraryItemId === id
							),
					),
					parsed.data,
				])
				requestPending.current = false
				setRequestPendingState(false)
				if (parsed.data.action === 'embed-metadata') setQueued(false)
			} else if (
				name === 'task_progress' &&
				payload?.libraryItemId === id &&
				typeof payload.progress === 'number' &&
				Number.isFinite(payload.progress)
			)
				setProgress(Math.max(0, Math.min(100, payload.progress)))
			else if (
				name === 'metadata_embed_queue_update' &&
				payload?.libraryItemId === id
			) {
				setQueued(payload.queued === true)
				if (!payload.queued) {
					requestPending.current = false
					setRequestPendingState(false)
				}
			}
		}
		window.addEventListener('abs:socket', receive)
		return () => window.removeEventListener('abs:socket', receive)
	}, [id, current])
	const activeTask = tasks.find(
		(task) =>
			task.action === (tool === 'embed' ? 'embed-metadata' : 'encode-m4b'),
	)
	const run = async (path: string, method: 'POST' | 'DELETE' = 'POST') => {
		if (
			!current() ||
			!admin ||
			!hasAudio ||
			busyRef.current ||
			(method === 'POST' && requestPending.current) ||
			(method === 'POST' && queued) ||
			(method === 'POST' && activeTask && !activeTask.isFinished) ||
			item?.id !== id
		)
			return
		busyRef.current = true
		setBusy(true)
		setError('')
		setNotice('')
		if (method === 'POST') {
			requestPending.current = true
			setRequestPendingState(true)
			if (tool === 'embed') setQueued(true)
		}
		try {
			await api(path, itemSchema, { method })
			if (!current()) return
			setProgress(0)
			if (method === 'DELETE')
				setNotice('M4B cancellation requested. Waiting for task to finish.')
		} catch (cause) {
			if (current()) {
				requestPending.current = false
				setRequestPendingState(false)
				if (method === 'POST' && tool === 'embed') setQueued(false)
				setError(cause instanceof Error ? cause.message : 'Request failed')
			}
		} finally {
			busyRef.current = false
			if (current()) setBusy(false)
		}
	}
	if (!admin) return <p role="alert">Administrator permission required.</p>
	if (!hasAudio) return <p role="alert">This audiobook has no audio files.</p>
	if (!item)
		return (
			<section aria-busy="true">
				{error ? <p role="alert">{error}</p> : <p>Loading encoding tools…</p>}
			</section>
		)
	const tracks = (
		(item as { media: { audioFiles?: Track[] } }).media.audioFiles ?? []
	).filter((file: Track) => !file.exclude)
	const encoding = activeTask?.data?.encodeOptions
	const encodeParams = new URLSearchParams(
		advanced
			? {
					codec: customCodec || codec,
					bitrate: customBitrate || bitrate,
					channels: customChannels || channels,
				}
			: { codec, bitrate, channels },
	).toString()
	return (
		<section className="space-y-4">
			<h2 className="text-xl font-semibold">Encoding and metadata embedding</h2>
			{error && <p role="alert">{error}</p>}
			{notice && <p role="status">{notice}</p>}
			<div className="grid gap-4 md:grid-cols-2">
				<section>
					<h3 className="font-semibold">Metadata to embed</h3>
					<dl>
						{Object.entries(metadata).map(([key, value]) => (
							<div key={key} className="flex gap-3">
								<dt className="font-semibold">{key}</dt>
								<dd>
									{Array.isArray(value)
										? value.join(', ')
										: String(value ?? '')}
								</dd>
							</div>
						))}
					</dl>
				</section>
				<section>
					<h3 className="font-semibold">Chapters</h3>
					{item.media.chapters?.length ? (
						item.media.chapters.map((chapter) => (
							<p key={chapter.id}>
								{chapter.title} — {chapter.start}s–{chapter.end}s
							</p>
						))
					) : (
						<p>No chapters</p>
					)}
				</section>
			</div>
			<div className="grid gap-1">
				<label htmlFor="book-tools-tool">Tool</label>
				<NativeSelect
					id="book-tools-tool"
					value={tool}
					disabled={busy || (!!activeTask && !activeTask.isFinished)}
					onChange={(event) => setTool(event.target.value as 'embed' | 'm4b')}
				>
					<option value="embed">Embed metadata</option>
					<option value="m4b">M4B encoder</option>
				</NativeSelect>
			</div>
			{tool === 'embed' ? (
				<label>
					<input
						type="checkbox"
						checked={backup}
						disabled={busy}
						onChange={(event) => {
							setBackup(event.target.checked)
							localStorage.setItem(
								'embedMetadataShouldBackup',
								event.target.checked ? '1' : '0',
							)
						}}
					/>{' '}
					Back up audio before embedding
				</label>
			) : activeTask?.isFinished ? (
				<p>
					Encoding options: {String(encoding?.codec ?? 'aac')},{' '}
					{String(encoding?.bitrate ?? '128k')},{' '}
					{String(encoding?.channels ?? '2')} channels
				</p>
			) : (
				<div className="space-y-3">
					<div className="flex gap-2">
						<Button
							type="button"
							variant={advanced ? 'outline' : 'default'}
							disabled={busy || !!activeTask}
							onClick={() => setAdvanced(false)}
						>
							Presets
						</Button>
						<Button
							type="button"
							variant={advanced ? 'default' : 'outline'}
							disabled={busy || !!activeTask}
							onClick={() => setAdvanced(true)}
						>
							Advanced
						</Button>
					</div>
					{advanced ? (
						<div className="flex flex-wrap gap-3">
							<div>
								<label htmlFor="book-tools-audio-codec">Audio codec</label>
								<input
									id="book-tools-audio-codec"
									className="block rounded border bg-background p-2"
									value={customCodec}
									disabled={busy || !!activeTask}
									onChange={(event) => {
										setCustomCodec(event.target.value)
										localStorage.setItem(
											'embedMetadataCodec',
											event.target.value,
										)
									}}
								/>
							</div>
							<div>
								<label htmlFor="book-tools-audio-bitrate">Audio bitrate</label>
								<input
									id="book-tools-audio-bitrate"
									className="block rounded border bg-background p-2"
									value={customBitrate}
									disabled={busy || !!activeTask}
									onChange={(event) => {
										setCustomBitrate(event.target.value)
										localStorage.setItem(
											'embedMetadataBitrate',
											event.target.value,
										)
									}}
								/>
							</div>
							<div>
								<label htmlFor="book-tools-audio-channels">
									Audio channels
								</label>
								<input
									id="book-tools-audio-channels"
									type="number"
									className="block rounded border bg-background p-2"
									value={customChannels}
									disabled={busy || !!activeTask}
									onChange={(event) => {
										setCustomChannels(event.target.value)
										localStorage.setItem(
											'embedMetadataChannels',
											event.target.value,
										)
									}}
								/>
							</div>
							<p role="note">
								Advanced settings may produce incompatible output.
							</p>
						</div>
					) : (
						<div className="flex flex-wrap gap-3">
							<div>
								<label htmlFor="book-tools-preset-codec">Codec</label>
								<NativeSelect
									id="book-tools-preset-codec"
									value={codec}
									disabled={busy || !!activeTask}
									onChange={(event) => {
										setCodec(event.target.value)
										localStorage.setItem(
											'embedMetadataCodec',
											event.target.value,
										)
									}}
								>
									{['copy', 'aac', 'opus'].map((value) => (
										<option key={value}>{value}</option>
									))}
								</NativeSelect>
							</div>
							<div>
								<label htmlFor="book-tools-preset-bitrate">Bitrate</label>
								<NativeSelect
									id="book-tools-preset-bitrate"
									value={bitrate}
									disabled={busy || !!activeTask}
									onChange={(event) => {
										setBitrate(event.target.value)
										localStorage.setItem(
											'embedMetadataBitrate',
											event.target.value,
										)
									}}
								>
									{['32k', '64k', '128k', '192k'].map((value) => (
										<option key={value}>{value}</option>
									))}
								</NativeSelect>
							</div>
							<div>
								<label htmlFor="book-tools-preset-channels">Channels</label>
								<NativeSelect
									id="book-tools-preset-channels"
									value={channels}
									disabled={busy || !!activeTask}
									onChange={(event) => {
										setChannels(event.target.value)
										localStorage.setItem(
											'embedMetadataChannels',
											event.target.value,
										)
									}}
								>
									<option value="1">1 (mono)</option>
									<option value="2">2 (stereo)</option>
								</NativeSelect>
							</div>
							<p role="note">
								Codec copy preset may not work with all source codecs.
							</p>
						</div>
					)}
				</div>
			)}
			{queued && tool === 'embed' && (
				<p role="status">Metadata embedding queued.</p>
			)}
			{requestPendingState && !queued && !activeTask && (
				<p role="status">Request accepted; waiting for task status.</p>
			)}
			{activeTask?.isFinished && (
				<p
					role="status"
					className={
						activeTask.isFailed ? 'text-destructive' : 'text-green-700'
					}
				>
					{activeTask.isFailed
						? `Task failed: ${activeTask.error ?? 'Unknown error'}`
						: 'Task finished'}
				</p>
			)}
			{!activeTask?.isFinished && activeTask && (
				<p role="status">
					{activeTask.action === 'embed-metadata'
						? 'Embedding metadata'
						: 'Encoding M4B'}
					: {progress}%
				</p>
			)}
			{!(activeTask && !activeTask.isFinished) && (
				<div className="flex gap-2">
					<Button
						disabled={busy || queued || requestPendingState}
						onClick={() => {
							if (
								tool === 'embed' &&
								!window.confirm(
									`Embed metadata into ${tracks.length} audio files?`,
								)
							)
								return
							void run(
								`/api/tools/item/${encodeURIComponent(id)}/${tool === 'embed' ? `embed-metadata?backup=${backup ? 1 : 0}` : `encode-m4b?${encodeParams}`}`,
							)
						}}
					>
						Start {tool === 'embed' ? 'metadata embed' : 'M4B encoding'}
					</Button>
				</div>
			)}
			{tool === 'm4b' && activeTask && !activeTask.isFinished && (
				<Button
					variant="destructive"
					disabled={busy}
					onClick={() =>
						void run(
							`/api/tools/item/${encodeURIComponent(id)}/encode-m4b`,
							'DELETE',
						)
					}
				>
					Cancel M4B encoding
				</Button>
			)}
			<ul className="space-y-1 text-sm text-muted-foreground">
				<li>
					Embedding may not include chapters when multiple audio files exist.
				</li>
				<li>
					M4B encoding can take a long time; file watcher is disabled during
					encoding.
				</li>
				<li>
					Backups and temporary files use /metadata/cache/items/{id}/. Clear
					item cache after reviewing backups.
				</li>
				<li>
					Keep a backup before starting. Leaving page does not stop background
					task.
				</li>
			</ul>
			<h3 className="font-semibold">Audio tracks</h3>
			{tracks.map((track, index) => (
				<p key={track.ino}>
					{index + 1}. {track.metadata?.filename ?? track.filename} —{' '}
					{track.codec ?? 'unknown'}, {track.channels ?? 'unknown'} channels,{' '}
					{track.bitRate ?? 0} bit/s, {track.metadata?.size ?? 0} bytes
				</p>
			))}
		</section>
	)
}
