import { expect, test } from '@playwright/test'
import { items } from './data'

test('podcast settings preserve unsaved draft across Escape and reopen', async ({
	page,
}) => {
	await page.goto('/')
	await page.getByLabel('Username', { exact: true }).fill('admin')
	await page.getByLabel('Password', { exact: true }).fill('password')
	await page.getByRole('button', { name: 'Sign in', exact: true }).click()
	await expect(
		page.getByRole('searchbox', { name: 'Search library' }),
	).toBeVisible()
	await page.goto('/item/podcast-1')
	const trigger = page.getByRole('button', {
		name: 'Podcast settings',
		exact: true,
	})
	await trigger.click()
	const keep = page.getByLabel('Maximum episodes to keep', { exact: true })
	await expect(keep).toBeEnabled()
	await keep.fill('42')
	await page.keyboard.press('Escape')
	await expect(page.getByRole('dialog')).toHaveCount(0)
	await expect(trigger).toBeFocused()
	await trigger.click()
	await expect(keep).toHaveValue('42')
})

for (const locale of ['en-US', 'de-DE']) {
	test(`podcast date displays ISO order and 24-hour time in ${locale}`, async ({
		browser,
		baseURL,
	}) => {
		const context = await browser.newContext({
			baseURL,
			locale,
			timezoneId: 'Europe/Berlin',
		})
		try {
			const page = await context.newPage()
			const epoch = Date.parse('2026-10-20T13:30:00Z')
			const source = items.find((item) => item.id === 'podcast-1')
			if (!source) throw new Error('Missing synthetic podcast')
			await page.route(
				(url) =>
					url.hostname === '127.0.0.1' &&
					url.pathname === '/api/items/podcast-1',
				(route) =>
					route.fulfill({
						json: {
							...source,
							media: { ...source.media, lastEpisodeCheck: epoch },
						},
					}),
			)
			let savedEpoch: unknown
			await page.route(
				(url) =>
					url.hostname === '127.0.0.1' &&
					url.pathname === '/api/items/podcast-1/media',
				(route) => {
					savedEpoch = route.request().postDataJSON().lastEpisodeCheck
					return route.fulfill({ json: { updated: true } })
				},
			)
			await page.goto('/')
			await page.getByLabel('Username', { exact: true }).fill('admin')
			await page.getByLabel('Password', { exact: true }).fill('password')
			await page.getByRole('button', { name: 'Sign in', exact: true }).click()
			await expect(
				page.getByRole('searchbox', { name: 'Search library' }),
			).toBeVisible()
			await page.goto('/item/podcast-1')
			await page
				.getByRole('button', { name: 'Podcast settings', exact: true })
				.click()
			const date = page.getByRole('group', {
				name: 'Look for episodes after',
				exact: true,
			})
			await expect(date.getByRole('spinbutton')).toHaveCount(5)
			await expect
				.poll(async () =>
					(await date.getByRole('spinbutton').allTextContents()).join('-'),
				)
				.toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}$/)
			expect(
				await date.getByRole('spinbutton').nth(3).getAttribute('aria-valuemax'),
			).toBe('23')
			const minute = date.getByRole('spinbutton').nth(4)
			await minute.focus()
			await page.keyboard.press('ArrowUp')
			await expect(minute).toHaveText('31')
			await page.keyboard.press('ArrowDown')
			await expect(minute).toHaveText('30')
			await page
				.getByRole('button', { name: 'Save settings', exact: true })
				.click()
			await expect(
				page.getByText('Podcast settings saved.', { exact: true }),
			).toBeVisible()
			expect(savedEpoch).toBe(epoch)
		} finally {
			await context.close()
		}
	})
}
