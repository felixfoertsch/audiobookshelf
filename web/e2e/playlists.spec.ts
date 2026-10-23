import { expect, test } from '@playwright/test'
import { chooseTheme, settleAnimations } from './shell-controls'

for (const prefix of ['', '/abs']) {
	for (const width of [390, 1280]) {
		for (const theme of ['light', 'dark'] as const) {
			test(`playlist detail ${width}px ${theme} ${prefix || 'root'}`, async ({
				page,
			}) => {
				await page.setViewportSize({ width, height: 900 })
				await page.goto(`${prefix}/new/`)
				await page.getByLabel('Username', { exact: true }).fill('listener')
				await page.getByLabel('Password', { exact: true }).fill('password')
				await page.getByRole('button', { name: 'Sign in', exact: true }).click()
				await page.goto(
					`${prefix}/new/library/books/bookshelf/playlists?view=detail`,
				)
				await chooseTheme(page, theme)
				await settleAnimations(page)
				const link = page.getByRole('link', { name: 'Evening Queue' }).first()
				await expect(link).toBeVisible()
				await page.screenshot({
					path: `/private/tmp/opencode/select-playlists/playlist-list-${prefix ? 'abs' : 'root'}-${width}-${theme}.png`,
					fullPage: true,
				})
				await link.click()
				await expect(page).toHaveURL(/\/playlist\/playlist-1$/)
				await chooseTheme(page, theme)
				await settleAnimations(page)
				await expect(
					page.getByRole('heading', { name: 'Evening Queue' }),
				).toBeVisible()
				await expect(page.getByText('2 items · 00:00:13')).toBeVisible()
				await page.getByRole('button', { name: 'Add to queue' }).click()
				await expect(
					page.getByRole('button', { name: 'Add to queue' }),
				).toBeEnabled()
				await page.getByRole('button', { name: 'Move down' }).first().click()
				await expect(
					page.locator('ol').getByRole('listitem').first(),
				).toContainText('Northbound Letters')
				await page.getByLabel('Name').fill('Renamed Queue')
				await page.getByRole('button', { name: 'Save changes' }).click()
				await expect(
					page.getByRole('heading', { name: 'Renamed Queue' }),
				).toBeVisible()
				await page.getByLabel('Name').fill('Evening Queue')
				await page.getByRole('button', { name: 'Save changes' }).click()
				await expect(
					page.getByRole('heading', { name: 'Evening Queue' }),
				).toBeVisible()
				await page.getByRole('button', { name: 'Move down' }).first().click()
				await expect(
					page.locator('ol').getByRole('listitem').first(),
				).toContainText('The Glass Orchard')
				await expect(
					page.getByRole('button', { name: 'Move up' }).first(),
				).toBeDisabled()
				await expect(
					page.getByRole('button', { name: 'Move down' }).last(),
				).toBeDisabled()
				expect(
					await page.evaluate(
						() => document.documentElement.scrollWidth <= innerWidth,
					),
				).toBe(true)
				await page.screenshot({
					path: `/private/tmp/opencode/select-playlists/playlist-${prefix ? 'abs' : 'root'}-${width}-${theme}.png`,
					fullPage: true,
				})
			})
		}
	}
}
