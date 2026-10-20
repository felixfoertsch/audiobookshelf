import { expect, test } from '@playwright/test'

test('theme text colors meet WCAG AA contrast in light and dark modes', async ({
	page,
}) => {
	await page.goto('/new/')
	await expect(
		page.getByRole('button', { name: 'Sign in', exact: true }),
	).toBeVisible()
	const results = await page.evaluate(() => {
		const luminance = (color: string) => {
			const canvas = document.createElement('canvas')
			const context = canvas.getContext('2d')
			if (!context) throw new Error('Canvas unavailable for contrast check')
			context.fillStyle = color
			context.fillRect(0, 0, 1, 1)
			const channels = Array.from(
				context.getImageData(0, 0, 1, 1).data.slice(0, 3),
			).map((value) => {
				const channel = value / 255
				return channel <= 0.04045
					? channel / 12.92
					: ((channel + 0.055) / 1.055) ** 2.4
			})
			return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
		}
		const contrast = (foreground: string, background: string) => {
			const values = [luminance(foreground), luminance(background)].sort(
				(a, b) => b - a,
			)
			return (values[0] + 0.05) / (values[1] + 0.05)
		}
		const themes = []
		for (const mode of ['light', 'dark'] as const) {
			document.documentElement.classList.toggle('dark', mode === 'dark')
			const style = getComputedStyle(document.documentElement)
			const token = (name: string) => style.getPropertyValue(`--${name}`).trim()
			themes.push({
				mode,
				contrasts: {
					primary: contrast(token('primary-foreground'), token('primary')),
					destructive: contrast(
						token('destructive-foreground'),
						token('destructive'),
					),
					foreground: contrast(token('foreground'), token('background')),
					mutedForeground: contrast(
						token('muted-foreground'),
						token('background'),
					),
				},
			})
		}
		return themes
	})
	for (const theme of results) {
		for (const [pair, ratio] of Object.entries(theme.contrasts)) {
			expect(ratio, `${theme.mode} ${pair}`).toBeGreaterThanOrEqual(4.5)
		}
	}
})
