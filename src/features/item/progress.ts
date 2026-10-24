import { z } from 'zod'
import { api, getAuthGeneration, useAuth } from '../../api'

export const mediaProgressSchema = z
	.object({
		id: z.string().optional(),
		userId: z.string().optional(),
		libraryItemId: z.string().min(1).nullable(),
		episodeId: z.string().nullish(),
		isFinished: z.boolean().optional(),
		currentTime: z.number().nonnegative().nullish(),
		duration: z.number().nonnegative().nullish(),
		progress: z.number().optional(),
	})
	.passthrough()
const progressList = z.array(z.unknown()).transform((rows) => {
	const valid: z.infer<typeof mediaProgressSchema>[] = []
	let invalid = 0
	for (const row of rows) {
		const parsed = mediaProgressSchema.safeParse(row)
		if (parsed.success) valid.push(parsed.data)
		else invalid++
	}
	return {
		rows: valid,
		warning: invalid
			? `${invalid} invalid progress record${invalid === 1 ? '' : 's'} ignored. Some listening status is unavailable; refresh or contact your server administrator.`
			: '',
	}
})
let revision = 0
let request = 0

const lookupCache = new WeakMap<
	object,
	Map<string, z.infer<typeof mediaProgressSchema>>
>()
export function episodeProgress(
	user: unknown,
	itemId: string,
	episodeId?: string,
) {
	if (
		!user ||
		typeof user !== 'object' ||
		!('mediaProgress' in user) ||
		!Array.isArray(user.mediaProgress)
	)
		return undefined
	const rows = user.mediaProgress
	let lookup = lookupCache.get(rows)
	if (!lookup) {
		lookup = new Map()
		const parsed = progressList.parse(rows)
		for (const entry of parsed.rows)
			lookup.set(
				JSON.stringify([entry.libraryItemId, entry.episodeId || null]),
				entry,
			)
		lookupCache.set(rows, lookup)
	}
	return lookup.get(JSON.stringify([itemId, episodeId || null]))
}

// Socket transport is owner-authenticated; full user events still carry explicit identity.
export function applyProgressSocket(
	event: string,
	payload: unknown,
	owner: string,
) {
	const user = useAuth.getState().user
	if (user?.id !== owner) return false
	if (event === 'user_updated') {
		const parsed = z
			.object({ id: z.literal(owner), mediaProgress: progressList })
			.safeParse(payload)
		if (!parsed.success) return false
		revision++
		useAuth.setState({
			user: {
				...user,
				mediaProgress: parsed.data.mediaProgress.rows,
				progressWarning: parsed.data.mediaProgress.warning,
				progressLoaded: true,
			},
		})
		return true
	}
	if (event === 'user_item_progress_updated') {
		const parsed = z.object({ data: mediaProgressSchema }).safeParse(payload)
		if (
			!parsed.success ||
			(parsed.data.data.userId && parsed.data.data.userId !== owner)
		)
			return false
		const existing = progressList.safeParse(user.mediaProgress)
		const next = parsed.data.data
		revision++
		useAuth.setState({
			user: {
				...user,
				mediaProgress: [
					...(existing.success ? existing.data.rows : []).filter(
						(entry) =>
							entry.libraryItemId !== next.libraryItemId ||
							entry.episodeId !== next.episodeId,
					),
					next,
				],
			},
		})
		return true
	}
	return false
}

export async function refreshProgress() {
	const owner = useAuth.getState().user?.id
	const generation = getAuthGeneration()
	const version = revision
	const latest = ++request
	const result = await api(
		'/api/me/progress',
		z.object({ mediaProgress: progressList }),
	)
	const user = useAuth.getState().user
	if (
		user &&
		user.id === owner &&
		generation === getAuthGeneration() &&
		version === revision &&
		latest === request
	) {
		useAuth.setState({
			user: {
				...user,
				mediaProgress: result.mediaProgress.rows,
				progressWarning: result.mediaProgress.warning,
				progressLoaded: true,
			},
		})
	}
}
