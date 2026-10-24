import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PodcastSearch } from './index'

const state = vi.hoisted(() => ({
	calls: 0,
	failItems: false,
	libraryId: 'lib',
}))
vi.mock('../../api', () => ({
	api: async (path: string, schema: { parse(value: unknown): unknown }) => {
		if (path.includes('/items?')) {
			if (state.failItems) throw Error('Library items unavailable')
			if (path.includes('/libraries/other/'))
				return schema.parse({ results: [] })
			if (path.includes('/libraries/other/'))
				return schema.parse({ results: [] })
			if (path.includes(encodeURIComponent(state.libraryId))) {
				return schema.parse({
					results: [
						{
							id: 'feed-match',
							media: {
								metadata: {
									feedUrl: 'https://feed.test/show',
									itunesId: 'other',
								},
							},
						},
						{
							id: 'itunes-match',
							media: {
								metadata: {
									feedUrl: 'https://other.test/show',
									itunesId: '42',
								},
							},
						},
					],
				})
			}
		}
		if (path.includes('?include=filterdata'))
			return schema.parse({
				library: { id: state.libraryId, mediaType: 'podcast', folders: [] },
			})
		if (path.includes('/search/podcast'))
			return schema.parse([
				{ id: 42, title: 'Feed match', feedUrl: 'https://feed.test/show' },
				{ id: 42, title: 'iTunes match', feedUrl: 'https://itunes.test/show' },
			])
		state.calls++
		throw Error(`unexpected request ${path}`)
	},
	getAuthGeneration: () => 1,
	useAuth: Object.assign(
		(select: (value: unknown) => unknown) =>
			select({ user: { id: 'admin', type: 'admin' } }),
		{
			getState: () => ({ user: { id: 'admin', type: 'admin' } }),
			subscribe: () => () => {},
		},
	),
}))
vi.mock('@tanstack/react-router', () => ({
	Link: ({
		children,
		params,
	}: {
		children: React.ReactNode
		params: { itemId: string }
	}) => <a href={`/items/${params.itemId}`}>{children}</a>,
}))
afterEach(() => {
	cleanup()
	vi.clearAllMocks()
	state.calls = 0
	state.failItems = false
	state.libraryId = 'lib'
})
it('reports library metadata request failure without an unhandled rejection', async () => {
	state.failItems = true
	render(<PodcastSearch libraryId="lib" />)
	expect((await screen.findByRole('alert')).textContent).toContain(
		'Library items unavailable',
	)
})
it('clears previous library matches when library changes', async () => {
	const view = render(<PodcastSearch libraryId="lib" />)
	const input = screen.getByLabelText('Podcast name or RSS URL')
	fireEvent.change(input, { target: { value: 'show' } })
	fireEvent.click(screen.getByRole('button', { name: 'Search' }))
	await screen.findAllByRole('link', { name: 'In library' })
	state.libraryId = 'other'
	view.rerender(<PodcastSearch libraryId="other" />)
	await screen.findByRole('button', { name: 'Search' })
	await new Promise((resolve) => setTimeout(resolve, 0))
	expect(screen.queryByRole('link', { name: 'In library' })).toBeNull()
	fireEvent.change(input, { target: { value: 'show' } })
	fireEvent.click(screen.getByRole('button', { name: 'Search' }))
	expect(
		await screen.findAllByRole('button', { name: 'Subscribe' }),
	).toHaveLength(2)
})
it('prefers matching feed URL over iTunes ID and uses iTunes ID as fallback', async () => {
	render(<PodcastSearch libraryId="lib" />)
	await screen.findByText('Find podcasts')
	fireEvent.change(screen.getByLabelText('Podcast name or RSS URL'), {
		target: { value: 'show' },
	})
	fireEvent.click(screen.getByRole('button', { name: 'Search' }))
	const links = await screen.findAllByRole('link', { name: 'In library' })
	expect(links.map((link) => link.getAttribute('href'))).toEqual([
		'/items/feed-match',
		'/items/itunes-match',
	])
})
