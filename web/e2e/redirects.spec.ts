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
		await expect(page).toHaveURL(
			new RegExp(`${prefix}/new/library/(books|podcasts)$`),
		)
		await page.goto(
			`${prefix}/new/oops?redirect=${encodeURIComponent('/library/books/search?q=book')}`,
		)
		await page.getByRole('button', { name: 'Return', exact: true }).click()
		await expect(page).toHaveURL(`${prefix}/new/library/books/search?q=book`)
	})

for (const prefix of ['', '/abs'])
	test(`admin outlet and metadata index links reach child screens ${prefix || 'root'}`, async ({
		page,
	}) => {
		await page.goto(`${prefix}/new/login`)
		await page.getByLabel('Username', { exact: true }).fill('root')
		await page.getByLabel('Password', { exact: true }).fill('password')
		await page.getByRole('button', { name: 'Sign in', exact: true }).click()
		await expect(appMenu(page).first()).toBeVisible()
		await page.route('**/api/users/fixture-listener', async (route) => {
			await route.fulfill({
				json: {
					id: 'fixture-listener',
					username: 'listener',
					type: 'user',
					permissions: {},
					settings: {},
				},
			})
		})
		await page.route(
			'**/api/users/fixture-listener/listening-stats',
			async (route) => {
				await route.fulfill({ json: { totalTime: 0, today: 0 } })
			},
		)
		await page.goto(`${prefix}/new/config/users/fixture-listener`)
		await expect(
			page.getByRole('heading', { name: /listener/i }).first(),
		).toBeVisible()
		for (const [label, path, heading] of [
			['Tags', 'tags', 'Manage tags'],
			['Genres', 'genres', 'Manage genres'],
			[
				'Custom metadata providers',
				'custom-metadata-providers',
				'Custom metadata providers',
			],
		]) {
			await page.goto(`${prefix}/new/config/item-metadata-utils`)
			await page.getByRole('link', { name: `${label} →`, exact: true }).click()
			await expect(page).toHaveURL(
				`${prefix}/new/config/item-metadata-utils/${path}`,
			)
			await expect(
				page.getByRole('heading', { name: heading, exact: true }),
			).toBeVisible()
		}
	})
