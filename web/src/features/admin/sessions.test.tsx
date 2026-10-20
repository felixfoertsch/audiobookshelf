import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SessionsPage } from './sessions'

vi.mock('../../api', () => ({
	api: vi.fn().mockResolvedValue({
		sessions: [],
		numPages: 0,
		page: 0,
		users: [],
		shareSessions: [],
	}),
	useAuth: Object.assign(
		(selector: (x: { user: { type: string } }) => unknown) =>
			selector({ user: { type: 'admin' } }),
		{ subscribe: vi.fn() },
	),
}))
describe('SessionsPage', () => {
	it('renders selection, deletion, and sort controls', () => {
		render(<SessionsPage />)
		expect(
			screen.getByRole('heading', { name: 'Listening sessions' }),
		).toBeTruthy()
		expect(
			screen.getByRole('checkbox', { name: 'Select all sessions' }),
		).toBeTruthy()
		expect(screen.getByRole('button', { name: /Delete selected/ })).toBeTruthy()
		expect(screen.getByRole('combobox', { name: 'Sort' })).toBeTruthy()
	})
})
