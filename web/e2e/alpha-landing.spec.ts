import { expect, test } from '@playwright/test'

// Native Classic artifacts must be generated separately for each configured base.
// This opt-in fixture never moves Classic or rewrites its API/auth/socket paths.
test.describe('alpha landing and native Classic fallback', () => {
	test.skip(
		!process.env.CLASSIC_NATIVE_DIST_PATH,
		'Requires root/abs native Classic builds',
	)
	for (const prefix of process.env.CLASSIC_PRODUCTION_BASE === '1'
		? ['']
		: ['', '/abs']) {
		test(`Classic navigation, refresh and transports ${prefix || 'root'}`, async ({
			page,
		}) => {
			const classicPrefix =
				process.env.CLASSIC_PRODUCTION_BASE === '1' ? '/audiobookshelf' : prefix
			const requests: string[] = []
			const sockets: string[] = []
			page.on('request', (request) =>
				requests.push(new URL(request.url()).pathname),
			)
			page.on('websocket', (socket) =>
				sockets.push(new URL(socket.url()).pathname),
			)
			await page.goto(`${prefix}/?source=alpha#retained`)
			await expect(page).toHaveURL(
				new RegExp(`${prefix}/new/\\?source=alpha#retained$`),
			)
			await expect(
				page.getByRole('complementary', { name: 'Alpha frontend' }),
			).toContainText('Alpha 1')
			await page
				.getByRole('link', { name: 'Open Classic', exact: true })
				.click()
			await expect(page).toHaveURL(new RegExp(`${classicPrefix}/login`))
			await page.locator('input[autocomplete="username"]').fill('listener')
			await page
				.locator('input[autocomplete="current-password"]')
				.fill('password')
			await page.getByRole('button', { name: 'Submit', exact: true }).click()
			await expect(page).toHaveURL(
				new RegExp(`${classicPrefix}/library/podcasts$`),
			)
			await page.reload()
			await expect(
				page.getByRole('link', { name: 'audiobookshelf', exact: true }),
			).toBeVisible()
			await page.goto(`${classicPrefix}/item/book-1`)
			await expect(
				page
					.getByText('The Glass Orchard', { exact: true })
					.filter({ visible: true })
					.first(),
			).toBeVisible()
			await page.reload()
			await expect(
				page
					.getByText('The Glass Orchard', { exact: true })
					.filter({ visible: true })
					.first(),
			).toBeVisible()
			await page
				.getByRole('button', { name: 'Play', exact: true })
				.first()
				.click()
			await expect
				.poll(() =>
					requests.some((path) =>
						path.startsWith(`${classicPrefix}/public/session/`),
					),
				)
				.toBe(true)
			for (const path of [
				`${classicPrefix}/status`,
				`${classicPrefix}/login`,
				`${classicPrefix}/api/authorize`,
			])
				expect(requests).toContain(path)
			expect(
				requests.some((path) => path.startsWith(`${classicPrefix}/_nuxt/`)),
			).toBe(true)
			expect(sockets).toContain(`${classicPrefix}/socket.io/`)
			expect(
				requests.some((path) =>
					/^\/(?:abs\/)?new\/(?:api|auth|hls|public|socket\.io)(?:\/|$)/.test(
						path,
					),
				),
			).toBe(false)
		})
	}
})
