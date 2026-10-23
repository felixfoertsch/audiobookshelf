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
import { Notifications } from './notifications'

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
	useAuth.getState().set(null)
})
describe('notifications', () => {
	it('opens edit form, saves selected identity, cancels without writing', async () => {
		useAuth.setState({
			user: {
				id: 'admin',
				username: 'admin',
				accessToken: 'fixture',
				type: 'admin',
			},
		})
		const payload = {
			settings: {
				appriseApiUrl: null,
				maxNotificationQueue: 10,
				maxFailedAttempts: 3,
				notifications: [
					{
						id: 'n1',
						eventName: 'onTest',
						urls: ['json://example.test'],
						enabled: true,
					},
				],
			},
			data: { events: [{ name: 'onTest' }] },
		}
		const fetcher = vi
			.spyOn(globalThis, 'fetch')
			.mockImplementation(async (_input, init) =>
				Response.json(init?.method ? {} : payload),
			)
		render(<Notifications />)
		fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
		expect(
			screen.getByRole('button', { name: 'Save notification' }),
		).toBeInTheDocument()
		fireEvent.click(screen.getByRole('button', { name: 'Save notification' }))
		await waitFor(() =>
			expect(fetcher).toHaveBeenCalledWith(
				'/api/notifications/n1',
				expect.objectContaining({
					method: 'PATCH',
					body: expect.stringContaining('"id":"n1"'),
				}),
			),
		)
		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
		expect(
			screen.queryByRole('button', { name: 'Save notification' }),
		).toBeNull()
	})
	it('rejects invalid numeric settings without writing', async () => {
		useAuth.setState({
			user: { id: 'u', username: 'admin', accessToken: 'x', type: 'admin' },
			initialized: true,
			loading: false,
		})
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			Response.json({
				settings: {
					appriseApiUrl: 'https://apprise.test',
					maxNotificationQueue: 10,
					maxFailedAttempts: 3,
					notifications: [],
				},
				data: { events: [{ name: 'onTest' }] },
			}),
		)
		render(<Notifications />)
		await screen.findByRole('button', { name: 'Save settings' })
		fireEvent.change(screen.getByLabelText('Maximum queue size'), {
			target: { value: '0' },
		})
		fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
		expect(await screen.findByRole('alert')).toHaveTextContent(
			'positive integers',
		)
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
	})
})
