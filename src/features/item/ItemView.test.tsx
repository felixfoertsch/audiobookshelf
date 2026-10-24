import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ItemView } from './ItemView'
import { itemSchema } from './schemas'

const mocks = vi.hoisted(() => ({
	user: {
		type: 'user',
		permissions: { update: false, download: false, delete: false },
	},
	getItem: vi.fn(),
	updateProgress: vi.fn(),
	resetProgress: vi.fn(),
	api: vi.fn(),
}))
vi.mock('../../api', () => ({
	api: mocks.api,
	useAuth: (select: (state: { user: typeof mocks.user }) => unknown) =>
		select({ user: mocks.user }),
}))
vi.mock('@tanstack/react-router', () => ({
	Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
		<a href={to}>{children}</a>
	),
}))
vi.mock('../../player', () => ({
	enqueueEpisode: vi.fn(),
	playEpisode: vi.fn(),
	seekPlayback: vi.fn(),
	usePlayer: { getState: () => ({}) },
}))
vi.mock('../podcast', () => ({
	PodcastManagementSettings: ({
		children,
	}: {
		children: (content: React.ReactNode) => React.ReactNode
	}) => children(<form aria-label="Podcast settings">Settings</form>),
}))
vi.mock('../reader', () => ({ Reader: () => null, readerItemSchema: {} }))
vi.mock('./ItemActions', () => ({ ItemActions: () => null }))
vi.mock('./service', () => ({
	getItem: mocks.getItem,
	checkPodcastFeed: vi.fn(),
	deleteEpisode: vi.fn(),
	updateMedia: vi.fn(),
	updateProgress: mocks.updateProgress,
	resetProgress: mocks.resetProgress,
}))
beforeEach(() => {
	mocks.user = {
		type: 'user',
		permissions: { update: false, download: false, delete: false },
	}
	mocks.getItem.mockResolvedValue({
		id: 'show',
		mediaType: 'podcast',
		media: {
			metadata: { title: 'Show' },
			episodes: Array.from({ length: 51 }, (_, i) => ({
				id: `ep-${i}`,
				title: `Episode ${i + 1}`,
				description: 'Episode description',
				audioFile: { duration: 100 },
			})),
		},
	})
})
afterEach(cleanup)
// Browser audit covers all 489 episodes; units exercise two full pages and a partial last page.
// Real Sheet trees exceeded 5 s in Docker CI; keep this integration check bounded at 10 s.
it('bounds episode pages, reaches last page, and discloses descriptions', {
	timeout: 10_000,
}, async () => {
	render(<ItemView id="show" />)
	await screen.findByRole('heading', { name: /^Episode 1$/ })
	expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(25)
	expect(screen.getAllByText('Episode description')).toHaveLength(25)
	// jsdom has no layout dimensions, so descriptions must not expose an
	// expander unless overflow measurement confirms clipped content.
	expect(screen.queryByRole('button', { name: 'Read description' })).toBeNull()
	expect(screen.getAllByText('Episode description')).toHaveLength(25)
	const next = screen.getByRole('button', { name: 'Next episodes' })
	fireEvent.click(next)
	expect(screen.getByRole('heading', { name: 'Episode 26' })).toBeTruthy()
	expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(25)
	fireEvent.click(next)
	expect(screen.getByRole('button', { name: 'Next episodes' })).toBe(next)
	expect(screen.getByRole('heading', { name: 'Episode 51' })).toBeTruthy()
	expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1)
	expect(
		screen
			.getByRole('button', { name: 'Next episodes' })
			.hasAttribute('disabled'),
	).toBe(true)
})
it('shows candidate status only when expanded item explicitly enables analysis', async () => {
	const response = (adAnalysisEnabled?: boolean) =>
		itemSchema.parse({
			id: 'show',
			mediaType: 'podcast',
			...(adAnalysisEnabled === undefined ? {} : { adAnalysisEnabled }),
			media: {
				metadata: { title: 'Show' },
				episodes: [
					{
						id: 'ep-0',
						title: 'Episode 1',
						audioFile: { duration: 100 },
						adAnalysisEnabled: true,
						adAnalysis: {
							status: 'complete',
							version: '1',
							sourceSha256: 'a'.repeat(64),
							adAnalysisEnabled: true,
							applicable: true,
							segments: [{ start: 10, end: 20 }],
						},
					},
				],
			},
		})
	mocks.getItem.mockResolvedValue(response(true))
	render(<ItemView id="show" />)
	expect(
		await screen.findByRole('img', {
			name: /Inserted audio found: 1 breaks, 10 seconds/,
		}),
	).toBeTruthy()
	expect(mocks.api).not.toHaveBeenCalled()

	for (const item of [response(false), response()]) {
		cleanup()
		mocks.getItem.mockResolvedValue(item)
		render(<ItemView id="show" />)
		await screen.findByRole('heading', { name: 'Episode 1' })
		expect(
			screen.queryByRole('img', { name: /Inserted audio found/ }),
		).toBeNull()
		expect(mocks.api).not.toHaveBeenCalled()
	}
})

it('keeps podcast management in scoped modal, returns focus with Escape', async () => {
	mocks.user.type = 'admin'
	render(<ItemView id="show" />)
	const trigger = await screen.findByRole('button', {
		name: 'Podcast settings',
	})
	expect(screen.queryByRole('form', { name: 'Podcast settings' })).toBeNull()
	fireEvent.click(trigger)
	const dialog = screen.getByRole('dialog', { name: 'Podcast settings' })
	expect(
		within(dialog).getByRole('form', { name: 'Podcast settings' }),
	).toBeTruthy()
	fireEvent.keyDown(dialog, { key: 'Escape' })
	await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
	await waitFor(() => expect(document.activeElement).toBe(trigger))
})

it('aligns audiobook tool links with update and admin capabilities', async () => {
	mocks.getItem.mockResolvedValue({
		id: 'book',
		mediaType: 'book',
		media: { metadata: { title: 'Book' } },
	})
	const view = render(<ItemView id="book" />)
	await screen.findByRole('heading', { name: 'Book' })
	expect(screen.queryByRole('link', { name: 'Edit chapters' })).toBeNull()
	mocks.user.permissions.update = true
	view.rerender(<ItemView id="book" />)
	expect(screen.getByRole('link', { name: 'Edit chapters' })).toBeTruthy()
	expect(
		screen.getByRole('link', { name: 'Edit tracks, metadata and cover' }),
	).toBeTruthy()
	expect(
		screen.queryByRole('link', { name: 'Encoding and metadata embedding' }),
	).toBeNull()
	mocks.user.type = 'root'
	mocks.user.permissions.update = false
	view.rerender(<ItemView id="book" />)
	expect(
		screen.getByRole('link', { name: 'Encoding and metadata embedding' }),
	).toBeTruthy()
	expect(screen.queryByRole('link', { name: 'Edit chapters' })).toBeNull()
})

// Real Sheet trees exceeded 5 s in Docker CI; keep this integration check bounded at 10 s.
it('shows episode status and discloses server reset before marking unfinished', {
	timeout: 10_000,
}, async () => {
	const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
	mocks.updateProgress.mockResolvedValue({})
	const view = render(<ItemView id="show" />)
	await screen.findByRole('heading', { name: 'Episode 1' })
	const row = screen.getByRole('heading', { name: 'Episode 1' }).closest('li')
	if (!row) throw new Error('Missing episode row')
	expect(within(row).getByText('Unplayed')).toBeTruthy()
	fireEvent.click(
		within(row).getByRole('button', { name: 'Mark finished: Episode 1' }),
	)
	await waitFor(() =>
		expect(mocks.updateProgress).toHaveBeenCalledWith(
			'show',
			{ isFinished: true },
			'ep-0',
		),
	)
	Object.assign(mocks.user, {
		mediaProgress: [
			{
				libraryItemId: 'show',
				episodeId: 'ep-0',
				isFinished: true,
				currentTime: 50,
			},
		],
	})
	view.rerender(<ItemView id="show" />)
	expect(within(row).getByText('Finished')).toBeTruthy()
	fireEvent.click(
		within(row).getByRole('button', { name: 'Mark unfinished: Episode 1' }),
	)
	await waitFor(() =>
		expect(mocks.updateProgress).toHaveBeenCalledWith(
			'show',
			{ isFinished: false },
			'ep-0',
		),
	)
	expect(confirm).toHaveBeenCalledWith(
		'Mark unfinished? This resets the saved listening position to the beginning.',
	)
	confirm.mockRestore()
})
it('retains episode state and exposes failed completion', async () => {
	mocks.updateProgress.mockRejectedValue(new Error('Progress rejected'))
	render(<ItemView id="show" />)
	await screen.findByRole('heading', { name: 'Episode 1' })
	const row = screen.getByRole('heading', { name: 'Episode 1' }).closest('li')
	if (!row) throw new Error('Missing episode row')
	fireEvent.click(
		within(row).getByRole('button', { name: 'Mark finished: Episode 1' }),
	)
	expect((await screen.findByRole('alert')).textContent).toBe(
		'Progress rejected',
	)
	expect(within(row).getByText('Unplayed')).toBeTruthy()
})

it('renders canonical audiobook percentage after a socket-driven auth update', async () => {
	mocks.getItem.mockResolvedValue({
		id: 'book',
		mediaType: 'book',
		userMediaProgress: { progress: 0.1, currentTime: 10 },
		media: { metadata: { title: 'Book' } },
	})
	const view = render(<ItemView id="book" />)
	await screen.findByText(/Progress 10%/)
	Object.assign(mocks.user, {
		mediaProgress: [
			{
				libraryItemId: 'book',
				episodeId: null,
				progress: 0.75,
				currentTime: 75,
			},
		],
	})
	view.rerender(<ItemView id="book" />)
	expect(screen.getByText(/Progress 75%/)).toBeTruthy()
})
it('recovers unavailable status and clears only progress errors after reconnect succeeds', async () => {
	const progress = await import('./progress')
	const refresh = vi
		.spyOn(progress, 'refreshProgress')
		.mockRejectedValueOnce(new Error('Progress offline'))
		.mockResolvedValue(undefined)
	Object.assign(mocks.user, { id: 'owner', mediaProgress: [] })
	render(<ItemView id="show" />)
	await screen.findByText('Progress offline')
	expect(screen.getAllByText('Status unavailable').length).toBe(25)
	window.dispatchEvent(
		new CustomEvent('abs:socket', { detail: { event: 'reconnect' } }),
	)
	await waitFor(() => expect(screen.queryByText('Progress offline')).toBeNull())
	expect(screen.getAllByText('Unplayed').length).toBe(25)
	refresh.mockRestore()
})

it('book reset and unfinished cancel without writes; confirmed actions refresh canonical item', async () => {
	const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
	mocks.resetProgress.mockResolvedValue({})
	mocks.updateProgress.mockResolvedValue({})
	mocks.getItem.mockResolvedValue({
		id: 'book',
		mediaType: 'book',
		userMediaProgress: {
			id: 'progress-book',
			isFinished: true,
			currentTime: 70,
		},
		media: { metadata: { title: 'Book' } },
	})
	render(<ItemView id="book" />)
	const reset = await screen.findByRole('button', { name: 'Reset progress' })
	const unfinished = screen.getByRole('button', { name: 'Mark unfinished' })
	mocks.resetProgress.mockClear()
	mocks.updateProgress.mockClear()
	mocks.getItem.mockClear()
	fireEvent.click(reset)
	fireEvent.click(unfinished)
	expect(mocks.resetProgress).not.toHaveBeenCalled()
	expect(mocks.updateProgress).not.toHaveBeenCalled()
	confirm.mockReturnValue(true)
	fireEvent.click(unfinished)
	await waitFor(() =>
		expect(mocks.updateProgress).toHaveBeenCalledWith('book', {
			isFinished: false,
		}),
	)
	await waitFor(() => expect(mocks.getItem).toHaveBeenCalledWith('book'))
	await waitFor(() => expect(reset.hasAttribute('disabled')).toBe(false))
	fireEvent.click(reset)
	await waitFor(() =>
		expect(mocks.resetProgress).toHaveBeenCalledWith('progress-book', 'book'),
	)
	expect(confirm).toHaveBeenCalledWith(
		expect.stringContaining('saved listening position'),
	)
	confirm.mockRestore()
})

it('book metadata links native author and series routes and retains zero sequence', async () => {
	mocks.getItem.mockResolvedValue({
		id: 'book',
		libraryId: 'books',
		mediaType: 'book',
		media: {
			metadata: {
				title: 'Book',
				authors: [{ id: 'author', name: 'Writer' }],
				series: [{ id: 'series', name: 'Saga', sequence: '0' }],
			},
		},
	})
	render(<ItemView id="book" />)
	expect(
		(await screen.findByRole('link', { name: 'Writer' })).getAttribute('href'),
	).toBe('/author/$id')
	expect(screen.getByRole('link', { name: 'Saga' }).getAttribute('href')).toBe(
		'/library/$library/series/$id',
	)
	expect(screen.getByText(/#0/)).toBeTruthy()
	expect(screen.queryByText('Publisher')).toBeNull()
})
