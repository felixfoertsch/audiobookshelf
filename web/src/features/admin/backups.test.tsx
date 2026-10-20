import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAuth } from '../../api'
import { Backups } from './backups'

const record = {
	id: 'backup-exact-id',
	path: 'backup.audiobookshelf',
	createdAt: 1,
	fileSize: 42,
	serverVersion: '2',
	key: 'key',
}
describe('backups', () => {
	it('loads authorized settings, confirms exact backup path, calls restore GET and uploads multipart file', async () => {
		useAuth.setState({
			user: { id: 'u', username: 'admin', accessToken: 'x', type: 'admin' },
			initialized: true,
			loading: false,
		})
		const requests: { url: string; init?: RequestInit }[] = []
		vi.spyOn(window, 'confirm').mockReturnValue(true)
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
			const url = String(input)
			requests.push({ url, init })
			if (url.endsWith('/authorize'))
				return Response.json({
					user: { type: 'admin' },
					serverSettings: {
						backupSchedule: '30 1 * * *',
						backupsToKeep: 2,
						maxBackupSize: 1,
					},
				})
			if (url.endsWith('/api/backups'))
				return Response.json({
					backups: [record],
					backupLocation: '/backups',
					backupPathEnvSet: false,
				})
			if (url.endsWith('/apply')) return Response.json({})
			if (url.endsWith('/upload')) return Response.json({ backups: [record] })
			return new Response('OK')
		})
		render(<Backups />)
		await screen.findByText(/backup\.audiobookshelf/)
		const restore = screen.getByRole('button', { name: 'Restore' })
		expect(restore).toBeDisabled()
		fireEvent.change(screen.getByLabelText('Confirm restore backup-exact-id'), {
			target: { value: 'backup-exact-id-no' },
		})
		expect(restore).toBeDisabled()
		fireEvent.change(screen.getByLabelText('Confirm restore backup-exact-id'), {
			target: { value: record.path },
		})
		expect(restore).toBeEnabled()
		fireEvent.click(restore)
		await waitFor(() =>
			expect(
				requests.some(
					(r) =>
						r.url.endsWith('/api/backups/backup-exact-id/apply') &&
						r.init?.method === 'GET',
				),
			).toBe(true),
		)
		await waitFor(() => expect(restore).toBeEnabled())
		const file = new File(['backup bytes'], 'test.audiobookshelf')
		fireEvent.change(screen.getByLabelText('Upload backup'), {
			target: { files: [file] },
		})
		await waitFor(() =>
			expect(
				requests.some(
					(r) =>
						r.url.endsWith('/upload') &&
						r.init?.method === 'POST' &&
						r.init.body instanceof FormData &&
						r.init.body.get('file') === file,
				),
			).toBe(true),
		)
	})
})
