import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { useAuth } from './api'
import { Player, seekPlayback, sessionSchema, usePlayer } from './player'

vi.mock('@tanstack/react-router', () => ({
	Link: ({ children }: { children: React.ReactNode }) => (
		<span>{children}</span>
	),
}))
afterEach(() => {
	cleanup()
	usePlayer.getState().set(null)
	vi.restoreAllMocks()
})
test('mounted player preserves ordinary playback for unverified native analysis across sessions', () => {
	vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
	vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
	vi.spyOn(globalThis, 'fetch').mockResolvedValue(
		Response.json({ bookmarks: [] }),
	)
	useAuth.setState({ user: { id: 'A', username: 'A', accessToken: 'fixture' } })
	const session = (id: string, item = 'podcast', episode = 'ep') =>
		sessionSchema.parse({
			id,
			libraryItemId: item,
			episodeId: episode,
			currentTime: 9,
			duration: 60,
			audioTracks: [{ contentUrl: '/media/local.mp3', duration: 60 }],
			libraryItem: {
				media: {
					episodes: [
						{
							id: episode,
							adAnalysis: {
								status: 'candidates',
								segments: [{ start: 10, end: 20 }],
							},
						},
					],
				},
			},
		})
	usePlayer.getState().set(session('first'))
	render(<Player />)
	const tick = () => {
		const audio = screen.getByLabelText('Audio playback') as HTMLAudioElement
		Object.defineProperty(audio, 'paused', { configurable: true, value: false })
		Object.defineProperty(audio, 'readyState', { configurable: true, value: 4 })
		fireEvent.loadedMetadata(audio)
		audio.currentTime = 11
		fireEvent.timeUpdate(audio)
		return audio.currentTime
	}
	expect(tick()).toBe(11)
	const stream = (id: string, percent: string) =>
		act(() => {
			window.dispatchEvent(
				new CustomEvent('abs:socket', {
					detail: { event: 'stream_progress', payload: { id, percent } },
				}),
			)
		})
	stream('other', '25.00%')
	expect(screen.queryByText('Transcoding 25%')).toBeNull()
	stream('first', '25.00%')
	expect(screen.getByText('Transcoding 25%')).toBeTruthy()
	stream('first', '101%')
	expect(screen.queryByText('Transcoding 101%')).toBeNull()
	act(() => seekPlayback(11))
	expect(tick()).toBe(11)
	act(() => seekPlayback(9))
	expect(tick()).toBe(11)
	act(() => usePlayer.getState().set(session('reload')))
	expect(tick()).toBe(11)
	act(() =>
		usePlayer.getState().set(session('other-episode', 'podcast', 'other')),
	)
	expect(tick()).toBe(11)
	act(() =>
		usePlayer.getState().set(session('other-item', 'different', 'other')),
	)
	expect(tick()).toBe(11)
	act(() => useAuth.setState({ user: null }))
	act(() =>
		useAuth.setState({
			user: { id: 'B', username: 'B', accessToken: 'fixture-b' },
		}),
	)
	act(() =>
		usePlayer.getState().set(session('new-account', 'different', 'other')),
	)
	expect(tick()).toBe(11)
})
