import { z } from 'zod'

const schema = z
	.object({
		playbackRate: z.number().min(0.25).max(4).optional(),
		jumpForwardAmount: z.number().min(1).max(600).optional(),
		jumpBackwardAmount: z.number().min(1).max(600).optional(),
	})
	.passthrough()
export function readPlayerSettings() {
	try {
		return schema.parse(
			JSON.parse(localStorage.getItem('userSettings') || '{}'),
		)
	} catch {
		return {}
	}
}
export function savePlayerSetting(
	key: 'playbackRate' | 'jumpForwardAmount' | 'jumpBackwardAmount',
	value: number,
) {
	const current = JSON.parse(localStorage.getItem('userSettings') || '{}')
	const next = schema.parse({ ...current, [key]: value })
	localStorage.setItem('userSettings', JSON.stringify(next))
	return next
}
