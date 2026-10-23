import { expect, test } from '@playwright/test'
import { items } from './data'
import { closeSidebar } from './shell-controls'

for (const prefix of ['', '/abs']) {
	test(`book editor series, selective match, chapters and tracks ${prefix || 'root'}`, async ({
		page,
	}) => {
		const source = items.find((item) => item.id === 'book-1')
		if (!source) throw new Error('book-1 fixture missing')
		let book = structuredClone(source) as typeof source & {
			media: Record<string, unknown>
		}
		const metadata = {
			...source.media.metadata,
			series: [{ id: 's1', name: 'Original saga', sequence: '1' }],
		}
		const tracks = [
			{
				ino: 1001,
				filename: '02.wav',
				index: 1,
				metadata: { filename: '02.wav', size: 200 },
				trackNumFromMeta: 2,
				discNumFromMeta: 1,
				duration: 5,
			},
			{
				ino: 1002,
				filename: '01.wav',
				index: 2,
				metadata: { filename: '01.wav', size: 300 },
				trackNumFromMeta: 1,
				discNumFromMeta: 2,
				duration: 8,
			},
		]
		book = {
			...book,
			media: { ...book.media, metadata, audioFiles: tracks },
		} as typeof book
		const writes: { path: string; body: Record<string, unknown> }[] = []
		await page.route(
			(url) =>
				url.pathname === `${prefix}/api/items/book-1` ||
				url.pathname.startsWith(`${prefix}/api/items/book-1/`) ||
				url.pathname.startsWith(`${prefix}/api/search/`),
			async (route) => {
				const request = route.request()
				const path = new URL(request.url()).pathname
				if (path.endsWith('/search/providers'))
					return route.fulfill({
						json: {
							providers: {
								books: [
									{ value: 'google', text: 'Google Books' },
									{ value: 'openlibrary', text: 'Open Library' },
								],
							},
						},
					})
				if (path.endsWith('/search/books'))
					return route.fulfill({
						json: [
							{
								title: 'Matched title',
								publisher: 'Matched publisher',
								series: [{ series: 'Matched saga', sequence: '4' }],
							},
						],
					})
				if (request.method() === 'GET' && path.endsWith('/book-1'))
					return route.fulfill({ json: book })
				if (request.method() === 'PATCH' || request.method() === 'POST') {
					const body = request.postDataJSON()
					writes.push({ path, body })
					if (path.endsWith('/media'))
						book = {
							...book,
							media: {
								...book.media,
								metadata: {
									...book.media.metadata,
									...body.metadata,
									...(body.metadata?.authors
										? {
												authors: body.metadata.authors.map(
													(
														row: { id?: string; name: string },
														index: number,
													) => ({
														...row,
														id: row.id ?? `new-author-${index}`,
													}),
												),
											}
										: {}),
									...(body.metadata?.series
										? {
												series: body.metadata.series.map(
													(
														row: { id?: string; name: string },
														index: number,
													) => ({
														...row,
														id: row.id ?? `new-series-${index}`,
													}),
												),
											}
										: {}),
								},
							},
						} as typeof book
					if (path.endsWith('/chapters'))
						book = {
							...book,
							media: { ...book.media, chapters: body.chapters },
						} as typeof book
					if (path.endsWith('/tracks'))
						book = {
							...book,
							media: {
								...book.media,
								audioFiles: body.orderedFileData.map(
									(row: { ino: number }, index: number) => ({
										...tracks.find((track) => track.ino === row.ino),
										index: index + 1,
									}),
								),
							},
						} as typeof book
					return route.fulfill({ json: book })
				}
				await route.continue()
			},
		)
		await page.goto(`${prefix}/new/`)
		await page.getByLabel('Username', { exact: true }).fill('admin')
		await page.getByLabel('Password', { exact: true }).fill('password')
		await page.getByRole('button', { name: 'Sign in', exact: true }).click()
		await closeSidebar(page)
		await page.goto(`${prefix}/new/audiobook/book-1/edit`)
		await page.getByLabel('Series sequence 1').fill('2.5')
		await page.getByRole('button', { name: 'Add series', exact: true }).click()
		await page.getByLabel('Series name 2').fill('Second saga')
		await page
			.getByRole('button', { name: 'Save metadata', exact: true })
			.click()
		await expect(page.getByRole('status')).toHaveText('Changes saved')
		await page.reload()
		await expect(page.getByLabel('Series sequence 1')).toHaveValue('2.5')
		await page
			.getByLabel('Provider', { exact: true })
			.selectOption('openlibrary')
		await page
			.getByRole('main')
			.getByRole('button', { name: 'Search', exact: true })
			.click()
		await page
			.getByRole('button', { name: 'Matched title', exact: true })
			.click()
		const beforeApply = writes.length
		await page.getByLabel('Apply Publisher', { exact: true }).uncheck()
		await page.getByLabel('Apply Series', { exact: true }).uncheck()
		expect(writes).toHaveLength(beforeApply)
		await page.getByRole('button', { name: 'Apply selected fields' }).click()
		await expect(page.getByLabel('Title', { exact: true }).first()).toHaveValue(
			'Matched title',
		)
		expect(writes.at(-1)?.body).toEqual({
			metadata: { title: 'Matched title' },
		})
		await page
			.getByRole('button', { name: 'Sort by filename', exact: true })
			.click()
		await page.getByRole('button', { name: 'Save track order' }).click()
		await expect(page.getByRole('status')).toHaveText('Changes saved')
		await page.reload()
		await expect(
			page.getByRole('button', { name: 'Move 01.wav up' }),
		).toBeDisabled()
		await page.screenshot({
			path: `/private/tmp/opencode/book-manage/editor-${prefix ? 'abs' : 'root'}.png`,
			fullPage: true,
		})
		await page.goto(`${prefix}/new/audiobook/book-1/chapters`)
		await page
			.getByLabel('Title', { exact: true })
			.first()
			.fill('Unsaved chapter')
		const beforeReset = writes.length
		await page.getByRole('button', { name: 'Reset chapters' }).click()
		await expect(
			page.getByLabel('Title', { exact: true }).first(),
		).not.toHaveValue('Unsaved chapter')
		expect(writes).toHaveLength(beforeReset)
		page.once('dialog', (dialog) => dialog.dismiss())
		await page.getByRole('button', { name: 'Remove all chapters' }).click()
		await expect(
			page.getByLabel('Title', { exact: true }).first(),
		).toBeVisible()
		page.once('dialog', (dialog) => dialog.accept())
		await page.getByRole('button', { name: 'Remove all chapters' }).click()
		await expect(page.getByLabel('Title', { exact: true })).toHaveCount(0)
		page.once('dialog', (dialog) => dialog.accept())
		await page.getByRole('button', { name: 'Save chapters' }).click()
		await expect(page.getByRole('status')).toHaveText('Changes saved')
		await page.screenshot({
			path: `/private/tmp/opencode/book-manage/chapters-${prefix ? 'abs' : 'root'}.png`,
			fullPage: true,
		})
	})
}
