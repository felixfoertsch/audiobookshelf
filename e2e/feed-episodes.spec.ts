import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { signIn } from './socket-controls'

for (const prefix of ['']) {
	for (const width of [1280, 390]) {
		for (const theme of ['light', 'dark'] as const) {
			test(`feed episode download ${prefix || 'root'} ${width} ${theme}`, async ({
				page,
			}) => {
				await page.setViewportSize({ width, height: 900 })
				await page.emulateMedia({ colorScheme: theme })
				await signIn(page, prefix, 'admin')
				await page.goto(`${prefix}/library/podcasts/podcast/latest`)
				const row = page.getByRole('listitem').filter({
					has: page.getByRole('heading', {
						name: 'Feed-only fixture episode',
					}),
				})
				await expect(
					row.getByRole('button', { name: 'Play Feed-only fixture episode' }),
				).toHaveCount(0)
				await expect(
					row.getByRole('button', {
						name: /player queue|Mark finished|Mark unfinished/,
					}),
				).toHaveCount(0)
				await expect(
					row.getByRole('button', {
						name: 'Download Feed-only fixture episode',
					}),
				).toHaveText('Download')
				await expect(
					row.getByText('Not downloaded', { exact: true }),
				).toBeVisible()
				await expect(
					page.getByText('Downloaded', { exact: true }).first(),
				).toBeVisible()
				mkdirSync('/private/tmp/opencode/feed-episodes', { recursive: true })
				const name = `${prefix ? 'abs' : 'root'}-${width}-${theme}`
				await page.screenshot({
					path: `/private/tmp/opencode/feed-episodes/latest-${name}.png`,
					fullPage: false,
				})
				let posts = 0
				page.on('request', (request) => {
					if (
						request.method() === 'POST' &&
						request.url().endsWith('/download-episodes')
					)
						posts++
				})
				await row
					.getByRole('button', { name: 'Download Feed-only fixture episode' })
					.click()
				await expect(
					row.getByText('Downloading', { exact: true }),
				).toBeVisible()
				await expect(row.getByRole('button')).toHaveCount(0)
				await expect(row.getByRole('status')).toHaveAttribute(
					'aria-live',
					'polite',
				)
				expect(posts).toBe(1)
				await page.screenshot({
					path: `/private/tmp/opencode/feed-episodes/downloading-${name}.png`,
					fullPage: false,
				})
				const token = await page.evaluate(() => localStorage.getItem('token'))
				const absControl =
					process.env.ABS_MOCK_CONTROL_URL || 'http://abs-mock:4179'
				const psbControl =
					process.env.PSB_MOCK_CONTROL_URL || 'http://sidecar-mock:4181'
				const initialState = await page.request.post(
					`${psbControl}/__mock/state`,
					{
						data: { feedComplete: false },
					},
				)
				expect(initialState.ok()).toBe(true)
				const response = await page.request.post(
					`${absControl}/__fixture/feed-complete`,
					{ headers: { authorization: `Bearer ${token}` } },
				)
				expect(response.ok()).toBe(true)
				const sidecarResponse = await page.request.post(
					`${psbControl}/__mock/state`,
					{
						data: { feedComplete: true },
					},
				)
				expect(sidecarResponse.ok()).toBe(true)
				await expect(
					row.getByRole('button', { name: 'Play Feed-only fixture episode' }),
				).toBeEnabled()
				// Restore fixture membership for next viewport/theme run.
				await page.request.delete(`${absControl}/__fixture/feed-complete`, {
					headers: { authorization: `Bearer ${token}` },
				})
				const resetSidecar = await page.request.post(
					`${psbControl}/__mock/state`,
					{
						data: { feedComplete: false },
					},
				)
				expect(resetSidecar.ok()).toBe(true)
			})
		}
	}
	test(`newest shelf includes feed episode ${prefix || 'root'}`, async ({
		page,
	}) => {
		await signIn(page, prefix, 'admin')
		await page.goto(`${prefix}/library/podcasts`)
		const card = page.getByRole('article').filter({
			has: page.getByRole('heading', { name: 'Feed-only fixture episode' }),
		})
		await expect(card).toBeVisible()
		await expect(card.getByRole('link').first()).toHaveAttribute(
			'href',
			`${prefix}/item/podcast-1`,
		)
		await expect(
			card.getByRole('button', { name: 'Play', exact: true }),
		).toHaveCount(0)
		await expect(
			card.getByRole('button', { name: 'Download Feed-only fixture episode' }),
		).toBeEnabled()
	})
	test(`listener sees feed state without download action ${prefix || 'root'}`, async ({
		page,
	}) => {
		await signIn(page, prefix)
		await page.goto(`${prefix}/library/podcasts/podcast/latest`)
		await expect(
			page.getByRole('button', { name: 'Play Feed-only fixture episode' }),
		).toHaveCount(0)
		await expect(
			page.getByText('Not downloaded', { exact: true }),
		).toBeVisible()
		await expect(
			page.getByRole('button', { name: 'Download Feed-only fixture episode' }),
		).toHaveCount(0)
	})
}
