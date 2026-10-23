import { useRef, useState } from 'react'
import { z } from 'zod'
import { api } from '../../api'
import { playEpisode } from '../../player'
import { Button } from '../../shared/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogTitle,
} from '../../shared/components/ui/dialog'
import { dateTime } from '../../shared/date-time'
export function SessionDetails({
	session,
	onClose,
	onRefresh,
}: {
	session: {
		id: string
		userId?: string | null
		libraryId?: string | null
		libraryItemId?: string | null
		episodeId?: string | null
		mediaType?: string | null
		displayTitle?: string | null
		displayAuthor?: string | null
		duration?: number | null
		playMethod?: string | null
		mediaPlayer?: string | null
		deviceInfo?: Record<string, unknown> | null
		startedAt?: number | null
		updatedAt?: number | null
		timeListening?: number | null
		startTime?: number | null
		currentTime?: number | null
		user?: { username?: string } | null
		open?: boolean
	}
	onClose: () => void
	onRefresh: () => void
}) {
	const returnFocus = useRef(document.activeElement as HTMLElement | null)
	const [busy, setBusy] = useState(false),
		[error, setError] = useState('')
	const device = session.deviceInfo || {}
	const act = async (kind: 'delete' | 'close') => {
		if (busy) return
		if (
			kind === 'delete' &&
			!confirm(`Delete session ID ${session.id}? This cannot be undone.`)
		)
			return
		setBusy(true)
		setError('')
		try {
			await api(
				kind === 'delete'
					? `/sessions/${session.id}`
					: `/session/${session.id}/close`,
				z.object({}),
				{ method: kind === 'delete' ? 'DELETE' : 'POST' },
			)
			onClose()
			onRefresh()
		} catch (e) {
			setError(String(e))
		} finally {
			setBusy(false)
		}
	}
	const play = async () => {
		if (!session.libraryItemId) return
		const position = session.currentTime ?? 0
		if (
			!confirm(
				`Start ${session.displayTitle || 'session'} at ${position} seconds?`,
			)
		)
			return
		setBusy(true)
		setError('')
		try {
			await playEpisode(
				session.libraryItemId,
				session.episodeId || undefined,
				false,
				position,
			)
		} catch (e) {
			setError(String(e))
		} finally {
			setBusy(false)
		}
	}
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onClose()
			}}
		>
			<DialogContent
				aria-describedby={undefined}
				className="max-h-[90dvh] overflow-auto sm:max-w-2xl"
				onCloseAutoFocus={(event) => {
					event.preventDefault()
					returnFocus.current?.focus()
				}}
			>
				<section className="mx-auto max-w-2xl space-y-2">
					<DialogTitle>Session {session.id}</DialogTitle>
					<h3>{session.displayTitle || 'Unknown title'}</h3>
					<p>{session.displayAuthor}</p>
					<dl className="grid grid-cols-[10rem_1fr] gap-2">
						{Object.entries({
							user: session.user?.username || session.userId,
							startedAt: session.startedAt
								? dateTime(session.startedAt)
								: undefined,
							updatedAt: session.updatedAt
								? dateTime(session.updatedAt)
								: undefined,
							timeListening: session.timeListening,
							startTime: session.startTime,
							currentTime: session.currentTime,
							libraryId: session.libraryId,
							libraryItemId: session.libraryItemId,
							episodeId: session.episodeId,
							mediaType: session.mediaType,
							duration: session.duration,
							playMethod: session.playMethod,
							mediaPlayer: session.mediaPlayer,
							deviceInfo: JSON.stringify(device),
						})
							.filter(([, v]) => v !== undefined && v !== null)
							.map(([k, v]) => (
								<div className="contents" key={k}>
									<dt>{k}</dt>
									<dd>{String(v)}</dd>
								</div>
							))}
					</dl>
					{error && <p role="alert">{error}</p>}
					<Button
						disabled={busy || !session.libraryItemId}
						onClick={() => void play()}
					>
						Play from last position
					</Button>
					{session.open && (
						<Button disabled={busy} onClick={() => void act('close')}>
							Close session
						</Button>
					)}
					{!session.open && session.mediaPlayer !== 'web-share' && (
						<Button
							variant="destructive"
							disabled={busy}
							onClick={() => void act('delete')}
						>
							Delete session
						</Button>
					)}
					<Button variant="outline" disabled={busy} onClick={onClose}>
						Close details
					</Button>
				</section>
			</DialogContent>
		</Dialog>
	)
}
