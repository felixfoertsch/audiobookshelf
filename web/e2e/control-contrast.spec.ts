import { expect, test } from '@playwright/test'
import { appMenu, chooseTheme } from './shell-controls'

for (const theme of ['light', 'dark']) {
	test(`player and sidebar control contrast ${theme}`, async ({ page }) => {
		await page.goto('/new/login')
		await page.getByLabel('Username', { exact: true }).fill('listener')
		await page.getByLabel('Password', { exact: true }).fill('password')
		await page.getByRole('button', { name: 'Sign in', exact: true }).click()
		await expect(appMenu(page)).toBeVisible()
		await page.goto('/new/item/podcast-1')
		await page
			.getByRole('button', { name: 'Play The Quiet Observatory', exact: true })
			.click()
		await page
			.getByLabel('Audio playback')
			.evaluate((audio: HTMLAudioElement) => audio.pause())
		await chooseTheme(page, theme)
		// Finish real theme transitions before measuring final rendered colours.
		await page.evaluate(async () => {
			await Promise.all(
				document
					.getAnimations()
					.filter(
						(animation) =>
							animation.effect?.getTiming().iterations !== Infinity,
					)
					.map((animation) => animation.finished.catch(() => {})),
			)
		})
		const controls = [
			['speed', page.getByRole('button', { name: 'Playback rate' }), 4.5],
			[
				'back',
				page.getByRole('button', { name: 'Skip back 15 seconds', exact: true }),
				4.5,
			],
			['play', page.getByRole('button', { name: 'Play', exact: true }), 3],
			[
				'forward',
				page.getByRole('button', { name: 'Skip forward 30 seconds' }),
				4.5,
			],
			['more', page.getByRole('button', { name: 'More player actions' }), 3],
			['volume', page.getByRole('button', { name: 'Volume', exact: true }), 3],
			['library', page.getByRole('button', { name: /^Library:/ }), 4.5],
			['user', page.getByRole('button', { name: /listener · Menu/ }), 4.5],
			[
				'More link',
				page.getByRole('button', { name: 'More', exact: true }),
				4.5,
			],
			[
				'description',
				page
					.getByRole('button', { name: 'Read description', exact: true })
					.first(),
				4.5,
			],
		] as const
		for (const [name, control, minimum] of controls) {
			await expect(control).toBeVisible()
			const result = await control.evaluate((node) => {
				const canvas = document.createElement('canvas')
				canvas.width = canvas.height = 1
				const context = canvas.getContext('2d')
				if (!context) throw new Error('Canvas unavailable')
				const ancestors: Element[] = []
				for (
					let element: Element | null = node;
					element;
					element = element.parentElement
				)
					ancestors.unshift(element)
				context.fillStyle = 'white'
				context.fillRect(0, 0, 1, 1)
				for (const element of ancestors) {
					context.fillStyle = getComputedStyle(element).backgroundColor
					context.fillRect(0, 0, 1, 1)
				}
				const background = Array.from(
					context.getImageData(0, 0, 1, 1).data,
				).slice(0, 3)
				const foregroundColor = getComputedStyle(node).color
				context.fillStyle = foregroundColor
				context.fillRect(0, 0, 1, 1)
				const foreground = Array.from(
					context.getImageData(0, 0, 1, 1).data,
				).slice(0, 3)
				const luminance = (rgb: number[]) =>
					rgb
						.map((x) => x / 255)
						.map((x) =>
							x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4,
						)
						.reduce((sum, x, i) => sum + x * [0.2126, 0.7152, 0.0722][i], 0)
				const a = luminance(foreground),
					b = luminance(background)
				return {
					foreground,
					background,
					foregroundColor,
					ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
				}
			})
			console.log(JSON.stringify({ theme, name, ...result }))
			expect(result.ratio, `${theme} ${name}`).toBeGreaterThanOrEqual(minimum)
		}
		await page.screenshot({
			path: `/private/tmp/opencode/player-segments/${process.env.CONTRAST_LABEL || 'branch'}-controls-${theme}.png`,
		})
	})
}
