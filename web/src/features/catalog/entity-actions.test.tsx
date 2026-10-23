import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { useAuth } from '../../api'
import { playEpisode, playQueue } from '../../player'
import { CollectionDetail, PlaylistDetail } from './entities'
import { collectionSchema, playlistSchema } from './entities-api'

const router = vi.hoisted(() => ({ invalidate: vi.fn(), navigate: vi.fn() }))
const getItemsMock = vi.hoisted(() =>
	vi.fn(async () => ({ results: [], total: 0 })),
)
const originalHistory = window.history
const originalClipboard = navigator.clipboard
vi.mock('@tanstack/react-router', () => ({
	useNavigate: () => router.navigate,
	useRouter: () => router,
	Link: ({ children }: { children: React.ReactNode }) => (
		<span>{children}</span>
	),
}))
vi.mock('../../catalog', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../catalog')>()
	return { ...actual, getItems: getItemsMock }
})
vi.mock('../../player', () => ({ playEpisode: vi.fn(), playQueue: vi.fn() }))
afterEach(() => {
	cleanup()
	Object.defineProperty(window, 'history', {
		configurable: true,
		value: originalHistory,
	})
	Object.defineProperty(navigator, 'clipboard', {
		configurable: true,
		value: originalClipboard,
	})
	vi.restoreAllMocks()
	getItemsMock.mockReset()
	getItemsMock.mockResolvedValue({ results: [], total: 0 })
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
	fireEvent.click(screen.getAllByRole('button', { name: 'Play' })[0])
	await waitFor(() =>
		expect(playEpisode).toHaveBeenCalledWith('book', undefined),
	)
	router.invalidate.mockClear()
	fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0])
	await waitFor(() => expect(router.invalidate).toHaveBeenCalledTimes(1))
	const movedDown = fetcher.mock.calls.find(
		([url, init]) =>
			String(url) === '/api/collections/collection' && init?.method === 'PATCH',
	)
	expect(JSON.parse(String(movedDown?.[1]?.body))).toEqual({
		books: ['book2', 'book'],
	})
	fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])
	await waitFor(() => expect(router.invalidate).toHaveBeenCalledTimes(2))
	const remove = fetcher.mock.calls.find(
		([url, init]) =>
			String(url).includes('/collections/collection/book/book') &&
			init?.method === 'DELETE',
	)
	expect(remove).toEqual([
		'/api/collections/collection/book/book',
		expect.objectContaining({ method: 'DELETE' }),
	])
	fireEvent.change(screen.getByLabelText('Name'), {
		target: { value: 'Changed' },
	})
	fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
	await waitFor(() => expect(router.invalidate).toHaveBeenCalledTimes(3))
	const saved = fetcher.mock.calls.find(
		([url, init]) =>
			url === '/api/collections/collection' &&
			init?.method === 'PATCH' &&
			JSON.parse(String(init.body)).name === 'Changed',
	)
	expect(JSON.parse(String(saved?.[1]?.body))).toEqual({
		name: 'Changed',
		description: '',
		books: ['book', 'book2'],
	})
	const confirm = vi.mocked(window.confirm)
	fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
	expect(confirm).toHaveBeenCalledWith('Delete “Collection”?')
	await waitFor(() =>
		expect(fetcher.mock.calls).toContainEqual([
			'/api/collections/collection',
			expect.objectContaining({ method: 'DELETE' }),
		]),
	)
	await waitFor(() => expect(router.navigate).toHaveBeenCalledWith({ to: '/' }))
	await waitFor(() => expect(router.invalidate).toHaveBeenCalled())
	expect(fetcher.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(
		true,
	)
	expect(fetcher.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(
		true,
	)
})
test('collection add, reverse reorder, playlist creation, copy, and back use exact outcomes', async () => {
	user('admin', { update: true, delete: true })
	const calls: Array<[string, RequestInit | undefined]> = []
	getItemsMock.mockResolvedValue({
		results: [
			{
				...book,
				id: 'book3',
				media: { ...book.media, metadata: { title: 'Book 3' } },
			},
		],
		total: 1,
	} as never)
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, init) => {
		const url = String(path)
		calls.push([url, init])
		if (url.includes('/playlists/collection/'))
			return Response.json({ ...playlist, id: 'playlist' })
		return Response.json({ ...collection, books: [book, book2] })
	})
	const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
	const writeText = vi.fn().mockResolvedValue(undefined)
	Object.defineProperty(navigator, 'clipboard', {
		configurable: true,
		value: { writeText },
	})
	const withFeed = collectionSchema.parse({
		...collection,
		rssFeed: { id: 'feed', feedUrl: '/feed/books' },
	})
	const { rerender } = render(<CollectionDetail collection={collection} />)
	fireEvent.click(screen.getByRole('button', { name: 'Search' }))
	await waitFor(() =>
		expect(getItemsMock).toHaveBeenCalledWith('library', '', 0),
	)
	await screen.findByRole('option', { name: 'Book 3' })
	fireEvent.change(screen.getByLabelText('Item to add'), {
		target: { value: 'book3' },
	})
	fireEvent.click(screen.getByRole('button', { name: 'Add' }))
	await waitFor(() =>
		expect(
			calls.some(
				([url, init]) =>
					url.includes('/collections/collection/book') &&
					init?.method === 'POST',
			),
		).toBe(true),
	)
	expect(
		JSON.parse(
			String(
				calls.find(([url]) => url.includes('/collections/collection/book'))?.[1]
					?.body,
			),
		),
	).toEqual({ id: 'book3' })
	router.invalidate.mockClear()
	fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0])
	await waitFor(() =>
		expect(calls).toContainEqual([
			'/api/collections/collection',
			expect.objectContaining({
				method: 'PATCH',
				body: JSON.stringify({ books: ['book2', 'book'] }),
			}),
		]),
	)
	fireEvent.click(screen.getAllByRole('button', { name: 'Move up' })[1])
	await waitFor(() =>
		expect(
			calls.some(
				([url, init]) =>
					url.endsWith('/collections/collection') &&
					init?.method === 'PATCH' &&
					JSON.stringify(JSON.parse(String(init.body))) ===
						JSON.stringify({ books: ['book2', 'book'] }),
			),
		).toBe(true),
	)
	fireEvent.click(
		screen.getByRole('button', { name: 'Create playlist from collection' }),
	)
	await waitFor(() =>
		expect(router.navigate).toHaveBeenCalledWith({
			to: '/playlist/$id',
			params: { id: 'playlist' },
		}),
	)
	expect(calls).toContainEqual([
		'/api/playlists/collection/collection',
		expect.objectContaining({ method: 'POST' }),
	])
	expect(router.navigate).toHaveBeenCalledWith({
		to: '/playlist/$id',
		params: { id: 'playlist' },
	})
	router.navigate.mockClear()
	const back = vi.fn()
	Object.defineProperty(window, 'history', {
		configurable: true,
		value: { length: 2, back },
	})
	fireEvent.click(screen.getByRole('button', { name: 'Back' }))
	expect(back).toHaveBeenCalledOnce()
	expect(router.navigate).not.toHaveBeenCalled()
	rerender(<CollectionDetail collection={withFeed} />)
	Object.defineProperty(window, 'history', {
		configurable: true,
		value: { length: 2, back: vi.fn() },
	})
	fireEvent.click(screen.getByRole('button', { name: 'Copy feed URL' }))
	await waitFor(() =>
		expect(writeText).toHaveBeenCalledWith(
			expect.stringContaining('/feed/books'),
		),
	)
	expect(writeText).toHaveBeenCalledTimes(1)
	expect(confirm).toHaveBeenCalledTimes(0)
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
	expect(playQueue).toHaveBeenCalledWith([
		{ libraryItemId: 'book', episodeId: undefined, title: 'Book' },
		{ libraryItemId: 'book2', episodeId: undefined, title: 'Book 2' },
	])
	fireEvent.click(screen.getAllByRole('button', { name: 'Play' })[1])
	await waitFor(() =>
		expect(playEpisode).toHaveBeenCalledWith('book2', undefined),
	)
	router.invalidate.mockClear()
	fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0])
	await waitFor(() => expect(router.invalidate).toHaveBeenCalledTimes(1))
	const down = fetcher.mock.calls.find(([, init]) => init?.method === 'PATCH')
	expect(down?.[0]).toBe('/api/playlists/playlist')
	expect(JSON.parse(String(down?.[1]?.body))).toEqual({
		items: [{ libraryItemId: 'book2' }, { libraryItemId: 'book' }],
	})
	fireEvent.click(screen.getAllByRole('button', { name: 'Move up' })[1])
	await waitFor(() => expect(router.invalidate).toHaveBeenCalledTimes(2))
	const up = fetcher.mock.calls.filter(
		([, init]) => init?.method === 'PATCH',
	)[1]
	expect(up?.[0]).toBe('/api/playlists/playlist')
	expect(JSON.parse(String(up?.[1]?.body))).toEqual({
		items: [{ libraryItemId: 'book2' }, { libraryItemId: 'book' }],
	})
	fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])
	await waitFor(() =>
		expect(
			fetcher.mock.calls.some(
				([url, init]) =>
					String(url) === '/api/playlists/playlist/item/book' &&
					init?.method === 'DELETE',
			),
		).toBe(true),
	)
	await waitFor(() => expect(router.invalidate).toHaveBeenCalledTimes(3))
	const removed = fetcher.mock.calls.find(
		([url, init]) =>
			String(url) === '/api/playlists/playlist/item/book' &&
			init?.method === 'DELETE',
	)
	expect(removed).toEqual([
		'/api/playlists/playlist/item/book',
		expect.objectContaining({ method: 'DELETE' }),
	])
	fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
	await waitFor(() => expect(router.invalidate).toHaveBeenCalledTimes(4))
	const save = fetcher.mock.calls.find(
		([url, init]) =>
			url === '/api/playlists/playlist' &&
			init?.method === 'PATCH' &&
			JSON.parse(String(init.body)).name === 'Playlist',
	)
	expect(JSON.parse(String(save?.[1]?.body))).toEqual({
		name: 'Playlist',
		description: '',
		items: [{ libraryItemId: 'book' }, { libraryItemId: 'book2' }],
	})
	const confirm = vi.mocked(window.confirm)
	fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
	expect(confirm).toHaveBeenCalledWith('Delete “Playlist”?')
	await waitFor(() =>
		expect(fetcher.mock.calls).toContainEqual([
			'/api/playlists/playlist',
			expect.objectContaining({ method: 'DELETE' }),
		]),
	)
	await waitFor(() => expect(router.navigate).toHaveBeenCalledWith({ to: '/' }))
	user('stranger')
	rerender(<PlaylistDetail playlist={playlist} />)
	expect(screen.queryByLabelText('Name')).toBeNull()
	expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
	expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
})
test('playlist owner adds individual item with exact request payload', async () => {
	user()
	getItemsMock.mockResolvedValue({
		results: [
			{
				...book,
				id: 'book3',
				media: { ...book.media, metadata: { title: 'Book 3' } },
			},
		],
		total: 1,
	} as never)
	const calls: Array<[string, RequestInit | undefined]> = []
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		calls.push([String(input), init])
		return Response.json(playlist)
	})
	render(<PlaylistDetail playlist={playlist} />)
	fireEvent.click(screen.getByRole('button', { name: 'Search' }))
	await screen.findByRole('option', { name: 'Book 3' })
	fireEvent.change(screen.getByLabelText('Item to add'), {
		target: { value: 'book3' },
	})
	fireEvent.click(screen.getByRole('button', { name: 'Add' }))
	await waitFor(() =>
		expect(
			calls.some(
				([url, init]) =>
					url === '/api/playlists/playlist/item' && init?.method === 'POST',
			),
		).toBe(true),
	)
	expect(
		JSON.parse(
			String(
				calls.find(([url]) => url === '/api/playlists/playlist/item')?.[1]
					?.body,
			),
		),
	).toEqual({ libraryItemId: 'book3' })
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
