import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

afterEach(cleanup)

import { playlistSchema } from './entities-api'
import { PlaylistList } from './playlist-list'

vi.mock('@tanstack/react-router', () => ({
	Link: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

test('empty playlist list creates trimmed name, closes dialog and restores focus', async () => {
	const create = vi.fn().mockResolvedValue(true)
	render(<PlaylistList playlists={[]} pending={false} create={create} />)
	expect(screen.getByText(/No playlists yet/)).toBeTruthy()
	const trigger = screen.getByRole('button', { name: 'Create playlist' })
	fireEvent.click(trigger)
	fireEvent.change(screen.getByLabelText('Name'), {
		target: { value: '  Evening  ' },
	})
	fireEvent.click(
		within(screen.getByRole('dialog')).getByRole('button', {
			name: 'Create playlist',
		}),
	)
	await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
	expect(create).toHaveBeenCalledWith('Evening')
	expect(document.activeElement).toBe(trigger)
})

test('failed creation retains dialog and entered name with visible error', async () => {
	render(
		<PlaylistList
			playlists={[]}
			pending={false}
			create={vi.fn().mockResolvedValue(false)}
		/>,
	)
	fireEvent.click(screen.getByRole('button', { name: 'Create playlist' }))
	fireEvent.change(screen.getByLabelText('Name'), {
		target: { value: 'Evening' },
	})
	fireEvent.click(
		within(screen.getByRole('dialog')).getByRole('button', {
			name: 'Create playlist',
		}),
	)
	expect((await screen.findByRole('alert')).textContent).toBe(
		'Could not create playlist',
	)
	expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe(
		'Evening',
	)
})

test('playlist tile shows cover, name, item count and duration', () => {
	const playlist = playlistSchema.parse({
		id: 'evening',
		libraryId: 'books',
		userId: 'owner',
		name: 'Evening',
		items: [
			{
				libraryItemId: 'book',
				libraryItem: {
					id: 'book',
					libraryId: 'books',
					mediaType: 'book',
					media: {
						metadata: { title: 'Book' },
						coverPath: '/cover.jpg',
						duration: 60,
					},
				},
			},
		],
	})
	const { container } = render(
		<PlaylistList playlists={[playlist]} pending={false} create={vi.fn()} />,
	)
	expect(screen.getByRole('heading', { name: 'Evening' })).toBeTruthy()
	expect(screen.getByText('1 item · 1:00')).toBeTruthy()
	expect(container.querySelector('img')?.getAttribute('src')).toBe(
		'/api/items/book/cover?token=',
	)
})
