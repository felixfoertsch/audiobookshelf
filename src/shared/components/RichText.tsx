import { createElement, type ReactNode } from 'react'
import { cn } from '../lib/utils'

const allowed = new Set([
	'p',
	'br',
	'ul',
	'ol',
	'li',
	'strong',
	'b',
	'em',
	'i',
	'u',
	's',
	'blockquote',
	'pre',
	'code',
	'a',
	'h2',
	'h3',
	'h4',
	'hr',
	'div',
	'span',
])
const discarded = new Set([
	'script',
	'style',
	'iframe',
	'object',
	'embed',
	'svg',
	'math',
	'template',
])
function safeHref(value: string | null) {
	if (!value) return undefined
	try {
		const url = new URL(value, window.location.href)
		return ['https:', 'http:', 'mailto:'].includes(url.protocol)
			? value
			: undefined
	} catch {
		return undefined
	}
}
function recreate(node: Node, key: number): ReactNode {
	if (node.nodeType === Node.TEXT_NODE) return node.textContent
	if (!(node instanceof HTMLElement)) return null
	const tag = node.localName
	if (discarded.has(tag)) return null
	const children = Array.from(node.childNodes, recreate)
	if (!allowed.has(tag)) return children
	return createElement(
		tag,
		{
			key,
			...(tag === 'a'
				? { href: safeHref(node.getAttribute('href')), rel: 'noreferrer' }
				: {}),
		},
		...children,
	)
}

export function RichText({
	text,
	className,
}: {
	text: string
	className?: string
}) {
	// Template contents stay inert: parsing never loads images/embeds or runs scripts.
	// Only recreated semantic elements reach the live document; no input attributes survive.
	const template = document.createElement('template')
	template.innerHTML = text
	return (
		<div
			className={cn(
				'min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere] [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline [&_pre]:whitespace-pre-wrap [&_blockquote]:border-l-2 [&_blockquote]:pl-3',
				className,
			)}
		>
			{Array.from(template.content.childNodes, recreate)}
		</div>
	)
}
