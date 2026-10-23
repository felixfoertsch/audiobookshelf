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

const enabledPayload = {
	settings: {
		appriseApiUrl: 'https://apprise.test',
		maxNotificationQueue: 10,
		maxFailedAttempts: 3,
		notifications: [
			{
				id: 'n1',
				eventName: 'onTest',
				urls: ['json://one', 'json://two'],
				titleTemplate: 'title',
				bodyTemplate: 'body',
				enabled: true,
			},
		],
	},
	data: {
		events: [
			{
				name: 'onTest',
				defaults: { title: 'default title', body: 'default body' },
			},
		],
	},
}

function mockApi(payload = enabledPayload) {
	const requests: Array<{ url: string; init?: RequestInit }> = []
	const fetcher = vi
		.spyOn(globalThis, 'fetch')
		.mockImplementation(async (input, init) => {
			requests.push({ url: String(input), init })
			return Response.json(init?.method ? {} : payload)
		})
	return { requests, fetcher }
}

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
	useAuth.getState().set(null)
})

describe('notifications', () => {
	it('creates notification with exact payload', async () => {
		useAuth.getState().set({
			id: 'admin',
			username: 'admin',
			accessToken: 'fixture',
			type: 'admin',
		})
		const { requests } = mockApi()
		render(<Notifications />)
		fireEvent.click(await screen.findByRole('button', { name: 'Create' }))
		fireEvent.change(screen.getByLabelText('Apprise URLs (comma-separated)'), {
			target: { value: 'json://one, json://two' },
		})
		fireEvent.change(screen.getByLabelText('Title template'), {
			target: { value: 'hello' },
		})
		fireEvent.change(screen.getByLabelText('Body template'), {
			target: { value: 'world' },
		})
		fireEvent.click(screen.getByRole('button', { name: 'Save notification' }))
		await waitFor(() =>
			expect(requests.some((r) => r.init?.method === 'POST')).toBe(true),
		)
		const request = requests.find((r) => r.init?.method === 'POST')
		expect(request).toBeDefined()
		expect(request?.url).toBe('/api/notifications')
		expect(JSON.parse(String(request?.init?.body))).toEqual({
			id: undefined,
			eventName: 'onTest',
			urls: ['json://one', 'json://two'],
			titleTemplate: 'hello',
			bodyTemplate: 'world',
			enabled: true,
			libraryId: null,
			type: null,
		})
	})

	it('edits with exact payload and cancel closes without writing', async () => {
		useAuth.getState().set({
			id: 'admin',
			username: 'admin',
			accessToken: 'fixture',
			type: 'admin',
		})
		const { requests } = mockApi()
		render(<Notifications />)
		fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
		fireEvent.click(screen.getByRole('button', { name: 'Save notification' }))
		await waitFor(() =>
			expect(requests.some((r) => r.init?.method === 'PATCH')).toBe(true),
		)
		expect(
			JSON.parse(
				String(requests.find((r) => r.init?.method === 'PATCH')?.init?.body),
			),
		).toEqual({
			id: 'n1',
			eventName: 'onTest',
			urls: ['json://one', 'json://two'],
			titleTemplate: 'title',
			bodyTemplate: 'body',
			enabled: true,
			libraryId: null,
			type: null,
		})
		fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
		const count = requests.length
		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
		expect(
			screen.queryByRole('button', { name: 'Save notification' }),
		).not.toBeInTheDocument()
		expect(requests).toHaveLength(count)
	})

	it.each([
		{ name: 'Disable', startsEnabled: true, enabled: false },
		{ name: 'Enable', startsEnabled: false, enabled: true },
	])(
		'sets notification state with $name',
		async ({ name, startsEnabled, enabled }) => {
			useAuth.getState().set({
				id: 'admin',
				username: 'admin',
				accessToken: 'fixture',
				type: 'admin',
			})
			const payload = structuredClone(enabledPayload)
			payload.settings.notifications[0].enabled = startsEnabled
			const { requests } = mockApi(payload)
			render(<Notifications />)
			fireEvent.click(await screen.findByRole('button', { name }))
			await waitFor(() =>
				expect(requests.some((r) => r.init?.method === 'PATCH')).toBe(true),
			)
			expect(
				JSON.parse(
					String(requests.find((r) => r.init?.method === 'PATCH')?.init?.body),
				),
			).toEqual({ id: 'n1', enabled })
		},
	)

	it('deletes selected notification', async () => {
		useAuth.getState().set({
			id: 'admin',
			username: 'admin',
			accessToken: 'fixture',
			type: 'admin',
		})
		const { requests } = mockApi()
		render(<Notifications />)
		fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
		await waitFor(() =>
			expect(requests.some((r) => r.init?.method === 'DELETE')).toBe(true),
		)
		expect(requests.find((r) => r.init?.method === 'DELETE')).toMatchObject({
			url: '/api/notifications/n1',
		})
	})

	it('fires test event with exact endpoint', async () => {
		useAuth.getState().set({
			id: 'admin',
			username: 'admin',
			accessToken: 'fixture',
			type: 'admin',
		})
		const { requests } = mockApi()
		render(<Notifications />)
		fireEvent.click(
			await screen.findByRole('button', { name: 'Fire test event' }),
		)
		await waitFor(() =>
			expect(
				requests.some((r) => r.url === '/api/notifications/test?fail=0'),
			).toBe(true),
		)
	})

	it('saves valid settings with exact payload', async () => {
		useAuth.getState().set({
			id: 'admin',
			username: 'admin',
			accessToken: 'fixture',
			type: 'admin',
		})
		const { requests } = mockApi()
		render(<Notifications />)
		await screen.findByRole('button', { name: 'Save settings' })
		fireEvent.change(screen.getByLabelText('Maximum queue size'), {
			target: { value: '25' },
		})
		fireEvent.change(screen.getByLabelText('Maximum failed attempts'), {
			target: { value: '4' },
		})
		fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
		await waitFor(() =>
			expect(
				requests.some(
					(r) => r.url === '/api/notifications' && r.init?.method === 'PATCH',
				),
			).toBe(true),
		)
		expect(
			JSON.parse(
				String(
					requests.find(
						(r) => r.url === '/api/notifications' && r.init?.method === 'PATCH',
					)?.init?.body,
				),
			),
		).toEqual({
			appriseApiUrl: 'https://apprise.test',
			maxNotificationQueue: 25,
			maxFailedAttempts: 4,
		})
	})

	it('rejects invalid numeric settings without writing', async () => {
		useAuth
			.getState()
			.set({ id: 'u', username: 'admin', accessToken: 'x', type: 'admin' })
		const { requests } = mockApi()
		render(<Notifications />)
		await screen.findByRole('button', { name: 'Save settings' })
		fireEvent.change(screen.getByLabelText('Maximum queue size'), {
			target: { value: '0' },
		})
		fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
		expect(await screen.findByRole('alert')).toHaveTextContent(
			'positive integers',
		)
		await waitFor(() => expect(requests).toHaveLength(1))
	})
})
