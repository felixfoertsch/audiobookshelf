import { expect, test } from '@playwright/test'
import {
	appMenu,
	chooseTheme,
	openPlayerOptions,
	openSidebar,
} from './shell-controls'

for (const width of [320, 390])
	for (const theme of ['light', 'dark']) {
		test(`bookmark label and input ${width} ${theme}`, async ({
			page,
		}, testInfo) => {
			await page.setViewportSize({ width, height: 844 })
			await page.goto('/login')
			await page.getByLabel('Username', { exact: true }).fill('listener')
			await page.getByLabel('Password', { exact: true }).fill('password')
			await page.getByRole('button', { name: 'Sign in', exact: true }).click()
			await openSidebar(page)
			await expect(appMenu(page).first()).toBeVisible()
			await page.goto('/item/book-1')
			await chooseTheme(page, theme)
			const assertTheme = async () => {
				expect(
					await page.evaluate(() => localStorage.getItem('abs-modern-theme')),
				).toBe(theme)
				const colors = await page.evaluate(() => {
					const root = document.documentElement
					const background = getComputedStyle(document.body).backgroundColor
					const canvas = document.createElement('canvas')
					const context = canvas.getContext('2d')
					if (!context) throw new Error('Canvas color observation unavailable')
					context.fillStyle = background
					context.fillRect(0, 0, 1, 1)
					return {
						dark: root.classList.contains('dark'),
						rootBackground: getComputedStyle(root)
							.getPropertyValue('--background')
							.trim(),
						background,
						rgba: Array.from(context.getImageData(0, 0, 1, 1).data),
					}
				})
				expect(colors.dark).toBe(theme === 'dark')
				expect(colors.rgba[3]).toBe(255)
				for (const channel of colors.rgba.slice(0, 3)) {
					if (theme === 'dark') expect(channel).toBeLessThan(40)
					else expect(channel).toBeGreaterThan(230)
				}
				return colors
			}
			await assertTheme()
			await page
				.getByRole('button', { name: 'Play audiobook', exact: true })
				.click()
			const audio = page.getByLabel('Audio playback')
			await expect
				.poll(() =>
					audio.evaluate((node: HTMLAudioElement) => node.currentTime),
				)
				.toBeGreaterThan(0)
			await openPlayerOptions(page)
			await page
				.getByText('Chapters, bookmarks, queue and settings', { exact: true })
				.click()
			const input = page.getByRole('textbox', {
				name: 'Bookmark title',
				exact: true,
			})
			await input.scrollIntoViewIfNeeded()
			await expect(input).toBeVisible()
			const label = page.locator('label[for="player-bookmark-title"]')
			await expect(label).toBeVisible()
			expect(
				await input.evaluate((node: HTMLInputElement) =>
					Array.from(node.labels || []).some(
						(label) => label.textContent?.trim() === 'Bookmark title',
					),
				),
			).toBe(true)
			await label.click()
			await expect(input).toBeFocused()
			await page.keyboard.type(`Bookmark ${width} ${theme}`)
			await expect(input).toHaveValue(`Bookmark ${width} ${theme}`)
			await page.keyboard.press('Tab')
			await expect(
				page.getByRole('button', { name: 'Add bookmark', exact: true }),
			).toBeFocused()
			const bounds = await input.boundingBox()
			expect(bounds).not.toBeNull()
			if (!bounds) throw new Error('Bookmark input missing bounds')
			expect(bounds.x).toBeGreaterThanOrEqual(0)
			expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
			expect(
				await page.evaluate(
					() => document.documentElement.scrollWidth <= innerWidth,
				),
			).toBe(true)
			const colors = await assertTheme()
			console.log(`bookmark ${width} ${theme}: ${JSON.stringify(colors)}`)
			await page.screenshot({
				path: testInfo.outputPath(`bookmark-${width}-${theme}.png`),
				fullPage: true,
			})
		})
	}
