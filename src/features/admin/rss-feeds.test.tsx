import '@testing-library/jest-dom/vitest'
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
	useAuth.getState().set(null)
})

import { useAuth } from '../../api'
import { RssFeeds } from './rss-feeds'

const response = (feeds: unknown[]) => Response.json({ feeds })
const fixture = {
	id: 'f',
	slug: 'books',
	entityType: 'series',
	feedUrl: '/feed/books',
	meta: { title: 'Books', preventIndexing: true },
	episodes: [{ id: 'e', title: 'Episode' }],
}

function authenticate() {
	useAuth.setState({
		user: {
			id: 'root',
			username: 'root',
			type: 'root',
			accessToken: 'fixture',
		},
	})
}

describe('RSS feeds', () => {
	it('confirms feed closure, posts exact identity, reloads empty result', async () => {
		authenticate()
		const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
		const fetcher = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(response([fixture]))
			.mockResolvedValueOnce(Response.json({}))
			.mockResolvedValueOnce(response([]))
		render(<RssFeeds />)
		const close = await screen.findByRole('button', {
			name: 'Close',
		})
		fireEvent.click(close)
		expect(fetcher).toHaveBeenCalledTimes(1)
		confirm.mockReturnValue(true)
		fireEvent.click(close)
		await screen.findByText('No RSS feeds.')
		expect(fetcher).toHaveBeenCalledWith(
			'/api/feeds/f/close',
			expect.objectContaining({ method: 'POST' }),
		)
	})
	it('renders API feeds and episode details accessibly', async () => {
		authenticate()
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(response([fixture]))
		render(<RssFeeds />)
		await screen.findByText('Books')
		const trigger = screen.getByRole('button', { name: 'Books' })
		trigger.focus()
		fireEvent.click(trigger)
		expect(await screen.findByText('Episode')).toBeTruthy()
		await waitFor(() =>
			expect(screen.getByRole('dialog')).toContainElement(
				document.activeElement as HTMLElement,
			),
		)
		expect(screen.getByLabelText('Feed URL')).toHaveValue(
			`${window.location.origin}/feed/books`,
		)
		fireEvent.keyDown(document.activeElement || document.body, {
			key: 'Escape',
		})
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
		await waitFor(() => expect(trigger).toHaveFocus())
	})

	it('shows loading, empty, and error states distinctly and retries failures', async () => {
		authenticate()
		let rejectRequest: (reason?: unknown) => void = () => {}
		const request = vi
			.spyOn(globalThis, 'fetch')
			.mockImplementationOnce(
				() =>
					new Promise((_, reject) => {
						rejectRequest = reject
					}),
			)
			.mockResolvedValueOnce(response([]))
		render(<RssFeeds />)
		expect(screen.getByText('Loading RSS feeds…')).toBeInTheDocument()
		rejectRequest(new Error('network down'))
		expect(await screen.findByRole('alert')).toHaveTextContent('network down')
		expect(screen.queryByText('No RSS feeds.')).not.toBeInTheDocument()
		screen.getByRole('button', { name: 'Retry' }).click()
		expect(await screen.findByText('No RSS feeds.')).toBeInTheDocument()
		await waitFor(() => expect(request).toHaveBeenCalledTimes(2))
	})
})
