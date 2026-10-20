import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAuth } from '../../api'
import { Layout } from '../../routes/__root'

vi.mock('../../catalog', async (original) => ({
	...(await original<typeof import('../../catalog')>()),
	getLibraries: vi.fn(async () => ({
		libraries: [{ id: 'lib', name: 'Books', mediaType: 'book' }],
	})),
}))
vi.mock('../../player', () => ({
	Player: () => null,
	playEpisode: vi.fn(),
	playQueue: vi.fn(),
}))
afterEach(() => {
	cleanup()
	useAuth.setState({ user: null })
})
it.each([
	['/library/lib/search?q=first', 'first'],
	['/library/lib/podcast/search?q=provider', ''],
])('shell search query scoped to catalog route %s', async (path, value) => {
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
	const root = createRootRoute({ component: Layout })
	const routes = [
		'/library/$library/search',
		'/library/$library/podcast/search',
	].map((path) =>
		createRoute({
			getParentRoute: () => root,
			path,
			validateSearch: (search: Record<string, unknown>) => ({
				q: typeof search.q === 'string' ? search.q : '',
			}),
			component: () => <p>Results</p>,
		}),
	)
	const router = createRouter({
		routeTree: root.addChildren(routes),
		history: createMemoryHistory({ initialEntries: [path] }),
	})
	await router.load()
	render(<RouterProvider router={router} />)
	const input = await screen.findByRole('searchbox', { name: 'Search library' })
	expect((input as HTMLInputElement).value).toBe(value)
	if (value) {
		await router.navigate({
			to: '/library/$library/search',
			params: { library: 'lib' },
			search: { q: 'second' },
		})
		await vi.waitFor(() =>
			expect((input as HTMLInputElement).value).toBe('second'),
		)
	}
})
