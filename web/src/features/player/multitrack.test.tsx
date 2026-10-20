import {
	act,
	cleanup,
	fireEvent,
	render,
	waitFor,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Player, seekPlayback, sessionSchema, usePlayer } from '../../player'

afterEach(() => {
	cleanup()
	usePlayer.setState({ session: null, error: '' })
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
})
it('changes actual audio source, maps global seeks, advances tracks, syncs original time', async () => {
	vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
	vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
	const fetch = vi.fn().mockResolvedValue(new Response('OK'))
	vi.stubGlobal('fetch', fetch)
	const session = sessionSchema.parse({
		id: 'multi',
		episodeId: null,
		currentTime: 15,
		duration: 60,
		libraryItem: null,
		audioTracks: [
			{ contentUrl: '/first.mp3', duration: 10, startOffset: 0 },
			{ contentUrl: '/second.mp3', duration: 20, startOffset: 10 },
			{ contentUrl: '/third.mp3', duration: 30, startOffset: 30 },
		],
	})
	usePlayer.setState({ session, error: '' })
	const view = render(<Player />)
	const audio = view.getByLabelText('Audio playback') as HTMLAudioElement
	expect(new URL(audio.src).pathname).toBe('/second.mp3')
	fireEvent.loadedMetadata(audio)
	expect(audio.currentTime).toBe(5)
	act(() => seekPlayback(42))
	expect(new URL(audio.src).pathname).toBe('/third.mp3')
	fireEvent.loadedMetadata(audio)
	expect(audio.currentTime).toBe(12)
	act(() => seekPlayback(15))
	fireEvent.loadedMetadata(audio)
	fireEvent.ended(audio)
	expect(new URL(audio.src).pathname).toBe('/third.mp3')
	fireEvent.loadedMetadata(audio)
	expect(audio.currentTime).toBe(0)
	audio.currentTime = 8
	fireEvent.pause(audio)
	await waitFor(() =>
		expect(
			fetch.mock.calls.some(
				([, init]) => init?.body && JSON.parse(init.body).currentTime === 38,
			),
		).toBe(true),
	)
})
