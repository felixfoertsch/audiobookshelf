export type ChapterRange = { start: number; end: number; title: string }
export function chapterAt(chapters: ChapterRange[] | undefined, time: number) {
	return chapters?.find(
		(chapter) => chapter.start <= time && time < chapter.end,
	)
}
export function chapterTime(chapter: ChapterRange, time: number) {
	return Math.max(
		0,
		Math.min(time - chapter.start, chapter.end - chapter.start),
	)
}
export type AudioTrack = {
	contentUrl: string
	duration?: number
	startOffset?: number
}
export function trackAt(tracks: AudioTrack[], time: number, total: number) {
	if (
		!tracks.length ||
		!Number.isFinite(time) ||
		!Number.isFinite(total) ||
		total <= 0
	)
		throw new Error('Invalid audio timeline')
	const target = Math.max(0, Math.min(time, total))
	for (let i = tracks.length - 1; i >= 0; i--) {
		const start =
			tracks[i].startOffset ??
			tracks.slice(0, i).reduce((sum, track) => sum + (track.duration ?? 0), 0)
		if (target >= start)
			return {
				index: i,
				localTime: Math.min(target - start, tracks[i].duration ?? total),
				start,
			}
	}
	return { index: 0, localTime: 0, start: 0 }
}
export function originalTime(
	tracks: AudioTrack[],
	index: number,
	local: number,
) {
	return (
		(tracks[index]?.startOffset ??
			tracks
				.slice(0, index)
				.reduce((sum, track) => sum + (track.duration ?? 0), 0)) + local
	)
}
