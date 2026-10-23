import { afterEach, expect, it, vi } from 'vitest'
import { useAuth } from '../api'
import { getLibraries } from '../catalog'
import { Route } from './index'

vi.mock('../catalog', () => ({ getLibraries: vi.fn() }))
afterEach(() => {
	localStorage.clear()
	useAuth.setState({ defaultLibraryId: undefined })
	vi.clearAllMocks()
})
it.each([
	['current', 'second', 'first', 'second'],
	['default', null, 'second', 'second'],
	['first', 'missing', 'second', 'first'],
])(
	'root redirects to %s library',
	async (_branch, current, defaultLibraryId, expected) => {
		vi.mocked(getLibraries).mockResolvedValue({
			libraries: [{ id: 'first' }, { id: 'second' }],
		} as Awaited<ReturnType<typeof getLibraries>>)
		if (current) localStorage.setItem('currentLibraryId', current)
		useAuth.setState({ defaultLibraryId })
		const loader = Route.options.loader as () => Promise<unknown>
		await expect(loader()).rejects.toMatchObject({
			options: { to: '/library/$library', params: { library: expected } },
		})
	},
)
it('root without libraries redirects to oops with visible reason', async () => {
	vi.mocked(getLibraries).mockResolvedValue({ libraries: [] })
	const loader = Route.options.loader as () => Promise<unknown>
	await expect(loader()).rejects.toMatchObject({
		options: { to: '/oops', search: { message: 'No libraries' } },
	})
})
