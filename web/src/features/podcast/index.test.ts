import { afterEach, expect, it, vi } from 'vitest'
import { useAuth } from '../../api'
import german from './fixtures/lage-der-nation-search.json'
import lateralFeed from './fixtures/lateral-feed.json'
import lateral from './fixtures/lateral-search.json'
import uncharted from './fixtures/uncharted-search.json'
import {
	canManagePodcasts,
	clearPodcastDownloadQueue,
	createPodcast,
	downloadPodcastEpisodes,
	feedSchema,
	makePodcastPayload,
	searchSchema,
	updatePodcastMedia,
} from './index'

// Public iTunes results and Lateral RSS metadata captured through native ABS API;
// allowlisted publisher fields only, no credentials, account data or episodes.
it('parses public live iTunes results, including missing artist IDs', () => {
	for (const results of [lateral, uncharted, german]) {
		expect(results.some((result) => result.artistId === null)).toBe(true)
		expect(searchSchema.parse(results)).toHaveLength(results.length)
	}
})
it('parses live feed preview metadata', () => {
	expect(feedSchema.parse(lateralFeed).podcast.metadata.title).toBe(
		'Lateral with Tom Scott',
	)
})
it('accepts serializer null artwork and omitted feed URLs without weakening field types', () => {
	const { feedUrl: _, ...withoutFeed } = lateral[0]
	expect(
		searchSchema.parse([{ ...withoutFeed, cover: null }])[0].feedUrl,
	).toBeUndefined()
})
it('rejects malformed required search fields and non-string feed URLs', () => {
	for (const change of [{ title: null }, { feedUrl: 123 }, { id: null }])
		expect(searchSchema.safeParse([{ ...lateral[0], ...change }]).success).toBe(
			false,
		)
})

afterEach(() => {
	vi.restoreAllMocks()
	localStorage.clear()
	useAuth.getState().set(null)
})
const response = (body: unknown) =>
	new Response(JSON.stringify(body), { status: 200 })
const podcast = {
	id: 'p1',
	title: 'Show',
	feedUrl: 'https://example.test/feed',
}
const feed = { metadata: { title: 'Show', feedUrl: podcast.feedUrl } }

it('grants management only to root and admin users', () => {
	expect(canManagePodcasts({ type: 'root' })).toBe(true)
	expect(canManagePodcasts({ type: 'admin' })).toBe(true)
	expect(canManagePodcasts({ type: 'user' })).toBe(false)
	expect(canManagePodcasts(null)).toBe(false)
})
it('builds and sends native create payload with selected folder and media metadata', async () => {
	const payload = makePodcastPayload({
		libraryId: 'lib',
		folderId: 'folder',
		folderPath: '/podcasts',
		podcast,
		feed,
	})
	expect(payload).toMatchObject({
		path: '/podcasts/Show',
		folderId: 'folder',
		libraryId: 'lib',
		media: { metadata: { title: 'Show', feedUrl: podcast.feedUrl } },
	})
	const fetch = vi
		.spyOn(globalThis, 'fetch')
		.mockResolvedValue(response({ id: 'item' }))
	await createPodcast(payload)
	expect(fetch).toHaveBeenCalledWith(
		'/api/podcasts',
		expect.objectContaining({ method: 'POST', body: JSON.stringify(payload) }),
	)
})
it('rejects missing subscription details before request', () => {
	expect(() =>
		makePodcastPayload({
			libraryId: 'l',
			folderId: 'f',
			folderPath: '/p',
			podcast: { ...podcast, title: '' },
			feed: { metadata: {} },
		}),
	).toThrow('Podcast title and RSS feed URL required')
})
it('patches all supported settings and posts selected feed episode payload', async () => {
	const fetch = vi
		.spyOn(globalThis, 'fetch')
		.mockResolvedValue(response({ updated: true }))
	const settings = {
		autoDownloadEpisodes: true,
		autoDownloadSchedule: '0 6 * * *',
		lastEpisodeCheck: 123,
		maxEpisodesToKeep: 10,
		maxNewEpisodesToDownload: 4,
	}
	await updatePodcastMedia('item/1', settings)
	expect(fetch.mock.calls[0]?.[0]).toBe('/api/items/item%2F1/media')
	expect(fetch.mock.calls[0]?.[1]).toMatchObject({
		method: 'PATCH',
		body: JSON.stringify(settings),
	})
	vi.mocked(fetch).mockResolvedValue(response({}))
	const episodes = [
		{ title: 'Episode', enclosure: { url: 'https://example.test/audio.mp3' } },
	]
	await downloadPodcastEpisodes('item/1', episodes)
	expect(fetch.mock.calls[1]?.[0]).toBe(
		'/api/podcasts/item%2F1/download-episodes',
	)
	expect(fetch.mock.calls[1]?.[1]).toMatchObject({
		method: 'POST',
		body: JSON.stringify(episodes),
	})
})
it('clears queue through server route and surfaces API failure', async () => {
	const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({}))
	await clearPodcastDownloadQueue('item/1')
	expect(fetch.mock.calls[0]?.[0]).toBe('/api/podcasts/item%2F1/clear-queue')
	vi.mocked(fetch).mockResolvedValue(new Response('denied', { status: 403 }))
	await expect(clearPodcastDownloadQueue('item')).rejects.toThrow(
		'Permission denied',
	)
})
