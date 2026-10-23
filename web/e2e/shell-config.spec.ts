import { expect, test } from '@playwright/test'
import {
	appMenu,
	chooseTheme,
	closeSidebar,
	openSidebar,
	settleAnimations,
} from './shell-controls'

for (const prefix of ['', '/abs'])
	for (const width of [1280, 390])
		for (const theme of ['light', 'dark']) {
			test(`settings navigation, account and library affordance ${prefix || 'root'} ${width} ${theme}`, async ({
				page,
			}) => {
				await page.setViewportSize({ width, height: 900 })
				await page.goto(`${prefix}/new/`)
				await page.getByLabel('Username', { exact: true }).fill('admin')
				await page.getByLabel('Password', { exact: true }).fill('password')
				await page.getByRole('button', { name: 'Sign in', exact: true }).click()
				await chooseTheme(page, theme)
				const capture = async (name: string) => {
					await settleAnimations(page)
					await page.screenshot({
						path: `/private/tmp/opencode/shell-config/${prefix ? 'abs' : 'root'}-${width}-${theme}-${name}.png`,
					})
				}
				await capture('home')
				const inset = await page.locator('#content').evaluate((node) => ({
					padding: parseFloat(getComputedStyle(node).paddingLeft),
					margin: parseFloat(getComputedStyle(node).marginLeft),
				}))
				expect(inset).toEqual({ padding: 16, margin: 0 })
				await openSidebar(page)
				const library = page.getByRole('button', { name: /^Library:/ })
				const boundary = await library.evaluate((node) => {
					const canvas = document.createElement('canvas')
					canvas.width = canvas.height = 1
					const ctx = canvas.getContext('2d')
					if (!ctx) throw new Error('Canvas unavailable')
					const rgb = (color: string) => {
						ctx.fillStyle = color
						ctx.fillRect(0, 0, 1, 1)
						return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3)
					}
					const luminance = (values: number[]) =>
						values
							.map((x) => x / 255)
							.map((x) =>
								x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4,
							)
							.reduce((sum, x, i) => sum + x * [0.2126, 0.7152, 0.0722][i], 0)
					const style = getComputedStyle(node)
					const border = luminance(rgb(style.borderTopColor))
					const background = luminance(
						rgb(
							getComputedStyle(document.documentElement).getPropertyValue(
								'--glass-opaque',
							),
						),
					)
					return {
						width: parseFloat(style.borderTopWidth),
						ratio:
							(Math.max(border, background) + 0.05) /
							(Math.min(border, background) + 0.05),
					}
				})
				console.log(
					JSON.stringify({
						libraryBoundary: { prefix, viewport: width, theme, ...boundary },
					}),
				)
				expect(boundary.width).toBeGreaterThanOrEqual(1)
				expect(boundary.ratio).toBeGreaterThanOrEqual(3)
				await library.click()
				await expect(
					page.getByRole('menuitemradio', { name: 'Field Notes', exact: true }),
				).toBeVisible()
				await capture('library-dropdown')
				await page.keyboard.press('Escape')
				const debug = page.getByRole('switch', { name: 'Debug', exact: true })
				await expect(debug).not.toBeChecked()
				await debug.click()
				await expect(debug).toBeChecked()
				await expect(page.locator('.dbo-overlay')).toBeVisible()
				await debug.click()
				await expect(debug).not.toBeChecked()
				await expect(page.locator('.dbo-overlay')).toHaveCount(0)
				await appMenu(page).click()
				await expect(page.getByRole('menuitem')).toHaveCount(2)
				await expect(page.getByRole('menuitemradio')).toHaveCount(3)
				await capture('account-menu')
				await page.keyboard.press('Escape')
				await page
					.getByRole('link', { name: 'Admin settings', exact: true })
					.click()
				await closeSidebar(page)
				const admin = page.getByRole('navigation', {
					name: 'Admin settings',
					exact: true,
				})
				await expect(
					admin.getByRole('link', { name: 'Server settings', exact: true }),
				).toHaveAttribute('aria-current', 'page')
				await admin
					.getByRole('link', { name: 'Server settings', exact: true })
					.focus()
				await page.keyboard.press('ArrowRight')
				await expect(
					admin.getByRole('link', { name: 'Backups', exact: true }),
				).toBeFocused()
				await expect(
					page.getByRole('checkbox', {
						name: 'Store covers with item',
						exact: true,
					}),
				).toBeVisible()
				await capture('admin-settings')
				await openSidebar(page)
				await appMenu(page).click()
				await page
					.getByRole('menuitem', { name: 'User settings', exact: true })
					.click()
				await closeSidebar(page)
				await expect(
					page.getByRole('navigation', { name: 'User settings', exact: true }),
				).toBeVisible()
				await expect(
					page.getByRole('combobox', { name: 'Language', exact: true }),
				).toBeVisible()
				await capture('user-settings')
				await page
					.getByRole('link', { name: 'Personal stats', exact: true })
					.click()
				await expect(
					page.getByRole('link', { name: 'Personal stats', exact: true }),
				).toHaveAttribute('aria-current', 'page')
				expect(
					await page
						.locator('html')
						.evaluate((node) => getComputedStyle(node).scrollbarWidth),
				).toBe('none')
			})
		}
