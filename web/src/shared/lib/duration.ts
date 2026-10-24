export function duration(seconds: number | null | undefined, zero = false) {
	if (seconds == null || !Number.isFinite(seconds) || (seconds <= 0 && !zero))
		return null
	seconds = Math.max(0, seconds)
	const total = Math.floor(seconds)
	const hours = Math.floor(total / 3600)
	const minutes = Math.floor((total / 60) % 60)
	const remainder = total % 60
	return hours
		? `${hours}:${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`
		: `${minutes}:${remainder.toString().padStart(2, '0')}`
}
