import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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
test('native audio is sole local timeline and volume; settings stay disclosed without replacing audio', () => {
	const { container } = start()
	const audio = screen.getByLabelText('Audio playback')
	expect(audio.hasAttribute('controls')).toBe(true)
	expect(container.querySelectorAll('audio')).toHaveLength(1)
	const nativeKey = new KeyboardEvent('keydown', {
		code: 'Space',
		bubbles: true,
		cancelable: true,
	})
	audio.dispatchEvent(nativeKey)
	expect(nativeKey.defaultPrevented).toBe(false)
	expect(screen.queryByRole('slider')).toBeNull()
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
