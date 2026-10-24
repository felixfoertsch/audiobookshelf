import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, useAuth } from '../../api'
import { setServerLanguage } from '../i18n'
import {
	AuthenticationPage,
	type AuthSettings,
	authenticationError,
} from './authentication'

vi.mock('../../api', async () => ({
	...(await vi.importActual<typeof import('../../api')>('../../api')),
	api: vi.fn(),
}))
const settings: AuthSettings = {
	authActiveAuthMethods: ['local'],
	authLoginCustomMessage: null,
	authOpenIDIssuerURL: '',
	authOpenIDAuthorizationURL: '',
	authOpenIDTokenURL: '',
	authOpenIDUserInfoURL: '',
	authOpenIDJwksURL: '',
	authOpenIDLogoutURL: '',
	authOpenIDClientID: '',
	authOpenIDClientSecret: '',
	authOpenIDTokenSigningAlgorithm: 'RS256',
	authOpenIDButtonText: 'Login',
	authOpenIDGroupClaim: '',
	authOpenIDAdvancedPermsClaim: '',
	authOpenIDMobileRedirectURIs: ['audiobookshelf://oauth'],
	authOpenIDMatchExistingBy: null,
	authOpenIDAutoLaunch: false,
	authOpenIDAutoRegister: false,
}
afterEach(() => {
	cleanup()
	useAuth.setState({ user: null })
	vi.resetAllMocks()
	vi.restoreAllMocks()
})
describe('authentication settings', () => {
	it.each([false, true])(
		'locks initial canonical load and unlocks failed retry (StrictMode: %s)',
		async (strict) => {
			const loads: Array<{
				resolve: (value: unknown) => void
				reject: (error: Error) => void
			}> = []
			vi.mocked(api).mockImplementation(
				() =>
					new Promise((resolve, reject) => {
						loads.push({ resolve, reject })
					}),
			)
			useAuth.setState({
				user: { id: 'A', username: 'A', type: 'admin', accessToken: 'a' },
			})
			render(
				strict ? (
					<StrictMode>
						<AuthenticationPage />
					</StrictMode>
				) : (
					<AuthenticationPage />
				),
			)
			const retry = screen.getByRole('button', {
				name: 'Retry loading authentication settings',
			}) as HTMLButtonElement
			expect(retry.disabled).toBe(true)
			const initialCount = loads.length
			fireEvent.click(retry)
			expect(loads).toHaveLength(initialCount)
			if (strict) {
				await act(async () =>
					loads[0].resolve({
						...settings,
						authLoginCustomMessage: '<p>Discarded</p>',
					}),
				)
				expect(retry.disabled).toBe(true)
			}
			await act(async () =>
				loads[initialCount - 1].reject(new Error('Initial failure')),
			)
			expect(retry.disabled).toBe(false)
			fireEvent.click(retry)
			expect(loads).toHaveLength(initialCount + 1)
			expect(retry.disabled).toBe(true)
			await act(async () =>
				loads[initialCount].resolve({
					...settings,
					authLoginCustomMessage: '<p>Fresh</p>',
				}),
			)
			fireEvent.change(screen.getByLabelText('Login message (HTML)'), {
				target: { value: '<p>Edited</p>' },
			})
			expect(
				(screen.getByLabelText('Login message (HTML)') as HTMLTextAreaElement)
					.value,
			).toBe('<p>Edited</p>')
			expect(
				(
					screen.getByRole('button', {
						name: 'Save authentication settings',
					}) as HTMLButtonElement
				).disabled,
			).toBe(false)
		},
	)
	it('renders real German authentication controls', async () => {
		vi.mocked(api).mockResolvedValueOnce(settings)
		useAuth.setState({
			user: { id: 'A', username: 'A', type: 'admin', accessToken: 'a' },
		})
		await setServerLanguage('de')
		render(<AuthenticationPage />)
		const german = await import('../i18n/strings/de.json')
		await screen.findByLabelText(german.HeaderPasswordAuthentication)
		expect(
			screen.getByLabelText(german.HeaderCustomMessageOnLogin),
		).toBeTruthy()
		await act(async () => setServerLanguage('en-us'))
	})
	it.each(['canonical', 'discovery'])(
		'isolates secret drafts and delayed %s responses between admins',
		async (operation) => {
			let finish: (data: unknown) => void = () => {}
			vi.mocked(api).mockResolvedValueOnce({
				...settings,
				authActiveAuthMethods: ['local', 'openid'],
				authOpenIDIssuerURL: 'https://issuer.test',
				authOpenIDClientSecret: 'A-secret',
			})
			useAuth.setState({
				user: { id: 'A', username: 'A', type: 'admin', accessToken: 'a' },
			})
			const view = render(<AuthenticationPage />)
			await screen.findByLabelText('Client secret')
			fireEvent.click(
				screen.getByRole('button', { name: 'Reveal client secret' }),
			)
			if (operation === 'canonical') {
				vi.spyOn(window, 'confirm').mockReturnValue(true)
				vi.mocked(api).mockResolvedValueOnce({
					updated: true,
					serverSettings: {},
				})
				// Disable OIDC so incomplete discovery fields do not block this save.
				fireEvent.click(screen.getByLabelText('OpenID Connect Authentication'))
			}
			vi.mocked(api).mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						finish = resolve
					}),
			)
			fireEvent.click(
				screen.getByRole('button', {
					name:
						operation === 'canonical'
							? 'Save authentication settings'
							: 'Auto-populate',
				}),
			)
			await waitFor(() =>
				expect(api).toHaveBeenCalledTimes(operation === 'canonical' ? 3 : 2),
			)
			vi.mocked(api).mockResolvedValueOnce({
				...settings,
				authActiveAuthMethods: ['local', 'openid'],
				authOpenIDClientSecret: 'B-secret',
				authOpenIDIssuerURL: 'https://b.test',
			})
			act(() =>
				useAuth.setState({
					user: { id: 'B', username: 'B', type: 'admin', accessToken: 'b' },
				}),
			)
			view.rerender(<AuthenticationPage />)
			await waitFor(() =>
				expect(
					(screen.getByLabelText('Client secret') as HTMLInputElement).value,
				).toBe('B-secret'),
			)
			await act(async () =>
				finish(
					operation === 'canonical'
						? { ...settings, authOpenIDClientSecret: 'late-A-secret' }
						: { issuer: 'https://late-a.test' },
				),
			)
			expect(
				(screen.getByLabelText('Client secret') as HTMLInputElement).value,
			).toBe('B-secret')
			expect(
				(screen.getByLabelText('Client secret') as HTMLInputElement).type,
			).toBe('password')
			expect(
				(screen.getByLabelText('Issuer URL') as HTMLInputElement).value,
			).toBe('https://b.test')
		},
	)
	it('blocks non-admin access before loading secrets', () => {
		useAuth.setState({
			user: {
				id: 'reader',
				username: 'reader',
				accessToken: 'test',
				type: 'user',
			},
		})
		render(<AuthenticationPage />)
		expect(screen.getByRole('alert').textContent).toContain(
			'Administrator access required',
		)
		expect(api).not.toHaveBeenCalled()
	})
	it('shows claim denial, mobile wildcard, auto-launch override and required restart help', async () => {
		vi.mocked(api).mockResolvedValueOnce({
			...settings,
			authActiveAuthMethods: ['local', 'openid'],
		})
		useAuth.setState({
			user: { id: 'root', username: 'root', accessToken: 'test', type: 'root' },
		})
		render(<AuthenticationPage />)
		await screen.findByLabelText('Client secret')
		expect(screen.getByText(/\/login\?autoLaunch=0/).textContent).toContain(
			'manual override',
		)
		expect(screen.getByText(/sole entry permits any URI/)).toBeTruthy()
		expect(
			screen.getByText(/If no group matches, access will be denied/),
		).toBeTruthy()
		expect(
			screen.getByText(/If the claim is missing from the response/).textContent,
		).toContain('false')
		expect(
			screen.getByText(
				'Restart your server after saving to apply OIDC changes.',
			),
		).toBeTruthy()
	})
	it('guards duplicate submissions and excludes sample permissions from writes', async () => {
		let finish: (value: { updated: boolean; serverSettings: object }) => void =
			() => {}
		vi.mocked(api)
			.mockResolvedValueOnce({
				...settings,
				authOpenIDSamplePermissions: { download: true },
			})
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						finish = resolve
					}),
			)
			.mockResolvedValueOnce(settings)
		vi.spyOn(window, 'confirm').mockReturnValue(true)
		useAuth.setState({
			user: { id: 'root', username: 'root', accessToken: 'test', type: 'root' },
		})
		render(<AuthenticationPage />)
		const button = await screen.findByRole('button', {
			name: 'Save authentication settings',
		})
		const form = button.closest('form')
		if (!form) throw new Error('Authentication form missing')
		fireEvent.submit(form)
		fireEvent.submit(form)
		expect(api).toHaveBeenCalledTimes(2)
		expect(
			JSON.parse(String(vi.mocked(api).mock.calls[1][2]?.body)),
		).not.toHaveProperty('authOpenIDSamplePermissions')
		finish({ updated: true, serverSettings: {} })
		await screen.findByText(/Authentication settings saved/)
		expect(api).toHaveBeenCalledTimes(3)
	})
	it('rejects malformed success and preserves draft on PATCH failure', async () => {
		vi.mocked(api)
			.mockResolvedValueOnce(settings)
			.mockImplementationOnce(async (_path, schema) => schema.parse('OK'))
		vi.spyOn(window, 'confirm').mockReturnValue(true)
		useAuth.setState({
			user: { id: 'root', username: 'root', accessToken: 'test', type: 'root' },
		})
		render(<AuthenticationPage />)
		fireEvent.click(await screen.findByLabelText('Custom Message on Login'))
		fireEvent.change(screen.getByLabelText('Login message (HTML)'), {
			target: { value: '<p>Draft</p>' },
		})
		fireEvent.click(
			screen.getByRole('button', { name: 'Save authentication settings' }),
		)
		await waitFor(() =>
			expect(
				(
					screen.getByRole('button', {
						name: 'Save authentication settings',
					}) as HTMLButtonElement
				).disabled,
			).toBe(false),
		)
		expect(api).toHaveBeenCalledTimes(2)
		expect(
			(screen.getByLabelText('Login message (HTML)') as HTMLTextAreaElement)
				.value,
		).toBe('<p>Draft</p>')
		expect(screen.getByRole('alert').textContent).not.toContain(
			'settings saved',
		)
	})
	it('reports no-op and reloads canonical sanitized HTML without exposing credentials', async () => {
		vi.mocked(api)
			.mockResolvedValueOnce(settings)
			.mockResolvedValueOnce({ updated: false, serverSettings: {} })
			.mockResolvedValueOnce({
				...settings,
				authLoginCustomMessage: '<p>Safe</p>',
				authOpenIDClientSecret: 'canonical-secret',
			})
		vi.spyOn(window, 'confirm').mockReturnValue(true)
		useAuth.setState({
			user: { id: 'root', username: 'root', accessToken: 'test', type: 'root' },
		})
		render(<AuthenticationPage />)
		fireEvent.click(
			await screen.findByRole('button', {
				name: 'Save authentication settings',
			}),
		)
		await screen.findByText('No updates were necessary.')
		expect(api).toHaveBeenCalledTimes(3)
		expect(
			(screen.getByLabelText('Login message (HTML)') as HTMLTextAreaElement)
				.value,
		).toBe('<p>Safe</p>')
		expect(screen.queryByText(/canonical-secret/)).toBeNull()
	})
	it('retains failed edits and does not announce applied settings when canonical reload fails', async () => {
		vi.mocked(api)
			.mockResolvedValueOnce(settings)
			.mockResolvedValueOnce({ updated: true, serverSettings: {} })
			.mockRejectedValueOnce(new Error('Reload unavailable'))
		vi.spyOn(window, 'confirm').mockReturnValue(true)
		useAuth.setState({
			user: { id: 'root', username: 'root', accessToken: 'test', type: 'root' },
		})
		render(<AuthenticationPage />)
		fireEvent.click(await screen.findByLabelText('Custom Message on Login'))
		fireEvent.change(screen.getByLabelText('Login message (HTML)'), {
			target: { value: '<p>Draft</p>' },
		})
		fireEvent.click(
			screen.getByRole('button', { name: 'Save authentication settings' }),
		)
		await screen.findByText(/Saved, but could not reload/)
		expect(
			(
				screen.getByRole('button', {
					name: 'Save authentication settings',
				}) as HTMLButtonElement
			).disabled,
		).toBe(true)
		vi.mocked(api).mockResolvedValueOnce({
			...settings,
			authLoginCustomMessage: '<p>Canonical</p>',
			authOpenIDClientSecret: 'retry-secret',
		})
		fireEvent.click(
			screen.getByRole('button', {
				name: 'Retry loading authentication settings',
			}),
		)
		await screen.findByText('Authentication settings reloaded.')
		expect(
			(
				screen.getByRole('button', {
					name: 'Save authentication settings',
				}) as HTMLButtonElement
			).disabled,
		).toBe(false)
		expect(
			(screen.getByLabelText('Login message (HTML)') as HTMLTextAreaElement)
				.value,
		).toBe('<p>Canonical</p>')
		fireEvent.click(screen.getByLabelText('OpenID Connect Authentication'))
		expect(
			(screen.getByLabelText('Client secret') as HTMLInputElement).value,
		).toBe('retry-secret')
		expect(
			(screen.getByLabelText('Client secret') as HTMLInputElement).type,
		).toBe('password')
	})
	it('refuses disabling every authentication method and missing OIDC fields', () => {
		expect(
			authenticationError({ ...settings, authActiveAuthMethods: [] }),
		).toContain('at least one')
		expect(
			authenticationError({ ...settings, authActiveAuthMethods: ['openid'] }),
		).toBe('Issuer URL required.')
		expect(authenticationError(settings)).toBeNull()
	})
	it('never displays stored client secret unmasked by default', async () => {
		vi.mocked(api).mockResolvedValue({
			...settings,
			authOpenIDClientSecret: 'stored-secret',
			authActiveAuthMethods: ['local', 'openid'],
		})
		useAuth.setState({
			user: { id: 'root', username: 'root', accessToken: 'test', type: 'root' },
		})
		render(<AuthenticationPage />)
		const secret = await screen.findByLabelText('Client secret')
		expect(secret.getAttribute('type')).toBe('password')
		fireEvent.click(
			screen.getByRole('button', { name: 'Reveal client secret' }),
		)
		await waitFor(() => expect(secret.getAttribute('type')).toBe('text'))
	})
	it('renders normalized empty stored OIDC fields', async () => {
		vi.mocked(api).mockImplementationOnce(async (_path, schema) =>
			schema.parse({
				...settings,
				authOpenIDClientID: null,
				authOpenIDClientSecret: null,
				authOpenIDIssuerURL: null,
			}),
		)
		useAuth.setState({
			user: { id: 'root', username: 'root', accessToken: 'test', type: 'root' },
		})
		render(<AuthenticationPage />)
		fireEvent.click(
			await screen.findByLabelText('OpenID Connect Authentication'),
		)
		expect((screen.getByLabelText('Client ID') as HTMLInputElement).value).toBe(
			'',
		)
		expect(
			(screen.getByLabelText('Client secret') as HTMLInputElement).type,
		).toBe('password')
	})
	it('sends nullable custom message without changing disabled OIDC settings', async () => {
		vi.mocked(api)
			.mockResolvedValueOnce(settings)
			.mockResolvedValueOnce({ updated: true, serverSettings: {} })
			.mockResolvedValueOnce(settings)
		vi.spyOn(window, 'confirm').mockReturnValue(true)
		useAuth.setState({
			user: { id: 'root', username: 'root', accessToken: 'test', type: 'root' },
		})
		render(<AuthenticationPage />)
		fireEvent.click(
			await screen.findByRole('button', {
				name: 'Save authentication settings',
			}),
		)
		await waitFor(() => expect(api).toHaveBeenCalledTimes(3))
		const request = vi.mocked(api).mock.calls[1]
		expect(request[0]).toBe('/auth-settings')
		expect(request[2]?.method).toBe('PATCH')
		expect(JSON.parse(String(request[2]?.body))).toMatchObject({
			authActiveAuthMethods: ['local'],
			authLoginCustomMessage: null,
			authOpenIDClientSecret: '',
			authOpenIDMobileRedirectURIs: ['audiobookshelf://oauth'],
		})
	})
})
