import {
	createFileRoute,
	Link,
	Navigate,
	Outlet,
	useRouterState,
} from '@tanstack/react-router'
import { useAuth } from '../api'

export const Route = createFileRoute('/config')({ component: Configuration })
const pages = [
	['/config', 'Settings'],
	['/config/libraries', 'Libraries'],
	['/config/users', 'Users'],
	['/config/api-keys', 'API keys'],
	['/config/sessions', 'Listening sessions'],
	['/config/backups', 'Backups'],
	['/config/log', 'Logs'],
	['/config/notifications', 'Notifications'],
	['/config/email', 'Email'],
	['/config/item-metadata-utils', 'Item metadata tools'],
	['/config/rss-feeds', 'RSS feeds'],
	['/config/authentication', 'Authentication'],
	['/config/stats', 'Your stats'],
] as const
function Configuration() {
	const user = useAuth((state) => state.user)
	const path = useRouterState({ select: (state) => state.location.pathname })
	const admin = user?.type === 'root' || user?.type === 'admin'
	if (!user) return <p role="alert">Sign in to access configuration.</p>
	return (
		<div className="grid gap-6 md:grid-cols-[12rem_minmax(0,1fr)]">
			<nav
				aria-label="Configuration"
				className="flex flex-wrap content-start gap-1 md:flex-col"
			>
				{pages
					.filter(([to]) => admin || to === '/config/stats')
					.map(([to, label]) => (
						<Link
							key={to}
							to={to}
							className="rounded px-3 py-2 hover:bg-accent"
							activeProps={{ className: 'bg-accent font-semibold' }}
							activeOptions={{ exact: to === '/config' }}
						>
							{label}
						</Link>
					))}
			</nav>
			<div className="min-w-0">
				{!admin && !path.replace(/\/$/, '').endsWith('/config/stats') ? (
					<Navigate to="/config/stats" replace />
				) : (
					<Outlet />
				)}
			</div>
		</div>
	)
}
