import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import frontendPackage from '../../../package.json'
import { useAuth } from '../../api'
import { Layout } from '../../routes/__root'
import { BrowsePage, HomePage, SearchPage } from './browse'
import { browseSearch } from './browse-api'

vi.mock('../../catalog', async (original) => ({
	...(await original<typeof import('../../catalog')>()),
	getLibraries: vi.fn(async () => ({
		libraries: [{ id: 'lib', name: 'Books', mediaType: 'book' }],
	})),
}))
vi.mock('../../player', () => ({
	Player: () => <div>Protected player</div>,
	playEpisode: vi.fn(),
	playQueue: vi.fn(),
}))
afterEach(() => {
	cleanup()
	useAuth.setState({ user: null })
	vi.clearAllMocks()
})
it.each(['home', 'bookshelf', 'search', 'error'])(
	'root owns exactly one library navigation and search on %s',
	async (view) => {
		Object.defineProperty(window, 'matchMedia', {
			configurable: true,
			value: () => ({
				matches: false,
				addEventListener() {},
				removeEventListener() {},
			}),
		})
		useAuth.setState({
			user: { id: 'u', username: 'User', type: 'root', accessToken: 'test' },
		})
		const root = createRootRoute({
			component: () =>
				view === 'error' ? (
					<Layout
						routeError={{
							error: new Error('Fixture route failure'),
							reset: () => {},
						}}
					/>
				) : (
					<Layout />
				),
		})
		const route = createRoute({
			getParentRoute: () => root,
			path:
				view === 'home'
					? '/library/$library'
					: view === 'search'
						? '/library/$library/search'
						: '/library/$library/bookshelf',
			validateSearch: (search: Record<string, unknown>) => ({
				q: typeof search.q === 'string' ? search.q : '',
			}),
			component: () =>
				view === 'home' ? (
					<HomePage library="lib" podcast={false} data={[]} />
				) : view === 'search' ? (
					<SearchPage library="lib" q="query" data={{}} />
				) : (
					<BrowsePage
						library="lib"
						section=""
						podcast={false}
						search={browseSearch.parse({})}
						data={{ results: [], total: 0 }}
						filters={{}}
					/>
				),
		})
		const router = createRouter({
			routeTree: root.addChildren([route]),
			history: createMemoryHistory({
				initialEntries: [
					view === 'home'
						? '/library/lib'
						: view === 'search'
							? '/library/lib/search?q=query'
							: '/library/lib/bookshelf',
				],
			}),
		})
		await router.load()
		render(<RouterProvider router={router} />)
		await screen.findByRole('button', { name: 'Library: Books' })
		await waitFor(() =>
			expect(
				screen.getAllByRole('navigation', { name: 'Library' }),
			).toHaveLength(1),
		)
		expect(
			screen.getAllByRole('searchbox', { name: 'Search library' }),
		).toHaveLength(1)
		if (view !== 'error')
			expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
				'Books · ',
			)
		expect(screen.getByText('Discover')).toBeTruthy()
		expect(screen.getByText('Administration')).toBeTruthy()
		expect(screen.getByRole('contentinfo').textContent).toContain(
			`Modern frontend ${frontendPackage.version} ·`,
		)
		expect(screen.getAllByText('Protected player')).toHaveLength(1)
		expect(screen.getAllByRole('main')).toHaveLength(1)
		expect(
			screen
				.getByRole('link', { name: 'Skip to content' })
				.getAttribute('href'),
		).toBe('#content')
		expect(document.getElementById('content')?.closest('main')).toBe(
			screen.getByRole('main'),
		)
	},
)
