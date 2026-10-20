import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAuth } from '../../api'
import { Email } from './email'

describe('email settings', () => {
	it('loads settings, masks password and saves concrete settings', async () => {
		useAuth.setState({
			user: { id: 'u', username: 'admin', accessToken: 'x', type: 'admin' },
			initialized: true,
			loading: false,
		})
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockImplementation(async (_i, init) =>
				init?.method === 'PATCH'
					? Response.json({
							settings: {
								host: 'mail.test',
								port: 465,
								secure: true,
								rejectUnauthorized: true,
								user: 'u',
								pass: 'secret',
								fromAddress: 'a@b.test',
								testAddress: '',
								ereaderDevices: [],
							},
						})
					: Response.json({
							settings: {
								host: 'mail.test',
								port: 465,
								secure: true,
								rejectUnauthorized: true,
								user: 'u',
								pass: 'secret',
								fromAddress: 'a@b.test',
								testAddress: '',
								ereaderDevices: [],
							},
						}),
			)
		render(<Email />)
		const password = await screen.findByLabelText('Password')
		expect(password).toHaveAttribute('type', 'password')
		expect(password).toHaveValue('secret')
		fireEvent.click(screen.getByRole('button', { name: 'Save email settings' }))
		await waitFor(() => {
			const request = fetchMock.mock.calls.find(
				([, init]) => init?.method === 'PATCH',
			)
			expect(request).toBeDefined()
			const payload = JSON.parse(String(request?.[1]?.body))
			expect(payload).toEqual({
				host: 'mail.test',
				port: 465,
				secure: true,
				rejectUnauthorized: true,
				user: 'u',
				pass: 'secret',
				testAddress: '',
				fromAddress: 'a@b.test',
			})
		})
	})
})
