import { expect, test } from '@playwright/test'
import { items } from './data'

for (const width of [390, 1280]) {
	for (const colorScheme of ['light', 'dark'] as const) {
		test(`integrated listening layout ${width} ${colorScheme}`, async ({
			page,
		}) => {
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
			for (const [name, path] of [
				['home', '/library/podcasts'],
				['library', '/library/podcasts/bookshelf'],
				['podcast', '/item/podcast-1'],
				['latest', '/library/podcasts/podcast/latest'],
				['playing', '/item/podcast-1'],
			]) {
				await page.goto(path)
				await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
				if (name === 'podcast') {
					const unavailable = page.getByRole('button', {
						name: 'Play A Map of Rain',
						exact: true,
					})
					await expect(unavailable).toBeDisabled()
					await expect(unavailable).toHaveAttribute(
						'title',
						'Episode audio is not downloaded',
					)
				}
				if (name === 'playing') {
					await page
						.getByRole('button', { name: 'Play latest episode' })
						.click()
					const player = page.getByRole('region', { name: 'Audio player' })
					await expect(player).toBeVisible()
					await expect(page.locator('audio')).toHaveCount(1)
					const bounds = await player.boundingBox()
					const content = await page
						.locator('[data-slot="sidebar-inset"]')
						.boundingBox()
					if (!bounds || !content) throw new Error('Missing layout bounds')
					expect(
						Math.abs(
							bounds.x + bounds.width / 2 - (content.x + content.width / 2),
						),
					).toBeLessThan(1)
					if (width >= 768) expect(bounds.x).toBeGreaterThanOrEqual(content.x)
				}
				expect(
					await page.evaluate(
						() => document.documentElement.scrollWidth <= window.innerWidth,
					),
				).toBe(true)
				await page.screenshot({
					path: `/private/tmp/opencode/apple-ref/out/integrated/${name}-${width}-${colorScheme}.png`,
					fullPage: true,
				})
			}
		})
	}
}
