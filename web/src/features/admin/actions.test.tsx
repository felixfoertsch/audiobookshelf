import '@testing-library/jest-dom/vitest'
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../../api'
import { SessionsPage } from './sessions'
import { Stats } from './stats'
import { UsersPage } from './users'

vi.mock('@tanstack/react-router', () => ({
	Link: ({ children }: { children: React.ReactNode }) => (
		<span>{children}</span>
	),
	useNavigate: () => vi.fn(),
	useRouter: () => ({ invalidate: vi.fn() }),
}))

afterEach(() => {
	cleanup()
	useAuth.setState({ user: null, initialized: false, loading: true })
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
})

describe('admin action outcomes', () => {
	it('creates user through API', async () => {
		const user = { id: 'u1', username: 'Reader', type: 'user', permissions: {} }
		const calls: Array<[string, RequestInit | undefined]> = []
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
			const path = String(input).replace(/^\/api/, '')
			const result = await (async () => {
				calls.push([path, init])
				if (path === '/users' && init?.method === 'POST')
					return { user: { ...user, username: 'Created' } }
				if (path === '/users')
					return {
						users: calls.some(
							([p, i]) => p === '/users' && i?.method === 'POST',
						)
							? [{ ...user, username: 'Created' }]
							: [user],
					}
				if (path === '/libraries') return { libraries: [] }
				if (path === '/tags') return { tags: [] }
				if (init?.method === 'POST')
					return { user: { ...user, username: 'Created' } }
				return init?.method === 'PATCH'
					? { success: true, user: { ...user, username: 'Updated' } }
					: { ...user }
			})()
			return Response.json(result)
		})
		useAuth.setState({
			user: { id: 'admin', username: 'admin', accessToken: 'x', type: 'admin' },
			initialized: true,
			loading: false,
		})
		render(<UsersPage />)
		fireEvent.click(screen.getByRole('button', { name: 'Add user' }))
		fireEvent.change(screen.getByLabelText('Username'), {
			target: { value: 'Created' },
		})
		fireEvent.change(screen.getByLabelText('Password'), {
			target: { value: 'pw' },
		})
		fireEvent.click(screen.getByRole('button', { name: 'Save user' }))
		await waitFor(() =>
			expect(
				calls.some(([p, i]) => p === '/users' && i?.method === 'POST'),
			).toBe(true),
		)
		await waitFor(() =>
			expect(screen.queryByRole('button', { name: 'Save user' })).toBeNull(),
		)
		await screen.findByText('Created — user')
	})

	it('selects sessions and submits bulk delete', async () => {
		useAuth.setState({
			user: { id: 'admin', username: 'admin', accessToken: 'x', type: 'admin' },
			initialized: true,
			loading: false,
		})
		const calls: Array<[string, RequestInit | undefined]> = []
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
			const path = String(input)
			calls.push([path, init])
			return Response.json(
				path.includes('/sessions?')
					? {
							sessions: [{ id: 's1', displayTitle: 'Book' }],
							page: 0,
							numPages: 1,
						}
					: path.endsWith('/users')
						? { users: [] }
						: {},
			)
		})
		vi.spyOn(window, 'confirm').mockReturnValue(true)
		render(<SessionsPage />)
		fireEvent.click(
			await screen.findByRole('checkbox', { name: 'Select Book' }),
		)
		fireEvent.click(screen.getByRole('button', { name: 'Delete selected (1)' }))
		await waitFor(() =>
			expect(
				calls.some(
					([p, i]) =>
						p.includes('/sessions/batch/delete') && i?.method === 'POST',
				),
			).toBe(true),
		)
		expect(
			JSON.parse(
				String(
					calls.find(([p]) => p.includes('/sessions/batch/delete'))?.[1]?.body,
				),
			),
		).toEqual({ sessions: ['s1'] })
	})

	it('renders recent statistics item', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			Response.json({
				totalTime: 10,
				days: {},
				recentSessions: [
					{
						id: 's',
						updatedAt: 1792490400000,
						timeListening: 60,
						displayTitle: 'Stats book',
						mediaMetadata: { title: 'Stats book' },
					},
				],
			}),
		)
		render(<Stats />)
		await screen.findByText(/Stats book/)
		expect(fetchMock).toHaveBeenCalled()
	})
})
