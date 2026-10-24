import { expect, test } from '@playwright/test'
import { items } from './data'
import { closeSidebar, openSidebar } from './shell-controls'

for (const prefix of ['']) {
	for (const width of [320, 390, 1036, 1280]) {
		for (const colorScheme of ['light', 'dark'] as const) {
			test(`episode progress loop ${prefix || 'root'} ${width} ${colorScheme}`, async ({
				page,
			}, testInfo) => {
				await page.setViewportSize({ width, height: 900 })
				await page.emulateMedia({ colorScheme })
				const source = items.find((item) => item.id === 'podcast-1')
				if (!source) throw new Error('Missing synthetic podcast')
				const progress: {
					libraryItemId: string
					episodeId: string
					isFinished: boolean
					currentTime: number
				}[] = []
				await page.route('**/api/me/progress', (route) =>
					route.fulfill({ json: { mediaProgress: progress } }),
				)
				await page.route('**/api/items/podcast-1?*', (route) =>
					route.fulfill({
						json: {
							...source,
							media: {
								...source.media,
								episodes: Array.from({ length: 27 }, (_, index) => ({
									id: `progress-${index}`,
									title: `Progress episode ${index + 1}`,
									audioFile: { duration: 300 },
									description: 'Synthetic episode description',
								})),
							},
						},
					}),
				)
				await page.route('**/api/me/progress/podcast-1/*', async (route) => {
					const episodeId =
						new URL(route.request().url()).pathname.split('/').at(-1) || ''
					const payload = route.request().postDataJSON()
					expect(Object.keys(payload)).toEqual(['isFinished'])
					const existing = progress.find(
						(entry) => entry.episodeId === episodeId,
					)
					if (existing) {
						existing.isFinished = payload.isFinished
						if (!payload.isFinished) existing.currentTime = 0
					} else
						progress.push({
							libraryItemId: 'podcast-1',
							episodeId,
							isFinished: payload.isFinished,
							currentTime: 0,
						})
					await route.fulfill({ body: 'OK' })
				})
				await page.goto(`${prefix}/`)
				await page.getByLabel('Username', { exact: true }).fill('admin')
				await page.getByLabel('Password', { exact: true }).fill('password')
				await page.getByRole('button', { name: 'Sign in', exact: true }).click()
				await openSidebar(page)
				await expect(
					page.getByRole('searchbox', { name: 'Search library' }),
				).toBeVisible()
				await closeSidebar(page)
				await page.goto(`${prefix}/item/podcast-1`)
				await page
					.getByRole('button', { name: 'Next episodes', exact: true })
					.click()
				const row = page.getByRole('listitem').filter({
					has: page.getByRole('heading', {
						name: 'Progress episode 26',
						exact: true,
					}),
				})
				await expect(row.getByText('Unplayed', { exact: true })).toBeVisible()
				await row
					.getByRole('button', {
						name: 'Mark finished: Progress episode 26',
						exact: true,
					})
					.click()
				await expect(row.getByText('Finished', { exact: true })).toBeVisible()
				await page.goto(`${prefix}/`)
				await page.goto(`${prefix}/item/podcast-1`)
				await page
					.getByRole('button', { name: 'Next episodes', exact: true })
					.click()
				await expect(row.getByText('Finished', { exact: true })).toBeVisible()
				await row
					.getByRole('button', {
						name: 'Mark unfinished: Progress episode 26',
						exact: true,
					})
					.click()
				await expect(row.getByText('Unplayed', { exact: true })).toBeVisible()
				await expect(
					page.getByRole('status').filter({ hasText: '26–27 of 27' }),
				).toBeVisible()
				expect(
					await page.evaluate(
						() => document.documentElement.scrollWidth <= window.innerWidth,
					),
				).toBe(true)
				await page.screenshot({
					path: testInfo.outputPath('progress.png'),
					fullPage: true,
				})
			})
		}
	}
}

test('library selection stays compact until explicit action sheet; cover opens show', async ({
	page,
}) => {
	await page.goto('/')
	await page.getByLabel('Username', { exact: true }).fill('admin')
	await page.getByLabel('Password', { exact: true }).fill('password')
	await page.getByRole('button', { name: 'Sign in', exact: true }).click()
	await page.goto('/library/podcasts/bookshelf')
	await expect(
		page.getByRole('button', { name: 'Select', exact: true }),
	).toBeVisible()
	await expect(page.getByRole('checkbox', { name: /^Select / })).toHaveCount(0)
	await page.getByRole('button', { name: 'Select', exact: true }).click()
	await page
		.getByRole('checkbox', { name: 'Select Field Notes', exact: true })
		.check()
	await expect(page.getByText('1 selected', { exact: true })).toBeVisible()
	await expect(page.getByRole('dialog')).toHaveCount(0)
	await expect(
		page.getByRole('button', {
			name: 'Mark all episodes finished',
			exact: true,
		}),
	).toHaveCount(0)
	await page.getByRole('button', { name: 'More actions', exact: true }).click()
	await expect(
		page.getByRole('dialog', { name: 'More actions', exact: true }),
	).toBeVisible()
	await page.keyboard.press('Escape')
	await page
		.getByRole('region', { name: 'Selection', exact: true })
		.getByRole('button', { name: 'Done', exact: true })
		.click()
	await expect(page.getByRole('checkbox', { name: /^Select / })).toHaveCount(0)
	await page
		.getByRole('link', { name: 'Field Notes', exact: true })
		.locator('img')
		.click()
	await expect(
		page.getByRole('heading', { level: 1, name: 'Field Notes', exact: true }),
	).toBeVisible()
})
