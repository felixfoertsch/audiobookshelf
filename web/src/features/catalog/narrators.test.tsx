import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../../api'
import { NarratorsPage } from './browse'
import { saveNarrator } from './browse-api'

vi.mock('./browse-api', async (load) => ({
	...(await load<typeof import('./browse-api')>()),
	saveNarrator: vi.fn(),
}))
const router = vi.hoisted(() => ({ invalidate: vi.fn() }))
vi.mock('@tanstack/react-router', () => ({
	useRouter: () => router,
	Link: ({
		children,
		to,
		search,
	}: {
		children: React.ReactNode
		to: string
		search?: Record<string, string>
	}) => <a href={`${to}?filter=${search?.filter || ''}`}>{children}</a>,
}))
const data = { narrators: [{ id: 'n1', name: 'Narrator One', numBooks: 3 }] }
afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
	useAuth.getState().set(null)
})
describe('narrator actions', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		useAuth.setState({
			user: {
				id: 'admin',
				username: 'admin',
				accessToken: 'fixture',
				type: 'admin',
			},
		})
	})
	it('narrator book-count link targets matching narrator filter', () => {
		render(<NarratorsPage library="lib" data={data} />)
		expect(
			screen.getByRole('link', { name: 'Narrator One' }).getAttribute('href'),
		).toBe('/library/$library/bookshelf?filter=narrators.n1')
	})
	it('edits and saves narrator name, then refreshes data', async () => {
		render(<NarratorsPage library="lib" data={data} />)
		fireEvent.click(screen.getByRole('button', { name: 'Edit Narrator One' }))
		fireEvent.change(screen.getByLabelText('New narrator name'), {
			target: { value: 'Updated' },
		})
		fireEvent.click(screen.getByRole('button', { name: 'Save' }))
		await waitFor(() =>
			expect(saveNarrator).toHaveBeenCalledWith('lib', 'n1', 'Updated'),
		)
		await waitFor(() => expect(router.invalidate).toHaveBeenCalled())
	})
	it('cancels without saving, rejects cancelled removal, confirms removal', async () => {
		const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
		render(<NarratorsPage library="lib" data={data} />)
		fireEvent.click(screen.getByRole('button', { name: 'Edit Narrator One' }))
		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
		expect(saveNarrator).not.toHaveBeenCalled()
		fireEvent.click(screen.getByRole('button', { name: 'Remove Narrator One' }))
		expect(saveNarrator).not.toHaveBeenCalled()
		confirm.mockReturnValue(true)
		fireEvent.click(screen.getByRole('button', { name: 'Remove Narrator One' }))
		await waitFor(() =>
			expect(saveNarrator).toHaveBeenCalledWith('lib', 'n1', undefined),
		)
	})
	it('hides mutations without update permission and surfaces save failure', async () => {
		useAuth.setState({
			user: {
				id: 'listener',
				username: 'listener',
				accessToken: 'fixture',
				type: 'user',
			},
		})
		const view = render(<NarratorsPage library="lib" data={data} />)
		expect(
			screen.queryByRole('button', { name: 'Edit Narrator One' }),
		).toBeNull()
		useAuth.setState({
			user: {
				id: 'admin',
				username: 'admin',
				accessToken: 'fixture',
				type: 'admin',
			},
		})
		view.rerender(<NarratorsPage library="lib" data={data} />)
		vi.mocked(saveNarrator).mockRejectedValueOnce(new Error('Save failed'))
		fireEvent.click(screen.getByRole('button', { name: 'Edit Narrator One' }))
		fireEvent.click(screen.getByRole('button', { name: 'Save' }))
		expect((await screen.findByRole('alert')).textContent).toBe('Save failed')
	})
})
