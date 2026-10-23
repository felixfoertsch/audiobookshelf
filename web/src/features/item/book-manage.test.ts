import { describe, expect, it } from 'vitest'
import {
	audibleChapters,
	chaptersPayload,
	matchOptionsSchema,
	saveChapters,
	shiftChapters,
	updateMetadata,
	validateChapters,
} from './book-manage'

describe('book management contracts', () => {
	it('maps native Audible millisecond offsets, truncates end, excludes chapters outside book', () => {
		expect(
			audibleChapters(
				{
					runtimeLengthSec: 20,
					chapters: [
						{ title: 'One', startOffsetMs: 1000, lengthMs: 12000 },
						{ title: 'Outside', startOffsetMs: 15000, lengthMs: 5000 },
					],
				},
				10,
			),
		).toEqual([{ id: 0, title: 'One', start: 1, end: 10 }])
	})
	it('builds native chapter payload without client-only ids', () => {
		expect(
			chaptersPayload([{ id: 'chapter-9', title: 'Start', start: 0, end: 12 }]),
		).toEqual({ chapters: [{ title: 'Start', start: 0, end: 12 }] })
	})
	it('validates nonblank ordered chapter ranges within media duration', () => {
		expect(validateChapters([{ title: ' ', start: 0, end: 10 }], 10)).toMatch(
			/title/,
		)
		expect(validateChapters([{ title: 'One', start: 2, end: 1 }], 10)).toMatch(
			/times/,
		)
		expect(validateChapters([{ title: 'One', start: 0, end: 11 }], 10)).toMatch(
			/times/,
		)
		expect(
			validateChapters(
				[
					{ title: 'Two', start: 5, end: 10 },
					{ title: 'One', start: 0, end: 5 },
				],
				10,
			),
		).toMatch(/zero|ordered/)
		expect(
			validateChapters(
				[
					{ title: 'One', start: 0, end: 5 },
					{ title: 'Two', start: 5, end: 10 },
				],
				10,
			),
		).toBeNull()
	})
	it('requires zero first start, strictly increasing starts and finite bounds', () => {
		expect(validateChapters([], 20)).toBeNull()
		expect(validateChapters([{ title: 'Gap', start: 1, end: 20 }], 20)).toMatch(
			/zero/,
		)
		expect(
			validateChapters(
				[
					{ title: 'One', start: 0, end: 10 },
					{ title: 'Two', start: 0, end: 20 },
				],
				20,
			),
		).toMatch(/zero|ordered/)
		for (const value of [Number.NaN, Number.POSITIVE_INFINITY])
			expect(
				validateChapters([{ title: 'One', start: 0, end: value }], 20),
			).toMatch(/times/)
	})
	it('rejects invalid chapters at save boundary before any request', async () => {
		await expect(
			saveChapters('synthetic', [{ title: 'Gap', start: 1, end: 5 }], 20),
		).rejects.toThrow(/zero/)
		await expect(
			saveChapters('synthetic', [{ title: 'Long', start: 0, end: 21 }], 20),
		).rejects.toThrow(/times/)
		await expect(saveChapters('synthetic', [], Number.NaN)).rejects.toThrow(
			/duration/,
		)
	})
	it('shifts chapter bounds and rejects nonfinite shift', () => {
		expect(shiftChapters([{ title: 'One', start: 1, end: 3 }], 2)).toEqual([
			{ title: 'One', start: 3, end: 5 },
		])
		expect(() => shiftChapters([], Number.NaN)).toThrow(/finite/)
	})
	it('rejects blank series membership before metadata request', async () => {
		await expect(
			updateMetadata('synthetic', {
				metadata: { series: [{ name: '  ', sequence: '1' }] },
			}),
		).rejects.toThrow()
		await expect(
			updateMetadata('synthetic', {
				metadata: { series: [{ name: 'Saga', sequence: 2 }] },
			}),
		).rejects.toThrow()
	})
	it('validates match endpoint options shape', () => {
		expect(
			matchOptionsSchema.parse({
				provider: 'google',
				title: 'Book',
				overrideDetails: true,
			}),
		).toEqual({ provider: 'google', title: 'Book', overrideDetails: true })
		expect(() => matchOptionsSchema.parse({ title: 'Book' })).toThrow()
	})
})
