import { expect, test } from '@playwright/test'
import { items } from './data'

for (const prefix of ['']) {
	test(`book tools native task lifecycle ${prefix || 'root'}`, async ({
		page,
	}) => {
		const source = items.find((item) => item.id === 'book-1')
		if (!source) throw new Error('book-1 fixture missing')
		const task = {
			id: 'encoding-book-1',
			action: 'encode-m4b',
			data: {
				libraryItemId: 'book-1',
				encodeOptions: { codec: 'aac', bitrate: '128k', channels: '2' },
			},
			isFinished: false,
			isFailed: false,
			error: null,
		}
		let starts = 0
		let cancels = 0
		await page.route(
			(url) =>
				url.pathname === `${prefix}/api/tasks` ||
				url.pathname === `${prefix}/api/items/book-1/metadata-object` ||
				url.pathname.startsWith(`${prefix}/api/tools/item/book-1/`),
			async (route) => {
				const request = route.request()
				const path = new URL(request.url()).pathname
				if (path.endsWith('/tasks'))
					return route.fulfill({
						json: { tasks: [], queuedTaskData: { embedMetadata: [] } },
					})
				if (path.endsWith('/metadata-object'))
					return route.fulfill({
						json: { title: 'Metadata preview title', artist: 'Preview author' },
					})
				if (request.method() === 'DELETE') cancels++
				else starts++
				return route.fulfill({ body: 'OK' })
			},
		)
		await page.goto(`${prefix}/`)
		await page.getByLabel('Username', { exact: true }).fill('admin')
		await page.getByLabel('Password', { exact: true }).fill('password')
		await page.getByRole('button', { name: 'Sign in', exact: true }).click()
		await page.goto(`${prefix}/audiobook/book-1/manage`)
		await expect(
			page.getByText('Metadata preview title', { exact: true }),
		).toBeVisible()
		await page.getByLabel('Tool', { exact: true }).selectOption('m4b')
		await page
			.getByRole('button', { name: 'Start M4B encoding', exact: true })
			.click()
		await expect(page.getByText(/Request accepted/)).toBeVisible()
		expect(starts).toBe(1)
		const event = async (name: string, payload: unknown) =>
			page.evaluate(
				({ name, payload }) =>
					window.dispatchEvent(
						new CustomEvent('abs:socket', { detail: { event: name, payload } }),
					),
				{ name, payload },
			)
		await event('task_started', { ...task, data: { libraryItemId: 'other' } })
		await expect(
			page.getByRole('button', { name: 'Cancel M4B encoding' }),
		).toHaveCount(0)
		await event('task_started', task)
		await expect(page.getByText('Encoding M4B: 0%')).toBeVisible()
		await event('task_progress', { libraryItemId: 'book-1', progress: 47 })
		await expect(page.getByText('Encoding M4B: 47%')).toBeVisible()
		await page.getByRole('button', { name: 'Cancel M4B encoding' }).click()
		await expect.poll(() => cancels).toBe(1)
		await event('task_finished', {
			...task,
			isFinished: true,
			isFailed: true,
			error: 'Fixture encoding failed',
		})
		await expect(
			page.getByText('Task failed: Fixture encoding failed'),
		).toBeVisible()
		await page
			.getByRole('button', { name: 'Start M4B encoding', exact: true })
			.click()
		await expect.poll(() => starts).toBe(2)
		await event('task_started', { ...task, id: 'retry-task' })
		await event('task_finished', {
			...task,
			id: 'retry-task',
			isFinished: true,
		})
		await expect(page.getByText('Task finished', { exact: true })).toBeVisible()
		await page.screenshot({
			path: `/private/tmp/opencode/book-manage/tools-${prefix ? 'abs' : 'root'}.png`,
			fullPage: true,
		})
	})
}
