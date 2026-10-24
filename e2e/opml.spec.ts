import { expect, type Page, test } from '@playwright/test'
import { appMenu, closeSidebar, openSidebar } from './shell-controls'

const text =
	'<opml><body><outline type="rss" title="Private original feed" xmlUrl="http://192.168.1.2/feed"/></body></opml>'
async function signIn(page: Page, prefix: string) {
	await page.goto(`${prefix}/new/login`)
	await page.getByLabel('Username', { exact: true }).fill('admin')
	await page.getByLabel('Password', { exact: true }).fill('password')
	const login = page.waitForResponse(
		(response) =>
			new URL(response.url()).pathname === `${prefix}/login` &&
			response.request().method() === 'POST' &&
			response.ok(),
	)
	await page.getByRole('button', { name: 'Sign in', exact: true }).click()
	await login
	await openSidebar(page)
	await expect(appMenu(page)).toBeVisible()
	await closeSidebar(page)
	await page.goto(`${prefix}/new/library/podcasts/podcast/search`)
	await expect(page.getByLabel('Import OPML', { exact: true })).toBeEnabled()
}
async function upload(page: Page) {
	await page.getByLabel('Import OPML', { exact: true }).setInputFiles({
		name: 'original.opml',
		mimeType: 'text/xml',
		buffer: Buffer.from(text),
	})
}
for (const prefix of ['', '/abs'])
	test(`OPML native parse/review/import ${prefix || 'root'}`, async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 })
		const outbound: string[] = [],
			calls: string[] = []
		await page.route('**/*', async (route) => {
			const request = route.request(),
				url = new URL(request.url())
			if (
				url.origin !== new URL(page.url()).origin &&
				page.url() !== 'about:blank'
			) {
				outbound.push(url.href)
				await route.abort()
				return
			}
			if (url.pathname === `${prefix}/api/podcasts/opml/parse`) {
				expect(request.method()).toBe('POST')
				expect(request.postDataJSON()).toEqual({ opmlText: text })
				calls.push('parse')
				await route.fulfill({
					json: {
						feeds: [
							{
								title: 'Private original feed',
								feedUrl: 'http://192.168.1.2/feed',
							},
						],
					},
				})
				return
			}
			if (url.pathname === `${prefix}/api/podcasts/opml/create`) {
				expect(request.method()).toBe('POST')
				expect(request.postDataJSON()).toEqual({
					feeds: ['http://192.168.1.2/feed'],
					folderId: 'podcasts-folder',
					libraryId: 'podcasts',
					autoDownloadEpisodes: false,
				})
				calls.push('create')
				await route.fulfill({
					status: 200,
					contentType: 'text/plain',
					body: 'OK',
				})
				return
			}
			await route.continue()
		})
		await signIn(page, prefix)
		await upload(page)
		const review = page.getByRole('dialog', { name: 'Review OPML feeds' })
		await expect(review).toBeVisible()
		await expect
			.poll(() =>
				review.evaluate(
					(dialog: HTMLDialogElement) =>
						dialog.open && dialog.contains(document.activeElement),
				),
			)
			.toBe(true)
		await expect(review.getByText('1. Private original feed')).toBeVisible()
		await expect(
			review.getByText('http://192.168.1.2/feed', { exact: true }),
		).toBeVisible()
		await expect(review.getByLabel('Destination folder')).toHaveValue(
			'podcasts-folder',
		)
		await expect(
			review.getByLabel('Automatically download episodes'),
		).not.toBeChecked()
		const bounds = await review.boundingBox()
		expect(bounds).not.toBeNull()
		if (!bounds) throw new Error('Review dialog has no rendered bounds')
		expect(bounds.x).toBeGreaterThanOrEqual(0)
		expect(bounds.x + bounds.width).toBeLessThanOrEqual(390)
		await review.getByRole('button', { name: 'Add podcasts' }).click()
		await expect(review).toHaveCount(0)
		await expect(
			page.getByRole('status').filter({ hasText: 'Podcast import started.' }),
		).toBeVisible()
		expect(calls).toEqual(['parse', 'create'])
		expect(outbound).toEqual([])
	})

test('OPML empty parse, retry and keyboard cancellation preserve upload focus', async ({
	page,
}) => {
	let attempt = 0
	await page.route('**/api/podcasts/opml/parse', async (route) => {
		expect(route.request().method()).toBe('POST')
		expect(route.request().postDataJSON()).toEqual({ opmlText: text })
		await route.fulfill({
			json: {
				feeds:
					++attempt === 1
						? []
						: [
								{
									title: 'Retry feed',
									feedUrl: 'https://example.invalid/feed',
								},
							],
			},
		})
	})
	let creates = 0
	await page.route('**/api/podcasts/opml/create', async (route) => {
		creates++
		await route.abort()
	})
	await signIn(page, '')
	await upload(page)
	await expect(
		page.getByRole('alert').filter({ hasText: 'Could not read OPML feeds.' }),
	).toBeVisible()
	await expect(page.getByLabel('Import OPML', { exact: true })).toHaveValue('')
	await upload(page)
	await expect(
		page.getByRole('dialog', { name: 'Review OPML feeds' }),
	).toBeVisible()
	await page.keyboard.press('Escape')
	await expect(
		page.getByRole('dialog', { name: 'Review OPML feeds' }),
	).toHaveCount(0)
	await expect(page.getByLabel('Import OPML', { exact: true })).toBeFocused()
	expect(creates).toBe(0)
	await expect(page.getByText(/Podcast import started/)).toHaveCount(0)
})
