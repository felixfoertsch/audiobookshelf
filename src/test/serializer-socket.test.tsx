import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AdAnalysisStatus } from '../features/podcast/AdAnalysisStatus'
import fixtures from './serializer-fixtures.json'

vi.mock('../api', async (importOriginal) => ({
	...(await importOriginal<typeof import('../api')>()),
	useAuth: (select: (state: { user: { type: string } }) => unknown) =>
		select({ user: { type: 'admin' } }),
}))
afterEach(cleanup)

it('ignores malformed and unrelated socket events, applies emitted serializer fixture', () => {
	render(
		<AdAnalysisStatus
			itemId={fixtures.socket.libraryItemId}
			episode={{ id: fixtures.socket.episodeId, audioFile: {} }}
			enabled
		/>,
	)
	const dispatch = (payload: unknown) =>
		fireEvent(
			window,
			new CustomEvent('abs:socket', {
				detail: { event: 'episode_ad_analysis', payload },
			}),
		)
	for (const payload of [
		null,
		{},
		{ ...fixtures.socket, adAnalysis: { status: 'invalid' } },
		{ ...fixtures.socket, episodeId: 'another' },
	]) {
		dispatch(payload)
		expect(screen.getByRole('button', { name: 'Not analysed' })).toBeTruthy()
	}
	dispatch(fixtures.socket)
	// Production cancellation payload disables analysis for this show.
	expect(screen.queryByRole('button')).toBeNull()
	expect(screen.queryByRole('img')).toBeNull()
})
