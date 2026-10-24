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
			await page.goto('/')
			await page.getByLabel('Username', { exact: true }).fill('listener')
			await page.getByLabel('Password', { exact: true }).fill('password')
			await page.getByRole('button', { name: 'Sign in', exact: true }).click()
			for (const [view, path] of [
				['home', '/library/podcasts'],
				['library', '/library/podcasts/bookshelf'],
			]) {
				await page.goto(path)
				await expect(page.getByRole('heading', { level: 1 })).toHaveText(
					view === 'home' ? 'Home' : 'Library',
				)
				await expect(page.locator('main article').first()).toBeVisible()
				if (view === 'library') {
					const options = page.getByRole('button', {
						name: 'View options',
						exact: true,
					})
					const select = page.getByRole('button', {
						name: 'Select',
						exact: true,
					})
					const optionsBox = await options.boundingBox()
					const selectBox = await select.boundingBox()
					expect(optionsBox?.y).toBe(selectBox?.y)
					await expect(page.getByLabel('Sort', { exact: true })).toHaveCount(0)
					await options.click()
					await expect(
						page.getByRole('dialog', { name: 'View options' }),
					).toBeVisible()
					for (const name of ['Sort', 'Order', 'Filter', 'View'])
						await expect(
							page.getByRole('combobox', { name, exact: true }),
						).toBeVisible()
					await expect(
						page.getByRole('slider', { name: 'Cover size', exact: true }),
					).toBeVisible()
					await page
						.getByRole('combobox', { name: 'Sort', exact: true })
						.selectOption('addedAt')
					await expect(page).toHaveURL(/sort=addedAt/)
					await page.keyboard.press('Escape')
					await expect(options).toBeFocused()
				}
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
