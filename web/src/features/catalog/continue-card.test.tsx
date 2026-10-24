import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAuth } from '../../api'
import { ContinueCard } from './continue-card'

vi.mock('@tanstack/react-router', () => ({
	Link: ({ children }: { children: React.ReactNode }) => (
		<a href="/item/show">{children}</a>
	),
}))
afterEach(cleanup)
it('uses episode identity for elapsed progress, not whole show progress', () => {
	useAuth.setState({
		user: {
			id: 'u',
			mediaProgress: [
				{
					libraryItemId: 'show',
					episodeId: 'ep',
					currentTime: 750,
					duration: 2460,
				},
			],
		} as never,
	})
	render(
		<ContinueCard
			entry={{
				id: 'show',
				mediaType: 'podcast',
				media: { metadata: { title: 'Show' } },
				recentEpisode: { id: 'ep', title: 'Episode', duration: 2460 },
			}}
		/>,
	)
	expect(screen.getByText('12:30 of 41:00 · 30 %')).toBeTruthy()
})
