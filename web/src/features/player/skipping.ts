// Each fresh playback session gets a new set, including replay of the same episode.
export function candidateAt(
	segments: { start: number; end: number }[],
	time: number,
	skipped: Set<number>,
) {
	return segments.findIndex(
		(segment, index) =>
			!skipped.has(index) && time >= segment.start && time < segment.end - 0.5,
	)
}
