import { expect, test } from '@playwright/test'
import {
	appMenu,
	chooseLibrary,
	chooseTheme,
	closeSidebar,
	openPlayerOptions,
	openSidebar,
} from './shell-controls'

async function signIn(page: import('@playwright/test').Page, prefix = '') {
	await page.goto(`${prefix}/new/`)
	await expect(
		page.getByRole('complementary', { name: 'Alpha frontend' }),
	).toContainText('Modern UI · Classic available for legacy access.')
	await expect(
		page.getByRole('link', { name: 'Open Classic', exact: true }),
	).toHaveAttribute('href', `${prefix}/?classic=1`)
	await page.getByLabel('Username', { exact: true }).fill('listener')
	await page.getByLabel('Password', { exact: true }).fill('password')
	await page.getByRole('button', { name: 'Sign in', exact: true }).click()
	await openSidebar(page)
	await expect(appMenu(page)).toBeVisible()
	await closeSidebar(page)
	await expect(page).toHaveURL(new RegExp(`${prefix}/new/library/podcasts$`))
	await expect(
		page.getByRole('link', { name: 'Open Classic', exact: true }),
	).toHaveAttribute('href', `${prefix}/?classic=1`)
	if (await page.getByRole('button', { name: /^Library:/ }).isVisible())
		await expect(page.getByRole('button', { name: /^Library:/ })).toContainText(
			'Field Notes',
		)
}
for (const prefix of ['', '/abs']) {
	test(`continue listening hides only selected audiobook ${prefix || 'root'}`, async ({
		page,
	}) => {
		await signIn(page, prefix)
		await page.evaluate(async (base) => {
			const headers = {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${localStorage.getItem('token')}`,
			}
			const records = await (
				await fetch(`${base}/api/me/progress`, { headers })
			).json()
			for (const record of records.mediaProgress)
				if (['book-1', 'book-2'].includes(record.libraryItemId))
					await fetch(
						`${base}/api/me/progress/${encodeURIComponent(record.id)}`,
						{ method: 'DELETE', headers },
					)
			for (const id of ['book-1', 'book-2'])
				await fetch(`${base}/api/me/progress/${id}`, {
					method: 'PATCH',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${localStorage.getItem('token')}`,
					},
					body: JSON.stringify({
						currentTime: 7,
						duration: 13.883375,
						progress: 0.5,
						isFinished: false,
					}),
				})
		}, prefix)
		const headers = page.getByRole('heading', { name: 'Continue Listening' })
		await page.goto(`${prefix}/new/library/books`)
		await expect(headers).toBeVisible()
		const shelf = headers.locator('xpath=..')
		await expect(
			shelf.getByRole('link', { name: 'The Glass Orchard' }),
		).toBeVisible()
		const target = shelf.locator('article').filter({
			has: page.getByRole('link', { name: 'The Glass Orchard', exact: true }),
		})
		await target.getByRole('button', { name: 'Resume', exact: true }).click()
		await expect
			.poll(() =>
				page
					.getByLabel('Audio playback')
					.evaluate((node: HTMLAudioElement) => node.currentTime),
			)
			.toBeGreaterThan(6.9)
		await target
			.getByRole('button', { name: 'Hide from Continue Listening' })
			.click()
		await expect(
			shelf.getByRole('link', { name: 'Northbound Letters', exact: true }),
		).toBeVisible()
		await expect(
			shelf.getByRole('link', { name: 'The Glass Orchard' }),
		).toHaveCount(0)
		await page.goto(`${prefix}/new/library/books/series/series-1`)
		const readd = page.getByRole('button', {
			name: 'Re-add series to continue listening',
		})
		await expect(readd).toBeVisible()
		const readdResponse = page.waitForResponse((response) =>
			response
				.url()
				.endsWith('/api/me/series/series-1/readd-to-continue-listening'),
		)
		await readd.click()
		expect((await readdResponse).status()).toBe(200)
		await page.evaluate(async (base) => {
			await fetch(`${base}/api/me/progress/book-1`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${localStorage.getItem('token')}`,
				},
				body: JSON.stringify({ isFinished: true }),
			})
		}, prefix)
		await page.goto(`${prefix}/new/library/books`)
		const seriesShelf = page
			.getByRole('heading', { name: 'Continue Series', exact: true })
			.locator('xpath=..')
		await expect(
			seriesShelf.getByRole('link', {
				name: 'Atlas of Small Stars',
				exact: true,
			}),
		).toBeVisible()
		await expect(
			seriesShelf.getByRole('link', {
				name: 'The Orchard Cycle · 3',
				exact: true,
			}),
		).toBeVisible()
	})
}
for (const prefix of ['', '/abs'])
	test(`browse and original audio lifecycle ${prefix || 'root'}`, async ({
		page,
		request,
	}) => {
		await signIn(page, prefix)
		await chooseLibrary(page, 'podcasts')
		await expect(
			page.getByRole('link', { name: /Night Garden/ }).first(),
		).toBeVisible()
		await page
			.getByRole('link', { name: /^Field Notes/ })
			.first()
			.click()
		await expect(page).toHaveURL(`${prefix}/new/item/podcast-1`)
		await page
			.getByRole('button', { name: /^Play (?!latest episode)/ })
			.first()
			.click()
		const audio = page.getByLabel('Audio playback')
		await expect(audio).toBeAttached()
		await expect(
			page.getByRole('region', { name: 'Audio player' }),
		).toBeVisible()
		await expect
			.poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentTime))
			.toBeGreaterThan(0.1)
		await expect
			.poll(() =>
				audio.evaluate((node: HTMLAudioElement) =>
					node.seekable.length ? node.seekable.end(0) : 0,
				),
			)
			.toBeGreaterThan(8)
		await openPlayerOptions(page)
		await expect(
			page.getByRole('checkbox', { name: 'Auto-skip detected segments' }),
		).toBeEnabled()
		await expect(
			page.getByRole('checkbox', { name: 'Auto-skip detected segments' }),
		).toBeChecked()
		// Continuous playback, rather than a seek into the candidate, touches its start.
		await expect
			.poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentTime))
			.toBeGreaterThanOrEqual(3.8)
		await audio.evaluate((node: HTMLAudioElement) => {
			node.pause()
			node.currentTime = 6
		})
		await expect
			.poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentTime))
			.toBeGreaterThan(5.9)
		await page.keyboard.press('Escape')
		await page.goBack()
		await expect(audio).toBeAttached()
		await expect(
			page.getByRole('region', { name: 'Audio player' }),
		).toBeVisible()
		await page
			.getByRole('link', { name: 'Audiobookshelf', exact: true })
			.click()
		await chooseLibrary(page, 'books')
		await expect(
			page.getByRole('link', { name: /Northbound Letters/ }).first(),
		).toBeVisible()
		await page
			.getByRole('link', { name: /The Glass Orchard/ })
			.first()
			.click()
		await expect(page.getByRole('heading', { name: 'Chapters' })).toBeVisible()
		await page.getByRole('button', { name: 'Play audiobook' }).click()
		await expect
			.poll(() => audio.evaluate((node: HTMLAudioElement) => node.duration))
			.toBeCloseTo(13.883375, 2)
		await expect
			.poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentTime))
			.toBeGreaterThan(0.1)
		await audio.evaluate((node: HTMLAudioElement) => {
			node.currentTime = 7
			node.pause()
		})
		await openPlayerOptions(page)
		await page.getByRole('button', { name: 'Close player' }).click()
		await expect(page.getByLabel('Audio playback')).toHaveCount(0)
		const observations = (await (
			await request.get(`${prefix}/__fixture/observations`)
		).json()) as {
			itemId: string
			episodeId: string | null
			currentTime: number
			action: string
		}[]
		expect(
			observations.some(
				(row) =>
					row.itemId === 'podcast-1' &&
					row.episodeId === 'podcast-1-ep-1' &&
					row.action === 'close' &&
					row.currentTime >= 5.9,
			),
		).toBe(true)
		expect(
			observations.some(
				(row) =>
					row.itemId === 'book-1' &&
					row.episodeId === null &&
					row.action === 'close' &&
					row.currentTime >= 6.9,
			),
		).toBe(true)
		await page.reload()
		await expect(
			page.getByRole('heading', { name: 'The Glass Orchard', exact: true }),
		).toBeVisible()
	})
test('permission error and range contract', async ({ page, request }) => {
	await signIn(page)
	await page.goto('/new/libraries/forbidden')
	await expect(page).toHaveURL(/\/new\/library\/forbidden\/bookshelf(?:\?|$)/)
	await expect(page.getByRole('alert').first()).toContainText(
		'Permission denied',
	)
	await openSidebar(page)
	await expect(appMenu(page)).toBeVisible()
	await closeSidebar(page)
	await expect(
		page.getByRole('button', { name: 'Sign in', exact: true }),
	).toHaveCount(0)
	const ranged = await request.get('/media/book-1', {
		headers: { range: 'bytes=0-43' },
	})
	expect(ranged.status()).toBe(206)
	expect((await ranged.body()).length).toBe(44)
	expect(ranged.headers()['accept-ranges']).toBe('bytes')
	expect(
		(
			await request.get('/media/book-1', {
				headers: { range: 'bytes=99999999-' },
			})
		).status(),
	).toBe(416)
})
for (const width of [320, 390, 1280])
	for (const theme of ['light', 'dark'])
		test(`layout ${width} ${theme}`, async ({ page }, testInfo) => {
			await page.setViewportSize({ width, height: 844 })
			await signIn(page)
			await chooseTheme(page, theme)
			await chooseLibrary(page, 'books')
			await expect(page).toHaveURL(/\/library\/books$/)
			await expect(
				page.getByRole('heading', { name: 'The Glass Orchard', exact: true }),
			).toBeVisible()
			// Shelves intentionally lazy-load offscreen artwork; expose every cover before checking it.
			const images = page.locator('img')
			for (const image of await images.all()) {
				await image.scrollIntoViewIfNeeded()
				await expect
					.poll(() =>
						image.evaluate(
							(node: HTMLImageElement) =>
								node.complete && node.naturalWidth > 0,
						),
					)
					.toBe(true)
			}
			await page.evaluate(() => {
				for (const node of document.querySelectorAll<HTMLElement>('*')) {
					if (node.scrollLeft) node.scrollLeft = 0
				}
				window.scrollTo(0, 0)
			})
			expect(
				await page.evaluate(
					() => document.documentElement.scrollWidth <= innerWidth,
				),
			).toBe(true)
			await page.screenshot({
				path: testInfo.outputPath(`library-${width}-${theme}.png`),
				fullPage: true,
			})
			await page
				.getByRole('link', { name: /The Glass Orchard/ })
				.first()
				.click()
			await page.getByRole('button', { name: 'Play audiobook' }).click()
			await expect
				.poll(() =>
					page
						.getByLabel('Audio playback')
						.evaluate((node: HTMLAudioElement) => node.readyState),
				)
				.toBeGreaterThanOrEqual(2)
			expect(
				await page.evaluate(
					() => document.documentElement.scrollWidth <= innerWidth,
				),
			).toBe(true)
			const player = page.getByRole('region', { name: 'Audio player' })
			expect(
				await player.evaluate((node) => node.scrollWidth <= node.clientWidth),
			).toBe(true)
			await expect(page.getByLabel('Audio playback')).toBeAttached()
			const mountedAudio = await page
				.getByLabel('Audio playback')
				.elementHandle()
			if (!mountedAudio) throw new Error('Mounted audio missing')
			if (width < 768)
				await page
					.getByRole('button', { name: 'Toggle Sidebar', exact: true })
					.click()
			await page
				.getByRole('link', { name: 'Audiobookshelf', exact: true })
				.click()
			await expect(page).toHaveURL('/new/library/books')
			expect(await mountedAudio.evaluate((node) => node.isConnected)).toBe(true)
			await expect(page.getByLabel('Audio playback')).toBeAttached()
			await expect(player).toBeVisible()
			expect(
				await page.evaluate(
					() => document.documentElement.scrollWidth <= innerWidth,
				),
			).toBe(true)
			expect(
				await player.evaluate((node) => node.scrollWidth <= node.clientWidth),
			).toBe(true)
			await expect(page.getByLabel('Audio playback')).toBeAttached()
			await page.screenshot({
				path: testInfo.outputPath(`player-${width}-${theme}.png`),
			})
		})
