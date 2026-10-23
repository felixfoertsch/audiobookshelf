import { z } from 'zod'

const text = z.string().nullish()
const fileMetadata = z
	.object({
		filename: text,
		path: text,
		ext: text,
		size: z.number().nullish(),
	})
	.passthrough()
const audioFileSchema = z
	.object({
		ino: z.union([z.string(), z.number()]).nullish(),
		index: z.number().nullish(),
		metadata: fileMetadata.nullish(),
		duration: z.number().nullish(),
		format: text,
		codec: text,
		bitRate: z.number().nullish(),
		channels: z.number().nullish(),
		channelLayout: text,
		timeBase: text,
		language: text,
		exclude: z.boolean().optional(),
		error: text,
		metaTags: z.record(z.string(), z.unknown()).nullish(),
	})
	.passthrough()
export const itemSchema = z
	.object({
		userMediaProgress: z
			.object({
				id: z.string().optional(),
				isFinished: z.boolean().optional(),
				currentTime: z.number().nonnegative().optional(),
				duration: z.number().nonnegative().optional(),
				progress: z.number().optional(),
			})
			.nullish(),
		id: z.string().min(1),
		libraryId: text,
		mediaType: z.enum(['book', 'podcast']),
		media: z
			.object({
				id: text,
				coverPath: text,
				numAudioFiles: z.number().nonnegative().optional(),
				duration: z.number().nullish(),
				feedURL: text,
				ebookFile: z
					.object({
						ino: z.union([z.string(), z.number()]).optional(),
						ebookFormat: text,
						metadata: z
							.object({
								ext: z.string().optional(),
								filename: z.string().optional(),
							})
							.passthrough()
							.optional(),
					})
					.passthrough()
					.nullish(),
				metadata: z
					.object({
						title: text,
						subtitle: text,
						author: text,
						authorName: text,
						description: text,
						feedUrl: text,
						authors: z
							.array(
								z.object({ id: z.string(), name: z.string() }).passthrough(),
							)
							.optional(),
						narrators: z.array(z.string()).optional(),
						genres: z.array(z.string()).optional(),
						tags: z.array(z.string()).optional(),
						series: z
							.array(
								z
									.object({ id: z.string(), name: z.string(), sequence: text })
									.passthrough(),
							)
							.optional(),
					})
					.passthrough(),
				audioFiles: z.array(audioFileSchema).optional(),
				chapters: z
					.array(
						z
							.object({
								id: z.union([z.string(), z.number()]),
								title: z.string(),
								start: z.number(),
								end: z.number(),
							})
							.passthrough(),
					)
					.optional(),
				episodes: z
					.array(
						z
							.object({
								id: z.string(),
								title: text,
								subtitle: text,
								description: text,
								publishedAt: z.number().nullish(),
								duration: z.number().nullish(),
								audioFile: z
									.object({
										ino: z.union([z.string(), z.number()]).optional(),
										duration: z.number().nullish(),
									})
									.passthrough()
									.nullish(),
							})
							.passthrough(),
					)
					.optional(),
			})
			.passthrough(),
		libraryFiles: z
			.array(
				z
					.object({
						id: z.string().optional(),
						fileType: text,
						ino: z.union([z.string(), z.number()]).optional(),
						metadata: fileMetadata.optional(),
						ebookFormat: text,
					})
					.passthrough(),
			)
			.optional(),
		adAnalysisEnabled: z.boolean().optional(),
		isMissing: z.boolean().optional(),
		isInvalid: z.boolean().optional(),
	})
	.passthrough()
export type Item = z.infer<typeof itemSchema>
export const emptySchema = z.object({}).passthrough()
export const feedSchema = z
	.object({
		podcast: z
			.object({ episodes: z.array(z.unknown()).optional() })
			.passthrough(),
	})
	.passthrough()
export const progressSchema = z
	.object({
		id: text,
		isFinished: z.boolean().optional(),
		progress: z.number().optional(),
	})
	.passthrough()
