import {
	GlobalWorkerOptions,
	getDocument,
	type PDFDocumentProxy,
	TextLayer,
} from 'pdfjs-dist'
import 'pdfjs-dist/web/pdf_viewer.css'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useEffect, useRef, useState } from 'react'
import { type EngineProps, pageProgress, savedPage } from './types'

GlobalWorkerOptions.workerSrc = workerUrl
export function Pdf({
	data,
	initialLocation,
	onLocation,
	onError,
	controlsRef,
}: EngineProps) {
	const canvas = useRef<HTMLCanvasElement>(null)
	const textContainer = useRef<HTMLDivElement>(null)
	const container = useRef<HTMLDivElement>(null)
	const [document, setDocument] = useState<PDFDocumentProxy | null>(null)
	const [page, setPage] = useState(1)
	const [scale, setScale] = useState(1)
	const [width, setWidth] = useState(600)
	const [links, setLinks] = useState<
		{
			id: string
			page: number
			left: number
			top: number
			width: number
			height: number
		}[]
	>([])
	useEffect(() => {
		let active = true
		const task = getDocument({ data: data.slice(0) })
		void task.promise
			.then((pdf) => {
				if (!active) return
				setPage(savedPage(initialLocation, pdf.numPages))
				setDocument(pdf)
			})
			.catch(onError)
		return () => {
			active = false
			void task.destroy()
		}
	}, [data, initialLocation, onError])
	useEffect(() => {
		if (!container.current) return
		const observer = new ResizeObserver(([entry]) => {
			if (entry) setWidth(entry.contentRect.width)
		})
		observer.observe(container.current)
		return () => observer.disconnect()
	}, [])
	useEffect(() => {
		if (!document || !canvas.current) return
		let active = true
		let textLayer: TextLayer | undefined
		let renderTask:
			| ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']>
			| undefined
		void document
			.getPage(page)
			.then((pdfPage) => {
				if (!active || !canvas.current) return
				const natural = pdfPage.getViewport({ scale: 1 })
				const viewport = pdfPage.getViewport({
					scale:
						Math.min(
							width / natural.width,
							(window.innerHeight - 180) / natural.height,
						) * scale,
				})
				if (textContainer.current) {
					textContainer.current.replaceChildren()
					textLayer = new TextLayer({
						textContentSource: pdfPage.streamTextContent(),
						container: textContainer.current,
						viewport,
					})
					void textLayer.render().catch((error: unknown) => {
						if (active) onError(error)
					})
				}
				const target = canvas.current
				const ratio = window.devicePixelRatio || 1
				target.width = viewport.width * ratio
				target.height = viewport.height * ratio
				target.style.width = `${viewport.width}px`
				target.style.height = `${viewport.height}px`
				renderTask = pdfPage.render({
					canvas: target,
					viewport,
					transform: [ratio, 0, 0, ratio, 0, 0],
				})
				void pdfPage
					.getAnnotations()
					.then(async (annotations) => {
						const internal = []
						for (const annotation of annotations) {
							if (!annotation.dest || !Array.isArray(annotation.rect)) continue
							const destination =
								typeof annotation.dest === 'string'
									? await document.getDestination(annotation.dest)
									: annotation.dest
							if (!Array.isArray(destination) || !destination[0]) continue
							const targetPage =
								typeof destination[0] === 'number'
									? destination[0]
									: await document.getPageIndex(destination[0])
							const first = viewport.convertToViewportPoint(
								annotation.rect[0],
								annotation.rect[1],
							)
							const last = viewport.convertToViewportPoint(
								annotation.rect[2],
								annotation.rect[3],
							)
							const rect = [...first, ...last]
							internal.push({
								id: String(annotation.id),
								page: targetPage + 1,
								left: Math.min(rect[0], rect[2]),
								top: Math.min(rect[1], rect[3]),
								width: Math.abs(rect[2] - rect[0]),
								height: Math.abs(rect[3] - rect[1]),
							})
						}
						if (active) setLinks(internal)
					})
					.catch((error: unknown) => {
						if (active) onError(error)
					})
				return renderTask.promise
			})
			.catch((error: unknown) => {
				if (active) onError(error)
			})
		return () => {
			active = false
			renderTask?.cancel()
			textLayer?.cancel()
		}
	}, [document, page, scale, width, onError])
	function go(next: number) {
		if (
			!document ||
			!Number.isSafeInteger(next) ||
			next < 1 ||
			next > document.numPages
		)
			return
		setPage(next)
		onLocation(next, pageProgress(next, document.numPages))
	}
	controlsRef.current = { next: () => go(page + 1), prev: () => go(page - 1) }
	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex items-center justify-center gap-3 p-2">
				<button
					type="button"
					disabled={scale <= 1}
					onClick={() => setScale(Math.max(1, scale - 0.1))}
				>
					Zoom out
				</button>
				<output aria-label="Zoom">{Math.round(scale * 100)}%</output>
				<button
					type="button"
					disabled={scale >= 4}
					onClick={() => setScale(Math.min(4, scale + 0.1))}
				>
					Zoom in
				</button>
				<label>
					Page{' '}
					<input
						aria-label="PDF page"
						className="w-16 rounded border p-1"
						type="number"
						min={1}
						max={document?.numPages || 1}
						value={page}
						onChange={(event) => go(Number(event.target.value))}
					/>
				</label>
				<span>/ {document?.numPages || '…'}</span>
			</div>
			<div ref={container} className="min-h-0 flex-1 overflow-auto">
				<div className="relative mx-auto w-fit">
					<canvas
						ref={canvas}
						className="bg-white"
						aria-label={`PDF page ${page}`}
					/>
					<div ref={textContainer} className="textLayer" />
					{links.map((link) => (
						<button
							key={link.id}
							type="button"
							aria-label={`Go to PDF page ${link.page}`}
							className="absolute focus:ring-2 focus:ring-primary"
							style={{
								left: link.left,
								top: link.top,
								width: link.width,
								height: link.height,
							}}
							onClick={() => go(link.page)}
						/>
					))}
				</div>
			</div>
		</div>
	)
}
