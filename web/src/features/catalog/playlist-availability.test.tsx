import { cleanup, render, screen } from '@testing-library/react'
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

test('empty and unavailable playlists disable playback without hiding membership', () => {
	const playlist = playlistSchema.parse({
		id: 'playlist',
		libraryId: 'library',
		userId: 'owner',
		name: 'Playlist',
		items: [],
	})
	const { rerender } = render(<PlaylistDetail playlist={playlist} />)
	expect(screen.getByText('No items in this playlist.')).toBeTruthy()
	for (const name of ['Play playlist', 'Add to queue', 'Shuffle playlist'])
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
	for (const name of [
		'Play playlist',
		'Add to queue',
		'Shuffle playlist',
		'Play',
	])
		expect(
			(screen.getByRole('button', { name: new RegExp(`^${name}$`) }) as HTMLButtonElement)
				.disabled,
		).toBe(true)
})
