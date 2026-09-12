import Controller from '@ember/controller';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';

const REPO_BASE =
	'https://raw.githubusercontent.com/tribe-framework/tribe/refs/heads/master/config/metadata';

const JSZIP_CDN =
	'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

const SCRIPT_FILES = [
	{ name: 'metadata.sh', executable: true },
	{ name: 'metadata.command', executable: true },
	{ name: 'metadata.ps1', executable: false },
	{ name: 'metadata.bat', executable: false },
];

const UNIX_EXEC_ATTR = 0o100755 << 16;
const UNIX_FILE_ATTR = 0o100644 << 16;

export default class MetadataController extends Controller {
	@tracked zipState = 'idle';
	@tracked zipError = '';

	get zipBusy() {
		return this.zipState === 'working';
	}

	get zipLabel() {
		switch (this.zipState) {
			case 'working':
				return 'Preparing archive…';
			case 'done':
				return 'Downloaded — click to get a fresh copy';
			case 'error':
				return 'Retry download';
			default:
				return 'Download metadata.zip';
		}
	}

	async loadJsZip() {
		if (window.JSZip) return window.JSZip;

		await new Promise((resolve, reject) => {
			const tag = document.createElement('script');
			tag.src = JSZIP_CDN;
			tag.onload = resolve;
			tag.onerror = () => reject(new Error('Could not load the zip library.'));
			document.head.appendChild(tag);
		});

		return window.JSZip;
	}

	async fetchScript(filename) {
		const response = await fetch(`${REPO_BASE}/${filename}`, {
			cache: 'no-store',
		});
		if (!response.ok) {
			throw new Error(`${filename} could not be fetched (${response.status}).`);
		}
		return response.text();
	}

	@action
	async downloadZip() {
		if (this.zipBusy) return;

		this.zipState = 'working';
		this.zipError = '';

		try {
			const JSZip = await this.loadJsZip();
			const zip = new JSZip();
			const folder = zip;

			const contents = await Promise.all(
				SCRIPT_FILES.map((file) => this.fetchScript(file.name)),
			);

			SCRIPT_FILES.forEach((file, index) => {
				folder.file(file.name, contents[index], {
					unixPermissions: file.executable ? '755' : '644',
					externalFileAttributes: file.executable
						? UNIX_EXEC_ATTR
						: UNIX_FILE_ATTR,
				});
			});

			const blob = await zip.generateAsync({
				type: 'blob',
				platform: 'UNIX',
				compression: 'DEFLATE',
			});

			const url = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = 'metadata.zip';
			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();
			URL.revokeObjectURL(url);

			this.zipState = 'done';
		} catch (error) {
			this.zipError =
				error.message || 'Something went wrong preparing the archive.';
			this.zipState = 'error';
		}
	}
}
