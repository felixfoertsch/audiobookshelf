import { expect, test } from '@playwright/test'
import { chooseTheme, settleAnimations } from './shell-controls'

for (const prefix of ['', '/abs']) {
	for (const role of ['listener', 'admin']) {
		test(`book progress confirmation and file permissions ${role} ${prefix || 'root'}`, async ({
			page,
		}) => {
			await page.goto(`${prefix}/new/`)
			await page.getByLabel('Username', { exact: true }).fill(role)
			await page.getByLabel('Password', { exact: true }).fill('password')
			await page.getByRole('button', { name: 'Sign in', exact: true }).click()
			await page.waitForURL(/library\/podcasts$/)
			await page.evaluate(async (base) => {
				await fetch(`${base}/api/me/progress/book-1`, {
					method: 'PATCH',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${localStorage.getItem('token')}`,
					},
					body: JSON.stringify({
						currentTime: 7,
						duration: 13.883375,
						progress: 0.5,
						isFinished: true,
					}),
				})
			}, prefix)
			await page.goto(`${prefix}/new/item/book-1`)
			await expect(
				page.getByRole('table', { name: 'Audio tracks' }),
			).toHaveCount(1)
			await expect(
				page.getByRole('table', { name: 'Audio tracks' }),
			).toBeVisible()
			await expect(
				page.getByRole('table', { name: 'Library files' }),
			).toBeVisible()
			await expect(
				page.getByRole('link', { name: /Download The Glass Orchard/ }),
			).toBeVisible()
			if (role === 'listener')
				await expect(
					page.getByRole('button', { name: /Delete The Glass Orchard/ }),
				).toHaveCount(0)
			else
				await expect(
					page.getByRole('button', { name: /Delete The Glass Orchard/ }),
				).toBeVisible()
			page.once('dialog', (dialog) => dialog.dismiss())
			await page
				.getByRole('button', { name: 'Mark unfinished', exact: true })
				.click()
			await expect(
				page.getByRole('button', { name: 'Mark unfinished', exact: true }),
			).toBeEnabled()
			page.once('dialog', (dialog) => dialog.accept())
			await page
				.getByRole('button', { name: 'Mark unfinished', exact: true })
				.click()
			await expect(
				page.getByRole('button', { name: 'Mark finished', exact: true }),
			).toBeVisible()
			page.once('dialog', (dialog) => dialog.dismiss())
			await page
				.getByRole('button', { name: 'Reset progress', exact: true })
				.click()
			await expect(
				page.getByRole('button', { name: 'Reset progress', exact: true }),
			).toBeVisible()
			page.once('dialog', (dialog) => dialog.accept())
			await page
				.getByRole('button', { name: 'Reset progress', exact: true })
				.click()
			await expect(
				page.getByRole('button', { name: 'Reset progress', exact: true }),
			).toHaveCount(0)
			if (role === 'listener' && !prefix) {
				for (const width of [1280, 390]) {
					await page.setViewportSize({ width, height: 900 })
					for (const theme of ['light', 'dark'] as const) {
						await chooseTheme(page, theme)
						await settleAnimations(page)
						await page.screenshot({
							path: `/private/tmp/opencode/book-detail/${width}-${theme}.png`,
							fullPage: false,
						})
					}
				}
			}
		})
	}
}
