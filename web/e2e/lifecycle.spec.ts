import { expect, test } from '@playwright/test'
import { appMenu, signOut } from './shell-controls'

async function openBook(page: import('@playwright/test').Page) {
	await page.goto('/new/')
	await page.getByLabel('Username', { exact: true }).fill('listener')
	await page.getByLabel('Password', { exact: true }).fill('password')
	await page.getByRole('button', { name: 'Sign in', exact: true }).click()
	await expect(appMenu(page)).toBeVisible()
	await page.goto('/new/item/book-1')
	await expect(
		page.getByRole('heading', { name: 'The Glass Orchard', exact: true }),
	).toBeVisible()
}
test('local logout closes playback before revocation and stays signed out', async ({
	page,
}) => {
	await openBook(page)
	await page.getByRole('button', { name: 'Play audiobook' }).click()
	await expect(page.getByLabel('Audio playback')).toBeVisible()
	let releaseRefresh!: () => void
	let refreshStarted!: () => void
	const started = new Promise<void>((resolve) => {
		refreshStarted = resolve
	})
	const release = new Promise<void>((resolve) => {
		releaseRefresh = resolve
	})
	await page.route('**/api/me/sessions?*', (route) =>
		route.fulfill({ status: 401, json: {} }),
	)
	await page.route('**/auth/refresh', async (route) => {
		const response = await route.fetch()
		refreshStarted()
		await release
		await route.fulfill({ response })
	})
	await appMenu(page).click()
	await page.getByRole('menuitem', { name: /Account$/ }).click()
	await started
	const requests: string[] = []
	page.on('request', (req) => {
		if (req.method() === 'POST') requests.push(new URL(req.url()).pathname)
	})
	const revoked = page.waitForResponse(
		(response) => new URL(response.url()).pathname === '/logout',
	)
	await signOut(page)
	await revoked
	await expect(
		page.getByRole('button', { name: 'Sign in', exact: true }),
	).toBeVisible()
	const delayedRefresh = page.waitForResponse(
		(response) => new URL(response.url()).pathname === '/auth/refresh',
	)
	releaseRefresh()
	await (await delayedRefresh).finished()
	await expect(
		page.getByRole('button', { name: 'Sign in', exact: true }),
	).toBeVisible()
	const closeIndex = requests.findIndex((path) => path.endsWith('/close'))
	const logoutIndex = requests.indexOf('/logout')
	expect(closeIndex).toBeGreaterThanOrEqual(0)
	expect(logoutIndex).toBeGreaterThan(closeIndex)
	expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull()
	expect(
		(await page.context().cookies()).some(
			(cookie) => cookie.name === 'fixture_session',
		),
	).toBe(false)
	expect((await page.request.post('/auth/refresh')).status()).toBe(401)
	await page.reload()
	await expect(
		page.getByRole('button', { name: 'Sign in', exact: true }),
	).toBeVisible()
})
test('failed metadata preserves resume when closing', async ({ page }) => {
	let closedTime = -1
	await page.route('**/api/items/book-1/play', async (route) => {
		const response = await route.fetch()
		const data = await response.json()
		data.currentTime = 8
		data.audioTracks[0].contentUrl = '/broken.wav'
		await route.fulfill({ response, json: data })
	})
	await page.route('**/api/session/*/close', async (route) => {
		closedTime = route.request().postDataJSON().currentTime
		await route.continue()
	})
	await openBook(page)
	await page.getByRole('button', { name: 'Play audiobook' }).click()
	await expect(page.getByRole('alert')).toContainText('Audio could not load')
	await page.getByRole('button', { name: 'Close player' }).click()
	await expect.poll(() => closedTime).toBe(8)
})
test('ended session removed then replay creates fresh session', async ({
	page,
}) => {
	await openBook(page)
	const initialResponse = page.waitForResponse((response) =>
		response.url().endsWith('/api/items/book-1/play'),
	)
	await page.getByRole('button', { name: 'Play audiobook' }).click()
	const initial = await (await initialResponse).json()
	const audio = page.getByLabel('Audio playback')
	await expect(audio).toBeVisible()
	await audio.evaluate((node) => node.dispatchEvent(new Event('ended')))
	await expect(audio).toHaveCount(0)
	const request = page.waitForResponse((response) =>
		response.url().endsWith('/api/items/book-1/play'),
	)
	await page.getByRole('button', { name: 'Play audiobook' }).click()
	const data = await (await request).json()
	expect(data.id).toMatch(/^fixture-session-/)
	expect(data.id).not.toBe(initial.id)
	await expect(audio).toBeVisible()
})
test('failed replacement removes closed controls and retry syncs fresh session', async ({
	page,
}) => {
	let starts = 0
	const closed: string[] = []
	const synced: string[] = []
	await page.route('**/api/items/book-1/play', async (route) => {
		starts++
		if (starts === 2)
			return route.fulfill({ status: 500, body: 'Start failed' })
		await route.continue()
	})
	page.on('request', (request) => {
		const path = new URL(request.url()).pathname
		if (path.endsWith('/close')) closed.push(path)
		if (path.endsWith('/sync')) synced.push(path)
	})
	await openBook(page)
	const play = page.getByRole('button', { name: 'Play audiobook' })
	const audio = page.getByLabel('Audio playback')
	await play.click()
	await expect(audio).toBeVisible()
	await play.click()
	await expect(page.getByRole('alert').first()).toBeVisible()
	await expect(audio).toHaveCount(0)
	expect(closed.length).toBeGreaterThan(0)
	const response = page.waitForResponse(
		(result) =>
			result.url().endsWith('/api/items/book-1/play') &&
			result.status() === 200,
	)
	await play.click()
	const fresh = await (await response).json()
	await expect(audio).toBeVisible()
	await expect
		.poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentTime))
		.toBeGreaterThan(0.1)
	await audio.evaluate((node: HTMLAudioElement) => node.pause())
	await expect
		.poll(() => synced.includes(`/api/session/${fresh.id}/sync`))
		.toBe(true)
	expect(closed).not.toContain(`/api/session/${fresh.id}/close`)
})

test('unavailable files and missing detail stay truthful', async ({ page }) => {
	await openBook(page)
	await page.goto('/new/items/book-2')
	await expect(page).toHaveURL('/new/item/book-2')
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
	await expect(page.getByText(/Use Classic to manage files/)).toHaveCount(0)
	await expect(
		page.getByText('Audio unavailable', { exact: true }),
	).toBeVisible()
	await expect(
		page.getByRole('button', { name: 'Play audiobook' }),
	).toBeDisabled()
	await page.goto('/new/item/podcast-1')
	await expect(
		page.getByRole('button', { name: 'Play', exact: true }).nth(1),
	).toBeDisabled()
	await page.goto('/new/item/missing')
	await expect(page.getByRole('alert')).toContainText('Item not found')
})
test('unsafe source closes rejected session without stale callback on next playback', async ({
	page,
}) => {
	let first = true
	let rejectedSession = ''
	const closed: string[] = []
	const externalRequests: string[] = []
	page.on('request', (request) => {
		const url = new URL(request.url())
		if (url.pathname.endsWith('/close')) closed.push(url.pathname)
		if (url.hostname === 'untrusted.invalid')
			externalRequests.push(request.url())
	})
	await page.route('**/api/items/book-1/play', async (route) => {
		const response = await route.fetch()
		const data = await response.json()
		if (first) {
			rejectedSession = data.id
			data.audioTracks[0].contentUrl = 'https://untrusted.invalid/audio.wav'
			first = false
		}
		await route.fulfill({ response, json: data })
	})
	await openBook(page)
	await page.getByRole('button', { name: 'Play audiobook' }).click()
	await expect(page.getByRole('alert').first()).toContainText(
		'unsafe audio URL',
	)
	await expect
		.poll(
			() =>
				closed.filter(
					(path) => path === `/api/session/${rejectedSession}/close`,
				).length,
		)
		.toBe(1)
	expect(externalRequests).toEqual([])
	await expect(page.getByLabel('Audio playback')).toHaveCount(0)
	await page.getByRole('button', { name: 'Play audiobook' }).click()
	await expect
		.poll(() =>
			page
				.getByLabel('Audio playback')
				.evaluate((node: HTMLAudioElement) => node.currentTime),
		)
		.toBeGreaterThan(0.1)
	expect(
		closed.filter((path) => path === `/api/session/${rejectedSession}/close`),
	).toHaveLength(1)
	expect(externalRequests).toEqual([])
})
