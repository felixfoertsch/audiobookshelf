import { expect, test } from '@playwright/test'

test('standalone root serves login without legacy Alpha landing banner', async ({
	page,
}) => {
	await page.goto('/')
	await expect(page.getByLabel('Username', { exact: true })).toBeVisible()
	await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
	await expect(page.getByText(/alpha/i)).toHaveCount(0)
})
