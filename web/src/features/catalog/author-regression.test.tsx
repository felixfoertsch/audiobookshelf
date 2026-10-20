import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { useAuth } from '../../api'
import { AuthorDetail } from './entities'
import { authorSchema } from './entities-api'

const router = vi.hoisted(() => ({ invalidate: vi.fn(), navigate: vi.fn() }))
vi.mock('@tanstack/react-router', () => ({
	useNavigate: () => router.navigate,
	useRouter: () => router,
	Link: ({ children }: { children: React.ReactNode }) => (
		<span>{children}</span>
	),
}))
afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
	router.invalidate.mockReset()
	router.navigate.mockReset()
})
const author = authorSchema.parse({
	id: 'original',
	libraryId: 'books',
	name: 'Original',
	description: 'Old description',
	asin: 'old',
	libraryItems: [],
})
function authorize() {
	useAuth.setState({
		user: {
			id: 'admin',
			username: 'admin',
			accessToken: 'fixture',
			permissions: { update: true },
		},
	})
}
test('successful native author match refetch updates editable snapshot before unrelated save', async () => {
	authorize()
	const updated = {
		...author,
		description: 'Matched description',
		asin: 'matched',
	}
	const fetcher = vi
		.spyOn(globalThis, 'fetch')
		.mockImplementation(async (path) =>
			Response.json(
				String(path).endsWith('/match')
					? { updated: true, author: updated }
					: { author: updated, updated: true },
			),
		)
	const view = render(<AuthorDetail author={author} />)
	router.invalidate.mockImplementation(async () => {
		view.rerender(<AuthorDetail author={updated} />)
	})
	fireEvent.click(screen.getByRole('button', { name: 'Match author' }))
	await screen.findByText('Author metadata updated')
	await waitFor(() =>
		expect(
			(screen.getByLabelText('Description') as HTMLTextAreaElement).value,
		).toBe('Matched description'),
	)
	fireEvent.change(screen.getByLabelText('Name'), {
		target: { value: 'Renamed' },
	})
	fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
	await waitFor(() =>
		expect(
			fetcher.mock.calls.some(([, init]) => init?.method === 'PATCH'),
		).toBe(true),
	)
	const body = fetcher.mock.calls.find(
		([, init]) => init?.method === 'PATCH',
	)?.[1]?.body
	expect(JSON.parse(String(body))).toEqual({
		name: 'Renamed',
		description: 'Matched description',
		asin: 'matched',
	})
})
test('native author merge navigates surviving author before invalidating deleted route', async () => {
	authorize()
	const survivor = { ...author, id: 'survivor' }
	const fetcher = vi
		.spyOn(globalThis, 'fetch')
		.mockResolvedValue(Response.json({ merged: true, author: survivor }))
	router.navigate.mockResolvedValue(undefined)
	render(<AuthorDetail author={author} />)
	fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
	await waitFor(() => expect(router.invalidate).toHaveBeenCalled())
	expect(router.navigate).toHaveBeenCalledWith({
		to: '/author/$id',
		params: { id: 'survivor' },
	})
	expect(router.navigate.mock.invocationCallOrder[0]).toBeLessThan(
		router.invalidate.mock.invocationCallOrder[0],
	)
	expect(
		fetcher.mock.calls.filter(
			([, init]) => !init?.method || init.method === 'GET',
		),
	).toEqual([])
})
