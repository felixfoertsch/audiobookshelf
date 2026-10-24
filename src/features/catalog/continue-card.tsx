import { Link } from '@tanstack/react-router'
import { useAuth } from '../../api'
import { episodeSchema, itemSchema } from '../../catalog'
import { duration } from '../../shared/lib/duration'
import { episodeProgress, mediaProgressSchema } from '../item/progress'
import type { Entry } from './browse-api'

export function ContinueCard({ entry }: { entry: Entry }) {
	const user = useAuth((state) => state.user)
	const item = itemSchema.parse(entry)
	const parsed = episodeSchema.safeParse(entry.recentEpisode)
	const episode = parsed.success ? parsed.data : undefined
	const parsedProgress = mediaProgressSchema.safeParse(entry.userMediaProgress)
	const progress =
		episodeProgress(user, item.id, episode?.id) ??
		(parsedProgress.success ? parsedProgress.data : undefined)
	const elapsed = progress?.currentTime ?? 0
	const total =
		episode?.duration ??
		episode?.audioFile?.duration ??
		progress?.duration ??
		item.media.duration
	return (
		<article className="space-y-2 rounded-xl bg-muted/40 p-3">
			<Link
				to="/item/$id"
				params={{ id: item.id }}
				className="block space-y-3 rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
			>
				<img
					alt=""
					loading="lazy"
					className="aspect-square w-full rounded-xl bg-muted object-cover"
					src={`${window.__ABS_WEB_CONFIG__?.apiBasePath || ''}/api/items/${encodeURIComponent(item.id)}/cover?token=${encodeURIComponent(localStorage.getItem('token') || '')}`}
				/>
				<h3 className="line-clamp-2 text-base font-semibold">
					{episode?.title || item.media.metadata.title}
				</h3>
			</Link>
			{episode && (
				<p className="truncate text-sm text-muted-foreground">
					{item.media.metadata.title}
				</p>
			)}
			<p className="h-5 text-xs text-muted-foreground">
				{total != null && total > 0
					? `${duration(elapsed) || '0:00'} of ${duration(total)} · ${Math.round(Math.min(1, Math.max(0, elapsed / total)) * 100)} %`
					: 'Listening progress unavailable'}
			</p>
		</article>
	)
}
