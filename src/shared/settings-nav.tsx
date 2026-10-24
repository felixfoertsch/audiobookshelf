import { Link, useRouterState } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { navigationMenuTriggerStyle } from './components/ui/navigation-menu'
import { cn } from './lib/utils'

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
	const nav = useRef<HTMLElement>(null)
	const path = useRouterState({ select: (state) => state.location.pathname })
	useEffect(() => {
		if (!path || !window.matchMedia('(max-width: 767px)').matches) return
		const current = nav.current?.querySelector<HTMLElement>(
			'[aria-current="page"]',
		)
		if (current && nav.current)
			nav.current.scrollLeft = current.offsetLeft - nav.current.offsetLeft
	}, [path])
	return (
		<nav
			ref={nav}
			aria-label={label}
			className="relative flex gap-4 overflow-x-auto border-b pb-2 md:flex-wrap md:overflow-visible"
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
								className={cn(
									navigationMenuTriggerStyle(),
									'focus:bg-transparent focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-accent-foreground aria-[current=page]:font-semibold',
								)}
								activeProps={{
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
