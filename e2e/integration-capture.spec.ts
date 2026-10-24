import { expect, test } from '@playwright/test'
import {
	chooseLibrary,
	chooseTheme,
	openPlayerOptions,
	settleAnimations,
} from './shell-controls'

const output = '/private/tmp/opencode/integrate-books'

for (const width of [1280, 390]) {
	for (const theme of ['light', 'dark']) {
		test(`integrated book capture ${width} ${theme}`, async ({ page }) => {
			await page.setViewportSize({ width, height: 900 })
			await page.goto('/login')
			await page.getByLabel('Username', { exact: true }).fill('admin')
			await page.getByLabel('Password', { exact: true }).fill('password')
			await page.getByRole('button', { name: 'Sign in', exact: true }).click()
			await page.waitForURL(/library\/podcasts$/)
			await chooseTheme(page, theme)

			await page.goto('/item/book-1')
			await settleAnimations(page)
			await page.screenshot({ path: `${output}/detail-${width}-${theme}.png` })

			await page.goto('/item/book-boundaries')
			await page
				.getByRole('button', { name: 'Play audiobook', exact: true })
				.click()
			const audio = page.getByLabel('Audio playback')
			await expect
				.poll(() =>
					audio.evaluate((element: HTMLAudioElement) => element.currentTime),
				)
				.toBeGreaterThan(0)
			await audio.evaluate((element: HTMLAudioElement) => element.pause())
			await openPlayerOptions(page)
			await page
				.getByText('Chapters, bookmarks, queue and settings', { exact: true })
				.click()
			await page.getByLabel('Chapter timeline', { exact: true }).check()
			await page
				.getByLabel('Chapter position (seconds)', { exact: true })
				.fill('0')
			await page.getByRole('button', { name: 'Seek', exact: true }).click()
			await expect(page.locator('[aria-label="Current chapter"]')).toHaveText(
				'Departure',
			)
			await expect
				.poll(() =>
					audio.evaluate((element: HTMLAudioElement) => element.currentTime),
				)
				.toBe(0)
			await page
				.getByRole('button', { name: 'Next chapter', exact: true })
				.click()
			await expect(page.locator('[aria-label="Current chapter"]')).toHaveText(
				'Across the bridge',
			)
			await expect
				.poll(() =>
					audio.evaluate((element: HTMLAudioElement) => element.currentTime),
				)
				.toBeGreaterThanOrEqual(3)
			await page.getByRole('button', { name: 'Close', exact: true }).click()
			await settleAnimations(page)
			await page.screenshot({ path: `${output}/player-${width}-${theme}.png` })

			await page.goto('/audiobook/book-1/edit')
			await settleAnimations(page)
			await page.screenshot({ path: `${output}/admin-${width}-${theme}.png` })

			await page.evaluate(async () => {
				const headers = {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${localStorage.getItem('token')}`,
				}
				for (const id of ['book-1', 'book-2'])
					await fetch(`/api/me/progress/${id}`, {
						method: 'PATCH',
						headers,
						body: JSON.stringify({
							currentTime: 7,
							duration: 14,
							progress: 0.5,
							isFinished: false,
						}),
					})
			})
			await chooseLibrary(page, 'books')
			await page.goto('/library/books')
			await expect(
				page.getByRole('heading', { name: 'Continue Listening' }),
			).toBeVisible()
			await expect(
				page
					.getByRole('region', { name: 'Continue Listening', exact: true })
					.getByRole('link', { name: 'The Glass Orchard' }),
			).toBeVisible()
			await settleAnimations(page)
			await page.screenshot({ path: `${output}/home-${width}-${theme}.png` })
		})
	}
}
