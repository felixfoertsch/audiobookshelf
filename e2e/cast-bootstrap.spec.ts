import { expect, test } from '@playwright/test'
import { appMenu, signOut } from './shell-controls'

const sender = `(() => {
 const state = window.__castEvidence = { options: [], ended: 0, stopped: 0 };
 const session = { getCastDevice: () => ({ friendlyName: 'Local mock receiver' }), getMediaSession: () => null };
 const context = { setOptions: options => state.options.push(options), getCurrentSession: () => session, addEventListener() {}, removeEventListener() {}, endCurrentSession() { state.ended++ } };
 window.cast = { framework: { CastContext: { getInstance: () => context }, RemotePlayer: class {}, RemotePlayerController: class { addEventListener() {} removeEventListener() {} stop() { state.stopped++ } }, CastContextEventType: {}, RemotePlayerEventType: {} } };
 window.chrome = { ...window.chrome, cast: { AutoJoinPolicy: { ORIGIN_SCOPED: 'ORIGIN_SCOPED' } } };
 customElements.define('google-cast-launcher', class extends HTMLElement {});
 window.__onGCastApiAvailable(true);
})();`
for (const prefix of [''])
	for (const enabled of [false, true]) {
		test(`authenticated Cast bootstrap ${prefix || 'root'} enabled=${enabled}`, async ({
			page,
		}) => {
			let sdkRequests = 0
			const errors: string[] = []
			page.on('pageerror', (error) => errors.push(error.message))
			await page.route('https://www.gstatic.com/**', async (route) => {
				expect(route.request().url()).toBe(
					'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1',
				)
				sdkRequests++
				await route.fulfill({
					contentType: 'application/javascript',
					body: sender,
					headers: { 'access-control-allow-origin': '*' },
				})
			})
			for (const path of ['/login', '/api/authorize', '/auth/refresh'])
				await page.route(
					(url) => url.pathname === `${prefix}${path}`,
					async (route) => {
						expect(route.request().method()).toBe('POST')
						const response = await route.fetch()
						if (path === '/auth/refresh' && response.status() === 401) {
							await route.fulfill({ response })
							return
						}
						expect(response.ok()).toBe(true)
						const body = await response.json()
						expect(body.user.id).toBeTruthy()
						await route.fulfill({
							response,
							json: {
								...body,
								serverSettings: {
									...body.serverSettings,
									chromecastEnabled: enabled,
								},
							},
						})
					},
				)
			await page.goto(`${prefix}/login`)
			expect(sdkRequests).toBe(0)
			await expect(page.locator('script[src*="cast_sender.js"]')).toHaveCount(0)
			await page.getByLabel('Username', { exact: true }).fill('listener')
			await page.getByLabel('Password', { exact: true }).fill('password')
			await page.getByRole('button', { name: 'Sign in', exact: true }).click()
			await page.waitForURL(`${prefix}/library/podcasts`)
			await expect(appMenu(page).first()).toBeVisible()
			if (enabled) {
				// Login uses location.assign: sender may start in outgoing document too.
				await expect.poll(() => sdkRequests).toBeGreaterThanOrEqual(1)
				await expect(page.locator('script[src*="cast_sender.js"]')).toHaveCount(
					1,
				)
				expect(errors).toEqual([])
				await expect
					.poll(() =>
						page.evaluate(() =>
							Boolean(
								(window as unknown as { __castEvidence?: unknown })
									.__castEvidence,
							),
						),
					)
					.toBe(true)
				expect(errors).toEqual([])
				await expect(page.getByLabel('Choose Cast device')).toBeVisible()
				await expect(
					page.getByText('Cast connected: Local mock receiver', {
						exact: true,
					}),
				).toBeVisible()
				expect(
					await page.evaluate(
						() =>
							(window as unknown as { __castEvidence: { options: unknown[] } })
								.__castEvidence.options,
					),
				).toEqual([
					{
						receiverApplicationId: 'FD1F76C5',
						autoJoinPolicy: 'ORIGIN_SCOPED',
					},
				])
				expect(sdkRequests).toBeLessThanOrEqual(2)
			} else {
				await expect(page.getByLabel('Choose Cast device')).toHaveCount(0)
				expect(sdkRequests).toBe(0)
			}
			await signOut(page)
			await expect(appMenu(page)).toHaveCount(0)
			expect(errors).toEqual([])
			await expect
				.poll(() => page.evaluate(() => localStorage.getItem('token')))
				.toBeNull()
			await expect(page.locator('script[src*="cast_sender.js"]')).toHaveCount(0)
			await expect(page.getByLabel('Choose Cast device')).toHaveCount(0)
			if (enabled) {
				expect(
					await page.evaluate(
						() =>
							(window as unknown as { __castEvidence: { stopped: number } })
								.__castEvidence.stopped,
					),
				).toBeGreaterThan(0)
				expect(
					await page.evaluate(
						() =>
							(window as unknown as { __castEvidence: { ended: number } })
								.__castEvidence.ended,
					),
				).toBeGreaterThan(0)
			}
		})
	}
