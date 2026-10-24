import { expect, test } from '@playwright/test'
import { closeSidebar, openSidebar } from './shell-controls'

for (const prefix of ['', '/abs']) {
	for (const width of [1280, 390]) {
		for (const colorScheme of ['light', 'dark'] as const) {
			test(`Apple material ${prefix || 'root'} ${width} ${colorScheme}`, async ({
				page,
			}) => {
				await page.setViewportSize({ width, height: 900 })
				await page.emulateMedia({ colorScheme })
				await page.route('**/api/search/providers', (route) =>
					route.fulfill({
						json: {
							providers: { booksCovers: [{ text: 'Google', value: 'google' }] },
						},
					}),
				)
				await page.route('**/api/authorize', async (route) => {
					const response = await route.fetch()
					const body = await response.json()
					await route.fulfill({
						json: {
							...body,
							serverSettings: {
								storeCoverWithItem: false,
								storeMetadataWithItem: false,
								sortingIgnorePrefix: true,
								sortingPrefixes: ['the'],
								scannerParseSubtitle: false,
								scannerFindCovers: false,
								scannerCoverProvider: 'google',
								scannerPreferMatchedMetadata: false,
								scannerDisableWatcher: false,
								chromecastEnabled: false,
								allowIframe: false,
								homeBookshelfView: 0,
								bookshelfView: 0,
								dateFormat: 'yyyy-MM-dd',
								timeFormat: 'HH:mm',
								language: 'en-us',
								allowedOrigins: [],
								...body.serverSettings,
							},
						},
					})
				})
				await page.goto(`${prefix}/new/`)
				await page.getByLabel('Username', { exact: true }).fill('admin')
				await page.getByLabel('Password', { exact: true }).fill('password')
				await page.getByRole('button', { name: 'Sign in', exact: true }).click()
				await expect(page).toHaveURL(/\/library\/podcasts$/)
				const stage = process.env.APPLE_THEME_STAGE || 'after'
				const directory = `/private/tmp/opencode/apple-theme/${stage}/${prefix ? 'abs' : 'root'}/${width}-${colorScheme}`
				for (const [name, route] of [
					['home', '/library/podcasts'],
					['library', '/library/podcasts/bookshelf'],
					['item', '/item/podcast-1'],
					['settings', '/config'],
				]) {
					await page.goto(`${prefix}/new${route}`)
					await expect(
						page.getByRole('heading', { level: 1 }).first(),
					).toBeVisible()
					if (name === 'settings')
						await expect(
							page.getByRole('checkbox', {
								name: 'Store covers with item',
								exact: true,
							}),
						).toBeVisible()
					await page.screenshot({
						path: `${directory}/${name}.png`,
						fullPage: true,
					})
				}
				await openSidebar(page)
				if (stage === 'after') {
					const sidebar = page.locator(
						width === 390
							? '[data-slot="sidebar"][data-mobile="true"]'
							: '[data-slot="sidebar-inner"]',
					)
					await expect(sidebar).toHaveCSS(
						'backdrop-filter',
						'blur(24px) saturate(1.5)',
					)
				}
				await page.screenshot({
					path: `${directory}/sidebar.png`,
					fullPage: true,
				})
				await closeSidebar(page)
			})
		}
	}
}
