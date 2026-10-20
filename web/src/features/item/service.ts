import { z } from 'zod'
import { api } from '../../api'
import { emptySchema, feedSchema, itemSchema, progressSchema } from './schemas'

export const getItem = (id: string) =>
	api(
		`/api/items/${encodeURIComponent(id)}?expanded=1&include=downloads,rssfeed,share,progress`,
		itemSchema,
	)
export const updateMedia = (id: string, payload: unknown) =>
	api(`/api/items/${encodeURIComponent(id)}/media`, emptySchema, {
		method: 'PATCH',
		body: JSON.stringify(payload),
	})
export const updateProgress = (
	id: string,
	payload: { isFinished?: boolean; currentTime?: number; duration?: number },
	episodeId?: string,
) =>
	api(
		`/api/me/progress/${encodeURIComponent(id)}${episodeId ? `/${encodeURIComponent(episodeId)}` : ''}`,
		progressSchema,
		{
			method: 'PATCH',
			body: JSON.stringify(payload),
		},
	)
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
