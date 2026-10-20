import { useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import { api, useAuth } from '../../api'
import { Button } from '../../shared/components/ui/button'

const entry = z
	.object({
		timestamp: z.string(),
		level: z.number(),
		levelName: z.string(),
		message: z.string(),
	})
	.passthrough()
const schema = z.object({ currentDailyLogs: z.array(entry) }).passthrough()
const ok = z.object({}).passthrough()
const settingsSchema = z
	.object({
		user: z.object({ type: z.string() }),
		serverSettings: z.object({ logLevel: z.number() }),
	})
	.passthrough()
type Socket = { emit: (event: string, value?: unknown) => void }

export function Logs() {
	const user = useAuth((state) => state.user)
	const admin = user?.type === 'root' || user?.type === 'admin'
	const [logs, setLogs] = useState<z.infer<typeof entry>[]>([])
	const [term, setTerm] = useState('')
	const [level, setLevel] = useState(1)
	const [error, setError] = useState('')
	const [socketStatus, setSocketStatus] = useState('Connecting to live logs…')
	const container = useRef<HTMLDivElement>(null)
	const wasNearBottom = useRef(true)
	useEffect(() => {
		if (!admin) return
		let active = true
		const socket = (window as Window & { __ABS_SOCKET__?: Socket })
			.__ABS_SOCKET__
		void api('/api/authorize', settingsSchema, { method: 'POST' })
			.then((data) => {
				if (active) setLevel(data.serverSettings.logLevel)
			})
			.catch((e) => setError(message(e)))
		void api('/api/logger-data', schema)
			.then((data) => {
				if (active) setLogs(data.currentDailyLogs.slice(-5000))
			})
			.catch((e) => setError(message(e)))
		if (!socket) {
			setSocketStatus(
				'Live log socket unavailable; showing daily snapshot only.',
			)
			const reconnect = (event: Event) => {
				const detail = (event as CustomEvent<{ event: string }>).detail
				if (detail.event === 'reconnect')
					setSocketStatus(
						'Socket reconnected; reload page to resume live logs.',
					)
			}
			window.addEventListener('abs:socket', reconnect)
			return () => {
				active = false
				window.removeEventListener('abs:socket', reconnect)
			}
		}
		const listener = (event: Event) => {
			const detail = (event as CustomEvent<{ event: string; payload: unknown }>)
				.detail
			if (detail.event === 'log') {
				const parsed = entry.safeParse(detail.payload)
				if (parsed.success && active)
					setLogs((previous) => [...previous, parsed.data].slice(-5000))
			}
		}
		setSocketStatus('Live logs connected.')
		window.addEventListener('abs:socket', listener)
		const reconnect = (event: Event) => {
			const detail = (event as CustomEvent<{ event: string }>).detail
			if (detail.event === 'reconnect') {
				socket.emit('set_log_listener', level)
				setSocketStatus('Live logs reconnected.')
			}
		}
		window.addEventListener('abs:socket', reconnect)
		socket.emit('set_log_listener', level)
		return () => {
			active = false
			window.removeEventListener('abs:socket', listener)
			window.removeEventListener('abs:socket', reconnect)
			socket.emit('remove_log_listener')
		}
	}, [admin, level])
	useEffect(() => {
		if (!logs.length) return
		const node = container.current
		if (node && wasNearBottom.current) node.scrollTop = node.scrollHeight
	}, [logs])
	const visible = useMemo(
		() =>
			logs.filter(
				(log) =>
					log.level >= level &&
					log.message.toLowerCase().includes(term.trim().toLowerCase()),
			),
		[logs, level, term],
	)
	return (
		<section className="space-y-4">
			<h1 className="text-2xl">Server logs</h1>
			{!admin && <p role="alert">Administrator permission required.</p>}
			{error && <p role="alert">{error}</p>}
			<p role="status">{socketStatus}</p>
			<div className="flex flex-wrap gap-3">
				<label>
					Search logs
					<input
						value={term}
						onChange={(event) => setTerm(event.target.value)}
					/>
				</label>
				<label>
					Minimum level
					<select
						value={level}
						disabled={!admin}
						onChange={(event) => {
							const next = Number(event.target.value)
							void api('/settings', ok, {
								method: 'PATCH',
								body: JSON.stringify({ logLevel: next }),
							})
								.then(() => setLevel(next))
								.catch((e) => setError(message(e)))
						}}
					>
						<option value="1">Debug</option>
						<option value="2">Info</option>
						<option value="3">Warn</option>
					</select>
				</label>
				<Button
					variant="outline"
					disabled={!admin}
					onClick={() =>
						void api('/api/logger-data', schema)
							.then((data) => setLogs(data.currentDailyLogs))
							.catch((e) => setError(message(e)))
					}
				>
					Refresh
				</Button>
			</div>
			<div
				ref={container}
				onScroll={(event) => {
					const node = event.currentTarget
					wasNearBottom.current =
						node.scrollHeight - node.scrollTop - node.clientHeight < 48
				}}
				role="log"
				aria-label="Server log entries"
				className="h-[65vh] min-h-96 overflow-auto rounded bg-muted font-mono text-xs"
			>
				{visible.map((log) => (
					<div
						className="flex gap-3 border-b p-2"
						key={`${log.timestamp}-${log.level}-${log.message}`}
					>
						<time className="shrink-0">{log.timestamp}</time>
						<strong className="w-12 shrink-0">{log.levelName}</strong>
						<p className="whitespace-pre-wrap break-all">{log.message}</p>
					</div>
				))}
				{!visible.length && <p className="p-4">No log entries.</p>}
			</div>
		</section>
	)
}
function message(error: unknown) {
	return error instanceof Error ? error.message : 'Request failed'
}
