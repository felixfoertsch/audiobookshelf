import { expect, it } from 'vitest'
import { skipTarget } from './skipping'

const segments = [
	{ start: 10, end: 20 },
	{ start: 30, end: 40 },
]
it('skips when continuous playback crosses a marker', () => {
	expect(skipTarget(segments, 9, 10.2, 50, true)).toBe(20)
})
it('reaches pre-roll only when starting near zero without seeking', () => {
	expect(skipTarget([{ start: 0, end: 5 }], null, 0, 50, true)).toBe(5)
	expect(skipTarget([{ start: 0, end: 5 }], null, 0.5, 50, true)).toBe(5)
	expect(skipTarget([{ start: 0, end: 5 }], 2, 2.1, 50, true)).toBeNull()
})
it('does not skip a seek into a segment but reaches later markers', () => {
	expect(skipTarget(segments, 15, 15.2, 50, true)).toBeNull()
	expect(skipTarget(segments, 29, 30.2, 50, true)).toBe(40)
})
it('skips again after seeking back before a marker', () => {
	expect(skipTarget(segments, 9, 10, 50, true)).toBe(20)
	expect(skipTarget(segments, 9, 10, 50, true)).toBe(20)
})
it('does not skip with toggle off', () => {
	expect(skipTarget(segments, 9, 10, 50, false)).toBeNull()
})
it('skips adjacent pre-roll segments together', () => {
	expect(
		skipTarget(
			[
				{ start: 0, end: 5 },
				{ start: 5, end: 10 },
			],
			null,
			0.2,
			30,
			true,
		),
	).toBe(10)
})
it('skips adjacent segments together and clamps to duration', () => {
	expect(
		skipTarget(
			[
				{ start: 10, end: 20 },
				{ start: 20, end: 35 },
			],
			9,
			10,
			30,
			true,
		),
	).toBe(30)
})
it('never rewinds when a coarse update already passed the end', () => {
	expect(skipTarget(segments, 9, 21, 50, true)).toBeNull()
})
