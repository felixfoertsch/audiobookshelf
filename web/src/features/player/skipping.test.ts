import { expect, it } from 'vitest'
import { candidateAt } from './skipping'

it('skips once per session, permits manual rewind, and resets for fresh replay', () => {
	const segments = [{ start: 10, end: 20 }]
	const first = new Set<number>()
	expect(candidateAt(segments, 12, first)).toBe(0)
	first.add(0)
	expect(candidateAt(segments, 12, first)).toBe(-1)
	expect(candidateAt(segments, 12, new Set())).toBe(0)
	expect(candidateAt([], 12, new Set())).toBe(-1)
})
