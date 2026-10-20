import { useSyncExternalStore } from 'react'
import english from '../../../../client/strings/en-us.json'

const loaders = import.meta.glob<Record<string, string>>(
	'../../../../client/strings/*.json',
	{ import: 'default' },
)
let language = 'en-us'
let strings: Record<string, string> = english
let serverLanguage = 'en-us'
let revision = 0
const listeners = new Set<() => void>()
const emit = () => {
	for (const listener of listeners) listener()
}
export async function setLanguage(code: string, local = true) {
	const normalized = code.toLowerCase()
	const key = `../../../../client/strings/${normalized}.json`
	const selected = normalized === 'en-us' || loaders[key] ? normalized : 'en-us'
	const current = ++revision
	let loaded: Record<string, string> = english
	if (selected !== 'en-us') {
		try {
			loaded = await loaders[key]()
		} catch (cause) {
			throw new Error('Language could not be loaded. Retry.', { cause })
		}
	}
	if (current !== revision) return
	if (local) localStorage.setItem('lang', selected)
	language = selected
	strings = { ...english, ...loaded }
	document.documentElement.lang = selected
	emit()
	window.dispatchEvent(new CustomEvent('abs:language', { detail: selected }))
}
export async function setServerLanguage(code: unknown) {
	serverLanguage = typeof code === 'string' ? code : 'en-us'
	await setLanguage(localStorage.getItem('lang') || serverLanguage, false)
}
export function translate(
	key: keyof typeof english | string,
	substitutions: Array<string | number> | Record<string, string | number> = [],
	fallback?: string,
) {
	const value =
		strings[key] || english[key as keyof typeof english] || fallback || key
	return value.replace(/\{([^{}]*)\}/g, (match, index: string) =>
		String((substitutions as Record<string, string | number>)[index] ?? match),
	)
}
export function useT() {
	useSyncExternalStore(
		(listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		() => language,
	)
	return translate
}
export const getLanguage = () => language
