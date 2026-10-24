import { expect, test } from '@playwright/test'

test('standalone runtime does not expose debug overlay routes', async ({
	request,
}) => {
	for (const path of [
		'/internal-api/debug/issues',
		'/internal-api/debug/notes/item/book-1',
	]) {
		const response = await request.get(path)
		expect(response.status(), path).toBe(404)
	}
})
