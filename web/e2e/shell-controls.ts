import { expect, type Page } from '@playwright/test'

export const appMenu = (page: Page) =>
	page.getByRole('button', { name: / · Menu$/ })
export async function openSidebar(page: Page) {
	const trigger = page.getByRole('button', {
		name: 'Toggle Sidebar',
		exact: true,
	})
	await expect(appMenu(page).or(trigger)).toBeVisible()
	if (!(await appMenu(page).isVisible())) await trigger.click()
	await expect(appMenu(page)).toBeVisible()
}
export async function closeSidebar(page: Page) {
	await expect(page.getByRole('menu')).toHaveCount(0)
	const sidebar = page.getByRole('dialog', { name: 'Sidebar', exact: true })
	if (await sidebar.isVisible()) {
		await page.keyboard.press('Escape')
		await expect(sidebar).toHaveCount(0)
	}
}
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
	await closeSidebar(page)
}
export async function signOut(page: Page) {
	await openSidebar(page)
	await appMenu(page).click()
	await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
}
// Finish finite transitions from the real theme switch before capture or measurement.
export async function settleAnimations(page: Page) {
	await page.evaluate(async () => {
		await Promise.all(
			document
				.getAnimations()
				.filter(
					(animation) => animation.effect?.getTiming().iterations !== Infinity,
				)
				.map((animation) => animation.finished.catch(() => {})),
		)
	})
}
export async function chooseTheme(page: Page, theme: string) {
	await openSidebar(page)
	await appMenu(page).click()
	await page
		.getByRole('menuitemradio', {
			name: theme === 'dark' ? 'Dark' : 'Light',
			exact: true,
		})
		.click()
	await closeSidebar(page)
	await expect(page.locator('html')).toHaveClass(
		theme === 'dark' ? /dark/ : /^(?!.*dark)/,
	)
}

export async function openPlayerOptions(page: Page) {
	const button = page.getByRole('button', {
		name: 'Player options',
		exact: true,
	})
	if (await button.isVisible()) await button.click()
	else {
		await page.getByRole('button', { name: 'More player actions' }).click()
		await page
			.getByRole('menuitem', { name: 'Player options', exact: true })
			.click()
	}
	await expect(
		page.getByRole('dialog', { name: 'Player options' }),
	).toBeVisible()
}
