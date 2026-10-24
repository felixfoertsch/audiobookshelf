import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { api, getAuthGeneration, useAuth } from '../../api'
import { Button } from '../../shared/components/ui/button'

type Library = {
	id: string
	mediaType: string
	folders: { id: string; fullPath: string }[]
}
const admin = (user: unknown) =>
	z.object({ type: z.enum(['admin', 'root']) }).safeParse(user).success
const feedUrl = z
	.string()
	.min(1)
	.refine((value) => {
		try {
			const url = new URL(value)
			return (
				['http:', 'https:'].includes(url.protocol) &&
				!url.username &&
				!url.password
			)
		} catch {
			return false
		}
	})
// Server.js express.json limit is 10 MiB, including JSON escaping and envelope.
export const OPML_BODY_LIMIT = 10 * 1024 * 1024
export const opmlFeedsSchema = z
	.object({
		feeds: z
			.array(z.object({ title: z.string().optional(), feedUrl }))
			.min(1)
			.max(OPML_BODY_LIMIT),
	})
	.refine(
		(value) =>
			new TextEncoder().encode(JSON.stringify(value)).byteLength <=
			OPML_BODY_LIMIT,
	)
export function OpmlImport({ library }: { library: Library }) {
	const user = useAuth((state) => state.user)
	const allowed = admin(user) && library.mediaType === 'podcast'
	const dialog = useRef<HTMLDialogElement>(null)
	const upload = useRef<HTMLInputElement>(null)
	const pending = useRef(false)
	const request = useRef<AbortController | null>(null)
	const revision = useRef(0)
	const reviewGeneration = useRef<number | null>(null)
	const [feeds, setFeeds] = useState<
		z.infer<typeof opmlFeedsSchema>['feeds'] | null
	>(null)
	const [folderId, setFolderId] = useState(library.folders[0]?.id || '')
	const [autoDownloadEpisodes, setAutoDownloadEpisodes] = useState(false)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState('')
	const [message, setMessage] = useState('')
	const [fileName, setFileName] = useState('')
	const defaultFolder = library.folders[0]?.id || ''
	const current = useRef({ id: library.id, userId: user?.id, allowed })
	current.current = { id: library.id, userId: user?.id, allowed }
	// biome-ignore lint/correctness/useExhaustiveDependencies: identity/library/permission changes invalidate pending file reads and requests.
	useEffect(() => {
		revision.current++
		request.current?.abort()
		pending.current = false
		setFeeds(null)
		setBusy(false)
		setError('')
		setMessage('')
		setFileName('')
		setFolderId(defaultFolder)
		setAutoDownloadEpisodes(false)
		return () => {
			revision.current++
			request.current?.abort()
		}
	}, [library.id, defaultFolder, user?.id, allowed])
	useEffect(() => {
		if (feeds) dialog.current?.showModal()
		return () => {
			if (feeds) upload.current?.focus()
		}
	}, [feeds])
	function operation() {
		if (
			pending.current ||
			!current.current.allowed ||
			!admin(useAuth.getState().user)
		)
			return null
		pending.current = true
		setBusy(true)
		setError('')
		setMessage('')
		const controller = new AbortController()
		request.current = controller
		const captured = {
			...current.current,
			generation: getAuthGeneration(),
			revision: revision.current,
		}
		const valid = () =>
			!controller.signal.aborted &&
			captured.revision === revision.current &&
			captured.generation === getAuthGeneration() &&
			captured.id === current.current.id &&
			captured.userId === useAuth.getState().user?.id &&
			current.current.allowed &&
			admin(useAuth.getState().user)
		return {
			controller,
			valid,
			finish: () => {
				if (captured.revision === revision.current) {
					pending.current = false
					setBusy(false)
				}
			},
		}
	}
	async function parse(file: File) {
		const action = operation()
		if (!action) return
		try {
			if (
				!/\.(opml|txt)$/i.test(file.name) ||
				!file.size ||
				file.size > OPML_BODY_LIMIT
			)
				throw new Error('invalid')
			const text = await file.text()
			if (!action.valid()) return
			const body = JSON.stringify({ opmlText: text })
			if (
				!text.trim() ||
				new TextEncoder().encode(body).byteLength > OPML_BODY_LIMIT
			)
				throw new Error('invalid')
			const parsed = await api('/api/podcasts/opml/parse', opmlFeedsSchema, {
				method: 'POST',
				body,
				signal: action.controller.signal,
			})
			if (!action.valid()) return
			setFolderId(library.folders[0]?.id || '')
			setAutoDownloadEpisodes(false)
			reviewGeneration.current = getAuthGeneration()
			setFeeds(parsed.feeds)
		} catch {
			if (action.valid())
				setError(
					'Could not read OPML feeds. Choose a valid .opml or .txt file containing HTTP or HTTPS feed URLs without credentials, within the 10 MiB request limit.',
				)
		} finally {
			action.finish()
			if (upload.current) upload.current.value = ''
		}
	}
	function cancel() {
		revision.current++
		request.current?.abort()
		pending.current = false
		setBusy(false)
		setFeeds(null)
		dialog.current?.close()
	}
	async function submit(event: React.FormEvent) {
		event.preventDefault()
		if (reviewGeneration.current !== getAuthGeneration()) {
			cancel()
			return
		}
		if (!feeds || !library.folders.some((folder) => folder.id === folderId))
			return
		const action = operation()
		if (!action) return
		try {
			await api('/api/podcasts/opml/create', z.object({}), {
				method: 'POST',
				signal: action.controller.signal,
				body: JSON.stringify({
					feeds: feeds.map((feed) => feed.feedUrl),
					folderId,
					libraryId: library.id,
					autoDownloadEpisodes,
				}),
			})
			if (action.valid()) {
				setFeeds(null)
				setMessage(
					'Podcast import started. Check server activity for progress and individual feed failures.',
				)
			}
		} catch {
			if (action.valid())
				setError(
					'Could not start podcast import. Retry or check server activity.',
				)
		} finally {
			action.finish()
		}
	}
	if (!allowed) return null
	return (
		<section aria-label="OPML import" className="space-y-2">
			<div className="flex items-center gap-2">
				<Button
					type="button"
					variant="outline"
					disabled={busy || !library.folders.length}
					onClick={() => upload.current?.click()}
				>
					Choose OPML file
				</Button>
				<span aria-live="polite" className="text-sm text-muted-foreground">
					{fileName || 'No file chosen'}
				</span>
				<label className="sr-only">
					Import OPML
					<input
						ref={upload}
						type="file"
						accept=".opml,.txt"
						disabled={busy || !library.folders.length}
						className="sr-only"
						onChange={(event) => {
							const file = event.target.files?.[0]
							if (file) {
								setFileName(file.name)
								void parse(file)
							}
						}}
					/>
				</label>
			</div>
			{busy && <p role="status">Processing OPML…</p>}
			{error && <p role="alert">{error}</p>}
			{message && <p role="status">{message}</p>}
			{feeds && (
				<dialog
					ref={dialog}
					aria-label="Review OPML feeds"
					onCancel={(event) => {
						event.preventDefault()
						cancel()
					}}
					className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-auto rounded border bg-background p-4 text-foreground backdrop:bg-black/60"
				>
					<form
						onSubmit={(event) => {
							void submit(event)
						}}
						className="space-y-4"
					>
						<h2 className="text-xl">Podcasts to add</h2>
						<p>
							Review feed URLs before starting import. Podcasts are added in the
							background.
						</p>
						<label className="block">
							Destination folder{' '}
							<select
								className="w-full rounded border bg-background p-2"
								disabled={busy}
								value={folderId}
								onChange={(event) => setFolderId(event.target.value)}
							>
								{library.folders.map((folder) => (
									<option key={folder.id} value={folder.id}>
										{folder.fullPath}
									</option>
								))}
							</select>
						</label>
						<label className="flex items-center gap-2">
							<input
								type="checkbox"
								checked={autoDownloadEpisodes}
								disabled={busy}
								onChange={(event) =>
									setAutoDownloadEpisodes(event.target.checked)
								}
							/>
							Automatically download episodes
						</label>
						<ol className="max-h-[40dvh] space-y-3 overflow-auto">
							{feeds.map((feed, index) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: immutable native feed list may contain duplicate URLs.
								<li key={`${index}-${feed.feedUrl}`} className="break-all">
									<p className="font-semibold">
										{index + 1}. {feed.title || 'Untitled feed'}
									</p>
									<p>{feed.feedUrl}</p>
								</li>
							))}
						</ol>
						{error && <p role="alert">{error}</p>}
						<div className="flex flex-wrap gap-2">
							<Button disabled={busy || !folderId}>Add podcasts</Button>
							<Button type="button" variant="outline" onClick={cancel}>
								Cancel
							</Button>
						</div>
					</form>
				</dialog>
			)}
		</section>
	)
}
