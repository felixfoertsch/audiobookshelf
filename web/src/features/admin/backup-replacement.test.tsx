import '@testing-library/jest-dom/vitest'
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { useAuth } from '../../api'
import { Backups } from './backups'

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
})
test('fresh same-ID backup replacement invalidates confirmation and never applies changed archive', async () => {
	useAuth.setState({
		user: {
			id: 'admin',
			username: 'admin',
			accessToken: 'fixture',
			type: 'admin',
		},
	})
	const original = {
		id: 'same',
		path: '/backups/exact.audiobookshelf',
		key: 'old-key',
		serverVersion: '2',
		createdAt: 1,
		fileSize: 42,
	}
	let reads = 0
	const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
	const fetcher = vi
		.spyOn(globalThis, 'fetch')
		.mockImplementation(async (path) => {
			if (String(path).endsWith('/authorize'))
				return Response.json({
					user: { type: 'admin' },
					serverSettings: {
						backupSchedule: false,
						backupsToKeep: 2,
						maxBackupSize: 1,
					},
				})
			if (String(path).endsWith('/api/backups')) {
				reads++
				return Response.json({
					backups: [
						reads === 1
							? original
							: { ...original, key: 'replacement', createdAt: 2, fileSize: 84 },
						{
							...original,
							id: 'legacy',
							path: '/backups/legacy',
							key: null,
							serverVersion: null,
						},
					],
					backupLocation: '/backups',
					backupPathEnvSet: false,
				})
			}
			throw new Error(`Unexpected mutation: ${String(path)}`)
		})
	render(<Backups />)
	await screen.findByText(/unsupported legacy backup/)
	const confirmation = screen.getByLabelText('Confirm restore same')
	fireEvent.change(confirmation, { target: { value: original.path } })
	fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
	await screen.findByText('Backup changed. Review it and confirm again.')
	expect(confirmation).toHaveValue('')
	expect(screen.getByRole('button', { name: 'Restore' })).toBeDisabled()
	expect(confirm).not.toHaveBeenCalled()
	expect(
		fetcher.mock.calls.some(([path]) => String(path).endsWith('/apply')),
	).toBe(false)
	await waitFor(() => expect(reads).toBeGreaterThanOrEqual(2))
})
