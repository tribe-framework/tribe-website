import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { htmlSafe } from '@ember/template';
import { later, cancel } from '@ember/runloop';
import { modifier } from 'ember-modifier';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const CACHE_KEY = 'tribe:markdown-editor:document';

/*
  Toolbar definition.
  kind:
    'wrap'   -> toggles a symmetric delimiter around the selection
    'prefix' -> toggles a line prefix on every selected line
    'ordered'-> toggles auto-numbering on every selected line
    'insert' -> inserts a template block (not a toggle, but reports active
                when the caret already sits inside such a block)
*/
const TOOLBAR = [
	{
		label: 'Blocks',
		buttons: [
			{
				id: 'h1',
				kind: 'prefix',
				token: '# ',
				icon: 'fa-heading',
				text: 'H1',
				title: 'Heading 1',
			},
			{
				id: 'h2',
				kind: 'prefix',
				token: '## ',
				icon: 'fa-heading',
				text: 'H2',
				title: 'Heading 2',
			},
			{
				id: 'h3',
				kind: 'prefix',
				token: '### ',
				icon: 'fa-heading',
				text: 'H3',
				title: 'Heading 3 (used throughout index.md)',
			},
			{
				id: 'h4',
				kind: 'prefix',
				token: '#### ',
				icon: 'fa-heading',
				text: 'H4',
				title: 'Heading 4',
			},
			{
				id: 'h5',
				kind: 'prefix',
				token: '##### ',
				icon: 'fa-heading',
				text: 'H5',
				title: 'Heading 5',
			},
			{
				id: 'h6',
				kind: 'prefix',
				token: '###### ',
				icon: 'fa-heading',
				text: 'H6',
				title: 'Heading 6',
			},
			{
				id: 'quote',
				kind: 'prefix',
				token: '> ',
				icon: 'fa-quote-left',
				title: 'Blockquote',
			},
		],
	},
	{
		label: 'Inline',
		buttons: [
			{ id: 'bold', kind: 'wrap', token: '**', icon: 'fa-bold', title: 'Bold' },
			{
				id: 'italic',
				kind: 'wrap',
				token: '*',
				icon: 'fa-italic',
				title: 'Italic',
			},
			{
				id: 'strike',
				kind: 'wrap',
				token: '~~',
				icon: 'fa-strikethrough',
				title: 'Strikethrough',
			},
			{
				id: 'code',
				kind: 'wrap',
				token: '`',
				icon: 'fa-code',
				title: 'Inline code',
			},
			{
				id: 'sub',
				kind: 'wrap',
				token: '<sub>',
				close: '</sub>',
				icon: 'fa-subscript',
				title: 'Subscript',
			},
			{
				id: 'sup',
				kind: 'wrap',
				token: '<sup>',
				close: '</sup>',
				icon: 'fa-superscript',
				title: 'Superscript',
			},
		],
	},
	{
		label: 'Lists',
		buttons: [
			{
				id: 'ul',
				kind: 'prefix',
				token: '- ',
				icon: 'fa-list-ul',
				title: 'Bulleted list',
			},
			{ id: 'ol', kind: 'ordered', icon: 'fa-list-ol', title: 'Numbered list' },
			{
				id: 'task',
				kind: 'prefix',
				token: '- [ ] ',
				icon: 'fa-list-check',
				title: 'Task list item',
			},
			{
				id: 'indent',
				kind: 'prefix',
				token: '  ',
				icon: 'fa-indent',
				title: 'Indent (nest list item)',
			},
		],
	},
	{
		label: 'Links & anchors',
		buttons: [
			{ id: 'link', kind: 'insert', icon: 'fa-link', title: 'External link' },
			{
				id: 'anchor-link',
				kind: 'insert',
				icon: 'fa-anchor',
				title: 'Link to an anchor on this page',
			},
			{
				id: 'anchor',
				kind: 'insert',
				icon: 'fa-bookmark',
				title: 'Anchor target — <a id="…"></a>',
			},
			{
				id: 'footnote',
				kind: 'insert',
				icon: 'fa-asterisk',
				title: 'Footnote reference + definition',
			},
		],
	},
	{
		label: 'Blocks & media',
		buttons: [
			{
				id: 'table',
				kind: 'insert',
				icon: 'fa-table',
				title: 'Table (GFM pipe table)',
			},
			{
				id: 'row',
				kind: 'insert',
				icon: 'fa-plus',
				text: 'Row',
				title: 'Add a row to the table at the caret',
			},
			{
				id: 'codeblock',
				kind: 'fence',
				token: '```',
				icon: 'fa-file-code',
				title: 'Fenced code block',
			},
			{ id: 'image', kind: 'insert', icon: 'fa-image', title: 'Image' },
			{ id: 'hr', kind: 'insert', icon: 'fa-minus', title: 'Horizontal rule' },
			{
				id: 'break',
				kind: 'insert',
				icon: 'fa-turn-down',
				title: 'Hard line break',
			},
		],
	},
];

/*
  Inline token grammar for the source pane. Alternation order is the
  precedence order: code spans swallow their contents so emphasis markers
  inside them stay literal, and images/links are matched before emphasis so
  an underscore in a URL never opens an <em>.
*/
const INLINE_TOKENS =
	/(`[^`\n]+`)|(!?\[[^\]\n]*\]\([^)\n]*\))|(\[\^[^\]\n]+\])|(<\/?[A-Za-z][^>\n]*>)|(\*\*[^*\n]+\*\*|__[^_\n]+__)|(\*[^*\n]+\*|_[^_\n]+_)|(~~[^~\n]+~~)/g;

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

const TABLE_TEMPLATE =
	'| Column | Column | Column |\n| --- | --- | --- |\n| Cell | Cell | Cell |\n';

export default class MarkdownController extends Controller {
	@tracked source = '';
	@tracked activeMap = {};
	@tracked savedAt = null;
	@tracked syncScroll = true;
	@tracked showToolbarLabels = true;

	toolbar = TOOLBAR;

	_saveTimer = null;
	_syncing = false;

	// ---------------------------------------------------------------- lifecycle

	// First-class element modifier: restores the cached document when the
	// textarea enters the DOM and cleans the autosave timer up on teardown.
	bootEditor = modifier((element) => {
		this.setup();
		later(this, () => {
			element.focus();
			this.refreshActive();
		});
		return () => this.teardown();
	});

	@action
	setup() {
		marked.setOptions({
			gfm: true, // pipe tables, strikethrough, autolinks
			breaks: false, // index.md relies on paragraph semantics, not hard wraps
			headerIds: true, // so [text](#slug) resolves against generated headings
			mangle: false, // leave raw HTML anchors alone
		});

		try {
			const cached = window.localStorage.getItem(CACHE_KEY);
			if (cached) {
				const parsed = JSON.parse(cached);
				this.source = parsed.source ?? '';
				this.savedAt = parsed.savedAt ? new Date(parsed.savedAt) : null;
			}
		} catch {
			this.source = '';
		}
	}

	@action
	teardown() {
		if (this._saveTimer) cancel(this._saveTimer);
	}

	// ------------------------------------------------------------------ getters

	get editor() {
		return document.getElementById('md-source');
	}

	get previewHtml() {
		const raw = marked.parse(this.source || '');
		const clean = DOMPurify.sanitize(raw, {
			// index.md uses <a id="stage-3"></a> as jump targets — id and name must
			// survive sanitisation or every internal link in the document breaks.
			ADD_ATTR: ['id', 'name', 'target', 'rel', 'align', 'colspan', 'rowspan'],
			ALLOW_DATA_ATTR: false,
		});
		return htmlSafe(clean);
	}

	// The highlight layer must end in a newline: a trailing empty line in the
	// textarea has no glyph, and without it the two layers scroll out of step.
	get highlightedSource() {
		const lines = (this.source || '').split('\n');
		let fence = null;

		const html = lines
			.map((line) => {
				const marker = line.match(/^\s*(```+|~~~+)/);
				if (marker && (!fence || marker[1][0] === fence)) {
					fence = fence ? null : marker[1][0];
					return this.token('fence', line);
				}
				return this.highlightLine(line, Boolean(fence));
			})
			.join('\n');

		return htmlSafe(`${html}\n`);
	}

	escapeHtml(text) {
		return text.replace(/[&<>]/g, (c) => HTML_ESCAPES[c]);
	}

	token(name, text) {
		return `<span class="hl-${name}">${this.escapeHtml(text)}</span>`;
	}

	highlightLine(line, insideFence) {
		if (insideFence) return this.token('code-block', line);

		let m;
		if ((m = line.match(/^(\s*)(#{1,6})(\s+)(.*)$/))) {
			return `${m[1]}${this.token('hash', m[2])}${m[3]}<span class="hl-heading">${this.highlightInline(m[4])}</span>`;
		}
		if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) return this.token('rule', line);
		if ((m = line.match(/^(\s*>+\s?)(.*)$/))) {
			return `${this.token('quote-marker', m[1])}<span class="hl-quote">${this.highlightInline(m[2])}</span>`;
		}
		if ((m = line.match(/^(\s*)([-*+]|\d+[.)])(\s+)(\[[ xX]\]\s+)?(.*)$/))) {
			const task = m[4] ? this.token('task', m[4]) : '';
			return `${m[1]}${this.token('marker', m[2])}${m[3]}${task}${this.highlightInline(m[5])}`;
		}
		if (/^\s*\|/.test(line)) return this.highlightRow(line);
		if ((m = line.match(/^(\[\^[^\]\n]+\]:)(.*)$/))) {
			return this.token('footnote', m[1]) + this.highlightInline(m[2]);
		}
		return this.highlightInline(line);
	}

	highlightRow(line) {
		if (/^\s*\|[\s:|-]+\s*$/.test(line)) return this.token('table-divider', line);
		return line
			.split('|')
			.map(
				(cell, i) =>
					(i ? this.token('pipe', '|') : '') + this.highlightInline(cell),
			)
			.join('');
	}

	highlightInline(text) {
		let out = '';
		let cursor = 0;
		let m;
		INLINE_TOKENS.lastIndex = 0;

		while ((m = INLINE_TOKENS.exec(text))) {
			out += this.escapeHtml(text.slice(cursor, m.index));
			if (m[1]) out += this.token('code', m[1]);
			else if (m[2]) out += this.highlightLinkToken(m[2]);
			else if (m[3]) out += this.token('footnote', m[3]);
			else if (m[4]) out += this.token('tag', m[4]);
			else if (m[5]) out += this.token('strong', m[5]);
			else if (m[6]) out += this.token('em', m[6]);
			else out += this.token('strike', m[7]);
			cursor = m.index + m[0].length;
		}

		return out + this.escapeHtml(text.slice(cursor));
	}

	highlightLinkToken(text) {
		const split = text.indexOf('](') + 1;
		return `<span class="hl-link">${this.escapeHtml(text.slice(0, split))}${this.token('url', text.slice(split))}</span>`;
	}

	get wordCount() {
		const words = (this.source || '').trim().match(/\S+/g);
		return words ? words.length : 0;
	}

	get charCount() {
		return (this.source || '').length;
	}

	get lineCount() {
		return (this.source || '').split('\n').length;
	}

	get downloadName() {
		const d = new Date();
		const p = (n) => String(n).padStart(2, '0');
		return `markdown-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}-${p(d.getMinutes())}.md`;
	}

	get savedLabel() {
		if (!this.savedAt) return 'Not saved yet';
		const p = (n) => String(n).padStart(2, '0');
		return `Saved ${p(this.savedAt.getHours())}:${p(this.savedAt.getMinutes())}:${p(this.savedAt.getSeconds())}`;
	}

	// ---------------------------------------------------------------- functions

	persist() {
		if (this._saveTimer) cancel(this._saveTimer);
		this._saveTimer = later(
			this,
			() => {
				try {
					const savedAt = new Date();
					window.localStorage.setItem(
						CACHE_KEY,
						JSON.stringify({
							source: this.source,
							savedAt: savedAt.toISOString(),
						}),
					);
					this.savedAt = savedAt;
				} catch {
					// Quota exceeded or storage disabled — editing continues regardless.
				}
			},
			400,
		);
	}

	// Replace a range in the textarea, keeping undo history and cursor sane.
	applyEdit(start, end, replacement, selStart, selEnd) {
		const el = this.editor;
		const value = this.source;
		this.source = value.slice(0, start) + replacement + value.slice(end);
		this.persist();
		later(this, () => {
			el.focus();
			el.setSelectionRange(selStart, selEnd ?? selStart);
			this.refreshActive();
		});
	}

	// Expand the current selection to whole lines.
	lineRange(value, start, end) {
		const from = value.lastIndexOf('\n', start - 1) + 1;
		let to = value.indexOf('\n', end);
		if (to === -1) to = value.length;
		return { from, to };
	}

	toggleWrap(btn) {
		const el = this.editor;
		const open = btn.token;
		const close = btn.close ?? btn.token;
		const value = this.source;
		let { selectionStart: s, selectionEnd: e } = el;

		const before = value.slice(Math.max(0, s - open.length), s);
		const after = value.slice(e, e + close.length);

		// Already wrapped just outside the selection -> unwrap.
		if (before === open && after === close) {
			this.applyEdit(
				s - open.length,
				e + close.length,
				value.slice(s, e),
				s - open.length,
				e - open.length,
			);
			return;
		}
		// Already wrapped inside the selection -> unwrap.
		const inner = value.slice(s, e);
		if (
			inner.startsWith(open) &&
			inner.endsWith(close) &&
			inner.length >= open.length + close.length
		) {
			const stripped = inner.slice(open.length, inner.length - close.length);
			this.applyEdit(s, e, stripped, s, s + stripped.length);
			return;
		}
		this.applyEdit(
			s,
			e,
			open + inner + close,
			s + open.length,
			s + open.length + inner.length,
		);
	}

	togglePrefix(btn) {
		const el = this.editor;
		const value = this.source;
		const { from, to } = this.lineRange(
			value,
			el.selectionStart,
			el.selectionEnd,
		);
		const lines = value.slice(from, to).split('\n');
		const token = btn.token;

		// Headings are mutually exclusive: strip any existing heading first.
		const isHeading = /^#{1,6} $/.test(token);
		const allOn = lines.every((l) => l.startsWith(token));

		const next = lines
			.map((line) => {
				if (allOn) return line.slice(token.length);
				let base = line;
				if (isHeading) base = base.replace(/^#{1,6} /, '');
				return token + base;
			})
			.join('\n');

		this.applyEdit(from, to, next, from, from + next.length);
	}

	toggleOrdered() {
		const el = this.editor;
		const value = this.source;
		const { from, to } = this.lineRange(
			value,
			el.selectionStart,
			el.selectionEnd,
		);
		const lines = value.slice(from, to).split('\n');
		const allOn = lines.every((l) => /^\d+\. /.test(l));
		const next = lines
			.map((line, i) =>
				allOn
					? line.replace(/^\d+\. /, '')
					: `${i + 1}. ${line.replace(/^\d+\. /, '')}`,
			)
			.join('\n');
		this.applyEdit(from, to, next, from, from + next.length);
	}

	toggleFence(btn) {
		const el = this.editor;
		const value = this.source;
		const { from, to } = this.lineRange(
			value,
			el.selectionStart,
			el.selectionEnd,
		);
		const block = value.slice(from, to);
		const fenced = /^```[^\n]*\n[\s\S]*\n```$/.test(block);
		if (fenced) {
			const stripped = block.replace(/^```[^\n]*\n/, '').replace(/\n```$/, '');
			this.applyEdit(from, to, stripped, from, from + stripped.length);
			return;
		}
		const next = `${btn.token}\n${block}\n${btn.token}`;
		this.applyEdit(
			from,
			to,
			next,
			from + btn.token.length + 1,
			from + btn.token.length + 1 + block.length,
		);
	}

	slugify(text) {
		return (text || 'anchor')
			.toLowerCase()
			.replace(/[^\w\s-]/g, '')
			.trim()
			.replace(/\s+/g, '-');
	}

	insertSnippet(btn) {
		const el = this.editor;
		const value = this.source;
		const s = el.selectionStart;
		const e = el.selectionEnd;
		const sel = value.slice(s, e);
		const atLineStart = s === 0 || value[s - 1] === '\n';
		const lead = atLineStart ? '' : '\n';

		switch (btn.id) {
			case 'link': {
				const text = sel || 'link text';
				const snippet = `[${text}](https://)`;
				// Caret lands inside the empty URL, ready to type/paste.
				this.applyEdit(s, e, snippet, s + text.length + 3 + 8);
				return;
			}
			case 'anchor-link': {
				const text = sel || 'Stage 1';
				const snippet = `[${text}](#${this.slugify(text)})`;
				this.applyEdit(s, e, snippet, s, s + snippet.length);
				return;
			}
			case 'anchor': {
				const id = this.slugify(sel || 'section-id');
				const snippet = `<a id="${id}"></a>`;
				this.applyEdit(s, e, snippet + sel, s + 9, s + 9 + id.length);
				return;
			}
			case 'footnote': {
				const n = (this.source.match(/\[\^(\d+)\]/g) || []).length + 1;
				const snippet = `[^${n}]`;
				const def = `\n\n[^${n}]: Footnote text.`;
				this.source = value.slice(0, s) + snippet + value.slice(e) + def;
				this.persist();
				later(this, () => el.focus());
				return;
			}
			case 'table': {
				const snippet = `${lead}\n${TABLE_TEMPLATE}`;
				this.applyEdit(s, e, snippet, s + snippet.length);
				return;
			}
			case 'row': {
				const { to } = this.lineRange(value, s, e);
				const header = value.slice(this.lineRange(value, s, e).from, to);
				const cols = Math.max(2, (header.match(/\|/g) || []).length - 1);
				const row = `\n|${' Cell |'.repeat(cols)}`;
				this.applyEdit(to, to, row, to + row.length);
				return;
			}
			case 'image': {
				const alt = sel || 'alt text';
				const snippet = `![${alt}](https://)`;
				this.applyEdit(s, e, snippet, s + alt.length + 4 + 8);
				return;
			}
			case 'hr': {
				const snippet = `${lead}\n---\n\n`;
				this.applyEdit(s, e, snippet, s + snippet.length);
				return;
			}
			case 'break': {
				this.applyEdit(s, e, '  \n', s + 3);
				return;
			}
			default:
				return;
		}
	}

	computeActive() {
		const el = this.editor;
		if (!el) return {};
		const value = this.source;
		const s = el.selectionStart;
		const e = el.selectionEnd;
		const { from, to } = this.lineRange(value, s, e);
		const lines = value.slice(from, to).split('\n');
		const map = {};

		for (const group of TOOLBAR) {
			for (const btn of group.buttons) {
				if (btn.kind === 'prefix') {
					map[btn.id] =
						lines.length > 0 && lines.every((l) => l.startsWith(btn.token));
				} else if (btn.kind === 'ordered') {
					map[btn.id] = lines.every((l) => /^\d+\. /.test(l));
				} else if (btn.kind === 'wrap') {
					const open = btn.token;
					const close = btn.close ?? btn.token;
					const inner = value.slice(s, e);
					map[btn.id] =
						(value.slice(Math.max(0, s - open.length), s) === open &&
							value.slice(e, e + close.length) === close) ||
						(inner.length > open.length + close.length &&
							inner.startsWith(open) &&
							inner.endsWith(close));
				} else if (btn.kind === 'fence') {
					map[btn.id] =
						(value.slice(0, s).match(/```/g) || []).length % 2 === 1;
				} else if (btn.id === 'table') {
					map[btn.id] = lines.some((l) => l.trim().startsWith('|'));
				} else if (btn.id === 'anchor') {
					map[btn.id] = lines.some((l) => /<a id="/.test(l));
				}
			}
		}
		return map;
	}

	refreshActive() {
		this.activeMap = this.computeActive();
	}

	// ------------------------------------------------------------------ actions

	@action
	handleInput(event) {
		this.source = event.target.value;
		this.persist();
		this.refreshActive();
	}

	@action
	handleSelection() {
		this.refreshActive();
	}

	@action
	handleKeydown(event) {
		const meta = event.metaKey || event.ctrlKey;

		// Tab indents instead of leaving the textarea.
		if (event.key === 'Tab') {
			event.preventDefault();
			const el = event.target;
			const s = el.selectionStart;
			this.applyEdit(s, el.selectionEnd, '  ', s + 2);
			return;
		}

		if (!meta) return;
		const shortcuts = { b: 'bold', i: 'italic', k: 'link', e: 'code' };
		const id = shortcuts[event.key.toLowerCase()];
		if (id) {
			event.preventDefault();
			const btn = TOOLBAR.flatMap((g) => g.buttons).find((b) => b.id === id);
			this.applyFormat(btn);
		}
		if (event.key.toLowerCase() === 's') {
			event.preventDefault();
			this.download();
		}
	}

	@action
	applyFormat(btn) {
		if (!this.editor) return;
		switch (btn.kind) {
			case 'wrap':
				this.toggleWrap(btn);
				break;
			case 'prefix':
				this.togglePrefix(btn);
				break;
			case 'ordered':
				this.toggleOrdered();
				break;
			case 'fence':
				this.toggleFence(btn);
				break;
			default:
				this.insertSnippet(btn);
		}
	}

	@action
	download() {
		const blob = new Blob([this.source], {
			type: 'text/markdown;charset=utf-8',
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = this.downloadName;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	@action
	async openFile(event) {
		const file = event.target.files?.[0];
		if (!file) return;
		this.source = await file.text();
		this.persist();
		this.refreshActive();
		event.target.value = '';
	}

	@action
	async copySource() {
		await navigator.clipboard.writeText(this.source);
	}

	@action
	clearAll() {
		if (!window.confirm('Clear the editor and the cached copy?')) return;
		this.source = '';
		try {
			window.localStorage.removeItem(CACHE_KEY);
		} catch {
			// ignore
		}
		this.savedAt = null;
	}

	@action
	toggleSyncScroll() {
		this.syncScroll = !this.syncScroll;
	}

	@action
	toggleLabels() {
		this.showToolbarLabels = !this.showToolbarLabels;
	}

	@action
	mirrorScroll(event) {
		const src = event.target;

		// Alignment of the highlight layer is independent of the sync toggle.
		if (src.id === 'md-source') {
			const layer = document.getElementById('md-highlight');
			if (layer) {
				layer.scrollTop = src.scrollTop;
				layer.scrollLeft = src.scrollLeft;
			}
		}

		if (!this.syncScroll || this._syncing) return;
		const target =
			src.id === 'md-source'
				? document.getElementById('md-preview')
				: document.getElementById('md-source');
		if (!target) return;
		this._syncing = true;
		const ratio =
			src.scrollTop / Math.max(1, src.scrollHeight - src.clientHeight);
		target.scrollTop = ratio * (target.scrollHeight - target.clientHeight);
		later(
			this,
			() => {
				this._syncing = false;
			},
			30,
		);
	}
}