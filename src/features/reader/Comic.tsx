import archiveWasm from 'libarchive.js/dist/wasm-gen/libarchive.wasm?url'
import archiveWorker from 'libarchive.js/dist/worker-bundle.js?raw'
import { Archive } from 'libarchive.js/main.js'
import { CompressedFile } from 'libarchive.js/src/compressed-file'
import { useEffect, useRef, useState } from 'react'
import { type EngineProps, pageProgress, savedPage } from './types'

const imageExtensions = new Set(['.jpeg', '.jpg', '.png', '.webp', '.gif'])
const ext = (name: string) =>
	name
		.slice(name.lastIndexOf('/') + 1)
		.match(/\.[^.]+$/)?.[0]
		?.toLowerCase() ?? ''
const basename = (name: string) =>
	name.slice(name.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '')
const order = (name: string) =>
	Number(basename(name).match(/\d+/g)?.at(-1) ?? -1)

export function Comic({
	data,
	initialLocation,
	onLocation,
	onError,
	controlsRef,
}: EngineProps) {
	const [pages, setPages] = useState<string[]>([])
	const [image, setImage] = useState<{ page: number; url: string } | null>(null)
	const [files, setFiles] = useState<Record<string, CompressedFile> | null>(
		null,
	)
	const extraction = useRef(Promise.resolve())
	const [metadata, setMetadata] = useState<Record<string, unknown> | null>(null)
	const [page, setPage] = useState(1)
	const [zoom, setZoom] = useState(80)
	const [menu, setMenu] = useState(false)
	const menuArea = useRef<HTMLDivElement>(null)
	useEffect(() => {
		if (!menu) return
		const dismiss = (event: PointerEvent) => {
			if (
				event.target instanceof Node &&
				!menuArea.current?.contains(event.target)
			)
				setMenu(false)
		}
		document.addEventListener('pointerdown', dismiss)
		return () => document.removeEventListener('pointerdown', dismiss)
	}, [menu])
	useEffect(() => {
		let active = true
		let archive: Awaited<ReturnType<typeof Archive.open>> | undefined
		const objectUrls: string[] = []
		void (async () => {
			try {
				// Pinned 1.3.0 worker resolves WASM relative to its source; blob workers need explicit asset URL.
				const worker = archiveWorker.replace(
					/`wasm-gen\/\$\{e\}`/,
					JSON.stringify(new URL(archiveWasm, window.location.href).href),
				)
				const workerUrl = URL.createObjectURL(
					new Blob([worker], { type: 'application/javascript' }),
				)
				objectUrls.push(workerUrl)
				Archive.init({ workerUrl })
				archive = await Archive.open(new Blob([data]))
				if (!active) {
					archive._worker.terminate()
					return
				}
				const files = await archive.getFilesObject()
				const flat: Record<string, CompressedFile> = {}
				const walk = (node: Record<string, unknown>, prefix = '') => {
					for (const [key, value] of Object.entries(node)) {
						if (key.startsWith('_')) continue
						const path = prefix ? `${prefix}/${key}` : key
						if (value instanceof CompressedFile) flat[path] = value
						else if (
							value &&
							typeof value === 'object' &&
							!Array.isArray(value)
						)
							walk(value as Record<string, unknown>, path)
					}
				}
				walk(files as Record<string, unknown>)
				const names = Object.keys(flat)
					.filter((name) => imageExtensions.has(ext(name)))
					.sort((a, b) => {
						const diff =
							(order(a) < 0 ? Infinity : order(a)) -
							(order(b) < 0 ? Infinity : order(b))
						return (
							diff ||
							(order(a) < 0
								? 0
								: a.localeCompare(b, undefined, { numeric: true }))
						)
					})
				if (!active) return
				const xml = Object.keys(flat).find((name) => ext(name) === '.xml')
				if (xml && flat[xml].size <= 1024 * 1024) {
					const text = await (await flat[xml].extract()).text()
					const parsed = new DOMParser().parseFromString(
						text,
						'application/xml',
					)
					if (active && !parsed.querySelector('parsererror')) {
						const result: Record<string, unknown> = {}
						for (const child of Array.from(parsed.documentElement.children))
							result[child.tagName] = child.textContent?.trim()
						setMetadata(result)
					}
				}
				if (!active) return
				if (!names.length) throw new Error('Unable to extract pages')
				setPages(names)
				setFiles(flat)
				const start = savedPage(initialLocation, names.length)
				setPage(start)
				if (names.length) onLocation(start, pageProgress(start, names.length))
			} catch (error) {
				archive?._worker.terminate()
				if (active) onError(error)
			}
		})()
		return () => {
			active = false
			archive?._worker.terminate()
			for (const url of objectUrls) URL.revokeObjectURL(url)
		}
	}, [data, initialLocation, onError, onLocation])
	useEffect(() => {
		const selected = files?.[pages[page - 1]]
		if (!selected) return
		let active = true
		let url: string | undefined
		// Serialize archive requests; obsolete selections never start extraction.
		extraction.current = extraction.current
			.then(async () => {
				if (!active) return
				const file = await selected.extract()
				if (!active) return
				url = URL.createObjectURL(file)
				setImage({ page, url })
			})
			.catch((error: unknown) => {
				if (active) onError(error)
			})
		return () => {
			active = false
			if (url) URL.revokeObjectURL(url)
		}
	}, [files, pages, page, onError])
	function go(next: number) {
		if (!Number.isInteger(next) || next < 1 || next > pages.length) return
		setPage(next)
		setMenu(false)
		onLocation(next, pageProgress(next, pages.length))
	}
	controlsRef.current = { next: () => go(page + 1), prev: () => go(page - 1) }
	return (
		<div className="relative flex h-full min-h-0 flex-col">
			<nav className="flex flex-wrap items-center gap-2 border-b p-2">
				<button
					type="button"
					disabled={!pages.length}
					onClick={() => setMenu(!menu)}
				>
					Pages
				</button>
				<span>{pages.length ? `${page} / ${pages.length}` : 'Loading…'}</span>
				<button
					type="button"
					disabled={zoom <= 10}
					onClick={() => setZoom(Math.max(10, zoom - 10))}
				>
					Zoom −
				</button>
				<output>{zoom}%</output>
				<button
					type="button"
					disabled={zoom >= 400}
					onClick={() => setZoom(Math.min(400, zoom + 10))}
				>
					Zoom +
				</button>
				{image?.page === page && (
					<a
						href={image?.page === page ? image.url : undefined}
						download={pages[page - 1]}
					>
						Download image
					</a>
				)}
			</nav>
			{menu && (
				<div
					ref={menuArea}
					className="absolute left-2 top-12 z-10 max-h-[80%] w-72 overflow-auto border bg-background shadow"
				>
					{pages.map((name, index) => (
						<button
							className="block w-full truncate p-2 text-left"
							type="button"
							key={name}
							onClick={() => go(index + 1)}
						>
							{index + 1}. {name}
						</button>
					))}
				</div>
			)}
			{metadata && (
				<details className="max-h-28 overflow-auto border-b p-2">
					<summary>Comic metadata</summary>
					{Object.entries(metadata).map(([key, value]) => (
						<div key={key}>
							<strong>{key}</strong>: {String(value)}
						</div>
					))}
				</details>
			)}
			<div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
				<img
					className="max-w-none object-contain"
					style={{ width: `${zoom}%` }}
					src={image?.page === page ? image.url : undefined}
					alt={pages[page - 1] ?? 'Comic page'}
				/>
			</div>
		</div>
	)
}
