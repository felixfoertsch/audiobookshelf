import { expect, test } from '@playwright/test'
import { chooseTheme, settleAnimations } from './shell-controls'

for (const prefix of ['']) {
	for (const width of [390, 1280]) {
		for (const theme of ['light', 'dark'] as const) {
			test(`playlist detail ${width}px ${theme} ${prefix || 'root'}`, async ({
				page,
			}) => {
				await page.setViewportSize({ width, height: 900 })
				await page.goto(`${prefix}/`)
				await page.getByLabel('Username', { exact: true }).fill('listener')
				await page.getByLabel('Password', { exact: true }).fill('password')
				await page.getByRole('button', { name: 'Sign in', exact: true }).click()
				await page.goto(
					`${prefix}/library/books/bookshelf/playlists?view=detail`,
				)
				await chooseTheme(page, theme)
				const capture = async (view: string) => {
					await settleAnimations(page)
					await page.screenshot({
						path: `/private/tmp/opencode/select-playlists/v2/${view}-${prefix ? 'abs' : 'root'}-${width}-${theme}.png`,
						fullPage: true,
					})
				}
				const link = page
					.getByRole('article')
					.getByRole('link', { name: /Evening Queue/ })
				await expect(link).toBeVisible()
				await expect(page.getByRole('article')).toHaveCount(1)
				await expect(page.getByRole('alert')).toHaveCount(0)
				await capture('list')
				await link.click()
				await expect(page).toHaveURL(/\/playlist\/playlist-1$/)
				await expect(
					page.getByRole('heading', { name: 'Evening Queue' }),
				).toBeVisible()
				await expect(page.getByText('2 items · 0:13')).toBeVisible()
				await expect(page.getByText('Audio unavailable')).toBeVisible()
				await capture('detail')
				await page
					.getByRole('button', { name: 'Add items', exact: true })
					.click()
				await expect(page.getByRole('dialog')).toBeVisible()
				await expect(
					page.getByLabel('Search items', { exact: true }),
				).toBeVisible()
				await capture('add')
				await page.keyboard.press('Escape')
				await expect(
					page.getByRole('button', { name: 'Add items', exact: true }),
				).toBeFocused()
				await page.getByRole('button', { name: 'Playlist actions' }).click()
				await page
					.getByRole('menuitem', { name: 'Add to queue', exact: true })
					.click()
				await expect(
					page.getByRole('button', { name: 'Shuffle playlist' }),
				).toBeEnabled()
				const rows = page.locator('ol').getByRole('listitem')
				await rows
					.first()
					.getByRole('button', { name: /Actions for/ })
					.focus()
				await page.keyboard.press('Enter')
				await expect(
					page.getByRole('menuitem', { name: 'Move up', exact: true }),
				).toBeDisabled()
				await capture('row-menu')
				await page
					.getByRole('menuitem', { name: 'Move down', exact: true })
					.focus()
				await page.keyboard.press('Enter')
				await expect(rows.first()).toContainText('Northbound Letters')
				for (const name of ['Renamed Queue', 'Evening Queue']) {
					await page.getByRole('button', { name: 'Playlist actions' }).click()
					await page.getByRole('menuitem', { name: 'Edit details' }).click()
					await page.getByLabel('Name', { exact: true }).fill(name)
					await page.getByRole('button', { name: 'Save changes' }).click()
					await expect(
						page.getByRole('heading', { name, exact: true }),
					).toBeVisible()
					await expect(page.getByRole('dialog')).not.toBeVisible()
					await expect(
						page.getByRole('button', { name: 'Playlist actions' }),
					).toBeFocused()
				}
				await rows
					.first()
					.getByRole('button', { name: /Actions for/ })
					.focus()
				await page.keyboard.press('Enter')
				await page
					.getByRole('menuitem', { name: 'Move down', exact: true })
					.focus()
				await page.keyboard.press('Enter')
				await expect(rows.first()).toContainText('The Glass Orchard')
				await rows
					.last()
					.getByRole('button', { name: /Actions for/ })
					.click()
				await expect(
					page.getByRole('menuitem', { name: 'Move down', exact: true }),
				).toBeDisabled()
				await page.keyboard.press('Escape')
				expect(
					await page.evaluate(
						() => document.documentElement.scrollWidth <= innerWidth,
					),
				).toBe(true)
			})
		}
	}
}
