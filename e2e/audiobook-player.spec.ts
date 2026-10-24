import { expect, test } from '@playwright/test'
import {
	appMenu,
	chooseTheme,
	openPlayerOptions,
	openSidebar,
} from './shell-controls'

for (const prefix of ['']) {
	test(`portable multi-track chapters, sleep and native bookmark CRUD ${prefix || 'root'}`, async ({
		page,
	}) => {
		const writes: { path: string; body: Record<string, number> }[] = []
		page.on('request', (request) => {
			if (/\/session\/.*\/(sync|close)$/.test(new URL(request.url()).pathname))
				writes.push({ path: request.url(), body: request.postDataJSON() })
		})
		await page.goto(`${prefix}/login`)
		await page.getByLabel('Username', { exact: true }).fill('listener')
		await page.getByLabel('Password', { exact: true }).fill('password')
		await page.getByRole('button', { name: 'Sign in', exact: true }).click()
		await openSidebar(page)
		await expect(appMenu(page).first()).toBeVisible()
		const start = async () => {
			await page.goto(`${prefix}/item/book-boundaries`)
			await page
				.getByRole('button', { name: 'Play audiobook', exact: true })
				.click()
			await expect
				.poll(() =>
					page
						.getByLabel('Audio playback')
						.evaluate((a: HTMLAudioElement) => a.currentTime),
				)
				.toBeGreaterThan(0)
			await page
				.getByLabel('Audio playback')
				.evaluate((a: HTMLAudioElement) => a.pause())
			await openPlayerOptions(page)
		}
		await start()
		const audio = page.getByLabel('Audio playback')
		await page
			.getByText('Chapters, bookmarks, queue and settings', { exact: true })
			.click()
		await page.getByLabel('Chapter timeline', { exact: true }).check()
		await page
			.getByRole('button', { name: 'Next chapter', exact: true })
			.click()
		await expect(page.locator('[aria-label="Current chapter"]')).toHaveText(
			'Across the bridge',
		)
		await expect(
			page.locator('[role="slider"][aria-label="Playback progress"]'),
		).toHaveAttribute('aria-valuemax', '5')
		// Relative seek 2 s in chapter starting at 3 s crosses first file boundary at 4 s.
		const progress = page.locator(
			'[role="slider"][aria-label="Playback progress"]',
		)
		for (const [index, key] of ['Home', 'ArrowRight', 'ArrowRight'].entries()) {
			await progress.evaluate(
				(node, key) =>
					node.dispatchEvent(
						new KeyboardEvent('keydown', { key, bubbles: true }),
					),
				key,
			)
			await expect(progress).toHaveAttribute('aria-valuenow', String(index))
		}
		await expect.poll(() => audio.getAttribute('src')).toContain('boundary-2')
		await expect
			.poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime))
			.toBeGreaterThanOrEqual(0.9)
		await page
			.getByLabel('Chapter position (seconds)', { exact: true })
			.fill('0.5')
		await page.getByRole('button', { name: 'Seek', exact: true }).click()
		await expect.poll(() => audio.getAttribute('src')).toContain('boundary-1')
		await expect
			.poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime))
			.toBe(3.5)
		await audio.evaluate((a: HTMLAudioElement) => a.play())
		await expect.poll(() => audio.getAttribute('src')).toContain('boundary-2')
		await audio.evaluate((a: HTMLAudioElement) => a.pause())
		await page
			.getByRole('button', { name: 'Next chapter', exact: true })
			.click()
		await expect(page.locator('[aria-label="Current chapter"]')).toHaveText(
			'Arrival',
		)
		await page
			.getByRole('button', { name: 'Previous chapter', exact: true })
			.click()
		await expect(page.locator('[aria-label="Current chapter"]')).toHaveText(
			'Across the bridge',
		)
		await page
			.getByLabel('Bookmark title', { exact: true })
			.fill(`Bridge ${prefix || 'root'}`)
		await page
			.getByRole('button', { name: 'Add bookmark', exact: true })
			.click()
		const mark = page.getByRole('button', {
			name: `0:03 Bridge ${prefix || 'root'}`,
			exact: true,
		})
		await expect(mark).toBeVisible()
		await page
			.getByRole('button', { name: 'Next chapter', exact: true })
			.click()
		await mark.click()
		await expect(page.locator('[aria-label="Current chapter"]')).toHaveText(
			'Across the bridge',
		)
		page.once('dialog', (dialog) => dialog.accept('Edited bridge'))
		await page
			.getByRole('button', { name: 'Edit bookmark', exact: true })
			.click()
		await expect(
			page.getByRole('button', { name: '0:03 Edited bridge', exact: true }),
		).toBeVisible()
		await page.reload()
		await start()
		await page
			.getByText('Chapters, bookmarks, queue and settings', { exact: true })
			.click()
		await expect(
			page.getByLabel('Chapter timeline', { exact: true }),
		).toBeChecked()
		await page
			.getByRole('button', { name: '0:03 Edited bridge', exact: true })
			.click()
		page.once('dialog', (dialog) => dialog.accept())
		await page
			.getByRole('button', { name: 'Delete bookmark', exact: true })
			.click()
		await expect(
			page.getByRole('button', { name: '0:03 Edited bridge', exact: true }),
		).toHaveCount(0)
		await page
			.getByLabel('Sleep timer', { exact: true })
			.selectOption('chapter')
		await audio.evaluate((a: HTMLAudioElement) => a.play())
		await expect
			.poll(() => audio.evaluate((a: HTMLAudioElement) => a.paused), {
				timeout: 10000,
			})
			.toBe(true)
		await expect
			.poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime))
			.toBeGreaterThanOrEqual(4)
		await page
			.getByRole('button', { name: 'Close player', exact: true })
			.click()
		await expect
			.poll(() => writes.filter((w) => w.path.endsWith('/close')).length)
			.toBeGreaterThan(0)
		for (const action of ['sync', 'close']) {
			const row = writes.find((w) => w.path.endsWith(`/${action}`))
			expect(row).toBeTruthy()
			expect(row?.body.currentTime).toBeGreaterThanOrEqual(0)
		}
		const logs = await page.request.get(
			`${process.env.ABS_MOCK_CONTROL_URL || 'http://abs-mock:4179'}/__fixture/observations`,
		)
		const observations = await logs.json()
		for (const action of ['sync', 'close'])
			expect(observations).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						itemId: 'book-boundaries',
						action,
						duration: 15,
						currentTime: expect.any(Number),
					}),
				]),
			)
		// Native HTTP bodies carry global time; session observations supply item identity and duration.
		expect(
			writes.filter((w) => w.path.endsWith('/close')).at(-1)?.body.currentTime,
		).toBeGreaterThanOrEqual(8)
	})
}

for (const width of [390, 1280])
	for (const theme of ['light', 'dark'])
		test(`chapter mode screenshot ${width} ${theme}`, async ({ page }) => {
			await page.setViewportSize({ width, height: 900 })
			await page.goto('/login')
			await page.getByLabel('Username', { exact: true }).fill('listener')
			await page.getByLabel('Password', { exact: true }).fill('password')
			await page.getByRole('button', { name: 'Sign in', exact: true }).click()
			await openSidebar(page)
			await expect(appMenu(page).first()).toBeVisible()
			await chooseTheme(page, theme)
			await page.goto('/item/book-boundaries')
			await page
				.getByRole('button', { name: 'Play audiobook', exact: true })
				.click()
			await page
				.getByLabel('Audio playback')
				.evaluate((a: HTMLAudioElement) => a.pause())
			await openPlayerOptions(page)
			await page
				.getByText('Chapters, bookmarks, queue and settings', { exact: true })
				.click()
			await page.getByLabel('Chapter timeline', { exact: true }).check()
			await page
				.getByRole('button', { name: 'Next chapter', exact: true })
				.click()
			await expect(page.locator('[aria-label="Current chapter"]')).toHaveText(
				'Across the bridge',
			)
			await page.getByRole('button', { name: 'Close', exact: true }).click()
			await page.screenshot({
				path: `/private/tmp/opencode/issue2-closeout/chapter-${width}-${theme}.png`,
			})
		})
