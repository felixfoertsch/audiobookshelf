const mediaExtensions = new Set(
	'm4b mp3 m4a flac opus ogg oga mp4 aac wma aiff aif wav webm webma mka awb caf mpeg mpg'.split(
		' ',
	),
)
const ebookExtensions = new Set('epub pdf mobi azw3 cbr cbz'.split(' '))
const supportedExtensions = new Set([
	...mediaExtensions,
	...ebookExtensions,
	'png',
	'jpg',
	'jpeg',
	'webp',
	'nfo',
	'txt',
	'opf',
	'abs',
	'xml',
	'json',
])
export type UploadFile = File & { webkitRelativePath?: string }
export type Group = {
	directory: string
	files: UploadFile[]
	other: UploadFile[]
	ignored: UploadFile[]
}
export function groupsFromFiles(
	files: Iterable<UploadFile>,
	mediaType: string,
): Group[] {
	const groups = new Map<string, Group>()
	const looseAudio: UploadFile[] = []
	const looseOther: UploadFile[] = []
	const looseIgnored: UploadFile[] = []
	for (const file of files) {
		const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
		const path = file.webkitRelativePath || file.name
		const directory = path.includes('/')
			? path.slice(0, path.lastIndexOf('/'))
			: ''
		const valid =
			supportedExtensions.has(ext) &&
			(mediaType === 'book' || !ebookExtensions.has(ext))
		const mediaFile =
			mediaExtensions.has(ext) ||
			(mediaType === 'book' && ebookExtensions.has(ext))
		if (!directory) {
			if (!valid) looseIgnored.push(file)
			else if (mediaFile) looseAudio.push(file)
			else looseOther.push(file)
			continue
		}
		const key = directory
		const group = groups.get(key) ?? {
			directory,
			files: [],
			other: [],
			ignored: [],
		}
		if (!valid) group.ignored.push(file)
		else if (mediaFile) group.files.push(file)
		else group.other.push(file)
		groups.set(key, group)
	}
	for (const group of groups.values())
		if (!group.files.length) {
			group.ignored.push(...group.other)
			group.other = []
		}
	const result = [...groups.values()].filter(
		(g) => g.files.length || g.ignored.length,
	)
	if (looseAudio.length) {
		if (
			mediaType === 'book' &&
			!looseOther.length &&
			looseAudio.every((file) =>
				mediaExtensions.has(file.name.split('.').pop()?.toLowerCase() ?? ''),
			)
		)
			result.push(
				...looseAudio.map((file) => ({
					directory: '',
					files: [file],
					other: [],
					ignored: [],
				})),
			)
		else
			result.push({
				directory: '',
				files: looseAudio,
				other: looseOther,
				ignored: looseIgnored,
			})
	} else if (looseIgnored.length || looseOther.length)
		result.push({
			directory: '',
			files: [],
			other: [],
			ignored: [...looseIgnored, ...looseOther],
		})
	if (
		looseIgnored.length &&
		looseAudio.length &&
		mediaType === 'book' &&
		!looseOther.length
	)
		result.push({ directory: '', files: [], other: [], ignored: looseIgnored })
	return result
}
