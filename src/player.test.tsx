import { describe, expect, it, vi } from 'vitest'
import { skipTarget } from './features/player/skipping'
import { authorizeHlsRequest, sessionSchema, sessionSegments } from './player'

const payload = (
	status: string,
	segments?: { start: number; end: number }[],
) => ({
	id: 's',
	episodeId: 'ep',
	currentTime: 0,
	duration: 60,
	audioTracks: [{ contentUrl: '/audio.mp3' }],
	libraryItem: {
		media: {
			episodes: [
				{ id: 'ep', adAnalysis: { status, segments, sourceSha256: 'fresh' } },
			],
		},
	},
})
describe('HLS authorization boundary', () => {
	it('authorizes same-origin requests and aborts external fragments/keys before headers or send', () => {
		localStorage.setItem('token', 'test-token')
		try {
			const local = new XMLHttpRequest()
			const headers = vi
				.spyOn(local, 'setRequestHeader')
				.mockImplementation(() => {})
			authorizeHlsRequest(local, '/hls/local/fragment.ts')
			expect(headers).toHaveBeenCalledWith('authorization', 'Bearer test-token')
			for (const path of [
				'https://external.invalid/fragment.ts',
				'https://external.invalid/key',
			]) {
				const xhr = new XMLHttpRequest()
				const abort = vi.spyOn(xhr, 'abort')
				const header = vi.spyOn(xhr, 'setRequestHeader')
				const send = vi.spyOn(xhr, 'send')
				expect(() => authorizeHlsRequest(xhr, path)).toThrow(
					'Unsafe audio stream URL',
				)
				expect(abort).toHaveBeenCalled()
				expect(header).not.toHaveBeenCalled()
				expect(send).not.toHaveBeenCalled()
			}
		} finally {
			localStorage.removeItem('token')
		}
	})
})
describe('fresh session candidate applicability', () => {
	it('does not use sidecar candidates when native source identity is unproven', () => {
		const session = sessionSchema.parse(
			payload('candidates', [{ start: 10, end: 20 }]),
		)
		expect(sessionSegments(session)).toEqual([])
	})
	it('ignores stale page candidates when fresh session stale or empty', () => {
		const stalePageCandidates = [{ start: 10, end: 20 }]
		expect(stalePageCandidates.length).toBe(1)
		for (const fresh of [
			payload('stale', stalePageCandidates),
			payload('candidates', []),
			payload('none'),
		])
			expect(sessionSegments(sessionSchema.parse(fresh))).toEqual([])
		const mismatch = sessionSchema.parse(
			payload('candidates', stalePageCandidates),
		)
		mismatch.episodeId = 'other'
		expect(sessionSegments(mismatch)).toEqual([])
	})
	it('stale and inconclusive session evidence never skips a crossed marker', () => {
		for (const status of [
			'stale',
			'inconclusive',
			'none',
			'queued',
			'running',
		]) {
			const session = sessionSchema.parse(
				payload(status, [{ start: 10, end: 20 }]),
			)
			expect(skipTarget(sessionSegments(session), 9, 11, 60, true)).toBeNull()
		}
	})
	it('intersects terminal candidates with playback duration without changing evidence', () => {
		for (const excess of [1152 / 44100, 1728 / 44100]) {
			const session = sessionSchema.parse(
				payload('candidates', [
					{ start: 10, end: 20 },
					{ start: 50, end: 60 + excess },
					{ start: 60, end: 70 },
					{ start: 61, end: 70 },
				]),
			)
			const evidence = structuredClone(session)
			expect(sessionSegments(session)).toEqual([])
			expect(session).toEqual(evidence)
		}
	})
	it('rejects malformed sessions and invalid segments', () => {
		for (const data of [null, {}])
			expect(sessionSchema.safeParse(data).success).toBe(false)
		for (const segments of [
			[{ start: 20, end: 10 }],
			[{ start: 10, end: Infinity }],
			[{ start: Number.NaN, end: 20 }],
		])
			expect(
				sessionSegments(
					sessionSchema.parse(payload('candidates', segments)),
					segments,
				),
			).toEqual([])
	})
})

it('clears private queue and session when account identity changes, not token refresh', async () => {
	const { useAuth } = await import('./api')
	const { useQueue, usePlayer } = await import('./player')
	useAuth.setState({ user: { id: 'A', username: 'A', accessToken: 'first' } })
	useQueue.getState().add({ itemId: 'private', title: 'Private title' })
	useAuth.setState({
		user: { id: 'A', username: 'A', accessToken: 'refreshed' },
	})
	expect(useQueue.getState().entries).toHaveLength(1)
	useAuth.setState({ user: null })
	expect(useQueue.getState().entries).toEqual([])
	expect(usePlayer.getState().session).toBeNull()
	useAuth.setState({ user: { id: 'B', username: 'B', accessToken: 'second' } })
	expect(useQueue.getState().entries).toEqual([])
})

it('removes captured queue entry after deferred playback without losing reordered entry', async () => {
	const { playNext, useQueue } = await import('./player')
	const response = { ...payload('none'), libraryItemId: 'first' }
	let resolve!: (value: Response) => void
	const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(
		() =>
			new Promise<Response>((done) => {
				resolve = done
			}),
	)
	useQueue.setState({ entries: [] })
	useQueue.getState().add({ itemId: 'first', title: 'First' })
	useQueue.getState().add({ itemId: 'second', title: 'Second' })
	const starting = playNext()
	await vi.waitFor(() => expect(fetcher).toHaveBeenCalled())
	useQueue.getState().move(0, 1)
	resolve(Response.json(response))
	await starting
	expect(useQueue.getState().entries.map((entry) => entry.itemId)).toEqual([
		'second',
	])
	fetcher.mockRestore()
})
