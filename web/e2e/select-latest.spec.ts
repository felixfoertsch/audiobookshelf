import { expect, test } from '@playwright/test'
import { contrast } from './contrast'
import { chooseTheme, settleAnimations } from './shell-controls'

for (const prefix of ['', '/abs']) {
	for (const width of [390, 1280]) {
		test(`selection with mini-player ${width} ${prefix || 'root'}`, async ({
			page,
		}) => {
			await page.setViewportSize({ width, height: 900 })
			await page.goto(`${prefix}/new/`)
			await page.getByLabel('Username', { exact: true }).fill('listener')
			await page.getByLabel('Password', { exact: true }).fill('password')
			await page.getByRole('button', { name: 'Sign in', exact: true }).click()
			await page.goto(`${prefix}/new/item/podcast-1`)
			await page
				.getByRole('button', {
					name: 'Play The Quiet Observatory',
					exact: true,
				})
				.click()
			await expect(
				page.getByRole('region', { name: 'Audio player', exact: true }),
			).toBeVisible()
			// Client navigation preserves the real mini-player, unlike page.goto().
			if (width === 390)
				await page
					.getByRole('button', { name: 'Toggle Sidebar', exact: true })
					.click()
			await page
				.locator('a[href$="/library/podcasts/bookshelf"]')
				.first()
				.click()
			if (
				width === 390 &&
				(await page
					.getByRole('dialog', { name: 'Sidebar', exact: true })
					.isVisible())
			)
				await page.keyboard.press('Escape')
			await page.getByRole('button', { name: 'Select', exact: true }).click()
			const toolbar = page.getByRole('region', {
				name: 'Selection',
				exact: true,
			})
			await expect(toolbar).toBeVisible()
			await expect(
				page.getByRole('button', { name: 'Done', exact: true, pressed: true }),
			).toBeInViewport()
			await expect(
				page.getByRole('button', { name: 'Done', exact: true }).first(),
			).toBeInViewport()
			const bulk = toolbar.getByRole('button', { name: 'Bulk actions' })
			await expect(bulk).toBeDisabled()
			await expect(bulk).toHaveAccessibleDescription(
				'Select items to enable bulk actions.',
			)
			await toolbar
				.getByRole('button', { name: 'Select page', exact: true })
				.click()
			await bulk.click()
			await expect(
				page.getByRole('menuitem', {
					name: 'Mark all episodes finished',
					exact: true,
				}),
			).toBeVisible()
			await page.keyboard.press('Escape')
			await toolbar.getByRole('button', { name: 'Done', exact: true }).click()
			await expect(
				page.getByRole('button', { name: 'Select', exact: true }),
			).toBeVisible()
		})
		for (const theme of ['light', 'dark']) {
			test(`episode buttons ${width} ${theme} ${prefix || 'root'}`, async ({
				page,
			}) => {
				await page.setViewportSize({ width, height: 900 })
				await page.goto(`${prefix}/new/`)
				await page.getByLabel('Username', { exact: true }).fill('listener')
				await page.getByLabel('Password', { exact: true }).fill('password')
				await page.getByRole('button', { name: 'Sign in', exact: true }).click()
				await page.goto(`${prefix}/new/library/podcasts/podcast/latest`)
				await chooseTheme(page, theme)
				await settleAnimations(page)
				const controls = page.locator(
					'li button[aria-label]:not([aria-label^="Play"])',
				)
				await expect(controls.first()).toBeVisible()
				for (const control of await controls.all()) {
					if (!(await control.isEnabled())) continue
					const result = await contrast(control)
					expect(result.ratio).toBeGreaterThanOrEqual(4.5)
					const style = await control.evaluate((node) => {
						const s = getComputedStyle(node)
						const r = node.getBoundingClientRect()
						return {
							border: s.borderTopColor,
							color: s.color,
							width: r.width,
							height: r.height,
						}
					})
					expect(style.border).toBe(style.color)
					expect(style.width).toBeGreaterThanOrEqual(24)
					expect(style.height).toBeGreaterThanOrEqual(24)
				}
				await page.screenshot({
					path: `/private/tmp/opencode/select-latest/latest-${prefix ? 'abs' : 'root'}-${width}-${theme}.png`,
				})
			})
		}
	}
}
