import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

// Run only against locally built proxy; never record traces, HAR or storage state.
const origin = process.env.STABLE_SMOKE_ORIGIN
if (!origin || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))
	throw new Error('STABLE_SMOKE_ORIGIN must be local built-container origin')
const env = readFileSync(
	'/Users/felixfoertsch/Developer/audiobookshelf-sponsorblock/.env',
	'utf8',
)
const secret = (key: string) => {
	const line = env.split('\n').find((value) => value.startsWith(`${key}=`))
	const value = line
		?.slice(key.length + 1)
		.trim()
		.replace(/^(['"])(.*)\1$/, '$2')
	if (!value) throw new Error(`Required credential missing: ${key}`)
	return value
}
const browser = await chromium.launch()
try {
	const context = await browser.newContext()
	const page = await context.newPage()
	await page.goto(`${origin}/login`)
	await page
		.getByLabel('Username', { exact: true })
		.fill(secret('PSB_STABLE_USERNAME'))
	await page
		.getByLabel('Password', { exact: true })
		.fill(secret('PSB_STABLE_PASSWORD'))
	await page.getByRole('button', { name: 'Sign in', exact: true }).click()
	await page.waitForURL((url) => url.pathname !== '/login')
	const checks = await page.evaluate(async () => {
		const headers = {
			authorization: `Bearer ${localStorage.getItem('token') || ''}`,
		}
		const me = await fetch('/api/me', { headers })
		const refresh = await fetch('/auth/refresh', {
			method: 'POST',
			headers,
			credentials: 'include',
		})
		const list = await fetch('/api/libraries', { headers })
		const payload: unknown = await list.json()
		const libraries = (
			payload as { libraries?: { id: string; name: string }[] }
		).libraries
		const audiobooks = libraries?.find(
			(library) => library.name === 'Audiobooks',
		)
		const items = audiobooks
			? await fetch(
					`/api/libraries/${encodeURIComponent(audiobooks.id)}/items`,
					{ headers },
				)
			: null
		return {
			me: me.status,
			refresh: refresh.status,
			libraries: list.status,
			audiobooksVisible: !!audiobooks,
			items: items?.status,
		}
	})
	if (
		checks.me !== 200 ||
		checks.refresh !== 200 ||
		checks.libraries !== 200 ||
		!checks.audiobooksVisible ||
		checks.items !== 403
	)
		throw new Error('Stable restricted-user response contract failed')
	const socketConnected = await page.waitForFunction(
		() =>
			(window as Window & { __ABS_SOCKET__?: { connected: boolean } })
				.__ABS_SOCKET__?.connected === true,
	)
	await socketConnected.dispose()
	const cookies = await context.cookies()
	if (
		!cookies.some(
			(cookie) => cookie.httpOnly && cookie.path === '/' && cookie.secure,
		)
	)
		throw new Error('Secure refresh cookie missing')
	console.log(
		JSON.stringify({
			...checks,
			socketConnected: true,
			secureRefreshCookie: true,
		}),
	)
	await context.close()
} finally {
	await browser.close()
}
