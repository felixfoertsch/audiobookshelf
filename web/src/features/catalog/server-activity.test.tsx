import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useAuth } from '../../api'
import { ServerActivity, ServerActivityObserver } from './server-activity'

afterEach(() => {
	cleanup()
	useAuth.setState({ user: null, bootstrap: null })
	window.dispatchEvent(
		new CustomEvent('abs:socket', {
			detail: { event: 'disconnect', payload: null },
		}),
	)
})

describe('server activity observer', () => {
	it('retains events before panel mount and clears on auth change and socket reset', () => {
		const user = {
			id: 'admin-1',
			type: 'admin',
			username: 'Admin',
			accessToken: 'token',
		}
		useAuth.setState({ user, bootstrap: { Source: 'test' } })
		render(<ServerActivityObserver />)
		act(() => {
			window.dispatchEvent(
				new CustomEvent('abs:socket', {
					detail: {
						event: 'init',
						payload: { usersOnline: [{ id: 'u1', username: 'Listener' }] },
					},
				}),
			)
			window.dispatchEvent(
				new CustomEvent('abs:socket', {
					detail: {
						event: 'task_started',
						payload: { id: 't1', title: 'Scan' },
					},
				}),
			)
		})
		render(<ServerActivity />)
		expect(screen.getByText('Listener')).toBeTruthy()
		expect(screen.getByText(/Scan · Running/)).toBeTruthy()
		act(() =>
			window.dispatchEvent(
				new CustomEvent('abs:socket', {
					detail: { event: 'disconnect', payload: null },
				}),
			),
		)
		expect(screen.getByText('Waiting for server snapshot')).toBeTruthy()
		expect(screen.getByText('No task events received')).toBeTruthy()
		act(() => useAuth.setState({ user: { ...user, id: 'other' } }))
		expect(screen.queryByText('Listener')).toBeNull()
	})
})
