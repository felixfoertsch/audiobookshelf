import { expect, test } from '@playwright/test'
import { openSidebar } from './shell-controls'

test('collapsed desktop sidebar stays recoverable', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 848 })
	await page.goto('/')
	await page.getByLabel('Username', { exact: true }).fill('listener')
	await page.getByLabel('Password', { exact: true }).fill('password')
	await page.getByRole('button', { name: 'Sign in', exact: true }).click()
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
	await page.goto('/item/podcast-1')
	await page.getByRole('button', { name: 'Play latest episode' }).click()
	const player = page.getByRole('region', { name: 'Audio player' })
	await expect(player).toBeVisible()
	await page.keyboard.press('Control+b')
	await expect
		.poll(async () => {
			const box = await player.boundingBox()
			return box ? Math.abs(box.x + box.width / 2 - 640) : 1000
		})
		.toBeLessThan(1)
	const trigger = page.getByRole('button', { name: 'Toggle Sidebar' })
	await expect(trigger).toBeVisible()
	await trigger.click()
	await expect(
		page.getByRole('searchbox', { name: 'Search library' }),
	).toBeVisible()
})

test('320 px selection wraps and search submit has visible keyboard focus', async ({
	page,
}) => {
	await page.setViewportSize({ width: 320, height: 848 })
	await page.goto('/')
	await page.getByLabel('Username', { exact: true }).fill('listener')
	await page.getByLabel('Password', { exact: true }).fill('password')
	await page.getByRole('button', { name: 'Sign in', exact: true }).click()
	await page.goto('/library/podcasts/bookshelf')
	await page.getByRole('button', { name: 'Select', exact: true }).click()
	await page.getByRole('button', { name: 'Select page', exact: true }).click()
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true)
	await openSidebar(page)
	await page.getByRole('searchbox', { name: 'Search library' }).focus()
	await page.keyboard.press('Tab')
	const submit = page.getByRole('button', { name: 'Search', exact: true })
	await expect(submit).toBeFocused()
	const box = await submit.boundingBox()
	expect(box?.width).toBeGreaterThan(10)
	expect(box?.height).toBeGreaterThan(10)
})
