import { expect, type Locator, test } from '@playwright/test'
import { contrast } from './contrast'
import {
	appMenu,
	chooseTheme,
	closeSidebar,
	openSidebar,
	settleAnimations,
} from './shell-controls'

for (const width of [1280, 390]) {
	for (const theme of ['light', 'dark']) {
		test(`book detail contrast ${width} ${theme}`, async ({ page }) => {
			await page.setViewportSize({ width, height: 900 })
			await page.goto('/login')
			await page.getByLabel('Username', { exact: true }).fill('admin')
			await page.getByLabel('Password', { exact: true }).fill('password')
			await page.getByRole('button', { name: 'Sign in', exact: true }).click()
			await page.waitForURL(/library\/podcasts$/)
			await page.goto('/item/book-1')
			await chooseTheme(page, theme)
			await settleAnimations(page)
			async function check(name: string, control: Locator, minimum = 4.5) {
				await control.scrollIntoViewIfNeeded()
				await expect(control).toBeVisible()
				await settleAnimations(page)
				const result = await contrast(control)
				console.log(JSON.stringify({ width, theme, name, ...result }))
				expect
					.soft(result.ratio, `${width} ${theme} ${name}`)
					.toBeGreaterThanOrEqual(minimum)
			}
			await openSidebar(page)
			await settleAnimations(page)
			await check('library', page.getByRole('button', { name: /^Library:/ }))
			await check('user', appMenu(page))
			await closeSidebar(page)
			await check(
				'chapter',
				page.getByRole('button', { name: /0:00.*The Glass Orchard/ }),
			)
			await check(
				'More',
				page.getByRole('button', { name: 'More', exact: true }),
			)
			for (const name of ['Audio tracks', 'Library files']) {
				const table = page.getByRole('table', { name })
				for (const cell of await table.locator('caption, th, td').all()) {
					if (!(await cell.locator('button, a').count()))
						await check(`${name}: ${await cell.innerText()}`, cell)
				}
			}
			for (const button of await page
				.locator('main button, main a[download]')
				.all()) {
				if (await button.isVisible())
					await check(
						(await button.getAttribute('aria-label')) ||
							(await button.innerText()),
						button,
					)
			}
			await check(
				'download',
				page.getByRole('link', { name: /Download The Glass Orchard/ }),
			)
			await check(
				'delete',
				page.getByRole('button', { name: /Delete The Glass Orchard/ }),
			)
			await check(
				'probe',
				page.getByRole('button', { name: /Probe The Glass Orchard/ }),
			)
			await page.route('**/api/items/book-1/ffprobe/*', (route) =>
				route.fulfill({ json: { format: { format_name: 'wav' } } }),
			)
			await page
				.getByRole('button', { name: /Probe The Glass Orchard/ })
				.click()
			await check('probe output', page.locator('pre'))
			await check(
				'close probe',
				page.getByRole('button', { name: 'Close ffprobe result' }),
			)
			await page
				.getByRole('button', {
					name: 'Add to collection or playlist',
					exact: true,
				})
				.click()
			const sheet = page.getByRole('dialog', {
				name: 'Add book to collection or playlist',
			})
			await expect(sheet).toBeVisible()
			await sheet.getByLabel('New name').fill('Contrast check')
			await settleAnimations(page)
			for (const control of await sheet
				.locator('h2, p, label, input, select, button')
				.all()) {
				if (await control.isEnabled())
					await check(
						`Sheet: ${(await control.getAttribute('aria-label')) || (await control.innerText())}`,
						control,
						(await control.innerText()) === 'Close' ? 3 : 4.5,
					)
			}
			await check(
				'Sheet close icon',
				sheet
					.getByRole('button', { name: 'Close', exact: true })
					.locator('svg'),
				3,
			)
			await page.screenshot({
				path: `/private/tmp/opencode/book-detail/${width}-${theme}-sheet.png`,
			})
		})
	}
}
