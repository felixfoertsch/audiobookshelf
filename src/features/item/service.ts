import { z } from 'zod'
import { ApiError, api, getAuthGeneration } from '../../api'
import { psbApi } from '../../psb-api'
import { episodeAnalysisSchema } from '../podcast/sidecar-schema'
import { refreshProgress } from './progress'
import { emptySchema, feedSchema, itemSchema, progressSchema } from './schemas'

export const getItem = async (id: string) => {
	const generation = getAuthGeneration()
	const item = await api(
		`/api/items/${encodeURIComponent(id)}?expanded=1&include=downloads,rssfeed,share,progress`,
		itemSchema,
	)
	if (item.mediaType !== 'podcast') return item
	try {
		const { episodes } = await psbApi(
			`/api/items/${encodeURIComponent(id)}/analysis`,
			z.object({ episodes: z.record(z.string(), episodeAnalysisSchema) }),
		)
		const joined: typeof item = {
			...item,
			media: {
				...item.media,
				episodes: item.media.episodes?.map(
					(episode) =>
						({
							...episode,
							adAnalysis: episodes[episode.id] ?? null,
						}) as (typeof item.media.episodes)[number],
				),
			},
		}
		return joined
	} catch {
		if (generation !== getAuthGeneration())
			throw new ApiError('Session changed. Retry signing in.', 401)
		return item
	}
}
export const updateMedia = (id: string, payload: unknown) =>
	api(`/api/items/${encodeURIComponent(id)}/media`, emptySchema, {
		method: 'PATCH',
		body: JSON.stringify(payload),
	})
export const writeProgress = (
	id: string,
	payload: { isFinished?: boolean; currentTime?: number; duration?: number },
	episodeId?: string,
) =>
	api(
		`/api/me/progress/${encodeURIComponent(id)}${episodeId ? `/${encodeURIComponent(episodeId)}` : ''}`,
		progressSchema,
		{ method: 'PATCH', body: JSON.stringify(payload) },
	).then((result) => {
		window.dispatchEvent(
			new CustomEvent('abs:progress-changed', {
				detail: { libraryItemId: id },
			}),
		)
		return result
	})
export async function updateProgress(
	id: string,
	payload: { isFinished?: boolean; currentTime?: number; duration?: number },
	episodeId?: string,
): Promise<{ refreshWarning?: string }> {
	await writeProgress(id, payload, episodeId)
	try {
		await refreshProgress()
		return {}
	} catch {
		return {
			refreshWarning:
				'Progress saved, but listening status could not refresh. Refresh to verify current status.',
		}
	}
}
export async function resetProgress(progressId: string, itemId: string) {
	await api(`/api/me/progress/${encodeURIComponent(progressId)}`, emptySchema, {
		method: 'DELETE',
	})
	window.dispatchEvent(
		new CustomEvent('abs:progress-changed', {
			detail: { libraryItemId: itemId },
		}),
	)
	try {
		await refreshProgress()
		return {}
	} catch {
		return {
			refreshWarning:
				'Progress reset, but listening status could not refresh. Refresh to verify current status.',
		}
	}
}
export const checkPodcastFeed = (id: string) =>
	api(`/api/podcasts/${encodeURIComponent(id)}/checknew`, zEpisodes, {})
const zEpisodes = z.object({ episodes: z.array(z.unknown()) })
export const fetchPodcastFeed = (url: string) =>
	api('/api/podcasts/feed', feedSchema, {
		method: 'POST',
		body: JSON.stringify({ rssFeed: url }),
	})
export const updateEpisode = (
	itemId: string,
	episodeId: string,
	payload: unknown,
) =>
	api(
		`/api/podcasts/${encodeURIComponent(itemId)}/episode/${encodeURIComponent(episodeId)}`,
		emptySchema,
		{ method: 'PATCH', body: JSON.stringify(payload) },
	)
export const deleteEpisode = (
	itemId: string,
	episodeId: string,
	hard = false,
) =>
	api(
		`/api/podcasts/${encodeURIComponent(itemId)}/episode/${encodeURIComponent(episodeId)}?hard=${hard ? '1' : '0'}`,
		emptySchema,
		{ method: 'DELETE' },
	)
export const downloadItem = (id: string) =>
	api(`/api/items/${encodeURIComponent(id)}/download`, emptySchema)
