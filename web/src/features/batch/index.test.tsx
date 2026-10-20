import '@testing-library/jest-dom/vitest'
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BatchPage } from './index'

const mocks = vi.hoisted(() => ({
	api: vi.fn(),
	blocker: vi.fn(),
	navigate: vi.fn(),
}))
vi.mock('@tanstack/react-router', () => ({
	useNavigate: () => mocks.navigate,
	useBlocker: mocks.blocker,
}))
vi.mock('../../api', () => ({
	api: mocks.api,
	useAuth: (selector: (state: unknown) => unknown) =>
		selector({ user: { id: 'u', type: 'root' } }),
}))
afterEach(() => {
	cleanup()
	vi.resetAllMocks()
})
describe('native batch field preservation', () => {
	it('restores query selection, keeps author/series IDs, and blocks dirty navigation', async () => {
		const item = {
			id: 'book',
			mediaType: 'book',
			media: {
				tags: ['tag'],
				metadata: {
					title: 'Title',
					authors: [{ id: 'author', name: 'Writer' }],
					series: [{ id: 'series', name: 'Saga', sequence: '2' }],
					isbn: 'ISBN',
					asin: 'ASIN',
				},
			},
		}
		mocks.api.mockImplementation(async (path: string) =>
			path.endsWith('/get')
				? { libraryItems: [item] }
				: { success: true, updates: 1 },
		)
		render(<BatchPage ids="book" />)
		await screen.findByDisplayValue('ISBN')
		expect(JSON.parse(mocks.api.mock.calls[0][2].body)).toEqual({
			libraryItemIds: ['book'],
		})
		fireEvent.change(screen.getByLabelText('isbn'), {
			target: { value: 'NEW' },
		})
		const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
		expect(mocks.blocker.mock.calls.at(-1)?.[0].shouldBlockFn()).toBe(true)
		confirm.mockRestore()
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
		await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2))
		const payload = JSON.parse(mocks.api.mock.calls[1][2].body)[0].mediaPayload
			.metadata
		expect(payload.authors).toEqual(item.media.metadata.authors)
		expect(payload.series).toEqual(item.media.metadata.series)
		expect(payload.asin).toBe('ASIN')
		expect(payload.isbn).toBe('NEW')
	})
})
