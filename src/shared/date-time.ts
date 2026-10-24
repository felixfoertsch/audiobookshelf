export function dateTime(value: string | number | null | undefined) {
	if (value == null) return '—'
	const date = new Date(value)
	return Number.isNaN(date.getTime())
		? '—'
		: `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`
}
