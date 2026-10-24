import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { api, useAuth } from '../../api'

export const feedFields = {
	downloaded: z.boolean().optional(),
	guid: z.string().nullish(),
	enclosure: z
		.object({ url: z.string(), type: z.string().optional() })
		.passthrough()
		.nullish(),
}
export type FeedEpisode = {
	id: string
	libraryItemId: string
	title?: string | null
	guid?: string | null
	enclosure?: { url: string } | null
	publishedAt?: number | null
	duration?: number | null
	downloaded?: boolean
}
const download = z.object({
	libraryItemId: z.string(),
	url: z.string().nullish(),
	guid: z.string().nullish(),
	startedAt: z.number().nullish(),
	isFinished: z.boolean().optional(),
})
const queue = z.object({
	queue: z.array(download),
	currentDownload: download.nullish(),
})
export const canDownloadEpisodes = (user: unknown) =>
	z
		.object({
			type: z.enum(['root', 'admin']),
			permissions: z
				.object({
					download: z.boolean().optional(),
					update: z.boolean().optional(),
				})
				.optional(),
		})
		.refine(
			(u) =>
				u.permissions?.download !== false && u.permissions?.update !== false,
		)
		.safeParse(user).success

export function useEpisodeDownloads(libraryId: string, refresh: () => void) {
	const user = useAuth((s) => s.user)
	const [downloads, setDownloads] = useState<z.infer<typeof download>[]>([])
	const [pending, setPending] = useState<string[]>([])
	const requested = useRef(new Map<string, FeedEpisode>())
	const [error, setError] = useState('')
	useEffect(() => {
		if (!user?.id || !libraryId) return
		let active = true
		const load = () =>
			void api(
				`/api/libraries/${encodeURIComponent(libraryId)}/episode-downloads`,
				queue,
			)
				.then((result) => {
					if (active)
						setDownloads([
							...result.queue,
							...(result.currentDownload && !result.currentDownload.isFinished
								? [result.currentDownload]
								: []),
						])
				})
				.catch(() => {
					if (active) setError('Download queue unavailable')
				})
		load()
		const receive = (event: Event) => {
			const detail = (event as CustomEvent<{ event: string; payload: unknown }>)
				.detail
			if (
				[
					'init',
					'reconnect',
					'episode_download_queued',
					'episode_download_started',
					'episode_download_finished',
					'episode_download_queue_cleared',
				].includes(detail?.event)
			) {
				load()
				if (
					[
						'episode_download_finished',
						'episode_download_queue_cleared',
						'init',
						'reconnect',
					].includes(detail.event)
				) {
					if (detail.event === 'episode_download_queue_cleared') {
						requested.current.clear()
						setPending([])
					} else if (detail.event === 'episode_download_finished') {
						const finished = download.safeParse(detail.payload)
						if (finished.success) {
							for (const [id, episode] of requested.current) {
								if (
									finished.data.libraryItemId === episode.libraryItemId &&
									((episode.guid && finished.data.guid === episode.guid) ||
										finished.data.url === episode.enclosure?.url)
								)
									requested.current.delete(id)
							}
							setPending([...requested.current.keys()])
						}
					}
					refresh()
				}
				if (
					detail.event === 'episode_download_finished' &&
					z.object({ failed: z.literal(true) }).safeParse(detail.payload)
						.success
				)
					setError('Episode download failed')
			}
		}
		window.addEventListener('abs:socket', receive)
		return () => {
			active = false
			window.removeEventListener('abs:socket', receive)
		}
	}, [libraryId, refresh, user?.id])
	return {
		error,
		canDownload: canDownloadEpisodes(user),
		state(episode: FeedEpisode) {
			const found = downloads.find(
				(d) =>
					d.libraryItemId === episode.libraryItemId &&
					((episode.guid && episode.guid === d.guid) ||
						(episode.enclosure?.url &&
							encodeURI(episode.enclosure.url) === d.url) ||
						episode.enclosure?.url === d.url),
			)
			return found?.startedAt
				? 'Downloading'
				: found || pending.includes(episode.id)
					? 'Queued'
					: null
		},
		async start(episode: FeedEpisode) {
			if (
				!canDownloadEpisodes(user) ||
				!episode.enclosure?.url ||
				requested.current.has(episode.id) ||
				downloads.some(
					(d) =>
						d.libraryItemId === episode.libraryItemId &&
						((episode.guid && d.guid === episode.guid) ||
							d.url === episode.enclosure?.url),
				)
			)
				return
			requested.current.set(episode.id, episode)
			setPending((ids) => [...ids, episode.id])
			setError('')
			try {
				await api(
					`/api/podcasts/${encodeURIComponent(episode.libraryItemId)}/download-episodes`,
					z.unknown(),
					{
						method: 'POST',
						body: JSON.stringify([episode]),
					},
				)
			} catch (error) {
				requested.current.delete(episode.id)
				setPending((ids) => ids.filter((id) => id !== episode.id))
				setError(error instanceof Error ? error.message : 'Download failed')
			}
		},
	}
}
