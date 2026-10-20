import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAuth } from '../../api'
import { RssFeeds } from './rss-feeds'

describe('RSS feeds', () => {
	it('renders API feeds and episode details accessibly', async () => {
		useAuth.setState({
			user: {
				id: 'root',
				username: 'root',
				type: 'root',
				accessToken: 'fixture',
			},
		})
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			Response.json({
				feeds: [
					{
						id: 'f',
						slug: 'books',
						entityType: 'series',
						feedUrl: '/feed/books',
						meta: { title: 'Books', preventIndexing: true },
						episodes: [{ id: 'e', title: 'Episode' }],
					},
				],
			}),
		)
		render(<RssFeeds />)
		await screen.findByText('Books')
		screen.getByRole('button', { name: 'Books' }).click()
		expect(await screen.findByText('Episode')).toBeTruthy()
		expect(screen.getByLabelText('Feed URL')).toHaveValue(
			`${window.location.origin}/feed/books`,
		)
	})
})
