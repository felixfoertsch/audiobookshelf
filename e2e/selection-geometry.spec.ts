import { expect, test } from '@playwright/test'
import { chooseTheme, settleAnimations } from './shell-controls'

for (const prefix of ['']) {
	for (const width of [390, 1280]) {
		for (const library of ['books', 'podcasts']) {
			for (const view of ['grid', 'list', 'detail']) {
				test(`selection geometry and keyboard ${library} ${view} ${width} ${prefix || 'root'}`, async ({
					page,
				}) => {
					await page.setViewportSize({ width, height: 900 })
					await page.goto(`${prefix}/`)
					await page.getByLabel('Username', { exact: true }).fill('listener')
					await page.getByLabel('Password', { exact: true }).fill('password')
					await page
						.getByRole('button', { name: 'Sign in', exact: true })
						.click()
					await page.goto(`${prefix}/library/${library}/bookshelf?view=${view}`)
					for (const theme of ['light', 'dark'] as const) {
						await chooseTheme(page, theme)
						await settleAnimations(page)
						const entries = page.getByRole('article')
						await expect(entries.first()).toBeVisible()
						const rects = () =>
							entries.evaluateAll((nodes) =>
								nodes.map((node) => {
									const { x, y, width, height } = node.getBoundingClientRect()
									return { x, y, width, height }
								}),
							)
						const before = await rects()
						const name = `${prefix ? 'abs' : 'root'}-${width}-${theme}-${library}-${view}`
						await page.screenshot({
							path: `/private/tmp/opencode/select-playlists/${name}-normal.png`,
						})
						await page
							.getByRole('button', { name: 'Select', exact: true })
							.click()
						await expect(
							page.getByRole('region', { name: 'Selection', exact: true }),
						).toBeVisible()
						await expect.poll(rects).toEqual(before)
						const checkbox = entries.first().getByRole('checkbox')
						await checkbox.focus()
						await page.keyboard.press('Space')
						await expect(checkbox).toBeChecked()
						await expect.poll(rects).toEqual(before)
						await entries.first().getByRole('link').first().focus()
						await page.keyboard.press('Space')
						await expect(checkbox).not.toBeChecked()
						await page.screenshot({
							path: `/private/tmp/opencode/select-playlists/${name}-select.png`,
						})
						await page.keyboard.press('Escape')
						await expect(
							page.getByRole('button', { name: 'Select', exact: true }),
						).toBeFocused()
						await expect(checkbox).toHaveCount(0)
					}
				})
			}
		}
	}
}
