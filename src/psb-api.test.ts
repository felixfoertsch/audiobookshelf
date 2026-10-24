import { afterEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import * as nativeApi from './api'
import { useAuth } from './api'
import { psbApi } from './psb-api'

afterEach(() => {
	vi.restoreAllMocks()
	localStorage.clear()
	useAuth.getState().set(null)
})

it('sends bearer token to fixed sidecar prefix without cookies', async () => {
	localStorage.setItem('token', 'native-token')
	const fetcher = vi
		.spyOn(globalThis, 'fetch')
		.mockResolvedValue(new Response('{"ok":true}', { status: 200 }))
	await expect(
		psbApi('/api/test', z.object({ ok: z.boolean() })),
	).resolves.toEqual({ ok: true })
	expect(fetcher.mock.calls[0][0]).toBe('/psb/api/test')
	expect(fetcher.mock.calls[0][1]?.credentials).toBe('omit')
	expect(
		new Headers(fetcher.mock.calls[0][1]?.headers).get('authorization'),
	).toBe('Bearer native-token')
})

it('retries one unauthorized request after refresh and uses refreshed bearer', async () => {
	localStorage.setItem('token', 'old')
	useAuth.getState().set({ id: 'u1', username: 'user', accessToken: 'old' })
	const refresh = vi
		.spyOn(nativeApi, 'refreshSession')
		.mockImplementation(async () => {
			localStorage.setItem('token', 'new')
			return 'new'
		})
	const fetcher = vi
		.spyOn(globalThis, 'fetch')
		.mockResolvedValueOnce(new Response('', { status: 401 }))
		.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))
	await expect(
		psbApi('/api/test', z.object({ ok: z.boolean() })),
	).resolves.toEqual({ ok: true })
	expect(refresh).toHaveBeenCalledTimes(1)
	expect(fetcher).toHaveBeenCalledTimes(2)
	expect(
		new Headers(fetcher.mock.calls[1][1]?.headers).get('authorization'),
	).toBe('Bearer new')
})

it('does not repeat refresh after second unauthorized response', async () => {
	const refresh = vi
		.spyOn(nativeApi, 'refreshSession')
		.mockResolvedValue('token')
	const fetcher = vi
		.spyOn(globalThis, 'fetch')
		.mockResolvedValue(new Response('', { status: 401 }))
	await expect(psbApi('/api/test', z.unknown())).rejects.toMatchObject({
		status: 401,
	})
	expect(refresh).toHaveBeenCalledTimes(1)
	expect(fetcher).toHaveBeenCalledTimes(2)
})

it('allows queries, rejects traversal and external paths before fetching', async () => {
	const fetcher = vi
		.spyOn(globalThis, 'fetch')
		.mockResolvedValue(new Response('{"ok":true}', { status: 200 }))
	await expect(
		psbApi('/api/test?includeFeed=1', z.object({ ok: z.boolean() })),
	).resolves.toEqual({ ok: true })
	for (const path of [
		'/../api/test',
		'/%2f..%2fapi/test',
		'//evil.invalid/api',
	])
		await expect(psbApi(path, z.unknown())).rejects.toThrow(
			'Sidecar API path must be same-origin',
		)
	expect(fetcher).toHaveBeenCalledTimes(1)
})

it('surfaces sidecar unavailable without logging out', async () => {
	localStorage.setItem('token', 'native-token')
	useAuth
		.getState()
		.set({ id: 'u1', username: 'user', accessToken: 'native-token' })
	vi.spyOn(globalThis, 'fetch').mockResolvedValue(
		new Response('', { status: 503 }),
	)
	await expect(psbApi('/api/test', z.unknown())).rejects.toMatchObject({
		status: 503,
	})
	expect(localStorage.getItem('token')).toBe('native-token')
	expect(useAuth.getState().user?.id).toBe('u1')
})
