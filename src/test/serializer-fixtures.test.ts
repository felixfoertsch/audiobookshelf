import { afterEach, expect, it, vi } from 'vitest'
import { api } from '../api'
import { itemSchema as catalogItemSchema } from '../catalog'
import { itemSchema } from '../features/item/schemas'
import { eventSchema } from '../features/podcast/AdAnalysisStatus'
import { sessionSchema } from '../player'
import fixtures from './serializer-fixtures.json'

afterEach(() => vi.unstubAllGlobals())

it('parses backend-generated expanded items, session and socket event', () => {
	for (const item of [fixtures.podcast, fixtures.book]) {
		expect(itemSchema.parse(item).id).toBe(item.id)
		expect(catalogItemSchema.parse(item).id).toBe(item.id)
	}
	expect(sessionSchema.parse(fixtures.session).currentTime).toBe(5)
	expect(eventSchema.parse(fixtures.socket).adAnalysis?.status).toBe(
		'cancelled',
	)
	expect(
		fixtures.podcast.media.episodes.map(
			(episode) => episode.adAnalysis?.status ?? null,
		),
	).toEqual([null, 'candidates', 'stale', 'queued', 'running'])
})

it.each([null, undefined, ''])(
	'accepts nullable, absent and empty metadata (%j)',
	(value) => {
		const item = structuredClone(fixtures.podcast)
		expect(
			itemSchema.parse({
				...item,
				media: {
					...item.media,
					coverPath: value,
					metadata: { ...item.media.metadata, title: value },
					episodes: [],
				},
			}).media.episodes,
		).toEqual([])
		expect(
			eventSchema.parse({
				...fixtures.socket,
				adAnalysis: value === '' ? null : value,
			}).adAnalysis,
		).toBe(value === '' ? null : value)
	},
)

it('rejects malformed item, session and socket payloads', () => {
	expect(
		itemSchema.safeParse({ ...fixtures.podcast, mediaType: 'video' }).success,
	).toBe(false)
	expect(
		sessionSchema.safeParse({ ...fixtures.session, audioTracks: [] }).success,
	).toBe(false)
	expect(
		sessionSchema.safeParse({ ...fixtures.session, currentTime: -1 }).success,
	).toBe(false)
	for (const adAnalysis of [
		{ status: 'invented' },
		{ status: 'candidates', segments: [{ start: -1, end: 2 }] },
		'',
	])
		expect(
			eventSchema.safeParse({ ...fixtures.socket, adAnalysis }).success,
		).toBe(false)
})

it('surfaces API HTTP and malformed success failures, then accepts recovered serializer response', async () => {
	const fetch = vi
		.fn()
		.mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
		.mockResolvedValueOnce(
			Response.json({ ...fixtures.session, audioTracks: [] }),
		)
		.mockResolvedValueOnce(Response.json(fixtures.session))
	vi.stubGlobal('fetch', fetch)
	await expect(
		api('/api/items/podcast-item/play', sessionSchema),
	).rejects.toThrow()
	await expect(
		api('/api/items/podcast-item/play', sessionSchema),
	).rejects.toThrow()
	await expect(
		api('/api/items/podcast-item/play', sessionSchema),
	).resolves.toMatchObject({ id: fixtures.session.id })
	expect(fetch).toHaveBeenCalledTimes(3)
})
