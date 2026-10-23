import { expect, test } from '@playwright/test'

for (const prefix of ['', '/abs']) {
	for (const width of [390, 1280]) {
		for (const library of ['books', 'podcasts']) {
			for (const view of ['grid', 'list', 'detail']) {
				test(`${library} ${view} ${width} ${prefix || 'root'}`, async ({
					page,
				}) => {
					await page.setViewportSize({ width, height: 900 })
					await page.goto(`${prefix}/new/`)
					await page.getByLabel('Username', { exact: true }).fill('listener')
					await page.getByLabel('Password', { exact: true }).fill('password')
					await page
						.getByRole('button', { name: 'Sign in', exact: true })
						.click()
					await page.goto(`${prefix}/new/library/${library}/bookshelf`)
					await page
						.getByRole('button', { name: 'View options', exact: true })
						.click()
					await page
						.getByRole('combobox', { name: 'View', exact: true })
						.selectOption(view)
					await page.keyboard.press('Escape')
					await page.reload()
					await page
						.getByRole('button', { name: 'View options', exact: true })
						.click()
					await expect(
						page.getByRole('combobox', { name: 'View', exact: true }),
					).toHaveValue(view)
					const coverSize = page.getByRole('slider', {
						name: 'Cover size',
						exact: true,
					})
					if (view === 'grid') {
						await coverSize.fill('220')
						await expect(coverSize).toHaveValue('220')
						await page.keyboard.press('Escape')
						await page.reload()
						await page
							.getByRole('button', { name: 'View options', exact: true })
							.click()
						await expect(coverSize).toHaveValue('220')
					} else await expect(coverSize).toHaveCount(0)
					await page.keyboard.press('Escape')
					const entry = page.getByRole('article').first()
					const title = await entry.getByRole('heading').innerText()
					await expect(entry.getByRole('presentation')).toBeVisible()
					const image = await entry.getByRole('presentation').boundingBox()
					if (view !== 'grid') expect(image?.width).toBeLessThanOrEqual(64)
					await expect(entry).toContainText(
						library === 'books'
							? /Rowan Vale|Amara Okafor|Jun Park/
							: /unplayed of/,
					)
					await page
						.getByRole('button', { name: 'Select', exact: true })
						.click()
					await page
						.getByRole('checkbox', { name: `Select ${title}`, exact: true })
						.check()
					await page
						.getByRole('button', { name: 'More actions', exact: true })
						.focus()
					await page.keyboard.press('Enter')
					const action = page.getByRole('button', {
						name:
							library === 'books'
								? 'Play selected'
								: 'Mark all episodes finished',
						exact: true,
					})
					await action.focus()
					await expect(action).toBeFocused()
					await page.keyboard.press('Enter')
					if (library === 'books')
						await expect(
							page.getByRole('region', { name: 'Audio player', exact: true }),
						).toBeVisible()
					else
						await expect(
							page.getByText(/0 failed .* 0 remaining/),
						).toBeVisible()
					await page.keyboard.press('Escape')
					const done = page.getByRole('button', { name: 'Done', exact: true })
					if (await done.isVisible()) await done.click()
					await expect(
						page.getByRole('button', { name: 'Select', exact: true }),
					).toBeVisible()
					expect(
						await page.evaluate(
							() => document.documentElement.scrollWidth <= innerWidth,
						),
					).toBe(true)
					const itemLink = entry.getByRole('link').first()
					// Radix returns focus after the selection menu unmounts.
					await expect(async () => {
						await itemLink.focus()
						await expect(itemLink).toBeFocused()
					}).toPass()
					await itemLink.press('Enter')
					await expect(page).toHaveURL(/\/item\//)
					await expect(
						page.getByRole('heading', { name: title, exact: true }).first(),
					).toBeVisible()
				})
			}
		}
		test(`entity sections ignore item-only preference ${width} ${prefix || 'root'}`, async ({
			page,
		}) => {
			await page.setViewportSize({ width, height: 900 })
			await page.goto(`${prefix}/new/`)
			await page.getByLabel('Username', { exact: true }).fill('listener')
			await page.getByLabel('Password', { exact: true }).fill('password')
			await page.getByRole('button', { name: 'Sign in', exact: true }).click()
			for (const section of ['series', 'authors', 'collections', 'playlists']) {
				await page.goto(
					`${prefix}/new/library/books/bookshelf/${section}?view=detail`,
				)
				const entry = page.getByRole('article').first()
				await expect(entry.getByRole('heading')).toBeVisible()
				if (
					await page
						.getByRole('button', { name: 'View options', exact: true })
						.isVisible()
				) {
					await page
						.getByRole('button', { name: 'View options', exact: true })
						.click()
					await expect(
						page.getByRole('combobox', { name: 'View', exact: true }),
					).toHaveCount(0)
					await page.keyboard.press('Escape')
					// Wait for Sheet teardown to restore focus before choosing a new target.
					await expect(
						page.getByRole('button', { name: 'View options', exact: true }),
					).toBeFocused()
				}
				expect(
					await page.evaluate(
						() => document.documentElement.scrollWidth <= innerWidth,
					),
				).toBe(true)
				const link = entry.getByRole('link').first()
				const href = await link.getAttribute('href')
				if (!href) throw new Error('Entity link must have a destination')
				await link.focus()
				await expect(link).toBeFocused()
				await page.keyboard.press('Enter')
				await expect(page).toHaveURL(new URL(href, page.url()).href)
			}
		})
	}
}
