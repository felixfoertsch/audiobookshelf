import { expect, test } from '@playwright/test'

for (const prefix of ['']) {
	test(`native home-screen metadata scoped to ${prefix || 'root'} preview`, async ({
		page,
	}) => {
		await page.goto(`${prefix}/login`)
		const mount = new URL(`${prefix}/`, page.url()).href
		const manifestUrl = await page
			.locator('link[rel="manifest"]')
			.evaluate((link: HTMLLinkElement) => link.href)
		expect(manifestUrl).toBe(new URL('manifest.webmanifest', mount).href)
		const response = await page.request.get(manifestUrl)
		expect(response.status()).toBe(200)
		expect(response.headers()['content-type']).toMatch(
			/(?:manifest\+json|application\/json)/,
		)
		const manifest = await response.json()
		for (const field of ['id', 'start_url', 'scope'])
			expect(new URL(manifest[field], manifestUrl).href).toBe(mount)
		expect(manifest.display).toBe('standalone')
		for (const size of [192, 512]) {
			const icon = manifest.icons.find(
				(entry: { sizes: string }) => entry.sizes === `${size}x${size}`,
			)
			expect(icon).toBeTruthy()
			const source = new URL(icon.src, manifestUrl).href
			expect(source.startsWith(mount)).toBe(true)
			const image = await page.request.get(source)
			expect(image.status()).toBe(200)
			expect(image.headers()['content-type']).toMatch(/image\/png/)
			const dimensions = await page.evaluate(async (url) => {
				const image = new Image()
				image.src = url
				await image.decode()
				return [image.naturalWidth, image.naturalHeight]
			}, source)
			expect(dimensions).toEqual([size, size])
		}
		await expect(
			page.locator('meta[name="apple-mobile-web-app-capable"]'),
		).toHaveAttribute('content', 'yes')
		await expect(
			page.locator('meta[name="apple-mobile-web-app-status-bar-style"]'),
		).toHaveAttribute('content', 'black-translucent')
		const apple = await page
			.locator('link[rel="apple-touch-icon"]')
			.evaluate((link: HTMLLinkElement) => link.href)
		expect(apple.startsWith(mount)).toBe(true)
		expect((await page.request.get(apple)).status()).toBe(200)
		await expect(page.locator('meta[name="viewport"]')).not.toHaveAttribute(
			'content',
			/user-scalable=no|maximum-scale=1(?:\.0)?(?:,|$)/,
		)
		// No service worker: home-screen metadata must not introduce private API/audio caches.
		expect(
			await page.evaluate(async () => ({
				workers: (await navigator.serviceWorker.getRegistrations()).length,
				caches: await caches.keys(),
			})),
		).toEqual({ workers: 0, caches: [] })
		// Metadata/asset checks are not Safari installation UI or offline evidence.
	})
}
