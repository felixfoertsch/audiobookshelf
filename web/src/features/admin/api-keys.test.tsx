import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Input } from '../../shared/components/ui/input'
import {
	NativeSelect,
	NativeSelectOption,
} from '../../shared/components/ui/native-select'
import { ApiKeysPage } from './api-keys'

vi.mock('../../api', () => ({
	api: vi.fn().mockResolvedValue({ apiKeys: [], users: [] }),
	useAuth: (selector: (x: { user: { type: string } }) => unknown) =>
		selector({ user: { type: 'admin' } }),
}))
describe('ApiKeysPage', () => {
	it('offers expiration entry and one-time key workflow controls', () => {
		render(<ApiKeysPage />)
		expect(screen.getByRole('heading', { name: 'API keys' })).toBeTruthy()
		fireEvent.click(screen.getByRole('button', { name: 'Create API key' }))
		expect(
			screen.getByLabelText(/Expires in seconds/).getAttribute('type'),
		).toBe('number')
		expect(screen.getByLabelText('Name').getAttribute('data-slot')).toBe(
			'input',
		)
		expect(screen.getByLabelText('User').getAttribute('data-slot')).toBe(
			'native-select',
		)
		expect(screen.getByLabelText('Active').getAttribute('type')).toBe(
			'checkbox',
		)
		expect(screen.getByRole('button', { name: 'Save API key' })).toBeTruthy()
	})
})

it('guards deferred duplicate submit and retains one-time secret until dismissal', async () => {
	cleanup()
	const { api } = await import('../../api')
	vi.mocked(api).mockClear()
	let resolve!: (value: unknown) => void
	vi.mocked(api).mockImplementation(async (_path, _schema, init) => {
		if (init?.method === 'POST')
			return (await new Promise<unknown>((done) => {
				resolve = done
			})) as never
		return {
			apiKeys: [],
			users: [{ id: 'u', username: 'reader', type: 'user' }],
		} as never
	})
	const { container } = render(<ApiKeysPage />)
	fireEvent.click(screen.getByRole('button', { name: 'Create API key' }))
	fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'test' } })
	const form = container.querySelector('form')
	if (!form) throw new Error('API key form missing')
	fireEvent.change(screen.getByLabelText(/Expires in seconds/), {
		target: { value: '3600' },
	})
	await screen.findByRole('option', { name: 'reader (user)' })
	fireEvent.change(screen.getByLabelText('User'), { target: { value: 'u' } })
	fireEvent.submit(form)
	fireEvent.submit(form)
	expect(
		(screen.getByLabelText('Name') as HTMLInputElement).disabled ||
			(screen.getByLabelText('Name').closest('fieldset') as HTMLFieldSetElement)
				.disabled,
	).toBe(true)
	expect(
		(screen.getByLabelText('User').closest('fieldset') as HTMLFieldSetElement)
			.disabled,
	).toBe(true)
	expect(
		vi.mocked(api).mock.calls.filter((call) => call[2]?.method === 'POST'),
	).toHaveLength(1)
	resolve({ apiKey: { apiKey: 'one-time-secret' } })
	await screen.findByDisplayValue('one-time-secret')
	expect(
		(screen.getByLabelText('New API key') as HTMLInputElement).readOnly,
	).toBe(true)
	expect(
		JSON.parse(
			String(
				vi
					.mocked(api)
					.mock.calls.find((call) => call[2]?.method === 'POST')?.[2]?.body,
			),
		),
	).toEqual({ name: 'test', userId: 'u', isActive: true, expiresIn: 3600 })
	expect(screen.getByRole('button', { name: 'Create API key' })).toHaveProperty(
		'disabled',
		true,
	)
	fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
	expect(screen.queryByDisplayValue('one-time-secret')).toBeNull()
})

it('stock native controls preserve label, ref, validation and disabled contracts', () => {
	cleanup()
	const input = createRef<HTMLInputElement>()
	const select = createRef<HTMLSelectElement>()
	render(
		<form>
			<label htmlFor="ref-input">Duration</label>
			<Input
				id="ref-input"
				ref={input}
				type="number"
				min="1"
				required
				defaultValue="0"
			/>
			<label htmlFor="ref-select">Owner</label>
			<NativeSelect id="ref-select" ref={select} disabled defaultValue="u">
				<NativeSelectOption value="u">User</NativeSelectOption>
			</NativeSelect>
		</form>,
	)
	expect(screen.getByLabelText('Duration')).toBe(input.current)
	expect(input.current?.validity.rangeUnderflow).toBe(true)
	fireEvent.change(screen.getByLabelText('Duration'), {
		target: { value: '5' },
	})
	expect(input.current?.validity.valid).toBe(true)
	expect(screen.getByLabelText('Owner')).toBe(select.current)
	expect(select.current?.disabled).toBe(true)
	expect(select.current?.value).toBe('u')
})
