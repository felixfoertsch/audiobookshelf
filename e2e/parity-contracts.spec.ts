import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { expect, type Page, test } from '@playwright/test'

const root = resolve(import.meta.dirname, '../..')
function prerequisite(path: string, flag: string) {
	try {
		return readFileSync(resolve(root, path), 'utf8')
	} catch (cause) {
		throw new Error(
			`${flag} requires ${path}; see e2e/classic-preview/README.md`,
			{ cause },
		)
	}
}
const ledger =
	process.env.CLASSIC_CONTRACTS === '1'
		? prerequisite('docs/frontend-parity.md', 'CLASSIC_CONTRACTS=1')
		: ''
const routes = [...ledger.matchAll(/^\| (R\d+) [^|]+\| `([^`]+)` \|/gm)].map(
	([, id, path]) => ({ id, path }),
)

test('actual generated Classic leaf routes match parity ledger', () => {
	test.skip(
		process.env.CLASSIC_CONTRACTS !== '1',
		'Requires separately generated Classic artifact',
	)
	const generated = prerequisite(
		'client/node_modules/.cache/nuxt/router.js',
		'CLASSIC_CONTRACTS=1',
	)
	const literal = generated.match(
		/routes: (\[[\s\S]*?\]),\s*\n\s*fallback:/,
	)?.[1]
	expect(
		literal,
		'Generate Classic first; see classic-preview/README.md',
	).toBeTruthy()
	const tree = runInNewContext(
		`(${literal?.replace(/component: _[a-z0-9]+/g, 'component: null')})`,
	) as { path: string; children?: { path: string }[] }[]
	const leaves = tree.flatMap((route) =>
		route.children
			? route.children.map((child) =>
					`${route.path}/${child.path}`.replace(/\/$/, ''),
				)
			: [route.path],
	)
	expect(leaves.sort()).toEqual(routes.map((route) => route.path).sort())
})

// Source-backed semantic slices, not an assertion of all 41 routes/buttons.
const english = (
	process.env.PARITY_COMPARE === '1'
		? JSON.parse(prerequisite('client/strings/en-us.json', 'PARITY_COMPARE=1'))
		: {}
) as Record<string, string>
const fixtures = (
	process.env.PARITY_COMPARE === '1'
		? JSON.parse(process.env.PARITY_CASES || '{}')
		: {}
) as Record<
	string,
	{ id?: string; title?: string; episodeId?: string; username?: string }
>
async function signIn(page: Page, prefix: string) {
	await page.goto(`${prefix}/login`)
	// Native login on each client obtains its own synthetic cookie/token. Never
	// seed Vue/Zustand internals or reuse real accounts.
	await page.locator('input[autocomplete="username"]').fill('listener')
	await page.locator('input[autocomplete="current-password"]').fill('password')
	const response = page.waitForResponse(
		(r) =>
			new URL(r.url()).pathname ===
				`${prefix === '/classic' ? '/classic' : ''}/login` &&
			r.request().method() === 'POST',
	)
	await page
		.getByRole('button', {
			name: prefix === '/classic' ? english.ButtonSubmit : 'Sign in',
			exact: true,
		})
		.click()
	expect((await response).ok()).toBe(true)
	await expect(page).not.toHaveURL(/\/login(?:[?#]|$)/)
	await expect(
		page.getByRole('link', {
			name: prefix === '/classic' ? 'audiobookshelf' : 'Audiobookshelf',
			exact: true,
		}),
	).toBeVisible()
}

test.describe('prepared semantic Classic/modern slices', () => {
	test.skip(
		process.env.PARITY_COMPARE !== '1',
		'Pending Classic fixture adapter; these cases are not runtime parity evidence',
	)
	for (const key of ['R08.book', 'R08.podcast', 'R04.account']) {
		test(`${key}: required information and native action outcome`, async ({
			browser,
			baseURL,
		}) => {
			const data = fixtures[key]
			expect(
				data,
				`PARITY_CASES requires explicit route-role mapping for ${key}`,
			).toBeTruthy()
			for (const prefix of ['/classic', '/new']) {
				const context = await browser.newContext({
					baseURL,
					serviceWorkers: 'block',
				})
				try {
					const page = await context.newPage()
					const errors: string[] = []
					page.on('response', (r) => {
						const path = new URL(r.url()).pathname
						// Only expected signed-out refresh 401 is permitted during bootstrap.
						if (
							r.status() >= 400 &&
							/\/(api|auth)\//.test(path) &&
							!(r.status() === 401 && path.endsWith('/auth/refresh'))
						)
							errors.push(`${r.status()} ${path}`)
					})
					await signIn(page, prefix)
					if (key === 'R04.account') {
						// R04: client/pages/account.vue; web/src/features/account/index.tsx.
						await page.goto(`${prefix}/account`)
						const username = page.getByRole('textbox', {
							name: english.LabelUsername,
							exact: true,
						})
						await expect(username).toBeVisible()
						await expect(username).toHaveValue(data.username || 'listener')
						const label =
							prefix === '/classic' ? english.ButtonLogout : 'Sign out'
						const action = page
							.getByRole('button', {
								name: prefix === '/classic' ? /^logout\s*Logout$/ : label,
								exact: true,
							})
							.last()
						await expect(action).toBeEnabled()
						page.on('dialog', (dialog) => dialog.accept())
						const result = page.waitForResponse(
							(r) =>
								new URL(r.url()).pathname ===
									`${prefix === '/classic' ? '/classic' : ''}/logout` &&
								r.request().method() === 'POST',
						)
						await action.click()
						expect((await result).ok()).toBe(true)
						await expect
							.poll(() => page.evaluate(() => localStorage.getItem('token')))
							.toBeNull()
					} else {
						// R08: client/pages/item/_id/index.vue playItem; modern ItemView.tsx.
						expect(data.id).toBeTruthy()
						expect(data.title).toBeTruthy()
						await page.goto(`${prefix}/item/${data.id}`)
						await expect(
							page
								.getByRole('heading', { name: data.title || '', exact: true })
								.first(),
						).toBeVisible()
						await expect(page).toHaveURL(new RegExp(`/item/${data.id}$`))
						const actionScope =
							prefix === '/classic' && data.episodeId
								? page
										.locator('[id^="lazy-episode-"]')
										.filter({ hasText: 'The Quiet Observatory' })
								: page
						const action = actionScope
							.getByRole('button', {
								name:
									prefix === '/classic'
										? english.ButtonPlay
										: key === 'R08.book'
											? 'Play audiobook'
											: 'Play',
								exact: true,
							})
							.first()
						await expect(action).toBeEnabled()
						const result = page.waitForResponse(
							(r) =>
								new URL(r.url()).pathname.startsWith(
									`${prefix === '/classic' ? '/classic' : ''}/api/items/${data.id}/play`,
								) && r.request().method() === 'POST',
						)
						await action.click()
						const response = await result
						expect(response.ok()).toBe(true)
						const body = response.request().postDataJSON()
						expect(body.mediaPlayer).toBe('html5')
						if (data.episodeId)
							expect(new URL(response.url()).pathname).toContain(
								`/play/${data.episodeId}`,
							)
						const session = await response.json()
						expect(session.id).toBeTruthy()
						await expect
							.poll(() =>
								page
									.locator('audio')
									.first()
									.evaluate((audio: HTMLAudioElement) => audio.currentTime),
							)
							.toBeGreaterThan(0)
					}
					expect(errors).toEqual([])
				} finally {
					await context.close()
				}
			}
		})
	}
})
