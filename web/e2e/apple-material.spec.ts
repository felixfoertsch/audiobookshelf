import { expect, test } from '@playwright/test'

for (const prefix of ['', '/abs']) {
	test(`glass bounds and accessibility ${prefix || 'root'}`, async ({
		page,
	}) => {
		await page.goto(`${prefix}/new/`)
		await expect(page.getByLabel('Username', { exact: true })).toBeVisible()
		const results = await page.evaluate(() => {
			const canvas = document.createElement('canvas')
			canvas.width = canvas.height = 1
			const ctx = canvas.getContext('2d')
			if (!ctx) throw new Error('Canvas unavailable')
			const rgb = (color: string) => {
				ctx.clearRect(0, 0, 1, 1)
				ctx.fillStyle = color
				ctx.fillRect(0, 0, 1, 1)
				return Array.from(ctx.getImageData(0, 0, 1, 1).data)
			}
			const luminance = (channels: number[]) =>
				channels.slice(0, 3).reduce((sum, value, index) => {
					const n = value / 255
					return (
						sum +
						(n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4) *
							[0.2126, 0.7152, 0.0722][index]
					)
				}, 0)
			const ratio = (a: number[], b: number[]) =>
				(Math.max(luminance(a), luminance(b)) + 0.05) /
				(Math.min(luminance(a), luminance(b)) + 0.05)
			return ['light', 'dark'].map((mode) => {
				document.documentElement.classList.toggle('dark', mode === 'dark')
				const style = getComputedStyle(document.documentElement)
				const token = (name: string) =>
					rgb(style.getPropertyValue(`--${name}`).trim())
				const tint = token('glass-tint')
				// Any blurred/saturated artwork channel lies in [0, 255]. Endpoints bound luminance.
				const backgrounds = [0, 255].map((value) =>
					tint
						.slice(0, 3)
						.map(
							(channel) =>
								(channel * tint[3]) / 255 + value * (1 - tint[3] / 255),
						),
				)
				return {
					mode,
					text: Math.min(
						...backgrounds.map((bg) => ratio(token('sidebar-foreground'), bg)),
					),
					selection: ratio(
						token('sidebar-accent-foreground'),
						token('sidebar-accent'),
					),
					focus: Math.min(
						...backgrounds.map((bg) => ratio(token('sidebar-ring'), bg)),
						ratio(token('sidebar-ring'), token('sidebar-accent')),
					),
				}
			})
		})
		console.log(JSON.stringify(results))
		for (const result of results) {
			expect(result.text).toBeGreaterThanOrEqual(4.5)
			expect(result.selection).toBeGreaterThanOrEqual(4.5)
			expect(result.focus).toBeGreaterThanOrEqual(3)
		}
		const session = await page.context().newCDPSession(page)
		for (const feature of [
			{ name: 'prefers-reduced-transparency', value: 'reduce' },
			{ name: 'prefers-contrast', value: 'more' },
		]) {
			await session.send('Emulation.setEmulatedMedia', { features: [feature] })
			for (const dark of [false, true]) {
				const material = await page.evaluate((dark) => {
					document.documentElement.classList.toggle('dark', dark)
					const probe = document.createElement('div')
					probe.dataset.slot = 'popover-content'
					document.body.append(probe)
					const style = getComputedStyle(probe)
					const result = {
						color: style.backgroundColor,
						filter: style.backdropFilter,
					}
					probe.remove()
					return result
				}, dark)
				expect(material.color).toBe(
					dark ? 'rgb(30, 30, 34)' : 'rgb(248, 248, 250)',
				)
				expect(material.filter).toContain('blur(0px)')
			}
		}
	})
}
