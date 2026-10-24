import { type FormEvent, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { api, initializeAuth, login, startOidcLogin, useAuth } from './api'
import { loginDestination } from './features/auth/navigation'
import { useT } from './features/i18n'
import { Button } from './shared/components/ui/button'

export function Login() {
	const t = useT()
	const [error, setError] = useState(
		() => new URLSearchParams(location.search).get('error') || '',
	)
	const [pending, setPending] = useState(false)
	const [username, setUsername] = useState(() =>
		useAuth.getState().serverStatus?.isInit === false ? 'root' : '',
	)
	const [password, setPassword] = useState('')
	const [confirm, setConfirm] = useState('')
	const status = useAuth((state) => state.serverStatus)
	const methods = useAuth((state) => state.authMethods)
	const startupError = useAuth((state) => state.startupError)
	const user = useAuth((state) => state.user)
	const library = useAuth((state) => state.defaultLibraryId)
	const launched = useRef(false)
	const redirected = useRef(false)
	useEffect(() => {
		if (!user || redirected.current) return
		redirected.current = true
		const target = loginDestination(user, library)
		location.assign(
			`${window.__ABS_WEB_CONFIG__?.basePath?.replace(/\/$/, '') ?? ''}${target}`,
		)
	}, [user, library])
	const setup = status?.isInit === false
	const local = setup || methods.length === 0 || methods.includes('local')
	useEffect(() => {
		const url = new URL(location.href)
		if (url.searchParams.has('error')) {
			url.searchParams.delete('error')
			history.replaceState(null, '', url)
		}
		const auto = url.searchParams.get('autoLaunch')
		if (
			!user &&
			status &&
			!launched.current &&
			!setup &&
			methods.includes('openid') &&
			(auto === '1' ||
				(status?.authFormData?.authOpenIDAutoLaunch && auto !== '0'))
		) {
			launched.current = true
			startOidcLogin()
		}
	}, [methods, setup, status, user])
	async function submit(event: FormEvent) {
		event.preventDefault()
		setError('')
		if (!username.trim()) {
			setError('Username required')
			return
		}
		if (setup && password !== confirm) {
			setError('Passwords do not match')
			return
		}
		if (
			setup &&
			!password &&
			!window.confirm('Create root user with no password?')
		)
			return
		setPending(true)
		try {
			if (setup) {
				await api('/init', z.unknown(), {
					method: 'POST',
					body: JSON.stringify({
						newRoot: { username: username.trim(), password },
					}),
				})
				location.reload()
			} else {
				await login(username.trim(), password)
			}
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Sign in failed')
		} finally {
			setPending(false)
		}
	}
	if (startupError)
		return (
			<main className="mx-auto max-w-md p-6 pt-16">
				<h1 className="text-2xl">Server could not be reached</h1>
				<p role="alert" className="my-4 text-destructive">
					{startupError}
				</p>
				<Button
					disabled={pending}
					onClick={async () => {
						setPending(true)
						try {
							await initializeAuth()
						} catch {
							/* Error remains visible in auth state. */
						} finally {
							setPending(false)
						}
					}}
				>
					Retry connection
				</Button>
			</main>
		)
	return (
		<main className="mx-auto max-w-md p-6 pt-16">
			<h1 className="text-3xl font-semibold">Audiobookshelf</h1>
			<h2 className="my-4 text-xl">
				{setup
					? 'Initial Server Setup · Create Root User'
					: t('HeaderLogin', [], 'Sign in')}
			</h2>
			{status?.authFormData?.authLoginCustomMessage && (
				// ServerSettings.authFormData sanitizes tags, attributes and URL schemes.
				<div
					className="mb-4 [&_a]:underline [&_ol]:list-decimal [&_ul]:list-disc"
					// biome-ignore lint/security/noDangerouslySetInnerHtml: Native server sanitizes this administrator-authored login message.
					dangerouslySetInnerHTML={{
						__html: status.authFormData.authLoginCustomMessage,
					}}
				/>
			)}
			{local && (
				<form onSubmit={submit} className="space-y-4">
					<label className="flex flex-col gap-2">
						{t('LabelUsername')}
						<input
							className="h-11 rounded-md border bg-background px-3"
							autoComplete="username"
							value={username}
							placeholder={setup ? 'root' : ''}
							disabled={pending}
							onChange={(e) => setUsername(e.target.value)}
						/>
					</label>
					<label className="flex flex-col gap-2">
						{t('LabelPassword')}
						<input
							className="h-11 rounded-md border bg-background px-3"
							type="password"
							autoComplete={setup ? 'new-password' : 'current-password'}
							value={password}
							disabled={pending}
							onChange={(e) => setPassword(e.target.value)}
						/>
					</label>
					{setup && (
						<>
							<label className="flex flex-col gap-2">
								Confirm Password
								<input
									className="h-11 rounded-md border bg-background px-3"
									type="password"
									autoComplete="new-password"
									value={confirm}
									disabled={pending}
									onChange={(e) => setConfirm(e.target.value)}
								/>
							</label>
							<h3>Directory Paths</h3>
							<label className="block">
								Config Path
								<input
									className="block w-full bg-muted p-2"
									disabled
									value={status.ConfigPath ?? ''}
								/>
							</label>
							<label className="block">
								Metadata Path
								<input
									className="block w-full bg-muted p-2"
									disabled
									value={status.MetadataPath ?? ''}
								/>
							</label>
						</>
					)}
					<Button type="submit" disabled={pending}>
						{pending
							? setup
								? 'Initializing…'
								: 'Signing in…'
							: setup
								? 'Initialize server'
								: 'Sign in'}
					</Button>
				</form>
			)}
			{error && (
				<p role="alert" className="my-4 text-destructive">
					{error}
				</p>
			)}
			{!setup && methods.includes('openid') && (
				<Button
					className="mt-4"
					variant="outline"
					disabled={pending}
					onClick={startOidcLogin}
				>
					{status?.authFormData?.authOpenIDButtonText || 'Login with OpenID'}
				</Button>
			)}
		</main>
	)
}
