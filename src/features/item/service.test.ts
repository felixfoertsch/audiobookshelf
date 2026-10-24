import { afterEach, expect, it, vi } from 'vitest'
import {
	checkPodcastFeed,
	getItem,
	resetProgress,
	updateEpisode,
	updateMedia,
	updateProgress,
} from './service'

afterEach(() => vi.unstubAllGlobals())

it('deletes only the owned progress ID and canonically refreshes', async () => {
	const fetch = vi
		.fn()
		.mockResolvedValueOnce(new Response('OK'))
		.mockResolvedValueOnce(new Response(JSON.stringify({ mediaProgress: [] })))
	vi.stubGlobal('fetch', fetch)
	await resetProgress('progress/a', 'book')
	expect(fetch.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
		['/api/me/progress/progress%2Fa', 'DELETE'],
		['/api/me/progress', undefined],
	])
})

it('reset failure never refreshes or invalidates progress', async () => {
	const fetch = vi
		.fn()
		.mockResolvedValue(new Response('Denied', { status: 403 }))
	vi.stubGlobal('fetch', fetch)
	await expect(resetProgress('other-user-progress', 'book')).rejects.toThrow()
	expect(fetch).toHaveBeenCalledTimes(1)
})

it('reset refresh failure reports successful deletion separately', async () => {
	vi.stubGlobal(
		'fetch',
		vi
			.fn()
			.mockResolvedValueOnce(new Response('OK'))
			.mockResolvedValueOnce(new Response('Unavailable', { status: 500 })),
	)
	expect((await resetProgress('progress', 'book')).refreshWarning).toContain(
		'Progress reset',
	)
})

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
		.mockResolvedValueOnce(new Response(JSON.stringify({ mediaProgress: [] })))
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
		['/api/me/progress', undefined, undefined],
		[
			'/api/podcasts/i/episode/ep1',
			'PATCH',
			JSON.stringify({ description: 'Changed' }),
		],
		['/api/podcasts/i/checknew', undefined, undefined],
	])
})

it('reports successful write separately from failed refresh and still invalidates', async () => {
	const receive = vi.fn()
	window.addEventListener('abs:progress-changed', receive)
	vi.stubGlobal(
		'fetch',
		vi
			.fn()
			.mockResolvedValueOnce(new Response('OK'))
			.mockResolvedValueOnce(
				new Response('refresh unavailable', { status: 500 }),
			),
	)
	const result = await updateProgress('show', { isFinished: true }, 'ep')
	expect(result.refreshWarning).toContain('saved')
	expect(receive).toHaveBeenCalledTimes(1)
	window.removeEventListener('abs:progress-changed', receive)
})
