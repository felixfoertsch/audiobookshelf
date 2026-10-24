import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterProvider,
} from '@tanstack/react-router'
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../api'
import { playEpisode } from '../../player'
import { EntryCard } from './browse'

vi.mock('../../api', () => ({
	api: vi.fn(),
	getAuthGeneration: vi.fn(),
	useAuth: Object.assign(
		(select: (state: { user: null }) => unknown) => select({ user: null }),
		{ getState: vi.fn() },
	),
}))
vi.mock('../../player', () => ({ playEpisode: vi.fn(), playQueue: vi.fn() }))
afterEach(() => {
	cleanup()
	vi.clearAllMocks()
})
async function show(entry: Record<string, unknown>, shelfId: string) {
	const root = createRootRoute({
		component: () => (
			<EntryCard library="lib" entry={entry as never} shelfId={shelfId} />
		),
	})
	const router = createRouter({
		routeTree: root,
		history: createMemoryHistory({ initialEntries: ['/'] }),
	})
	await router.load()
	render(<RouterProvider router={router} />)
}
const book = {
	id: 'book-1',
	mediaType: 'book',
	media: {
		metadata: {
			title: 'Book',
			series: [{ id: 'series-1', name: 'Saga', sequence: '2' }],
		},
	},
	userMediaProgress: { id: 'progress-book-1', currentTime: 42, duration: 100 },
}
describe('continue shelf actions', () => {
	it('resumes audiobook at stored position and shows series context', async () => {
		vi.mocked(playEpisode).mockResolvedValueOnce(undefined as never)
		await show(book, 'continue-listening')
		fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
		expect(playEpisode).toHaveBeenCalledWith('book-1', undefined, false, 42)
		expect(
			screen.getByRole('link', { name: 'Saga · 2' }).getAttribute('href'),
		).toBe('/library/lib/series/series-1')
	})
	it('hides only continue-listening target item', async () => {
		vi.mocked(api).mockResolvedValue({} as never)
		await show(book, 'continue-listening')
		fireEvent.click(
			screen.getByRole('button', { name: 'Hide from Continue Listening' }),
		)
		await waitFor(() =>
			expect(
				screen.queryByRole('button', { name: 'Hide from Continue Listening' }),
			).toBeNull(),
		)
		expect(api).toHaveBeenCalledWith(
			'/api/me/progress/progress-book-1/remove-from-continue-listening',
			expect.anything(),
		)
	})
	it('renders native continue-series object context without invented progress', async () => {
		vi.mocked(playEpisode).mockResolvedValue({
			id: 'session',
			episodeId: null,
			currentTime: 0,
			duration: 100,
			audioTracks: [],
			libraryItem: { media: {} },
		})
		await show(
			{
				...book,
				userMediaProgress: undefined,
				media: {
					metadata: {
						title: 'Next book',
						series: { id: 'series-1', name: 'Saga', sequence: '3' },
					},
				},
			},
			'continue-series',
		)
		expect(screen.getByRole('link', { name: 'Saga · 3' })).toBeTruthy()
		expect(screen.queryByText(/Progress:/)).toBeNull()
		fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
		expect(playEpisode).toHaveBeenCalledWith('book-1', undefined, false, 0)
	})
	it('does not offer audiobook resume for continue-reading shelf', async () => {
		await show(book, 'continue-reading')
		expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull()
	})
	it('surfaces hide failure and preserves item', async () => {
		vi.mocked(api).mockRejectedValueOnce(new Error('Network unavailable'))
		await show(book, 'continue-listening')
		fireEvent.click(
			screen.getByRole('button', { name: 'Hide from Continue Listening' }),
		)
		expect((await screen.findByRole('alert')).textContent).toBe(
			'Network unavailable',
		)
		expect(
			screen.getByRole('button', { name: 'Hide from Continue Listening' }),
		).toBeTruthy()
	})
	it('keeps series re-add available without hiding continue-series item', async () => {
		await show(book, 'continue-series')
		expect(
			screen.queryByRole('button', { name: 'Hide from Continue Listening' }),
		).toBeNull()
		expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy()
	})
})
