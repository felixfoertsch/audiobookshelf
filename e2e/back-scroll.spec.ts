import { expect, test } from '@playwright/test'
import { signIn } from './socket-controls'

for (const prefix of [''])
	test(`bookshelf Back restores query and scroll ${prefix || 'root'}`, async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 400 })
		await signIn(page, prefix)
		await page.goto(
			`${prefix}/library/podcasts/bookshelf?sort=media.metadata.title&desc=1&filter=all`,
		)
		const item = page.getByRole('main').getByRole('link').last()
		await item.scrollIntoViewIfNeeded()
		const offset = await page.evaluate(() => window.scrollY)
		expect(offset).toBeGreaterThan(100)
		const previous = page.url()
		await item.click()
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
		await page.goBack()
		await expect(page).toHaveURL(previous)
		await expect(item).toBeVisible()
		await expect
			.poll(() => page.evaluate(() => window.scrollY))
			.toBeCloseTo(offset, 0)
	})
