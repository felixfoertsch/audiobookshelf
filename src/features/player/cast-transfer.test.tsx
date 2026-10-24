import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { Player, sessionSchema, usePlayer } from '../../player'
import { useCast } from './cast'

vi.mock('@tanstack/react-router', () => ({
	Link: ({ children }: { children: React.ReactNode }) => (
		<span>{children}</span>
	),
}))
afterEach(() => {
	cleanup()
	usePlayer.getState().set(null)
	useCast.setState({ connected: false, available: false })
	vi.restoreAllMocks()
})
test('transfer failure survives closing and reopening options while pending', async () => {
	vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
	vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
	let reject!: (error: Error) => void
	const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation((url) =>
		String(url).startsWith('/psb/')
			? Promise.resolve(Response.json({ episodes: {} }))
			: new Promise<Response>((_, fail) => {
					reject = fail
				}),
	)
	useCast.setState({ connected: true, available: true })
	usePlayer.getState().set(
		sessionSchema.parse({
			id: 'transfer',
			libraryItemId: 'podcast',
			episodeId: 'ep',
			currentTime: 0,
			duration: 60,
			audioTracks: [{ contentUrl: '/audio.wav' }],
			libraryItem: null,
		}),
	)
	render(<Player />)
	fireEvent.click(screen.getByRole('button', { name: 'Player options' }))
	fireEvent.click(
		screen.getByRole('button', { name: 'Transfer audio to Cast' }),
	)
	await vi.waitFor(() => expect(typeof reject).toBe('function'))
	fireEvent.click(screen.getByRole('button', { name: /^Close$/ }))
	fireEvent.click(screen.getByRole('button', { name: 'Player options' }))
	expect(
		(
			screen.getByRole('button', {
				name: 'Transfer audio to Cast',
			}) as HTMLButtonElement
		).disabled,
	).toBe(true)
	fireEvent.click(screen.getByRole('button', { name: /^Close$/ }))
	await act(async () => reject(new Error('Late transfer failure')))
	expect(screen.getByRole('alert').textContent).toContain(
		'Late transfer failure',
	)
	fetcher.mockResolvedValueOnce(Response.json({})).mockImplementationOnce(
		() =>
			new Promise<Response>((_, fail) => {
				reject = fail
			}),
	)
	fireEvent.click(screen.getByRole('button', { name: 'Player options' }))
	fireEvent.click(
		screen.getByRole('button', { name: 'Transfer audio to Cast' }),
	)
	await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4))
	// Session replacement removes options before its play request settles.
	expect(screen.queryByRole('dialog')).toBeNull()
	await act(async () => reject(new Error('Late play request failure')))
	expect(screen.getByRole('alert').textContent).toContain(
		'Late play request failure',
	)
})
