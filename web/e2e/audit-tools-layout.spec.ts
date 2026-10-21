import { expect, test } from '@playwright/test'
import { chooseTheme } from './shell-controls'

test.beforeEach(async ({ page }) => {
	const cdp = await page.context().newCDPSession(page)
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 })
})
for (const width of [390, 1280])
	for (const theme of ['light', 'dark'])
		test(`audit tools layout ${width} ${theme}`, async ({ page }) => {
			// Enable interception before navigation, not in a separate protocol turn
			// immediately before Enter. Under load the chooser can open first.
			const chooser = page.waitForEvent('filechooser')
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
				if (section === 'edit') {
					if (width === 1280) {
						const description = await page
							.getByLabel('Description', { exact: true })
							.boundingBox()
						const authors = await page
							.getByLabel('Authors', { exact: true })
							.boundingBox()
						expect(description).not.toBeNull()
						expect(authors).not.toBeNull()
						expect(
							Math.abs((description?.y ?? 0) - (authors?.y ?? 0)),
						).toBeLessThanOrEqual(1)
					}
					await page
						.getByRole('button', { name: 'Upload cover', exact: true })
						.focus()
					await page.keyboard.press('Enter')
					expect(await (await chooser).element().getAttribute('type')).toBe(
						'file',
					)
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
