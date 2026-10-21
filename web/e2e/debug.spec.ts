import { expect, test } from '@playwright/test'

for (const prefix of ['', '/abs'])
	test(`debug real adapter, canonical identity and persistent player ${prefix || 'root'}`, async ({
		page,
		baseURL,
	}) => {
		const errors: string[] = []
		let anonymous = true
		const socket = new URL(
			`${prefix}/socket.io/?EIO=4&transport=websocket`,
			baseURL,
		)
		socket.protocol = 'ws:'
		const expectedSocketError = `WebSocket connection to '${socket.href}' failed: Error during WebSocket handshake: Unexpected response code: 404`
		const refreshURL = new URL(`${prefix}/auth/refresh`, baseURL).href
		page.on('pageerror', (error) => errors.push(error.message))
		page.on('console', (message) => {
			if (
				message.type() === 'error' &&
				message.text() !== expectedSocketError &&
				!(
					anonymous &&
					message.location().url === refreshURL &&
					message.text() ===
						'Failed to load resource: the server responded with a status of 401 (Unauthorized)'
				)
			)
				errors.push(message.text())
		})
		await page.goto(`${prefix}/new/debug/issues`)
		await page.getByLabel('Username', { exact: true }).fill('admin')
		await page.getByLabel('Password', { exact: true }).fill('password')
		await page.getByRole('button', { name: 'Sign in', exact: true }).click()
		await expect(
			page.getByRole('button', { name: /admin · Menu/ }),
		).toBeVisible()
		anonymous = false
		await page.goto(`${prefix}/new/debug/issues`)
		await expect(page.getByText('Debug is disabled.')).toBeVisible()
		await page.getByRole('button', { name: /admin · Menu/ }).click()
		await page.getByRole('menuitem', { name: 'Debug issues' }).click()
		await expect(
			page.getByRole('button', { name: 'Enable debug', exact: true }),
		).toBeVisible()
		await page
			.getByRole('button', { name: 'Enable debug', exact: true })
			.click()
		await expect(
			page.getByRole('link', { name: '/item/book-1', exact: true }),
		).toHaveAttribute('href', `${prefix}/new/item/book-1`)
		await page.getByRole('link', { name: '/item/book-1', exact: true }).click()
		await expect(page.locator('.dbo-route')).toHaveText('/item/book-1')
		await page.getByRole('button', { name: 'Play audiobook' }).click()
		const audio = page.getByLabel('Audio playback')
		await expect(audio).toBeVisible()
		await expect
			.poll(() =>
				audio.evaluate(
					(node: HTMLAudioElement) => !node.paused && node.currentTime > 0,
				),
			)
			.toBe(true)
		const original = await audio.elementHandle()
		const before = await audio.evaluate(
			(node: HTMLAudioElement) => node.currentTime,
		)
		const saved = page.waitForResponse(
			(response) =>
				new URL(response.url()).pathname ===
					`${prefix}/api/debug/notes/item/book-1` &&
				response.request().method() === 'PUT',
		)
		await page.locator('.dbo-main-note').fill(`Local debug ${prefix || 'root'}`)
		const response = await saved
		expect(response.ok()).toBe(true)
		const stored = await page.evaluate(async (prefix) => {
			const response = await fetch(`${prefix}/api/debug/notes/item/book-1`, {
				headers: { authorization: `Bearer ${localStorage.getItem('token')}` },
			})
			return response.json()
		}, prefix)
		expect(stored.routePath).toBe('/item/book-1')
		const overlay = await page.locator('.dbo-overlay').boundingBox()
		const player = await page
			.getByRole('region', { name: 'Audio player', exact: true })
			.boundingBox()
		expect(overlay).not.toBeNull()
		expect(player).not.toBeNull()
		if (!overlay || !player)
			throw new Error('Missing overlay or native player bounds')
		expect(overlay.y + overlay.height).toBeLessThanOrEqual(player.y + 1)
		await page
			.locator('.dbo-overlay')
			.getByRole('link', { name: /^QA/ })
			.click()
		await expect(page).toHaveURL(new RegExp(`${prefix}/new/debug/issues$`))
		expect(await audio.evaluate((node, old) => node === old, original)).toBe(
			true,
		)
		await expect
			.poll(() =>
				audio.evaluate(
					(node: HTMLAudioElement, time) =>
						!node.paused && node.currentTime >= time,
					before,
				),
			)
			.toBe(true)
		await expect(audio).toHaveCount(1)
		expect(errors).toEqual([])
	})

test('ordinary listener has no debug menu or debug requests on denied deep link', async ({
	page,
}) => {
	const requests: string[] = []
	page.on('request', (request) => {
		if (new URL(request.url()).pathname.includes('/api/debug'))
			requests.push(request.url())
	})
	await page.goto('/new/login')
	await page.getByLabel('Username', { exact: true }).fill('listener')
	await page.getByLabel('Password', { exact: true }).fill('password')
	await page.getByRole('button', { name: 'Sign in', exact: true }).click()
	await page.getByRole('button', { name: /listener · Menu/ }).click()
	await expect(
		page.getByRole('menuitemcheckbox', { name: 'Debug', exact: true }),
	).toHaveCount(0)
	await expect(
		page.getByRole('menuitem', { name: 'Debug issues' }),
	).toHaveCount(0)
	await page.goto('/new/debug/issues')
	await expect(page.getByRole('alert')).toHaveText('Permission denied.')
	expect(requests).toEqual([])
})
