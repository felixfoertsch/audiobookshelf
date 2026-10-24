import { expect, test } from '@playwright/test'
import { appMenu } from './shell-controls'

for (const prefix of [''])
	for (const user of ['listener', 'admin', 'root'])
		test(`shell preserves ${user} permissions ${prefix || 'root'}`, async ({
			page,
		}) => {
			await page.goto(`${prefix}/`)
			await page.getByLabel('Username', { exact: true }).fill(user)
			await page.getByLabel('Password', { exact: true }).fill('password')
			await page.getByRole('button', { name: 'Sign in', exact: true }).click()
			const admin = user !== 'listener'
			const nav = page.getByRole('navigation', { name: 'Library', exact: true })
			await expect(
				nav.getByRole('link', { name: 'Add podcast', exact: true }),
			).toHaveCount(admin ? 1 : 0)
			await expect(
				nav.getByRole('link', { name: 'Download queue', exact: true }),
			).toHaveCount(admin ? 1 : 0)
			await expect(
				page.getByRole('link', { name: 'Upload', exact: true }),
			).toHaveCount(admin ? 1 : 0)
			await expect(
				page.getByRole('link', { name: 'Admin settings', exact: true }),
			).toHaveCount(admin ? 1 : 0)
			await expect(
				page.getByRole('switch', { name: 'Debug', exact: true }),
			).toHaveCount(admin ? 1 : 0)
			await appMenu(page).click()
			await expect(
				page.getByRole('menuitem', { name: 'User settings', exact: true }),
			).toBeVisible()
			await expect(page.getByRole('menuitem')).toHaveCount(2)
			await expect(page.getByRole('menuitemradio')).toHaveCount(3)
			await page.keyboard.press('Escape')
			await page.goto(`${prefix}/account`)
			await expect(appMenu(page)).toBeVisible()
			await expect(
				page.getByRole('searchbox', { name: 'Search library', exact: true }),
			).toHaveCount(1)
		})

for (const prefix of ['']) {
	test(`podcast download queue enforces backend permissions ${prefix || 'root'}`, async ({
		page,
	}) => {
		for (const [user, status] of [
			['listener', 403],
			['admin', 200],
		] as const) {
			await page.context().clearCookies()
			await page.goto(`${prefix}/`)
			await page.evaluate(() => localStorage.clear())
			await page.reload()
			await page.getByLabel('Username', { exact: true }).fill(user)
			await page.getByLabel('Password', { exact: true }).fill('password')
			await page.getByRole('button', { name: 'Sign in', exact: true }).click()
			const response = page.waitForResponse(
				(result) =>
					new URL(result.url()).pathname ===
					`${prefix}/api/libraries/podcasts/episode-downloads`,
			)
			await page.goto(`${prefix}/library/podcasts/podcast/download-queue`)
			expect((await response).status()).toBe(status)
			if (user === 'listener')
				await expect(page.getByRole('alert')).toContainText(
					'Permission denied.',
				)
			else
				await expect(
					page.getByRole('heading', {
						name: 'Podcast download queue',
						exact: true,
					}),
				).toBeVisible()
		}
	})
}
