import { useEffect, useState } from 'react'
import type { z } from 'zod'
import { summarySchema } from '../../../contract/api'
import { useAuth } from '../../api'
import { psbApi } from '../../psb-api'

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
			void psbApi(
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
		<p className="h-8 text-xs leading-4" aria-live="polite">
			{summary
				? `${Math.max(0, summary.total - summary.unplayed).toLocaleString()}/${summary.total.toLocaleString()} (${summary.total ? Math.round((Math.max(0, summary.total - summary.unplayed) / summary.total) * 100) : 0} %)${summary.source === 'downloaded' ? ' downloaded · feed unavailable' : ''}`
				: `${downloaded == null ? 'Downloaded count unavailable' : `${downloaded.toLocaleString()} downloaded`}${unavailable ? ' · feed unavailable' : ' · checking feed…'}`}
		</p>
	)
}
