import {
	createFileRoute,
	Navigate,
	Outlet,
	useRouterState,
} from '@tanstack/react-router'
import { useAuth } from '../api'
import { SettingsNav, UserSettingsNav } from '../shared/settings-nav'

export const Route = createFileRoute('/config')({ component: Configuration })
const groups = [
	[
		'Server',
		[
			['/config', 'Server settings'],
			['/config/backups', 'Backups'],
			['/config/notifications', 'Notifications'],
			['/config/email', 'Email'],
		],
	],
	[
		'Users & access',
		[
			['/config/users', 'Users'],
			['/config/authentication', 'Authentication'],
			['/config/api-keys', 'API keys'],
		],
	],
	[
		'Content',
		[
			['/config/libraries', 'Libraries'],
			['/config/item-metadata-utils', 'Item metadata tools'],
			['/config/rss-feeds', 'RSS feeds'],
		],
	],
	[
		'Monitoring',
		[
			['/config/sessions', 'Listening sessions'],
			['/config/log', 'Logs'],
			['/debug/issues', 'Debug issues'],
		],
	],
] as const
function Configuration() {
	const user = useAuth((state) => state.user)
	const path = useRouterState({ select: (state) => state.location.pathname })
	const admin = user?.type === 'root' || user?.type === 'admin'
	const personal = path.replace(/\/$/, '').endsWith('/config/stats')
	if (!user) return <p role="alert">Sign in to access configuration.</p>
	if (!admin && !personal) return <Navigate to="/config/stats" replace />
	return (
		<div className="space-y-6">
			<h1 className="text-2xl font-semibold">
				{personal ? 'User settings' : 'Admin settings'}
			</h1>
			{personal ? (
				<UserSettingsNav />
			) : (
				<SettingsNav label="Admin settings" groups={groups} />
			)}
			<div className="min-w-0">
				<Outlet />
			</div>
		</div>
	)
}
