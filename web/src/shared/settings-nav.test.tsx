import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from '@tanstack/react-router'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { UserSettingsNav } from './settings-nav'

afterEach(cleanup)
it('user settings links retain URLs, current page and horizontal keyboard navigation', async () => {
	const root = createRootRoute({ component: UserSettingsNav })
	const route = createRoute({ getParentRoute: () => root, path: '/account' })
	const router = createRouter({
		routeTree: root.addChildren([route]),
		history: createMemoryHistory({ initialEntries: ['/account'] }),
	})
	await router.load()
	render(<RouterProvider router={router} />)
	const account = await screen.findByRole('link', {
		name: 'Account & preferences',
	})
	const stats = screen.getByRole('link', { name: 'Personal stats' })
	expect(account.getAttribute('href')).toBe('/account')
	expect(account.getAttribute('aria-current')).toBe('page')
	expect(stats.getAttribute('href')).toBe('/config/stats')
	account.focus()
	fireEvent.keyDown(account, { key: 'ArrowRight' })
	expect(document.activeElement).toBe(stats)
	fireEvent.keyDown(stats, { key: 'Home' })
	expect(document.activeElement).toBe(account)
	fireEvent.keyDown(account, { key: 'ArrowLeft' })
	expect(document.activeElement).toBe(stats)
	fireEvent.keyDown(stats, { key: 'End' })
	expect(document.activeElement).toBe(stats)
})
