import { expect, test } from '@playwright/test'
import { contrast } from './contrast'
import { appMenu, chooseTheme, settleAnimations } from './shell-controls'

for (const theme of ['light', 'dark']) {
	test(`player and sidebar control contrast ${theme}`, async ({ page }) => {
		await page.goto('/new/login')
		await page.getByLabel('Username', { exact: true }).fill('listener')
		await page.getByLabel('Password', { exact: true }).fill('password')
		await page.getByRole('button', { name: 'Sign in', exact: true }).click()
		await expect(appMenu(page)).toBeVisible()
		await page.goto('/new/item/podcast-1')
		await page
			.getByRole('button', { name: 'Play The Quiet Observatory', exact: true })
			.click()
		await page
			.getByLabel('Audio playback')
			.evaluate((audio: HTMLAudioElement) => audio.pause())
		await chooseTheme(page, theme)
		await settleAnimations(page)
		const controls = [
			['speed', page.getByRole('button', { name: 'Playback rate' }), 4.5],
			[
				'back',
				page.getByRole('button', { name: 'Skip back 15 seconds', exact: true }),
				4.5,
			],
			['play', page.getByRole('button', { name: 'Play', exact: true }), 3],
			[
				'forward',
				page.getByRole('button', { name: 'Skip forward 30 seconds' }),
				4.5,
			],
			['more', page.getByRole('button', { name: 'More player actions' }), 3],
			['volume', page.getByRole('button', { name: 'Volume', exact: true }), 3],
			['library', page.getByRole('button', { name: /^Library:/ }), 4.5],
			['user', page.getByRole('button', { name: /listener · Account/ }), 4.5],
			[
				'More link',
				page.getByRole('button', { name: 'More', exact: true }),
				4.5,
			],
			[
				'episode progress',
				page.getByRole('button', {
					name: /^Mark (?:finished|unfinished): The Quiet Observatory$/,
					exact: true,
				}),
				4.5,
			],
		] as const
		for (const [name, control, minimum] of controls) {
			await expect(control).toBeVisible()
			const result = await contrast(control)
			console.log(JSON.stringify({ theme, name, ...result }))
			expect(result.ratio, `${theme} ${name}`).toBeGreaterThanOrEqual(minimum)
		}
		await page.screenshot({
			path: `/private/tmp/opencode/player-segments/${process.env.CONTRAST_LABEL || 'branch'}-controls-${theme}.png`,
		})
	})
}
