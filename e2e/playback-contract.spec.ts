import { readFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import { contrast } from './contrast'
import { appMenu, chooseTheme, settleAnimations } from './shell-controls'

async function login(page: Page, prefix: string) {
	await page.goto(`${prefix}/login`)
	await page.getByLabel('Username', { exact: true }).fill('listener')
	await page.getByLabel('Password', { exact: true }).fill('password')
	await page.getByRole('button', { name: 'Sign in', exact: true }).click()
	await expect(appMenu(page).first()).toBeVisible()
}
async function start(page: Page, prefix: string) {
	await login(page, prefix)
	await page.goto(`${prefix}/item/podcast-1`)
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
for (const prefix of ['']) {
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
			await page.route('**/api/items/podcast-1/analysis', (route) =>
				route.fulfill({
					json: {
						episodes: {
							'podcast-1-ep-0': {
								status: 'candidates',
								version: 'fixture-v1',
								sourceSha256: 'a'.repeat(64),
								segments: [{ start: 4, end: 10 }],
								adAnalysisEnabled: true,
								applicable: true,
							},
						},
					},
				}),
			)
			await page.route('**/api/items/podcast-1/play/*', async (route) => {
				const response = await route.fetch()
				const body = await response.json()
				if (!route.request().postDataJSON().forceTranscode) {
					body.audioTracks[0].contentUrl = `${prefix}/broken-audio`
				} else {
					body.audioTracks[0] = {
						...body.audioTracks[0],
						contentUrl: `${prefix}/hls/contract.m3u8`,
						mimeType: 'application/vnd.apple.mpegurl',
					}
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
			await page.goto(`${prefix}/item/podcast-1`)
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
			const audio = page.getByLabel('Audio playback')
			const progress = page.getByRole('slider', { name: 'Playback progress' })
			const time = () =>
				audio.evaluate((node: HTMLAudioElement) => node.currentTime)
			const options = async () => {
				await page.getByRole('button', { name: 'More player actions' }).click()
				await page.getByRole('menuitem', { name: 'Player options' }).click()
			}
			const seek = async (seconds: number) => {
				await audio.evaluate((node: HTMLAudioElement) => node.pause())
				await progress.focus()
				await page.keyboard.press('Home')
				for (let i = 0; i < seconds; i++)
					await page.keyboard.press('ArrowRight')
			}
			await expect(page.getByTestId('segment-marker')).toBeVisible()
			await expect(progress).toHaveAccessibleDescription(
				/Detected segment ranges: 0:04–0:10/,
			)
			const measureMarker = async () =>
				page.getByTestId('segment-marker').evaluate((node: HTMLElement) => {
					const bounds = node.getBoundingClientRect()
					const slider = document.querySelector(
						'[role="slider"][aria-label="Playback progress"]',
					)
					if (!slider) throw new Error('Playback progress slider missing')
					const trackElement = slider
						.closest('[data-slot="slider"]')
						?.querySelector('[data-slot="slider-track"]')
					if (!(trackElement instanceof HTMLElement))
						throw new Error('Playback progress track missing')
					const track = trackElement.getBoundingClientRect()
					const total = Number(slider.getAttribute('aria-valuemax'))
					return {
						start: bounds.left - track.left,
						end: bounds.right - track.left,
						expectedStart: (4 / total) * track.width,
						expectedEnd: (10 / total) * track.width,
					}
				})
			for (const width of [390, 1280]) {
				await page.setViewportSize({ width, height: 900 })
				const geometry = await measureMarker()
				expect(
					Math.abs(geometry.start - geometry.expectedStart),
				).toBeLessThanOrEqual(1)
				expect(
					Math.abs(geometry.end - geometry.expectedEnd),
				).toBeLessThanOrEqual(1)
			}
			await seek(3)
			await audio.evaluate((node: HTMLAudioElement) => node.play())
			await expect.poll(time).toBeGreaterThanOrEqual(10)
			await seek(5)
			await audio.evaluate((node: HTMLAudioElement) => node.play())
			await expect.poll(time).toBeGreaterThan(5.3)
			expect(await time()).toBeLessThan(10)
			await options()
			await page.getByLabel('Auto-skip detected segments').uncheck()
			await page.keyboard.press('Escape')
			await seek(3)
			await audio.evaluate((node: HTMLAudioElement) => node.play())
			await expect.poll(time).toBeGreaterThan(4.3)
			expect(await time()).toBeLessThan(10)
			await audio.evaluate((node: HTMLAudioElement) => node.pause())
			for (const theme of ['light', 'dark']) {
				await chooseTheme(page, theme)
				await settleAnimations(page)
				const track = await contrast(
					page.locator('[data-slot="slider-track"]').first(),
					'backgroundColor',
				)
				const marker = await contrast(
					page.getByTestId('segment-marker'),
					'backgroundColor',
					'[data-slot="slider-track"]',
				)
				console.log(JSON.stringify({ theme, track, marker }))
				expect(track.ratio, `${theme} track/background`).toBeGreaterThanOrEqual(
					3,
				)
				expect(marker.ratio, `${theme} marker/track`).toBeGreaterThanOrEqual(3)
				const gap = await page
					.getByTestId('segment-marker')
					.evaluate(
						(node) =>
							node.getBoundingClientRect().top -
							(document
								.querySelector('[data-slot="slider-track"]')
								?.getBoundingClientRect().bottom ?? Infinity),
					)
				expect(gap).toBeGreaterThanOrEqual(0)
				await page.screenshot({
					path: `/private/tmp/opencode/player-segments/player-markers${prefix ? '-abs' : ''}-${theme}.png`,
				})
			}
			await page.reload()
			await page
				.getByRole('button', {
					name: 'Play The Quiet Observatory',
					exact: true,
				})
				.click()
			await options()
			await expect(
				page.getByLabel('Auto-skip detected segments'),
			).not.toBeChecked()
		})
		test('audiobook routes retain progress and send direct then forced HLS requests', async ({
			page,
		}) => {
			const playRequests: string[] = []
			const syncRequests: string[] = []
			page.on('request', (request) => {
				const pathname = new URL(request.url()).pathname
				if (
					request.method() === 'POST' &&
					pathname.includes('/api/items/book-1/play')
				)
					playRequests.push(request.postData() ?? '')
				if (pathname.endsWith('/sync'))
					syncRequests.push(request.postData() ?? '')
			})
			await login(page, prefix)
			await page.goto(`${prefix}/item/book-1`)
			await page
				.getByRole('button', { name: 'Play audiobook', exact: true })
				.click()
			const audio = page.getByLabel('Audio playback')
			await expect
				.poll(() =>
					audio.evaluate((node: HTMLAudioElement) => node.currentTime),
				)
				.toBeGreaterThan(0.1)
			await audio.evaluate((node: HTMLAudioElement) => {
				node.pause()
				node.currentTime = 5
			})
			await page
				.getByRole('link', { name: 'Audiobookshelf', exact: true })
				.click()
			await expect(audio).toBeAttached()
			await expect
				.poll(() =>
					audio.evaluate((node: HTMLAudioElement) => node.currentTime),
				)
				.toBeGreaterThanOrEqual(5)
			await audio.evaluate((node: HTMLAudioElement) => node.play())
			await expect.poll(() => syncRequests.length).toBeGreaterThan(0)
			await page.route('**/api/items/book-1/play', async (route) => {
				const response = await route.fetch()
				const body = await response.json()
				const forced = route.request().postDataJSON().forceTranscode
				body.audioTracks[0].contentUrl = forced
					? `${prefix}/audiobook-hls.m3u8`
					: `${prefix}/broken-audio`
				if (forced)
					body.audioTracks[0].mimeType = 'application/vnd.apple.mpegurl'
				await route.fulfill({ response, json: body })
			})
			await page.route('**/audiobook-hls.m3u8**', (route) =>
				route.fulfill({
					contentType: 'application/vnd.apple.mpegurl',
					body: '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:13\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:12.35025,\nsegment.ts\n#EXT-X-ENDLIST\n',
				}),
			)
			await page.route('**/segment.ts**', (route) =>
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
			await page.reload()
			await page.goto(`${prefix}/item/book-1`)
			const hlsResponse = page.waitForResponse(
				(response) =>
					response.url().endsWith('/api/items/book-1/play') && response.ok(),
			)
			await page
				.getByRole('button', { name: 'Play audiobook', exact: true })
				.click()
			await hlsResponse
			await page
				.getByRole('button', { name: 'Retry with transcoding', exact: true })
				.click()
			await expect
				.poll(() =>
					audio.evaluate((node: HTMLAudioElement) => node.currentTime),
				)
				.toBeGreaterThan(0.1)
			await audio.evaluate((node: HTMLAudioElement) => node.pause())
			await expect.poll(() => syncRequests.length).toBeGreaterThan(1)
			expect(
				playRequests.map((body) => JSON.parse(body).forceTranscode),
			).toEqual([false, false, true])
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
