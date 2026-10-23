import { expect, test } from '@playwright/test'

for (const prefix of ['', '/abs']) {
	for (const colorScheme of ['light', 'dark'] as const) {
		test(`sidebar fills scrolled viewport ${prefix || 'root'} ${colorScheme}`, async ({
			page,
		}) => {
			await page.setViewportSize({ width: 1280, height: 800 })
			await page.emulateMedia({ colorScheme })
			await page.goto(`${prefix}/new/`)
			await page.getByLabel('Username', { exact: true }).fill('listener')
			await page.getByLabel('Password', { exact: true }).fill('password')
			await page.getByRole('button', { name: 'Sign in', exact: true }).click()
			await expect(page).toHaveURL(/\/library\/podcasts$/)
			for (const [name, route] of [
				['home', '/library/podcasts'],
				['item', '/item/podcast-1'],
			]) {
				await page.goto(`${prefix}/new${route}`)
				await expect(
					page.getByRole('heading', { level: 1 }).first(),
				).toBeVisible()
				await page.evaluate(() =>
					window.scrollTo(0, document.documentElement.scrollHeight),
				)
				await expect
					.poll(() => page.evaluate(() => window.scrollY))
					.toBeGreaterThan(0)
				const bounds = await page
					.locator('[data-slot="sidebar-inner"]')
					.evaluate((element) => {
						const rect = element.getBoundingClientRect()
						return {
							top: rect.top,
							bottom: rect.bottom,
							height: rect.height,
							viewport: window.innerHeight,
						}
					})
				expect(bounds).toEqual({
					top: 0,
					bottom: 800,
					height: 800,
					viewport: 800,
				})
				await page.screenshot({
					path: `/private/tmp/opencode/apple-theme/sidebar-bottom/${prefix ? 'abs' : 'root'}-${colorScheme}-${name}-1280x800.png`,
				})
			}
		})
	}
}
