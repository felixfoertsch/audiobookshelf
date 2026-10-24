import { describe, expect, it } from 'vitest'
import { duration } from './duration'

describe('duration', () => {
	it('hides non-positive or unknown durations and formats short and long values', () => {
		expect(duration(0)).toBeNull()
		expect(duration(undefined)).toBeNull()
		expect(duration(Number.NaN)).toBeNull()
		expect(duration(59)).toBe('0:59')
		expect(duration(3661.7)).toBe('1:01:01')
		expect(duration(36000)).toBe('10:00:00')
		expect(duration(39600)).toBe('11:00:00')
	})
})
