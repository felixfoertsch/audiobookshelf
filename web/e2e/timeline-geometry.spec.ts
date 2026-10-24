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
		await page.route('**/api/items/podcast-1/play/*', async (route) => {
			const response = await route.fetch()
			const body = await response.json()
			body.chapters = [
				{ id: 0, title: 'Before', start: 0, end: 2.5 },
				{ id: 1, title: 'Clip both edges', start: 2.5, end: 3.5 },
				{ id: 2, title: 'After', start: 4, end: body.duration },
			]
			await route.fulfill({ response, json: body })
		})
		await page
			.getByRole('button', { name: 'Close player', exact: true })
			.click()
		await expect(page.getByLabel('Audio playback')).toHaveCount(0)
		await page
			.getByRole('button', { name: 'Play The Quiet Observatory', exact: true })
			.click()
		await page
			.getByLabel('Audio playback')
			.evaluate((a: HTMLAudioElement) => a.pause())
		if (
			!(await page.getByRole('dialog', { name: 'Player options' }).isVisible())
		)
			await openPlayerOptions(page)
		await page.getByLabel('Audio playback').evaluate((a: HTMLAudioElement) => {
			a.currentTime = 3
			a.dispatchEvent(new Event('timeupdate'))
		})
		await page
			.getByText('Chapters, bookmarks, queue and settings', { exact: true })
			.click()
		await page.getByLabel('Chapter timeline', { exact: true }).check()
		for (const width of [390, 1280]) {
			await page.setViewportSize({ width, height: 900 })
			await page
				.getByRole('button', { name: '0:02 Clip both edges', exact: true })
				.click()
			await expect(
				page.locator('[role="slider"][aria-label="Playback progress"]'),
			).toHaveAttribute('aria-valuemax', '1')
			const rect = await page
				.locator('[role="slider"][aria-label="Playback progress"]')
				.evaluate((slider) => {
					const root = slider.closest('[data-slot="slider"]')
					const track = root?.querySelector('[data-slot="slider-track"]')
					const marker = root?.parentElement?.querySelector(
						'[data-testid="segment-marker"]',
					)
					if (!track || !marker)
						throw new Error('Missing clipped marker geometry')
					const a = track.getBoundingClientRect(),
						b = marker.getBoundingClientRect()
					return {
						left: Math.abs(a.left - b.left),
						right: Math.abs(a.right - b.right),
					}
				})
			expect(rect.left).toBeLessThanOrEqual(1)
			expect(rect.right).toBeLessThanOrEqual(1)
		}
		await page.getByRole('button', { name: '0:04 After', exact: true }).click()
		await expect(page.getByTestId('segment-marker')).toHaveCount(0)
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
			body.chapters = [
				{ id: 0, title: 'Clipped Cast chapter', start: 0, end: 3 },
				{ id: 1, title: 'Rest', start: 3, end: body.duration },
			]
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
		const measure = async (name: string, chapter = false) => {
			const result = await page
				.locator(`[role="slider"][aria-label="${name}"]`)
				.evaluate((slider, chapter) => {
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
						expectedEnd: ((chapter ? 3 : 3.8) / total) * a.width,
					}
				}, chapter)
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
		await page
			.getByText('Chapters, bookmarks, queue and settings', { exact: true })
			.click()
		await page.getByLabel('Chapter timeline', { exact: true }).check()
		for (const width of [390, 1280]) {
			await page.setViewportSize({ width, height: 900 })
			await expect(
				page.locator('[role="slider"][aria-label="Seek position"]'),
			).toHaveAttribute('aria-valuemax', '3')
			await measure('Playback progress', true)
			await measure('Seek position', true)
		}
	})
}
