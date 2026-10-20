import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LibrariesPage } from './libraries'

const requests: Array<{ path: string; init?: RequestInit }> = []
beforeEach(() => {
	requests.length = 0
	HTMLDialogElement.prototype.showModal = function () {
		this.setAttribute('open', '')
	}
	HTMLDialogElement.prototype.close = function () {
		this.removeAttribute('open')
	}
})
afterEach(() => cleanup())
vi.mock('../../api', () => ({
	useAuth: Object.assign(
		(selector: (s: { user: unknown }) => unknown) =>
			selector({ user: { type: 'admin' } }),
		{ getState: () => ({}) },
	),
	api: vi.fn(async (path: string, _schema: unknown, init?: RequestInit) => {
		requests.push({ path, init })
		if (path === '/search/providers')
			return { providers: { books: [], podcasts: [] } }
		if (path === '/authorize')
			return { serverSettings: { scannerDisableWatcher: false } }
		if (path === '/libraries')
			return {
				libraries: [
					{
						id: 'lib1',
						name: 'Books',
						mediaType: 'book',
						provider: 'google',
						folders: [{ fullPath: '/books' }],
						displayOrder: 1,
						settings: {
							metadataPrecedence: ['folderStructure'],
							autoScanCronExpression: null,
						},
					},
				],
			}
		return {}
	}),
}))
vi.mock('../../shared/components/ui/button', () => ({
	Button: ({
		children,
		...props
	}: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
		<button {...props}>{children}</button>
	),
}))

describe('LibrariesPage', () => {
	it('renders loaded libraries and guards a destructive delete behind confirmation', async () => {
		const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
		render(<LibrariesPage />)
		expect(
			await screen.findByRole('button', { name: 'Add library' }),
		).toBeTruthy()
		expect(await screen.findByText(/Books · book/)).toBeTruthy()
		fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
		expect(confirm).toHaveBeenCalledWith(
			'Delete library Books (lib1)? This cannot be undone.',
		)
		expect(requests.some((x) => x.init?.method === 'DELETE')).toBe(false)
		confirm.mockRestore()
	})
	it('validates new-library payload before sending', async () => {
		render(<LibrariesPage />)
		fireEvent.click(await screen.findByRole('button', { name: 'Add library' }))
		fireEvent.click(screen.getByRole('button', { name: 'Create' }))
		expect((await screen.findByRole('alert')).textContent).toContain(
			'Name and at least one folder are required.',
		)
		expect(
			requests.some(
				(x) => x.path === '/libraries' && x.init?.method === 'POST',
			),
		).toBe(false)
	})
})
