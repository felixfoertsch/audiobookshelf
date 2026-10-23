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

	it('submits upload after path check and resets staged files', async () => {
		mocks.api.mockImplementation(async (path: string) =>
			path === '/api/libraries'
				? {
						libraries: [
							{
								id: 'lib',
								name: 'Books',
								mediaType: 'book',
								folders: [{ id: 'folder', fullPath: '/books' }],
							},
						],
					}
				: path === '/api/search/providers'
					? { providers: { books: [] } }
					: path === '/api/filesystem/pathexists'
						? { exists: false }
						: undefined,
		)
		let sentForm: FormData | undefined
		const xhr = vi.fn(function (this: XMLHttpRequest) {
			Object.assign(this, {
				upload: {},
				open: vi.fn(),
				setRequestHeader: vi.fn(),
				send: vi.fn((form: FormData) => {
					sentForm = form
					this.onload?.(
						new ProgressEvent(
							'load',
						) as ProgressEvent<XMLHttpRequestEventTarget>,
					)
				}),
				abort: vi.fn(),
				status: 201,
				withCredentials: false,
			})
		})
		vi.stubGlobal('XMLHttpRequest', xhr)
		const { container } = render(<UploadPage />)
		await screen.findByRole('option', { name: 'Books' })
		const picker = container.querySelector('input[type="file"]')
		if (!picker) throw new Error('File picker missing')
		fireEvent.change(picker, {
			target: { files: [new File(['audio'], 'Book.mp3')] },
		})
		fireEvent.click(screen.getByRole('button', { name: 'Upload' }))
		await screen.findByText('success')
		expect(mocks.api).toHaveBeenCalledWith(
			'/api/filesystem/pathexists',
			expect.anything(),
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({ directory: 'Book', folderPath: '/books' }),
			}),
		)
		expect(xhr).toHaveBeenCalled()
		expect(xhr.mock.instances[0].open).toHaveBeenCalledWith(
			'POST',
			expect.stringMatching(/\/api\/upload$/),
		)
		expect(sentForm).toBeInstanceOf(FormData)
		if (!sentForm) throw new Error('Upload FormData missing')
		expect([...sentForm.entries()]).toEqual([
			['title', 'Book'],
			['author', ''],
			['series', ''],
			['library', 'lib'],
			['folder', 'folder'],
			['0', expect.any(File)],
		])
		expect((sentForm.get('0') as File).name).toBe('Book.mp3')
		fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
		expect(screen.queryByDisplayValue('Book')).toBeNull()
		expect(screen.queryByText('Book.mp3')).toBeNull()
		expect(screen.queryByRole('alert')).toBeNull()
	})
})
