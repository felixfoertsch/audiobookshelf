import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAuth } from '../../api'
import { Notifications } from './notifications'

describe('notifications', () => {
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
