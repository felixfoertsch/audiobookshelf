import { expect, type Page } from '@playwright/test'

export const appMenu = (page: Page) =>
	page.getByRole('button', { name: / · Menu$/ })
export async function chooseLibrary(page: Page, name: 'books' | 'podcasts') {
	const trigger = page.getByRole('button', { name: /^Library:/ })
	if (!(await trigger.isVisible()))
		await page
			.getByRole('button', { name: 'Toggle Sidebar', exact: true })
			.click()
	await trigger.click()
	await page
		.getByRole('menuitemradio', {
			name: name === 'books' ? 'Story Shelf' : 'Field Notes',
			exact: true,
		})
		.click()
	const close = page.getByRole('button', { name: 'Close', exact: true })
	if (await close.isVisible()) await close.click()
}
export async function signOut(page: Page) {
	await appMenu(page).click()
	await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
}
export async function chooseTheme(page: Page, theme: string) {
	await appMenu(page).click()
	await page
		.getByRole('menuitemradio', {
			name: theme === 'dark' ? 'Dark' : 'Light',
			exact: true,
		})
		.click()
	await expect(page.locator('html')).toHaveClass(
		theme === 'dark' ? /dark/ : /^(?!.*dark)/,
	)
}
