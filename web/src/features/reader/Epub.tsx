import ePub, { type Book, EpubCFI, type Rendition } from 'epubjs'
import type { Location } from 'epubjs/types/rendition'
import type Section from 'epubjs/types/section'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import type { EngineProps } from './types'

const settingsSchema = z.object({
	theme: z.enum(['dark', 'light', 'sepia']).default('dark'),
	font: z.enum(['serif', 'sans-serif']).default('serif'),
	fontScale: z.number().min(5).max(300).default(100),
	lineSpacing: z.number().min(100).max(300).default(115),
	textStroke: z.number().min(0).max(300).default(0),
	spread: z.enum(['none', 'auto']).default('auto'),
})
type Settings = z.infer<typeof settingsSchema>
type Chapter = { id: string; href: string; label: string; subitems?: Chapter[] }
const resultSchema = z.array(z.object({ cfi: z.string(), excerpt: z.string() }))
function loadSettings() {
	try {
		return settingsSchema.parse(
			JSON.parse(localStorage.getItem('ereaderSettings') || '{}'),
		)
	} catch {
		return settingsSchema.parse({})
	}
}
function theme(rendition: Rendition, settings: Settings) {
	const color =
		settings.theme === 'dark'
			? '#ffffff'
			: settings.theme === 'sepia'
				? '#5b4636'
				: '#000000'
	const background =
		settings.theme === 'dark'
			? '#232323'
			: settings.theme === 'sepia'
				? '#f4ecd8'
				: '#ffffff'
	rendition.themes.default({
		body: {
			color: `${color} !important`,
			background: `${background} !important`,
		},
		'*': {
			color: `${color} !important`,
			'line-height': `${((settings.lineSpacing / 100) * settings.fontScale) / 100}rem !important`,
			'-webkit-text-stroke': `${settings.textStroke / 100}px ${color} !important`,
		},
	})
	rendition.themes.fontSize(`${settings.fontScale}%`)
	rendition.themes.font(settings.font)
	rendition.spread(settings.spread)
}
export function Epub({
	data,
	initialLocation,
	onLocation,
	onError,
	controlsRef,
}: EngineProps) {
	const viewer = useRef<HTMLDivElement>(null)
	const book = useRef<Book | null>(null)
	const rendition = useRef<Rendition | null>(null)
	const [chapters, setChapters] = useState<Chapter[]>([])
	const [toc, setToc] = useState(false)
	const [showSettings, setShowSettings] = useState(false)
	const [settings, setSettings] = useState(loadSettings)
	const settingsRef = useRef(settings)
	settingsRef.current = settings
	const [query, setQuery] = useState('')
	const [results, setResults] = useState<
		{ cfi: string; excerpt: string; chapter: string }[] | null
	>(null)
	const [searching, setSearching] = useState(false)
	const [progress, setProgress] = useState(0)
	const swipe = useRef<{ x: number; y: number; time: number } | null>(null)
	useEffect(() => {
		if (!viewer.current) return
		let active = true
		let displayed = false
		const currentBook = ePub(data.slice(0), { openAs: 'binary' })
		book.current = currentBook
		// Book documents are untrusted. EPUB.js keeps scripts disabled in its iframe sandbox.
		currentBook.spine.hooks.content.register((document: Document) => {
			for (const element of document.querySelectorAll(
				'script, iframe, object, embed, form, base',
			))
				element.remove()
			for (const element of document.querySelectorAll('*'))
				for (const attr of Array.from(element.attributes)) {
					if (
						/^on/i.test(attr.name) ||
						(['href', 'xlink:href', 'src'].includes(attr.name) &&
							/^(?:https?:|\/\/|javascript:)/i.test(attr.value))
					)
						element.removeAttribute(attr.name)
				}
			const policy = document.createElement('meta')
			policy.httpEquiv = 'Content-Security-Policy'
			policy.content =
				"default-src 'none'; img-src blob: data:; style-src 'unsafe-inline' blob:; font-src blob: data:"
			document.head.prepend(policy)
		})
		const current = currentBook.renderTo(viewer.current, {
			width: '100%',
			height: '100%',
			allowScriptedContent: false,
			flow: 'paginated',
			spread: settingsRef.current.spread,
			snap: true,
		})
		rendition.current = current
		const next = () => {
			void current.next().catch(onError)
		}
		const prev = () => {
			void current.prev().catch(onError)
		}
		controlsRef.current = { next, prev }
		current.on('relocated', (location: Location) => {
			if (!active) return
			setProgress(location.end.percentage || 0)
			onLocation(location.start.cfi, location.end.percentage || undefined)
		})
		current.on('rendered', () => {
			displayed = true
			theme(current, settingsRef.current)
		})
		current.on('keydown', (event: KeyboardEvent) => {
			const rtl =
				z
					.object({ direction: z.string().optional() })
					.parse(currentBook.packaging.metadata).direction === 'rtl'
			if (event.key === 'ArrowLeft') {
				event.preventDefault()
				rtl ? next() : prev()
			}
			if (event.key === 'ArrowRight') {
				event.preventDefault()
				rtl ? prev() : next()
			}
		})
		current.on('touchstart', (event: TouchEvent) => {
			const touch = event.touches[0]
			if (touch)
				swipe.current = { x: touch.screenX, y: touch.screenY, time: Date.now() }
		})
		current.on('touchend', (event: TouchEvent) => {
			const start = swipe.current,
				end = event.changedTouches[0]
			if (!start || !end) return
			const distance = end.screenX - start.x
			if (
				Date.now() - start.time < 1000 &&
				Math.abs(distance) >= 60 &&
				Math.abs(distance) > Math.abs(end.screenY - start.y)
			)
				distance < 0 ? next() : prev()
			swipe.current = null
		})
		void currentBook.ready
			.then(async () => {
				if (!active) return
				setChapters(currentBook.navigation.toc)
				await currentBook.locations.generate(1600)
				if (!active) return
				await current.display(
					typeof initialLocation === 'string' &&
						initialLocation.startsWith('epubcfi(')
						? initialLocation
						: undefined,
				)
			})
			.catch(onError)
		const observer = new ResizeObserver(([entry]) => {
			if (entry && active && displayed)
				current.resize(entry.contentRect.width, entry.contentRect.height)
		})
		observer.observe(viewer.current)
		return () => {
			active = false
			observer.disconnect()
			controlsRef.current = null
			currentBook.destroy()
			book.current = null
			rendition.current = null
		}
	}, [data, initialLocation, onLocation, onError, controlsRef])
	useEffect(() => {
		if (rendition.current) theme(rendition.current, settings)
		try {
			localStorage.setItem('ereaderSettings', JSON.stringify(settings))
		} catch (error) {
			onError(error)
		}
	}, [settings, onError])
	async function search() {
		if (!book.current || query.length < 2) {
			setResults(null)
			return
		}
		setSearching(true)
		try {
			const currentBook = book.current
			const sections: Section[] = []
			currentBook.spine.each((section: Section) => sections.push(section))
			const matches: { cfi: string; excerpt: string; chapter: string }[] = []
			const chapterPositions: { label: string; cfi: string }[] = []
			const flatten = (entries: Chapter[]) =>
				entries.flatMap((entry): Chapter[] => [
					entry,
					...flatten(entry.subitems || []),
				])
			const base = 'https://epub.invalid/'
			for (const chapter of flatten(chapters)) {
				const href = new URL(
					chapter.href,
					base +
						(currentBook.packaging.navPath ||
							currentBook.packaging.ncxPath ||
							''),
				).href.slice(base.length)
				const section = currentBook.spine.get(href)
				if (!section) continue
				await section.load(currentBook.load.bind(currentBook))
				const fragment = href.split('#')[1]
				const element = fragment
					? section.document.getElementById(fragment)
					: section.document.body
				if (element)
					chapterPositions.push({
						label: chapter.label.trim(),
						cfi: section.cfiFromElement(element),
					})
			}
			chapterPositions.sort((left, right) =>
				new EpubCFI().compare(left.cfi, right.cfi),
			)
			for (const section of sections) {
				await section.load(currentBook.load.bind(currentBook))
				try {
					matches.push(
						...resultSchema.parse(section.find(query)).map((result) => ({
							...result,
							chapter:
								chapterPositions
									.filter(
										(chapter) =>
											new EpubCFI().compare(chapter.cfi, result.cfi) <= 0,
									)
									.at(-1)?.label || section.href,
						})),
					)
				} finally {
					section.unload()
				}
			}
			setResults(matches)
		} catch (error) {
			onError(error)
		} finally {
			setSearching(false)
		}
	}
	function go(href: string) {
		setToc(false)
		void rendition.current?.display(href).catch(onError)
	}
	function chapterList(entries: Chapter[]) {
		return (
			<ul className="space-y-2 pl-3">
				{entries.map((chapter) => (
					<li key={chapter.id || chapter.href}>
						<button
							type="button"
							className="text-left underline"
							onClick={() => go(chapter.href)}
						>
							{chapter.label}
						</button>
						{chapter.subitems?.length ? chapterList(chapter.subitems) : null}
					</li>
				))}
			</ul>
		)
	}
	return (
		<div
			className={`relative flex h-full min-h-0 flex-col ${settings.theme === 'light' ? 'bg-white text-black' : settings.theme === 'sepia' ? 'bg-[#f4ecd8] text-[#5b4636]' : 'bg-[#232323] text-white'}`}
		>
			<div className="flex gap-4 p-2">
				<button type="button" onClick={() => setToc(!toc)}>
					Table of contents
				</button>
				<button type="button" onClick={() => setShowSettings(!showSettings)}>
					Reader settings
				</button>
				<output className="ml-auto">{Math.round(progress * 100)}%</output>
			</div>
			<div ref={viewer} className="min-h-0 flex-1" />
			{toc && (
				<aside
					aria-label="Table of contents"
					className="absolute inset-y-0 left-0 z-10 w-96 max-w-full overflow-auto border bg-background p-4 text-foreground shadow-xl"
				>
					<button type="button" onClick={() => setToc(false)}>
						Close table of contents
					</button>
					<form
						className="my-4 flex gap-2"
						onSubmit={(event) => {
							event.preventDefault()
							void search()
						}}
					>
						<input
							aria-label="Search ebook"
							className="min-w-0 rounded border p-2"
							value={query}
							onChange={(event) => {
								setQuery(event.target.value)
								if (!event.target.value) setResults(null)
							}}
						/>
						<button disabled={searching} type="submit">
							Search
						</button>
						<button
							type="button"
							onClick={() => {
								setQuery('')
								setResults(null)
							}}
						>
							Clear
						</button>
					</form>
					{searching ? (
						<p role="status">Searching…</p>
					) : results ? (
						results.length ? (
							<ul>
								{results.map((result) => (
									<li className="my-3" key={result.cfi}>
										<p className="text-sm opacity-70">{result.chapter}</p>
										<button
											type="button"
											className="text-left underline"
											onClick={() => go(result.cfi)}
										>
											{result.excerpt}
										</button>
									</li>
								))}
							</ul>
						) : (
							<p>No results</p>
						)
					) : (
						chapterList(chapters)
					)}
				</aside>
			)}
			{showSettings && (
				<section
					role="dialog"
					aria-modal="false"
					aria-label="Reader settings"
					className="absolute inset-x-4 top-12 z-20 mx-auto max-h-[75vh] max-w-lg overflow-auto rounded border bg-background p-6 text-foreground shadow-xl"
				>
					<button
						type="button"
						className="float-right"
						onClick={() => setShowSettings(false)}
					>
						Close settings
					</button>
					<h2 className="mb-4 text-xl">Reader settings</h2>
					<label className="mb-4 block">
						Theme{' '}
						<select
							aria-label="Theme"
							className="rounded border p-2"
							value={settings.theme}
							onChange={(event) =>
								setSettings({
									...settings,
									theme: settingsSchema.shape.theme.parse(event.target.value),
								})
							}
						>
							{['dark', 'light', 'sepia'].map((value) => (
								<option key={value}>{value}</option>
							))}
						</select>
					</label>
					<label className="mb-4 block">
						Font family{' '}
						<select
							className="rounded border p-2"
							value={settings.font}
							onChange={(event) =>
								setSettings({
									...settings,
									font: settingsSchema.shape.font.parse(event.target.value),
								})
							}
						>
							<option value="serif">Serif</option>
							<option value="sans-serif">Sans</option>
						</select>
					</label>
					{(['fontScale', 'lineSpacing', 'textStroke'] as const).map((key) => (
						<label key={key} className="mb-4 block">
							{
								{
									fontScale: 'Font scale',
									lineSpacing: 'Line spacing',
									textStroke: 'Font boldness',
								}[key]
							}
							: {settings[key]}
							<input
								className="block w-full"
								type="range"
								min={key === 'fontScale' ? 5 : key === 'lineSpacing' ? 100 : 0}
								max={300}
								step={5}
								value={settings[key]}
								onChange={(event) =>
									setSettings({
										...settings,
										[key]: Number(event.target.value),
									})
								}
							/>
						</label>
					))}
					<label>
						Layout{' '}
						<select
							className="rounded border p-2"
							value={settings.spread}
							onChange={(event) =>
								setSettings({
									...settings,
									spread: settingsSchema.shape.spread.parse(event.target.value),
								})
							}
						>
							<option value="none">Single page</option>
							<option value="auto">Split page</option>
						</select>
					</label>
				</section>
			)}
		</div>
	)
}
