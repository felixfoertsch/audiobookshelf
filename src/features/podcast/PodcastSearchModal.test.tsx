import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from '@tanstack/react-router'
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PodcastSearchModal } from './PodcastSearchModal'

function testRouter(path: string) {
	const root = createRootRoute({
		component: () => (
			<main>
				{path}
				<PodcastSearchModal libraryId="podcasts" />
			</main>
		),
	})
	const route = createRoute({
		getParentRoute: () => root,
		path: '/',
		validateSearch: (search: Record<string, unknown>) => search,
		component: () => null,
	})
	const router = createRouter({
		routeTree: root.addChildren([route]),
		history: createMemoryHistory({
			initialEntries: [path, `${path}?addPodcast=1`],
		}),
	})
	return router
}

beforeEach(() => {
	Object.defineProperty(window, 'matchMedia', {
		configurable: true,
		value: vi.fn().mockReturnValue({
			matches: false,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		}),
	})
})
afterEach(cleanup)
it.each([
	'/library/podcasts',
	'/library/podcasts/podcast/latest',
	'/library/podcasts/podcast/search',
])('opens and closes over %s without changing route', async (path) => {
	const router = testRouter(path)
	await router.load()
	render(<RouterProvider router={router} />)
	expect(await screen.findByRole('dialog')).toBeTruthy()
	fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
	await waitFor(() => expect(router.state.location.pathname).toBe(path))
	await waitFor(() => expect(router.state.location.search).toEqual({}))
})
