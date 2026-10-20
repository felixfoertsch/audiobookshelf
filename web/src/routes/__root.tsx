import {
	createRootRoute,
	type ErrorComponentProps,
	Link,
	Outlet,
	useNavigate,
	useRouterState,
} from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { getAuthGeneration, logout, useAuth } from '../api'
import { getLibraries } from '../catalog'
import { LibraryNav, SearchForm } from '../features/catalog/browse'
import { ServerActivity } from '../features/catalog/server-activity'
import { Player } from '../player'
import { Button } from '../shared/components/ui/button'

export function AlphaNotice() {
	return (
		<aside
			aria-label="Alpha frontend"
			className="border-b bg-card px-5 py-3 text-sm"
		>
			Alpha 1 · Incomplete Classic parity.{' '}
			<a
				href={`${window.__ABS_WEB_CONFIG__?.apiBasePath || ''}/?classic=1`}
				className="underline"
			>
				Open Classic
			</a>
		</aside>
	)
}
export function RouteError({ error }: ErrorComponentProps) {
	return (
		<section role="alert" className="space-y-4">
			<h1 className="text-2xl font-semibold">Could not load this page</h1>
			<p>
				{error instanceof Error ? error.message : 'Unexpected server response'}
			</p>
			<Button variant="outline" onClick={() => window.location.reload()}>
				Retry
			</Button>
			<p>
				<Link to="/" className="text-primary underline">
					Libraries
				</Link>
			</p>
		</section>
	)
}
export const Route = createRootRoute({
	component: Layout,
	errorComponent: ({ error, reset }) => (
		<Layout routeError={{ error, reset }} />
	),
	pendingComponent: () => <p role="status">Loading…</p>,
	notFoundComponent: () => (
		<p>
			Page not found. <Link to="/">Open libraries</Link>
		</p>
	),
})
export function Layout({
	routeError,
}: {
	routeError?: ErrorComponentProps
} = {}) {
	const [theme, setTheme] = useState(
		() => localStorage.getItem('abs-modern-theme') || 'system',
	)
	const [error, setError] = useState('')
	useEffect(() => {
		const media = window.matchMedia('(prefers-color-scheme: dark)')
		const update = () =>
			document.documentElement.classList.toggle(
				'dark',
				theme === 'dark' || (theme === 'system' && media.matches),
			)
		update()
		media.addEventListener('change', update)
		localStorage.setItem('abs-modern-theme', theme)
		return () => media.removeEventListener('change', update)
	}, [theme])
	const user = useAuth((state) => state.user)
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	})
	const routeIds = useRouterState({
		select: (state) => state.matches.map((match) => match.routeId),
	})
	const blank = routeIds.some(
		(id) => id === '/login' || id.startsWith('/share/'),
	)
	const navigate = useNavigate()
	const [libraries, setLibraries] = useState<
		Awaited<ReturnType<typeof getLibraries>>['libraries']
	>([])
	const currentLibrary =
		libraries.find((library) => pathname.split('/').includes(library.id)) ||
		libraries.find(
			(library) => library.id === localStorage.getItem('currentLibraryId'),
		) ||
		libraries[0]
	useEffect(() => {
		if (!user || blank) {
			setLibraries([])
			return
		}
		let active = true
		const generation = getAuthGeneration()
		void getLibraries()
			.then((data) => {
				if (active && generation === getAuthGeneration())
					setLibraries(data.libraries)
			})
			.catch((error: unknown) => {
				if (active && generation === getAuthGeneration())
					setError(
						error instanceof Error ? error.message : 'Could not load libraries',
					)
			})
		return () => {
			active = false
		}
	}, [user, blank])
	useEffect(() => {
		if (!user || blank) return
		let active = true
		const generation = getAuthGeneration()
		const refresh = (event: Event) => {
			const name = (event as CustomEvent<{ event?: string }>).detail?.event
			if (name && /^(library_|init|reconnect)/.test(name))
				void getLibraries()
					.then((data) => {
						if (
							active &&
							generation === getAuthGeneration() &&
							useAuth.getState().user?.id === user.id
						)
							setLibraries(data.libraries)
					})
					.catch((cause: unknown) => {
						if (active && generation === getAuthGeneration())
							setError(
								cause instanceof Error
									? cause.message
									: 'Library refresh failed',
							)
					})
		}
		window.addEventListener('abs:socket', refresh)
		return () => {
			active = false
			window.removeEventListener('abs:socket', refresh)
		}
	}, [user, blank])
	if (!user || blank)
		return (
			<>
				<AlphaNotice />
				<main id="content" className="mx-auto max-w-6xl px-5 py-8">
					{routeError ? <RouteError {...routeError} /> : <Outlet />}
				</main>
			</>
		)
	const admin = user.type === 'admin' || user.type === 'root'
	const permissions = user.permissions as { upload?: boolean } | undefined
	return (
		<>
			<a
				href="#content"
				className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-background focus:p-4"
			>
				Skip to content
			</a>
			<AlphaNotice />
			<header className="border-b bg-card pt-[env(safe-area-inset-top)]">
				<div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-5 py-4">
					<ServerActivity />
					<Link to="/" className="text-lg font-semibold">
						Audiobookshelf
					</Link>
					<label>
						Library{' '}
						<select
							className="rounded border bg-background p-2"
							value={currentLibrary?.id || ''}
							onChange={(event) => {
								if (event.target.value) {
									localStorage.setItem('currentLibraryId', event.target.value)
									void navigate({
										to: '/library/$library',
										params: { library: event.target.value },
									})
								}
							}}
						>
							<option value="">Choose library</option>
							{libraries.map((library) => (
								<option key={library.id} value={library.id}>
									{library.name}
								</option>
							))}
						</select>
					</label>
					<nav
						aria-label="Main"
						className="flex flex-1 flex-wrap items-center justify-end gap-3"
					>
						<Link to="/config/stats">Your statistics</Link>
						{(admin || permissions?.upload) && <Link to="/upload">Upload</Link>}
						{admin && <Link to="/config">Settings</Link>}
						<Link to="/account">{user.username} · Account</Link>
						<label className="text-sm">
							Theme{' '}
							<select
								className="rounded-md border bg-background p-2"
								value={theme}
								onChange={(event) => setTheme(event.target.value)}
							>
								<option value="system">System</option>
								<option value="light">Light</option>
								<option value="dark">Dark</option>
							</select>
						</label>
						<Button
							variant="outline"
							onClick={() =>
								void logout().catch((error: unknown) =>
									setError(
										error instanceof Error ? error.message : 'Logout failed',
									),
								)
							}
						>
							Sign out
						</Button>
					</nav>
				</div>
				{currentLibrary && (
					<div className="mx-auto max-w-6xl space-y-3 px-5 pb-4">
						<SearchForm library={currentLibrary.id} />
						<LibraryNav
							library={currentLibrary.id}
							podcast={currentLibrary.mediaType === 'podcast'}
						/>
					</div>
				)}
			</header>
			<main
				id="content"
				className="mx-auto min-h-[60vh] max-w-6xl px-5 py-8 pb-80"
			>
				{error && (
					<p role="alert" className="text-destructive">
						{error}
					</p>
				)}
				{routeError ? <RouteError {...routeError} /> : <Outlet />}
			</main>
			<Player />
			<footer className="px-5 pb-80 text-center text-xs text-muted-foreground">
				Audiobookshelf · Modern frontend 2026.10.20 · Original timeline · No
				offline media cache
			</footer>
		</>
	)
}
