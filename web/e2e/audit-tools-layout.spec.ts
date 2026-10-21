import { expect, test } from '@playwright/test'
import { chooseTheme } from './shell-controls'

for (const width of [390, 1280])
	for (const theme of ['light', 'dark'])
		test(`audit tools layout ${width} ${theme}`, async ({ page }) => {
			await page.setViewportSize({ width, height: 848 })
			await page.route('**/abs/api/feeds', (route) =>
				route.fulfill({
					json: {
						feeds: [
							{
								id: 'audit-layout-feed',
								slug: 'audit-layout-feed',
								entityType: 'podcast',
								feedUrl: 'https://example.invalid/abs/feed/audit-layout-feed',
								meta: { title: 'Audit layout feed' },
								episodes: [{ id: 'episode-1', title: 'The Quiet Observatory' }],
							},
						],
					},
				}),
			)
			await page.goto('/abs/new/')
			await page.getByLabel('Username', { exact: true }).fill('admin')
			await page.getByLabel('Password', { exact: true }).fill('password')
			await page.getByRole('button', { name: 'Sign in', exact: true }).click()
			await expect(page).toHaveURL(/\/abs\/new\/library\/podcasts$/)
			await chooseTheme(page, theme)
			for (const section of ['chapters', 'edit', 'manage', 'rss-feeds']) {
				await page.goto(
					section === 'rss-feeds'
						? '/abs/new/config/rss-feeds'
						: `/abs/new/audiobook/book-1/${section}`,
				)
				if (section === 'rss-feeds') {
					await page.getByRole('button', { name: 'Audit layout feed' }).click()
					await expect(page.getByRole('dialog')).toBeVisible()
					await expect(page.getByText('The Quiet Observatory')).toBeVisible()
				} else {
					await expect(
						page.getByRole('heading', { level: 1, name: 'The Glass Orchard' }),
					).toBeVisible()
				}
				await expect
					.poll(() =>
						page.evaluate(
							() => document.documentElement.scrollWidth - innerWidth,
						),
					)
					.toBeLessThanOrEqual(1)
				await page.screenshot({
					path: `/private/tmp/opencode/apple-ref/out/issue4/${section}-${width}-${theme}.png`,
					fullPage: true,
				})
			}
		})
