import { expect, test } from '@playwright/test'
import { appMenu, openPlayerOptions } from './shell-controls'

// SDK boundary only. Real DOM geometry, session API and player code remain live.
const sender = `(() => {
 let media = null, remote;
 const session = { getCastDevice: () => ({ friendlyName: 'Geometry receiver' }), getMediaSession: () => media, loadMedia: async request => { media = { media: request.queueData.items[0].media }; remote.currentTime = request.currentTime; remote.isMediaLoaded = true; } };
 const context = { setOptions() {}, getCurrentSession: () => session, addEventListener() {}, removeEventListener() {}, endCurrentSession() {} };
 class QueueData { constructor(id, title, description, repeat, items) { this.items = items; } }
 window.cast = { framework: { CastContext: { getInstance: () => context }, RemotePlayer: class { constructor() { remote = this; this.currentTime = 0; this.isPaused = true; this.volumeLevel = 1; } }, RemotePlayerController: class { addEventListener() {} removeEventListener() {} stop() {} seek() {} }, CastContextEventType: {}, RemotePlayerEventType: {} } };
 window.chrome = { ...window.chrome, cast: { AutoJoinPolicy: { ORIGIN_SCOPED: 'ORIGIN_SCOPED' }, media: { MediaInfo: class {}, MusicTrackMediaMetadata: class {}, QueueItem: class { constructor(media) { this.media = media; } }, QueueData, LoadRequest: class {}, QueueType: {} } } };
 customElements.define('google-cast-launcher', class extends HTMLElement {});
 window.__onGCastApiAvailable(true);
})();`

for (const prefix of ['', '/abs']) {
	test(`local compact and expanded timeline pixel geometry ${prefix || 'root'}`, async ({
		page,
	}) => {
		await page.goto(`${prefix}/new/login`)
		await page.getByLabel('Username', { exact: true }).fill('listener')
		await page.getByLabel('Password', { exact: true }).fill('password')
		await page.getByRole('button', { name: 'Sign in', exact: true }).click()
		await expect(appMenu(page).first()).toBeVisible()
		await page.goto(`${prefix}/new/item/podcast-1`)
		await page
			.getByRole('button', { name: 'Play The Quiet Observatory', exact: true })
			.click()
		await page
			.getByLabel('Audio playback')
			.evaluate((audio: HTMLAudioElement) => audio.pause())
		for (const expanded of [false, true]) {
			if (expanded) await openPlayerOptions(page)
			for (const width of [390, 1280]) {
				await page.setViewportSize({ width, height: 900 })
				const geometry = await page
					.locator('[role="slider"][aria-label="Playback progress"]')
					.evaluate((slider) => {
						const root = slider.closest('[data-slot="slider"]')
						const track = root?.querySelector('[data-slot="slider-track"]')
						const marker = root?.parentElement?.querySelector(
							'[data-testid="segment-marker"]',
						)
						if (!track || !marker)
							throw new Error('Missing local timeline geometry')
						const a = track.getBoundingClientRect(),
							b = marker.getBoundingClientRect()
						const total = Number(slider.getAttribute('aria-valuemax'))
						return {
							start: b.left - a.left,
							end: b.right - a.left,
							expectedStart: (2.1 / total) * a.width,
							expectedEnd: (3.8 / total) * a.width,
						}
					})
				expect(
					Math.abs(geometry.start - geometry.expectedStart),
				).toBeLessThanOrEqual(1)
				expect(
					Math.abs(geometry.end - geometry.expectedEnd),
				).toBeLessThanOrEqual(1)
			}
		}
	})
	test(`Cast compact and expanded timeline pixel geometry ${prefix || 'root'}`, async ({
		page,
	}) => {
		await page.route('https://www.gstatic.com/**', (route) =>
			route.fulfill({ contentType: 'application/javascript', body: sender }),
		)
		for (const path of ['/login', '/api/authorize', '/auth/refresh'])
			await page.route(
				(url) => url.pathname === `${prefix}${path}`,
				async (route) => {
					const response = await route.fetch()
					if (!response.ok()) return route.fulfill({ response })
					const body = await response.json()
					await route.fulfill({
						response,
						json: {
							...body,
							serverSettings: {
								...body.serverSettings,
								chromecastEnabled: true,
							},
						},
					})
				},
			)
		await page.goto(`${prefix}/new/login`)
		await page.getByLabel('Username', { exact: true }).fill('listener')
		await page.getByLabel('Password', { exact: true }).fill('password')
		await page.route('**/api/items/podcast-1/play/*', async (route) => {
			const response = await route.fetch()
			const body = await response.json()
			body.playMethod = 0
			body.mediaType = 'podcast'
			body.audioTracks = body.audioTracks.map(
				(track: object, index: number) => ({
					...track,
					index,
					title: 'Fixture episode',
					mimeType: 'audio/wav',
					startOffset: 0,
				}),
			)
			await route.fulfill({ response, json: body })
		})
		await page.getByRole('button', { name: 'Sign in', exact: true }).click()
		await expect(appMenu(page).first()).toBeVisible()
		await page.goto(`${prefix}/new/item/podcast-1`)
		await page
			.getByRole('button', { name: 'Play The Quiet Observatory', exact: true })
			.click()
		await page
			.getByLabel('Audio playback')
			.evaluate((audio: HTMLAudioElement) => audio.pause())
		const measure = async (name: string) => {
			const result = await page
				.locator(`[role="slider"][aria-label="${name}"]`)
				.evaluate((slider) => {
					const root = slider.closest('[data-slot="slider"]')
					const track = root?.querySelector('[data-slot="slider-track"]')
					const marker = root?.parentElement?.querySelector(
						'[data-testid="segment-marker"]',
					)
					if (!track || !marker) throw new Error('Missing timeline geometry')
					const a = track.getBoundingClientRect(),
						b = marker.getBoundingClientRect()
					const total = Number(slider.getAttribute('aria-valuemax'))
					return {
						start: b.left - a.left,
						end: b.right - a.left,
						expectedStart: (2.1 / total) * a.width,
						expectedEnd: (3.8 / total) * a.width,
					}
				})
			expect(Math.abs(result.start - result.expectedStart)).toBeLessThanOrEqual(
				1,
			)
			expect(Math.abs(result.end - result.expectedEnd)).toBeLessThanOrEqual(1)
		}
		for (const width of [390, 1280]) {
			await page.setViewportSize({ width, height: 900 })
			await measure('Playback progress')
		}
		await openPlayerOptions(page)
		await expect(
			page.getByRole('button', { name: 'Return to local' }),
		).toBeVisible()
		for (const width of [390, 1280]) {
			await page.setViewportSize({ width, height: 900 })
			await measure('Seek position')
			await expect(
				page.getByRole('slider', { name: 'Seek position', exact: true }),
			).toHaveAttribute('aria-describedby', /.+/)
			await measure('Playback progress')
		}
	})
}
