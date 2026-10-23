import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { playEpisode } from '../../player'
import { SessionDetails } from './session-details'

vi.mock('../../player', () => ({ playEpisode: vi.fn() }))

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
})

describe('session detail actions', () => {
	it('plays from exact position and closes open session with POST', async () => {
		const calls: Array<[string, RequestInit | undefined]> = []
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
			calls.push([String(input), init])
			return Response.json({})
		})
		const onClose = vi.fn()
		const onRefresh = vi.fn()
		vi.spyOn(window, 'confirm').mockReturnValue(true)
		render(
			<SessionDetails
				session={{
					id: 'session-1',
					displayTitle: 'Book',
					libraryItemId: 'item-1',
					episodeId: 'episode-1',
					currentTime: 42,
					open: true,
				}}
				onClose={onClose}
				onRefresh={onRefresh}
			/>,
		)
		fireEvent.click(
			screen.getByRole('button', { name: 'Play from last position' }),
		)
		await waitFor(() =>
			expect(playEpisode).toHaveBeenCalledWith(
				'item-1',
				'episode-1',
				false,
				42,
			),
		)
		fireEvent.click(screen.getByRole('button', { name: 'Close session' }))
		await waitFor(() =>
			expect(calls).toContainEqual([
				'/api/session/session-1/close',
				expect.objectContaining({ method: 'POST' }),
			]),
		)
		expect(onClose).toHaveBeenCalledOnce()
		expect(onRefresh).toHaveBeenCalledOnce()
	})

	it('does not delete on rejected confirmation; deletes closed session after acceptance', async () => {
		const calls: Array<[string, RequestInit | undefined]> = []
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
			calls.push([String(input), init])
			return Response.json({})
		})
		const onClose = vi.fn()
		const onRefresh = vi.fn()
		const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
		render(
			<SessionDetails
				session={{ id: 'session-2', displayTitle: 'Closed book', open: false }}
				onClose={onClose}
				onRefresh={onRefresh}
			/>,
		)
		fireEvent.click(screen.getByRole('button', { name: 'Delete session' }))
		expect(calls).toEqual([])
		confirm.mockReturnValue(true)
		fireEvent.click(screen.getByRole('button', { name: 'Delete session' }))
		await waitFor(() =>
			expect(calls).toContainEqual([
				'/api/sessions/session-2',
				expect.objectContaining({ method: 'DELETE' }),
			]),
		)
		expect(onClose).toHaveBeenCalledOnce()
		expect(onRefresh).toHaveBeenCalledOnce()
	})
})
