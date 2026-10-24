import { expect, test } from '@playwright/test'
import { signIn, socketControl } from './socket-controls'

for (const prefix of [''])
	test(`download socket lifecycle ${prefix || 'root'}`, async ({ page }) => {
		await signIn(page, prefix, 'admin')
		await page.goto(`${prefix}/library/podcasts/podcast/download-queue`)
		await expect(
			page.getByRole('heading', { name: 'Podcast download queue' }),
		).toBeVisible()
		await expect
			.poll(async () => (await socketControl(page, prefix)).connections)
			.toBe(1)
		const item = {
			id: 'synthetic-download',
			libraryId: 'podcasts',
			libraryItemId: 'podcast-1',
			episodeTitle: 'Synthetic queued episode',
		}
		await socketControl(page, prefix, {
			action: 'queue',
			event: 'episode_download_queued',
			payload: { queue: [item], currentDownload: null },
		})
		await expect(
			page.getByRole('listitem').filter({
				has: page.getByRole('button', { name: 'Clear podcast queue' }),
			}),
		).toContainText(item.episodeTitle)
		await socketControl(page, prefix, {
			action: 'queue',
			event: 'episode_download_started',
			payload: {
				queue: [],
				currentDownload: {
					...item,
					episodeTitle: 'Synthetic downloading episode',
				},
			},
		})
		await expect(
			page.getByRole('listitem').filter({
				has: page.getByRole('button', { name: 'Clear podcast queue' }),
			}),
		).toContainText('Synthetic downloading episode')
		await socketControl(page, prefix, {
			action: 'queue',
			event: 'episode_download_finished',
			payload: { queue: [], currentDownload: null },
		})
		await expect(
			page.getByRole('button', { name: 'Clear podcast queue' }),
		).toHaveCount(0)
		await socketControl(page, prefix, {
			action: 'event',
			event: 'episode_download_finished',
			payload: {
				...item,
				failed: true,
				episodeDisplayTitle: 'Synthetic failed episode',
			},
		})
		await expect(page.getByRole('alert')).toContainText(
			'Download failed: Synthetic failed episode',
		)
		await page.getByRole('button', { name: 'Retry', exact: true }).click()
		await expect(page.getByRole('alert')).toHaveCount(0)
	})
