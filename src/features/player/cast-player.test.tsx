import {
	act,
	cleanup,
	fireEvent,
	render,
	waitFor,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

const cast = vi.hoisted(() => ({
	state: {
		available: true,
		connected: false,
		device: 'Mock receiver',
		error: '',
	},
	load: vi.fn().mockResolvedValue(undefined),
	stop: vi.fn(),
	playing: vi.fn(),
	snapshot: vi.fn(),
}))
vi.mock('./cast', () => ({
	useCast: Object.assign(() => cast.state, { getState: () => cast.state }),
	castSnapshot: cast.snapshot,
	loadCast: cast.load,
	stopCast: cast.stop,
	setCastPlaying: cast.playing,
	setCastVolume: vi.fn(),
	setCastRate: vi.fn().mockResolvedValue(undefined),
	seekCast: vi.fn().mockResolvedValue(undefined),
	disconnectCast: vi.fn(),
}))
vi.mock('@tanstack/react-router', () => ({
	Link: ({ children }: { children: import('react').ReactNode }) => children,
}))

import {
	handoffPlayback,
	Player,
	playEpisode,
	seekPlayback,
	sessionSchema,
	usePlayer,
} from '../../player'
import { seekCast } from './cast'

const native = {
	id: 'local',
	libraryItemId: 'book',
	episodeId: null,
	currentTime: 12,
	duration: 60,
	playMethod: 0,
	mediaType: 'book',
	audioTracks: [
		{
			index: 7,
			title: 'First',
			contentUrl: '/first.mp3',
			mimeType: 'audio/mpeg',
			startOffset: 0,
			duration: 20,
		},
		{
			index: 9,
			title: 'Second',
			contentUrl: '/second.mp3',
			mimeType: 'audio/mpeg',
			startOffset: 20,
			duration: 40,
		},
	],
	libraryItem: null,
}
afterEach(() => {
	cleanup()
	usePlayer.setState({ session: null, error: '' })
	cast.state.connected = false
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
	cast.load.mockReset().mockResolvedValue(undefined)
	cast.snapshot.mockReset()
	cast.stop.mockClear()
})
it('flush failure blocks handoff; successful transfer uses stable device and direct Cast flags, then returns paused at remote global time', async () => {
	vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
	vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
	let fail = true
	const fetch = vi.fn(async (url: string, _init?: RequestInit) => {
		if (url.includes('/bookmarks/'))
			return new Response(JSON.stringify({ bookmarks: [] }))
		if (url.endsWith('/close') && fail)
			return new Response('failed', { status: 503 })
		if (url.includes('/play'))
			return new Response(JSON.stringify({ ...native, id: 'fresh' }))
		return new Response('{}')
	})
	vi.stubGlobal('fetch', fetch)
	localStorage.setItem('absDeviceId', 'same-device')
	usePlayer.setState({ session: sessionSchema.parse(native), error: '' })
	const view = render(<Player />)
	const audio = view.getByLabelText('Audio playback') as HTMLAudioElement
	fireEvent.loadedMetadata(audio)
	audio.currentTime = 17
	await expect(handoffPlayback('cast')).rejects.toThrow()
	expect(cast.load).not.toHaveBeenCalled()
	expect(fetch.mock.calls.some(([url]) => url.includes('/play'))).toBe(false)
	fail = false
	await act(async () => {
		await handoffPlayback('cast')
	})
	const play = fetch.mock.calls.find(([url]) => url.includes('/play'))
	expect(JSON.parse(String(play?.[1]?.body))).toMatchObject({
		mediaPlayer: 'chromecast',
		forceDirectPlay: true,
		forceTranscode: false,
		deviceInfo: { deviceId: 'same-device' },
	})
	expect(cast.load).toHaveBeenCalledWith(
		expect.objectContaining({
			id: 'fresh',
			audioTracks: expect.arrayContaining([
				expect.objectContaining({ index: 9 }),
			]),
		}),
		expect.objectContaining({ currentTime: 17, autoplay: false }),
	)
	cast.state.connected = true
	cast.snapshot.mockReturnValue({
		currentTime: 43,
		paused: true,
		volume: 1,
		ended: false,
	})
	await act(async () => {
		await handoffPlayback('local')
	})
	expect(cast.stop).toHaveBeenCalledTimes(1)
	await waitFor(() =>
		expect(usePlayer.getState().session?.currentTime).toBe(43),
	)
	expect(usePlayer.getState().session?.modernCast).toBe(false)
	expect(usePlayer.getState().session?.modernAutoplay).toBe(false)
})
it('receiver load rejection cannot report successful handoff or start local audio', async () => {
	const play = vi
		.spyOn(HTMLMediaElement.prototype, 'play')
		.mockResolvedValue(undefined)
	vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
	const fetch = vi.fn(
		async (url: string) =>
			new Response(
				JSON.stringify(url.includes('/play') ? native : { bookmarks: [] }),
			),
	)
	vi.stubGlobal('fetch', fetch)
	cast.state.connected = true
	cast.load.mockRejectedValueOnce(new Error('Receiver refused media'))
	await expect(
		playEpisode('book', undefined, false, undefined, {
			target: 'cast',
			autoplay: false,
			rate: 1,
		}),
	).rejects.toThrow('Receiver refused media')
	render(<Player />)
	expect(usePlayer.getState().error).toBe('Receiver refused media')
	expect(usePlayer.getState().session?.modernCastLoaded).not.toBe(true)
	expect(cast.stop).toHaveBeenCalledTimes(1)
	expect(play).not.toHaveBeenCalled()
})

it('same transport, progress, rate and volume controls drive Cast instead of local audio', async () => {
	vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
	vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => Response.json({ bookmarks: [] })),
	)
	cast.state.connected = true
	cast.snapshot.mockReturnValue({
		currentTime: 12,
		paused: false,
		volume: 0.6,
		ended: false,
	})
	usePlayer.setState({
		session: sessionSchema.parse({
			...native,
			modernCast: true,
			modernCastLoaded: true,
		}),
		error: '',
	})
	const view = render(<Player />)
	fireEvent.click(view.getByRole('button', { name: /^Pause$/ }))
	expect(cast.playing).toHaveBeenCalledWith(false)
	const { seekCast, setCastRate, setCastVolume } = await import('./cast')
	fireEvent.click(view.getByRole('button', { name: 'Skip forward 30 seconds' }))
	expect(seekCast).toHaveBeenCalledWith(42)
	fireEvent.keyDown(view.getByRole('slider', { name: 'Playback progress' }), {
		key: 'ArrowRight',
		code: 'ArrowRight',
	})
	expect(seekCast).toHaveBeenCalledWith(13)
	fireEvent.click(view.getByRole('button', { name: 'Player options' }))
	fireEvent.change(view.getByLabelText('Playback speed'), {
		target: { value: '1.5' },
	})
	expect(setCastRate).toHaveBeenCalledWith(1.5)
	fireEvent.keyDown(view.getByRole('slider', { name: 'Volume' }), {
		key: 'Home',
	})
	expect(setCastVolume).toHaveBeenCalledWith(0)
	const audio = view.getByLabelText('Audio playback') as HTMLAudioElement
	expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled()
	expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1) // Session replacement pauses local audio once.
	expect(audio.currentTime).not.toBe(42)
})
it('Cast poll skips crossings, not seek destinations, and skips repeated crossings', () => {
	vi.useFakeTimers()
	vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValue(Response.json({ bookmarks: [] })),
	)
	vi.mocked(seekCast).mockClear()
	cast.state.connected = true
	const snapshot = { currentTime: 9, paused: false, volume: 1, ended: false }
	cast.snapshot.mockImplementation(() => snapshot)
	usePlayer.setState({
		session: sessionSchema.parse({
			...native,
			currentTime: 9,
			episodeId: 'ep',
			modernCast: true,
			modernCastLoaded: true,
			libraryItem: {
				media: {
					episodes: [
						{
							id: 'ep',
							adAnalysis: {
								status: 'candidates',
								segments: [
									{ start: 10, end: 20 },
									{ start: 30, end: 40 },
								],
							},
						},
					],
				},
			},
		}),
		error: '',
	})
	const view = render(<Player />)
	const descriptionId = view
		.getByRole('slider', { name: 'Playback progress' })
		.getAttribute('aria-describedby')
	expect(document.getElementById(descriptionId || '')?.textContent).toBe(
		'Detected segment ranges: 0:10–0:20, 0:30–0:40',
	)
	expect(view.getAllByTestId('segment-marker')).toHaveLength(2)
	const tick = (time: number) =>
		act(() => {
			snapshot.currentTime = time
			vi.advanceTimersByTime(1000)
		})
	tick(10.2)
	expect(seekCast).toHaveBeenLastCalledWith(20)
	act(() => seekPlayback(15))
	tick(15.2)
	expect(seekCast).toHaveBeenLastCalledWith(15)
	tick(30.2)
	expect(seekCast).toHaveBeenLastCalledWith(40)
	act(() => seekPlayback(9))
	tick(10.2)
	expect(seekCast).toHaveBeenLastCalledWith(20)
	view.unmount()
	vi.useRealTimers()
})
