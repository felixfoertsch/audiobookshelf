import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UsersPage } from './users'

vi.mock('../../api', () => ({
	api: vi.fn((path: string) =>
		Promise.resolve(
			path === '/users'
				? { users: [] }
				: path === '/libraries'
					? { libraries: [] }
					: path === '/tags'
						? { tags: [] }
						: {},
		),
	),
	useAuth: Object.assign(
		(selector: (x: { user: { type: string } }) => unknown) =>
			selector({ user: { type: 'admin' } }),
		{ subscribe: vi.fn() },
	),
}))
describe('UsersPage', () => {
	it('renders accessible user form controls', () => {
		render(<UsersPage />)
		expect(screen.getByRole('heading', { name: 'Users' })).toBeTruthy()
		fireEvent.click(screen.getByRole('button', { name: 'Add user' }))
		expect(screen.getByRole('heading', { name: 'Add user' })).toBeTruthy()
		expect(screen.getByRole('textbox', { name: 'Username' })).toBeTruthy()
		expect(screen.getByRole('group', { name: 'Permissions' })).toBeTruthy()
	})
})
