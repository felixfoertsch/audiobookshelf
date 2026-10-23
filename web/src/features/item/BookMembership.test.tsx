import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { BookMembership } from './BookMembership'
import type { Item } from './schemas'

const mocks = vi.hoisted(() => ({
	user: { id: 'user', type: 'user', permissions: { update: true } },
	api: vi.fn(),
	addCollectionBook: vi.fn(),
	addPlaylistItem: vi.fn(),
	createCollection: vi.fn(),
	createPlaylist: vi.fn(),
	changed: vi.fn(),
}))
vi.mock('../../api', () => ({
	useAuth: (select: (state: unknown) => unknown) => select(mocks),
	api: mocks.api,
}))
vi.mock('../catalog/entities-api', async (importOriginal) => ({
	...(await importOriginal<typeof import('../catalog/entities-api')>()),
	addCollectionBook: mocks.addCollectionBook,
	addPlaylistItem: mocks.addPlaylistItem,
	createMembershipCollection: mocks.createCollection,
	createMembershipPlaylist: mocks.createPlaylist,
}))
afterEach(() => {
	cleanup()
	vi.clearAllMocks()
})
const book = {
	id: 'book1',
	libraryId: 'library1',
	mediaType: 'book',
	media: { metadata: { title: 'Book' } },
} as Item
function lists() {
	mocks.api.mockImplementation((path: string) =>
		Promise.resolve(
			path.includes('collections')
				? {
						collections: [
							{
								id: 'collection1',
								libraryId: 'library1',
								name: 'Favorites',
								permissions: { update: true },
								books: [],
							},
						],
					}
				: {
						playlists: [
							{
								id: 'playlist1',
								libraryId: 'library1',
								userId: 'user',
								name: 'Listen later',
								items: [],
							},
						],
					},
		),
	)
}
async function open() {
	fireEvent.click(
		screen.getByRole('button', { name: 'Add to collection or playlist' }),
	)
	await screen.findByRole('dialog')
}
it('adds book to existing collection and refreshes detail', async () => {
	lists()
	mocks.addCollectionBook.mockResolvedValue({})
	render(<BookMembership item={book} onChanged={mocks.changed} />)
	await open()
	fireEvent.click(screen.getByRole('button', { name: 'Collection: Favorites' }))
	await waitFor(() =>
		expect(mocks.addCollectionBook).toHaveBeenCalledWith(
			'collection1',
			'book1',
		),
	)
	expect(mocks.changed).toHaveBeenCalledOnce()
})
it('adds book to owned playlist', async () => {
	lists()
	mocks.addPlaylistItem.mockResolvedValue({})
	render(<BookMembership item={book} onChanged={mocks.changed} />)
	await open()
	fireEvent.click(
		screen.getByRole('button', { name: 'Playlist: Listen later' }),
	)
	await waitFor(() =>
		expect(mocks.addPlaylistItem).toHaveBeenCalledWith('playlist1', {
			libraryItemId: 'book1',
		}),
	)
	expect(mocks.changed).toHaveBeenCalledOnce()
})
it('disables duplicate memberships', async () => {
	lists()
	mocks.api.mockImplementation((path: string) =>
		Promise.resolve(
			path.includes('collections')
				? {
						collections: [
							{
								id: 'collection1',
								libraryId: 'library1',
								name: 'Favorites',
								permissions: { update: true },
								books: [{ id: 'book1' }],
							},
						],
					}
				: {
						playlists: [
							{
								id: 'playlist1',
								libraryId: 'library1',
								userId: 'user',
								name: 'Listen later',
								items: [{ libraryItemId: 'book1' }],
							},
						],
					},
		),
	)
	render(<BookMembership item={book} onChanged={mocks.changed} />)
	await open()
	expect(
		screen.getByRole('button', { name: 'Collection: Favorites' }),
	).toHaveProperty('disabled', true)
	expect(
		screen.getByRole('button', { name: 'Playlist: Listen later' }),
	).toHaveProperty('disabled', true)
})
it.each(['collection', 'playlist'] as const)(
	'creates %s with book',
	async (kind) => {
		lists()
		mocks.createCollection.mockResolvedValue({})
		mocks.createPlaylist.mockResolvedValue({})
		render(<BookMembership item={book} onChanged={mocks.changed} />)
		await open()
		fireEvent.change(screen.getByLabelText('New membership type'), {
			target: { value: kind },
		})
		fireEvent.change(screen.getByLabelText('New name'), {
			target: { value: 'New shelf' },
		})
		fireEvent.click(screen.getByRole('button', { name: 'Create' }))
		await waitFor(() =>
			expect(
				kind === 'collection' ? mocks.createCollection : mocks.createPlaylist,
			).toHaveBeenCalledWith('library1', 'New shelf', 'book1'),
		)
		expect(mocks.changed).toHaveBeenCalledOnce()
	},
)
it('shows load and mutation errors; blocks collections without update permission and other users playlists', async () => {
	lists()
	mocks.api.mockImplementationOnce(() =>
		Promise.reject(new Error('Load denied')),
	)
	render(<BookMembership item={book} onChanged={mocks.changed} />)
	fireEvent.click(
		screen.getByRole('button', { name: 'Add to collection or playlist' }),
	)
	expect((await screen.findByRole('alert')).textContent).toContain(
		'Load denied',
	)
	lists()
	mocks.addCollectionBook.mockRejectedValue(new Error('Forbidden'))
	fireEvent.click(
		screen.getByRole('button', { name: 'Add to collection or playlist' }),
	)
	await open()
	fireEvent.click(screen.getByRole('button', { name: 'Collection: Favorites' }))
	expect((await screen.findByRole('alert')).textContent).toContain('Forbidden')
	expect(mocks.changed).not.toHaveBeenCalled()
})
it('restores membership trigger focus after Escape', async () => {
	lists()
	render(<BookMembership item={book} onChanged={mocks.changed} />)
	const trigger = screen.getByRole('button', {
		name: 'Add to collection or playlist',
	})
	await open()
	fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
	await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
	await waitFor(() => expect(document.activeElement).toBe(trigger))
})

it('uses native user update permission rather than absent collection permission fields', async () => {
	lists()
	mocks.user.permissions.update = false
	render(<BookMembership item={book} onChanged={mocks.changed} />)
	await open()
	expect(
		screen.queryByRole('button', { name: 'Collection: Favorites' }),
	).toBeNull()
	expect(
		screen.getByRole('button', { name: 'Playlist: Listen later' }),
	).toBeTruthy()
	mocks.user.permissions.update = true
})

it('hides membership actions for unauthenticated users', () => {
	mocks.user = null as never
	render(<BookMembership item={book} onChanged={mocks.changed} />)
	expect(
		screen.queryByRole('button', { name: 'Add to collection or playlist' }),
	).toBeNull()
})
