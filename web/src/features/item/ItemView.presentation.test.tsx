import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ItemView } from './ItemView'

const play = vi.hoisted(() => vi.fn())
vi.mock('../../api', () => ({
	useAuth: (select: (state: { user: null }) => unknown) =>
		select({ user: null }),
}))
vi.mock('../../player', () => ({
	playEpisode: play,
	enqueueEpisode: vi.fn(),
	usePlayer: { getState: () => ({}) },
}))
vi.mock('./ItemActions', () => ({ ItemActions: () => null }))
vi.mock('./service', () => ({
	getItem: async () => ({
		id: 'show',
		mediaType: 'podcast',
		path: '/podcasts/show',
		media: {
			size: 1_500_000_000,
			metadata: {
				title: 'Show',
				description: 'Show description',
				language: 'en',
			},
			episodes: [
				{ id: 'old', publishedAt: 1000, audioFile: {} },
				{ id: 'new', publishedAt: 2000, audioFile: {} },
			],
		},
	}),
}))
afterEach(cleanup)
it('plays newest publication, discloses hero description, uses decimal size units', async () => {
	render(<ItemView id="show" />)
	fireEvent.click(
		await screen.findByRole('button', { name: 'Play latest episode' }),
	)
	expect(play).toHaveBeenCalledWith('show', 'new')
	expect(screen.getByText('2 episodes')).toBeTruthy()
	expect(screen.getByRole('heading', { name: 'Information' })).toBeTruthy()
	expect(
		screen.getByText(
			`${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(1.5)} GB`,
		),
	).toBeTruthy()
	const more = screen.getByRole('button', { name: 'More' })
	expect(more.getAttribute('aria-expanded')).toBe('false')
	fireEvent.click(more)
	expect(
		screen.getByRole('button', { name: 'Less' }).getAttribute('aria-expanded'),
	).toBe('true')
})
