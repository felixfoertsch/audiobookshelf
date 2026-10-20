import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { api, useAuth } from '../../api'
import { Button } from '../../shared/components/ui/button'
import { Input } from '../../shared/components/ui/input'
import { NativeSelect } from '../../shared/components/ui/native-select'
import { useT } from '../i18n'

const textFields = [
	['authOpenIDIssuerURL', 'Issuer URL'],
	['authOpenIDAuthorizationURL', 'Authorize URL'],
	['authOpenIDTokenURL', 'Token URL'],
	['authOpenIDUserInfoURL', 'Userinfo URL'],
	['authOpenIDJwksURL', 'JWKS URL'],
	['authOpenIDLogoutURL', 'Logout URL'],
	['authOpenIDClientID', 'Client ID'],
	['authOpenIDClientSecret', 'Client secret'],
	['authOpenIDTokenSigningAlgorithm', 'Signing algorithm'],
	['authOpenIDButtonText', 'Button text'],
	['authOpenIDGroupClaim', 'Group claim'],
	['authOpenIDAdvancedPermsClaim', 'Advanced permission claim'],
] as const
const fieldHelp: Partial<Record<(typeof textFields)[number][0], string>> = {
	authOpenIDGroupClaim: 'LabelOpenIDGroupClaimDescription',
	authOpenIDAdvancedPermsClaim: 'LabelOpenIDAdvancedPermsClaimDescription',
}
const authText = z
	.string()
	.nullable()
	.transform((value) => value ?? '')
const authSchema = z.object({
	authActiveAuthMethods: z.array(z.string()),
	authLoginCustomMessage: z.string().nullable(),
	authOpenIDIssuerURL: authText,
	authOpenIDAuthorizationURL: authText,
	authOpenIDTokenURL: authText,
	authOpenIDUserInfoURL: authText,
	authOpenIDJwksURL: authText,
	authOpenIDLogoutURL: authText,
	authOpenIDClientID: authText,
	authOpenIDClientSecret: authText,
	authOpenIDTokenSigningAlgorithm: authText,
	authOpenIDButtonText: authText,
	authOpenIDGroupClaim: authText,
	authOpenIDAdvancedPermsClaim: authText,
	authOpenIDMobileRedirectURIs: z.array(z.string()),
	authOpenIDSubfolderForRedirectURLs: z.string().optional(),
	authOpenIDMatchExistingBy: z.enum(['email', 'username']).nullable(),
	authOpenIDAutoLaunch: z.boolean(),
	authOpenIDAutoRegister: z.boolean(),
	authOpenIDSamplePermissions: z.unknown().optional(),
})
export type AuthSettings = z.infer<typeof authSchema>
export function authenticationError(settings: AuthSettings): string | null {
	if (!settings.authActiveAuthMethods.length)
		return 'Enable at least one authentication method.'
	if (!settings.authActiveAuthMethods.includes('openid')) return null
	for (const [key, label] of textFields.slice(0, 9))
		if (key !== 'authOpenIDLogoutURL' && !settings[key].trim())
			return `${label} required.`
	const uris = settings.authOpenIDMobileRedirectURIs
	if (uris.includes('*') && uris.length > 1)
		return 'Asterisk must be the only mobile redirect URI.'
	if (
		uris.some(
			(uri) => uri !== '*' && !/^\w+:\/\/[\w.-]+(\/[\w./-]*)*$/i.test(uri),
		)
	)
		return 'Invalid mobile redirect URI.'
	for (const key of [
		'authOpenIDGroupClaim',
		'authOpenIDAdvancedPermsClaim',
	] as const)
		if (settings[key] && !/^[a-z][a-z0-9_-]*$/i.test(settings[key]))
			return 'Invalid claim name.'
	return null
}
export function AuthenticationPage() {
	const user = useAuth((state) => state.user)
	if (user?.type !== 'root' && user?.type !== 'admin')
		return <p role="alert">Administrator access required.</p>
	return <AuthenticationForm key={JSON.stringify([user.id, user.type])} />
}
function AuthenticationForm() {
	const t = useT()
	const help = (key: string) => t(key).replace(/<[^>]*>/g, '')
	const saving = useRef(false)
	const user = useAuth((state) => state.user)
	const allowed = user?.type === 'root' || user?.type === 'admin'
	const [settings, setSettings] = useState<AuthSettings | null>(null)
	const [customMessage, setCustomMessage] = useState(false)
	const [pending, setPending] = useState(false)
	const [message, setMessage] = useState('')
	const [algorithms, setAlgorithms] = useState<string[]>([])
	const [reveal, setReveal] = useState(false)
	const [ready, setReady] = useState(false)
	const [failed, setFailed] = useState(false)
	const mounted = useRef(true)
	const current = () =>
		mounted.current &&
		useAuth.getState().user?.id === user?.id &&
		useAuth.getState().user?.type === user?.type
	useEffect(() => {
		mounted.current = true
		return () => {
			mounted.current = false
		}
	}, [])
	function applyCanonical(data: AuthSettings) {
		if (!current()) return
		setSettings({
			...data,
			authOpenIDSubfolderForRedirectURLs:
				data.authOpenIDSubfolderForRedirectURLs ??
				window.__ABS_WEB_CONFIG__?.apiBasePath ??
				'',
		})
		setCustomMessage(Boolean(data.authLoginCustomMessage))
		setReveal(false)
		setReady(true)
	}
	async function retryLoad() {
		if (!current() || saving.current) return
		saving.current = true
		setPending(true)
		setReveal(false)
		try {
			const data = await api('/auth-settings', authSchema)
			if (!current()) return
			applyCanonical(data)
			setFailed(false)
			setMessage('Authentication settings reloaded.')
		} catch (error) {
			if (current()) {
				setFailed(true)
				setMessage(
					error instanceof Error
						? error.message
						: 'Failed to load authentication settings.',
				)
			}
		} finally {
			saving.current = false
			if (current()) setPending(false)
		}
	}
	// biome-ignore lint/correctness/useExhaustiveDependencies: initial load belongs to identity-keyed form lifetime
	useEffect(() => {
		if (!allowed) return
		let active = true
		saving.current = true
		setPending(true)
		api('/auth-settings', authSchema)
			.then((data) => {
				if (active && current()) applyCanonical(data)
			})
			.catch(() => {
				if (active && current()) {
					setFailed(true)
					setMessage('Failed to load authentication settings.')
				}
			})
			.finally(() => {
				if (active && current()) {
					saving.current = false
					setPending(false)
				}
			})
		return () => {
			active = false
		}
	}, [allowed])
	async function save() {
		if (
			!settings ||
			!ready ||
			!current() ||
			saving.current ||
			pending ||
			!allowed
		)
			return
		const payload = {
			...settings,
			authLoginCustomMessage:
				customMessage && settings.authLoginCustomMessage?.trim()
					? settings.authLoginCustomMessage
					: null,
		}
		const error = authenticationError(payload)
		if (error) {
			setFailed(true)
			setMessage(error)
			return
		}
		if (
			!window.confirm(
				`Save authentication methods: ${payload.authActiveAuthMethods.join(', ')}? Restart your server after saving to apply OIDC changes. Confirm credentials and callback URLs before continuing.`,
			)
		)
			return
		saving.current = true
		setPending(true)
		setMessage('')
		setFailed(false)
		setReveal(false)
		try {
			const { authOpenIDSamplePermissions: _sample, ...update } = payload
			const result = await api(
				'/auth-settings',
				z.object({
					updated: z.boolean(),
					serverSettings: z.object({}).passthrough(),
				}),
				{ method: 'PATCH', body: JSON.stringify(update) },
			)
			if (!current()) return
			setReady(false)
			try {
				const canonical = await api('/auth-settings', authSchema)
				if (!current()) return
				applyCanonical(canonical)
			} catch {
				if (!current()) return
				setFailed(true)
				setMessage(
					result.updated
						? 'Saved, but could not reload authentication settings. Keep these edits and reload settings before saving again.'
						: 'No updates were necessary, but could not reload authentication settings. Keep these edits and reload settings before saving again.',
				)
				return
			}
			setMessage(
				result.updated
					? 'Authentication settings saved. Restart your server after saving to apply OIDC changes.'
					: 'No updates were necessary.',
			)
		} catch (error) {
			if (current()) {
				setFailed(true)
				setMessage(error instanceof Error ? error.message : 'Save failed.')
			}
		} finally {
			saving.current = false
			if (current()) setPending(false)
		}
	}
	async function discover() {
		if (
			!settings ||
			!ready ||
			!current() ||
			saving.current ||
			pending ||
			!allowed
		)
			return
		const issuer = settings.authOpenIDIssuerURL
			.replace(/\/$/, '')
			.replace(/\/\.well-known\/openid-configuration$/, '')
		try {
			new URL(issuer)
		} catch {
			setFailed(true)
			setMessage('Valid issuer URL required.')
			return
		}
		saving.current = true
		setPending(true)
		setFailed(false)
		try {
			const data = await api(
				`/auth/openid/config?issuer=${encodeURIComponent(issuer)}`,
				z.object({
					issuer: z.string().optional(),
					authorization_endpoint: z.string().optional(),
					token_endpoint: z.string().optional(),
					userinfo_endpoint: z.string().optional(),
					jwks_uri: z.string().optional(),
					end_session_endpoint: z.string().optional(),
					id_token_signing_alg_values_supported: z.array(z.string()).optional(),
				}),
			)
			if (!current()) return
			const supported = data.id_token_signing_alg_values_supported ?? []
			setAlgorithms(supported)
			setSettings({
				...settings,
				authOpenIDIssuerURL: data.issuer ?? issuer,
				authOpenIDAuthorizationURL:
					data.authorization_endpoint ?? settings.authOpenIDAuthorizationURL,
				authOpenIDTokenURL: data.token_endpoint ?? settings.authOpenIDTokenURL,
				authOpenIDUserInfoURL:
					data.userinfo_endpoint ?? settings.authOpenIDUserInfoURL,
				authOpenIDJwksURL: data.jwks_uri ?? settings.authOpenIDJwksURL,
				authOpenIDLogoutURL:
					data.end_session_endpoint ?? settings.authOpenIDLogoutURL,
				authOpenIDTokenSigningAlgorithm:
					supported.length &&
					!supported.includes(settings.authOpenIDTokenSigningAlgorithm)
						? supported[0]
						: settings.authOpenIDTokenSigningAlgorithm,
			})
			setMessage('Provider configuration loaded. Review before saving.')
		} catch {
			if (current()) {
				setFailed(true)
				setMessage('Failed to load provider configuration. Check issuer URL.')
			}
		} finally {
			saving.current = false
			if (current()) setPending(false)
		}
	}
	if (!allowed) return <p role="alert">Administrator access required.</p>
	return (
		<section className="space-y-4">
			<h1 className="text-2xl font-semibold">{t('HeaderAuthentication')}</h1>
			<p role={failed ? 'alert' : 'status'}>
				{message || (!settings ? 'Loading authentication settings…' : '')}
			</p>
			{!ready && (
				<Button
					type="button"
					disabled={pending}
					onClick={() => void retryLoad()}
				>
					Retry loading authentication settings
				</Button>
			)}
			{settings && (
				<form
					onSubmit={(event) => {
						event.preventDefault()
						void save()
					}}
				>
					<fieldset disabled={pending} className="space-y-4">
						<label className="flex gap-2">
							<input
								type="checkbox"
								checked={customMessage}
								onChange={(event) => setCustomMessage(event.target.checked)}
							/>
							{t('HeaderCustomMessageOnLogin')}
						</label>
						{customMessage && (
							<label className="block">
								Login message (HTML)
								<textarea
									className="block w-full rounded border bg-background p-2"
									value={settings.authLoginCustomMessage ?? ''}
									onChange={(event) =>
										setSettings({
											...settings,
											authLoginCustomMessage: event.target.value,
										})
									}
								/>
							</label>
						)}
						{[
							['local', t('HeaderPasswordAuthentication')],
							['openid', t('HeaderOpenIDConnectAuthentication')],
						].map(([method, label]) => (
							<label key={method} className="flex gap-2">
								<input
									type="checkbox"
									checked={settings.authActiveAuthMethods.includes(method)}
									onChange={(event) =>
										setSettings({
											...settings,
											authActiveAuthMethods: event.target.checked
												? [...settings.authActiveAuthMethods, method]
												: settings.authActiveAuthMethods.filter(
														(value) => value !== method,
													),
										})
									}
								/>
								{label}
							</label>
						))}
						{settings.authActiveAuthMethods.includes('openid') && (
							<div className="space-y-3">
								<a
									href="https://audiobookshelf.org/docs/documentation/server-management/oidc-authentication"
									target="_blank"
									rel="noreferrer"
								>
									OIDC documentation
								</a>
								{textFields.map(([key, label]) => (
									<label className="block" key={key} htmlFor={key}>
										{label}
										{key === 'authOpenIDTokenSigningAlgorithm' &&
										algorithms.length ? (
											<NativeSelect
												id={key}
												className="block rounded border bg-background p-2"
												value={settings[key]}
												onChange={(event) =>
													setSettings({
														...settings,
														[key]: event.target.value,
													})
												}
											>
												{algorithms.map((algorithm) => (
													<option key={algorithm}>{algorithm}</option>
												))}
											</NativeSelect>
										) : (
											<Input
												id={key}
												aria-label={label}
												aria-describedby={
													fieldHelp[key] ? `${key}-help` : undefined
												}
												className="block w-full rounded border bg-background p-2"
												type={
													key === 'authOpenIDClientSecret' && !reveal
														? 'password'
														: 'text'
												}
												autoComplete={
													key === 'authOpenIDClientSecret'
														? 'new-password'
														: 'off'
												}
												value={settings[key]}
												onChange={(event) =>
													setSettings({
														...settings,
														[key]: event.target.value,
													})
												}
											/>
										)}
										{fieldHelp[key] && (
											<span id={`${key}-help`} className="block text-sm">
												{help(fieldHelp[key])}
											</span>
										)}
									</label>
								))}
								<Button
									type="button"
									variant="outline"
									onClick={() => setReveal(!reveal)}
								>
									{reveal ? 'Hide client secret' : 'Reveal client secret'}
								</Button>{' '}
								<Button type="button" onClick={() => void discover()}>
									Auto-populate
								</Button>
								<label className="block">
									Mobile redirect URIs (one per line)
									<textarea
										className="block w-full rounded border bg-background p-2"
										value={settings.authOpenIDMobileRedirectURIs.join('\n')}
										onChange={(event) =>
											setSettings({
												...settings,
												authOpenIDMobileRedirectURIs: event.target.value
													.split('\n')
													.filter(Boolean),
											})
										}
									/>
								</label>
								<p>{help('LabelMobileRedirectURIsDescription')}</p>
								<label
									className="block"
									htmlFor="authOpenIDSubfolderForRedirectURLs"
								>
									Web redirect URLs subfolder
									<NativeSelect
										id="authOpenIDSubfolderForRedirectURLs"
										className="block rounded border bg-background p-2"
										value={settings.authOpenIDSubfolderForRedirectURLs ?? ''}
										onChange={(event) =>
											setSettings({
												...settings,
												authOpenIDSubfolderForRedirectURLs: event.target.value,
											})
										}
									>
										<option value="">None</option>
										{window.__ABS_WEB_CONFIG__?.apiBasePath && (
											<option value={window.__ABS_WEB_CONFIG__.apiBasePath}>
												{window.__ABS_WEB_CONFIG__.apiBasePath}
											</option>
										)}
									</NativeSelect>
								</label>
								<p>
									Web callback:{' '}
									<code>{`https://<your.server.com>${settings.authOpenIDSubfolderForRedirectURLs ?? ''}/auth/openid/callback`}</code>
								</p>
								<p>
									Mobile callback:{' '}
									<code>{`https://<your.server.com>${settings.authOpenIDSubfolderForRedirectURLs ?? ''}/auth/openid/mobile-redirect`}</code>
								</p>
								<label className="block" htmlFor="authOpenIDMatchExistingBy">
									{t('LabelMatchExistingUsersBy')}
									<NativeSelect
										id="authOpenIDMatchExistingBy"
										className="block rounded border bg-background p-2"
										value={settings.authOpenIDMatchExistingBy ?? ''}
										onChange={(event) =>
											setSettings({
												...settings,
												authOpenIDMatchExistingBy:
													event.target.value === 'email'
														? 'email'
														: event.target.value === 'username'
															? 'username'
															: null,
											})
										}
									>
										<option value="">Do not match</option>
										<option value="email">Email</option>
										<option value="username">Username</option>
									</NativeSelect>
								</label>
								<p>{help('LabelMatchExistingUsersByDescription')}</p>
								{(
									['authOpenIDAutoLaunch', 'authOpenIDAutoRegister'] as const
								).map((key) => (
									<label key={key} className="flex gap-2">
										<input
											type="checkbox"
											checked={settings[key]}
											onChange={(event) =>
												setSettings({
													...settings,
													[key]: event.target.checked,
												})
											}
										/>
										{key === 'authOpenIDAutoLaunch'
											? t('LabelAutoLaunch')
											: t('LabelAutoRegister')}
									</label>
								))}
								<p>{help('LabelAutoLaunchDescription')}</p>
								<p>{help('LabelAutoRegisterDescription')}</p>
								{settings.authOpenIDSamplePermissions !== undefined && (
									<details>
										<summary>Advanced permissions claim example</summary>
										<pre className="overflow-auto">
											{JSON.stringify(
												settings.authOpenIDSamplePermissions,
												null,
												2,
											)}
										</pre>
									</details>
								)}
								<p>{t('MessageAuthenticationOIDCChangesRestart')}</p>
							</div>
						)}
						<Button type="submit" disabled={!ready || pending}>
							{pending ? 'Saving…' : 'Save authentication settings'}
						</Button>
					</fieldset>
				</form>
			)}
		</section>
	)
}
