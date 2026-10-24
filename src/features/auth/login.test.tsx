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
import { Login } from '../../login'

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
	useAuth.setState({ serverStatus: null, authMethods: [], startupError: '' })
	useAuth.getState().set(null)
	history.replaceState(null, '', '/')
})
describe('native login forms', () => {
	it('refuses uninitialized upstream without setup controls or mutations', () => {
		useAuth.setState({ serverStatus: { isInit: false } })
		const fetcher = vi.spyOn(globalThis, 'fetch')
		render(<Login />)
		expect(screen.getByRole('alert')).toHaveTextContent(
			'Upstream server must be initialized separately.',
		)
		expect(screen.queryByLabelText('Username')).toBeNull()
		expect(fetcher).not.toHaveBeenCalled()
	})
	it('renders server failure and retry instead of misleading sign-in controls', () => {
		useAuth.setState({ startupError: 'Network unavailable' })
		render(<Login />)
		expect(screen.getByRole('alert')).toHaveTextContent('Network unavailable')
		expect(
			screen.getByRole('button', { name: 'Retry connection' }),
		).toBeTruthy()
		expect(screen.queryByLabelText('Username')).toBeNull()
	})
	it('shows only configured OpenID method and server button text', () => {
		useAuth.setState({
			authMethods: ['openid'],
			serverStatus: {
				isInit: true,
				authFormData: { authOpenIDButtonText: 'Company sign in' },
			},
		})
		render(<Login />)
		expect(screen.queryByLabelText('Username')).toBeNull()
		expect(screen.getByRole('button', { name: 'Company sign in' })).toBeTruthy()
	})
	it('allows empty local passwords and surfaces native text errors', async () => {
		useAuth.setState({ authMethods: ['local'], serverStatus: { isInit: true } })
		const fetcher = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response('Invalid credentials', { status: 401 }))
		render(<Login />)
		fireEvent.change(screen.getByLabelText('Username'), {
			target: { value: 'guest' },
		})
		fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
		await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
		expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({
			username: 'guest',
			password: '',
		})
		expect(await screen.findByRole('alert')).toHaveTextContent(
			'Invalid credentials',
		)
	})
})
