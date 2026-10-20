import { expect, type Locator, type Page, test } from '@playwright/test'
import { appMenu } from './shell-controls'

async function openReader(page: Page, id: string) {
	await page.goto('/new/')
	await expect(
		page
			.getByRole('button', { name: 'Sign in', exact: true })
			.or(appMenu(page)),
	).toBeVisible()
	if (await page.getByLabel('Username', { exact: true }).isVisible()) {
		await page.getByLabel('Username', { exact: true }).fill('listener')
		await page.getByLabel('Password', { exact: true }).fill('password')
		const login = page.waitForResponse(
			(response) =>
				new URL(response.url()).pathname.endsWith('/login') &&
				response.request().method() === 'POST' &&
				response.ok(),
		)
		await page.getByRole('button', { name: 'Sign in', exact: true }).click()
		await login
		await expect(appMenu(page)).toBeVisible()
	}
	await page.goto(`/new/item/${id}`)
	await page.getByRole('button', { name: 'Read ebook', exact: true }).click()
	await expect(page.getByRole('dialog', { name: 'Ebook reader' })).toBeVisible()
}
async function paintedCanvas(canvas: Locator) {
	await expect
		.poll(() =>
			canvas.evaluate((element: HTMLCanvasElement) => {
				const context = element.getContext('2d')
				if (!context || !element.width || !element.height) return 0
				// Original PDF has black text on white paper. Transparent defaults/blank white pages cannot pass.
				const pixels = context.getImageData(
					0,
					0,
					element.width,
					element.height,
				).data
				let ink = 0
				for (let index = 0; index < pixels.length; index += 4)
					if (
						pixels[index + 3] > 200 &&
						pixels[index] < 100 &&
						pixels[index + 1] < 100 &&
						pixels[index + 2] < 100
					)
						ink++
				return ink
			}),
		)
		.toBeGreaterThan(20)
}
function progressWrites(page: Page, id: string) {
	const writes: { ebookLocation: string | number; ebookProgress?: number }[] =
		[]
	page.on('request', (request) => {
		if (
			request.method() === 'PATCH' &&
			new URL(request.url()).pathname.endsWith(`/api/me/progress/${id}`)
		)
			writes.push(request.postDataJSON())
	})
	return writes
}

test('EPUB real rendering, TOC search, CFI save and restore', async ({
	page,
}) => {
	const writes = progressWrites(page, 'read-epub')
	await openReader(page, 'read-epub')
	await expect(
		page
			.frameLocator('iframe')
			.first()
			.getByText('First chapter. Searchable amber fox.', { exact: true })
			.first(),
	).toBeVisible()
	await page
		.getByRole('button', { name: 'Table of contents', exact: true })
		.click()
	await page
		.getByRole('button', { name: 'Second chapter', exact: true })
		.click()
	await expect(
		page
			.frameLocator('iframe')
			.first()
			.getByText('Second chapter. Searchable cobalt bird.', { exact: true })
			.first(),
	).toBeVisible()
	await expect.poll(() => writes.at(-1)?.ebookLocation).toMatch(/^epubcfi\(/)
	await page
		.getByRole('button', { name: 'Table of contents', exact: true })
		.click()
	await page.getByLabel('Search ebook').fill('cobalt')
	await page
		.getByRole('dialog', { name: 'Ebook reader' })
		.getByRole('button', { name: 'Search', exact: true })
		.click()
	await expect(
		page.getByText('Second chapter', { exact: true }).first(),
	).toBeVisible()
	await page
		.getByRole('button', { name: /Searchable cobalt bird/ })
		.first()
		.click()
	await page
		.getByRole('button', { name: 'Reader settings', exact: true })
		.click()
	const settings = page.getByRole('dialog', {
		name: 'Reader settings',
		exact: true,
	})
	await settings.getByLabel('Theme', { exact: true }).selectOption('sepia')
	await settings.getByLabel('Font family').selectOption('sans-serif')
	await settings.getByLabel('Layout').selectOption('none')
	await page.getByRole('button', { name: 'Close settings' }).click()
	await page.getByRole('button', { name: 'Next page', exact: true }).click()
	await expect.poll(() => writes.length).toBeGreaterThan(1)
	const saved = writes.at(-1)?.ebookLocation
	await page.getByRole('button', { name: 'Close reader' }).click()
	await page.getByRole('button', { name: 'Read ebook', exact: true }).click()
	await expect
		.poll(() =>
			page.frameLocator('iframe').first().locator('body').textContent(),
		)
		.toContain('Second chapter')
	await expect.poll(() => writes.at(-1)?.ebookLocation).toBe(saved)
})

test('PDF real canvas changes on page two; zoom and invalid page guard', async ({
	page,
}) => {
	const writes = progressWrites(page, 'read-pdf')
	await openReader(page, 'read-pdf')
	const canvas = page.getByLabel('PDF page 1', { exact: true })
	await paintedCanvas(canvas)
	const first = await canvas.evaluate((element: HTMLCanvasElement) =>
		element.toDataURL(),
	)
	await page.getByLabel('PDF page', { exact: true }).fill('1.5')
	await expect(page.getByLabel('PDF page 1', { exact: true })).toBeVisible()
	expect(writes).toHaveLength(0)
	await page.getByLabel('PDF page', { exact: true }).fill('2')
	const second = page.getByLabel('PDF page 2', { exact: true })
	await paintedCanvas(second)
	await expect
		.poll(() =>
			second.evaluate((element: HTMLCanvasElement, previous: string) => {
				const context = element.getContext('2d')
				if (!context) return false
				const pixels = context.getImageData(
					0,
					0,
					element.width,
					element.height,
				).data
				let ink = 0
				for (let index = 0; index < pixels.length; index += 4)
					if (pixels[index + 3] > 200 && pixels[index] < 100) ink++
				return ink > 20 && element.toDataURL() !== previous
			}, first),
		)
		.toBe(true)
	await expect.poll(() => writes.at(-1)?.ebookLocation).toBe(2)
	const width = await second.evaluate(
		(element: HTMLCanvasElement) => element.width,
	)
	await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
	await expect
		.poll(() => second.evaluate((element: HTMLCanvasElement) => element.width))
		.toBeGreaterThan(width)
})

test('comic selected image navigation/download and object URL cleanup', async ({
	page,
}) => {
	await page.addInitScript(() => {
		const original = URL.revokeObjectURL.bind(URL)
		Object.assign(window, { readerRevoked: [] as string[] })
		URL.revokeObjectURL = (url) => {
			;(window as unknown as { readerRevoked: string[] }).readerRevoked.push(
				url,
			)
			original(url)
		}
	})
	await openReader(page, 'read-comic')
	const first = page.getByAltText('pages/page2.png', { exact: true })
	await expect
		.poll(() =>
			first.evaluate((element: HTMLImageElement) => element.naturalWidth),
		)
		.toBeGreaterThan(0)
	const firstUrl = await first.getAttribute('src')
	const download = page.waitForEvent('download')
	await page.getByRole('link', { name: 'Download image' }).click()
	expect((await download).suggestedFilename()).toContain('page2')
	await page.getByRole('button', { name: 'Next page', exact: true }).click()
	await expect
		.poll(() =>
			page
				.getByAltText('pages/page10.png', { exact: true })
				.evaluate((element: HTMLImageElement) => element.naturalWidth),
		)
		.toBeGreaterThan(0)
	await expect
		.poll(() =>
			page.evaluate(
				() => (window as unknown as { readerRevoked: string[] }).readerRevoked,
			),
		)
		.toContain(firstUrl)
	const current = await page
		.getByAltText('pages/page10.png', { exact: true })
		.getAttribute('src')
	await page.getByRole('button', { name: 'Close reader' }).click()
	await expect
		.poll(() =>
			page.evaluate(
				() => (window as unknown as { readerRevoked: string[] }).readerRevoked,
			),
		)
		.toContain(current)
})

test('malformed MOBI image reports error instead of hanging blank', async ({
	page,
}) => {
	await openReader(page, 'read-mobi-broken')
	await expect(page.getByRole('alert')).not.toBeEmpty()
	await expect(
		page.getByRole('button', { name: 'Retry loading ebook' }),
	).toBeVisible()
})
for (const id of ['read-epub-hostile', 'read-mobi-hostile'])
	test(`${id} blocks outbound requests before and after sanitization`, async ({
		page,
	}) => {
		const attempted: string[] = []
		await page.route('https://reader-attacker.invalid/**', async (route) => {
			attempted.push(route.request().url())
			await route.abort()
		})
		await openReader(page, id)
		await expect(
			page
				.frameLocator('iframe')
				.first()
				.getByText('Hostile fixture safe text', { exact: true }),
		).toBeVisible()
		await page
			.frameLocator('iframe')
			.first()
			.getByText('Hostile fixture safe text', { exact: true })
			.click()
		await page.getByRole('button', { name: 'Close reader' }).click()
		expect(attempted).toEqual([])
	})
