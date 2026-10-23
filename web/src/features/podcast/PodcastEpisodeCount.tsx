import { useEffect, useState } from 'react'
import { z } from 'zod'
import { api, useAuth } from '../../api'

const summarySchema = z.object({
	total: z.number().int().nonnegative(),
	unplayed: z.number().int().nonnegative(),
	source: z.enum(['feed', 'downloaded']),
})

// Feed totals count downloadable RSS entries; missing feeds expose downloaded counts only.
export function PodcastEpisodeCount({
	itemId,
	downloaded,
}: {
	itemId: string
	downloaded?: number
}) {
	const userId = useAuth((state) => state.user?.id)
	const [summary, setSummary] = useState<z.infer<typeof summarySchema> | null>(
		null,
	)
	const [unavailable, setUnavailable] = useState(false)
	useEffect(() => {
		let active = true
		const controller = new AbortController()
		setSummary(null)
		setUnavailable(false)
		const reload = () => {
			void api(
				`/api/podcasts/${encodeURIComponent(itemId)}/episode-summary`,
				summarySchema,
				{ signal: controller.signal },
			)
				.then((value) => {
					if (active && useAuth.getState().user?.id === userId)
						setSummary(value)
				})
				.catch(() => {
					if (active) {
						setSummary(null)
						setUnavailable(true)
					}
				})
		}
		reload()
		window.addEventListener('abs:progress-changed', reload)
		return () => {
			active = false
			controller.abort()
			window.removeEventListener('abs:progress-changed', reload)
		}
	}, [itemId, userId])
	return (
		<p className="text-xs" aria-live="polite">
			{summary
				? `${summary.unplayed.toLocaleString()} unplayed of ${summary.total.toLocaleString()}${summary.source === 'downloaded' ? ' downloaded · feed unavailable' : ''}`
				: `${downloaded == null ? 'Downloaded count unavailable' : `${downloaded.toLocaleString()} downloaded`}${unavailable ? ' · feed unavailable' : ' · checking feed…'}`}
		</p>
	)
}
