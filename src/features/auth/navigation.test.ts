import { describe, expect, it } from 'vitest'
import { loginDestination, safeReturnPath } from './navigation'

describe('safe native return paths', () => {
	it('restores safe OIDC return once and rejects external saved destinations', () => {
		history.replaceState(null, '', '/login')
		const user = {
			id: 'u',
			username: 'reader',
			accessToken: 'token',
			type: 'user',
		}
		sessionStorage.setItem('abs:login:return', '/item/book')
		expect(loginDestination(user, 'library')).toBe('/item/book')
		expect(sessionStorage.getItem('abs:login:return')).toBeNull()
		sessionStorage.setItem('abs:login:return', '//evil.example')
		expect(loginDestination(user, 'library')).toBe('/library/library')
	})
	it('rejects external, protocol-relative, backslash, and control-character paths', () => {
		for (const value of [
			'https://evil.example',
			'//evil.example',
			'/\\evil.example',
			'/\nevil',
			null,
		])
			expect(safeReturnPath(value)).toBe('/')
		expect(safeReturnPath('/library/a?filter=all#top')).toBe(
			'/library/a?filter=all#top',
		)
	})
})
