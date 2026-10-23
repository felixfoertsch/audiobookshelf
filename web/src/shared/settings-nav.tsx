import { Link } from '@tanstack/react-router'
import { navigationMenuTriggerStyle } from './components/ui/navigation-menu'

export function UserSettingsNav() {
	return (
		<SettingsNav
			label="User settings"
			groups={[
				[
					'',
					[
						['/account', 'Account & preferences'],
						['/config/stats', 'Personal stats'],
					],
				],
			]}
		/>
	)
}

export function SettingsNav({
	label,
	groups,
}: {
	label: string
	groups: readonly (readonly [string, readonly (readonly [string, string])[]])[]
}) {
	return (
		<nav
			aria-label={label}
			className="flex gap-4 overflow-x-auto border-b pb-2"
			onKeyDown={(event) => {
				if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
					return
				const links = Array.from(event.currentTarget.querySelectorAll('a'))
				const index = links.indexOf(document.activeElement as HTMLAnchorElement)
				if (index < 0) return
				event.preventDefault()
				const next =
					event.key === 'Home'
						? 0
						: event.key === 'End'
							? links.length - 1
							: (index + (event.key === 'ArrowRight' ? 1 : -1) + links.length) %
								links.length
				links[next]?.focus()
			}}
		>
			{groups.map(([group, pages]) => (
				<div key={group} className="shrink-0 space-y-1">
					{group && (
						<p className="px-3 text-xs font-medium text-muted-foreground">
							{group}
						</p>
					)}
					<div className="flex gap-1">
						{pages.map(([to, text]) => (
							<Link
								key={to}
								to={to}
								activeOptions={{ exact: to === '/config' || to === '/account' }}
								className={navigationMenuTriggerStyle()}
								activeProps={{
									className: 'bg-accent text-accent-foreground',
									'aria-current': 'page',
								}}
							>
								{text}
							</Link>
						))}
					</div>
				</div>
			))}
		</nav>
	)
}
