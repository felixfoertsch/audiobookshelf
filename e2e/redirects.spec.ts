import { expect, test } from '@playwright/test'
import { appMenu } from './shell-controls'

for (const prefix of [''])
	test(`redirect routes preserve state and safe return ${prefix || 'root'}`, async ({
		page,
	}) => {
		await page.goto(`${prefix}/login`)
		await page.getByLabel('Username', { exact: true }).fill('listener')
		await page.getByLabel('Password', { exact: true }).fill('password')
		await page.getByRole('button', { name: 'Sign in', exact: true }).click()
		await expect(appMenu(page).first()).toBeVisible()
		await page.goto(`${prefix}/items/book-1?foo=bar#chapter`)
		await expect(page).toHaveURL(`${prefix}/item/book-1?foo=bar#chapter`)
		await page.goto(`${prefix}/libraries/books?view=list#shelf`)
		await expect(page).toHaveURL(
			new RegExp(`${prefix}/library/books/bookshelf\\?view=list.*#shelf$`),
		)
		await page.goto(`${prefix}/library/books/authors`)
		await expect(page).toHaveURL(
			new RegExp(`${prefix}/library/books/bookshelf/authors`),
		)
		await page.goto(`${prefix}/library/books/series`)
		await expect(
			page.getByRole('heading', { name: /Series not found/ }),
		).toBeVisible()
		await page.goto(
			`${prefix}/oops?message=Missing&redirect=https://example.test`,
		)
		await page.getByRole('button', { name: 'Return', exact: true }).click()
		await expect(page).not.toHaveURL(/example\.test/)
		await expect(page).toHaveURL(
			new RegExp(`${prefix}/library/(books|podcasts)$`),
		)
		await page.goto(
			`${prefix}/oops?redirect=${encodeURIComponent('/library/books/search?q=book')}`,
		)
		await page.getByRole('button', { name: 'Return', exact: true }).click()
		await expect(page).toHaveURL(`${prefix}/library/books/search?q=book`)
	})

for (const prefix of [''])
	test(`admin outlet and metadata index links reach child screens ${prefix || 'root'}`, async ({
		page,
	}) => {
		await page.goto(`${prefix}/login`)
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
		await page.goto(`${prefix}/config/users/fixture-listener`)
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
			await page.goto(`${prefix}/config/item-metadata-utils`)
			await page.getByRole('link', { name: `${label} →`, exact: true }).click()
			await expect(page).toHaveURL(
				`${prefix}/config/item-metadata-utils/${path}`,
			)
			await expect(
				page.getByRole('heading', { name: heading, exact: true }),
			).toBeVisible()
		}
	})
