import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAuth } from '../../api'
import { Logs } from './logs'

describe('logs', () => {
	it('filters log entries by search text', async () => {
		useAuth.setState({
			user: { id: 'u', username: 'admin', accessToken: 'x', type: 'admin' },
			initialized: true,
			loading: false,
		})
		const socket = { emit: vi.fn() }
		Object.defineProperty(window, '__ABS_SOCKET__', {
			configurable: true,
			value: socket,
		})
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
			String(input).endsWith('/authorize')
				? Response.json({
						user: { type: 'admin' },
						serverSettings: { logLevel: 1 },
					})
				: Response.json({
						currentDailyLogs: [
							{
								timestamp: '2026-10-20T10:00:00.000Z',
								level: 2,
								levelName: 'INFO',
								message: 'startup ready',
							},
							{
								timestamp: '2026-10-20T10:01:00.000Z',
								level: 3,
								levelName: 'WARN',
								message: 'disk warning',
							},
						],
					}),
		)
		render(<Logs />)
		await screen.findByText('startup ready')
		fireEvent.change(screen.getByLabelText('Search logs'), {
			target: { value: 'disk' },
		})
		expect(screen.getByText('disk warning')).toBeTruthy()
		expect(screen.queryByText('startup ready')).toBeNull()
	})
})
