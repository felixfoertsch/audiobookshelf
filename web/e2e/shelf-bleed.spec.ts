import { expect, test } from '@playwright/test'

for (const prefix of ['', '/abs'])
	for (const width of [390, 1280, 1920])
		test(`shelves bleed beneath sidebar ${prefix || 'root'} ${width}`, async ({
			page,
		}) => {
			await page.setViewportSize({ width, height: 848 })
			await page.route('**/api/items/*/cover*', async (route) => {
				await route.fulfill({
					response: await route.fetch({
						url: route
							.request()
							.url()
							.replace(/(\/api\/items\/[^/]+)-\d+(\/cover)/, '$1$2'),
					}),
				})
			})
			await page.route(
				`**${prefix}/api/libraries/podcasts/personalized*`,
				async (route) => {
					const response = await route.fetch()
					const shelves = await response.json()
					for (const shelf of shelves) {
						const source = shelf.entities[0]
						shelf.entities = Array.from({ length: 20 }, (_, i) => ({
							...source,
							id: `${source.id}-${i}`,
						}))
					}
					await route.fulfill({ json: shelves })
				},
			)
			await page.goto(`${prefix}/new/`)
			await page.getByLabel('Username', { exact: true }).fill('listener')
			await page.getByLabel('Password', { exact: true }).fill('password')
			await page.getByRole('button', { name: 'Sign in', exact: true }).click()
			await page.goto(`${prefix}/new/library/podcasts`)
			const scroller = page.locator('.snap-x').first()
			await expect(scroller.locator('article')).toHaveCount(20)
			const measure = () =>
				scroller.evaluate((node) => {
					const rect = node.getBoundingClientRect()
					const content = document.querySelector('#content')
					if (!content) throw new Error('Missing content container')
					return {
						left: rect.left,
						right: rect.right,
						first: node.children[0].getBoundingClientRect().left,
						content:
							content.getBoundingClientRect().left +
							Number.parseFloat(getComputedStyle(content).paddingLeft),
						sidebar:
							document
								.querySelector('[data-slot="sidebar-container"]')
								?.getBoundingClientRect().right ?? 0,
						document: document.documentElement.scrollWidth,
					}
				})
			const before = await measure()
			console.log(JSON.stringify({ prefix, width, rest: before }))
			if (width === 1280 && !prefix)
				await page.screenshot({
					path: `/private/tmp/opencode/shelf-bleed/${process.env.SHELF_CAPTURE || 'after'}-desktop.png`,
				})
			expect(before.right).toBe(width)
			expect(before.first).toBe(before.content)
			expect(before.left).toBe(0)
			expect(before.document).toBeLessThanOrEqual(width)
			await scroller.evaluate((node) => {
				node.scrollLeft = 176
			})
			await expect
				.poll(() => scroller.evaluate((node) => node.scrollLeft))
				.toBeGreaterThan(0)
			if (width === 1280) {
				await expect
					.poll(() =>
						scroller
							.locator('article')
							.first()
							.evaluate((node) => node.getBoundingClientRect().left),
					)
					.toBeLessThan(before.sidebar)
				expect(
					await scroller
						.locator('article')
						.first()
						.evaluate((node) => {
							const rect = node.getBoundingClientRect()
							return !!document
								.elementFromPoint(Math.max(1, rect.left + 20), rect.top + 20)
								?.closest('[data-slot="sidebar-container"]')
						}),
				).toBe(true)
				console.log(
					JSON.stringify({
						prefix,
						overlap: await scroller.locator('article').first().boundingBox(),
					}),
				)
				if (!prefix)
					await page.screenshot({
						path: '/private/tmp/opencode/shelf-bleed/after-scrolled-desktop.png',
					})
			}
			// Tab back into first card after it has moved beneath the sidebar.
			await scroller.locator('..').locator('h2 a').focus()
			await page.keyboard.press('Tab')
			await expect(
				scroller.locator('article').first().getByRole('link').first(),
			).toBeFocused()
			await expect
				.poll(() =>
					scroller
						.locator('article')
						.first()
						.evaluate((node) => node.getBoundingClientRect().left),
				)
				.toBeGreaterThanOrEqual(before.content)
			expect((await measure()).document).toBeLessThanOrEqual(width)
			const lastLink = scroller
				.locator('article')
				.last()
				.getByRole('link')
				.first()
			await lastLink.focus()
			await expect
				.poll(() =>
					scroller
						.locator('article')
						.last()
						.evaluate((node) => node.getBoundingClientRect().right),
				)
				.toBeLessThanOrEqual(width)
			await page.goto(`${prefix}/new/library/podcasts/podcast/latest`)
			await expect(page.getByRole('heading', { level: 1 })).toHaveText(
				'Latest episodes',
			)
			expect(
				await page.evaluate(() => document.documentElement.scrollWidth),
			).toBeLessThanOrEqual(width)
		})
