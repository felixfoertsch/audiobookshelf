import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { api, useAuth } from '../../api'
import { SeriesPage } from './browse'

vi.mock('../../api', async (load) => ({
	...(await load<typeof import('../../api')>()),
	api: vi.fn(),
}))
const router = vi.hoisted(() => ({ invalidate: vi.fn() }))
vi.mock('@tanstack/react-router', () => ({
	useRouter: () => router,
	Link: ({
		children,
		to,
		params,
	}: {
		children: React.ReactNode
		to: string
		params?: Record<string, string>
	}) => <a href={to.replace('$id', params?.id || '')}>{children}</a>,
}))
afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
	router.invalidate.mockReset()
	useAuth.getState().set(null)
})
const data = {
	id: 'series/id',
	name: 'Series',
	description: '',
	books: [],
}
it('renders every series book with item navigation destination', () => {
	const book = {
		id: 'book-1',
		libraryId: 'lib',
		mediaType: 'book' as const,
		media: {
			metadata: { title: 'Series Book' },
			coverPath: null,
			mediaType: 'book' as const,
		},
		mediaProgress: null,
		addedAt: '',
		updatedAt: '',
	}
	render(<SeriesPage library="lib" data={{ ...data, books: [book] }} />)
	expect(
		screen.getByRole('link', { name: 'Series Book' }).getAttribute('href'),
	).toBe('/item/book-1')
})
it('marks series unfinished only after confirmation and submits exact book IDs', async () => {
	const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
	const book = {
		id: 'book-1',
		libraryId: 'lib',
		mediaType: 'book' as const,
		media: { metadata: { title: 'Book' }, coverPath: null },
		mediaProgress: null,
		addedAt: '',
		updatedAt: '',
	}
	const view = render(
		<SeriesPage library="lib" data={{ ...data, books: [book] }} />,
	)
	fireEvent.click(
		screen.getByRole('button', { name: 'Mark series unfinished' }),
	)
	expect(api).not.toHaveBeenCalled()
	confirm.mockReturnValue(true)
	vi.mocked(api).mockResolvedValueOnce(undefined as never)
	fireEvent.click(
		screen.getByRole('button', { name: 'Mark series unfinished' }),
	)
	await waitFor(() =>
		expect(api).toHaveBeenCalledWith(
			'/api/me/progress/batch/update',
			expect.anything(),
			{
				method: 'PATCH',
				body: JSON.stringify([{ libraryItemId: 'book-1', isFinished: false }]),
			},
		),
	)
	view.unmount()
	confirm.mockRestore()
})
it('opens and closes series RSS feed with exact requests and confirmed close', async () => {
	useAuth.setState({
		user: {
			id: 'admin',
			username: 'admin',
			accessToken: 'token',
			type: 'admin',
		},
	})
	const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
	const feedData = {
		...data,
		books: [],
		rssFeed: { id: 'feed/id', slug: 'series-feed' },
	}
	const view = render(<SeriesPage library="lib" data={feedData} />)
	fireEvent.click(screen.getByRole('button', { name: 'Close RSS feed' }))
	expect(confirm).toHaveBeenCalledWith(
		'Close RSS feed? Existing subscribers lose access.',
	)
	expect(api).not.toHaveBeenCalled()
	confirm.mockReturnValue(true)
	vi.mocked(api).mockResolvedValueOnce(undefined as never)
	fireEvent.click(screen.getByRole('button', { name: 'Close RSS feed' }))
	await waitFor(() =>
		expect(api).toHaveBeenCalledWith(
			'/api/feeds/feed%2Fid/close',
			expect.anything(),
			{ method: 'POST' },
		),
	)
	view.unmount()
	confirm.mockRestore()
	vi.mocked(api).mockReset()
	vi.spyOn(window, 'confirm').mockReturnValue(true)
	const openView = render(<SeriesPage library="lib" data={data} />)
	fireEvent.change(screen.getByLabelText('RSS slug'), {
		target: { value: 'series-feed' },
	})
	fireEvent.click(screen.getByRole('button', { name: 'Open RSS feed' }))
	await waitFor(() =>
		expect(api).toHaveBeenCalledWith(
			'/api/feeds/series/series%2Fid/open',
			expect.anything(),
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({
					slug: 'series-feed',
					serverAddress: 'http://localhost:3000',
					metadataDetails: { preventIndexing: true },
				}),
			}),
		),
	)
	openView.unmount()
})
it('re-adds series and invalidates data', async () => {
	vi.mocked(api).mockResolvedValueOnce(undefined as never)
	render(<SeriesPage library="lib" data={data} />)
	fireEvent.click(
		screen.getByRole('button', { name: 'Re-add series to continue listening' }),
	)
	await waitFor(() =>
		expect(api).toHaveBeenCalledWith(
			'/api/me/series/series%2Fid/readd-to-continue-listening',
			expect.anything(),
		),
	)
	await waitFor(() => expect(router.invalidate).toHaveBeenCalled())
})
it('confirms finished state and sends progress updates for every book', async () => {
	vi.spyOn(window, 'confirm').mockReturnValue(true)
	vi.mocked(api).mockResolvedValueOnce(undefined as never)
	render(<SeriesPage library="lib" data={data} />)
	fireEvent.click(screen.getByRole('button', { name: 'Mark series finished' }))
	await waitFor(() =>
		expect(api).toHaveBeenCalledWith(
			'/api/me/progress/batch/update',
			expect.anything(),
			expect.objectContaining({ method: 'PATCH', body: JSON.stringify([]) }),
		),
	)
})
