import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { useAuth } from '../../api'
import { playQueue } from '../../player'
import { CollectionDetail, PlaylistDetail } from './entities'
import { collectionSchema, playlistSchema } from './entities-api'

const router = vi.hoisted(() => ({ invalidate: vi.fn(), navigate: vi.fn() }))
vi.mock('@tanstack/react-router', () => ({
	useNavigate: () => router.navigate,
	useRouter: () => router,
	Link: ({ children }: { children: React.ReactNode }) => (
		<span>{children}</span>
	),
}))
vi.mock('../../catalog', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../catalog')>()
	return { ...actual, getItems: vi.fn(async () => ({ results: [], total: 0 })) }
})
vi.mock('../../player', () => ({ playEpisode: vi.fn(), playQueue: vi.fn() }))
afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
	router.invalidate.mockReset()
	router.navigate.mockReset()
})
const book = {
	id: 'book',
	libraryId: 'library',
	mediaType: 'book',
	media: { metadata: { title: 'Book' }, coverPath: null, episodes: [] },
	mediaProgress: null,
	addedAt: '',
	updatedAt: '',
}
const book2 = {
	...book,
	id: 'book2',
	media: { ...book.media, metadata: { title: 'Book 2' } },
}
const collection = collectionSchema.parse({
	id: 'collection',
	libraryId: 'library',
	name: 'Collection',
	books: [book, book2],
})
const playlist = playlistSchema.parse({
	id: 'playlist',
	libraryId: 'library',
	userId: 'owner',
	name: 'Playlist',
	items: [
		{ libraryItemId: 'book', libraryItem: book },
		{ libraryItemId: 'book2', libraryItem: book2 },
	],
})
function user(
	id = 'owner',
	permissions: { update?: boolean; delete?: boolean } = {
		update: true,
		delete: true,
	},
) {
	useAuth.setState({
		user: {
			id,
			username: id,
			accessToken: 'fixture',
			permissions,
			type: id === 'admin' ? 'admin' : 'user',
		},
	})
}
function fetchApi() {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async (path) => {
		const url = String(path)
		if (url.endsWith('/open')) return Response.json({ feed: { id: 'feed' } })
		const response = url.includes('/collections')
			? { ...collection, books: [book, book2] }
			: { ...playlist, items: playlist.items }
		return Response.json(
			url.includes('/playlists/collection/') ? { ...playlist } : response,
		)
	})
}
test('collection controls play, reorder, remove, save and delete only with permissions', async () => {
	user()
	const fetcher = fetchApi()
	vi.spyOn(window, 'confirm').mockReturnValue(true)
	render(<CollectionDetail collection={collection} />)
	fireEvent.click(screen.getByRole('button', { name: 'Play collection' }))
	await waitFor(() =>
		expect(playQueue).toHaveBeenCalledWith([
			{ libraryItemId: 'book', title: 'Book' },
			{ libraryItemId: 'book2', title: 'Book 2' },
		]),
	)
	await waitFor(() => expect(router.invalidate).toHaveBeenCalledTimes(1))
	router.invalidate.mockClear()
	fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0])
	await waitFor(() => expect(router.invalidate).toHaveBeenCalledTimes(1))
	fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])
	await waitFor(() => expect(router.invalidate).toHaveBeenCalledTimes(2))
	fireEvent.change(screen.getByLabelText('Name'), {
		target: { value: 'Changed' },
	})
	fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
	await waitFor(() => expect(router.invalidate).toHaveBeenCalledTimes(3))
	fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
	await waitFor(() =>
		expect(
			fetcher.mock.calls.some(([, init]) => init?.method === 'DELETE'),
		).toBe(true),
	)
	await waitFor(() => expect(router.invalidate).toHaveBeenCalled())
	expect(fetcher.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(
		true,
	)
	expect(fetcher.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(
		true,
	)
})
test('collection hides management controls without update/delete permission', () => {
	user('reader', {})
	render(<CollectionDetail collection={collection} />)
	expect(screen.queryByLabelText('Name')).toBeNull()
	expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
	expect(screen.queryByRole('button', { name: 'Move up' })).toBeNull()
	expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
})
test('playlist owner can play, reorder, remove, save and delete; other user cannot manage', async () => {
	user()
	const fetcher = fetchApi()
	vi.spyOn(window, 'confirm').mockReturnValue(true)
	const { rerender } = render(<PlaylistDetail playlist={playlist} />)
	fireEvent.click(screen.getByRole('button', { name: 'Play playlist' }))
	await waitFor(() => expect(router.invalidate).toHaveBeenCalledTimes(1))
	router.invalidate.mockClear()
	fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0])
	await waitFor(() => expect(router.invalidate).toHaveBeenCalledTimes(1))
	fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])
	await waitFor(() => expect(router.invalidate).toHaveBeenCalledTimes(2))
	fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
	await waitFor(() => expect(router.invalidate).toHaveBeenCalledTimes(3))
	fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
	await waitFor(() =>
		expect(
			fetcher.mock.calls.some(([, init]) => init?.method === 'DELETE'),
		).toBe(true),
	)
	await waitFor(() =>
		expect(
			fetcher.mock.calls.some(([, init]) => init?.method === 'PATCH'),
		).toBe(true),
	)
	user('stranger')
	rerender(<PlaylistDetail playlist={playlist} />)
	expect(screen.queryByLabelText('Name')).toBeNull()
	expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
	expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
})
test('collection feed opens for admin, hides for regular user without feed, and closes after confirmation', async () => {
	user('admin', {})
	const fetcher = fetchApi()
	vi.spyOn(window, 'confirm').mockReturnValue(true)
	const withFeed = collectionSchema.parse({
		...collection,
		rssFeed: {
			id: 'feed',
			feedUrl: '/feed/books',
			meta: { preventIndexing: true },
		},
	})
	const { rerender } = render(<CollectionDetail collection={collection} />)
	fireEvent.change(screen.getByLabelText('Slug'), {
		target: { value: 'my-feed' },
	})
	fireEvent.click(screen.getByRole('button', { name: 'Open RSS feed' }))
	await waitFor(() =>
		expect(
			fetcher.mock.calls.some(([url]) => String(url).includes('/open')),
		).toBe(true),
	)
	rerender(<CollectionDetail collection={withFeed} />)
	fireEvent.click(screen.getByRole('button', { name: 'Close RSS feed' }))
	await waitFor(() =>
		expect(
			fetcher.mock.calls.some(([url]) => String(url).includes('/close')),
		).toBe(true),
	)
	user('reader', {})
	rerender(<CollectionDetail collection={collection} />)
	expect(screen.queryByText('Collection RSS feed')).toBeNull()
})
