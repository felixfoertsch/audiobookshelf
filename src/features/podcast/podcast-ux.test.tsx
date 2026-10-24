import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import * as i18n from '../i18n'
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
it('queue translates failed downloads with an interpolated English fallback', async () => {
	const translate = vi.fn(i18n.translate)
	vi.spyOn(i18n, 'useT').mockReturnValue(translate)
	vi.spyOn(globalThis, 'fetch').mockImplementation(
		async () => new Response(JSON.stringify({ queue: [] })),
	)
	render(<PodcastDownloadQueue libraryId="lib" />)
	await screen.findByText('No queued downloads.')
	for (const title of ['Episode identity', null]) {
		fireEvent(
			window,
			new CustomEvent('abs:socket', {
				detail: {
					event: 'episode_download_finished',
					payload: { failed: true, episodeDisplayTitle: title },
				},
			}),
		)
		expect((await screen.findByRole('alert')).textContent).toBe(
			`Download failed: ${title || 'Podcast episode'}`,
		)
		expect(translate).toHaveBeenCalledWith(
			'Podcast.downloadFailed',
			[title || 'Podcast episode'],
			'Download failed: {0}',
		)
	}
})
it('latest shows Play for zero or unknown duration and remaining time for real duration', async () => {
	vi.spyOn(globalThis, 'fetch').mockResolvedValue(
		new Response(
			JSON.stringify({
				limit: 50,
				page: 0,
				feedUnavailable: false,
				feedTruncated: false,
				episodes: [
					{
						id: 'zero',
						libraryItemId: 'p',
						title: 'Zero duration',
						duration: 0,
						podcast: { metadata: { title: 'Show' } },
					},
					{
						id: 'unknown',
						libraryItemId: 'p',
						title: 'Unknown duration',
						podcast: { metadata: { title: 'Show' } },
					},
					{
						id: 'real',
						libraryItemId: 'p',
						title: 'Real duration',
						duration: 120,
						podcast: { metadata: { title: 'Show' } },
					},
				],
			}),
		),
	)
	render(<PodcastLatest libraryId="lib" />)
	await screen.findByRole('heading', { name: 'Real duration' })
	expect(
		screen.getByRole('button', { name: 'Play Zero duration' }).textContent,
	).toContain('Play')
	expect(
		screen.getByRole('button', { name: 'Play Unknown duration' }).textContent,
	).toContain('Play')
	expect(
		screen.getByRole('button', { name: 'Play Real duration' }).textContent,
	).toContain('2:00')
})
it('latest previews safe short descriptions without empty disclosure', async () => {
	vi.spyOn(globalThis, 'fetch').mockResolvedValue(
		new Response(
			JSON.stringify({
				limit: 50,
				page: 0,
				feedUnavailable: false,
				feedTruncated: false,
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
	expect(screen.queryByText('Read description')).toBeNull()
	expect(screen.queryByText('actions=')).toBeNull()
	expect(screen.getAllByRole('button')[0].getAttribute('aria-label')).toBe(
		'Play Episode identity',
	)
	const queue = screen.getByRole('button', {
		name: 'Add Episode identity to player queue',
	})
	fireEvent.click(queue)
	expect(
		screen
			.getByRole('button', {
				name: 'Remove Episode identity from player queue',
			})
			.getAttribute('aria-pressed'),
	).toBe('true')
	fireEvent.click(queue)
	expect(queue.getAttribute('aria-pressed')).toBe('false')
})
