import { Link } from '@tanstack/react-router'
import {
	configureDebug,
	DebugDashboard,
	DebugOverlay,
	disableDebug,
	useDebugEnabled,
} from 'debug-overlay/client'
import { useEffect } from 'react'
import { z } from 'zod'
import { api, useAuth } from '../api'
import { usePlayer } from '../player'
import { DropdownMenuCheckboxItem } from '../shared/components/ui/dropdown-menu'
import 'debug-overlay/styles.css'

const transport = (
	path: string,
	{ method, body }: { method?: string; body?: unknown },
) =>
	api(`/debug${path}`, z.unknown(), {
		method,
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	})
const configure = (enabled: boolean) =>
	configureDebug({ enabled, transport, storageKey: 'abs-modern-debug-unused' })
const identity = () => {
	const user = useAuth.getState().user
	return user && ['admin', 'root'].includes(String(user.type))
		? `${user.id}:${user.type}`
		: ''
}
let owner = identity()
configure(false)
useAuth.subscribe(() => {
	const next = identity()
	if (next !== owner) {
		owner = next
		configure(false)
	}
})
window.addEventListener('abs:logout-start', () => configure(false))
const modernBase = () =>
	(window.__ABS_WEB_CONFIG__?.basePath || '/new').replace(/\/$/, '')
const href = (path: string) => `${modernBase()}${path}`
const renderLink = (mapped: string, label: string) => (
	<Link to={mapped.slice(modernBase().length) || '/'}>{label}</Link>
)

export function DebugMenu() {
	const enabled = useDebugEnabled()
	return (
		<DropdownMenuCheckboxItem
			checked={enabled}
			onCheckedChange={(checked) =>
				checked ? configure(!!identity()) : disableDebug()
			}
		>
			Debug
		</DropdownMenuCheckboxItem>
	)
}
export function RouteDebugOverlay({ path }: { path: string }) {
	const enabled = useDebugEnabled()
	const user = useAuth((state) => state.user)
	const playerVisible = usePlayer((state) => !!(state.session || state.error))
	const allowed = !!user && ['admin', 'root'].includes(String(user.type))
	useEffect(() => {
		if (!enabled || !allowed || typeof ResizeObserver === 'undefined') return
		const update = () => {
			const player = document.querySelector('[aria-label="Audio player"]')
			document.documentElement.style.setProperty(
				'--debug-overlay-bottom',
				`${playerVisible ? player?.getBoundingClientRect().height || 0 : 0}px`,
			)
		}
		const resize = new ResizeObserver(update)
		const player = document.querySelector('[aria-label="Audio player"]')
		if (player) resize.observe(player)
		update()
		return () => {
			resize.disconnect()
			document.documentElement.style.removeProperty('--debug-overlay-bottom')
		}
	}, [enabled, allowed, playerVisible])
	return (
		<DebugOverlay
			key={path}
			routePath={path}
			dashboardHref={href('/debug/issues')}
			renderDashboardLink={renderLink}
		/>
	)
}
export function DebugIssues() {
	const enabled = useDebugEnabled()
	const user = useAuth((state) => state.user)
	if (!user || !['admin', 'root'].includes(String(user.type)))
		return <p role="alert">Permission denied.</p>
	if (!enabled)
		return (
			<section>
				<p>Debug is disabled.</p>
				<button type="button" onClick={() => configure(!!identity())}>
					Enable debug
				</button>
			</section>
		)
	return <DebugDashboard routeHref={href} renderLink={renderLink} />
}
