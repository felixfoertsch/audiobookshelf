// Sidecar contract fixture for proxy E2E; isolated from the stock ABS mock.
import { items } from './data'

const state = { unavailable: false, unauthorized: false }
const hash = 'a'.repeat(64)
const result = (
	status: 'disabled' | 'complete',
	segments: { start: number; end: number }[] = [],
) => ({
	status,
	version: status === 'complete' ? 'fixture-v1' : null,
	sourceSha256: status === 'complete' ? hash : null,
	segments,
	adAnalysisEnabled: status === 'complete',
})
const server = Bun.serve({
	port: Number(process.env.PSB_MOCK_PORT || 4181),
	hostname: process.env.PSB_MOCK_HOST || '127.0.0.1',
	async fetch(request) {
		const url = new URL(request.url)
		if (url.pathname === '/__mock/state' && request.method === 'POST') {
			const body = await request.json().catch(() => ({}))
			if (typeof body.unavailable === 'boolean')
				state.unavailable = body.unavailable
			if (typeof body.unauthorized === 'boolean')
				state.unauthorized = body.unauthorized
			return Response.json({ ...state })
		}
		if (url.pathname === '/__mock/state') return Response.json({ ...state })
		if (state.unavailable) return new Response('Unavailable', { status: 503 })
		const token = request.headers
			.get('authorization')
			?.match(/^Bearer ([^\s]+)$/)?.[1]
		const user = [
			'fixture-access',
			'fixture-admin-access',
			'fixture-root-access',
			'fixture-guest-access',
		].includes(token || '')
		if (state.unauthorized || !user)
			return Response.json({ error: 'unauthorized' }, { status: 401 })

		const path = url.pathname
		if (path === '/api/debug/auth') {
			return ['fixture-admin-access', 'fixture-root-access'].includes(
				token || '',
			)
				? Response.json({ ok: true })
				: Response.json({ error: 'forbidden' }, { status: 403 })
		}
		const jobStatus = /^\/api\/items\/([^/]+)\/analysis\/status$/.exec(path)
		if (jobStatus && request.method === 'GET') {
			if (
				!items.some((item) => item.id === jobStatus[1]) &&
				jobStatus[1] !== 'allowed-item'
			)
				return Response.json({ error: 'forbidden' }, { status: 403 })
			return Response.json({ jobs: [] })
		}
		const analysis = /^\/api\/items\/([^/]+)\/analysis$/.exec(path)
		if (analysis && request.method === 'GET') {
			const [, itemId] = analysis
			const item = items.find((entry) => entry.id === itemId)
			if (itemId === 'other-item' || (!item && itemId !== 'allowed-item'))
				return Response.json({ error: 'forbidden' }, { status: 403 })
			const episodes =
				itemId === 'allowed-item'
					? { 'ep-1': result('complete', [{ start: 5, end: 10 }]) }
					: Object.fromEntries(
							item && 'episodes' in item.media
								? (item.media.episodes || []).map((episode) => [
										episode.id,
										result('disabled'),
									])
								: [],
						)
			return Response.json({ episodes })
		}
		const enqueue =
			/^\/api\/podcasts\/([^/]+)\/episode\/([^/]+)\/ad-analysis$/.exec(path)
		if (enqueue && request.method === 'POST') {
			if (
				!['fixture-admin-access', 'fixture-root-access'].includes(token || '')
			)
				return Response.json({ error: 'forbidden' }, { status: 403 })
			const body = await request.json().catch(() => null)
			if (!body || typeof body !== 'object' || Object.keys(body).length)
				return Response.json({ error: 'invalid_body' }, { status: 400 })
			if (enqueue[1] === 'other-item')
				return Response.json({ error: 'forbidden' }, { status: 403 })
			return Response.json({ queued: true }, { status: 202 })
		}
		const consent = /^\/api\/podcasts\/([^/]+)\/ad-analysis$/.exec(path)
		if (consent) {
			const item = items.find((entry) => entry.id === consent[1])
			if (item?.mediaType !== 'podcast')
				return Response.json({ error: 'not_found' }, { status: 404 })
			if (request.method === 'GET') return Response.json({ enabled: false })
			if (request.method === 'POST') {
				if (
					!['fixture-admin-access', 'fixture-root-access'].includes(token || '')
				)
					return Response.json({ error: 'forbidden' }, { status: 403 })
				const body = await request.json().catch(() => null)
				if (typeof body?.enabled !== 'boolean')
					return Response.json({ error: 'invalid_body' }, { status: 400 })
				return Response.json(body)
			}
		}
		const summary = /^\/api\/podcasts\/([^/]+)\/episode-summary$/.exec(path)
		if (summary) {
			const item = items.find((entry) => entry.id === summary[1])
			if (item?.mediaType !== 'podcast')
				return Response.json({ error: 'not_found' }, { status: 404 })
			const total =
				'episodes' in item.media ? item.media.episodes?.length || 0 : 0
			return Response.json({ total, unplayed: total, source: 'downloaded' })
		}
		const recent = /^\/api\/libraries\/([^/]+)\/recent-episodes$/.exec(path)
		if (recent) {
			const episodes = items
				.filter(
					(item) =>
						item.mediaType === 'podcast' &&
						item.libraryId === recent[1] &&
						'episodes' in item.media,
				)
				.flatMap((item) =>
					'episodes' in item.media
						? (item.media.episodes || []).map((episode) => {
								const enclosureURL =
									episode.enclosure &&
									typeof episode.enclosure === 'object' &&
									'url' in episode.enclosure
										? String(episode.enclosure.url)
										: `https://example.test/${encodeURIComponent(episode.id)}.mp3`
								return {
									...episode,
									id: episode.id,
									podcastId: item.id,
									libraryItemId: item.id,
									enclosureURL,
									guid: episode.guid || null,
									publishedAt: Date.parse(episode.pubDate || '') || null,
									downloaded: true,
									podcast: item.media,
								}
							})
						: [],
				)
			const limit = Math.min(100, Number(url.searchParams.get('limit') || 50))
			const page = Math.max(0, Number(url.searchParams.get('page') || 0))
			return Response.json({
				episodes: episodes.slice(page * limit, page * limit + limit),
				limit,
				page,
				feedUnavailable: false,
				feedTruncated: false,
			})
		}
		return Response.json({ error: 'not_found' }, { status: 404 })
	},
})
console.log(`sidecar mock listening ${server.hostname}:${server.port}`)
process.on('SIGTERM', () => server.stop(true))
