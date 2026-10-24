import { type FormEvent, useEffect, useRef, useState } from 'react'
import { initializeAuth, login, startOidcLogin, useAuth } from './api'
import { loginDestination } from './features/auth/navigation'
import { useT } from './features/i18n'
import { Button } from './shared/components/ui/button'

export function Login() {
	const t = useT()
	const [error, setError] = useState(
		() => new URLSearchParams(location.search).get('error') || '',
	)
	const [pending, setPending] = useState(false)
	const [username, setUsername] = useState('')
	const [password, setPassword] = useState('')
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
		setPending(true)
		try {
			await login(username.trim(), password)
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Sign in failed')
		} finally {
			setPending(false)
		}
	}
	if (setup)
		return (
			<main className="mx-auto max-w-md p-6 pt-16">
				<p role="alert">Upstream server must be initialized separately.</p>
			</main>
		)
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
			<h2 className="my-4 text-xl">{t('HeaderLogin', [], 'Sign in')}</h2>
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
							placeholder=""
							disabled={pending}
							onChange={(e) => setUsername(e.target.value)}
						/>
					</label>
					<label className="flex flex-col gap-2">
						{t('LabelPassword')}
						<input
							className="h-11 rounded-md border bg-background px-3"
							type="password"
							autoComplete="current-password"
							value={password}
							disabled={pending}
							onChange={(e) => setPassword(e.target.value)}
						/>
					</label>
					<Button type="submit" disabled={pending}>
						{pending ? 'Signing in…' : 'Sign in'}
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
