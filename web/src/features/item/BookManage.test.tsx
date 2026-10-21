import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BookManage } from './BookManage'

const mocks = vi.hoisted(() => ({
	user: {
		id: 'user',
		permissions: { update: true, upload: true },
		type: 'admin',
	},
	getItem: vi.fn(),
	api: vi.fn(),
}))
vi.mock('@tanstack/react-router', () => ({
	Link: ({
		children,
		params,
	}: {
		children: React.ReactNode
		params: { id: string }
	}) => <a href={`/item/${params.id}`}>{children}</a>,
}))
vi.mock('../../api', () => ({
	api: mocks.api,
	useAuth: Object.assign(
		(select: (state: { user: typeof mocks.user }) => unknown) =>
			select({ user: mocks.user }),
		{ getState: () => ({ user: mocks.user }) },
	),
}))
vi.mock('./service', () => ({ getItem: mocks.getItem }))
function book(id: string) {
	return {
		id,
		mediaType: 'book',
		media: {
			duration: 20,
			coverPath: '/cover',
			metadata: { title: id },
			chapters: [{ title: `${id} chapter`, start: 0, end: 20 }],
			audioFiles: [],
		},
	}
}
function deferred<T>() {
	let resolve!: (value: T) => void
	const promise = new Promise<T>((yes) => {
		resolve = yes
	})
	return { promise, resolve }
}
beforeEach(() => {
	mocks.user = {
		id: 'user',
		permissions: { update: true, upload: true },
		type: 'admin',
	}
	mocks.getItem.mockReset().mockImplementation(async (id) => book(id))
	mocks.api.mockReset().mockResolvedValue({})
	vi.spyOn(window, 'confirm').mockReturnValue(true)
	window.__ABS_WEB_CONFIG__ = { apiBasePath: '' }
	localStorage.setItem('token', 'synthetic-token')
})
afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
})
describe('BookManage private drafts', () => {
	it('keeps metadata save separate from match, names track moves and activates upload picker', async () => {
		const value = book('A')
		mocks.getItem.mockResolvedValue({
			...value,
			media: {
				...value.media,
				audioFiles: [
					{ ino: 1, filename: 'first.mp3', index: 0 },
					{ ino: 2, filename: 'second.mp3', index: 1 },
				],
			},
		})
		render(<BookManage id="A" section="edit" />)
		await screen.findByLabelText('Title')
		expect(screen.queryByText('Tracks and metadata')).toBeNull()
		expect(
			(
				screen.getByRole('button', {
					name: 'Move first.mp3 up',
				}) as HTMLButtonElement
			).disabled,
		).toBe(true)
		fireEvent.click(screen.getByRole('button', { name: 'Move first.mp3 down' }))
		expect(
			(
				screen.getByRole('button', {
					name: 'Move first.mp3 down',
				}) as HTMLButtonElement
			).disabled,
		).toBe(true)
		const save = screen.getByRole('button', {
			name: 'Save metadata',
		}) as HTMLButtonElement
		expect(save.form?.id).toBe('book-metadata-form')
		expect(
			(screen.getByRole('button', { name: 'Apply match' }) as HTMLButtonElement)
				.form,
		).not.toBe(save.form)
		const picker = screen.getByLabelText('Upload cover file')
		const click = vi.spyOn(picker, 'click')
		fireEvent.click(screen.getByRole('button', { name: 'Upload cover' }))
		expect(click).toHaveBeenCalledOnce()
	})
	it('hides A draft while B loads and saves only B draft to B', async () => {
		const pending = deferred<ReturnType<typeof book>>()
		const view = render(<BookManage id="A" section="chapters" />)
		fireEvent.change(await screen.findByLabelText('Title'), {
			target: { value: 'Private A' },
		})
		mocks.getItem.mockImplementation((id) =>
			id === 'B' ? pending.promise : Promise.resolve(book(id)),
		)
		view.rerender(<BookManage id="B" section="chapters" />)
		expect(screen.queryByDisplayValue('Private A')).toBeNull()
		expect(screen.queryByRole('button', { name: 'Save chapters' })).toBeNull()
		pending.resolve(book('B'))
		fireEvent.change(await screen.findByLabelText('Title'), {
			target: { value: 'Edited B' },
		})
		fireEvent.click(screen.getByRole('button', { name: 'Save chapters' }))
		await waitFor(() =>
			expect(mocks.api).toHaveBeenCalledWith(
				'/api/items/B/chapters',
				expect.anything(),
				expect.objectContaining({
					body: JSON.stringify({
						chapters: [{ title: 'Edited B', start: 0, end: 20 }],
					}),
				}),
			),
		)
	})
	it('drops old identity draft but keeps same-user token refresh draft', async () => {
		const view = render(<BookManage id="A" section="chapters" />)
		fireEvent.change(await screen.findByLabelText('Title'), {
			target: { value: 'Draft' },
		})
		mocks.user = { ...mocks.user }
		view.rerender(<BookManage id="A" section="chapters" />)
		expect(screen.getByDisplayValue('Draft')).toBeTruthy()
		mocks.user = { ...mocks.user, id: 'other' }
		view.rerender(<BookManage id="A" section="chapters" />)
		expect(screen.queryByDisplayValue('Draft')).toBeNull()
		expect(await screen.findByDisplayValue('A chapter')).toBeTruthy()
	})
	it('ignores delayed A load after B becomes current', async () => {
		const pending = deferred<ReturnType<typeof book>>()
		mocks.getItem.mockImplementation((id) =>
			id === 'A' ? pending.promise : Promise.resolve(book(id)),
		)
		const view = render(<BookManage id="A" section="chapters" />)
		view.rerender(<BookManage id="B" section="chapters" />)
		await screen.findByDisplayValue('B chapter')
		pending.resolve(book('A'))
		await waitFor(() =>
			expect(screen.queryByDisplayValue('A chapter')).toBeNull(),
		)
	})
	it('keeps unsaved chapters through successful and failed lookup', async () => {
		render(<BookManage id="A" section="chapters" />)
		fireEvent.change(await screen.findByLabelText('Title'), {
			target: { value: 'Unsaved' },
		})
		fireEvent.change(screen.getByLabelText('ASIN'), {
			target: { value: 'B000000001' },
		})
		mocks.api.mockResolvedValueOnce({
			runtimeLengthSec: 20,
			chapters: [{ title: 'Found', startOffsetMs: 0, lengthMs: 20000 }],
		})
		fireEvent.click(screen.getByRole('button', { name: 'Find chapters' }))
		await screen.findByRole('button', { name: 'Apply found chapters' })
		expect(screen.getByDisplayValue('Unsaved')).toBeTruthy()
		expect(mocks.getItem).toHaveBeenCalledTimes(1)
		mocks.api.mockRejectedValueOnce(new Error('Lookup failed'))
		fireEvent.click(screen.getByRole('button', { name: 'Find chapters' }))
		await screen.findByText('Lookup failed')
		expect(screen.getByDisplayValue('Unsaved')).toBeTruthy()
	})
	it('preserves metadata drafts during cover search and reports queued work honestly', async () => {
		const view = render(<BookManage id="A" section="edit" />)
		fireEvent.change(await screen.findByLabelText('Title'), {
			target: { value: 'Unsaved metadata' },
		})
		fireEvent.change(screen.getByLabelText('Search cover title'), {
			target: { value: 'Cover' },
		})
		mocks.api.mockResolvedValueOnce({
			results: ['https://example.test/cover.jpg'],
		})
		fireEvent.click(screen.getByRole('button', { name: 'Search covers' }))
		await screen.findByText('Cover search loaded')
		expect(screen.getByDisplayValue('Unsaved metadata')).toBeTruthy()
		expect(mocks.getItem).toHaveBeenCalledTimes(1)
		view.rerender(<BookManage id="A" section="manage" />)
		fireEvent.click(
			screen.getByRole('button', { name: 'Check metadata object' }),
		)
		await screen.findByText('Metadata object retrieved. No changes made.')
		fireEvent.click(
			screen.getByRole('button', { name: 'Start metadata embed' }),
		)
		await screen.findByText('Metadata embed started')
		expect(screen.queryByText('Changes saved')).toBeNull()
		mocks.api.mockRejectedValueOnce(new Error('Queue rejected'))
		fireEvent.click(screen.getByRole('button', { name: 'Start M4B encoding' }))
		await screen.findByText('Queue rejected')
		expect(screen.queryByText('M4B encoding started')).toBeNull()
	})
	it('shows contextual book heading and return link, with cover only in edit', async () => {
		const { rerender } = render(<BookManage id="A" section="chapters" />)
		expect(
			await screen.findByRole('heading', { level: 1, name: 'A' }),
		).toBeTruthy()
		expect(
			screen
				.getByRole('link', { name: /return to audiobook A/i })
				.getAttribute('href'),
		).toBe('/item/A')
		expect(screen.queryByRole('heading', { name: 'Cover' })).toBeNull()
		expect(screen.queryByAltText('A cover')).toBeNull()
		rerender(<BookManage id="A" section="edit" />)
		expect(
			await screen.findByRole('heading', { level: 1, name: 'A' }),
		).toBeTruthy()
		expect(screen.getByRole('heading', { name: 'Cover' })).toBeTruthy()
	})
	it('uses human metadata labels and multiline description', async () => {
		render(<BookManage id="A" section="edit" />)
		expect(await screen.findByLabelText('Authors')).toBeTruthy()
		expect(screen.getByLabelText('Published year')).toBeTruthy()
		expect(screen.getByLabelText('ISBN')).toBeTruthy()
		expect(screen.getByLabelText('ASIN')).toBeTruthy()
		expect(screen.getByLabelText('Description').tagName).toBe('TEXTAREA')
	})
	it('does not invoke stale owner mutation or reload after old completion', async () => {
		const pending = deferred<object>()
		render(<BookManage id="A" section="chapters" />)
		const save = await screen.findByRole('button', { name: 'Save chapters' })
		mocks.user = { ...mocks.user, id: 'other' }
		fireEvent.click(save)
		expect(mocks.api).not.toHaveBeenCalled()
		mocks.user = { ...mocks.user, id: 'user' }
		mocks.api.mockReturnValueOnce(pending.promise)
		fireEvent.click(save)
		mocks.user = { ...mocks.user, id: 'other' }
		await act(async () => {
			pending.resolve({})
			await pending.promise
		})
		expect(mocks.api).toHaveBeenCalledTimes(1)
		expect(mocks.getItem).toHaveBeenCalledTimes(1)
		expect(screen.queryByText('Changes saved')).toBeNull()
	})
	it('does not send cover token to different origin', async () => {
		window.__ABS_WEB_CONFIG__ = { apiBasePath: 'https://other.example' }
		render(<BookManage id="A" section="edit" />)
		expect((await screen.findByAltText('A cover')).getAttribute('src')).toBe(
			'https://other.example/api/items/A/cover',
		)
	})
	it.each(['', '/abs'])(
		'uses server mount %s and authenticated same-origin cover transport',
		async (prefix) => {
			window.__ABS_WEB_CONFIG__ = { apiBasePath: prefix }
			render(<BookManage id="A" section="edit" />)
			const image = await screen.findByAltText('A cover')
			expect(image.getAttribute('src')).toBe(
				`${prefix}/api/items/A/cover?token=synthetic-token`,
			)
		},
	)
})

it('denies management to update-only user and chapter editing to restricted listener', async () => {
	mocks.user.type = 'user'
	const view = render(<BookManage id="A" section="manage" />)
	expect(await screen.findByRole('alert')).toHaveProperty(
		'textContent',
		'Administrator permission required.',
	)
	mocks.user.permissions.update = false
	view.rerender(<BookManage id="A" section="chapters" />)
	expect(screen.getByRole('alert')).toHaveProperty(
		'textContent',
		'Update permission required.',
	)
})
