import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { PlaylistDetail } from './entities'
import { playlistSchema } from './entities-api'

vi.mock('@tanstack/react-router', () => ({
	useNavigate: () => vi.fn(),
	useRouter: () => ({ invalidate: vi.fn() }),
	Link: ({ children }: { children: React.ReactNode }) => (
		<span>{children}</span>
	),
}))
afterEach(cleanup)

test('empty and unavailable playlists disable playback without hiding membership', async () => {
	const playlist = playlistSchema.parse({
		id: 'playlist',
		libraryId: 'library',
		userId: 'owner',
		name: 'Playlist',
		items: [],
	})
	const { rerender } = render(<PlaylistDetail playlist={playlist} />)
	expect(screen.getByText('No items in this playlist.')).toBeTruthy()
	for (const name of ['Play playlist', 'Shuffle playlist'])
		expect(
			(screen.getByRole('button', { name }) as HTMLButtonElement).disabled,
		).toBe(true)
	rerender(
		<PlaylistDetail
			playlist={{
				...playlist,
				items: [
					{
						libraryItemId: 'book',
						libraryItem: {
							id: 'book',
							mediaType: 'book',
							isMissing: true,
							media: { metadata: { title: 'Missing book' }, numAudioFiles: 1 },
						},
					},
				],
			}}
		/>,
	)
	expect(screen.getByText('Missing book')).toBeTruthy()
	expect(screen.getByText('Audio unavailable')).toBeTruthy()
	fireEvent.keyDown(screen.getByRole('button', { name: 'Playlist actions' }), {
		key: 'Enter',
	})
	expect(
		(
			await screen.findByRole('menuitem', { name: 'Add to queue' })
		).getAttribute('aria-disabled'),
	).toBe('true')
	fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
	for (const name of ['Play playlist', 'Shuffle playlist', 'Play Missing book'])
		expect(
			(
				screen.getByRole('button', {
					name: new RegExp(`^${name}$`),
				}) as HTMLButtonElement
			).disabled,
		).toBe(true)
})
