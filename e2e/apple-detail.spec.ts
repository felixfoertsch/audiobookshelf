import { expect, test } from '@playwright/test'
import { items } from './data'

for (const width of [390, 1280]) {
	for (const colorScheme of ['light', 'dark'] as const) {
		test(`detail presentation ${width} ${colorScheme}`, async ({ page }) => {
			await page.setViewportSize({ width, height: 1000 })
			await page.emulateMedia({ colorScheme })
			const show = items.find((item) => item.id === 'podcast-1')
			if (!show || !('episodes' in show.media))
				throw new Error('Missing podcast fixture')
			const episodes = show.media.episodes
			await page.route('**/api/libraries/podcasts/recent-episodes?*', (route) =>
				route.fulfill({
					json: {
						episodes: episodes.map((episode) => ({
							...episode,
							libraryItemId: show.id,
							podcast: { metadata: show.media.metadata },
						})),
					},
				}),
			)
			await page.goto('/')
			await page.getByLabel('Username', { exact: true }).fill('listener')
			await page.getByLabel('Password', { exact: true }).fill('password')
			await page.getByRole('button', { name: 'Sign in', exact: true }).click()
			await expect(page).toHaveURL(/\/library\/podcasts$/)
			for (const [name, route] of [
				['podcast', '/item/podcast-1'],
				['latest', '/library/podcasts/podcast/latest'],
				['audiobook', '/item/book-1'],
			]) {
				await page.goto(route)
				await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
				if (name === 'latest')
					await expect(
						page.getByRole('heading', {
							name: 'The Quiet Observatory',
							exact: true,
						}),
					).toBeVisible()
				if (name !== 'latest')
					await expect(
						page.getByRole('heading', { name: 'Information' }),
					).toBeVisible()
				expect(
					await page.evaluate(
						() => document.documentElement.scrollWidth <= window.innerWidth,
					),
				).toBe(true)
				await page.screenshot({
					path: `/private/tmp/opencode/apple-ref/out/apple-detail/${name}-${width}-${colorScheme}.png`,
					fullPage: true,
				})
			}
		})
	}
}
