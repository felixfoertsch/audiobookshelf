import { expect, test } from '@playwright/test'

for (const width of [390, 1280])
	for (const theme of ['light', 'dark'])
		test(`catalog artwork shelves and grid ${width} ${theme}`, async ({
			page,
		}) => {
			await page.setViewportSize({ width, height: 848 })
			await page.addInitScript((value) => {
				localStorage.setItem('abs-modern-theme', value)
			}, theme)
			await page.goto('/new/')
			await page.getByLabel('Username', { exact: true }).fill('listener')
			await page.getByLabel('Password', { exact: true }).fill('password')
			await page.getByRole('button', { name: 'Sign in', exact: true }).click()
			for (const [view, path] of [
				['home', '/new/library/podcasts'],
				['library', '/new/library/podcasts/bookshelf'],
			]) {
				await page.goto(path)
				await expect(page.getByRole('heading', { level: 1 })).toHaveText(
					view === 'home' ? 'Home' : 'Library',
				)
				await expect(page.locator('main article').first()).toBeVisible()
				await expect
					.poll(() =>
						page.evaluate(
							() => document.documentElement.scrollWidth <= innerWidth,
						),
					)
					.toBe(true)
				const cardLink = page
					.locator('main article')
					.first()
					.getByRole('link')
					.first()
				await cardLink.focus()
				await expect(cardLink).toBeFocused()
				await page.screenshot({
					path: `/private/tmp/opencode/apple-ref/out/apple-catalog/${view}-${width}-${theme}.png`,
					fullPage: true,
				})
			}
		})
