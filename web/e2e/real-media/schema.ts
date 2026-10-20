import { z } from 'zod'

const httpsUrl = z
	.string()
	.url()
	.refine((value) => new URL(value).protocol === 'https:')
export const realRecordsSchema = z
	.array(
		z.object({
			id: z.string().regex(/^real-[a-z-]+$/),
			kind: z.enum(['podcast', 'book']),
			title: z.string().min(1),
			author: z.string(),
			description: z.string(),
			language: z.string(),
			feedUrl: httpsUrl,
			sourceUrl: httpsUrl,
			cover: z.string().regex(/^real\/real-[a-z-]+\.jpg$/),
			tracks: z
				.array(
					z.object({
						id: z.string().regex(/^real-[a-z-]+-ep-\d+$/),
						title: z.string().min(1),
						guid: z.string(),
						pubDate: z.string(),
						enclosure: z.object({
							url: httpsUrl,
							type: z.literal('audio/mpeg'),
							length: z.string(),
						}),
						file: z.string().regex(/^real\/real-[a-z-]+-\d+\.mp3$/),
						duration: z.number().finite().positive(),
						size: z.number().int().positive().max(100_000_000),
						sha256: z.string().regex(/^[a-f0-9]{64}$/),
					}),
				)
				.min(1)
				.max(7),
		}),
	)
	.max(3)

const xmlText = z
	.array(z.union([z.string(), z.object({ _: z.string() })]))
	.optional()
export const rssSchema = z.object({
	rss: z.object({
		channel: z
			.array(
				z.object({
					title: xmlText,
					'itunes:author': xmlText,
					description: xmlText,
					language: xmlText,
					'itunes:image': z
						.array(z.object({ $: z.object({ href: httpsUrl }) }))
						.min(1),
					item: z
						.array(
							z.object({
								title: xmlText,
								guid: xmlText,
								pubDate: xmlText,
								enclosure: z
									.array(
										z.object({
											$: z.object({
												url: httpsUrl,
												type: z.literal('audio/mpeg'),
												length: z.string(),
											}),
										}),
									)
									.min(1),
							}),
						)
						.min(1),
				}),
			)
			.min(1),
	}),
})
export const lookupSchema = z.object({
	resultCount: z.literal(1),
	results: z.array(z.object({ feedUrl: httpsUrl })).length(1),
})
export const durationSchema = z.object({
	format: z.object({ duration: z.coerce.number().finite().positive() }),
})
export const text = (value: z.infer<typeof xmlText>): string => {
	const first = value?.[0]
	return (typeof first === 'string' ? first : (first?._ ?? '')).trim()
}
