import { expect, test } from '@playwright/test'
import { chooseTheme, settleAnimations } from './shell-controls'

for (const base of ['', '/abs']) {
	for (const width of [1280, 390]) {
		test(`podcast search modal traps focus and supports history ${base || 'root'} ${width}`, async ({
			page,
		}) => {
			await page.setViewportSize({ width, height: 900 })
			await page.goto(`${base}/new/`)
			await page.getByLabel('Username', { exact: true }).fill('admin')
			await page.getByLabel('Password', { exact: true }).fill('password')
			await page.getByRole('button', { name: 'Sign in', exact: true }).click()
			await expect(
				page.getByRole('heading', { name: 'Home', exact: true }),
			).toBeVisible()
			await page.goto(`${base}/new/library/podcasts`)
			if (width === 390)
				await page
					.getByRole('button', { name: 'Toggle Sidebar', exact: true })
					.click()
			await page.getByRole('link', { name: 'Add podcast', exact: true }).click()
			const modal = page.getByRole('dialog', {
				name: 'Add podcast',
				exact: true,
			})
			await expect(modal).toBeVisible()
			await expect(modal.getByLabel('Podcast name or RSS URL')).toBeVisible()
			await page.keyboard.press('Shift+Tab')
			await expect
				.poll(() =>
					page.evaluate(
						() => document.activeElement?.closest('[role="dialog"]') !== null,
					),
				)
				.toBe(true)
			await page.keyboard.press('Escape')
			await expect(modal).toHaveCount(0)
			if (width === 1280)
				await expect(
					page.getByRole('link', { name: 'Add podcast', exact: true }),
				).toBeFocused()
			await expect(page).toHaveURL(
				new RegExp(`${base}/new/library/podcasts/?$`),
			)
			await page.goForward()
			await expect(modal).toBeVisible()
			await page.goto(`${base}/new/library/podcasts/podcast/search`)
			await expect(modal).toBeVisible()
		})
	}
}

for (const width of [1280, 390])
	for (const theme of ['light', 'dark']) {
		test(`podcast UX captures ${width} ${theme}`, async ({ page }) => {
			await page.setViewportSize({ width, height: 1000 })
			await page.goto('/new/')
			await page.getByLabel('Username', { exact: true }).fill('admin')
			await page.getByLabel('Password', { exact: true }).fill('password')
			await page.getByRole('button', { name: 'Sign in', exact: true }).click()
			await expect(
				page.getByRole('heading', { name: 'Home', exact: true }),
			).toBeVisible()
			await chooseTheme(page, theme)
			for (const [name, path] of [
				['home', '/library/podcasts'],
				['library', '/library/podcasts/bookshelf'],
				['latest', '/library/podcasts/podcast/latest'],
				['search', '/library/podcasts/podcast/search'],
			]) {
				await page.goto(`/new${path}`)
				await expect(
					page.getByRole('heading', {
						name:
							name === 'search'
								? 'Find podcasts'
								: name === 'home'
									? 'Home'
									: name === 'latest'
										? 'Latest episodes'
										: 'Library',
						exact: true,
					}),
				).toBeVisible()
				await settleAnimations(page)
				await page.screenshot({
					path: `/private/tmp/opencode/podcast-ux/${name}-${width}-${theme}.png`,
					fullPage: name !== 'latest',
				})
			}
		})
	}
