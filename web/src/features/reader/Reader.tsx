import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { ApiError, api, apiBinary, getAuthGeneration, useAuth } from '../../api'
import { Comic } from './Comic'
import { Epub } from './Epub'
import { Mobi } from './Mobi'
import { Pdf } from './Pdf'
import {
	ebookPath,
	type ReaderControls,
	type ReaderItem,
	readerFile,
	readerItemSchema,
} from './types'

const progressSchema = z
	.object({ ebookLocation: z.union([z.string(), z.number()]).nullish() })
	.passthrough()
export type ReaderProps = {
	item: ReaderItem
	onClose: () => void
	fileId?: string
	keepProgress?: boolean
}
function readerUrl(path: string) {
	const base = (window.__ABS_WEB_CONFIG__?.apiBasePath || '').replace(/\/$/, '')
	const url = new URL(`${base}${path}`, window.location.origin)
	if (url.origin !== window.location.origin)
		throw new Error('Reader requires a same-origin API')
	return url
}
export function Reader({
	item: input,
	onClose,
	fileId,
	keepProgress = !fileId,
}: ReaderProps) {
	const dialog = useRef<HTMLDialogElement>(null)
	const controlsRef = useRef<ReaderControls | null>(null)
	const [loaded, setLoaded] = useState<{
		data: ArrayBuffer
		location: string | number | null
	} | null>(null)
	const [error, setError] = useState('')
	const [attempt, setAttempt] = useState(0)
	const [fullscreen, setFullscreen] = useState(false)
	const item = readerItemSchema.safeParse(input)
	const id = item.success ? item.data.id : ''
	let format = '',
		fileError = ''
	try {
		if (!item.success) throw new Error('Invalid ebook item')
		format = readerFile(item.data, fileId).format
	} catch (cause) {
		fileError = cause instanceof Error ? cause.message : 'Invalid ebook file'
	}
	const onError = useCallback(
		(cause: unknown) =>
			setError(cause instanceof Error ? cause.message : 'Reader failed'),
		[],
	)
	const pendingSave = useRef(Promise.resolve())
	const session = useRef({
		generation: getAuthGeneration(),
		userId: useAuth.getState().user?.id,
	})
	const writeAbort = useRef(new AbortController())
	const sessionCurrent = useCallback(
		() =>
			!writeAbort.current.signal.aborted &&
			session.current.generation === getAuthGeneration() &&
			session.current.userId === useAuth.getState().user?.id,
		[],
	)
	const close = useCallback(() => {
		// Closing cancels unsent writes and aborts in-flight requests; already accepted writes remain saved.
		writeAbort.current.abort()
		onClose()
	}, [onClose])
	useEffect(() => {
		writeAbort.current = new AbortController()
		return () => writeAbort.current.abort()
	}, [])
	const onLocation = useCallback(
		(location: string | number, progress?: number) => {
			if (!keepProgress) return
			try {
				readerUrl(ebookPath(id, fileId))
			} catch (cause) {
				onError(cause)
				return
			}
			const payload = {
				ebookLocation: location,
				...(progress !== undefined && Number.isFinite(progress)
					? { ebookProgress: Math.max(0, Math.min(1, progress)) }
					: {}),
			}
			pendingSave.current = pendingSave.current
				.then(async () => {
					if (!sessionCurrent()) return
					await api(`/me/progress/${encodeURIComponent(id)}`, z.unknown(), {
						method: 'PATCH',
						signal: writeAbort.current.signal,
						body: JSON.stringify(payload),
					})
				})
				.catch((cause: unknown) => {
					if (sessionCurrent()) onError(cause)
				})
		},
		[id, fileId, keepProgress, onError, sessionCurrent],
	)
	useEffect(() => {
		dialog.current?.showModal()
		const previous = document.body.style.overflow
		document.body.style.overflow = 'hidden'
		return () => {
			document.body.style.overflow = previous
		}
	}, [])
	// Retry counter deliberately reruns binary loading after transport/engine errors.
	// biome-ignore lint/correctness/useExhaustiveDependencies: attempt is explicit retry trigger.
	useEffect(() => {
		if (!id || fileError) return
		const abort = new AbortController()
		setLoaded(null)
		setError('')
		void (async () => {
			readerUrl(ebookPath(id, fileId))
			if (!sessionCurrent()) return
			let location: string | number | null = null
			if (keepProgress) {
				try {
					location =
						(
							await api(
								`/me/progress/${encodeURIComponent(id)}`,
								progressSchema,
								{ signal: abort.signal },
							)
						).ebookLocation ?? null
				} catch (cause) {
					if (!(cause instanceof ApiError && cause.status === 404)) throw cause
				}
			}
			if (!sessionCurrent()) return
			const data = await apiBinary(ebookPath(id, fileId), {
				signal: abort.signal,
				redirect: 'error',
			})
			if (!abort.signal.aborted) setLoaded({ data, location })
		})().catch((cause: unknown) => {
			if (!abort.signal.aborted) onError(cause)
		})
		return () => abort.abort()
	}, [id, fileId, keepProgress, attempt, fileError, onError, sessionCurrent])
	useEffect(() => {
		const changed = () =>
			setFullscreen(document.fullscreenElement === dialog.current)
		document.addEventListener('fullscreenchange', changed)
		return () => document.removeEventListener('fullscreenchange', changed)
	}, [])
	const touch = useRef<{ x: number; y: number; at: number } | null>(null)
	const Engine =
		format === 'epub'
			? Epub
			: format === 'pdf'
				? Pdf
				: ['mobi', 'azw3'].includes(format)
					? Mobi
					: ['cbz', 'cbr'].includes(format)
						? Comic
						: null
	return (
		<dialog
			ref={dialog}
			aria-label="Ebook reader"
			className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none bg-background p-0 text-foreground backdrop:bg-black/80"
			onCancel={(event) => {
				event.preventDefault()
				close()
			}}
			onKeyDown={(event) => {
				if (
					event.target instanceof HTMLInputElement ||
					event.target instanceof HTMLSelectElement ||
					event.target instanceof HTMLTextAreaElement
				)
					return
				if (event.key === 'ArrowRight') {
					event.preventDefault()
					controlsRef.current?.next()
				}
				if (event.key === 'ArrowLeft') {
					event.preventDefault()
					controlsRef.current?.prev()
				}
			}}
		>
			<div className="flex h-full min-h-0 flex-col">
				<header className="flex flex-wrap items-center gap-3 border-b p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
					<div className="min-w-0 flex-1">
						<h1 className="truncate font-semibold">
							{item.success
								? item.data.media.metadata?.title || 'Ebook'
								: 'Ebook'}
						</h1>
						{item.success && (
							<p className="truncate text-sm opacity-70">
								{item.data.media.metadata?.authorName}
							</p>
						)}
					</div>
					{document.fullscreenEnabled && (
						<button
							type="button"
							onClick={() => {
								void (
									document.fullscreenElement
										? document.exitFullscreen()
										: dialog.current?.requestFullscreen()
								)?.catch(onError)
							}}
						>
							{fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
						</button>
					)}
					<button type="button" onClick={close}>
						Close reader
					</button>
				</header>
				{(error || fileError) && (
					<div
						role="alert"
						className="flex flex-wrap items-center gap-4 border-b bg-destructive/10 p-3"
					>
						<p>{error || fileError}</p>
						{!fileError && (
							<button type="button" onClick={() => setAttempt(attempt + 1)}>
								Retry loading ebook
							</button>
						)}
					</div>
				)}
				<div
					className="min-h-0 flex-1"
					onTouchStart={(event) => {
						const start = event.touches[0]
						if (start)
							touch.current = {
								x: start.screenX,
								y: start.screenY,
								at: Date.now(),
							}
					}}
					onTouchEnd={(event) => {
						const start = touch.current,
							end = event.changedTouches[0]
						touch.current = null
						if (!start || !end) return
						const distance = end.screenX - start.x
						if (
							Date.now() - start.at < 1000 &&
							Math.abs(distance) >= 60 &&
							Math.abs(distance) > Math.abs(end.screenY - start.y)
						)
							distance < 0
								? controlsRef.current?.next()
								: controlsRef.current?.prev()
					}}
				>
					{!Engine ? (
						<p className="p-6">
							Unsupported ebook format: {format || 'unknown'}
						</p>
					) : loaded ? (
						<Engine
							data={loaded.data}
							initialLocation={loaded.location}
							onLocation={onLocation}
							onError={onError}
							controlsRef={controlsRef}
						/>
					) : (
						!error && (
							<p role="status" className="p-6">
								Loading ebook…
							</p>
						)
					)}
				</div>
				{Engine !== Mobi && (
					<footer className="flex justify-between border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
						<button
							type="button"
							disabled={!loaded}
							onClick={() => controlsRef.current?.prev()}
						>
							Previous page
						</button>
						<button
							type="button"
							disabled={!loaded}
							onClick={() => controlsRef.current?.next()}
						>
							Next page
						</button>
					</footer>
				)}
			</div>
		</dialog>
	)
}
