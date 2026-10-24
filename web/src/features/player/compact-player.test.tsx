import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { Player, sessionSchema, usePlayer } from '../../player'

vi.mock('@tanstack/react-router', () => ({
	Link: ({ children }: { children: React.ReactNode }) => (
		<span>{children}</span>
	),
}))
afterEach(() => {
	cleanup()
	usePlayer.getState().set(null)
	localStorage.clear()
	vi.restoreAllMocks()
})
function start() {
	vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
	vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
	vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({}))
	usePlayer.getState().set(
		sessionSchema.parse({
			id: 'compact',
			episodeId: 'episode',
			currentTime: 0,
			duration: 60,
			displayTitle: 'Small player',
			audioTracks: [{ contentUrl: '/audio.wav', duration: 60 }],
			libraryItem: null,
		}),
	)
	return render(<Player />)
}
test('chapter-end sleep pauses native player exactly at global chapter boundary', () => {
	start()
	act(() =>
		usePlayer.setState({
			session: sessionSchema.parse({
				id: 'chapter-sleep',
				episodeId: null,
				currentTime: 0,
				duration: 60,
				audioTracks: [{ contentUrl: '/audio.wav', duration: 60 }],
				chapters: [
					{ id: 0, start: 0, end: 10, title: 'One' },
					{ id: 1, start: 10, end: 60, title: 'Two' },
				],
				libraryItem: null,
			}),
		}),
	)
	const audio = screen.getByLabelText('Audio playback') as HTMLAudioElement
	fireEvent.loadedMetadata(audio)
	fireEvent.click(screen.getByRole('button', { name: 'Player options' }))
	fireEvent.change(screen.getByLabelText('Sleep timer'), {
		target: { value: 'chapter' },
	})
	vi.mocked(HTMLMediaElement.prototype.pause).mockClear()
	audio.currentTime = 9.9
	fireEvent.timeUpdate(audio)
	expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled()
	audio.currentTime = 10
	fireEvent.timeUpdate(audio)
	expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1)
})

test('custom controls drive single hidden audio engine; settings preserve audio', () => {
	const { container } = start()
	const audio = screen.getByLabelText('Audio playback')
	expect(audio.hasAttribute('controls')).toBe(false)
	expect(audio.className).toBe('hidden')
	fireEvent.loadedMetadata(audio)
	fireEvent.click(
		screen.getByRole('button', { name: 'Skip forward 30 seconds' }),
	)
	expect((audio as HTMLAudioElement).currentTime).toBe(30)
	fireEvent.click(screen.getByRole('button', { name: 'Skip back 15 seconds' }))
	expect((audio as HTMLAudioElement).currentTime).toBe(15)
	;(audio as HTMLAudioElement).currentTime = 0
	fireEvent.timeUpdate(audio)
	expect(container.querySelectorAll('audio')).toHaveLength(1)
	const nativeKey = new KeyboardEvent('keydown', {
		code: 'Space',
		bubbles: true,
		cancelable: true,
	})
	audio.dispatchEvent(nativeKey)
	expect(nativeKey.defaultPrevented).toBe(false)
	expect(screen.getByRole('slider', { name: 'Playback progress' })).toBeTruthy()
	expect(screen.queryByLabelText('Sleep timer')).toBeNull()
	fireEvent.click(screen.getByRole('button', { name: 'Player options' }))
	expect(screen.getByRole('dialog', { name: 'Player options' })).toBeTruthy()
	expect(screen.getByLabelText('Sleep timer')).toBeTruthy()
	expect(screen.getByLabelText('Audio playback')).toBe(audio)
	fireEvent.loadedMetadata(audio)
	const position = screen.getByLabelText('Original position (seconds)')
	for (const value of ['', '-1', '61']) {
		fireEvent.change(position, { target: { value } })
		fireEvent.submit(position.closest('form') || position)
		expect((audio as HTMLAudioElement).currentTime).toBe(0)
	}
	fireEvent.focus(position)
	fireEvent.change(position, { target: { value: '3' } })
	fireEvent.timeUpdate(audio)
	expect((position as HTMLInputElement).value).toBe('3')
	expect((audio as HTMLAudioElement).currentTime).toBe(0)
	fireEvent.change(position, { target: { value: '30.5' } })
	fireEvent.submit(position.closest('form') || position)
	expect((audio as HTMLAudioElement).currentTime).toBe(30.5)
})
test('paused seek draft resets outside form, but button blur preserves one fractional seek', () => {
	start()
	const audio = screen.getByLabelText('Audio playback') as HTMLAudioElement
	fireEvent.loadedMetadata(audio)
	audio.currentTime = 6
	fireEvent.timeUpdate(audio)
	fireEvent.click(screen.getByRole('button', { name: 'Player options' }))
	const input = screen.getByLabelText(
		'Original position (seconds)',
	) as HTMLInputElement
	const submit = screen.getByRole('button', { name: /^Seek$/ })
	fireEvent.focus(input)
	fireEvent.change(input, { target: { value: '30.5' } })
	fireEvent.blur(input, { relatedTarget: screen.getByLabelText('Sleep timer') })
	expect(input.value).toBe('6')
	expect(audio.currentTime).toBe(6)
	fireEvent.focus(input)
	fireEvent.change(input, { target: { value: '30.5' } })
	fireEvent.blur(input, { relatedTarget: null })
	expect(input.value).toBe('6')
	expect(audio.currentTime).toBe(6)
	fireEvent.focus(input)
	fireEvent.change(input, { target: { value: '30.5' } })
	const seek = vi.spyOn(audio, 'currentTime', 'set')
	// Prevented pointerdown retains input focus; no intervening blur occurs.
	expect(fireEvent.pointerDown(submit)).toBe(false)
	fireEvent.click(submit)
	expect(audio.currentTime).toBe(30.5)
	expect(seek).toHaveBeenCalledTimes(1)
})
test('closing focused draft resets editing state before options reopen', () => {
	start()
	const audio = screen.getByLabelText('Audio playback') as HTMLAudioElement
	fireEvent.loadedMetadata(audio)
	fireEvent.click(screen.getByRole('button', { name: 'Player options' }))
	const input = screen.getByLabelText('Original position (seconds)')
	fireEvent.focus(input)
	fireEvent.change(input, { target: { value: '30.5' } })
	fireEvent.click(screen.getByRole('button', { name: /^Close$/ }))
	audio.currentTime = 6
	fireEvent.timeUpdate(audio)
	fireEvent.click(screen.getByRole('button', { name: 'Player options' }))
	expect(
		(screen.getByLabelText('Original position (seconds)') as HTMLInputElement)
			.value,
	).toBe('6')
})
test('replacement retains native volume even before queued volumechange fires', () => {
	start()
	const audio = screen.getByLabelText('Audio playback') as HTMLAudioElement
	fireEvent.loadedMetadata(audio)
	audio.volume = 0.4
	audio.muted = true
	const session = usePlayer.getState().session
	if (!session) throw new Error('Missing test session')
	// Browser queues volumechange; session replacement may finish first.
	act(() => usePlayer.getState().set(null))
	act(() => usePlayer.getState().set({ ...session, id: 'replacement' }))
	const replacement = screen.getByLabelText(
		'Audio playback',
	) as HTMLAudioElement
	fireEvent.loadedMetadata(replacement)
	expect(replacement.volume).toBe(0.4)
	expect(replacement.muted).toBe(true)
})
test('replacement restores native volume before metadata event delivery', () => {
	start()
	const audio = screen.getByLabelText('Audio playback') as HTMLAudioElement
	fireEvent.loadedMetadata(audio)
	audio.volume = 0.4
	audio.muted = true
	const session = usePlayer.getState().session
	if (!session) throw new Error('Missing test session')
	act(() => usePlayer.getState().set(null))
	act(() => usePlayer.getState().set({ ...session, id: 'replacement' }))
	const replacement = screen.getByLabelText(
		'Audio playback',
	) as HTMLAudioElement
	// readyState and defaultPlaybackRate can change before queued loadedmetadata.
	expect(replacement.src).toContain('/audio.wav')
	expect(replacement.volume).toBe(0.4)
	expect(replacement.muted).toBe(true)
})
test('native rate changes persist canonical settings and survive next session', () => {
	start()
	const audio = screen.getByLabelText('Audio playback') as HTMLAudioElement
	fireEvent.loadedMetadata(audio)
	audio.playbackRate = 1.5
	fireEvent.rateChange(audio)
	expect(
		JSON.parse(localStorage.getItem('userSettings') || '{}').playbackRate,
	).toBe(1.5)
	const session = usePlayer.getState().session
	if (!session) throw new Error('Missing test session')
	act(() => usePlayer.getState().set({ ...session, id: 'next' }))
	fireEvent.loadedMetadata(audio)
	expect(audio.playbackRate).toBe(1.5)
})

test('transport, progress keys and volume use the audio engine without hijacking inputs', () => {
	start()
	const audio = screen.getByLabelText('Audio playback') as HTMLAudioElement
	fireEvent.loadedMetadata(audio)
	fireEvent.play(audio)
	expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy()
	fireEvent.waiting(audio)
	expect(screen.getByLabelText('Buffering')).toBeTruthy()
	fireEvent.playing(audio)
	expect(screen.queryByLabelText('Buffering')).toBeNull()
	fireEvent.keyDown(screen.getByRole('slider', { name: 'Playback progress' }), {
		key: 'ArrowRight',
		code: 'ArrowRight',
	})
	expect(audio.currentTime).toBe(1)
	fireEvent.click(screen.getByRole('button', { name: 'Player options' }))
	const input = screen.getByLabelText('Original position (seconds)')
	const play = vi.mocked(HTMLMediaElement.prototype.play)
	play.mockClear()
	fireEvent.keyDown(input, { key: ' ', code: 'Space' })
	expect(play).not.toHaveBeenCalled()
	fireEvent.click(screen.getByRole('button', { name: 'Mute' }))
	expect(audio.muted).toBe(true)
	fireEvent.click(screen.getByRole('button', { name: 'Unmute' }))
	expect(audio.muted).toBe(false)
	fireEvent.keyDown(screen.getByRole('slider', { name: 'Volume' }), {
		key: 'Home',
	})
	expect(audio.volume).toBe(0)
	fireEvent.keyDown(screen.getByRole('slider', { name: 'Volume' }), {
		key: 'ArrowRight',
	})
	expect(audio.volume).toBe(0.01)
})

test('bookmark create, edit, delete and seek report UI and request outcomes', async () => {
	const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input)
		if (url.includes('/bookmarks/book'))
			return Response.json({
				bookmarks: [{ time: 12, title: 'Initial' }],
			})
		if (init?.method === 'POST')
			return Response.json({ time: 0, title: 'Created' })
		if (init?.method === 'PATCH')
			return Response.json({ time: 12, title: 'Edited' })
		if (url.includes('/play'))
			return Response.json({
				id: 'bookmark-session',
				libraryItemId: 'book',
				episodeId: null,
				currentTime: 0,
				duration: 60,
				audioTracks: [{ contentUrl: '/audio.wav', duration: 60 }],
				libraryItem: null,
			})
		return Response.json({})
	})
	vi.spyOn(window, 'prompt').mockReturnValue('Edited')
	vi.spyOn(window, 'confirm').mockReturnValue(true)
	start()
	vi.mocked(globalThis.fetch).mockImplementation(fetch)
	const session = usePlayer.getState().session
	if (!session) throw new Error('Missing test session')
	act(() =>
		usePlayer.getState().set({
			...session,
			libraryItemId: 'book',
			episodeId: null,
		}),
	)
	const audio = screen.getByLabelText('Audio playback') as HTMLAudioElement
	fireEvent.loadedMetadata(audio)
	fireEvent.click(screen.getByRole('button', { name: 'Player options' }))
	await screen.findByRole('button', { name: /Initial/ })
	const title = screen.getByRole('textbox', { name: 'Bookmark title' })
	fireEvent.change(title, { target: { value: 'Created' } })
	fireEvent.click(screen.getByRole('button', { name: 'Add bookmark' }))
	await screen.findByRole('button', { name: /Created/ })
	expect(fetch).toHaveBeenCalledWith(
		'/api/me/item/book/bookmark',
		expect.objectContaining({ method: 'POST' }),
	)
	fireEvent.click(screen.getByRole('button', { name: /0:12 Initial/ }))
	expect(audio.currentTime).toBe(12)
	fireEvent.click(screen.getAllByRole('button', { name: 'Edit bookmark' })[0])
	await screen.findByRole('button', { name: /Edited/ })
	expect(fetch).toHaveBeenCalledWith(
		'/api/me/item/book/bookmark',
		expect.objectContaining({ method: 'PATCH' }),
	)
	fireEvent.click(screen.getAllByRole('button', { name: 'Delete bookmark' })[0])
	await waitFor(() => {
		expect(screen.queryByRole('button', { name: /Edited/ })).toBeNull()
	})
	expect(fetch).toHaveBeenCalledWith(
		'/api/me/item/book/bookmark/12',
		expect.objectContaining({ method: 'DELETE' }),
	)
})

test('auto-skip toggle persists setting and changes rendered control state', () => {
	start()
	fireEvent.click(screen.getByRole('button', { name: 'Player options' }))
	const toggle = screen.getByRole('checkbox', {
		name: 'Auto-skip detected segments',
	}) as HTMLInputElement
	expect(toggle.checked).toBe(true)
	fireEvent.click(toggle)
	expect(toggle.checked).toBe(false)
	expect(
		JSON.parse(localStorage.getItem('userSettings') || '{}').autoSkip,
	).toBe(false)
})

test('volume chosen while loading survives track switch before metadata', () => {
	start()
	const session = usePlayer.getState().session
	if (!session) throw new Error('Missing session')
	act(() =>
		usePlayer.getState().set({
			...session,
			duration: 120,
			audioTracks: [
				{ contentUrl: '/one.wav', duration: 60, startOffset: 0 },
				{ contentUrl: '/two.wav', duration: 60, startOffset: 60 },
			],
		}),
	)
	const audio = screen.getByLabelText('Audio playback') as HTMLAudioElement
	fireEvent.click(screen.getByRole('button', { name: 'Player options' }))
	fireEvent.keyDown(screen.getByRole('slider', { name: 'Volume' }), {
		key: 'Home',
	})
	fireEvent.keyDown(screen.getByRole('slider', { name: 'Volume' }), {
		key: 'ArrowRight',
	})
	fireEvent.click(screen.getByRole('button', { name: 'Mute' }))
	expect(audio.volume).toBe(0.01)
	expect(audio.muted).toBe(true)
	fireEvent.loadedMetadata(audio)
	const position = screen.getByLabelText('Original position (seconds)')
	fireEvent.change(position, { target: { value: '65' } })
	fireEvent.submit(position.closest('form') || position)
	expect(audio.src).toContain('/two.wav')
	expect(audio.volume).toBe(0.01)
	expect(audio.muted).toBe(true)
})
