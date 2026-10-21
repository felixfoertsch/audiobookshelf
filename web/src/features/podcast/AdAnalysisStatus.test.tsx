import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AdAnalysisStatus } from './AdAnalysisStatus'

const mocks = vi.hoisted(() => ({
	type: 'admin',
	api: vi.fn(async () => ({})),
}))
vi.mock('../../api', () => ({
	api: mocks.api,
	useAuth: (select: (s: { user: { type: string } }) => unknown) =>
		select({ user: { type: mocks.type } }),
}))
afterEach(() => {
	cleanup()
	mocks.type = 'admin'
	mocks.api.mockClear()
})
const show = (adAnalysis: unknown = null, extra = {}) =>
	render(
		<AdAnalysisStatus
			itemId="show"
			episode={{ id: 'ep', audioFile: {}, adAnalysis }}
			enabled
			{...extra}
		/>,
	)
it('omits disabled shows', () => {
	show(null, { enabled: false })
	expect(screen.queryByRole('button')).toBeNull()
	expect(screen.queryByRole('img')).toBeNull()
})
it.each([
	[null, 'Not analysed', true],
	[{ status: 'queued' }, 'Analysis queued', false],
	[{ status: 'running' }, 'Analysis running', false],
	[
		{
			status: 'candidates',
			segments: [
				{ start: 1, end: 4 },
				{ start: 9, end: 12 },
			],
		},
		'Inserted audio found: 2 breaks, 6 seconds',
		false,
	],
	[{ status: 'no_difference' }, 'No inserted ads found', false],
	[{ status: 'inconclusive' }, 'Analysis inconclusive', true],
	[{ status: 'unsupported' }, 'Cannot analyse episode', false],
	[{ status: 'failed' }, 'Analysis failed', true],
	[{ status: 'cancelled' }, 'Analysis failed', true],
	[{ status: 'stale' }, 'Analysis outdated', true],
])('renders state %j', (result, label, clickable) => {
	show(result)
	expect(
		screen.getByRole(clickable ? 'button' : 'img', { name: label }),
	).toBeTruthy()
	expect(document.querySelectorAll('svg')).toHaveLength(1)
})
it('keeps retry read-only for listeners', () => {
	mocks.type = 'user'
	show()
	expect(screen.getByRole('img', { name: 'Not analysed' })).toBeTruthy()
	expect(screen.queryByRole('button')).toBeNull()
})
it('explains unavailable audio without offering analysis', () => {
	show(null, { episode: { id: 'ep' } })
	expect(
		screen.getByRole('img', { name: 'Cannot analyse episode' }),
	).toBeTruthy()
})
it('queues existing endpoint, updates without reload from socket', async () => {
	show()
	fireEvent.click(screen.getByRole('button', { name: 'Not analysed' }))
	await waitFor(() =>
		expect(mocks.api).toHaveBeenCalledWith(
			'/api/podcasts/show/episode/ep/ad-analysis',
			expect.anything(),
			expect.objectContaining({ method: 'POST' }),
		),
	)
	await screen.findByRole('img', { name: 'Analysis queued' })
	fireEvent(
		window,
		new CustomEvent('abs:socket', {
			detail: {
				event: 'episode_ad_analysis',
				payload: {
					libraryItemId: 'show',
					episodeId: 'ep',
					adAnalysis: { status: 'no_difference' },
				},
			},
		}),
	)
	expect(
		screen.getByRole('img', { name: 'No inserted ads found' }),
	).toBeTruthy()
})
it('shows queue failures, preserves retry', async () => {
	mocks.api.mockRejectedValueOnce(new Error('Queue full'))
	show()
	fireEvent.click(screen.getByRole('button', { name: 'Not analysed' }))
	expect((await screen.findByRole('alert')).textContent).toContain('Queue full')
	expect(screen.getByRole('button', { name: 'Not analysed' })).toBeTruthy()
})
