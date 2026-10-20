import { expect, test } from '@playwright/test'
import { appMenu, chooseLibrary, chooseTheme } from './shell-controls'

for (const width of [320, 390, 1036, 1280])
	test(`single shell ownership, menu keyboard and sidebar ${width}`, async ({
		page,
	}, testInfo) => {
		await page.setViewportSize({ width, height: 848 })
		await page.goto('/new/')
		await page.getByLabel('Username', { exact: true }).fill('listener')
		await page.getByLabel('Password', { exact: true }).fill('password')
		await page.getByRole('button', { name: 'Sign in', exact: true }).click()
		await expect(appMenu(page)).toBeVisible()
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
			await page.goto(`/new${path}`)
			await expect(
				page.getByRole('searchbox', { name: 'Search library', exact: true }),
			).toHaveCount(1)
			if (width < 768)
				await page
					.getByRole('button', { name: 'Toggle Sidebar', exact: true })
					.click()
			await expect(
				page.getByRole('navigation', { name: 'Library', exact: true }),
			).toHaveCount(1)
			if (path.endsWith('bookshelf'))
				await expect(
					page
						.getByRole('navigation', { name: 'Library', exact: true })
						.getByRole('link', { name: 'Library', exact: true }),
				).toHaveAttribute('aria-current', 'page')
			if (width < 768) {
				await page.keyboard.press('Escape')
				await expect(
					page.getByRole('button', { name: 'Toggle Sidebar', exact: true }),
				).toBeFocused()
			}
			if (path.includes('search?'))
				await expect(page.getByRole('searchbox')).toHaveValue('Garden')
		}
		await appMenu(page).focus()
		await page.keyboard.press('ArrowDown')
		await expect(page.getByRole('menu')).toBeVisible()
		await expect(
			page.getByRole('menuitem', { name: 'Your statistics' }),
		).toBeFocused()
		await page.keyboard.press('ArrowDown')
		await expect(
			page.getByRole('menuitem', { name: / · Account$/ }),
		).toBeFocused()
		await page.keyboard.press('Escape')
		await expect(appMenu(page)).toBeFocused()
		await chooseLibrary(page, 'books')
		await expect(page).toHaveURL(/\/new\/library\/books$/)
		await expect(page.getByRole('searchbox')).toHaveValue('')
		await page.getByRole('searchbox').fill('Glass')
		await page.getByRole('button', { name: 'Search', exact: true }).click()
		await expect(page).toHaveURL(/\/library\/books\/search\?q=Glass$/)
		await expect(page.getByRole('searchbox')).toHaveValue('Glass')
		if (width < 768) {
			await page
				.getByRole('button', { name: 'Toggle Sidebar', exact: true })
				.click()
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
		await expect(appMenu(page)).toBeVisible()
		for (const theme of ['light', 'dark']) {
			await chooseTheme(page, theme)
			await page.reload()
			await expect(page.locator('html')).toHaveClass(
				theme === 'dark' ? /dark/ : /^(?!.*dark)/,
			)
			await appMenu(page).click()
			const colors = await page.getByRole('menu').evaluate((menu) => {
				const root = getComputedStyle(document.documentElement)
				const probe = document.createElement('div')
				probe.style.backgroundColor = root.getPropertyValue('--popover')
				document.body.append(probe)
				const expected = getComputedStyle(probe).backgroundColor
				probe.remove()
				return { actual: getComputedStyle(menu).backgroundColor, expected }
			})
			expect(colors.actual).toBe(colors.expected)
			await page.keyboard.press('Escape')
			if (width >= 768) {
				const sidebarColors = await page
					.locator('[data-slot="sidebar-inner"]')
					.evaluate((sidebar) => {
						const root = getComputedStyle(document.documentElement)
						const probe = document.createElement('div')
						probe.style.backgroundColor = root.getPropertyValue('--sidebar')
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
					(await page.locator('[data-slot="sidebar-container"]').boundingBox())
						?.y,
				).toBe(0)
			await page.screenshot({
				path: testInfo.outputPath(`shell-${width}-${theme}.png`),
			})
		}
	})
