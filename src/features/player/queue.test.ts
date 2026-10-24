import { afterEach, expect, it, vi } from 'vitest'
import { enqueue, playQueue, usePlayer, useQueue } from '../../player'

afterEach(() => {
	vi.unstubAllGlobals()
	useQueue.setState({ entries: [] })
	usePlayer.setState({ session: null, error: '' })
})
it('keeps queue ordering and removes only selected entry', () => {
	enqueue([
		{ libraryItemId: 'a', title: 'A' },
		{ libraryItemId: 'b', episodeId: 'ep', title: 'B' },
		{ libraryItemId: 'c', title: 'C' },
	])
	useQueue.getState().move(2, -1)
	expect(useQueue.getState().entries.map((entry) => entry.itemId)).toEqual([
		'a',
		'c',
		'b',
	])
	useQueue.getState().remove(1)
	expect(useQueue.getState().entries.map((entry) => entry.itemId)).toEqual([
		'a',
		'b',
	])
})
it('starts first queue item using native playback request and queues remainder', async () => {
	const fetch = vi.fn().mockResolvedValue(
		new Response(
			JSON.stringify({
				id: 'session',
				libraryItemId: 'a',
				episodeId: null,
				currentTime: 0,
				duration: 60,
				audioTracks: [{ contentUrl: '/audio.mp3' }],
				libraryItem: null,
			}),
		),
	)
	vi.stubGlobal('fetch', fetch)
	await playQueue([
		{ libraryItemId: 'a' },
		{ libraryItemId: 'b', episodeId: 'ep' },
	])
	expect(fetch.mock.calls[0][0]).toBe('/api/items/a/play')
	expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
		mediaPlayer: 'html5',
		forceTranscode: false,
	})
	expect(useQueue.getState().entries.map((entry) => entry.itemId)).toEqual([
		'b',
	])
})
