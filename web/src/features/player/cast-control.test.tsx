import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

const cast = vi.hoisted(() => ({
	connected: true,
	paused: false,
	position: 12,
}))
vi.mock('./cast', () => ({
	useCast: Object.assign(
		() => ({
			available: true,
			connected: cast.connected,
			device: 'Receiver',
			error: '',
		}),
		{ getState: () => ({ connected: cast.connected }) },
	),
	castSnapshot: () =>
		cast.connected
			? {
					currentTime: cast.position,
					paused: cast.paused,
					ended: false,
					volume: 1,
				}
			: null,
	setCastPlaying: vi.fn(),
	stopCast: vi.fn(),
	seekCast: vi.fn(),
	setCastRate: vi.fn(),
	setCastVolume: vi.fn(),
	loadCast: vi.fn(),
	disconnectCast: vi.fn(),
}))
vi.mock('@tanstack/react-router', () => ({
	Link: ({ children }: { children: import('react').ReactNode }) => children,
}))

import { Player, sessionSchema, usePlayer } from '../../player'

afterEach(() => {
	cleanup()
	vi.useRealTimers()
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
	usePlayer.setState({ session: null, error: '' })
})
it('remote owner retains listening delta after failed sync; disconnect never starts local audio', async () => {
	vi.useFakeTimers()
	vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
	const play = vi
		.spyOn(HTMLMediaElement.prototype, 'play')
		.mockResolvedValue(undefined)
	let syncCount = 0
	const fetch = vi.fn(
		async (url: string, _init?: RequestInit) =>
			new Response(
				url.endsWith('/sync') && ++syncCount === 1 ? 'failed' : '{}',
				{ status: url.endsWith('/sync') && syncCount === 1 ? 503 : 200 },
			),
	)
	vi.stubGlobal('fetch', fetch)
	usePlayer.setState({
		error: '',
		session: sessionSchema.parse({
			id: 'cast',
			libraryItemId: 'book',
			episodeId: null,
			currentTime: 12,
			duration: 60,
			modernCast: true,
			modernCastLoaded: true,
			audioTracks: [
				{ index: 1, contentUrl: '/audio.mp3', duration: 60, startOffset: 0 },
			],
			libraryItem: null,
		}),
	})
	render(<Player />)
	await act(async () => {
		await vi.advanceTimersByTimeAsync(10000)
	})
	const first = fetch.mock.calls.filter(([url]) => url.endsWith('/sync'))
	expect(first).toHaveLength(1)
	await act(async () => {
		await vi.advanceTimersByTimeAsync(10000)
	})
	const syncs = fetch.mock.calls.filter(([url]) => url.endsWith('/sync'))
	expect(syncs).toHaveLength(2)
	// Read native requests, not SDK state: failed listening delta must be retried.
	const calls = fetch.mock.calls as unknown as [string, RequestInit][]
	const deltas = calls
		.filter(([url]) => url.endsWith('/sync'))
		.map(([, init]) => JSON.parse(String(init.body)).timeListened)
	expect(deltas[1]).toBeGreaterThan(deltas[0])
	cast.connected = false
	await act(async () => {
		await vi.advanceTimersByTimeAsync(1000)
	})
	expect(play).not.toHaveBeenCalled()
	expect(usePlayer.getState().error).toContain('Cast disconnected')
})
