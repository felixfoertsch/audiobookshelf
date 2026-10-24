import { useEffect, useState } from 'react'
import defaultCss from './legacy/basic.js'
import HtmlParser from './legacy/htmlParser.js'
import MobiParser from './legacy/mobi.js'
import type { EngineProps } from './types'

const blocked = new Set([
	'SCRIPT',
	'IFRAME',
	'OBJECT',
	'EMBED',
	'FORM',
	'BASE',
	'LINK',
	'META',
])

export function Mobi({ data, onError, controlsRef }: EngineProps) {
	const [srcDoc, setSrcDoc] = useState('')
	useEffect(() => {
		let active = true
		const urls: string[] = []
		void (async () => {
			try {
				const mobi = new MobiParser(data.slice(0))
				const rendered = await mobi.render()
				const anchored = new HtmlParser(
					new DOMParser().parseFromString(rendered.outerHTML, 'text/html'),
				).getAnchoredDoc()
				const doc = document.implementation.createHTMLDocument('')
				for (const node of Array.from(anchored.body.childNodes))
					doc.body.append(doc.importNode(node, true))
				for (const element of Array.from(doc.querySelectorAll('*'))) {
					if (blocked.has(element.tagName)) {
						element.remove()
						continue
					}
					for (const attr of Array.from(element.attributes)) {
						if (
							/^on/i.test(attr.name) ||
							attr.name === 'srcdoc' ||
							attr.name === 'srcset' ||
							attr.name === 'style'
						)
							element.removeAttribute(attr.name)
						else if (
							['href', 'xlink:href', 'src', 'action', 'formaction'].includes(
								attr.name.toLowerCase(),
							) &&
							!/^data:image\//i.test(attr.value) &&
							!(attr.name === 'href' && attr.value.startsWith('#'))
						)
							element.removeAttribute(attr.name)
					}
					if (
						element instanceof HTMLImageElement &&
						/^data:image\//i.test(element.getAttribute('src') ?? '')
					) {
						const response = await fetch(element.src)
						const image = await response.blob()
						if (!active) return
						const url = URL.createObjectURL(image)
						urls.push(url)
						element.src = url
					}
				}
				const css = defaultCss.replace(/<\/style/gi, '<\\/style')
				const source = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src blob: data:; style-src 'unsafe-inline'; font-src blob: data:; connect-src 'none'; form-action 'none'; base-uri 'none'"><style>${css}</style>${doc.body.innerHTML}`
				if (active) setSrcDoc(source)
			} catch (error) {
				if (active) onError(error)
			}
		})()
		return () => {
			active = false
			urls.forEach(URL.revokeObjectURL)
		}
	}, [data, onError])
	controlsRef.current = { next: () => {}, prev: () => {} }
	return (
		<iframe
			title="MOBI book"
			className="mx-auto block h-full w-full max-w-4xl border bg-white shadow"
			sandbox="allow-same-origin"
			srcDoc={srcDoc}
		/>
	)
}
