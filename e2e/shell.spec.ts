import { expect, test } from '@playwright/test'
import {
	appMenu,
	chooseLibrary,
	chooseTheme,
	closeSidebar,
	openPlayerOptions,
	openSidebar,
} from './shell-controls'

for (const prefix of ['']) {
	for (const width of [320, 390, 1036, 1280])
		test(`single shell ownership, menu keyboard and sidebar ${width} ${prefix || 'root'}`, async ({
			page,
		}, testInfo) => {
			await page.setViewportSize({ width, height: 848 })
			await page.goto(`${prefix}/`)
			await page.getByLabel('Username', { exact: true }).fill('listener')
			await page.getByLabel('Password', { exact: true }).fill('password')
			await page.getByRole('button', { name: 'Sign in', exact: true }).click()
			await openSidebar(page)
			await expect(appMenu(page)).toBeVisible()
			await closeSidebar(page)
			await expect(page.getByRole('main')).toHaveCount(1)
			await expect(
				page.getByRole('link', { name: 'Skip to content' }),
			).toHaveAttribute('href', '#content')
			await expect(page.locator('#content')).toHaveCount(1)
			const classic = page.getByRole('link', {
				name: 'Open Classic',
				exact: true,
			})
			await expect(classic).toBeVisible()
			await expect(classic).toBeInViewport()
			await classic.click({ trial: true })
			for (const path of [
				'/library/podcasts',
				'/library/podcasts/bookshelf',
				'/library/podcasts/search?q=Garden',
			]) {
				await page.goto(`${prefix}${path}`)
				await openSidebar(page)
				await expect(
					page.getByRole('searchbox', { name: 'Search library', exact: true }),
				).toHaveCount(1)
				await expect(
					page.getByRole('navigation', { name: 'Library', exact: true }),
				).toHaveCount(1)
				if (path.endsWith('bookshelf'))
					await expect(
						page
							.getByRole('navigation', { name: 'Library', exact: true })
							.getByRole('link', { name: 'Library', exact: true }),
					).toHaveAttribute('aria-current', 'page')
				if (path.includes('search?'))
					await expect(page.getByRole('searchbox')).toHaveValue('Garden')
				if (width < 768) {
					await page.keyboard.press('Escape')
					await expect(
						page.getByRole('button', { name: 'Toggle Sidebar', exact: true }),
					).toBeFocused()
				}
			}
			await openSidebar(page)
			await appMenu(page).focus()
			await page.keyboard.press('ArrowDown')
			await expect(page.getByRole('menu')).toBeVisible()
			await expect(
				page.getByRole('menuitem', { name: 'User settings' }),
			).toBeFocused()
			await page.keyboard.press('ArrowDown')
			await expect(
				page.getByRole('menuitemradio', { name: 'System', exact: true }),
			).toBeFocused()
			await page.keyboard.press('Escape')
			await expect(appMenu(page)).toBeFocused()
			await chooseLibrary(page, 'books')
			await expect(page).toHaveURL(/\/library\/books$/)
			await openSidebar(page)
			await expect(page.getByRole('searchbox')).toHaveValue('')
			await page.getByRole('searchbox').fill('Glass')
			await page.getByRole('searchbox').press('Enter')
			await expect(page).toHaveURL(/\/library\/books\/search\?q=Glass$/)
			await openSidebar(page)
			await expect(page.getByRole('searchbox')).toHaveValue('Glass')
			if (width < 768) {
				await page
					.getByRole('navigation', { name: 'Library', exact: true })
					.getByRole('link', { name: 'Home', exact: true })
					.click()
				await expect(page.getByRole('dialog')).toHaveCount(0)
			}
			await page.route('**/auth/refresh', async (route) => {
				const response = await route.fetch()
				const data = await response.json()
				await route.fulfill({
					response,
					json: {
						...data,
						user: { ...data.user, username: 'Long listener name '.repeat(30) },
					},
				})
			})
			await page.route('**/api/libraries', async (route) => {
				const response = await route.fetch()
				const data = await response.json()
				await route.fulfill({
					response,
					json: {
						...data,
						libraries: data.libraries.map(
							(library: { id: string; name: string }) => ({
								...library,
								name: library.name.repeat(30),
							}),
						),
					},
				})
			})
			await page.reload()
			await openSidebar(page)
			await expect(appMenu(page)).toBeVisible()
			for (const theme of ['light', 'dark']) {
				await chooseTheme(page, theme)
				await page.reload()
				await expect(page.locator('html')).toHaveClass(
					theme === 'dark' ? /dark/ : /^(?!.*dark)/,
				)
				await openSidebar(page)
				await appMenu(page).click()
				const colors = await page.getByRole('menu').evaluate((menu) => {
					const root = getComputedStyle(document.documentElement)
					const probe = document.createElement('div')
					probe.style.backgroundColor = root.getPropertyValue('--glass-tint')
					document.body.append(probe)
					const expected = getComputedStyle(probe).backgroundColor
					probe.remove()
					return { actual: getComputedStyle(menu).backgroundColor, expected }
				})
				expect(colors.actual).toBe(colors.expected)
				await page.keyboard.press('Escape')
				await closeSidebar(page)
				if (width >= 768) {
					const sidebarColors = await page
						.locator('[data-slot="sidebar-inner"]')
						.evaluate((sidebar) => {
							const root = getComputedStyle(document.documentElement)
							const probe = document.createElement('div')
							probe.style.backgroundColor =
								root.getPropertyValue('--glass-tint')
							document.body.append(probe)
							const expected = getComputedStyle(probe).backgroundColor
							probe.remove()
							return {
								actual: getComputedStyle(sidebar).backgroundColor,
								expected,
							}
						})
					expect(sidebarColors.actual).toBe(sidebarColors.expected)
				}
				expect(
					await page.evaluate(
						() => document.documentElement.scrollWidth <= window.innerWidth,
					),
				).toBe(true)
				await page.evaluate(() => window.scrollTo(0, 0))
				if (width >= 768)
					expect(
						(
							await page
								.locator('[data-slot="sidebar-container"]')
								.boundingBox()
						)?.y,
					).toBe(0)
				await page.screenshot({
					path: testInfo.outputPath(`shell-${width}-${theme}.png`),
				})
			}
		})
}

for (const prefix of [''])
	test(`200% reflow and rendered glass contrast ${prefix || 'root'}`, async ({
		page,
	}) => {
		// 1280px desktop at 200% zoom has a 640 CSS-pixel layout viewport.
		await page.setViewportSize({ width: 640, height: 450 })
		await page.goto(`${prefix}/`)
		await page.getByLabel('Username', { exact: true }).fill('listener')
		await page.getByLabel('Password', { exact: true }).fill('password')
		await page.getByRole('button', { name: 'Sign in', exact: true }).click()
		await openSidebar(page)
		await appMenu(page).click()
		await expect(
			page.getByRole('menuitem', { name: 'User settings' }),
		).toBeInViewport()
		await page.keyboard.press('Escape')
		await expect(appMenu(page)).toBeFocused()
		await closeSidebar(page)
		await expect(
			page.getByRole('button', { name: 'Toggle Sidebar', exact: true }),
		).toBeFocused()
		await page
			.getByRole('link', { name: /^Field Notes/ })
			.first()
			.click()
		await page
			.getByRole('button', { name: 'Play latest episode', exact: true })
			.first()
			.click()
		const player = page.getByRole('region', {
			name: 'Audio player',
			exact: true,
		})
		await expect(player).toBeVisible()
		await player.getByRole('button', { name: 'Pause', exact: true }).click()
		for (const theme of ['light', 'dark']) {
			await chooseTheme(page, theme)
			for (const control of await player.getByRole('button').all()) {
				if (await control.isVisible()) {
					await expect(control).toBeInViewport({ ratio: 1 })
					await control.click({ trial: true })
				}
			}
			await expect(
				player.getByRole('slider', { name: 'Playback progress' }),
			).toBeInViewport({ ratio: 1 })
			// Use the real surface and the flat page backdrop beneath it, not theme tokens.
			const contrast = await player.evaluate((surface) => {
				const canvas = document.createElement('canvas')
				canvas.width = canvas.height = 1
				const context = canvas.getContext('2d')
				if (!context) throw new Error('Canvas unavailable for contrast check')
				const rgba = (color: string) => {
					context.clearRect(0, 0, 1, 1)
					context.fillStyle = color
					context.fillRect(0, 0, 1, 1)
					return Array.from(context.getImageData(0, 0, 1, 1).data)
				}
				const blend = (front: number[], back: number[]) =>
					front
						.slice(0, 3)
						.map(
							(v, i) => (v * front[3]) / 255 + back[i] * (1 - front[3] / 255),
						)
				const luminance = (rgb: number[]) =>
					rgb
						.map((v) => {
							const c = v / 255
							return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
						})
						.reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0)
				const style = getComputedStyle(surface)
				const fill = rgba(style.backgroundColor)
				const rect = surface.getBoundingClientRect()
				// Temporarily remove the fixed overlay to discover the actual painted backdrop.
				const previous = (surface as HTMLElement).style.visibility
				;(surface as HTMLElement).style.visibility = 'hidden'
				let under = document.elementFromPoint(
					rect.x + rect.width / 2,
					rect.bottom - 2,
				)
				const layers: number[][] = []
				while (under) {
					const layer = getComputedStyle(under)
					if (layer.backgroundImage !== 'none')
						throw new Error('Contrast sample requires a flat backdrop')
					layers.push(rgba(layer.backgroundColor))
					under = under.parentElement
				}
				;(surface as HTMLElement).style.visibility = previous
				let backdrop = [255, 255, 255]
				for (const layer of layers.reverse()) backdrop = blend(layer, backdrop)
				const background = blend(fill, backdrop)
				const text = surface.querySelector('[role="timer"]')
				if (!text) throw new Error('Player text missing')
				const foreground = blend(rgba(getComputedStyle(text).color), background)
				const values = [luminance(foreground), luminance(background)].sort(
					(a, b) => b - a,
				)
				return {
					alpha: fill[3] / 255,
					ratio: (values[0] + 0.05) / (values[1] + 0.05),
					blur: style.backdropFilter,
				}
			})
			expect(contrast.alpha).toBeGreaterThan(0)
			expect(contrast.alpha).toBeLessThan(1)
			expect(contrast.blur).not.toBe('none')
			expect(
				contrast.ratio,
				`${theme} rendered player text`,
			).toBeGreaterThanOrEqual(4.5)
			await openPlayerOptions(page)
			const dialog = page.getByRole('dialog', {
				name: 'Player options',
				exact: true,
			})
			await expect(dialog).toBeInViewport()
			for (const control of await dialog.getByRole('button').all()) {
				if (await control.isVisible()) {
					await control.scrollIntoViewIfNeeded()
					await expect(control).toBeInViewport({ ratio: 1 })
				}
			}
			await page.keyboard.press('Escape')
			await expect(dialog).toHaveCount(0)
			await expect(
				player.getByRole('button', { name: 'Player options', exact: true }),
			).toBeFocused()
			expect(
				await page.evaluate(
					() => document.documentElement.scrollWidth <= innerWidth,
				),
			).toBe(true)
		}
	})
