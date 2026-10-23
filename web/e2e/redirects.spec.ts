import { expect, test } from '@playwright/test'
import { appMenu } from './shell-controls'

for (const prefix of ['', '/abs'])
	test(`redirect routes preserve state and safe return ${prefix || 'root'}`, async ({
		page,
	}) => {
		await page.goto(`${prefix}/new/login`)
		await page.getByLabel('Username', { exact: true }).fill('listener')
		await page.getByLabel('Password', { exact: true }).fill('password')
		await page.getByRole('button', { name: 'Sign in', exact: true }).click()
		await expect(appMenu(page).first()).toBeVisible()
		await page.goto(`${prefix}/new/items/book-1?foo=bar#chapter`)
		await expect(page).toHaveURL(`${prefix}/new/item/book-1?foo=bar#chapter`)
		await page.goto(`${prefix}/new/libraries/books?view=list#shelf`)
		await expect(page).toHaveURL(
			new RegExp(`${prefix}/new/library/books/bookshelf\\?view=list.*#shelf$`),
		)
		await page.goto(`${prefix}/new/library/books/authors`)
		await expect(page).toHaveURL(
			new RegExp(`${prefix}/new/library/books/bookshelf/authors`),
		)
		await page.goto(`${prefix}/new/library/books/series`)
		await expect(
			page.getByRole('heading', { name: /Series not found/ }),
		).toBeVisible()
		await page.goto(
			`${prefix}/new/oops?message=Missing&redirect=https://example.test`,
		)
		await page.getByRole('button', { name: 'Return', exact: true }).click()
		await expect(page).not.toHaveURL(/example\.test/)
		await expect(appMenu(page).first()).toBeVisible()
	})
