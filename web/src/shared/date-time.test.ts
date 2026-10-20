import { expect, test } from 'vitest'
import { dateTime } from './date-time'

test('formats human instants in explicit ISO 24-hour UTC independent of host zone', () => {
	expect(dateTime('2026-10-20T23:04:59+02:00')).toBe('2026-10-20 21:04 UTC')
	expect(dateTime(0)).toBe('1970-01-01 00:00 UTC')
	for (const value of [null, undefined, 'invalid'])
		expect(dateTime(value)).toBe('—')
})
