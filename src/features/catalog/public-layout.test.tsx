import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../../api'
import { getLibraries } from '../../catalog'
import { Layout } from '../../routes/__root'

vi.mock('../../catalog', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../catalog')>()),
	getLibraries: vi.fn(),
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
describe('public shell', () => {
	it.each(['/login', '/share/example'])(
		'keeps authenticated %s blank beneath base path',
		async (path) => {
			Object.defineProperty(window, 'matchMedia', {
				configurable: true,
				value: () => ({
					matches: false,
					addEventListener() {},
					removeEventListener() {},
				}),
			})
			useAuth.setState({
				user: {
					id: 'user',
					username: 'User',
					type: 'root',
					accessToken: 'test',
				},
			})
			const root = createRootRoute({ component: Layout })
			const login = createRoute({
				getParentRoute: () => root,
				path: '/login',
				component: () => <p>Public login</p>,
			})
			const share = createRoute({
				getParentRoute: () => root,
				path: '/share/$slug',
				component: () => <p>Public share</p>,
			})
			const router = createRouter({
				routeTree: root.addChildren([login, share]),
				basepath: '',
				history: createMemoryHistory({ initialEntries: [path] }),
			})
			await router.load()
			render(<RouterProvider router={router} />)
			await waitFor(() =>
				expect(
					screen.getByText(path === '/login' ? 'Public login' : 'Public share'),
				).toBeTruthy(),
			)
			expect(screen.queryByText('Protected player')).toBeNull()
			expect(screen.queryByText('Audiobookshelf')).toBeNull()
			expect(screen.queryByRole('searchbox')).toBeNull()
			expect(screen.queryByRole('navigation', { name: 'Library' })).toBeNull()
			expect(screen.queryByRole('button', { name: /Menu$/ })).toBeNull()
			expect(getLibraries).not.toHaveBeenCalled()
			expect(screen.getAllByRole('main')).toHaveLength(1)
			expect(screen.getByRole('main').id).toBe('content')
		},
	)
})
