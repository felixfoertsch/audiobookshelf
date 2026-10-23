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
import { UserPage, UsersPage } from './users'

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

	it('edits and deletes user with exact requests and confirmation outcomes', async () => {
		const existing = {
			id: 'u1',
			username: 'Reader',
			type: 'user',
			permissions: {},
		}
		const calls: Array<[string, RequestInit | undefined]> = []
		let deleted = false
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
			const path = String(input).replace(/^\/api/, '')
			calls.push([path, init])
			if (path === '/users')
				return Response.json({ users: deleted ? [] : [existing] })
			if (path === '/users/u1' && init?.method === 'PATCH')
				return Response.json({
					success: true,
					user: { ...existing, username: 'Updated' },
				})
			if (path === '/users/u1' && init?.method === 'DELETE') {
				deleted = true
				return Response.json({})
			}
			if (path === '/users/u1') return Response.json(existing)
			if (path === '/libraries') return Response.json({ libraries: [] })
			if (path === '/tags') return Response.json({ tags: [] })
			return Response.json({})
		})
		useAuth.setState({
			user: { id: 'admin', username: 'admin', accessToken: 'x', type: 'admin' },
			initialized: true,
			loading: false,
		})
		vi.spyOn(window, 'confirm').mockReturnValue(false)
		render(<UsersPage />)
		fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
		fireEvent.change(await screen.findByLabelText('Username'), {
			target: { value: 'Updated' },
		})
		fireEvent.click(screen.getByRole('button', { name: 'Save user' }))
		await waitFor(() =>
			expect(
				calls.some(([p, i]) => p === '/users/u1' && i?.method === 'PATCH'),
			).toBe(true),
		)
		const patch = calls.find(
			([p, i]) => p === '/users/u1' && i?.method === 'PATCH',
		)
		expect(JSON.parse(String(patch?.[1]?.body))).toEqual({
			username: 'Updated',
			email: '',
			type: 'user',
			isActive: true,
			permissions: {
				download: false,
				update: false,
				delete: false,
				upload: false,
				createEreader: false,
				accessExplicitContent: false,
				accessAllLibraries: false,
				accessAllTags: false,
				selectedTagsNotAccessible: false,
			},
			librariesAccessible: [],
			itemTagsSelected: [],
		})
		fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
		expect(
			calls.some(([p, i]) => p === '/users/u1' && i?.method === 'DELETE'),
		).toBe(false)
		vi.mocked(window.confirm).mockReturnValue(true)
		fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
		await waitFor(() =>
			expect(
				calls.some(([p, i]) => p === '/users/u1' && i?.method === 'DELETE'),
			).toBe(true),
		)
		await waitFor(() =>
			expect(calls.filter(([p]) => p === '/users').length).toBeGreaterThan(1),
		)
		expect(calls.some(([p, i]) => p === '/users' && !i?.method)).toBe(true)
	})

	it('unlinks OpenID only after confirmation with exact endpoint and method', async () => {
		const calls: Array<[string, RequestInit | undefined]> = []
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
			const path = String(input).replace(/^\/api/, '')
			calls.push([path, init])
			if (path === '/users/u1')
				return Response.json({
					id: 'u1',
					username: 'Reader',
					type: 'user',
					hasOpenIDLink: true,
					permissions: {},
				})
			return Response.json({})
		})
		useAuth.setState({
			user: { id: 'admin', username: 'admin', accessToken: 'x', type: 'admin' },
			initialized: true,
			loading: false,
		})
		window.history.replaceState({}, '', '/config/users/u1')
		vi.spyOn(window, 'confirm').mockReturnValue(false)
		render(<UserPage />)
		await screen.findByRole('heading', { name: 'Reader' })
		expect(screen.getByRole('button', { name: 'Unlink OpenID' })).toBeTruthy()
		fireEvent.click(screen.getByRole('button', { name: 'Unlink OpenID' }))
		expect(
			calls.some(
				([p, i]) => p === '/users/u1/openid-unlink' && i?.method === 'PATCH',
			),
		).toBe(false)
		vi.mocked(window.confirm).mockReturnValue(true)
		fireEvent.click(screen.getByRole('button', { name: 'Unlink OpenID' }))
		await waitFor(() =>
			expect(
				calls.some(
					([p, i]) => p === '/users/u1/openid-unlink' && i?.method === 'PATCH',
				),
			).toBe(true),
		)
		expect(
			calls.find(([p]) => p === '/users/u1/openid-unlink')?.[1]?.method,
		).toBe('PATCH')
	})

	it('session filter, sort direction, and paging load exact query outcomes', async () => {
		useAuth.setState({
			user: { id: 'admin', username: 'admin', accessToken: 'x', type: 'admin' },
			initialized: true,
			loading: false,
		})
		const calls: string[] = []
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const path = String(input)
			calls.push(path)
			if (path.endsWith('/users'))
				return Response.json({ users: [{ id: 'u1', username: 'Reader' }] })
			return Response.json({
				sessions: [{ id: 's1', displayTitle: 'Book' }],
				page: Number(
					new URL(path, location.origin).searchParams.get('page') || 0,
				),
				numPages: 2,
			})
		})
		render(<SessionsPage />)
		await screen.findByRole('checkbox', { name: 'Select Book' })
		fireEvent.change(screen.getByLabelText('User filter'), {
			target: { value: 'u1' },
		})
		await waitFor(() =>
			expect(calls).toContain(
				'/api/sessions?page=0&itemsPerPage=10&sort=updatedAt&desc=1&user=u1',
			),
		)
		fireEvent.change(screen.getByLabelText('Sort'), {
			target: { value: 'timeListening' },
		})
		await waitFor(() =>
			expect(calls).toContain(
				'/api/sessions?page=0&itemsPerPage=10&sort=timeListening&desc=1&user=u1',
			),
		)
		fireEvent.click(screen.getByRole('button', { name: 'Descending' }))
		await waitFor(() =>
			expect(calls).toContain(
				'/api/sessions?page=0&itemsPerPage=10&sort=timeListening&desc=0&user=u1',
			),
		)
		fireEvent.click(screen.getByRole('button', { name: 'Next' }))
		await waitFor(() =>
			expect(calls).toContain(
				'/api/sessions?page=1&itemsPerPage=10&sort=timeListening&desc=0&user=u1',
			),
		)
	})

	it('loads selected personal and server year statistics and refreshes both', async () => {
		useAuth.setState({
			user: {
				id: 'admin',
				username: 'admin',
				accessToken: 'x',
				type: 'admin',
				createdAt: new Date(new Date().getFullYear() - 1, 0, 1).getTime(),
			},
			initialized: true,
			loading: false,
		})
		const paths: string[] = []
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const path = String(input)
			paths.push(path)
			if (/\/api\/stats\/year\//.test(path))
				return Response.json({
					numListeningSessions: 2,
					numBooksAdded: 1,
					numAuthorsAdded: 1,
					totalListeningTime: 60,
					numBooks: 4,
					topAuthors: [],
					topGenres: [],
				})
			if (path.includes('/me/stats/year/'))
				return Response.json({
					totalListeningTime: 60,
					totalBookListeningTime: 30,
					totalPodcastListeningTime: 30,
					numBooksFinished: 1,
					numBooksListened: 2,
					topAuthors: [],
					topGenres: [],
					mostListenedMonth: null,
				})
			return Response.json({ totalTime: 0, days: {}, recentSessions: [] })
		})
		render(<Stats />)
		fireEvent.click(screen.getByRole('button', { name: 'Show year in review' }))
		const currentYear = new Date().getFullYear()
		await screen.findByText(`${currentYear} listening summary`)
		expect(paths).toContain(`/api/me/stats/year/${currentYear}`)
		expect(paths).toContain(`/api/stats/year/${currentYear}`)
		fireEvent.click(
			screen.getByRole('button', { name: 'Refresh personal review' }),
		)
		await waitFor(() =>
			expect(
				paths.filter((path) => path === `/api/me/stats/year/${currentYear}`)
					.length,
			).toBe(2),
		)
		fireEvent.click(
			screen.getByRole('button', { name: 'Refresh server review' }),
		)
		await waitFor(() =>
			expect(
				paths.filter((path) => path === `/api/stats/year/${currentYear}`)
					.length,
			).toBe(2),
		)
		const year = screen.getByLabelText('Year')
		fireEvent.change(year, { target: { value: String(currentYear - 1) } })
		await waitFor(() =>
			expect(paths).toContain(`/api/me/stats/year/${currentYear - 1}`),
		)
	})

	it('shows no OpenID link action because linking is not provided on user detail', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			if (String(input).includes('/listening-stats'))
				return Response.json({ totalTime: 0 })
			return Response.json({
				id: 'u1',
				username: 'Reader',
				type: 'user',
				hasOpenIDLink: false,
				permissions: {},
			})
		})
		useAuth.setState({
			user: { id: 'admin', username: 'admin', accessToken: 'x', type: 'admin' },
			initialized: true,
			loading: false,
		})
		window.history.replaceState({}, '', '/config/users/u1')
		render(<UserPage />)
		await screen.findByRole('heading', { name: 'Reader' })
		expect(screen.queryByRole('button', { name: /OpenID/i })).toBeNull()
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
