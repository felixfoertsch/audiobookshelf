export function formatIsoDate(date: Date): string {
	if (!Number.isFinite(date.getTime())) return ''
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
