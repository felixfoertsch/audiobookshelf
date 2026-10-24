import { z } from 'zod'

// Contract mirror: podcast-sponsorblock/contract/api.ts.
export const analysisSegmentSchema = z
	.object({
		start: z.number().finite().nonnegative(),
		end: z.number().finite().positive(),
	})
	.refine((segment) => segment.end > segment.start)
export const episodeAnalysisSchema = z.object({
	status: z.enum([
		'disabled',
		'queued',
		'running',
		'complete',
		'interrupted',
		'error',
		'stale',
		'inconclusive',
	]),
	version: z.string().nullable(),
	sourceSha256: z
		.string()
		.regex(/^[a-f0-9]{64}$/)
		.nullable(),
	segments: z.array(analysisSegmentSchema),
	adAnalysisEnabled: z.boolean(),
})
export const consentSchema = z.object({ adAnalysisEnabled: z.boolean() })
export const enqueueSchema = z.object({
	itemId: z.string().min(1),
	episodeId: z.string().min(1),
})
export const corpusSchema = z.object({
	status: z.string(),
	versions: z.number().int().nonnegative(),
	bytes: z.number().int().nonnegative(),
})
export const jobStatusSchema = z.object({
	status: z.enum([
		'queued',
		'running',
		'complete',
		'interrupted',
		'error',
		'cancelled',
	]),
	attempts: z.number().int().nonnegative(),
})
export const itemAnalysisSchema = z.object({
	episodes: z.record(z.string(), episodeAnalysisSchema),
})
export const paths = {
	analysis: '/api/items/:id/analysis',
	consent: '/api/items/:id/analysis/consent',
	enqueue: '/api/items/:id/episodes/:episodeId/analysis/enqueue',
	corpus: '/api/ad-analysis/corpus',
	status: '/api/ad-analysis/jobs/:id',
} as const
