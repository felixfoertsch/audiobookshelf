import { writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { closeSidebar, openSidebar } from './shell-controls'

for (const prefix of ['', '/abs']) {
	test(`compact player ${prefix || 'root'}`, async ({
		page,
		browserName,
	}, testInfo) => {
		if (browserName === 'chromium') {
			const cdp = await page.context().newCDPSession(page)
			await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 })
		}
		await page.route('**/api/items/podcast-1/play/*', async (route) => {
			const response = await route.fetch()
			const data = await response.json()
			const first = { ...data.audioTracks[0], duration: 12, startOffset: 0 }
			data.duration = 24
			data.audioTracks = [
				first,
				{
					...first,
					index: 1,
					startOffset: 12,
					contentUrl: `${first.contentUrl}?part=2`,
				},
			]
			await route.fulfill({ response, json: data })
		})
		await page.goto(`${prefix}/new/`)
		await page.getByLabel('Username', { exact: true }).fill('listener')
		await page.getByLabel('Password', { exact: true }).fill('password')
		await page.getByRole('button', { name: 'Sign in', exact: true }).click()
		await page
			.getByRole('link', { name: /^Field Notes/ })
			.first()
			.click()
		await page
			.getByRole('button', { name: 'Play latest episode', exact: true })
			.first()
			.click()
		const audio = page.getByLabel('Audio playback')
		const player = page.getByRole('region', {
			name: 'Audio player',
			includeHidden: true,
		})
		await expect(player).toBeVisible()
		await expect(audio).toBeAttached()
		await expect
			.poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentTime))
			.toBeGreaterThan(0.1)
		await expect(page.locator('audio')).toHaveCount(1)
		await expect(audio).not.toHaveAttribute('controls', '')
		const playPause = player.getByRole('button', { name: 'Pause', exact: true })
		await expect(playPause).toBeVisible()
		await expect(
			player.getByRole('button', { name: 'Skip back 15 seconds' }),
		).toBeVisible()
		await expect(
			player.getByRole('button', { name: 'Skip forward 30 seconds' }),
		).toBeVisible()
		await expect(
			player.getByRole('button', { name: 'Playback rate' }),
		).toBeVisible()
		const progress = player.getByRole('slider', { name: 'Playback progress' })
		await expect(progress).toBeVisible()
		await page.setViewportSize({ width: 1280, height: 900 })
		await expect(
			player.getByRole('button', { name: 'Playback rate' }),
		).toBeVisible()
		await expect(
			player.getByRole('button', { name: 'Skip back 15 seconds' }),
		).toBeVisible()
		const measurements = []
		for (const theme of ['light', 'dark']) {
			await page.evaluate(
				(theme) =>
					document.documentElement.classList.toggle('dark', theme === 'dark'),
				theme,
			)
			for (const width of [320, 390, 1036, 1280]) {
				await page.setViewportSize({ width, height: 900 })
				if (width === 390) await openSidebar(page)
				const size = await player.evaluate((node) => ({
					height: node.getBoundingClientRect().height,
					width: node.getBoundingClientRect().width,
					left: node.getBoundingClientRect().left,
					right: node.getBoundingClientRect().right,
					bottom: node.getBoundingClientRect().bottom,
					radius: Number.parseFloat(getComputedStyle(node).borderRadius),
					blur: getComputedStyle(node).backdropFilter,
					scrollWidth: node.scrollWidth,
					documentWidth: document.documentElement.scrollWidth,
				}))
				measurements.push({ theme, viewport: width, ...size })
				expect(size.height).toBeLessThanOrEqual(width < 640 ? 100 : 80)
				expect(size.width).toBeLessThanOrEqual(768)
				expect(size.left).toBeGreaterThanOrEqual(8)
				expect(size.right).toBeLessThanOrEqual(width - 8)
				expect(size.bottom).toBeLessThanOrEqual(892)
				expect(size.radius).toBeGreaterThanOrEqual(16)
				expect(size.blur).not.toBe('none')
				expect(size.scrollWidth).toBeLessThanOrEqual(size.width)
				expect(size.documentWidth).toBeLessThanOrEqual(width)
				if (width === 390) {
					await page.screenshot({
						path: `/private/tmp/opencode/apple-ref/out/player2/${prefix ? 'abs-' : ''}${theme}-${width}.png`,
					})
					await closeSidebar(page)
					await page.screenshot({
						path: `/private/tmp/opencode/apple-ref/out/player2/${prefix ? 'abs-' : ''}${theme}-390-player.png`,
					})
				} else if (width === 1280) {
					await page.screenshot({
						path: `/private/tmp/opencode/apple-ref/out/player2/${prefix ? 'abs-' : ''}${theme}-${width}.png`,
					})
				}
			}
		}
		await writeFile(
			testInfo.outputPath('native-layout.json'),
			JSON.stringify(measurements, null, 2),
		)
		await testInfo.attach('native-layout.json', {
			body: JSON.stringify(measurements, null, 2),
			contentType: 'application/json',
		})
		await playPause.click()
		await expect
			.poll(() => audio.evaluate((node: HTMLAudioElement) => node.paused))
			.toBe(true)
		await player.getByRole('button', { name: 'Play', exact: true }).click()
		await expect
			.poll(() => audio.evaluate((node: HTMLAudioElement) => node.paused))
			.toBe(false)
		await player.getByRole('button', { name: 'Pause', exact: true }).click()
		await expect
			.poll(() => audio.evaluate((node: HTMLAudioElement) => node.paused))
			.toBe(true)
		await audio.evaluate((node: HTMLAudioElement) => {
			node.currentTime = 6
			node.volume = 0.4
		})
		await expect(progress).toHaveAttribute('aria-valuenow', '6')
		await progress.focus()
		await page.keyboard.press('ArrowRight')
		await expect
			.poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentTime))
			.toBeGreaterThan(6)
		await audio.evaluate((node: HTMLAudioElement) => {
			node.currentTime = 6
		})
		await player.getByRole('button', { name: 'Playback rate' }).click()
		await expect(
			page.getByRole('menuitem', { name: '0.25×', exact: true }),
		).toBeVisible()
		await expect(
			page.getByRole('menuitem', { name: '4×', exact: true }),
		).toBeVisible()
		await page.getByRole('menuitem', { name: '1.5×', exact: true }).click()
		await player.getByRole('button', { name: 'Volume', exact: true }).click()
		const volume = page.getByRole('slider', { name: 'Volume' })
		await expect(volume).toBeVisible()
		await expect(volume).toHaveAttribute('aria-valuenow', '0.4')
		await expect(
			page.getByRole('button', { name: 'Mute', exact: true }),
		).toBeVisible()
		await page.getByRole('button', { name: 'Mute', exact: true }).click()
		await expect(
			page.getByRole('button', { name: 'Unmute', exact: true }),
		).toBeVisible()
		await page.getByRole('button', { name: 'Unmute', exact: true }).click()
		await page.keyboard.press('Escape')
		await page.setViewportSize({ width: 1280, height: 900 })
		await page
			.getByRole('button', { name: 'Player options', exact: true })
			.click()
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						JSON.parse(localStorage.getItem('userSettings') || '{}')
							.playbackRate,
				),
			)
			.toBe(1.5)
		await page.keyboard.press('Escape')
		await player.getByRole('button', { name: 'More player actions' }).click()
		await page
			.getByRole('menuitem', { name: 'Player options', exact: true })
			.click()
		await expect(
			page.getByRole('dialog', { name: 'Player options' }),
		).toBeVisible()
		await expect(page.getByLabel('Playback speed')).toHaveValue('1.5')
		const seekInput = page.getByLabel('Original position (seconds)')
		await seekInput.focus()
		await expect(seekInput).toBeFocused()
		await seekInput.fill('')
		await audio.evaluate((node: HTMLAudioElement) => {
			node.dataset.seeks = '0'
			node.addEventListener('seeking', () => {
				node.dataset.seeks = String(Number(node.dataset.seeks) + 1)
			})
		})
		await seekInput.pressSequentially('1')
		await audio.evaluate((node) => node.dispatchEvent(new Event('timeupdate')))
		await seekInput.pressSequentially('8')
		await audio.evaluate((node) => node.dispatchEvent(new Event('timeupdate')))
		await expect(seekInput).toHaveValue('18')
		await expect(audio).toHaveAttribute('data-seeks', '0')
		await seekInput.press('Enter')
		await expect
			.poll(() => audio.evaluate((node: HTMLAudioElement) => node.readyState))
			.toBeGreaterThanOrEqual(2)
		await expect
			.poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentSrc))
			.toContain('part=2')
		await expect
			.poll(() => audio.evaluate((node: HTMLAudioElement) => node.playbackRate))
			.toBe(1.5)
		await expect(page.getByLabel('Playback speed')).toHaveValue('1.5')
		await expect.poll(() => audio.getAttribute('data-seeks')).toBe('1')
		await page.keyboard.press('Escape')
		await expect(
			page.getByRole('button', { name: 'Player options' }),
		).toBeFocused()
		await audio.evaluate((node) => {
			node.dataset.survivor = 'yes'
		})
		await page.goBack()
		await expect(audio).toHaveAttribute('data-survivor', 'yes')
		expect(
			await audio.evaluate((node: HTMLAudioElement) => ({
				time: node.currentTime,
				rate: node.playbackRate,
				volume: node.volume,
				paused: node.paused,
			})),
		).toEqual({ time: 6, rate: 1.5, volume: 0.4, paused: true })
		await page
			.getByRole('link', { name: /^Field Notes/ })
			.first()
			.click()
		await page
			.getByRole('button', { name: 'Play latest episode', exact: true })
			.first()
			.click()
		await expect
			.poll(() => audio.evaluate((node: HTMLAudioElement) => node.readyState))
			.toBeGreaterThanOrEqual(2)
		await expect
			.poll(() => audio.evaluate((node: HTMLAudioElement) => node.playbackRate))
			.toBe(1.5)
		expect(await audio.evaluate((node: HTMLAudioElement) => node.volume)).toBe(
			0.4,
		)
		expect(
			await page.evaluate(
				() =>
					JSON.parse(localStorage.getItem('userSettings') || '{}').playbackRate,
			),
		).toBe(1.5)
		await player.getByRole('button', { name: 'Pause', exact: true }).click()
		await page.unrouteAll({ behavior: 'wait' })
	})
}
