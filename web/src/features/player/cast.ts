import { create } from 'zustand'

type CastState = {
	available: boolean
	connected: boolean
	device: string
	error: string
}
type Dict = Record<string, unknown>
type Session = Dict & {
	id: string
	playMethod?: number
	mediaType?: string
	media?: Dict
	audioTracks?: unknown[]
}
type Track = Dict & {
	index: number
	title: string
	mimeType: string
	duration: number
	startOffset: number
}
type Remote = Dict & {
	currentTime?: number
	isPaused?: boolean
	volumeLevel?: number
	isMediaLoaded?: boolean
}
type Controller = Dict

declare global {
	interface Window {
		__onGCastApiAvailable?: (available: boolean) => void
		cast?: Dict
		chrome?: Dict
	}
}

export const useCast = create<CastState>(() => ({
	available: false,
	connected: false,
	device: '',
	error: '',
}))
let context: Dict | undefined
let remote: Remote | undefined
let controller: Controller | undefined
let session: Dict | undefined
let activeId: string | undefined
let lifecycleGeneration = 0
let loadGeneration = 0
let script: HTMLScriptElement | undefined
let pending: Promise<void> | undefined
let cancelInitialization: (() => void) | undefined
let lifecycle: (() => void) | undefined
let loadRate = 1

const obj = (value: unknown): Dict | undefined =>
	typeof value === 'object' && value !== null ? (value as Dict) : undefined
const construct = (
	target: Dict | undefined,
	key: string,
	...args: unknown[]
): unknown => {
	const fn = target?.[key]
	if (typeof fn !== 'function') throw new Error(`Cast SDK missing ${key}`)
	return Reflect.construct(fn, args)
}
const call = (
	target: Dict | undefined,
	key: string,
	...args: unknown[]
): unknown => {
	const fn = target?.[key]
	if (typeof fn !== 'function') throw new Error(`Cast SDK missing ${key}`)
	return (fn as (...values: unknown[]) => unknown).apply(target, args)
}
const api = () => obj(window.cast)?.framework
const getSession = () =>
	context ? obj(call(context, 'getCurrentSession')) : undefined
const update = () => {
	const current = getSession()
	const connected = Boolean(current)
	const name = current
		? obj(call(current, 'getCastDevice'))?.friendlyName
		: undefined
	useCast.setState({ connected, device: typeof name === 'string' ? name : '' })
}
const clearMedia = () => {
	loadGeneration++
	session = undefined
	activeId = undefined
}
const clear = () => {
	lifecycleGeneration++
	clearMedia()
	lifecycle?.()
	lifecycle = undefined
	remote = undefined
	controller = undefined
	useCast.setState({ connected: false, device: '' })
}

export function initializeCast(enabled: boolean): Promise<void> {
	if (!enabled) {
		lifecycleGeneration++
		cancelInitialization?.()
		cancelInitialization = undefined
		if (script) {
			script.onerror = null
			script.remove()
		}
		script = undefined
		if (window.__onGCastApiAvailable) delete window.__onGCastApiAvailable
		const current = context
		context = undefined
		pending = undefined
		clear()
		if (current && typeof current.endCurrentSession === 'function')
			void call(current, 'endCurrentSession', true)
		useCast.setState({ available: false, error: '' })
		return Promise.resolve()
	}
	if (context) return Promise.resolve()
	if (pending) return pending
	if (api()) {
		try {
			setup()
			return Promise.resolve()
		} catch {
			context = undefined
			useCast.setState({ error: 'Cast SDK initialization failed' })
			return Promise.reject(new Error('Cast SDK initialization failed'))
		}
	}
	const generation = lifecycleGeneration
	pending = new Promise((resolve, reject) => {
		let settled = false
		cancelInitialization = () => {
			if (!settled) {
				settled = true
				resolve()
			}
		}
		window.__onGCastApiAvailable = (available) => {
			if (generation !== lifecycleGeneration) return
			if (!available) {
				pending = undefined
				useCast.setState({ error: 'Cast SDK unavailable' })
				if (!settled) {
					settled = true
					reject(new Error('Cast SDK unavailable'))
				}
				return
			}
			try {
				setup()
			} catch {
				context = undefined
				useCast.setState({ error: 'Cast SDK initialization failed' })
				if (!settled) {
					settled = true
					reject(new Error('Cast SDK initialization failed'))
				}
				return
			}
			if (!settled) {
				settled = true
				resolve()
			}
		}
		script = document.createElement('script')
		script.src =
			'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1'
		script.onerror = () => {
			if (generation !== lifecycleGeneration) return
			pending = undefined
			useCast.setState({ error: 'Cast SDK failed to load' })
			if (!settled) {
				settled = true
				reject(new Error('Cast SDK failed to load'))
			}
		}
		document.head.appendChild(script)
	})
	return pending
}
function setup() {
	const framework = obj(api())
	if (!framework) throw new Error('Cast framework unavailable')
	context = obj(call(framework.CastContext as Dict, 'getInstance'))
	if (!context) throw new Error('Cast context unavailable')
	loadGeneration++
	const chromeCast = obj(window.chrome?.cast)
	call(context, 'setOptions', {
		receiverApplicationId: 'FD1F76C5',
		autoJoinPolicy: chromeCast?.AutoJoinPolicy
			? (chromeCast.AutoJoinPolicy as Dict).ORIGIN_SCOPED
			: 'ORIGIN_SCOPED',
	})
	const events = obj(framework.CastContextEventType)
	const generation = lifecycleGeneration
	const contextEvent = events?.SESSION_STATE_CHANGED
	remote = obj(construct(framework, 'RemotePlayer')) as Remote | undefined
	controller = obj(construct(framework, 'RemotePlayerController', remote))
	const playerEvents = obj(framework.RemotePlayerEventType)
	const listeners: Array<[Dict, unknown, () => void]> = []
	const guardedUpdate = () => {
		if (generation === lifecycleGeneration) update()
	}
	for (const event of [
		contextEvent,
		playerEvents?.IS_CONNECTED_CHANGED,
		playerEvents?.MEDIA_INFO_CHANGED,
	]) {
		const target = event === contextEvent ? context : controller
		if (!target || event === undefined) continue
		call(target, 'addEventListener', event, guardedUpdate)
		listeners.push([target, event, guardedUpdate])
	}
	lifecycle = () => {
		for (const [target, event, listener] of listeners)
			call(target, 'removeEventListener', event, listener)
	}
	useCast.setState({ available: true, error: '' })
	update()
}
export async function requestCastSession(): Promise<void> {
	try {
		await call(context, 'requestSession')
	} catch {
		useCast.setState({
			error: 'Cast device selection cancelled or unavailable',
		})
		throw new Error('Cast device selection cancelled or unavailable')
	}
}
function tracksFor(input: unknown): Track[] {
	const value = obj(input)
	const tracks = value?.audioTracks
	if (
		value?.playMethod !== 0 ||
		!['book', 'podcast'].includes(String(value.mediaType)) ||
		!Array.isArray(tracks) ||
		tracks.length === 0
	)
		throw new Error('Cast supports direct-play audio only')
	const validated = tracks.map((raw) => {
		const track = obj(raw)
		if (
			!track ||
			!Number.isSafeInteger(track.index) ||
			(track.index as number) < 0 ||
			typeof track.title !== 'string' ||
			typeof track.mimeType !== 'string' ||
			!track.mimeType.startsWith('audio/') ||
			typeof track.duration !== 'number' ||
			!Number.isFinite(track.duration) ||
			track.duration <= 0 ||
			typeof track.startOffset !== 'number' ||
			!Number.isFinite(track.startOffset) ||
			track.startOffset < 0
		)
			throw new Error('Invalid Cast audio track')
		return track as Track
	})
	const ordered = [...validated].sort((a, b) => a.startOffset - b.startOffset)
	if (
		new Set(validated.map((t) => t.index)).size !== validated.length ||
		ordered.some(
			(track, i) =>
				i > 0 &&
				track.startOffset <
					ordered[i - 1].startOffset + ordered[i - 1].duration,
		)
	)
		throw new Error('Invalid Cast track order')
	return ordered
}
function position(tracks: Track[], time: number) {
	if (!Number.isFinite(time) || time < 0)
		throw new Error('Invalid Cast position')
	const total =
		tracks[tracks.length - 1].startOffset + tracks[tracks.length - 1].duration
	const target = Math.min(time, total)
	const index = tracks.findIndex(
		(track) =>
			target >= track.startOffset &&
			target < track.startOffset + track.duration,
	)
	const i = target === total ? tracks.length - 1 : index
	if (i < 0) throw new Error('Cast position falls between tracks')
	return {
		index: i,
		offset: Math.floor(
			Math.min(target - tracks[i].startOffset, tracks[i].duration),
		),
	}
}
function build(
	sessionData: Session,
	tracks: Track[],
	time: number,
	autoplay: boolean,
	rate: number,
) {
	if (
		!Number.isFinite(rate) ||
		rate <= 0 ||
		typeof sessionData.id !== 'string' ||
		!sessionData.id ||
		!['http:', 'https:'].includes(window.location.protocol)
	)
		throw new Error('Invalid Cast request')
	const framework = obj(api())
	const media = obj(obj(window.chrome?.cast)?.media)
	if (!framework || !media) throw new Error('Cast media SDK unavailable')
	const prefix = window.__ABS_WEB_CONFIG__?.apiBasePath ?? ''
	if (
		prefix &&
		(!prefix.startsWith('/') ||
			prefix.includes('\\') ||
			prefix.split('/').includes('..') ||
			prefix.startsWith('//') ||
			/[?#]/.test(prefix) ||
			new URL(prefix, window.location.origin).origin !== window.location.origin)
	)
		throw new Error('Invalid Cast API path')
	const metadataSource =
		obj(sessionData.mediaMetadata) ?? obj(obj(sessionData.media)?.metadata)
	const info = tracks.map((track) => {
		const url = new URL(
			`${prefix}/public/session/${encodeURIComponent(sessionData.id)}/track/${track.index}`,
			window.location.origin,
		)
		if (url.origin !== window.location.origin || url.username || url.password)
			throw new Error('Invalid Cast track URL')
		const mediaInfo = obj(
			construct(media as Dict, 'MediaInfo', url.href, track.mimeType),
		)
		if (mediaInfo) mediaInfo.contentId = url.href
		if (!mediaInfo) throw new Error('Cast media info unavailable')
		const title = String(
			metadataSource?.title ?? sessionData.displayTitle ?? '',
		)
		const metadata = obj(
			construct(
				media as Dict,
				sessionData.mediaType === 'podcast'
					? 'MusicTrackMediaMetadata'
					: 'AudiobookChapterMediaMetadata',
			),
		)
		if (metadata) {
			metadata.title = track.title
			if (sessionData.mediaType === 'podcast') {
				metadata.albumName = title
			} else {
				metadata.bookTitle = title
				metadata.chapterNumber = track.index
				metadata.chapterTitle = track.title
				metadata.subtitle = title
			}
		}
		mediaInfo.metadata = metadata
		mediaInfo.itemId = track.index
		mediaInfo.duration = track.duration
		const queueItem = obj(construct(media as Dict, 'QueueItem', mediaInfo))
		if (!queueItem) throw new Error('Cast queue item unavailable')
		return queueItem
	})
	const start = position(tracks, time)
	const queue = obj(
		construct(
			media as Dict,
			'QueueData',
			String(sessionData.id),
			String(metadataSource?.title ?? sessionData.displayTitle ?? ''),
			'',
			false,
			info,
			start.index,
			start.offset,
		),
	)
	if (!queue) throw new Error('Cast queue unavailable')
	queue.queueType = obj(media.QueueType)?.[
		sessionData.mediaType === 'podcast' ? 'PODCAST_SERIES' : 'AUDIOBOOK'
	]
	const containerConstructor =
		sessionData.mediaType === 'podcast'
			? media.ContainerMetadata
			: media.AudiobookContainerMetadata
	if (typeof containerConstructor === 'function') {
		const container = obj(
			Reflect.construct(
				containerConstructor,
				sessionData.mediaType === 'podcast'
					? [obj(media.ContainerType)?.GENERIC_CONTAINER]
					: [],
			),
		)
		if (container) {
			container.title = String(
				metadataSource?.title ?? sessionData.displayTitle ?? '',
			)
			if (sessionData.mediaType !== 'podcast') {
				container.authors = Array.isArray(metadataSource?.authors)
					? metadataSource.authors
							.map((author) =>
								typeof obj(author)?.name === 'string' ? obj(author)?.name : '',
							)
							.filter(Boolean)
					: []
				container.narrators = Array.isArray(metadataSource?.narrators)
					? metadataSource.narrators
					: []
				container.publisher = metadataSource?.publisher
			}
			queue.containerMetadata = container
		}
	}
	const request = obj(construct(media as Dict, 'LoadRequest'))
	if (!request) throw new Error('Cast load request unavailable')
	request.queueData = queue
	request.currentTime = start.offset
	request.autoplay = autoplay
	request.playbackRate = rate
	return request
}
let pendingLoad: Promise<unknown> = Promise.resolve()
export async function loadCast(
	input: unknown,
	options: { currentTime: number; autoplay: boolean; playbackRate: number },
): Promise<void> {
	const tracks = tracksFor(input)
	const data = obj(input) as Session
	const current = getSession()
	if (!current) throw new Error('No Cast session')
	const request = build(
		data,
		tracks,
		options.currentTime,
		options.autoplay,
		options.playbackRate,
	)
	const token = ++loadGeneration
	session = data
	activeId = data.id
	try {
		const load = pendingLoad
			.catch(() => {})
			.then(async () => {
				if (token !== loadGeneration || current !== getSession())
					throw new Error('Cast session changed during load')
				return await call(current, 'loadMedia', request)
			})
		pendingLoad = load
		const result = await load
		if (result === false) throw new Error('Cast media load failed')
		if (token !== loadGeneration) {
			if (!session && current === getSession() && controller)
				call(controller, 'stop')
			throw new Error('Cast session changed during load')
		}
		loadRate = options.playbackRate
	} catch {
		if (token === loadGeneration)
			useCast.setState({
				error:
					'Cast media load failed. Check receiver and direct-audio support.',
			})
		throw new Error('Cast media load failed')
	}
}
function snapshotInternal() {
	if (!remote || !session || !activeId || !getSession()) return null
	const current = getSession()
	const mediaSession = obj(call(current, 'getMediaSession'))
	const info = obj(mediaSession?.media)
	if (!info) return null
	const tracks = tracksFor(session)
	const contentId = info.contentId
	if (typeof contentId !== 'string') return null
	const sessionId = activeId
	const track = tracks.find(
		(candidate) =>
			new URL(
				`${window.__ABS_WEB_CONFIG__?.apiBasePath ?? ''}/public/session/${encodeURIComponent(sessionId)}/track/${candidate.index}`,
				window.location.origin,
			).href === contentId,
	)
	if (!track) return null
	const local = remote.currentTime
	const total =
		tracks[tracks.length - 1].startOffset + tracks[tracks.length - 1].duration
	const currentTime = Math.min(
		total,
		Math.max(
			0,
			track.startOffset +
				(typeof local === 'number' && Number.isFinite(local) ? local : 0),
		),
	)
	return {
		currentTime,
		paused: remote.isPaused ?? true,
		volume: typeof remote.volumeLevel === 'number' ? remote.volumeLevel : 1,
		ended:
			track === tracks[tracks.length - 1] &&
			mediaSession?.playerState === 'IDLE' &&
			mediaSession?.idleReason === 'FINISHED',
	}
}
export function castSnapshot(): {
	currentTime: number
	paused: boolean
	volume: number
	ended: boolean
} | null {
	return snapshotInternal()
}
export async function seekCast(globalTime: number): Promise<void> {
	if (!session) throw new Error('No Cast media')
	const tracks = tracksFor(session)
	const where = position(tracks, globalTime)
	const snap = snapshotInternal()
	const currentMedia = obj(obj(call(getSession(), 'getMediaSession'))?.media)
	const activeTrack =
		typeof currentMedia?.contentId === 'string'
			? tracks.find(
					(track) =>
						new URL(
							`${window.__ABS_WEB_CONFIG__?.apiBasePath ?? ''}/public/session/${encodeURIComponent(activeId ?? '')}/track/${track.index}`,
							window.location.origin,
						).href === currentMedia.contentId,
				)
			: undefined
	if (snap && tracks[where.index].index === activeTrack?.index) {
		if (remote) remote.currentTime = where.offset
		call(controller, 'seek')
		return
	}
	await loadCast(session, {
		currentTime: globalTime,
		autoplay: !(snap?.paused ?? true),
		playbackRate: loadRate,
	})
}
export function setCastPlaying(playing: boolean) {
	if (!remote || !controller || remote.isPaused === !playing) return
	call(controller, 'playOrPause')
}
export function setCastVolume(value: number) {
	if (!remote || !controller || !Number.isFinite(value)) return
	remote.volumeLevel = Math.min(1, Math.max(0, value))
	call(controller, 'setVolumeLevel')
}
export async function setCastRate(value: number): Promise<void> {
	if (!session) return
	const snap = snapshotInternal()
	if (!snap) return
	await loadCast(session, {
		currentTime: snap.currentTime,
		autoplay: !snap.paused,
		playbackRate: value,
	})
}
export function disconnectCast(): void {
	const current = context
	clearMedia()
	useCast.setState({ connected: false, device: '' })
	if (current && typeof current.endCurrentSession === 'function')
		void call(current, 'endCurrentSession', true)
}
export function stopCast(): void {
	clearMedia()
	if (controller) call(controller, 'stop')
}
