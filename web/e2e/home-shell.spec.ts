import { expect, type Page, test } from '@playwright/test'
import { chooseTheme, settleAnimations } from './shell-controls'

async function signIn(page: Page, base = '') {
	await page.goto(`${base}/new/`)
	await page.getByLabel('Username', { exact: true }).fill('admin')
	await page.getByLabel('Password', { exact: true }).fill('password')
	await page.getByRole('button', { name: 'Sign in', exact: true }).click()
	await expect(
		page.getByRole('heading', { name: 'Home', exact: true }),
	).toBeVisible()
}

test('route-independent Add podcast modal preserves route, history and focus under root and /abs', async ({
	page,
}) => {
	await signIn(page)
	for (const base of ['', '/abs']) {
		for (const path of [
			'/library/podcasts/bookshelf',
			'/library/podcasts/podcast/latest',
			'/library/podcasts/podcast/download-queue',
		]) {
			await page.goto(`${base}/new${path}`)
			const trigger = page.getByRole('link', {
				name: 'Add podcast',
				exact: true,
			})
			if (!(await trigger.isVisible())) {
				;(await page.evaluate(
					() => window.matchMedia('(max-width: 767px)').matches,
				))
					? await page
							.locator('[data-slot="sidebar-trigger"]')
							.click({ force: true })
					: await page.locator('[data-slot="sidebar-trigger"]').focus()
			}
			await trigger.click()
			const modal = page.getByRole('dialog', {
				name: 'Add podcast',
				exact: true,
			})
			await expect(modal).toBeVisible()
			await expect(page).toHaveURL(
				new RegExp(`${path.replaceAll('/', '\\/')}\\?.*addPodcast=1`),
			)
			await page.keyboard.press('Escape')
			await expect(modal).toHaveCount(0)
			await expect
				.poll(() => page.evaluate(() => location.pathname))
				.toBe(`${base}/new${path}`)
			await expect
				.poll(() =>
					page.evaluate(() =>
						new URLSearchParams(location.search).has('addPodcast'),
					),
				)
				.toBe(false)
			if (await trigger.isVisible()) await expect(trigger).toBeFocused()
			await page.goForward()
			await expect(modal).toBeVisible()
			await page.goBack()
			await expect(modal).toHaveCount(0)
		}
	}
})

for (const width of [1280, 390]) {
	for (const theme of ['light', 'dark']) {
		test(`home shell carousel and modal screenshots ${width}px ${theme}`, async ({
			page,
		}) => {
			await page.setViewportSize({ width, height: 900 })
			await signIn(page)
			await chooseTheme(page, theme)
			await page.route('**/personalized?*', async (route) => {
				const response = await route.fetch()
				const shelves = await response.json()
				const episode = shelves.find(
					(shelf: { id: string }) => shelf.id === 'newest-episodes',
				)?.entities[0]
				if (episode)
					shelves.unshift({
						id: 'continue-listening',
						label: 'Continue Listening',
						type: 'episode',
						entities: [episode, episode],
					})
				await route.fulfill({ response, json: shelves })
			})
			await page.goto('/new/library/podcasts')
			await expect(
				page.getByRole('heading', { name: 'Home', exact: true }),
			).toBeVisible()
			await settleAnimations(page)
			await expect(
				page
					.getByRole('region', { name: 'Continue Listening', exact: true })
					.locator('article'),
			).toHaveCount(1)
			await page.screenshot({
				path: `/private/tmp/opencode/home-shell/carousel-${width}-${theme}.png`,
			})
			const main = page.locator('#content')
			const sidebar = page.locator('[data-sidebar="content"]')
			for (const container of width === 390 ? [main] : [main, sidebar]) {
				await expect(container).toHaveCSS('scrollbar-width', 'none')
				const scrollbarSize = await container.evaluate((node) => {
					const style = getComputedStyle(node, '::-webkit-scrollbar')
					return Number.parseFloat(style.width)
				})
				expect(scrollbarSize).toBe(0)
			}
			const before = await page.evaluate(() => window.scrollY)
			await main.hover()
			await page.mouse.wheel(0, 480)
			await expect
				.poll(() => page.evaluate(() => window.scrollY))
				.toBeGreaterThan(before)
			await page.screenshot({
				path: `/private/tmp/opencode/home-shell/home-${width}-${theme}.png`,
				fullPage: true,
			})
			await page.goto('/new/library/podcasts/bookshelf')
			const trigger = page.getByRole('link', {
				name: 'Add podcast',
				exact: true,
			})
			await expect(
				page.getByRole('heading', { name: 'Library', exact: true }),
			).toBeVisible()
			if (width === 390)
				await page
					.getByRole('button', { name: 'Toggle Sidebar', exact: true })
					.click()
			await trigger.click()
			await expect(
				page.getByRole('dialog', { name: 'Add podcast', exact: true }),
			).toBeVisible()
			await settleAnimations(page)
			await page.screenshot({
				path: `/private/tmp/opencode/home-shell/modal-${width}-${theme}.png`,
			})
		})
	}
}

test('podcast episode count card height stays stable while summary pending', async ({
	page,
}) => {
	await signIn(page)
	let release!: () => void
	const pending = new Promise<void>((resolve) => {
		release = resolve
	})
	await page.route('**/episode-summary', async (route) => {
		await pending
		await route.continue()
	})
	await page.goto('/new/library/podcasts/bookshelf')
	const fallback = page.getByText(/downloaded · checking feed/).first()
	await expect(fallback).toBeVisible()
	const card = page.locator('article').first()
	const before = await card.boundingBox()
	release()
	await expect(page.getByText('3/120 (3 %)').first()).toBeVisible()
	await expect.poll(async () => card.boundingBox()).toEqual(before)
})
