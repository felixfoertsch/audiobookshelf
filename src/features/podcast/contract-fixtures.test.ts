import { expect, it } from 'vitest'
import {
	analysisSchema,
	consentSchema,
	corpusSchema,
	enqueueRequestSchema,
	enqueueSchema,
	jobStatusSchema,
	recentFeedSchema,
	summarySchema,
} from '../../../contract/api'
import fixtures from '../../../contract/fixtures.json'

it('parses copied contract fixtures with copied schemas', () => {
	expect(analysisSchema.parse(fixtures.analysis)).toEqual(fixtures.analysis)
	expect(consentSchema.parse(fixtures.consent)).toEqual(fixtures.consent)
	expect(enqueueRequestSchema.parse(fixtures.enqueueRequest)).toEqual(
		fixtures.enqueueRequest,
	)
	expect(enqueueSchema.parse(fixtures.enqueue)).toEqual(fixtures.enqueue)
	expect(summarySchema.parse(fixtures.summary)).toEqual(fixtures.summary)
	expect(recentFeedSchema.parse(fixtures.recent)).toEqual(fixtures.recent)
	expect(corpusSchema.parse(fixtures.corpus)).toEqual(fixtures.corpus)
	expect(jobStatusSchema.parse(fixtures.status)).toEqual(fixtures.status)
})
