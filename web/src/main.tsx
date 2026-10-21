import { createRouter, RouterProvider } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { io } from 'socket.io-client'
import { initializeAuth, setAuthSocket, useAuth } from './api'
import { applyProgressSocket } from './features/item/progress'
import { initializeCast } from './features/player/cast'
import { Login } from './login'
import { AlphaNotice } from './routes/__root'
import { routeTree } from './routeTree.gen'
import './theme.css'

const basePath = window.__ABS_WEB_CONFIG__?.basePath || '/new'
;(
	window as Window & { __ABS_SOCKET__?: ReturnType<typeof io> }
).__ABS_SOCKET__ = undefined
const router = createRouter({
	routeTree,
	basepath: basePath,
	scrollRestoration: true,
	defaultPreload: 'intent',
})
declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router
	}
}
function App() {
	const auth = useAuth()
	const userId = auth.user?.id
	const [startupError, setStartupError] = useState('')
	const castEnabled =
		userId && auth.bootstrap?.serverSettings?.chromecastEnabled === true
			? userId
			: undefined
	useEffect(() => {
		void initializeCast(!!castEnabled).catch(() => {
			/* Cast module exposes bounded SDK error in its control. */
		})
		return () => {
			void initializeCast(false)
		}
	}, [castEnabled])
	useEffect(() => {
		void initializeAuth().catch((error: unknown) =>
			setStartupError(
				error instanceof Error ? error.message : 'Server unavailable',
			),
		)
	}, [])
	useEffect(() => {
		if (!userId) return
		const socket = io(window.location.origin, {
			path: `${window.__ABS_WEB_CONFIG__?.apiBasePath || ''}/socket.io`,
			transports: ['websocket'],
		})
		setAuthSocket(socket)
		;(window as Window & { __ABS_SOCKET__?: typeof socket }).__ABS_SOCKET__ =
			socket
		const events = [
			'init',
			'episode_download_queued',
			'episode_download_started',
			'episode_download_finished',
			'episode_download_queue_cleared',
			'stream_open',
			'stream_closed',
			'stream_progress',
			'stream_ready',
			'stream_reset',
			'stream_error',
			'library_updated',
			'library_added',
			'library_removed',
			'item_added',
			'item_updated',
			'item_removed',
			'items_updated',
			'items_added',
			'episode_ad_analysis',
			'user_updated',
			'user_online',
			'user_offline',
			'user_stream_update',
			'author_updated',
			'author_removed',
			'series_updated',
			'notifications_updated',
			'user_session_closed',
			'user_item_progress_updated',
			'collection_added',
			'collection_updated',
			'collection_removed',
			'series_removed',
			'playlist_added',
			'playlist_updated',
			'playlist_removed',
			'task_started',
			'task_finished',
			'metadata_embed_queue_update',
			'track_started',
			'track_finished',
			'track_progress',
			'task_progress',
			'ereader-devices-updated',
			'backup_applied',
			'batch_quickmatch_complete',
			'admin_message',
			'log',
			'custom_metadata_provider_added',
			'custom_metadata_provider_removed',
		] as const
		for (const event of events)
			socket.on(event, (payload: unknown) => {
				if (useAuth.getState().user?.id !== userId) return
				applyProgressSocket(event, payload, userId)
				window.dispatchEvent(
					new CustomEvent('abs:socket', { detail: { event, payload } }),
				)
			})
		const relayStatus = (event: string, message: string) =>
			window.dispatchEvent(
				new CustomEvent('abs:socket', {
					detail: { event, payload: { message } },
				}),
			)
		socket.on('auth_failed', () => {
			setStartupError('Realtime authentication failed. Reload to reconnect.')
			relayStatus(
				'auth_failed',
				'Realtime authentication failed. Reload to reconnect.',
			)
		})
		socket.on('connect_error', () =>
			relayStatus('connect_error', 'Realtime connection unavailable.'),
		)
		socket.on('disconnect', () =>
			relayStatus('disconnect', 'Realtime connection disconnected.'),
		)
		socket.io.on('reconnect_attempt', () =>
			relayStatus('reconnect_attempt', 'Reconnecting realtime connection…'),
		)
		socket.io.on('reconnect_error', () =>
			relayStatus('reconnect_error', 'Realtime reconnection failed.'),
		)
		socket.io.on('reconnect_failed', () =>
			relayStatus(
				'reconnect_failed',
				'Realtime reconnection exhausted. Reload to retry.',
			),
		)
		socket.on('connect', () => {
			const token = localStorage.getItem('token')
			if (token) socket.emit('auth', token)
			window.dispatchEvent(
				new CustomEvent('abs:socket', {
					detail: { event: 'reconnect', payload: null },
				}),
			)
		})
		return () => {
			setAuthSocket(null)
			;(window as Window & { __ABS_SOCKET__?: typeof socket }).__ABS_SOCKET__ =
				undefined
			socket.disconnect()
		}
	}, [userId])
	if (auth.loading)
		return (
			<p role="status" className="p-8">
				Connecting to Audiobookshelf…
			</p>
		)
	if (
		!auth.user &&
		!/^\/(share(?:\/|$)|login(?:\/|$)|oops(?:\/|$))/.test(
			window.location.pathname.slice(basePath.length),
		)
	)
		return (
			<>
				<AlphaNotice />
				{startupError && (
					<p role="alert" className="p-4 text-destructive">
						{startupError}
					</p>
				)}
				<Login />
			</>
		)
	return <RouterProvider router={router} />
}
const root = document.getElementById('root')
if (!root) throw new Error('App root missing')
ReactDOM.createRoot(root).render(<App />)
