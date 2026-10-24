import { expect, test } from '@playwright/test'

test('sidebar text meets AA over worst-case cover colors', async ({ page }) => {
	await page.goto('/')
	const results = await page.evaluate(() => {
		const canvas = document.createElement('canvas')
		canvas.width = canvas.height = 1
		const ctx = canvas.getContext('2d')
		if (!ctx) throw new Error('Missing canvas context')
		const rgb = (color: string) => {
			ctx.clearRect(0, 0, 1, 1)
			ctx.fillStyle = color
			ctx.fillRect(0, 0, 1, 1)
			return [...ctx.getImageData(0, 0, 1, 1).data].map((v) => v / 255)
		}
		const luminance = (color: number[]) =>
			color
				.slice(0, 3)
				.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
				.reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
		return ['light', 'dark'].map((theme) => {
			document.documentElement.classList.toggle('dark', theme === 'dark')
			const style = getComputedStyle(document.documentElement)
			const background = rgb(style.getPropertyValue('--glass-tint'))
			const foreground = rgb(style.getPropertyValue('--sidebar-foreground'))
			// Black behind light glass and white behind dark glass bound any cover image, even without blur.
			const composite = background
				.slice(0, 3)
				.map(
					(v) =>
						v * background[3] +
						(theme === 'light' ? 0 : 1) * (1 - background[3]),
				)
			const values = [luminance(foreground), luminance(composite)].sort(
				(a, b) => a - b,
			)
			return { theme, contrast: (values[1] + 0.05) / (values[0] + 0.05) }
		})
	})
	console.log(JSON.stringify({ sidebarContrast: results }))
	for (const result of results)
		expect(result.contrast).toBeGreaterThanOrEqual(4.5)
})
