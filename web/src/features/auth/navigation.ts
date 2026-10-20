import type { AuthUser } from '../../api'

export function loginDestination(
	user: AuthUser,
	library: string | null | undefined,
) {
	const fallback = library
		? `/library/${encodeURIComponent(library)}`
		: library === null
			? user.type === 'root'
				? '/config/libraries'
				: '/oops?message=No%20libraries%20available'
			: '/'
	const saved = sessionStorage.getItem('abs:login:return')
	sessionStorage.removeItem('abs:login:return')
	const target = safeReturnPath(
		new URLSearchParams(location.search).get('redirect') || saved,
		fallback,
	)
	return target.startsWith('/config/') &&
		target !== '/config/stats' &&
		!['root', 'admin'].includes(String(user.type))
		? fallback
		: target
}
export function safeReturnPath(value: unknown, fallback = '/') {
	if (
		typeof value !== 'string' ||
		!value.startsWith('/') ||
		value.startsWith('//') ||
		value.includes('\\') ||
		[...value].some((character) => character.charCodeAt(0) < 32)
	)
		return fallback
	const url = new URL(value, window.location.origin)
	return url.origin === window.location.origin
		? `${url.pathname}${url.search}${url.hash}`
		: fallback
}
