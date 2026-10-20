import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
	api,
	apiBinary,
	getAuthGeneration,
	initializeAuth,
	login,
	logout,
	logoutRedirect,
	setAuthSocket,
	setBeforeLogout,
	useAuth,
} from './api'

const user = { id: 'u1', username: 'user', accessToken: 'new-token' }
const json = (value: unknown, status = 200) =>
	new Response(JSON.stringify(value), { status })
afterEach(() => {
	vi.restoreAllMocks()
	localStorage.clear()
	useAuth.getState().set(null)
	useAuth.setState({ startupError: '', serverStatus: null })
	setBeforeLogout(undefined)
	setAuthSocket(null)
	window.history.replaceState(null, '', '/')
})
describe('auth boundary', () => {
	it('preserves native auth discovery path and query instead of adding API prefix', async () => {
		const fetcher = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(json({ issuer: 'https://example.invalid' }))
		await api(
			'/auth/openid/config?issuer=https%3A%2F%2Fexample.invalid',
			z.unknown(),
		)
		expect(fetcher.mock.calls[0][0]).toBe(
			'/auth/openid/config?issuer=https%3A%2F%2Fexample.invalid',
		)
	})
	it('restores cookie-only sessions, strips both OIDC tokens before requests', async () => {
		window.history.replaceState(
			null,
			'',
			'/new/?accessToken=secret&setToken=legacy&state=private',
		)
		const mock = vi
			.spyOn(globalThis, 'fetch')
			.mockImplementation(async (input) => {
				expect(location.search).toBe('')
				return String(input).endsWith('/status')
					? json({ isInit: true })
					: json({ user })
			})
		await initializeAuth()
		expect(useAuth.getState().user?.id).toBe('u1')
		expect(
			mock.mock.calls.some((call) => String(call[0]).endsWith('/auth/refresh')),
		).toBe(true)
		localStorage.clear()
		await initializeAuth()
		expect(useAuth.getState().user?.id).toBe('u1')
	})
	it('treats startup 401 as signed out but preserves token for 503/malformed', async () => {
		for (const status of [401, 503]) {
			localStorage.setItem('token', 'existing')
			vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
				String(input).endsWith('/status')
					? json({ isInit: true })
					: json({}, status),
			)
			if (status === 401) {
				await initializeAuth()
				expect(localStorage.getItem('token')).toBeNull()
			} else {
				await expect(initializeAuth()).rejects.toThrow()
				expect(localStorage.getItem('token')).toBe('existing')
			}
		}
	})
	it('serializes concurrent refresh and retries authorized API calls', async () => {
		let refreshes = 0
		localStorage.setItem('token', 'old')
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
			if (String(input).endsWith('/auth/refresh')) {
				refreshes++
				await Promise.resolve()
				return json({ user })
			}
			return (init?.headers as Record<string, string> | undefined)
				?.authorization === 'Bearer new-token'
				? json({ ok: true })
				: json({}, 401)
		})
		await Promise.all([
			api('/api/test', z.object({ ok: z.boolean() })),
			api('/api/test', z.object({ ok: z.boolean() })),
		])
		expect(refreshes).toBe(1)
	})
	it('does not refresh rejected login, rejects malformed payload', async () => {
		const mock = vi
			.spyOn(globalThis, 'fetch')
			.mockImplementation(async () => json({}, 401))
		await expect(login('u', 'bad')).rejects.toThrow()
		expect(mock).toHaveBeenCalledTimes(1)
		mock.mockImplementation(async () => json(null))
		await expect(
			api('/api/test', z.object({ ok: z.boolean() })),
		).rejects.toThrow()
	})
	it('flushes player before logout, keeps token if revocation fails', async () => {
		localStorage.setItem('token', 'existing')
		const events: string[] = []
		setBeforeLogout(async () => {
			events.push('close')
			expect(localStorage.getItem('token')).toBe('existing')
		})
		const mock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
			events.push('logout')
			return json({}, 500)
		})
		await expect(logout()).rejects.toThrow()
		expect(events).toEqual(['close', 'logout'])
		expect(localStorage.getItem('token')).toBe('existing')
		mock.mockImplementation(async () => json({ redirect_url: null }))
		await logout()
		expect(localStorage.getItem('token')).toBeNull()
	})
	it('allows logout own refresh retry without deadlock', async () => {
		localStorage.setItem('token', 'old')
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
			if (String(input).endsWith('/auth/refresh')) return json({ user })
			return (init?.headers as Record<string, string>)?.authorization ===
				'Bearer new-token'
				? json({ redirect_url: null })
				: json({}, 401)
		})
		await logout()
		expect(localStorage.getItem('token')).toBeNull()
		expect(useAuth.getState().user).toBeNull()
	})
	it('does not restore authentication from refresh completing after logout', async () => {
		localStorage.setItem('token', 'existing')
		useAuth.getState().set(user)
		const emit = vi.fn()
		setAuthSocket({ emit })
		let finishRefresh!: (response: Response) => void
		const pending = new Promise<Response>((resolve) => {
			finishRefresh = resolve
		})
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			if (String(input).endsWith('/auth/refresh')) return pending
			if (String(input).endsWith('/logout')) return json({ redirect_url: null })
			return json({}, 401)
		})
		const request = api('/api/test', z.unknown()).catch(
			(error: unknown) => error,
		)
		await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
		await logout()
		finishRefresh(json({ user }))
		await request
		expect(localStorage.getItem('token')).toBeNull()
		expect(useAuth.getState().user).toBeNull()
		expect(emit).not.toHaveBeenCalled()
	})
	it('rejects auth success without nonempty access token', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
			json({ user: { id: 'u', username: 'user' } }),
		)
		await expect(login('u', 'p')).rejects.toThrow('invalid response')
		expect(useAuth.getState().user).toBeNull()
	})
	it('keeps initialization native and skips refresh until root exists', async () => {
		const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			json({
				isInit: false,
				ConfigPath: '/config',
				MetadataPath: '/metadata',
			}),
		)
		await initializeAuth()
		expect(mock).toHaveBeenCalledTimes(1)
		expect(useAuth.getState().serverStatus?.ConfigPath).toBe('/config')
		expect(useAuth.getState().user).toBeNull()
		mock.mockResolvedValue(new Response('OK'))
		await api('/init', z.unknown(), {
			method: 'POST',
			body: JSON.stringify({ newRoot: { username: 'root', password: '' } }),
		})
		expect(String(mock.mock.calls.at(-1)?.[0])).toBe('/init')
	})
	it('revokes all devices through native logout without a second request', async () => {
		localStorage.setItem('token', 'existing')
		const mock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(json({ redirect_url: null }))
		await logout(true)
		expect(mock).toHaveBeenCalledTimes(1)
		expect(String(mock.mock.calls[0][0])).toBe('/logout?allDevices=1')
		expect(localStorage.getItem('token')).toBeNull()
	})
	it('accepts native plain success, JSON creation, and empty mutation responses', async () => {
		const mock = vi.spyOn(globalThis, 'fetch')
		mock.mockResolvedValue(new Response('OK', { status: 200 }))
		await expect(
			api('/me/password', z.object({}), {
				method: 'PATCH',
				body: JSON.stringify({ password: 'old', newPassword: 'new' }),
			}),
		).resolves.toEqual({})
		mock.mockResolvedValue(json({ id: 'created' }, 201))
		await expect(
			api('/test', z.object({ id: z.string() }), { method: 'POST' }),
		).resolves.toEqual({ id: 'created' })
		mock.mockResolvedValue(new Response(null, { status: 204 }))
		await expect(
			api('/me/sessions/id', z.object({}), { method: 'DELETE' }),
		).resolves.toEqual({})
	})
	it('uses same native auth boundary for binary reads and rejects external destinations', async () => {
		const mock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(new Uint8Array([1, 2, 3])))
		const signal = new AbortController().signal
		expect(
			new Uint8Array(await apiBinary('/items/i/ebook', { signal })),
		).toEqual(new Uint8Array([1, 2, 3]))
		expect(mock).toHaveBeenCalledWith(
			'/api/items/i/ebook',
			expect.objectContaining({ signal, credentials: 'include' }),
		)
		await expect(apiBinary('https://evil.example/book')).rejects.toThrow(
			'same-origin',
		)
	})
	it('changes session epoch for same-user new login and logout, not refresh', async () => {
		const start = getAuthGeneration()
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
			String(input).endsWith('/status')
				? json({ isInit: true })
				: String(input).endsWith('/logout')
					? json({ redirect_url: null })
					: json({ user }),
		)
		await login('user', '')
		expect(getAuthGeneration()).toBe(start + 1)
		await initializeAuth()
		expect(getAuthGeneration()).toBe(start + 1)
		await logout()
		expect(getAuthGeneration()).toBe(start + 2)
	})
	it('does not finish binary reads under a new login session', async () => {
		let finish!: (value: Response) => void
		const pending = new Promise<Response>((resolve) => {
			finish = resolve
		})
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
			String(input).endsWith('/login') ? json({ user }) : pending,
		)
		const read = apiBinary('/items/i/ebook')
		await login('user', '')
		finish(new Response(new Uint8Array([1])))
		await expect(read).rejects.toThrow('Session changed')
	})
	it('permits HTTP logout destination only', () => {
		expect(logoutRedirect('https://id.example/logout')).toBe(
			'https://id.example/logout',
		)
		expect(() => logoutRedirect('javascript:alert(1)')).toThrow()
	})
})
