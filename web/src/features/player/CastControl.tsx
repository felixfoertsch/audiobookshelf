import { createElement, useState } from 'react'
import { Button } from '../../shared/components/ui/button'
import { disconnectCast, useCast } from './cast'
export function CastControl({
	remote,
	onTransfer,
	busy: transferBusy = false,
}: {
	remote: boolean
	busy?: boolean
	onTransfer: (target: 'local' | 'cast') => Promise<unknown>
}) {
	const cast = useCast(),
		[busy, setBusy] = useState(false),
		[error, setError] = useState('')
	async function transfer(target: 'local' | 'cast') {
		setBusy(true)
		setError('')
		try {
			await onTransfer(target)
		} catch (error) {
			setError(error instanceof Error ? error.message : 'Audio transfer failed')
		} finally {
			setBusy(false)
		}
	}
	if (!cast.available && !cast.error && !remote) return null
	return (
		<section
			aria-label="Cast controls"
			className="flex flex-wrap items-center gap-3"
		>
			<span>
				Cast{' '}
				{cast.connected
					? `connected${cast.device ? `: ${cast.device}` : ''}`
					: 'disconnected'}
			</span>
			{cast.available && !window.isSecureContext && (
				<p>
					Cast requires a secure connection and receiver-reachable server URL.
				</p>
			)}
			{cast.available &&
				createElement('google-cast-launcher', {
					'aria-label': 'Choose Cast device',
					className: 'block size-8',
				})}
			{cast.connected && !remote && (
				<Button
					variant="outline"
					disabled={busy || transferBusy}
					onClick={() => void transfer('cast')}
				>
					Transfer audio to Cast
				</Button>
			)}
			{remote && (
				<Button
					variant="outline"
					disabled={busy || transferBusy}
					onClick={() => void transfer('local')}
				>
					Return to local
				</Button>
			)}
			{cast.connected && (
				<Button
					variant="outline"
					disabled={busy || transferBusy}
					onClick={() => disconnectCast()}
				>
					Disconnect Cast
				</Button>
			)}
			{(error || cast.error) && <p role="alert">{error || cast.error}</p>}
			<span className="text-xs text-muted-foreground">
				Direct audio only. Receiver and hardware compatibility unverified.
			</span>
		</section>
	)
}
