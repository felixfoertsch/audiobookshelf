import type { Locator } from '@playwright/test'

export async function contrast(control: Locator) {
	return control.evaluate((node) => {
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
		const background = Array.from(context.getImageData(0, 0, 1, 1).data).slice(
			0,
			3,
		)
		const foregroundColor = getComputedStyle(node).color
		context.fillStyle = foregroundColor
		context.globalAlpha = ancestors.reduce(
			(alpha, element) => alpha * Number(getComputedStyle(element).opacity),
			1,
		)
		context.fillRect(0, 0, 1, 1)
		const foreground = Array.from(context.getImageData(0, 0, 1, 1).data).slice(
			0,
			3,
		)
		const luminance = (rgb: number[]) =>
			rgb
				.map((x) => x / 255)
				.map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
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
}
