import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ApiError } from '../../api'
import { AdAnalysisStatus } from './AdAnalysisStatus'

const mocks = vi.hoisted(() => ({
	type: 'admin',
	api: vi.fn(async (): Promise<unknown> => ({ queued: true })),
}))
vi.mock('../../api', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../api')>()),
	useAuth: (
		select: (state: { user: { type: string; id: string } | null }) => unknown,
	) =>
		select(
			mocks.type ? { user: { type: mocks.type, id: 'u1' } } : { user: null },
		),
}))
vi.mock('../../psb-api', () => ({ psbApi: mocks.api }))
vi.mock('../i18n', () => ({
	useT:
		() =>
		(
			_key: string,
			replacements: Record<string, number> = {},
			fallback: string,
		) =>
			fallback
				.replace('{count}', String(replacements.count ?? '{count}'))
				.replace('{seconds}', String(replacements.seconds ?? '{seconds}')),
}))
afterEach(() => {
	cleanup()
	mocks.type = 'admin'
	mocks.api.mockReset().mockResolvedValue({ queued: true })
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
const result = {
	status: 'complete',
	version: 'v1',
	sourceSha256: 'a'.repeat(64),
	segments: [
		{ start: 1, end: 4 },
		{ start: 9, end: 12 },
	],
	adAnalysisEnabled: true,
}
it('omits disabled shows while polling external consent', () => {
	show(null, { enabled: false })
	expect(mocks.api).toHaveBeenCalled()
	expect(screen.queryByRole('button')).toBeNull()
})
it.each([
	[null, 'Not analysed', true],
	[{ ...result, status: 'queued', segments: [] }, 'Analysis queued', false],
	[{ ...result, status: 'running', segments: [] }, 'Analysis running', false],
	[result, 'Inserted audio found: 2 breaks, 6 seconds', false],
	[{ ...result, segments: [] }, 'No inserted ads found', false],
	[
		{ ...result, status: 'inconclusive', segments: [] },
		'Analysis inconclusive',
		true,
	],
	[{ ...result, status: 'error', segments: [] }, 'Analysis failed', true],
	[{ ...result, status: 'stale', segments: [] }, 'Analysis outdated', true],
])('renders state %j', (analysis, label, clickable) => {
	show(analysis)
	expect(
		screen.getByRole(clickable ? 'button' : 'img', { name: label }),
	).toBeTruthy()
})
it('keeps retry read-only for listeners', () => {
	mocks.type = 'user'
	show()
	expect(screen.queryByRole('button')).toBeNull()
})
it('polls item analysis and applies returned episode status', async () => {
	mocks.api.mockResolvedValueOnce({ episodes: { ep: result } })
	show()
	await screen.findByRole('img', {
		name: 'Inserted audio found: 2 breaks, 6 seconds',
	})
	expect(mocks.api).toHaveBeenCalledWith(
		'/api/items/show/analysis',
		expect.anything(),
		expect.anything(),
	)
})
it('enqueues through contract path and displays queued state', async () => {
	mocks.api
		.mockResolvedValueOnce({ episodes: {} })
		.mockResolvedValueOnce({ count: 0, totalBytes: 0, collectionPaused: false })
		.mockResolvedValueOnce({ queued: true })
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
})
it('surfaces queue conflict and preserves retry', async () => {
	mocks.api
		.mockResolvedValueOnce({ episodes: {} })
		.mockResolvedValueOnce({ count: 0, totalBytes: 0, collectionPaused: false })
		.mockRejectedValueOnce(new ApiError('busy', 409))
	show()
	fireEvent.click(screen.getByRole('button', { name: 'Not analysed' }))
	expect((await screen.findByRole('alert')).textContent).toContain(
		'Analysis queue is busy or this episode is already queued. Try again later.',
	)
	expect(screen.getByRole('button', { name: 'Not analysed' })).toBeTruthy()
})
