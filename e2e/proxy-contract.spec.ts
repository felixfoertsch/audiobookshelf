import { expect, test } from '@playwright/test'

const base = process.env.BUILT_BASE_URL
if (!base) throw new Error('Proxy contract tests require BUILT_BASE_URL')

test('native login cookie refresh, Range, and WebSocket cross proxy', async ({
	page,
	request,
}) => {
	await page.goto(base)
	const login = await request.post(`${base}/login`, {
		data: { username: 'admin', password: 'password' },
	})
	expect(login.status()).toBe(200)
	const setCookie = login.headers()['set-cookie'] || ''
	expect(setCookie).toContain('fixture_session=')
	expect(setCookie.toLowerCase()).toContain('httponly')
	expect(setCookie.toLowerCase()).toContain('samesite=lax')
	expect(setCookie.toLowerCase()).toContain('secure')
	const refresh = await request.post(`${base}/auth/refresh`, {
		headers: { cookie: setCookie.split(';', 1)[0] },
	})
	expect(refresh.status()).toBe(200)
	const share = await request.get(`${base}/public/share/public-book`)
	expect(share.status()).toBe(200)
	const range = await request.get(`${base}/public/share/public-book/track/1`, {
		headers: {
			cookie: (share.headers()['set-cookie'] || '').split(';', 1)[0],
			range: 'bytes=0-15',
		},
	})
	expect(range.status()).toBe(206)
	expect(range.headers()['content-range']).toMatch(/^bytes 0-15\//)
	const socket = await page.evaluate(async () => {
		const ws = new WebSocket(
			`${location.origin.replace(/^http/, 'ws')}/socket.io/?EIO=4&transport=websocket`,
		)
		return await new Promise<string>((resolve, reject) => {
			const timer = setTimeout(
				() => reject(new Error('Socket.IO handshake timed out')),
				5000,
			)
			ws.onmessage = (event) => {
				clearTimeout(timer)
				ws.close()
				resolve(String(event.data))
			}
			ws.onerror = () => reject(new Error('Socket.IO websocket failed'))
		})
	})
	expect(socket).toMatch(/^0\{/)
})

test('sidecar prefix strip, bearer-only auth, availability, and item ACL', async ({
	request,
}) => {
	const mock = `${process.env.PSB_MOCK_CONTROL_URL || 'http://sidecar-mock:4181'}/__mock/state`
	await request.post(mock, {
		data: { unavailable: false, unauthorized: false },
	})
	const endpoint = `${base}/psb/api/items/allowed-item/analysis`
	const allowed = await request.get(endpoint, {
		headers: {
			authorization: 'Bearer fixture-admin-access',
			cookie: 'must-not-forward=1',
		},
	})
	expect(allowed.status()).toBe(200)
	expect(await allowed.json()).toMatchObject({
		episodes: {
			'ep-1': {
				status: 'complete',
				version: 'fixture-v1',
				sourceSha256: 'a'.repeat(64),
				segments: [{ start: 5, end: 10 }],
				adAnalysisEnabled: true,
			},
		},
	})
	const deniedItem = await request.get(
		`${base}/psb/api/items/other-item/analysis`,
		{
			headers: { authorization: 'Bearer fixture-admin-access' },
		},
	)
	expect(deniedItem.status()).toBe(403)
	const unauthorized = await request.get(endpoint)
	expect(unauthorized.status()).toBe(401)
	await request.post(mock, { data: { unauthorized: true } })
	expect(
		(
			await request.get(endpoint, {
				headers: { authorization: 'Bearer fixture-admin-access' },
			})
		).status(),
	).toBe(401)
	await request.post(mock, { data: { unauthorized: false, unavailable: true } })
	expect(
		(
			await request.get(endpoint, {
				headers: { authorization: 'Bearer fixture-admin-access' },
			})
		).status(),
	).toBe(503)
	await request.post(mock, { data: { unavailable: false } })
})

test('reserved routes fail closed and SPA deep links stay root-based', async ({
	request,
}) => {
	for (const path of [
		'/init',
		'/internal-api',
		'/internal-api/foo',
		'/psb',
		'/psb/',
	]) {
		const response = await request.post(`${base}${path}`)
		expect(response.status(), path).toBe(404)
	}
	const deep = await request.get(`${base}/item/book-1`)
	expect(deep.status()).toBe(200)
	expect(deep.headers()['cache-control']).toContain('no-store')
	const manifest = await request.get(`${base}/manifest.webmanifest`)
	expect(manifest.status()).toBe(200)
	expect(manifest.headers()['cache-control']).toContain('no-store')
	const missingAsset = await request.get(`${base}/assets/plain.js`)
	expect(missingAsset.status()).toBe(404)
	expect(missingAsset.headers()['cache-control'] ?? '').not.toContain(
		'immutable',
	)
})
