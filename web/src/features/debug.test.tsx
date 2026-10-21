import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useDebugEnabled } from 'debug-overlay/client'
import { afterEach, expect, it, vi } from 'vitest'
import { logout, useAuth } from '../api'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from '../shared/components/ui/dropdown-menu'
import { DebugIssues, DebugMenu } from './debug'

function Probe() {
	return (
		<>
			<DropdownMenu open>
				<DropdownMenuTrigger>Menu</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DebugMenu />
				</DropdownMenuContent>
			</DropdownMenu>
			<output>{String(useDebugEnabled())}</output>
		</>
	)
}
afterEach(() => {
	cleanup()
	act(() => useAuth.getState().set(null))
})
it('gates ordinary users and resets immediately on identity, role and logout changes', () => {
	act(() =>
		useAuth.getState().set({
			id: 'listener',
			username: 'Listener',
			accessToken: 'test',
			type: 'user',
		}),
	)
	render(<Probe />)
	fireEvent.click(screen.getByRole('menuitemcheckbox'))
	expect(screen.getByText('false')).toBeTruthy()
	act(() =>
		useAuth.getState().set({
			id: 'admin',
			username: 'Admin',
			accessToken: 'test',
			type: 'admin',
		}),
	)
	fireEvent.click(screen.getByRole('menuitemcheckbox'))
	expect(screen.getByText('true')).toBeTruthy()
	act(() =>
		useAuth.getState().set({
			id: 'admin',
			username: 'Admin',
			accessToken: 'refreshed',
			type: 'admin',
		}),
	)
	expect(screen.getByText('true')).toBeTruthy()
	act(() => window.dispatchEvent(new Event('abs:logout-start')))
	expect(screen.getByText('false')).toBeTruthy()
	fireEvent.click(screen.getByRole('menuitemcheckbox'))
	act(() =>
		useAuth
			.getState()
			.set({ id: 'root', username: 'Root', accessToken: 'test', type: 'root' }),
	)
	expect(screen.getByText('false')).toBeTruthy()
	fireEvent.click(screen.getByRole('menuitemcheckbox'))
	act(() =>
		useAuth
			.getState()
			.set({ id: 'root', username: 'Root', accessToken: 'test', type: 'user' }),
	)
	expect(screen.getByText('false')).toBeTruthy()
})

it('fresh dashboard explains disabled state and direct logout disables before network completes', async () => {
	act(() =>
		useAuth.getState().set({
			id: 'admin',
			username: 'Admin',
			accessToken: 'test',
			type: 'admin',
		}),
	)
	render(
		<>
			<Probe />
			<DebugIssues />
		</>,
	)
	expect(screen.getByText('Debug is disabled.')).toBeTruthy()
	fireEvent.click(screen.getByRole('menuitemcheckbox'))
	let finish!: (response: Response) => void
	vi.stubGlobal(
		'fetch',
		vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					finish = resolve
				}),
		),
	)
	let pending!: Promise<void>
	act(() => {
		pending = logout()
	})
	expect(screen.getByText('false')).toBeTruthy()
	await act(async () => {
		await Promise.resolve()
		finish(Response.json({ redirect_url: null }))
		await pending
	})
	vi.unstubAllGlobals()
})
