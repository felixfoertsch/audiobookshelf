import { afterEach, expect, it, vi } from 'vitest'
import {
	checkPodcastFeed,
	getItem,
	updateEpisode,
	updateMedia,
	updateProgress,
} from './service'

afterEach(() => vi.unstubAllGlobals())

it('fetches expanded item and validates richer response', async () => {
	const fetch = vi.fn().mockResolvedValue(
		new Response(
			JSON.stringify({
				id: 'i1',
				mediaType: 'podcast',
				media: { metadata: { title: 'Show' }, episodes: [] },
			}),
		),
	)
	vi.stubGlobal('fetch', fetch)
	const item = await getItem('a/b')
	expect(item.media.metadata.title).toBe('Show')
	expect(fetch.mock.calls[0][0]).toContain(
		'/api/items/a%2Fb?expanded=1&include=downloads,rssfeed,share,progress',
	)
})

it('sends media, progress, episode edits and validates feed check payloads', async () => {
	const fetch = vi
		.fn()
		.mockResolvedValueOnce(new Response('OK'))
		.mockResolvedValueOnce(
			new Response(JSON.stringify({ id: 'p1', isFinished: true })),
		)
		.mockResolvedValueOnce(new Response('OK'))
		.mockResolvedValueOnce(
			new Response(JSON.stringify({ episodes: [{ id: 'ep1' }] })),
		)
	vi.stubGlobal('fetch', fetch)
	await updateMedia('i', { metadata: { title: 'Edited' } })
	await updateProgress('i', { isFinished: true })
	await updateEpisode('i', 'ep1', { description: 'Changed' })
	expect((await checkPodcastFeed('i')).episodes[0]).toEqual({ id: 'ep1' })
	expect(
		fetch.mock.calls.map(([url, init]) => [url, init?.method, init?.body]),
	).toEqual([
		[
			'/api/items/i/media',
			'PATCH',
			JSON.stringify({ metadata: { title: 'Edited' } }),
		],
		['/api/me/progress/i', 'PATCH', JSON.stringify({ isFinished: true })],
		[
			'/api/podcasts/i/episode/ep1',
			'PATCH',
			JSON.stringify({ description: 'Changed' }),
		],
		['/api/podcasts/i/checknew', undefined, undefined],
	])
})
