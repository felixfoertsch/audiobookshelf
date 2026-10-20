import {
	createRootRoute,
	type ErrorComponentProps,
	Link,
	Outlet,
	useNavigate,
	useRouterState,
} from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { getAuthGeneration, logout, useAuth } from '../api'
import { getLibraries } from '../catalog'
import {
	LibraryNameContext,
	LibraryNav,
	SearchForm,
} from '../features/catalog/browse'
import { ServerActivity } from '../features/catalog/server-activity'
import { Player } from '../player'
import { Button } from '../shared/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '../shared/components/ui/dropdown-menu'
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
	SidebarTrigger,
	useSidebar,
} from '../shared/components/ui/sidebar'

function ShellSidebarTrigger() {
	const { openMobile } = useSidebar()
	const trigger = useRef<HTMLButtonElement>(null)
	const wasOpen = useRef(false)
	useEffect(() => {
		if (wasOpen.current && !openMobile) trigger.current?.focus()
		wasOpen.current = openMobile
	}, [openMobile])
	return <SidebarTrigger ref={trigger} />
}

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
	const query = useRouterState({
		select: (state) => state.location.search as { q?: unknown },
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
			<SidebarProvider>
				<Sidebar>
					<SidebarHeader>
						<Link to="/" className="px-2 text-lg font-semibold">
							Audiobookshelf
						</Link>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="outline" className="w-full justify-between">
									<span className="truncate">
										Library: {currentLibrary?.name || 'Choose library'}
									</span>
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="start"
								className="max-w-[calc(100vw-2rem)]"
							>
								<DropdownMenuLabel>Library</DropdownMenuLabel>
								<DropdownMenuRadioGroup
									value={currentLibrary?.id || ''}
									onValueChange={(id) => {
										localStorage.setItem('currentLibraryId', id)
										void navigate({
											to: '/library/$library',
											params: { library: id },
										})
									}}
								>
									{libraries.map((library) => (
										<DropdownMenuRadioItem key={library.id} value={library.id}>
											<span className="truncate">{library.name}</span>
										</DropdownMenuRadioItem>
									))}
								</DropdownMenuRadioGroup>
							</DropdownMenuContent>
						</DropdownMenu>
					</SidebarHeader>
					<SidebarContent>
						{currentLibrary && (
							<LibraryNav
								library={currentLibrary.id}
								podcast={currentLibrary.mediaType === 'podcast'}
							/>
						)}
						<SidebarGroup>
							<SidebarGroupLabel>Account</SidebarGroupLabel>
							<SidebarMenu>
								<SidebarMenuItem>
									<SidebarMenuButton asChild>
										<Link to="/account">Account</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
							</SidebarMenu>
						</SidebarGroup>
						<SidebarGroup>
							<SidebarGroupLabel>
								{admin ? 'Administration' : 'About server'}
							</SidebarGroupLabel>
							<ServerActivity />
						</SidebarGroup>
					</SidebarContent>
				</Sidebar>
				<SidebarInset className="min-w-0">
					<AlphaNotice />
					<header className="flex flex-wrap items-center gap-3 border-b bg-card px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
						<ShellSidebarTrigger />
						<div className="min-w-0 basis-40 flex-1">
							{currentLibrary && (
								<SearchForm
									key={currentLibrary.id}
									library={currentLibrary.id}
									q={
										/^\/library\/[^/]+\/search\/?$/.test(pathname) &&
										typeof query.q === 'string'
											? query.q
											: ''
									}
								/>
							)}
						</div>{' '}
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="outline" className="max-w-full">
									<span className="truncate">{user.username} · Menu</span>
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="end"
								className="max-w-[calc(100vw-2rem)]"
							>
								<DropdownMenuItem asChild>
									<Link to="/config/stats">Your statistics</Link>
								</DropdownMenuItem>
								{(admin || permissions?.upload) && (
									<DropdownMenuItem asChild>
										<Link to="/upload">Upload</Link>
									</DropdownMenuItem>
								)}
								{admin && (
									<DropdownMenuItem asChild>
										<Link to="/config">Settings</Link>
									</DropdownMenuItem>
								)}
								<DropdownMenuItem asChild>
									<Link to="/account" className="min-w-0">
										<span className="truncate">{user.username} · Account</span>
									</Link>
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuLabel>Theme</DropdownMenuLabel>
								<DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
									<DropdownMenuRadioItem value="system">
										System
									</DropdownMenuRadioItem>
									<DropdownMenuRadioItem value="light">
										Light
									</DropdownMenuRadioItem>
									<DropdownMenuRadioItem value="dark">
										Dark
									</DropdownMenuRadioItem>
								</DropdownMenuRadioGroup>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									onSelect={() =>
										void logout().catch((error: unknown) =>
											setError(
												error instanceof Error
													? error.message
													: 'Logout failed',
											),
										)
									}
								>
									Sign out
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</header>
					<div
						id="content"
						className="mx-auto w-full min-w-0 min-h-[60vh] max-w-6xl px-4 py-8 pb-80"
					>
						{error && (
							<p role="alert" className="text-destructive">
								{error}
							</p>
						)}
						<LibraryNameContext.Provider value={currentLibrary?.name || ''}>
							{routeError ? <RouteError {...routeError} /> : <Outlet />}
						</LibraryNameContext.Provider>
					</div>
				</SidebarInset>
			</SidebarProvider>
			<Player />
			<footer className="px-5 pb-80 text-center text-xs text-muted-foreground">
				Audiobookshelf · Modern frontend 2026.10.20.1 · Original timeline · No
				offline media cache
			</footer>
		</>
	)
}
