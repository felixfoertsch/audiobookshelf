import {
	CheckCircle,
	Circle,
	CircleAlert,
	CircleHelp,
	History,
	Link2Off,
	LoaderCircle,
	Scissors,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { ApiError, api, useAuth } from '../../api'
import { Button } from '../../shared/components/ui/button'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '../../shared/components/ui/tooltip'
import { useT } from '../i18n'

const resultSchema = z.object({
	status: z.enum([
		'queued',
		'running',
		'candidates',
		'no_difference',
		'inconclusive',
		'unsupported',
		'failed',
		'cancelled',
		'stale',
	]),
	reason: z.string().nullish(),
	segments: z
		.array(
			z.object({
				start: z.number().nonnegative(),
				end: z.number().nonnegative(),
			}),
		)
		.optional(),
})
const eventSchema = z.object({
	libraryItemId: z.string(),
	episodeId: z.string(),
	adAnalysis: resultSchema.nullish(),
	adAnalysisEnabled: z.boolean().optional(),
})
const labels = {
	notAnalysed: 'Not analysed',
	queued: 'Analysis queued',
	running: 'Analysis running',
	candidates: 'Inserted audio found: {count} breaks, {seconds} seconds',
	no_difference: 'No inserted ads found',
	inconclusive: 'Analysis inconclusive',
	unsupported: 'Cannot analyse episode',
	failed: 'Analysis failed',
	stale: 'Analysis outdated',
	caveat:
		'Copies compared with no insertion differences found. Shared or baked-in ads can remain undetected.',
	retry: 'Select to queue analysis.',
	queueBusy:
		'Analysis queue is busy or this episode is already queued. Try again later.',
	unsupportedDetail:
		'Episode audio must be downloaded and a supported matching catalog copy must be available.',
	candidateDetail: 'Candidate insertion differences, not proof of advertising.',
} as const

type Props = {
	itemId: string
	episode: {
		id: string
		adAnalysis?: unknown
		audioFile?: unknown
		adAnalysisEnabled?: unknown
	}
	enabled?: boolean
}
export function AdAnalysisStatus({ itemId, episode, enabled }: Props) {
	const t = useT()
	const user = useAuth((state) => state.user)
	const admin = user?.type === 'admin' || user?.type === 'root'
	const [live, setLive] = useState<z.infer<typeof eventSchema> | null>(null)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState('')
	// biome-ignore lint/correctness/useExhaustiveDependencies: New server snapshot or row identity supersedes transient socket state.
	useEffect(() => {
		setLive(null)
		setError('')
	}, [itemId, episode.id, episode.adAnalysis, enabled])
	useEffect(() => {
		const receive = (event: Event) => {
			if (
				!(event instanceof CustomEvent) ||
				event.detail?.event !== 'episode_ad_analysis'
			)
				return
			const parsed = eventSchema.safeParse(event.detail.payload)
			if (
				parsed.success &&
				parsed.data.libraryItemId === itemId &&
				parsed.data.episodeId === episode.id
			)
				setLive(parsed.data)
		}
		window.addEventListener('abs:socket', receive)
		return () => window.removeEventListener('abs:socket', receive)
	}, [itemId, episode.id])
	const on =
		live?.adAnalysisEnabled ?? enabled ?? episode.adAnalysisEnabled === true
	if (!on) return null
	const parsed = resultSchema.safeParse(
		live ? live.adAnalysis : episode.adAnalysis,
	)
	const result = parsed.success ? parsed.data : null
	const raw = result?.status
	const state = !episode.audioFile
		? 'unsupported'
		: raw === 'cancelled'
			? 'failed'
			: raw && raw in labels
				? (raw as keyof typeof labels)
				: 'notAnalysed'
	const segments = result?.segments ?? []
	const seconds = Math.round(
		segments.reduce((sum, s) => sum + Math.max(0, s.end - s.start), 0),
	)
	const label = t(
		`AdAnalysis.${state}`,
		{ count: segments.length, seconds },
		labels[state],
	)
	const retry =
		admin &&
		!busy &&
		['notAnalysed', 'inconclusive', 'failed', 'stale'].includes(state)
	const Icon =
		state === 'queued' || state === 'running'
			? LoaderCircle
			: state === 'candidates'
				? Scissors
				: state === 'no_difference'
					? CheckCircle
					: state === 'inconclusive'
						? CircleHelp
						: state === 'unsupported'
							? Link2Off
							: state === 'failed'
								? CircleAlert
								: state === 'stale'
									? History
									: Circle
	const color =
		state === 'failed'
			? 'text-destructive'
			: ['inconclusive', 'stale'].includes(state)
				? 'text-amber-700 dark:text-amber-400'
				: ['candidates', 'no_difference'].includes(state)
					? 'text-green-700 dark:text-green-400'
					: 'text-muted-foreground'
	const icon = (
		<Icon
			aria-hidden="true"
			className={`size-4 ${['queued', 'running'].includes(state) ? 'motion-safe:animate-spin' : ''}`}
		/>
	)
	const queue = async () => {
		const previous = live
		setBusy(true)
		setError('')
		try {
			await api(
				`/api/podcasts/${encodeURIComponent(itemId)}/episode/${encodeURIComponent(episode.id)}/ad-analysis`,
				z.object({}).passthrough(),
				{ method: 'POST', body: '{}' },
			)
			setLive((current) =>
				current !== previous
					? current
					: {
							libraryItemId: itemId,
							episodeId: episode.id,
							adAnalysis: { status: 'queued' },
						},
			)
		} catch (cause) {
			setError(
				cause instanceof ApiError && cause.status === 409
					? t('AdAnalysis.queueBusy', [], labels.queueBusy)
					: cause instanceof Error
						? cause.message
						: 'Analysis could not be queued',
			)
		} finally {
			setBusy(false)
		}
	}
	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					{retry || busy ? (
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className={color}
							aria-label={label}
							disabled={busy}
							onClick={() => void queue()}
						>
							{icon}
						</Button>
					) : (
						<span
							role="img"
							// biome-ignore lint/a11y/noNoninteractiveTabindex: Read-only status needs keyboard access to explanatory tooltip.
							tabIndex={0}
							aria-label={label}
							className={`inline-flex items-center gap-1 ${color}`}
						>
							{icon}
							{state === 'candidates' && (
								<span aria-hidden="true">{segments.length}</span>
							)}
						</span>
					)}
				</TooltipTrigger>
				<TooltipContent className="max-w-xs">
					{label}.{' '}
					{state === 'no_difference' ? (
						t('AdAnalysis.caveat', [], labels.caveat)
					) : state === 'unsupported' ? (
						t('AdAnalysis.unsupportedDetail', [], labels.unsupportedDetail)
					) : state === 'candidates' ? (
						<>
							{t('AdAnalysis.candidateDetail', [], labels.candidateDetail)}{' '}
							{segments
								.map(
									(s) =>
										`${Math.floor(s.start / 60)}:${String(Math.floor(s.start % 60)).padStart(2, '0')}–${Math.floor(s.end / 60)}:${String(Math.floor(s.end % 60)).padStart(2, '0')}`,
								)
								.join(', ')}
						</>
					) : retry ? (
						t('AdAnalysis.retry', [], labels.retry)
					) : null}
				</TooltipContent>
			</Tooltip>
			{error && (
				<span role="alert" className="text-sm text-destructive">
					{error}
				</span>
			)}
		</TooltipProvider>
	)
}
