import { expect, type Page } from '@playwright/test'

export async function socketControl(
	page: Page,
	_prefix: string,
	input?: unknown,
) {
	const token = await page.evaluate(() => localStorage.getItem('token'))
	const control = process.env.ABS_MOCK_CONTROL_URL || 'http://abs-mock:4179'
	const response = await page.request.fetch(`${control}/__fixture/socket`, {
		method: input ? 'POST' : 'GET',
		headers: { authorization: `Bearer ${token}` },
		...(input ? { data: input } : {}),
	})
	if (!response.ok())
		throw new Error(`Socket fixture failed: ${response.status()}`)
	return response.json() as Promise<{ authCount: number; connections: number }>
}

export async function signIn(
	page: Page,
	prefix: string,
	username = 'listener',
) {
	await page.goto(`${prefix}/`)
	await page.getByLabel('Username', { exact: true }).fill(username)
	await page.getByLabel('Password', { exact: true }).fill('password')
	await page.getByRole('button', { name: 'Sign in', exact: true }).click()
	await expect(
		page.getByRole('button', { name: 'Sign in', exact: true }),
	).toHaveCount(0)
}
