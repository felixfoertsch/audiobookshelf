import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	castSnapshot,
	disconnectCast,
	initializeCast,
	loadCast,
	requestCastSession,
	seekCast,
	setCastRate,
	useCast,
} from './cast'

const fixture = () => {
	const listeners = new Map<string, () => void>()
	class MediaInfo {
		metadata?: unknown
		itemId?: number
		duration?: number
		constructor(
			public contentId: string,
			public contentType: string,
		) {}
	}
	class Metadata {
		title = ''
		albumName = ''
		bookTitle = ''
		chapterNumber = 0
		chapterTitle = ''
		subtitle = ''
	}
	class QueueItem {
		constructor(public media: unknown) {}
	}
	class QueueData {
		queueType?: unknown
		constructor(
			public id: string,
			public name: string,
			public description: string,
			public repeat: boolean,
			public items: unknown[],
			public startIndex: number,
			public startTime: number,
		) {}
	}
	class LoadRequest {
		queueData?: unknown
		currentTime = 0
		autoplay = false
		playbackRate = 1
	}
	class RemotePlayer {
		currentTime = 0
		isPaused = true
		volumeLevel = 0.5
		isMediaLoaded = true
	}
	class RemotePlayerController {
		constructor(public player: RemotePlayer) {}
		addEventListener(name: string, listener: () => void) {
			listeners.set(name, listener)
		}
		removeEventListener(name: string) {
			listeners.delete(name)
		}
		seek() {}
		playOrPause() {
			this.player.isPaused = !this.player.isPaused
		}
		setVolumeLevel() {}
		stop() {}
	}
	const mediaSession = { media: undefined as unknown, playerState: 'PLAYING' }
	const nativeSession = {
		loadMedia: vi.fn(async (request: LoadRequest) => {
			const queue = request.queueData as QueueData
			const item = queue.items[queue.startIndex] as QueueItem
			mediaSession.media =
				item instanceof QueueItem
					? {
							...(item.media as object),
							contentId: (item.media as MediaInfo).contentId,
						}
					: undefined
		}),
		getMediaSession: () => mediaSession,
		getCastDevice: () => ({ friendlyName: 'Mock receiver' }),
		endCurrentSession: vi.fn(),
	}
	const context = {
		setOptions: vi.fn(),
		addEventListener: vi.fn((name: string, listener: () => void) =>
			listeners.set(name, listener),
		),
		removeEventListener: vi.fn(),
		getCurrentSession: () => nativeSession,
		requestSession: vi.fn<() => Promise<void>>(),
		endCurrentSession: vi.fn(),
	}
	const CastContext = { getInstance: () => context }
	Object.assign(window, {
		cast: {
			framework: {
				CastContext,
				CastContextEventType: { SESSION_STATE_CHANGED: 'session' },
				RemotePlayer,
				RemotePlayerController,
				RemotePlayerEventType: {
					IS_CONNECTED_CHANGED: 'connected',
					MEDIA_INFO_CHANGED: 'media',
				},
			},
		},
		chrome: {
			cast: {
				AutoJoinPolicy: { ORIGIN_SCOPED: 'origin' },
				media: {
					MediaInfo,
					MusicTrackMediaMetadata: Metadata,
					AudiobookChapterMediaMetadata: Metadata,
					QueueItem,
					QueueData,
					LoadRequest,
					QueueType: { AUDIOBOOK: 'book', PODCAST_SERIES: 'podcast' },
				},
			},
		},
		__ABS_WEB_CONFIG__: { apiBasePath: '/base' },
	})
	return { context, nativeSession, mediaSession, listeners }
}

describe('Cast SDK', () => {
	afterEach(async () => {
		await initializeCast(false)
		vi.restoreAllMocks()
		useCast.setState({
			available: false,
			connected: false,
			device: '',
			error: '',
		})
	})
	it('loads native sender once and removes it when disabled', async () => {
		const append = vi.spyOn(document.head, 'appendChild')
		const first = initializeCast(true)
		const second = initializeCast(true)
		expect(append).toHaveBeenCalledTimes(1)
		const callback = window.__onGCastApiAvailable
		expect(callback).toBeTypeOf('function')
		callback?.(false)
		await expect(first).rejects.toThrow('Cast SDK unavailable')
		await expect(second).rejects.toThrow('Cast SDK unavailable')
		await initializeCast(false)
		expect(
			document.querySelector(
				'script[src="https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1"]',
			),
		).toBeNull()
		expect(useCast.getState().available).toBe(false)
	})
	it('uses SDK constructors and preserves rate across track seek', async () => {
		const mock = fixture()
		await initializeCast(true)
		const data = {
			id: 's1',
			playMethod: 0,
			mediaType: 'book',
			displayTitle: 'Book',
			audioTracks: [
				{
					index: 0,
					title: 'One',
					mimeType: 'audio/mpeg',
					duration: 20,
					startOffset: 0,
				},
				{
					index: 1,
					title: 'Two',
					mimeType: 'audio/mpeg',
					duration: 30,
					startOffset: 20,
				},
				{
					index: 9,
					title: 'Three',
					mimeType: 'audio/mpeg',
					duration: 40,
					startOffset: 50,
				},
			],
		}
		await loadCast(data, {
			currentTime: 21,
			autoplay: false,
			playbackRate: 1.5,
		})
		expect(mock.context.setOptions).toHaveBeenCalledWith({
			receiverApplicationId: 'FD1F76C5',
			autoJoinPolicy: 'origin',
		})
		expect(mock.nativeSession.loadMedia).toHaveBeenCalledTimes(1)
		expect(castSnapshot()?.currentTime).toBe(20)
		expect(mock.nativeSession.loadMedia).toHaveBeenLastCalledWith(
			expect.objectContaining({
				queueData: expect.objectContaining({ startIndex: 1, startTime: 1 }),
			}),
		)
		await seekCast(62)
		expect(mock.nativeSession.loadMedia).toHaveBeenLastCalledWith(
			expect.objectContaining({
				currentTime: 12,
				queueData: expect.objectContaining({ startIndex: 2 }),
			}),
		)
		expect(castSnapshot()?.currentTime).toBe(50)
		await seekCast(1)
		expect(mock.nativeSession.loadMedia).toHaveBeenLastCalledWith(
			expect.objectContaining({ playbackRate: 1.5, autoplay: false }),
		)
		expect(
			JSON.stringify(mock.nativeSession.loadMedia.mock.calls),
		).not.toContain('token')
		disconnectCast()
		expect(useCast.getState().connected).toBe(false)
		mock.listeners.get('session')?.()
		expect(useCast.getState().connected).toBe(true)
		await loadCast(data, { currentTime: 1, autoplay: false, playbackRate: 1.5 })
		await setCastRate(1.75)
		expect(mock.nativeSession.loadMedia).toHaveBeenLastCalledWith(
			expect.objectContaining({ playbackRate: 1.75 }),
		)
	})
	it('rejects SDK load false and invalid tracks', async () => {
		const mock = fixture()
		await initializeCast(true)
		mock.context.requestSession.mockRejectedValueOnce(new Error('cancelled'))
		await expect(requestCastSession()).rejects.toThrow(
			'cancelled or unavailable',
		)
		const track = {
			index: 0,
			title: 'One',
			mimeType: 'audio/mpeg',
			duration: 20,
			startOffset: 0,
		}
		mock.nativeSession.loadMedia.mockResolvedValueOnce(false as never)
		await expect(
			loadCast(
				{ id: 's', playMethod: 0, mediaType: 'book', audioTracks: [track] },
				{ currentTime: 0, autoplay: true, playbackRate: 1 },
			),
		).rejects.toThrow('Cast media load failed')
		await expect(
			loadCast(
				{ id: 's', playMethod: 1, mediaType: 'book', audioTracks: [track] },
				{ currentTime: 0, autoplay: true, playbackRate: 1 },
			),
		).rejects.toThrow('direct-play')
		await expect(
			loadCast(
				{
					id: 's',
					playMethod: 0,
					mediaType: 'book',
					audioTracks: [{ ...track, index: NaN }],
				},
				{ currentTime: 0, autoplay: false, playbackRate: 1 },
			),
		).rejects.toThrow('Invalid Cast audio track')
		window.__ABS_WEB_CONFIG__ = {
			basePath: '/new',
			apiBasePath: '//external.invalid',
		}
		await expect(
			loadCast(
				{ id: 's', playMethod: 0, mediaType: 'book', audioTracks: [track] },
				{ currentTime: 0, autoplay: false, playbackRate: 1 },
			),
		).rejects.toThrow('Invalid Cast API path')
	})
})

it('serializes deferred receiver loads so latest requested target and rate win', async () => {
	const mock = fixture()
	await initializeCast(true)
	const data = {
		id: 'serial',
		playMethod: 0,
		mediaType: 'book',
		audioTracks: [
			{
				index: 0,
				title: 'One',
				mimeType: 'audio/mpeg',
				duration: 60,
				startOffset: 0,
			},
		],
	}
	let finish!: () => void
	const requests: Array<{ currentTime: number; playbackRate: number }> = []
	mock.nativeSession.loadMedia.mockImplementation(async (request) => {
		requests.push(request)
		await new Promise<void>((resolve) => {
			finish = resolve
		})
	})
	const first = loadCast(data, {
		currentTime: 1,
		autoplay: true,
		playbackRate: 1,
	}).catch(() => {})
	await vi.waitFor(() => expect(requests).toHaveLength(1))
	const latest = loadCast(data, {
		currentTime: 25,
		autoplay: true,
		playbackRate: 1.5,
	})
	await Promise.resolve()
	expect(requests).toHaveLength(1)
	finish()
	await first
	await vi.waitFor(() => expect(requests).toHaveLength(2))
	expect(requests[1]).toMatchObject({ currentTime: 25, playbackRate: 1.5 })
	finish()
	await latest
	await initializeCast(false)
})

it('settles initialization when disabled before SDK callback', async () => {
	await initializeCast(false)
	Reflect.deleteProperty(window, 'cast')
	Reflect.deleteProperty(window, 'chrome')
	const waiting = initializeCast(true)
	await initializeCast(false)
	await expect(waiting).resolves.toBeUndefined()
	expect(useCast.getState().available).toBe(false)
})
