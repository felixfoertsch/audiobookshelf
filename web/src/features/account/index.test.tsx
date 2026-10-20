import '@testing-library/jest-dom/vitest'
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, logout } from '../../api'
import { Account } from './index'

const auth = vi.hoisted(() => ({
	user: {
		id: 'u1',
		username: 'reader',
		accessToken: 'token',
		type: 'user',
		permissions: { createEreader: true },
	},
}))
vi.mock('../../api', () => ({
	api: vi.fn(),
	logout: vi.fn(),
	useAuth: Object.assign(
		(selector: (state: unknown) => unknown) =>
			selector({
				user: auth.user,
				authMethods: ['local'],
			}),
		{ getState: vi.fn() },
	),
}))
vi.mock('../../shared/components/ui/button', () => ({
	Button: (
		props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string },
	) => <button {...props} />,
}))
const apiMock = vi.mocked(api)
beforeEach(() => {
	localStorage.clear()
	auth.user = {
		id: 'u1',
		username: 'reader',
		accessToken: 'token',
		type: 'user',
		permissions: { createEreader: true },
	}
	apiMock.mockReset()
	vi.mocked(logout).mockReset()
	vi.mocked(logout).mockResolvedValue(undefined)
	window.confirm = vi.fn(() => true)
	apiMock.mockImplementation(async (path: string) => {
		if (path === '/authorize')
			return {
				ereaderDevices: [
					{
						name: 'Existing',
						email: 'reader@example.test',
						availabilityOption: 'specificUsers',
						users: ['u1'],
					},
				],
			} as never
		if (path === '/me/ereader-devices') return { ereaderDevices: [] } as never
		if (path.startsWith('/me/sessions'))
			return { sessions: [], page: 0, numPages: 0 } as never
		return {} as never
	})
})
afterEach(cleanup)
describe('Account native contracts', () => {
	it('loads authorized devices before edits and preserves them in write payload', async () => {
		render(<Account />)
		await waitFor(() =>
			expect(
				screen.getByRole('button', { name: 'Add device' }),
			).not.toBeDisabled(),
		)
		fireEvent.click(screen.getByRole('button', { name: 'Add device' }))
		fireEvent.change(screen.getByLabelText('Name'), {
			target: { value: 'New device' },
		})
		fireEvent.change(screen.getByLabelText('Email'), {
			target: { value: 'new@example.test' },
		})
		fireEvent.click(screen.getByRole('button', { name: 'Save device' }))
		await waitFor(() =>
			expect(apiMock).toHaveBeenCalledWith(
				'/me/ereader-devices',
				expect.anything(),
				expect.objectContaining({
					method: 'POST',
					body: expect.stringContaining('Existing'),
				}),
			),
		)
	})
	it('allows an empty root password field and calls parent logout(allDevices=true)', async () => {
		auth.user = {
			id: 'root',
			username: 'root',
			accessToken: 'token',
			type: 'root',
			permissions: { createEreader: false },
		}
		render(<Account />)
		expect(screen.getByLabelText('Current password')).not.toHaveAttribute(
			'required',
		)
		await waitFor(() =>
			expect(
				screen.getByRole('button', { name: 'Sign out all devices' }),
			).not.toBeDisabled(),
		)
		fireEvent.click(
			screen.getByRole('button', { name: 'Sign out all devices' }),
		)
		await waitFor(() => expect(logout).toHaveBeenCalledWith(true))
	})
	it('sends native password keys and displays mutation failure inline', async () => {
		apiMock.mockImplementation(async (path: string) => {
			if (path === '/me/password') throw new Error('Password is incorrect')
			if (path === '/authorize') return { ereaderDevices: [] } as never
			return { sessions: [], page: 0, numPages: 0 } as never
		})
		render(<Account />)
		fireEvent.change(screen.getByLabelText('Current password'), {
			target: { value: 'old' },
		})
		fireEvent.change(screen.getByLabelText('New password'), {
			target: { value: 'new' },
		})
		fireEvent.change(screen.getByLabelText('Confirm password'), {
			target: { value: 'new' },
		})
		await waitFor(() =>
			expect(
				screen.getByRole('button', { name: 'Change password' }),
			).not.toBeDisabled(),
		)
		fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
		await waitFor(() =>
			expect(apiMock).toHaveBeenCalledWith('/me/password', expect.anything(), {
				method: 'PATCH',
				body: JSON.stringify({ password: 'old', newPassword: 'new' }),
			}),
		)
		expect(await screen.findByRole('alert')).toHaveTextContent(
			'Password is incorrect',
		)
	})
	it('shows session load failure without claiming empty success', async () => {
		apiMock.mockRejectedValue(new Error('Network unavailable'))
		render(<Account />)
		expect(
			(await screen.findAllByRole('alert')).some((node) =>
				node.textContent?.includes('Network unavailable'),
			),
		).toBe(true)
		expect(screen.queryByText('No active sessions')).toBeNull()
		expect(screen.getByRole('button', { name: 'Add device' })).toBeDisabled()
	})
	it('uses native locale code and options', () => {
		render(<Account />)
		expect(
			screen.getByRole('option', { name: 'Português (Brasil)' }),
		).toHaveValue('pt-br')
	})
})

it('isolates equal-permission account changes and refuses device edits until new account load finishes', async () => {
	const { rerender } = render(<Account />)
	await screen.findByText(/Existing/)
	let resolve!: (value: unknown) => void
	apiMock.mockImplementation(async (path: string, _schema, init) => {
		if (path === '/me/ereader-devices')
			return JSON.parse(String(init?.body)) as never
		if (path === '/authorize')
			return (await new Promise<unknown>((done) => {
				resolve = done
			})) as never
		return { sessions: [], page: 0, numPages: 0 } as never
	})
	auth.user = { ...auth.user, id: 'u2', username: 'second' }
	rerender(<Account />)
	expect(screen.queryByText(/Existing/)).toBeNull()
	expect(screen.getByRole('button', { name: 'Add device' })).toBeDisabled()
	resolve({
		ereaderDevices: [
			{
				name: 'Second device',
				email: 'second@example.test',
				users: ['u2'],
				availabilityOption: 'specificUsers',
			},
		],
	})
	await waitFor(() =>
		expect(
			screen.getByRole('button', { name: 'Add device' }),
		).not.toBeDisabled(),
	)
	expect(screen.getByText(/Second device/)).toBeTruthy()
	fireEvent.click(screen.getByRole('button', { name: 'Add device' }))
	fireEvent.change(screen.getByLabelText('Name'), {
		target: { value: 'New B device' },
	})
	fireEvent.change(screen.getByLabelText('Email'), {
		target: { value: 'new-b@example.test' },
	})
	fireEvent.click(screen.getByRole('button', { name: 'Save device' }))
	await waitFor(() =>
		expect(
			apiMock.mock.calls.some(([path]) => path === '/me/ereader-devices'),
		).toBe(true),
	)
	const request = apiMock.mock.calls.find(
		([path]) => path === '/me/ereader-devices',
	)
	expect(JSON.parse(String(request?.[2]?.body))).toEqual({
		ereaderDevices: [
			{
				name: 'Second device',
				email: 'second@example.test',
				users: ['u2'],
				availabilityOption: 'specificUsers',
			},
			{
				name: 'New B device',
				email: 'new-b@example.test',
				users: ['u2'],
				availabilityOption: 'specificUsers',
			},
		],
	})
})

it('ignores delayed old-account device load after equal-permission identity switch', async () => {
	const pending: Array<(value: unknown) => void> = []
	apiMock.mockImplementation(async (path: string) => {
		if (path === '/authorize')
			return (await new Promise<unknown>((done) => pending.push(done))) as never
		return { sessions: [], page: 0, numPages: 0 } as never
	})
	const view = render(<Account />)
	await waitFor(() => expect(pending).toHaveLength(1))
	auth.user = { ...auth.user, id: 'B', username: 'second' }
	view.rerender(<Account />)
	await waitFor(() => expect(pending).toHaveLength(2))
	pending[0]({
		ereaderDevices: [
			{ name: 'Private A', email: 'a@example.test', users: ['u1'] },
		],
	})
	expect(screen.getByRole('button', { name: 'Add device' })).toBeDisabled()
	pending[1]({
		ereaderDevices: [
			{ name: 'Private B', email: 'b@example.test', users: ['B'] },
		],
	})
	await screen.findByText(/Private B/)
	expect(screen.queryByText(/Private A/)).toBeNull()
})
