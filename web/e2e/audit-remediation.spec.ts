import { expect, type Locator, type Page, test } from '@playwright/test'
import { items } from './data'
import { chooseTheme, closeSidebar, openSidebar } from './shell-controls'

const source = items.find((item) => item.id === 'podcast-1')
if (!source || !('episodes' in source.media))
	throw new Error('Audit acceptance requires synthetic podcast-1')
const episode = source.media.episodes[0]
const longUrl = `https://example.invalid/${'long-path-'.repeat(40)}`
const longTitle = `Audit episode 001 ${'unbroken-title'.repeat(30)}`
const richDescription = `<p>Readable paragraph &amp; entity.</p><ul><li>Readable list entry</li></ul><p><a href="${longUrl}">Readable long link ${longUrl}</a></p><script>window.__auditExecuted = true</script><img src="https://audit-hostile.invalid/image" onerror="window.__auditExecuted = true"><iframe src="https://audit-hostile.invalid/frame"></iframe><link rel="stylesheet" href="https://audit-hostile.invalid/style"><object data="https://audit-hostile.invalid/object"></object><video poster="https://audit-hostile.invalid/poster"></video><p onclick="window.__auditExecuted=true">Safe event text</p><a href="javascript:window.__auditExecuted=true">Unsafe link</a>`
const episodes = Array.from({ length: 489 }, (_, index) => ({
	...episode,
	id: index === 0 ? episode.id : `audit-episode-${index + 1}`,
	index: index + 1,
	title:
		index === 0
			? longTitle
			: `Audit episode ${String(index + 1).padStart(3, '0')}`,
	description: richDescription,
}))
const largeShow = {
	...source,
	media: { ...source.media, numEpisodes: 489, episodes },
}

// Only native fixture HTTP boundaries are doubled. Authentication still submits
// fixture credentials and obtains its own cookie/token through normal login.
async function override(
	page: Page,
	prefix: string,
	path: string,
	body: unknown,
	status = 200,
) {
	await page.route(
		(url) =>
			url.hostname === '127.0.0.1' && url.pathname === `${prefix}${path}`,
		(route) => route.fulfill({ json: body, status }),
	)
}
async function signIn(page: Page, prefix: string, username = 'listener') {
	await page.goto(`${prefix}/new/`)
	await page.getByLabel('Username', { exact: true }).fill(username)
	await page.getByLabel('Password', { exact: true }).fill('password')
	await page.getByRole('button', { name: 'Sign in', exact: true }).click()
	await expect(page).not.toHaveURL(/\/login(?:[?#]|$)/)
	await openSidebar(page)
	await expect(
		page.getByRole('searchbox', { name: 'Search library' }),
	).toBeVisible()
	await closeSidebar(page)
}
async function noOverflow(page: Page) {
	await expect
		.poll(() =>
			page.evaluate(
				() => document.documentElement.scrollWidth - window.innerWidth,
			),
		)
		.toBeLessThanOrEqual(1)
}
async function escapeReturnsFocus(page: Page, trigger: Locator) {
	await trigger.click()
	const dialog = page.getByRole('dialog')
	await expect(dialog).toBeVisible()
	await expect
		.poll(() =>
			dialog.evaluate((node) => node.contains(document.activeElement)),
		)
		.toBe(true)
	// Both tab directions must remain inside this scoped workflow.
	await page.keyboard.press('Shift+Tab')
	await expect
		.poll(() =>
			dialog.evaluate((node) => node.contains(document.activeElement)),
		)
		.toBe(true)
	await page.keyboard.press('Tab')
	await expect
		.poll(() =>
			dialog.evaluate((node) => node.contains(document.activeElement)),
		)
		.toBe(true)
	await page.keyboard.press('Escape')
	await expect(dialog).toHaveCount(0)
	await expect(trigger).toBeFocused()
}

// Pairwise-sized visual/overflow coverage, not a viewport × theme × prefix product.
for (const [width, colorScheme, prefix] of [
	[320, 'light', ''],
	[390, 'dark', '/abs'],
	[1036, 'dark', ''],
	[1280, 'light', '/abs'],
] as const) {
	test(`audit compact safe episodes: ${width} ${colorScheme} ${prefix || 'root'}`, async ({
		page,
	}, testInfo) => {
		await page.setViewportSize({ width, height: 848 })
		await page.emulateMedia({ colorScheme })
		const hostileRequests: string[] = []
		await page.route('https://audit-hostile.invalid/**', (route) => {
			hostileRequests.push(route.request().url())
			return route.abort()
		})
		await override(page, prefix, '/api/items/podcast-1', largeShow)
		await signIn(page, prefix)
		await chooseTheme(page, colorScheme)
		await page.goto(`${prefix}/new/item/podcast-1`)
		await expect(page.locator('html')).toHaveClass(
			colorScheme === 'dark' ? /dark/ : /^(?!.*dark)/,
		)
		await expect(
			page.getByRole('heading', { level: 1, name: 'Field Notes' }),
		).toBeVisible()
		// Identify episode rows by their title and playback control, never by all
		// list items: expanded rich descriptions contain legitimate nested lists.
		const rows = page
			.getByRole('listitem')
			.filter({
				has: page.getByRole('heading', { level: 3, name: /^Audit episode / }),
			})
			.filter({
				has: page.getByRole('button', { name: /^Play (?!latest episode)/ }),
			})
		const titles = rows.getByRole('heading', {
			level: 3,
			name: /^Audit episode /,
		})
		await expect(rows.first()).toBeVisible()
		expect(await rows.count()).toBeLessThan(489)
		await expect(
			page.getByText('Readable paragraph & entity.', { exact: true }),
		).toHaveCount(25)
		await noOverflow(page)
		const first = rows.first()
		const titleBox = await first
			.getByRole('heading', { level: 3 })
			.boundingBox()
		const rowBox = await first.boundingBox()
		if (!titleBox || !rowBox)
			throw new Error('Episode title and row must have visible bounds')
		expect(titleBox.width).toBeGreaterThan(
			rowBox.width * (width < 640 ? 0.9 : 0.45),
		)
		const disclosure = first.getByRole('button', {
			name: /read more|description/i,
			expanded: false,
		})
		await disclosure.focus()
		await page.keyboard.press('Enter')
		await expect(first.getByRole('button', { expanded: true })).toBeVisible()
		await expect(
			first.locator('p').filter({ hasText: 'Readable paragraph & entity.' }),
		).toBeVisible()
		await expect(
			first.getByRole('listitem').filter({ hasText: 'Readable list entry' }),
		).toBeVisible()
		await expect(
			first.getByRole('link', { name: /^Readable long link/ }),
		).toHaveAttribute('href', longUrl)
		await expect(
			first.locator(
				'script, iframe, img, link, object, video, [onerror], [onclick], a[href^="javascript:"]',
			),
		).toHaveCount(0)
		await noOverflow(page)
		expect(
			await page.evaluate(() => Reflect.get(window, '__auditExecuted')),
		).toBeUndefined()
		expect(hostileRequests).toEqual([])
		await page.screenshot({
			path: testInfo.outputPath('compact-episodes.png'),
			fullPage: false,
		})
		await testInfo.attach('actual-url', {
			body: page.url(),
			contentType: 'text/plain',
		})
		await first.getByRole('button', { expanded: true }).press('Enter')
		await escapeReturnsFocus(
			page,
			first.getByRole('button', { name: /episode controls/i }),
		)

		// Full reachability is expensive only once; accept bounded pages or show-more.
		if (width === 1036) {
			const reached = new Set<string>()
			for (let step = 0; step < 489; step++) {
				for (const title of await titles.allTextContents()) reached.add(title)
				if (reached.size === 489) break
				const advance = page.getByRole('button', {
					name: /^(next(?: page| episodes)?|(?:show|load) more(?: episodes)?)$/i,
				})
				await expect(advance).toBeEnabled()
				const before = await titles.allTextContents()
				await advance.click()
				await expect.poll(() => titles.allTextContents()).not.toEqual(before)
			}
			expect(reached.size).toBe(489)
		}
		// Existing fixture play endpoint verifies first changed row keeps episode ID.
		if (width === 390) {
			const result = page.waitForResponse(
				(response) =>
					new URL(response.url()).pathname ===
						`${prefix}/api/items/podcast-1/play/${episode.id}` &&
					response.request().method() === 'POST',
			)
			await first
				.getByRole('button', { name: /^Play (?!latest episode)/ })
				.click()
			expect((await result).ok()).toBe(true)
		}
	})
}

for (const prefix of ['', '/abs']) {
	test(`audit shelf identity, honest totals and query labels ${prefix || 'root'}`, async ({
		page,
	}, testInfo) => {
		const minified = (
			id: string,
			title: string,
			count: number | undefined,
		) => ({
			...source,
			id,
			media: {
				...source.media,
				metadata: { ...source.media.metadata, title },
				episodes: undefined,
				numEpisodes: count,
			},
		})
		const known = minified('podcast-1', 'Counted show', 489)
		const empty = minified('podcast-2', 'Empty show', 0)
		const unknown = minified('podcast-3', 'Unknown show', undefined)
		const recent = {
			...known,
			_type: 'episode',
			recentEpisode: {
				...episode,
				title: 'Distinct recent episode',
				duration: undefined,
				audioFile: { ...episode.audioFile, duration: 3671 },
			},
		}
		await override(page, prefix, '/api/libraries/podcasts/personalized', [
			{
				id: 'recently-added',
				label: 'Recently Added',
				type: 'podcast',
				entities: [known, empty, unknown],
				total: 3,
			},
			{
				id: 'newest-episodes',
				label: 'Newest Episodes',
				type: 'episode',
				entities: [
					recent,
					{
						...unknown,
						_type: 'episode',
						recentEpisode: {
							...episode,
							title: 'Duration unknown episode',
							duration: undefined,
							audioFile: null,
						},
					},
				],
				total: 2,
			},
		])
		await override(page, prefix, '/api/libraries/podcasts/recent-episodes', {
			episodes: [
				{
					...recent.recentEpisode,
					libraryItemId: known.id,
					podcast: known.media,
					downloaded: true,
				},
				{
					...episode,
					title: 'Duration unknown episode',
					duration: undefined,
					audioFile: null,
					libraryItemId: unknown.id,
					podcast: unknown.media,
					downloaded: true,
				},
			],
		})
		await override(page, prefix, '/api/libraries/podcasts/items', {
			results: [known, empty, unknown],
			total: 3,
			limit: 20,
			page: 0,
		})
		await signIn(page, prefix)
		await page.goto(`${prefix}/new/library/podcasts`)
		const card = (title: string) =>
			page.getByRole('article').filter({
				has: page.getByRole('heading', { name: title, exact: true }),
			})
		await expect(
			card('Counted show').getByText('117 unplayed of 120', { exact: true }),
		).toBeVisible()
		await expect(
			card('Empty show').getByText('117 unplayed of 120', { exact: true }),
		).toBeVisible()
		await expect(
			card('Unknown show').getByText('0 episodes', { exact: true }),
		).toHaveCount(0)
		await expect(
			card('Distinct recent episode').getByRole('heading', { level: 3 }),
		).toHaveText('Distinct recent episode')
		await expect(card('Distinct recent episode')).toContainText('Counted show')
		await expect(card('Distinct recent episode')).toContainText('01:01:11')
		await expect(card('Duration unknown episode')).not.toContainText('00:00:00')
		await expect(
			page.getByRole('button', { name: 'Item actions', exact: true }),
		).toHaveCount(0)
		await page.screenshot({
			path: testInfo.outputPath('artwork-shelves.png'),
			fullPage: false,
		})
		await page.goto(
			`${prefix}/new/library/podcasts/bookshelf?filter=feed-open&sort=media.metadata.title`,
		)
		await expect(card('Counted show')).toContainText('117 unplayed of 120')
		await page
			.getByRole('button', { name: 'View options', exact: true })
			.click()
		const filter = page.getByRole('combobox', { name: 'Filter', exact: true })
		await expect(filter).toHaveValue('feed-open')
		await expect(filter.locator('option:checked')).not.toHaveText('feed-open')
		expect(
			(
				await page
					.getByRole('combobox', { name: 'Sort', exact: true })
					.locator('option')
					.allTextContents()
			).join(' '),
		).not.toMatch(/publishedYear|authorName/)
		expect(new URL(page.url()).searchParams.get('filter')).toBe('feed-open')
		await testInfo.attach('actual-query-url', {
			body: page.url(),
			contentType: 'text/plain',
		})
		await page.goto(`${prefix}/new/library/books/bookshelf/authors`)
		await expect(page.getByRole('heading', { level: 1 })).toContainText(
			'Authors',
		)
		await page
			.getByRole('button', { name: 'View options', exact: true })
			.click()
		await expect(
			page.getByRole('combobox', { name: /^(Filter|Cover size|View)$/ }),
		).toHaveCount(0)
		await expect(
			page.getByRole('checkbox', { name: /group series/i }),
		).toHaveCount(0)
		const authorSort = page.getByRole('combobox', { name: 'Sort', exact: true })
		await expect(authorSort).toBeVisible()
		await expect(authorSort.locator('option[value="name"]')).toHaveText('Name')
		await expect(authorSort.locator('option[value="lastFirst"]')).toHaveText(
			/Last name/i,
		)
		await expect(authorSort.locator('option[value="numBooks"]')).toHaveText(
			'Book count',
		)
	})
}

for (const capability of ['restricted', 'update-only', 'admin'] as const) {
	test(`audit book capability boundary: ${capability}`, async ({ page }) => {
		if (capability !== 'admin') {
			for (const path of [
				'/login',
				'/auth/refresh',
				'/api/authorize',
				'/api/me',
			]) {
				await page.route(
					(url) => url.hostname === '127.0.0.1' && url.pathname === path,
					async (route) => {
						const response = await route.fetch()
						if (!response.ok()) return route.fulfill({ response })
						const body = await response.json()
						const user = body.user || body
						user.permissions = {
							...user.permissions,
							download: false,
							delete: false,
							upload: false,
							update: capability === 'update-only',
						}
						await route.fulfill({ response, json: body })
					},
				)
			}
		}
		await signIn(page, '', capability === 'admin' ? 'admin' : 'listener')
		await page.goto('/new/item/book-1')
		await expect(
			page.getByRole('heading', { level: 1, name: 'The Glass Orchard' }),
		).toBeVisible()
		await expect(page.locator('a[href$="/book-1/chapters"]')).toHaveCount(
			capability === 'restricted' ? 0 : 1,
		)
		await expect(page.locator('a[href$="/book-1/edit"]')).toHaveCount(
			capability === 'restricted' ? 0 : 1,
		)
		await expect(page.locator('a[href$="/book-1/manage"]')).toHaveCount(
			capability === 'admin' ? 1 : 0,
		)
		if (capability === 'restricted') {
			await expect(
				page.getByRole('button', { name: /^Item actions$/i }),
			).toHaveCount(0)
			await expect(
				page.getByRole('heading', { name: /^Item actions$/i }),
			).toHaveCount(0)
		}
	})
}

test('audit RSS modal focus, loading, error, retry and successful empty', async ({
	page,
}) => {
	let release: (() => void) | undefined
	const pending = new Promise<void>((resolve) => {
		release = resolve
	})
	let state: 'pending' | 'error' | 'empty' | 'feed' = 'pending'
	await page.route(
		(url) => url.hostname === '127.0.0.1' && url.pathname === '/abs/api/feeds',
		async (route) => {
			if (state === 'pending') await pending
			if (state === 'error')
				return route.fulfill({
					status: 503,
					json: { error: 'Audit feed unavailable' },
				})
			return route.fulfill({
				json: {
					feeds:
						state === 'feed'
							? [
									{
										id: 'audit-feed',
										slug: 'audit-feed',
										entityType: 'podcast',
										feedUrl: '/feed/audit-feed',
										meta: { title: 'Audit feed' },
										episodes: [],
									},
								]
							: [],
				},
			})
		},
	)
	await signIn(page, '/abs', 'admin')
	await page.goto('/abs/new/config/rss-feeds')
	await expect(
		page.getByRole('status').filter({ hasText: /loading/i }),
	).toBeVisible()
	await expect(page.getByText('No RSS feeds.', { exact: true })).toHaveCount(0)
	state = 'error'
	release?.()
	await expect(page.getByRole('alert')).toBeVisible()
	await expect(page.getByText('No RSS feeds.', { exact: true })).toHaveCount(0)
	state = 'empty'
	await page.getByRole('button', { name: /retry/i }).click()
	await expect(page.getByText('No RSS feeds.', { exact: true })).toBeVisible()
	state = 'feed'
	await page.reload()
	await escapeReturnsFocus(
		page,
		page.getByRole('button', { name: 'Audit feed', exact: true }),
	)
})

for (const [width, prefix] of [
	[320, ''],
	[1036, '/abs'],
] as const) {
	test(`audit Latest long disclosure ${width} ${prefix || 'root'}`, async ({
		page,
	}, testInfo) => {
		await page.setViewportSize({ width, height: 848 })
		const hostileRequests: string[] = []
		await page.route('https://audit-hostile.invalid/**', (route) => {
			hostileRequests.push(route.request().url())
			return route.abort()
		})
		await override(page, prefix, '/api/libraries/podcasts/recent-episodes', {
			episodes: [
				{
					...episodes[0],
					subtitle: '',
					libraryItemId: 'podcast-1',
					podcast: { metadata: { title: 'Distinct show' } },
				},
			],
		})
		await signIn(page, prefix)
		await page.goto(`${prefix}/new/library/podcasts/podcast/latest`)
		await expect(
			page.getByRole('heading', { name: longTitle, exact: true }),
		).toBeVisible()
		await expect(
			page.getByText('Readable paragraph & entity.', { exact: true }),
		).toHaveCount(1)
		await noOverflow(page)
		await page.getByText('Read description', { exact: true }).focus()
		await page.keyboard.press('Enter')
		await expect(
			page.getByText('Readable paragraph & entity.', { exact: true }),
		).toBeVisible()
		await expect(
			page.getByRole('link', { name: /^Readable long link/ }),
		).toHaveAttribute('href', longUrl)
		await page.getByText('Unsafe link', { exact: true }).click()
		await page.getByText('Safe event text', { exact: true }).click()
		await noOverflow(page)
		expect(hostileRequests).toEqual([])
		expect(
			await page.evaluate(() => Reflect.get(window, '__auditExecuted')),
		).toBeUndefined()
		await page.screenshot({
			path: testInfo.outputPath('latest-expanded.png'),
			fullPage: false,
		})
		await testInfo.attach('actual-url', {
			body: page.url(),
			contentType: 'text/plain',
		})
	})
}

for (const prefix of ['', '/abs']) {
	test(`audit audiobook direct tools retain context and return ${prefix || 'root'}`, async ({
		page,
	}) => {
		await signIn(page, prefix, 'admin')
		for (const section of ['chapters', 'edit', 'manage']) {
			await page.goto(`${prefix}/new/audiobook/book-1/${section}`)
			await expect(
				page.getByRole('heading', {
					level: 1,
					name: 'The Glass Orchard',
					exact: true,
				}),
			).toBeVisible()
			const back = page.getByRole('link', {
				name: /Return to audiobook The Glass Orchard/,
			})
			await expect(back).toHaveAttribute('href', `${prefix}/new/item/book-1`)
			if (section === 'chapters')
				await expect(
					page.getByRole('heading', { name: 'Cover', exact: true }),
				).toHaveCount(0)
			await back.click()
			await expect(page).toHaveURL(new RegExp(`${prefix}/new/item/book-1$`))
			await expect(
				page.getByRole('button', { name: 'Play audiobook', exact: true }),
			).toBeVisible()
		}
	})
}
