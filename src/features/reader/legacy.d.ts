declare module 'libarchive.js/main.js' {
	export class Archive {
		_worker: Worker
		static init(options: { workerUrl: string }): void
		static open(file: Blob): Promise<Archive>
		getFilesObject(): Promise<Record<string, unknown>>
	}
}
declare module 'libarchive.js/src/compressed-file' {
	export class CompressedFile {
		size: number
		extract(): Promise<File>
	}
}
declare module '*legacy/mobi.js' {
	export default class MobiParser {
		constructor(data: ArrayBuffer)
		render(): Promise<HTMLElement>
	}
}
declare module '*legacy/htmlParser.js' {
	export default class HtmlParser {
		constructor(document: Document)
		getAnchoredDoc(): Document
	}
}
declare module '*legacy/basic.js' {
	const css: string
	export default css
}
