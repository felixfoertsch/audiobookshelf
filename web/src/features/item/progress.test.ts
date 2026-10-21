import { beforeEach, expect, it, vi } from 'vitest'
import { useAuth } from '../../api'
import {
	applyProgressSocket,
	episodeProgress,
	refreshProgress,
} from './progress'

beforeEach(() => {
	useAuth.setState({
		user: {
			id: 'owner',
			username: 'Owner',
			accessToken: 'test',
			mediaProgress: [],
		},
	})
	vi.restoreAllMocks()
})
it('uses exact item and episode identity, never show-level progress', () => {
	const user = {
		mediaProgress: [
			{ libraryItemId: 'show', episodeId: 'a', isFinished: true },
			{ libraryItemId: 'other', episodeId: 'b', isFinished: true },
		],
	}
	expect(episodeProgress(user, 'show', 'a')?.isFinished).toBe(true)
	expect(episodeProgress(user, 'show', 'b')).toBeUndefined()
})
it('accepts own user and playback socket contracts, rejects another owner', () => {
	expect(
		applyProgressSocket(
			'user_updated',
			{
				id: 'other',
				mediaProgress: [
					{ libraryItemId: 'show', episodeId: 'a', isFinished: true },
				],
			},
			'owner',
		),
	).toBe(false)
	expect(
		applyProgressSocket(
			'user_updated',
			{ id: 'owner', mediaProgress: [] },
			'owner',
		),
	).toBe(true)
	expect(
		applyProgressSocket(
			'user_item_progress_updated',
			{ data: { libraryItemId: 'show', episodeId: 'a', isFinished: true } },
			'owner',
		),
	).toBe(true)
	expect(
		episodeProgress(useAuth.getState().user, 'show', 'a')?.isFinished,
	).toBe(true)
})
it('does not overwrite newer socket progress with stale HTTP', async () => {
	let resolve!: (response: Response) => void
	vi.stubGlobal(
		'fetch',
		vi.fn(
			() =>
				new Promise<Response>((done) => {
					resolve = done
				}),
		),
	)
	const request = refreshProgress()
	applyProgressSocket(
		'user_item_progress_updated',
		{ data: { libraryItemId: 'show', episodeId: 'a', isFinished: true } },
		'owner',
	)
	resolve(new Response(JSON.stringify({ mediaProgress: [] })))
	await request
	expect(
		episodeProgress(useAuth.getState().user, 'show', 'a')?.isFinished,
	).toBe(true)
})
it('rejects old-owner socket and HTTP after account changes', async () => {
	let resolve!: (response: Response) => void
	vi.stubGlobal(
		'fetch',
		vi.fn(
			() =>
				new Promise<Response>((done) => {
					resolve = done
				}),
		),
	)
	const request = refreshProgress()
	useAuth.setState({
		user: {
			id: 'next',
			username: 'Next',
			accessToken: 'next',
			mediaProgress: [],
		},
	})
	expect(
		applyProgressSocket(
			'user_item_progress_updated',
			{ data: { libraryItemId: 'show', episodeId: 'a', isFinished: true } },
			'owner',
		),
	).toBe(false)
	resolve(
		new Response(
			JSON.stringify({
				mediaProgress: [
					{ libraryItemId: 'show', episodeId: 'a', isFinished: true },
				],
			}),
		),
	)
	await request
	expect(useAuth.getState().user?.mediaProgress).toEqual([])
})
it('retains canonical progress when refresh fails', async () => {
	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValue(new Response('failed', { status: 500 })),
	)
	await expect(refreshProgress()).rejects.toThrow('failed')
	expect(useAuth.getState().user?.mediaProgress).toEqual([])
})

it('retains valid and nullable rows beside malformed GET and socket neighbors', async () => {
	const mediaProgress = [
		{
			libraryItemId: 'show',
			episodeId: 'a',
			isFinished: true,
			currentTime: null,
			duration: null,
		},
		{ libraryItemId: 'show', episodeId: 'b', currentTime: 'bad' },
	]
	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValue(new Response(JSON.stringify({ mediaProgress }))),
	)
	await refreshProgress()
	expect(
		episodeProgress(useAuth.getState().user, 'show', 'a')?.isFinished,
	).toBe(true)
	expect(useAuth.getState().user?.progressWarning).toContain(
		'1 invalid progress record',
	)
	expect(
		applyProgressSocket(
			'user_updated',
			{ id: 'owner', mediaProgress },
			'owner',
		),
	).toBe(true)
	expect(
		episodeProgress(useAuth.getState().user, 'show', 'a')?.currentTime,
	).toBeNull()
})

it('rejects malformed outer progress collection without replacing known state', async () => {
	useAuth.setState({
		user: {
			id: 'owner',
			username: 'Owner',
			accessToken: 'test',
			mediaProgress: [
				{ libraryItemId: 'show', episodeId: 'a', isFinished: true },
			],
		},
	})
	vi.stubGlobal(
		'fetch',
		vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify({ mediaProgress: {} }))),
	)
	await expect(refreshProgress()).rejects.toThrow('invalid response')
	expect(
		episodeProgress(useAuth.getState().user, 'show', 'a')?.isFinished,
	).toBe(true)
	expect(
		applyProgressSocket(
			'user_updated',
			{ id: 'owner', mediaProgress: {} },
			'owner',
		),
	).toBe(false)
})
it('reuses immutable progress lookup and refreshes on replacement without identity collisions', () => {
	const rows = [
		{ libraryItemId: 'a:b', episodeId: 'c', isFinished: true },
		{ libraryItemId: 'a', episodeId: 'b:c', isFinished: false },
	]
	const user = { mediaProgress: rows }
	expect(episodeProgress(user, 'a:b', 'c')).toBe(
		episodeProgress(user, 'a:b', 'c'),
	)
	expect(episodeProgress(user, 'a', 'b:c')?.isFinished).toBe(false)
	expect(
		episodeProgress(
			{ mediaProgress: [{ ...rows[0], isFinished: false }] },
			'a:b',
			'c',
		)?.isFinished,
	).toBe(false)
	expect(episodeProgress({ mediaProgress: [] }, 'a:b', 'c')).toBeUndefined()
})
