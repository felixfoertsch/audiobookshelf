import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAuth } from '../../api'
import { Stats } from './stats'

describe('stats', () => {
	it('renders totals and recent sessions using server payload shape', async () => {
		useAuth.setState({
			user: {
				id: 'user',
				username: 'reader',
				accessToken: 'token',
				mediaProgress: [{ isFinished: true }],
			},
		})
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(
					JSON.stringify({
						totalTime: 3600,
						days: { '2026-10-20': 60 },
						recentSessions: [
							{
								id: 'session',
								updatedAt: 1792490400000,
								timeListening: 3660,
								displayTitle: 'Book',
								mediaMetadata: { title: 'Book' },
							},
						],
					}),
					{ status: 200 },
				),
			),
		)
		render(<Stats />)
		await waitFor(() =>
			expect(screen.getByText('Book · 2026-10-20 10:00 UTC')).toBeTruthy(),
		)
		expect(screen.getByText('1h 1m')).toBeTruthy()
		expect(screen.getByText('Items finished')).toBeTruthy()
	})
})
