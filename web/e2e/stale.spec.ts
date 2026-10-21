import { expect, test } from '@playwright/test'
import { appMenu, chooseLibrary } from './shell-controls'

test('cached page candidates never override fresh stale session', async ({
	page,
}) => {
	await page.route(
		'**/api/items/podcast-1/play/podcast-1-ep-1',
		async (route) => {
			const response = await route.fetch()
			const data = await response.json()
			data.libraryItem.media.episodes[0].adAnalysis = {
				status: 'stale',
				segments: [],
			}
			await route.fulfill({ response, json: data })
		},
	)
	await page.goto('/new/')
	await page.getByLabel('Username', { exact: true }).fill('listener')
	await page.getByLabel('Password', { exact: true }).fill('password')
	await page.getByRole('button', { name: 'Sign in', exact: true }).click()
	await expect(appMenu(page)).toBeVisible()
	await chooseLibrary(page, 'podcasts')
	await page
		.getByRole('link', { name: /^Field Notes/ })
		.first()
		.click()
	await expect(page).toHaveURL('/new/item/podcast-1')
	await page
		.getByRole('button', { name: 'Play latest episode', exact: true })
		.click()
	const audio = page.getByLabel('Audio playback')
	await expect
		.poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentTime))
		.toBeGreaterThan(0.1)
	await page.getByRole('button', { name: 'Player options' }).click()
	await expect(
		page.getByRole('checkbox', { name: 'Skip detected inserted audio' }),
	).toBeDisabled()
	await audio.evaluate((node: HTMLAudioElement) => {
		node.currentTime = 2.2
		node.dispatchEvent(new Event('timeupdate'))
	})
	const current = await audio.evaluate(
		(node: HTMLAudioElement) => node.currentTime,
	)
	expect(current).toBeGreaterThanOrEqual(2.2)
	expect(current).toBeLessThan(3.8)
})
