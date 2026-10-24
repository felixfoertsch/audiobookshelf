import { existsSync, readFileSync, statSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import { realRecordsSchema } from './real-media/schema'
import { appMenu, openPlayerOptions } from './shell-controls'

// Validate bounded metadata without importing load.ts, which hashes full tracks.
const manifest = new URL('./media/real/manifest.json', import.meta.url)
if (existsSync(manifest) && statSync(manifest).size > 1_000_000)
	throw new Error('Oversized local real-media manifest')
const records = existsSync(manifest)
	? realRecordsSchema.parse(JSON.parse(readFileSync(manifest, 'utf8')))
	: []
const ready =
	records.length === 3 &&
	records.every((record) =>
		record.tracks.every((track) => {
			const file = new URL(`./media/${track.file}`, import.meta.url)
			return existsSync(file) && statSync(file).size === track.size
		}),
	)
async function login(page: Page, prefix: string) {
	await page.goto(`${prefix}/login`)
	await page.getByLabel('Username', { exact: true }).fill('listener')
	await page.getByLabel('Password', { exact: true }).fill('password')
	await page.getByRole('button', { name: 'Sign in', exact: true }).click()
	await expect(appMenu(page).first()).toBeVisible()
}
async function advancing(page: Page) {
	const audio = page.getByLabel('Audio playback')
	await expect(audio).toBeAttached()
	await expect(
		page
			.getByRole('region', { name: 'Audio player' })
			.or(page.getByRole('dialog', { name: 'Player options' })),
	).toBeVisible()
	const before = await audio.evaluate(
		(node: HTMLAudioElement) => node.currentTime,
	)
	await expect
		.poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentTime))
		.toBeGreaterThan(before + 0.1)
}
async function seek(page: Page, value: number) {
	if (!(await page.getByRole('dialog', { name: 'Player options' }).isVisible()))
		await openPlayerOptions(page)
	await page.getByLabel('Original position (seconds)').fill(String(value))
	await page.getByLabel('Original position (seconds)').press('Enter')
	await page.getByLabel('Sleep timer').focus()
}

test.describe('local real-media browser playback', () => {
	test.skip(
		process.env.REAL_PLAYBACK !== '1',
		'Opt in with REAL_PLAYBACK=1; local media never downloaded by tests',
	)
	test.skip(
		!ready,
		'Local real-media cache absent/incomplete; populate ignored manifest and files first',
	)
	for (const prefix of ['']) {
		for (const id of ['real-low', 'real-end-world']) {
			test(`${prefix || 'root'} ${id}: episode metadata, playback and range seek`, async ({
				page,
			}) => {
				const record = records.find((record) => record.id === id)
				if (!record) throw new Error(`Required manifest record missing: ${id}`)
				const episode = record.tracks[0]
				const errors: string[] = []
				let authenticated = false
				page.on('response', (response) => {
					if (
						!authenticated &&
						response.status() === 401 &&
						new URL(response.url()).pathname === `${prefix}/auth/refresh`
					)
						return
					if (response.status() >= 400)
						errors.push(
							`${response.status()} ${new URL(response.url()).pathname}`,
						)
				})
				await login(page, prefix)
				authenticated = true
				await page.goto(`${prefix}/item/${record.id}`)
				await expect(
					page.getByText(record.title, { exact: true }).first(),
				).toBeVisible()
				await expect(
					page.getByText(episode.title, { exact: true }).first(),
				).toBeVisible()
				const row = page.locator('li').filter({
					has: page.getByRole('heading', {
						name: episode.title,
						exact: true,
					}),
				})
				await row
					.getByRole('button', { name: `Play ${episode.title}`, exact: true })
					.click()
				await advancing(page)
				await seek(page, episode.duration * 0.6)
				await advancing(page)
				// Explicit HTTP range checks supplement, never replace, browser progress.
				const source = await page
					.getByLabel('Audio playback')
					.evaluate((node: HTMLAudioElement) => node.currentSrc)
				const range = await page.request.get(source, {
					headers: { Range: 'bytes=100000-100127' },
				})
				expect(range.status()).toBe(206)
				expect(range.headers()['content-range']).toMatch(
					/^bytes 100000-100127\//,
				)
				expect(errors).toEqual([])
			})
		}
		const book = records.find((record) => record.kind === 'book')
		test(`${prefix || 'root'} full book: global seek, chapters and persistent session`, async ({
			page,
		}) => {
			expect(book).toBeTruthy()
			if (!book) throw new Error('Required full-book manifest record missing')
			expect(book.tracks).toHaveLength(7)
			const total = book.tracks.reduce((sum, track) => sum + track.duration, 0)
			const starts: number[] = []
			book.tracks.reduce((offset, track) => {
				starts.push(offset)
				return offset + track.duration
			}, 0)
			let plays = 0
			const errors: string[] = []
			page.on('request', (request) => {
				if (
					request.method() === 'POST' &&
					new URL(request.url()).pathname.includes(`/api/items/${book.id}/play`)
				)
					plays++
			})
			let authenticated = false
			page.on('response', (response) => {
				if (
					!authenticated &&
					response.status() === 401 &&
					new URL(response.url()).pathname === `${prefix}/auth/refresh`
				)
					return
				if (response.status() >= 400)
					errors.push(
						`${response.status()} ${new URL(response.url()).pathname}`,
					)
			})
			await login(page, prefix)
			authenticated = true
			await page.goto(`${prefix}/item/${book.id}`)
			await expect(
				page.getByText(book.title, { exact: true }).first(),
			).toBeVisible()
			await page
				.getByRole('button', { name: 'Play audiobook', exact: true })
				.first()
				.click()
			await advancing(page)
			await openPlayerOptions(page)
			await expect(
				page.getByLabel('Original position (seconds)'),
			).toHaveAttribute('max', String(total))
			// Cross first native file boundary through actual media end, not a synthetic event.
			await seek(page, book.tracks[0].duration - 0.5)
			await expect
				.poll(() =>
					page
						.getByLabel('Audio playback')
						.evaluate((node: HTMLAudioElement) => node.currentSrc),
				)
				.toContain(book.tracks[1].id)
			await advancing(page)
			await expect
				.poll(async () =>
					Number(
						await page.getByLabel('Original position (seconds)').inputValue(),
					),
				)
				.toBeGreaterThanOrEqual(starts[1])
			await page
				.getByText('Chapters, bookmarks, queue and settings', { exact: true })
				.click()
			for (const index of book.tracks.keys()) {
				const local = Math.min(5, book.tracks[index].duration / 4)
				await seek(page, starts[index] + local)
				await expect
					.poll(() =>
						page
							.getByLabel('Audio playback')
							.evaluate((node: HTMLAudioElement) => node.currentSrc),
					)
					.toContain(
						index === 0
							? `/media/${book.id}?`
							: `/media/${book.tracks[index].id}?`,
					)
				await expect
					.poll(async () =>
						Math.abs(
							(await page
								.getByLabel('Audio playback')
								.evaluate((node: HTMLAudioElement) => node.currentTime)) -
								local,
						),
					)
					.toBeLessThan(3)
				await advancing(page)
				await expect
					.poll(async () =>
						Math.abs(
							Number(
								await page
									.getByLabel('Original position (seconds)')
									.inputValue(),
							) -
								(starts[index] + local),
						),
					)
					.toBeLessThan(3)
				await expect(
					page.getByRole('button', {
						name: new RegExp(
							book.tracks[index].title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
						),
					}),
				).toBeVisible()
				await expect
					.poll(() =>
						page
							.getByLabel('Audio playback')
							.evaluate(
								(node: HTMLAudioElement) =>
									!node.paused && !node.ended && node.error === null,
							),
					)
					.toBe(true)
			}
			for (const local of [
				book.tracks[6].duration / 2,
				book.tracks[6].duration - 5,
			]) {
				await seek(page, starts[6] + local)
				await advancing(page)
			}
			await page
				.getByRole('button', {
					name: new RegExp(
						book.tracks[1].title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
					),
				})
				.click()
			await advancing(page)
			await page.keyboard.press('Escape')
			await page
				.getByRole('link', { name: 'Audiobookshelf', exact: true })
				.click()
			await advancing(page)
			expect(plays).toBe(1)
			expect(errors).toEqual([])
		})
	}
})
