import { expect, test } from '@playwright/test'

for (const prefix of ['', '/abs']) {
	test(`playlist create dialog persists and delete returns to parent ${prefix || 'root'}`, async ({
		page,
	}) => {
		await page.goto(`${prefix}/new/`)
		await page.getByLabel('Username', { exact: true }).fill('listener')
		await page.getByLabel('Password', { exact: true }).fill('password')
		await page.getByRole('button', { name: 'Sign in', exact: true }).click()
		await page.goto(`${prefix}/new/library/books/bookshelf/playlists`)
		const trigger = page.getByRole('button', {
			name: 'Create playlist',
			exact: true,
		})
		await trigger.click()
		await page.getByLabel('Name', { exact: true }).fill('Created playlist')
		await page
			.getByRole('dialog')
			.getByRole('button', { name: 'Create playlist' })
			.click()
		await expect(page.getByRole('dialog')).toHaveCount(0)
		await expect(trigger).toBeFocused()
		await page
			.getByRole('article')
			.getByRole('link', { name: /Created playlist/ })
			.click()
		await expect(
			page.getByRole('heading', { name: 'Created playlist', exact: true }),
		).toBeVisible()
		await expect(page.getByText('No items in this playlist.')).toBeVisible()
		await page.getByRole('button', { name: 'Playlist actions' }).click()
		page.once('dialog', (dialog) => dialog.dismiss())
		await page.getByRole('menuitem', { name: 'Delete playlist' }).click()
		await expect(
			page.getByRole('button', { name: 'Playlist actions' }),
		).toBeFocused()
		await expect(
			page.getByRole('heading', { name: 'Created playlist', exact: true }),
		).toBeVisible()
		await page.getByRole('button', { name: 'Playlist actions' }).click()
		page.once('dialog', (dialog) => dialog.accept())
		await page.getByRole('menuitem', { name: 'Delete playlist' }).click()
		await expect(page).toHaveURL(
			/\/library\/books\/bookshelf\/playlists(?:\?|$)/,
		)
		await expect(
			page.getByRole('article').getByRole('link', { name: /Created playlist/ }),
		).toHaveCount(0)
	})
}
