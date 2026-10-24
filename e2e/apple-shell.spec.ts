import { expect, test } from '@playwright/test'
import { chooseTheme, closeSidebar, openSidebar } from './shell-controls'

for (const width of [390, 1280])
	for (const theme of ['light', 'dark'])
		test(`listening shell home ${width} ${theme}`, async ({ page }) => {
			await page.setViewportSize({ width, height: 848 })
			await page.goto('/new/')
			await page.getByLabel('Username', { exact: true }).fill('admin')
			await page.getByLabel('Password', { exact: true }).fill('password')
			await page.getByRole('button', { name: 'Sign in', exact: true }).click()
			await chooseTheme(page, theme)
			await expect(page.getByRole('main')).toHaveCount(1)
			await expect(page.getByRole('main').getByRole('searchbox')).toHaveCount(0)
			await openSidebar(page)
			const home = page
				.getByRole('navigation', { name: 'Library', exact: true })
				.getByRole('link', { name: 'Home', exact: true })
			await expect(home).toHaveAttribute('aria-current', 'page')
			await expect(home.locator('svg')).toHaveCount(1)
			await expect(
				page
					.locator('[data-slot="sidebar-footer"]')
					.getByRole('button', { name: / · Account$/ }),
			).toBeVisible()
			await expect(
				page.getByRole('searchbox', { name: 'Search library', exact: true }),
			).toBeVisible()
			await page.mouse.move(389, 847)
			await expect
				.poll(() =>
					page.getByRole('button', { name: /^Library:/ }).evaluate((node) => {
						const probe = document.createElement('span')
						probe.style.color = 'var(--sidebar-foreground)'
						node.append(probe)
						const expected = getComputedStyle(probe).color
						probe.remove()
						const canvas = document.createElement('canvas')
						canvas.width = canvas.height = 1
						const context = canvas.getContext('2d')
						if (!context) throw new Error('Canvas unavailable')
						const rgb = (color: string) => {
							context.clearRect(0, 0, 1, 1)
							context.fillStyle = color
							context.fillRect(0, 0, 1, 1)
							return Array.from(context.getImageData(0, 0, 1, 1).data).join(',')
						}
						return rgb(getComputedStyle(node).color) === rgb(expected)
					}),
				)
				.toBe(true)
			await closeSidebar(page)
			expect(
				await page.evaluate(
					() => document.documentElement.scrollWidth <= innerWidth,
				),
			).toBe(true)
			await page.screenshot({
				path: `/private/tmp/opencode/apple-ref/out/apple-shell/home-${width}-${theme}.png`,
			})
			if (width < 768) {
				await openSidebar(page)
				expect(
					await page.evaluate(
						() => document.documentElement.scrollWidth <= innerWidth,
					),
				).toBe(true)
				await page.screenshot({
					path: `/private/tmp/opencode/apple-ref/out/apple-shell/sidebar-${width}-${theme}.png`,
				})
			}
		})
