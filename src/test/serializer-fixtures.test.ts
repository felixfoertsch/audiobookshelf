import { afterEach, expect, it, vi } from 'vitest'
import { episodeAnalysisSchema } from '../../contract/api'
import { api } from '../api'
import { itemSchema as catalogItemSchema } from '../catalog'
import { itemSchema } from '../features/item/schemas'
import { eventSchema } from '../features/podcast/AdAnalysisStatus'
import { sessionSchema, sessionSegments } from '../player'
import fixtures from './serializer-fixtures.json'

afterEach(() => vi.unstubAllGlobals())

it('parses upstream-native item/session without sidecar fields', () => {
	for (const item of [fixtures.podcast, fixtures.book]) {
		const nativeItem = structuredClone(item) as unknown as {
			media: { episodes?: Array<Record<string, unknown>> }
			adAnalysisEnabled?: unknown
		}
		for (const episode of nativeItem.media.episodes ?? []) {
			delete episode.adAnalysis
			delete episode.adAnalysisEnabled
		}
		delete nativeItem.adAnalysisEnabled
		expect(itemSchema.parse(nativeItem).id).toBe(item.id)
		expect(catalogItemSchema.parse(nativeItem).id).toBe(item.id)
	}
	const session = structuredClone(fixtures.session) as unknown as {
		currentTime: number
		libraryItem?: {
			media: { episodes?: Array<Record<string, unknown>> }
		} | null
	}
	for (const episode of session.libraryItem?.media.episodes ?? [])
		delete episode.adAnalysis
	expect(sessionSchema.parse(session).currentTime).toBe(5)
})

it('validates sidecar analysis contract separately from native serializer', () => {
	const analysis = {
		status: 'complete',
		version: 'v1',
		sourceSha256: 'a'.repeat(64),
		segments: [{ start: 2, end: 4 }],
		adAnalysisEnabled: true,
		applicable: true,
	}
	expect(episodeAnalysisSchema.parse(analysis).segments).toHaveLength(1)
	expect(
		episodeAnalysisSchema.safeParse({ ...analysis, sourceSha256: 'bad' })
			.success,
	).toBe(false)
	expect(
		episodeAnalysisSchema.safeParse({
			...analysis,
			segments: [{ start: 4, end: 2 }],
		}).success,
	).toBe(false)
})

it('ignores legacy custom analysis socket events and applies safe player segments only', () => {
	expect(eventSchema.safeParse(fixtures.socket).success).toBe(false)
	const session = sessionSchema.parse(fixtures.session)
	expect(sessionSegments(session)).toEqual([])
})

it('keeps native play API error recovery behavior', async () => {
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
