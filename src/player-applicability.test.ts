import { expect, it } from 'vitest'
import { applicableSegments } from './player'

const result = {
	status: 'candidates',
	applicable: true,
	adAnalysisEnabled: true,
	version: '1',
	sourceSha256: 'a'.repeat(64),
	segments: [{ start: 2, end: 4 }],
}
it('uses only reachable, valid and applicable candidate/no-difference analysis', () => {
	for (const status of ['candidates', 'no_difference'])
		expect(applicableSegments({ ...result, status })).toEqual(result.segments)
	for (const status of [
		'stale',
		'queued',
		'running',
		'disabled',
		'complete',
		'error',
		'interrupted',
		'inconclusive',
	])
		expect(applicableSegments({ ...result, status })).toEqual([])
	expect(applicableSegments({ ...result, applicable: false })).toEqual([])
	expect(
		applicableSegments({ ...result, segments: [{ start: 4, end: 2 }] }),
	).toEqual([])
	expect(applicableSegments(null)).toEqual([])
	expect(applicableSegments(undefined)).toEqual([])
})
