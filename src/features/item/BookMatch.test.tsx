import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BookMatch } from './BookMatch'

const mock = vi.hoisted(() => ({
	api: vi.fn(),
	user: { id: 'u', permissions: { update: true } },
}))
vi.mock('../../api', () => ({
	api: mock.api,
	useAuth: Object.assign(
		(select: (state: { user: typeof mock.user }) => unknown) =>
			select({ user: mock.user }),
		{ getState: () => ({ user: mock.user }) },
	),
}))
afterEach(() => {
	cleanup()
	vi.clearAllMocks()
	mock.user = { id: 'u', permissions: { update: true } }
})
const providers = {
	providers: {
		books: [
			{ value: 'google', text: 'Google' },
			{ value: 'openlibrary', text: 'Open Library' },
		],
	},
}
function setup(
	searchResult: unknown = [
		{
			title: 'Found',
			author: 'Writer',
			cover: 'https://example.test/cover.jpg',
			series: [{ series: 'Saga', sequence: 2 }],
			explicit: true,
			abridged: false,
		},
	],
) {
	mock.api.mockImplementation(
		async (path: string, _schema: unknown, init?: RequestInit) => {
			if (path === '/api/search/providers') return providers
			if (path.startsWith('/api/search/books?')) return searchResult
			if (init?.method === 'PATCH') return { updated: true }
			throw new Error(path)
		},
	)
	const onApplied = vi.fn(async () => {})
	render(
		<BookMatch
			id="book/1"
			metadata={{ title: 'Draft' }}
			onApplied={onApplied}
		/>,
	)
	return onApplied
}
async function searchAndSelect(expectResult = true) {
	await screen.findByLabelText('Provider')
	fireEvent.change(screen.getByLabelText('Search title'), {
		target: { value: 'Found' },
	})
	fireEvent.change(screen.getByLabelText('Provider'), {
		target: { value: 'openlibrary' },
	})
	fireEvent.click(screen.getByRole('button', { name: 'Search' }))
	if (expectResult)
		fireEvent.click(await screen.findByRole('button', { name: /Found/ }))
}
describe('BookMatch', () => {
	it('searches chosen provider without mutation and applies checked fields only', async () => {
		const onApplied = setup()
		await searchAndSelect()
		expect(
			mock.api.mock.calls.some(([path]) =>
				String(path).includes('provider=openlibrary'),
			),
		).toBe(true)
		fireEvent.change(screen.getByLabelText('Title'), {
			target: { value: 'Approved' },
		})
		fireEvent.change(screen.getByLabelText('Sequence'), {
			target: { value: '3' },
		})
		fireEvent.click(screen.getByLabelText('Apply Authors'))
		fireEvent.click(screen.getByLabelText('Explicit'))
		fireEvent.click(screen.getByLabelText('Abridged'))
		expect(
			mock.api.mock.calls.some((call) => call[2]?.method === 'PATCH'),
		).toBe(false)
		fireEvent.click(
			screen.getByRole('button', { name: 'Apply selected fields' }),
		)
		await waitFor(() => expect(onApplied).toHaveBeenCalledOnce())
		const patch = mock.api.mock.calls.find(
			(call) => call[2]?.method === 'PATCH',
		)
		expect(patch?.[0]).toBe('/api/items/book%2F1/media')
		expect(JSON.parse(String(patch?.[2]?.body))).toEqual({
			metadata: {
				title: 'Approved',
				series: [{ name: 'Saga', sequence: '3' }],
				explicit: false,
				abridged: true,
			},
			url: 'https://example.test/cover.jpg',
		})
	})
	it('treats null results as no results', async () => {
		setup(null)
		await searchAndSelect(false)
		expect(await screen.findByText('No results.')).toBeTruthy()
	})
	it('shows empty search and keeps review draft after failed apply', async () => {
		setup([])
		await searchAndSelect(false)
		expect(await screen.findByText('No results.')).toBeTruthy()
		cleanup()
		setup()
		await searchAndSelect()
		fireEvent.change(screen.getByLabelText('Title'), {
			target: { value: 'Retry draft' },
		})
		mock.api.mockRejectedValueOnce(new Error('Apply rejected'))
		fireEvent.click(
			screen.getByRole('button', { name: 'Apply selected fields' }),
		)
		expect((await screen.findByRole('alert')).textContent).toBe(
			'Apply rejected',
		)
		expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe(
			'Retry draft',
		)
	})
	it('shows lookup errors', async () => {
		setup()
		mock.api.mockImplementation(async (path: string) => {
			if (path === '/api/search/providers') return providers
			throw new Error('search unavailable')
		})
		await screen.findByLabelText('Provider')
		fireEvent.change(screen.getByLabelText('Search title'), {
			target: { value: 'x' },
		})
		fireEvent.click(screen.getByRole('button', { name: 'Search' }))
		expect((await screen.findByRole('alert')).textContent).toContain(
			'search unavailable',
		)
	})
	it('blocks search and apply without update permission', async () => {
		mock.user = { id: 'u', permissions: { update: false } }
		setup()
		await screen.findByLabelText('Provider')
		expect(screen.getByRole('alert').textContent).toContain(
			'Update permission required.',
		)
		expect(
			(screen.getByRole('button', { name: 'Search' }) as HTMLButtonElement)
				.disabled,
		).toBe(true)
	})
	it('discards in-flight lookup after identity changes', async () => {
		let resolve!: (value: unknown) => void
		mock.api.mockImplementation((path: string) =>
			path === '/api/search/providers'
				? Promise.resolve(providers)
				: new Promise((yes) => {
						resolve = yes
					}),
		)
		render(<BookMatch id="book/1" metadata={{}} onApplied={async () => {}} />)
		await screen.findByLabelText('Provider')
		fireEvent.change(screen.getByLabelText('Search title'), {
			target: { value: 'x' },
		})
		fireEvent.click(screen.getByRole('button', { name: 'Search' }))
		await waitFor(() => expect(resolve).toBeTypeOf('function'))
		mock.user = { id: 'other', permissions: { update: true } }
		resolve([{ title: 'Stale' }])
		await waitFor(() =>
			expect(screen.queryByRole('button', { name: /Stale/ })).toBeNull(),
		)
	})
})
