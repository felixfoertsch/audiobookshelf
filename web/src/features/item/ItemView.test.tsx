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

const mocks = vi.hoisted(() => ({
	user: {
		type: 'user',
		permissions: { update: false, download: false, delete: false },
	},
	getItem: vi.fn(),
}))
vi.mock('../../api', () => ({
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
	updateProgress: vi.fn(),
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
	expect(screen.queryByText('Episode description')).toBeNull()
	fireEvent.click(screen.getAllByRole('button', { name: 'Read more' })[0])
	expect(screen.getByText('Episode description')).toBeTruthy()
	fireEvent.click(screen.getByRole('button', { name: 'Read less' }))
	expect(screen.queryByText('Episode description')).toBeNull()
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
