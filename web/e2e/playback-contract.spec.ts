import { readFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import { appMenu } from './shell-controls'

async function login(page: Page, prefix: string) {
	await page.goto(`${prefix}/new/login`)
	await page.getByLabel('Username', { exact: true }).fill('listener')
	await page.getByLabel('Password', { exact: true }).fill('password')
	await page.getByRole('button', { name: 'Sign in', exact: true }).click()
	await expect(appMenu(page).first()).toBeVisible()
}
async function start(page: Page, prefix: string) {
	await login(page, prefix)
	await page.goto(`${prefix}/new/item/podcast-1`)
	await page
		.getByRole('button', { name: 'Play The Quiet Observatory', exact: true })
		.click()
	await expect
		.poll(() =>
			page
				.getByLabel('Audio playback')
				.evaluate((node: HTMLAudioElement) => node.currentTime),
		)
		.toBeGreaterThan(0.1)
}
// Queue same playable episode twice: portable fixture has one downloaded episode.
async function queueEpisode(page: Page) {
	await page.getByRole('button', { name: 'Episode controls' }).first().click()
	await page.getByRole('button', { name: 'Queue', exact: true }).click()
	await page.keyboard.press('Escape')
}
async function action(page: Page, name: string, details = {}) {
	await page.evaluate(
		async ([actionName, data]) => {
			const handlers = (
				navigator.mediaSession as MediaSession & {
					contractHandlers: Record<string, (details: unknown) => void>
				}
			).contractHandlers
			if (!handlers[actionName])
				throw new Error(`Missing MediaSession handler: ${actionName}`)
			handlers[actionName](data)
			await new Promise<void>((resolve) =>
				requestAnimationFrame(() => resolve()),
			)
		},
		[name, details] as const,
	)
}
for (const prefix of ['', '/abs']) {
	test.describe(`${prefix || 'root'} playback contracts`, () => {
		test('MediaSession actions drive real playback and next queued item', async ({
			page,
		}) => {
			await page.addInitScript(() => {
				const handlers: Record<string, MediaSessionActionHandler> = {}
				Object.defineProperty(navigator.mediaSession, 'contractHandlers', {
					value: handlers,
				})
				const original = navigator.mediaSession.setActionHandler.bind(
					navigator.mediaSession,
				)
				navigator.mediaSession.setActionHandler = (name, handler) => {
					if (handler) handlers[name] = handler
					else delete handlers[name]
					original(name, handler)
				}
			})
			await start(page, prefix)
			await queueEpisode(page)
			const audio = page.getByLabel('Audio playback')
			await action(page, 'pause')
			await expect
				.poll(() => audio.evaluate((node: HTMLAudioElement) => node.paused))
				.toBe(true)
			await action(page, 'seekto', { seekTime: 3 })
			await expect
				.poll(() =>
					audio.evaluate((node: HTMLAudioElement) => node.currentTime),
				)
				.toBeCloseTo(3, 0)
			await action(page, 'seekforward', { seekOffset: 2 })
			await expect
				.poll(() =>
					audio.evaluate((node: HTMLAudioElement) => node.currentTime),
				)
				.toBeCloseTo(5, 0)
			await action(page, 'seekbackward', { seekOffset: 2 })
			await expect
				.poll(() =>
					audio.evaluate((node: HTMLAudioElement) => node.currentTime),
				)
				.toBeCloseTo(3, 0)
			await action(page, 'play')
			await expect
				.poll(() =>
					audio.evaluate((node: HTMLAudioElement) => node.currentTime),
				)
				.toBeGreaterThan(3.1)
			const next = page.waitForResponse(
				(response) =>
					response.url().includes('/api/items/podcast-1/play/') &&
					response.ok(),
			)
			await action(page, 'nexttrack')
			await next
			await expect
				.poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentSrc))
				.toContain('/media/podcast-1-ep-1')
		})
		test('forced HLS decodes media and advances currentTime', async ({
			page,
		}) => {
			await page.route('**/api/items/podcast-1/play/*', async (route) => {
				if (!route.request().postDataJSON().forceTranscode) {
					const response = await route.fetch()
					const body = await response.json()
					body.audioTracks[0].contentUrl = `${prefix}/broken-audio`
					await route.fulfill({ response, json: body })
					return
				}
				const response = await route.fetch()
				const body = await response.json()
				body.audioTracks[0] = {
					...body.audioTracks[0],
					contentUrl: `${prefix}/hls/contract.m3u8`,
					mimeType: 'application/vnd.apple.mpegurl',
				}
				await route.fulfill({ response, json: body })
			})
			await page.route('**/hls/contract.m3u8**', (route) =>
				route.fulfill({
					contentType: 'application/vnd.apple.mpegurl',
					body: '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:13\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:12.35025,\nsegment.ts\n#EXT-X-ENDLIST\n',
				}),
			)
			await page.route('**/hls/segment.ts**', (route) =>
				route.fulfill({
					contentType: 'video/mp2t',
					body: readFileSync(
						new URL(
							'./media/tones/field-notes-episode-01.mpegts',
							import.meta.url,
						),
					),
				}),
			)
			await login(page, prefix)
			await page.goto(`${prefix}/new/item/podcast-1`)
			await page
				.getByRole('button', {
					name: 'Play The Quiet Observatory',
					exact: true,
				})
				.click()
			await page
				.getByRole('button', { name: 'Retry with transcoding', exact: true })
				.click()
			await expect
				.poll(() =>
					page
						.getByLabel('Audio playback')
						.evaluate((node: HTMLAudioElement) => node.currentTime),
				)
				.toBeGreaterThan(0.1)
		})
		test('failed progress sync surfaces, retries successfully, finish advances queue', async ({
			page,
		}) => {
			let syncs = 0
			await page.route('**/api/session/*/sync', async (route) => {
				syncs++
				if (syncs === 1)
					await route.fulfill({ status: 503, body: 'sync unavailable' })
				else await route.continue()
			})
			await start(page, prefix)
			await queueEpisode(page)
			const audio = page.getByLabel('Audio playback')
			const failed = page.waitForResponse(
				(response) =>
					response.url().endsWith('/sync') && response.status() === 503,
			)
			await audio.evaluate((node: HTMLAudioElement) => node.pause())
			await failed
			await expect(
				page.getByText('sync unavailable', { exact: false }),
			).toBeVisible()
			const recovered = page.waitForResponse(
				(response) => response.url().endsWith('/sync') && response.ok(),
			)
			await audio.evaluate(async (node: HTMLAudioElement) => {
				await node.play()
				node.pause()
			})
			await recovered
			expect(syncs).toBeGreaterThanOrEqual(2)
			const next = page.waitForResponse(
				(response) =>
					response.url().includes('/api/items/podcast-1/play/') &&
					response.ok(),
			)
			await audio.evaluate(async (node: HTMLAudioElement) => {
				node.currentTime = node.duration - 0.2
				await node.play()
			})
			await next
			await expect
				.poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentSrc))
				.toContain('/media/podcast-1-ep-1')
		})
	})
}
