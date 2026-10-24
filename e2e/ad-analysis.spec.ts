import { expect, test } from '@playwright/test'
import { items } from './data'

for (const prefix of ['']) {
	test(`episode analysis states, tooltip and admin queue use synthetic API ${prefix || '/'}`, async ({
		page,
	}) => {
		const cdp = await page.context().newCDPSession(page)
		await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 })
		const source = items.find((item) => item.id === 'podcast-1')
		if (!source || !('episodes' in source.media))
			throw new Error('Missing podcast fixture')
		const episode = source.media.episodes?.[0]
		await page.route('**/api/items/podcast-1?*', (route) =>
			route.fulfill({
				json: {
					...source,
					media: {
						...source.media,
						episodes: [
							{
								...episode,
								id: 'ads',
								title: 'Three breaks',
								audioFile: {},
							},
							{
								...episode,
								id: 'same',
								title: 'Compared copies',
								audioFile: {},
							},
							{
								...episode,
								id: 'new',
								title: 'Fresh episode',
								audioFile: {},
							},
						],
					},
				},
			}),
		)
		let queued = 0
		const completed = (segments: { start: number; end: number }[]) => ({
			status: 'complete',
			version: 'fixture-v1',
			sourceSha256: 'a'.repeat(64),
			segments,
			adAnalysisEnabled: true,
		})
		const notAnalysed = {
			status: 'disabled',
			version: null,
			sourceSha256: null,
			segments: [],
			adAnalysisEnabled: true,
		}
		await page.route('**/psb/api/items/podcast-1/analysis', (route) =>
			route.fulfill({
				json: {
					episodes: {
						ads: completed([
							{ start: 2, end: 5 },
							{ start: 10, end: 20 },
							{ start: 30, end: 40 },
						]),
						same: completed([]),
						new: notAnalysed,
					},
				},
			}),
		)
		await page.route(
			'**/psb/api/items/podcast-1/episodes/new/analysis/enqueue',
			(route) => {
				queued++
				return route.fulfill({ status: 202, json: { queued: true } })
			},
		)
		await page.goto(`${prefix}/`)
		await page.getByLabel('Username', { exact: true }).fill('admin')
		await page.getByLabel('Password', { exact: true }).fill('password')
		await page.getByRole('button', { name: 'Sign in', exact: true }).click()
		await expect(
			page.getByRole('searchbox', { name: 'Search library' }),
		).toBeVisible()
		await page.goto(`${prefix}/item/podcast-1`)
		await expect(
			page.getByRole('img', {
				name: 'Inserted audio found: 3 breaks, 23 seconds',
			}),
		).toBeVisible()
		const same = page.getByRole('img', { name: 'No inserted ads found' })
		// Focus can scroll the row into view; Radix closes tooltips on that scroll.
		await same.scrollIntoViewIfNeeded()
		// Scroll events arrive before the next rendering frame, after the scroll command returns.
		await page.evaluate(
			() =>
				new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
		)
		await same.focus()
		await expect(page.getByRole('tooltip')).toContainText(
			'Shared or baked-in ads can remain undetected',
		)
		await page
			.getByRole('button', { name: 'Not analysed', exact: true })
			.click()
		await expect(
			page.getByRole('img', { name: 'Analysis queued' }),
		).toBeVisible()
		expect(queued).toBe(1)
		await page.route('**/psb/api/items/podcast-1/analysis', (route) =>
			route.fulfill({
				json: {
					episodes: {
						new: {
							status: 'complete',
							version: 'fixture-v1',
							sourceSha256: 'b'.repeat(64),
							segments: [],
							adAnalysisEnabled: true,
						},
					},
				},
			}),
		)
		await expect(
			page.getByRole('img', { name: 'No inserted ads found' }),
		).toHaveCount(2)
	})
}
