// A seek resets previous to its destination; null means fresh playback near zero.
export function skipTarget(
	segments: { start: number; end: number }[],
	previous: number | null,
	current: number,
	duration: number,
	enabled: boolean,
): number | null {
	if (!enabled) return null
	let target = current
	for (const segment of [...segments].sort((a, b) => a.start - b.start)) {
		const reached =
			previous === null
				? (segment.start === 0 && current <= 0.5) ||
					(target > current && segment.start <= target)
				: previous < segment.start && segment.start <= target
		if (reached && segment.end > target)
			target = Math.min(segment.end, duration)
	}
	return target > current ? target : null
}
