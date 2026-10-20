import '@testing-library/jest-dom/vitest'
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UploadPage } from './index'

const mocks = vi.hoisted(() => ({ api: vi.fn() }))
vi.mock('../../api', () => ({
	api: mocks.api,
	authHeaders: () => ({}),
	useAuth: (selector: (state: unknown) => unknown) =>
		selector({ user: { id: 'u', type: 'root' } }),
}))
afterEach(() => {
	cleanup()
	vi.resetAllMocks()
})
describe('native upload metadata automation', () => {
	it('automatically fetches actual selected provider and applies candidate fields', async () => {
		mocks.api.mockImplementation(async (path: string) =>
			path === '/api/libraries'
				? {
						libraries: [
							{
								id: 'lib',
								name: 'Books',
								mediaType: 'book',
								provider: 'google',
								folders: [{ id: 'folder', fullPath: '/books' }],
							},
						],
					}
				: path === '/api/search/providers'
					? { providers: { books: [{ value: 'google', text: 'Google' }] } }
					: [
							{
								title: 'Matched title',
								author: 'Writer',
								series: [{ series: 'Saga' }],
							},
						],
		)
		const { container } = render(<UploadPage />)
		await screen.findByRole('option', { name: 'Books' })
		fireEvent.click(screen.getByLabelText('Fetch metadata automatically'))
		const picker = container.querySelector('input[type="file"]')
		if (!picker) throw new Error('File picker missing')
		fireEvent.change(picker, {
			target: { files: [new File(['audio'], 'Original.mp3')] },
		})
		await waitFor(() =>
			expect(
				mocks.api.mock.calls.some(
					([path]) =>
						path === '/api/search/books?title=Original&author=&provider=google',
				),
			).toBe(true),
		)
		expect(await screen.findByDisplayValue('Matched title')).toBeTruthy()
		expect(screen.getByDisplayValue('Writer')).toBeTruthy()
		expect(screen.getByDisplayValue('Saga')).toBeTruthy()
	})
})
