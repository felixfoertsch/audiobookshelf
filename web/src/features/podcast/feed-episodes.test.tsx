import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { useAuth } from '../../api'
import { FeedDownloadAction } from './FeedDownloadAction'
import { canDownloadEpisodes, useEpisodeDownloads } from './feed-episodes'

const api = vi.hoisted(() => vi.fn())
vi.mock('../../api', async (original) => ({
	...(await original<typeof import('../../api')>()),
	api,
}))
const episode = {
	id: 'feed-1',
	libraryItemId: 'podcast-1',
	title: 'Feed episode',
	downloaded: false,
	enclosure: { url: 'https://example.test/audio.mp3' },
	guid: 'feed-guid',
}
const refresh = vi.fn()
function Row() {
	const downloads = useEpisodeDownloads('podcasts', refresh)
	return <FeedDownloadAction episode={episode} downloads={downloads} />
}
beforeEach(() => {
	vi.clearAllMocks()
	api.mockResolvedValue({ queue: [], currentDownload: null })
	useAuth.setState({
		user: {
			id: 'admin',
			username: 'admin',
			accessToken: 'fixture',
			type: 'admin',
		},
	})
})
it('gates episode downloads by native admin role and download/update permissions', () => {
	expect(
		canDownloadEpisodes({
			type: 'user',
			permissions: { download: true, update: true },
		}),
	).toBe(false)
	expect(
		canDownloadEpisodes({ type: 'admin', permissions: { download: false } }),
	).toBe(false)
	expect(
		canDownloadEpisodes({ type: 'root', permissions: { update: false } }),
	).toBe(false)
	expect(canDownloadEpisodes({ type: 'admin' })).toBe(true)
})
it('queues feed enclosure through native download endpoint and refreshes after socket completion', async () => {
	render(<Row />)
	await waitFor(() => expect(api).toHaveBeenCalled())
	fireEvent.click(screen.getByRole('button', { name: 'Download Feed episode' }))
	await screen.findByText('Queued')
	expect(api).toHaveBeenCalledWith(
		'/api/podcasts/podcast-1/download-episodes',
		expect.anything(),
		{ method: 'POST', body: JSON.stringify([episode]) },
	)
	api.mockResolvedValue({
		queue: [],
		currentDownload: {
			libraryItemId: 'podcast-1',
			guid: 'feed-guid',
			url: episode.enclosure.url,
			startedAt: 1,
		},
	})
	window.dispatchEvent(
		new CustomEvent('abs:socket', {
			detail: { event: 'episode_download_started', payload: {} },
		}),
	)
	await screen.findByText('Downloading')
	window.dispatchEvent(
		new CustomEvent('abs:socket', {
			detail: { event: 'episode_download_finished', payload: {} },
		}),
	)
	await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
})
it('shows not downloaded state without action for listener', async () => {
	useAuth.setState({
		user: {
			id: 'listener',
			username: 'listener',
			accessToken: 'fixture',
			type: 'user',
		},
	})
	render(<Row />)
	expect(screen.getByText('Not downloaded')).toBeTruthy()
	expect(
		screen.queryByRole('button', { name: 'Download Feed episode' }),
	).toBeNull()
})
