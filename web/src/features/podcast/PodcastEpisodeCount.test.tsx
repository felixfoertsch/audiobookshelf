import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PodcastEpisodeCount } from './PodcastEpisodeCount'

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
})
it('shows feed-wide finished total, not downloaded count', async () => {
	vi.spyOn(globalThis, 'fetch').mockResolvedValue(
		new Response(JSON.stringify({ total: 120, unplayed: 3, source: 'feed' })),
	)
	render(<PodcastEpisodeCount itemId="p" downloaded={4} />)
	expect(await screen.findByText('117/120 (98 %)')).toBeTruthy()
})
it('labels server downloaded fallback honestly', async () => {
	vi.spyOn(globalThis, 'fetch').mockResolvedValue(
		new Response(
			JSON.stringify({ total: 4, unplayed: 2, source: 'downloaded' }),
		),
	)
	render(<PodcastEpisodeCount itemId="p" downloaded={4} />)
	expect(
		await screen.findByText('2/4 (50 %) downloaded · feed unavailable'),
	).toBeTruthy()
})
it('labels unavailable feed totals honestly', async () => {
	vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Offline'))
	render(<PodcastEpisodeCount itemId="p" downloaded={4} />)
	expect(
		await screen.findByText('4 downloaded · feed unavailable'),
	).toBeTruthy()
})
