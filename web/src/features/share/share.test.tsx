import '@testing-library/jest-dom/vitest'
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadShare, SharePlayer, safeTrackUrl } from './share'

const share = {
	slug: 'demo',
	isDownloadable: false,
	playbackSession: {
		displayTitle: 'Shared book',
		displayAuthor: 'Author',
		duration: 10,
		audioTracks: [
			{
				index: 1,
				startOffset: 0,
				duration: 10,
				contentUrl: '/public/share/demo/track/1',
			},
		],
	},
}
afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
	localStorage.clear()
	window.__ABS_WEB_CONFIG__ = undefined
})
describe('anonymous native public share', () => {
	it('uses public cookie endpoint without bearer or auth refresh', async () => {
		localStorage.setItem('token', 'private')
		const fetcher = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(JSON.stringify(share)))
		await loadShare('demo', 3)
		expect(fetcher).toHaveBeenCalledWith('/public/share/demo?t=3', {
			credentials: 'same-origin',
		})
		expect(fetcher).toHaveBeenCalledTimes(1)
	})
	it('normalizes native configured-prefix tracks through root and prefixed aliases', async () => {
		for (const nativePrefix of ['/abs', '/abs.v1', '/abs~preview']) {
			for (const prefix of ['', nativePrefix]) {
				window.__ABS_WEB_CONFIG__ = {
					basePath: `${prefix}/new`,
					apiBasePath: prefix,
				}
				vi.spyOn(globalThis, 'fetch').mockResolvedValue(
					Response.json({
						...share,
						playbackSession: {
							...share.playbackSession,
							audioTracks: [
								{
									...share.playbackSession.audioTracks[0],
									contentUrl: `${nativePrefix}/public/share/demo/track/1`,
								},
							],
						},
					}),
				)
				const response = await loadShare('demo')
				expect(
					safeTrackUrl(
						response.playbackSession.audioTracks[0].contentUrl,
						'demo',
					),
				).toBe(`${location.origin}${prefix}/public/share/demo/track/1`)
			}
		}
	})
	it('rejects external and other-share media URLs', () => {
		for (const url of [
			'https://evil.example/audio',
			'/api/items/private',
			'/public/share/other/track/1',
			'/abs/%2e%2e/public/share/demo/track/1',
			'/abs/../public/share/demo/track/1',
			'/abs/./public/share/demo/track/1',
			'/./public/share/demo/track/1',
			'/../public/share/demo/track/1',
			'/abs/public/share/demo%2f../track/1',
			'/abs/public/share/demo/track/%31',
			'/abs/public/share/demo/track/1?token=private',
			`${location.protocol}//user:password@${location.host}/abs/public/share/demo/track/1`,
			'https://evil.example/abs/public/share/demo/track/1',
		])
			expect(() => safeTrackUrl(url, 'demo')).toThrow(
				'Invalid public audio URL',
			)
	})
	it('syncs native public cookie progress with 204 response and exposes allowed download', async () => {
		const fetcher = vi
			.spyOn(globalThis, 'fetch')
			.mockImplementation(async (_url, init) =>
				init?.method === 'PATCH'
					? new Response(null, { status: 204 })
					: new Response(JSON.stringify({ ...share, isDownloadable: true })),
			)
		const { container } = render(<SharePlayer slug="demo" />)
		await screen.findByRole('heading', { name: 'Shared book' })
		expect(
			screen.getByRole('link', { name: 'Download' }).getAttribute('href'),
		).toBe('/public/share/demo/download')
		const audio = container.querySelector('audio')
		if (!audio) throw new Error('Share audio control missing')
		audio.currentTime = 4
		fireEvent.pause(audio)
		await waitFor(() =>
			expect(fetcher).toHaveBeenCalledWith('/public/share/demo/progress', {
				method: 'PATCH',
				credentials: 'same-origin',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ currentTime: 4 }),
			}),
		)
		expect(screen.queryByRole('alert')).toBeNull()
	})
	it('renders no download control when disabled and expired state without shell', async () => {
		const fetcher = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(JSON.stringify(share)))
		render(<SharePlayer slug="demo" />)
		expect(
			await screen.findByRole('heading', { name: 'Shared book' }),
		).toBeTruthy()
		expect(screen.queryByRole('link', { name: 'Download' })).toBeNull()
		cleanup()
		fetcher.mockResolvedValue(new Response('', { status: 404 }))
		render(<SharePlayer slug="gone" />)
		expect(await screen.findByRole('alert')).toHaveTextContent(
			'Media item not found or expired',
		)
	})
})
