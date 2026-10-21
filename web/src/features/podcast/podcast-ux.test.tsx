import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PodcastDownloadQueue, PodcastLatest } from './index'

vi.mock('@tanstack/react-router', () => ({
	Link: ({ children }: { children: React.ReactNode }) => (
		<span>{children}</span>
	),
}))
afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
})
it('queue distinguishes pending, failure, retry and successful empty', async () => {
	const fetch = vi
		.spyOn(globalThis, 'fetch')
		.mockImplementationOnce(() => new Promise(() => {}))
	const view = render(<PodcastDownloadQueue libraryId="lib" />)
	expect(screen.queryByText('No queued downloads.')).toBeNull()
	expect(screen.getByRole('status').textContent).toContain('Loading')
	view.unmount()
	fetch.mockRejectedValueOnce(new Error('Offline'))
	render(<PodcastDownloadQueue libraryId="lib" />)
	expect(await screen.findByRole('alert')).toBeTruthy()
	expect(screen.queryByText('No queued downloads.')).toBeNull()
	fetch.mockResolvedValueOnce(new Response(JSON.stringify({ queue: [] })))
	fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
	await screen.findByText('No queued downloads.')
	expect(screen.queryByRole('alert')).toBeNull()
})
it('latest previews safe descriptions, expands on explicit disclosure', async () => {
	vi.spyOn(globalThis, 'fetch').mockResolvedValue(
		new Response(
			JSON.stringify({
				episodes: [
					{
						id: 'e',
						libraryItemId: 'p',
						title: 'Episode identity',
						description: '<p>Hidden &amp; safe</p>',
						podcast: { metadata: { title: 'Show identity' } },
					},
				],
			}),
		),
	)
	render(<PodcastLatest libraryId="lib" />)
	await screen.findByRole('heading', { name: 'Episode identity' })
	expect(screen.getByText('Hidden & safe')).toBeTruthy()
	expect(screen.getByText('Read description').closest('details')?.open).toBe(
		false,
	)
	fireEvent.click(screen.getByText('Read description'))
	await waitFor(() => expect(screen.getByText('Hidden & safe')).toBeTruthy())
})
