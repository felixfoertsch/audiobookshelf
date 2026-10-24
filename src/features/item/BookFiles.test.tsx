import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BookFiles } from './BookFiles'
import type { Item } from './schemas'

const { api, user } = vi.hoisted(() => ({
	api: vi.fn(),
	user: { type: 'user', permissions: { download: true, delete: true } },
}))
vi.mock('../../api', () => ({
	api,
	useAuth: (select: (state: { user: typeof user }) => unknown) =>
		select({ user }),
}))

const item = {
	id: 'book/1',
	mediaType: 'book',
	media: {
		id: 'media',
		metadata: { title: 'Book' },
		audioFiles: [
			{
				ino: 7,
				index: 0,
				duration: 62,
				codec: 'aac',
				bitRate: 128000,
				channels: 2,
				format: 'mp4',
				metadata: { filename: 'track metadata.m4b' },
				metaTags: { title: 'Narrated title' },
			},
		],
	},
	libraryFiles: [
		{
			ino: 7,
			metadata: {
				filename: 'part 1.m4b',
				path: '/library/part 1.m4b',
				size: 1000,
				ext: '.m4b',
			},
		},
		{
			ino: 8,
			metadata: {
				filename: 'part 2.m4b',
				path: '/library/part 2.m4b',
				size: 2000,
				ext: '.m4b',
			},
		},
	],
} as unknown as Item

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
})

beforeEach(() => {
	api.mockReset()
	user.type = 'user'
	user.permissions = { download: true, delete: true }
})

describe('BookFiles', () => {
	it('shows captioned responsive tables, technical data, metadata, and permissioned download', () => {
		render(<BookFiles item={item} onChanged={vi.fn()} />)
		expect(screen.getByRole('table', { name: 'Audio tracks' })).toBeTruthy()
		expect(screen.getByRole('table', { name: 'Library files' })).toBeTruthy()
		expect(screen.getByText('track metadata.m4b')).toBeTruthy()
		expect(screen.getByText(/Narrated title/)).toBeTruthy()
		expect(screen.getByRole('row', { name: /part 1\.m4b/ })).toBeTruthy()
		expect(
			screen
				.getByRole('link', { name: 'Download part 2.m4b' })
				.getAttribute('href'),
		).toContain('/api/items/book%2F1/file/8/download')
	})

	it('shows ffprobe JSON to admins without reloading and deletes only confirmed listed file', async () => {
		user.type = 'admin'
		const onChanged = vi.fn()
		api
			.mockResolvedValueOnce({ streams: [{ codec_name: 'aac' }] })
			.mockResolvedValueOnce({})
		const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
		render(<BookFiles item={item} onChanged={onChanged} />)
		fireEvent.click(
			screen.getByRole('button', { name: 'Probe track metadata.m4b' }),
		)
		await screen.findByText(/codec_name/)
		expect(api).toHaveBeenNthCalledWith(
			1,
			'/api/items/book%2F1/ffprobe/7',
			expect.anything(),
			{ method: 'GET' },
		)
		expect(onChanged).not.toHaveBeenCalled()
		const library = screen.getByRole('table', { name: 'Library files' })
		expect(
			screen.getAllByRole('table', { name: 'Library files' }),
		).toHaveLength(1)
		fireEvent.click(
			within(library).getByRole('button', { name: 'Delete part 2.m4b' }),
		)
		await waitFor(() =>
			expect(api).toHaveBeenNthCalledWith(
				2,
				'/api/items/book%2F1/file/8',
				expect.anything(),
				{ method: 'DELETE' },
			),
		)
		expect(confirm).toHaveBeenCalled()
		expect(onChanged).toHaveBeenCalledTimes(1)
		confirm.mockRestore()
	})

	it('does not request deletion when confirmation is cancelled', () => {
		const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
		render(<BookFiles item={item} onChanged={vi.fn()} />)
		fireEvent.click(
			within(screen.getByRole('table', { name: 'Library files' })).getByRole(
				'button',
				{ name: 'Delete part 2.m4b' },
			),
		)
		expect(confirm).toHaveBeenCalled()
		expect(api).not.toHaveBeenCalled()
		confirm.mockRestore()
	})

	it('reports delete failure without canonical reload', async () => {
		api.mockRejectedValueOnce(new Error('Delete denied'))
		vi.spyOn(window, 'confirm').mockReturnValue(true)
		const onChanged = vi.fn()
		render(<BookFiles item={item} onChanged={onChanged} />)
		fireEvent.click(
			within(screen.getByRole('table', { name: 'Library files' })).getByRole(
				'button',
				{ name: 'Delete part 2.m4b' },
			),
		)
		expect((await screen.findByRole('alert')).textContent).toContain(
			'Delete denied',
		)
		expect(onChanged).not.toHaveBeenCalled()
		vi.restoreAllMocks()
	})

	it.each(['user', 'admin', 'root'])(
		'%s privileges only expose controls allowed by explicit permissions',
		(type) => {
			user.type = type
			user.permissions = { download: false, delete: false }
			render(<BookFiles item={item} onChanged={vi.fn()} />)
			expect(
				screen.queryAllByRole('link', { name: /^Download part/ }),
			).toHaveLength(0)
			expect(
				screen.queryAllByRole('button', { name: /^Delete part/ }),
			).toHaveLength(0)
			if (type === 'user')
				expect(screen.queryByRole('button', { name: /Probe/ })).toBeNull()
			else expect(screen.getByRole('button', { name: /Probe/ })).toBeTruthy()
		},
	)
})
