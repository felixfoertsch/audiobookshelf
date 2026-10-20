import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../../api'
import { Login } from '../../login'

const launch = vi.hoisted(() => vi.fn())
vi.mock('../../api', async (original) => ({
	...(await original<typeof import('../../api')>()),
	startOidcLogin: launch,
}))
afterEach(() => {
	cleanup()
	launch.mockClear()
	useAuth.getState().set(null)
	useAuth.setState({ serverStatus: null, authMethods: [], startupError: '' })
	history.replaceState(null, '', '/')
})
describe('OIDC callback gate', () => {
	it('never relaunches OIDC for restored authenticated callback', async () => {
		useAuth.setState({
			user: { id: 'u', username: 'reader', accessToken: 'token' },
			initialized: true,
			defaultLibraryId: 'library',
			authMethods: ['openid'],
			serverStatus: {
				isInit: true,
				authFormData: { authOpenIDAutoLaunch: true },
			},
		})
		render(<Login />)
		await waitFor(() => expect(launch).not.toHaveBeenCalled())
	})
	it('launches once only after anonymous status resolves', () => {
		useAuth.setState({
			authMethods: ['openid'],
			serverStatus: {
				isInit: true,
				authFormData: { authOpenIDAutoLaunch: true },
			},
		})
		const view = render(<Login />)
		view.rerender(<Login />)
		expect(launch).toHaveBeenCalledTimes(1)
	})
})
