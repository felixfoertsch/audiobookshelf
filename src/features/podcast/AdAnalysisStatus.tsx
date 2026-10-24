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
import {
	analysisSchema,
	episodeAnalysisSchema,
	jobStatusSchema,
	paths,
} from '../../../contract/api'
import { ApiError, useAuth } from '../../api'
import { psbApi } from '../../psb-api'
import { Button } from '../../shared/components/ui/button'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '../../shared/components/ui/tooltip'
import { duration } from '../../shared/lib/duration'
import { useT } from '../i18n'

export const eventSchema = episodeAnalysisSchema.extend({
	libraryItemId: z.string(),
	episodeId: z.string(),
})
const labels = {
	cancelled: 'Analysis cancelled',
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
		duration?: number | null
	}
	enabled?: boolean
}
const statusFor = (result: z.infer<typeof episodeAnalysisSchema> | null) => {
	if (!result) return 'notAnalysed'
	if (result.status === 'complete')
		return result.segments.length ? 'candidates' : 'no_difference'
	if (result.status === 'error' || result.status === 'interrupted')
		return 'failed'
	if (result.status === 'disabled') return 'notAnalysed'
	return result.status
}
export function AdAnalysisStatus({ itemId, episode, enabled }: Props) {
	const t = useT()
	const user = useAuth((state) => state.user)
	const userId = user?.id
	const admin = user?.type === 'admin' || user?.type === 'root'
	const [live, setLive] = useState<z.infer<typeof eventSchema> | null>(null)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState('')
	const [corpus, setCorpus] = useState('')
	const on =
		live?.adAnalysisEnabled ?? enabled ?? episode.adAnalysisEnabled === true
	// biome-ignore lint/correctness/useExhaustiveDependencies: Episode identity and consent changes invalidate displayed sidecar state.
	useEffect(() => {
		setLive(null)
		setError('')
	}, [itemId, episode.id, episode.adAnalysis, enabled])
	useEffect(() => {
		let active = true
		let delay = 5_000
		let timer = 0
		let controller: AbortController | undefined
		if (!userId) return
		const poll = async () => {
			if (document.hidden) {
				timer = window.setTimeout(poll, 30_000)
				return
			}
			controller = new AbortController()
			try {
				const response = await psbApi(
					`/api/items/${encodeURIComponent(itemId)}/analysis`,
					analysisSchema,
					{ signal: controller.signal },
				)
				if (!active) return
				const value = response.episodes[episode.id]
				let jobs: z.infer<typeof jobStatusSchema> = { jobs: [] }
				try {
					jobs = await psbApi(
						paths.status.replace(':itemId', encodeURIComponent(itemId)),
						jobStatusSchema,
						{ signal: controller.signal },
					)
				} catch {
					if (!active || controller.signal.aborted) return
				}
				const analysisJob = jobs.jobs.find(
					(job) =>
						job.kind === 'analysis' &&
						job.itemId === itemId &&
						job.episodeId === episode.id,
				)
				if (value)
					setLive({ ...value, libraryItemId: itemId, episodeId: episode.id })
				else if (
					analysisJob &&
					(analysisJob.status === 'queued' || analysisJob.status === 'running')
				)
					setLive({
						status: analysisJob.status,
						version: null,
						sourceSha256: null,
						segments: [],
						adAnalysisEnabled: true,
						applicable: false,
						libraryItemId: itemId,
						episodeId: episode.id,
					})
				delay =
					analysisJob?.status === 'queued' ||
					analysisJob?.status === 'running' ||
					value?.status === 'queued' ||
					value?.status === 'running'
						? 5_000
						: 30_000
			} catch {
				setLive(null)
				if (!active || controller.signal.aborted) return
				delay = Math.min(delay * 2, 30_000)
			} finally {
				if (active)
					timer = window.setTimeout(poll, document.hidden ? 30_000 : delay)
			}
		}
		const visibility = () => {
			if (!document.hidden) {
				window.clearTimeout(timer)
				void poll()
			} else controller?.abort()
		}
		void poll()
		document.addEventListener('visibilitychange', visibility)
		return () => {
			active = false
			window.clearTimeout(timer)
			controller?.abort()
			document.removeEventListener('visibilitychange', visibility)
		}
	}, [itemId, episode.id, userId])
	useEffect(() => {
		let active = true
		setCorpus('')
		if (!admin || !on) return
		void psbApi(
			`/api/podcasts/${encodeURIComponent(itemId)}/episode/${encodeURIComponent(episode.id)}/ad-analysis/corpus`,
			z.object({
				count: z.number().int().nonnegative(),
				totalBytes: z.number().nonnegative(),
				collectionPaused: z.boolean(),
			}),
		)
			.then((value) => {
				if (active)
					setCorpus(
						`Corpus: ${value.count} versions; ${value.totalBytes.toLocaleString()} bytes across corpus${value.collectionPaused ? '; collection paused' : ''}.`,
					)
			})
			.catch(() => {
				if (active) setCorpus('Corpus unavailable.')
			})
		return () => {
			active = false
		}
	}, [admin, on, itemId, episode.id])
	if (!on) return null
	const parsed = episodeAnalysisSchema.safeParse(live ?? episode.adAnalysis)
	const result = parsed.success ? parsed.data : null
	const state = !episode.audioFile ? 'unsupported' : statusFor(result)
	const segments = result?.segments ?? []
	const seconds = Math.round(
		segments.reduce((sum, s) => sum + s.end - s.start, 0),
	)
	const label = t(
		`AdAnalysis.${state}`,
		{ count: segments.length, seconds },
		labels[state as keyof typeof labels],
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
		setBusy(true)
		setError('')
		try {
			await psbApi(
				`/api/podcasts/${encodeURIComponent(itemId)}/episode/${encodeURIComponent(episode.id)}/ad-analysis`,
				z.object({ queued: z.boolean() }),
				{
					method: 'POST',
					body: JSON.stringify({}),
				},
			)
			setLive({
				status: 'queued',
				version: null,
				sourceSha256: null,
				segments: [],
				adAnalysisEnabled: true,
				applicable: false,
				libraryItemId: itemId,
				episodeId: episode.id,
			})
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
							className={`min-h-6 min-w-6 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 ${color}`}
							aria-label={label}
							disabled={busy}
							onClick={() => void queue()}
						>
							{icon}
						</Button>
					) : (
						<span
							role="img"
							// biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need focus to read analysis tooltip.
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
					{corpus && <p>{corpus}</p>}
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
									(s) => `${duration(s.start, true)}–${duration(s.end, true)}`,
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
