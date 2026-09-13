import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { htmlSafe } from '@ember/template';
import { later, cancel } from '@ember/runloop';
import { modifier } from 'ember-modifier';

const CACHE_KEY = 'tribe:html-editor:document';

const BOOTSTRAP_CSS =
	'<link\n  href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"\n  rel="stylesheet"\n  integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH"\n  crossorigin="anonymous"\n/>\n<link\n  href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.2/css/all.min.css"\n  rel="stylesheet"\n/>';

const ANIMATE_CSS =
	'<link\n  href="https://cdn.jsdelivr.net/npm/animate.css@4.1.1/animate.min.css"\n  rel="stylesheet"\n/>';

const BOOTSTRAP_JS =
	'<script\n  src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"\n  integrity="sha384-YvpcrYf0tY3lHB60NNkmXc5s9fDVZLESaAA55NDzOxhy9GkcIdslK1eN7N6jIeHz"\n  crossorigin="anonymous"\n></script>';

const FONTS = [
	{
		id: 'ibm-plex-mono',
		label: 'IBM Plex Mono',
		stack: "'IBM Plex Mono', monospace",
		href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap',
	},
	{
		id: 'inter',
		label: 'Inter',
		stack: "'Inter', system-ui, sans-serif",
		href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
	},
	{
		id: 'jetbrains-mono',
		label: 'JetBrains Mono',
		stack: "'JetBrains Mono', monospace",
		href: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap',
	},
	{
		id: 'space-grotesk',
		label: 'Space Grotesk',
		stack: "'Space Grotesk', sans-serif",
		href: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&display=swap',
	},
	{
		id: 'fraunces',
		label: 'Fraunces',
		stack: "'Fraunces', Georgia, serif",
		href: 'https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600;800&display=swap',
	},
	{
		id: 'system',
		label: 'System UI',
		stack: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
		href: '',
	},
];

const THEME_COLORS = [
	{ name: 'primary', label: 'Primary', value: '#000000' },
	{ name: 'secondary', label: 'Secondary', value: '#cccccc' },
	{ name: 'success', label: 'Success', value: '#00ff00' },
	{ name: 'info', label: 'Info', value: '#0000ff' },
	{ name: 'warning', label: 'Warning', value: '#ffff00' },
	{ name: 'danger', label: 'Danger', value: '#ff0000' },
	{ name: 'light', label: 'Light', value: '#eeeeee' },
	{ name: 'dark', label: 'Dark', value: '#333333' },
];

const SPACER_SCALE = [0, 0.25, 0.5, 1, 1.5, 3, 4.5, 6, 7.5, 9, 12];

const SPACING_SIDES = [
	['', ['']],
	['t', ['-top']],
	['b', ['-bottom']],
	['s', ['-left']],
	['e', ['-right']],
	['x', ['-left', '-right']],
	['y', ['-top', '-bottom']],
];

const GRID_BREAKPOINTS = [
	['', 0],
	['sm', 576],
	['md', 768],
	['lg', 992],
	['xl', 1200],
];

const DEFAULT_THEME = {
	font: 'ibm-plex-mono',
	colors: Object.fromEntries(THEME_COLORS.map((c) => [c.name, c.value])),
	rounded: false,
	cssGrid: true,
	negativeMargins: true,
};

const STARTER = {
	doctype: '<!doctype html>',
	lang: 'en',
	metadata:
		'<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n<meta name="description" content="" />\n<title>Untitled document</title>',
	headScripts: `${BOOTSTRAP_CSS}\n${ANIMATE_CSS}`,
	styles: 'body {\n  padding-top: 4.5rem;\n}',
	navbar:
		'<nav class="navbar navbar-expand-lg fixed-top bg-body-tertiary border-bottom">\n  <div class="container">\n    <a class="navbar-brand fw-bold" href="#top">Brand</a>\n    <button\n      class="navbar-toggler"\n      type="button"\n      data-bs-toggle="collapse"\n      data-bs-target="#nav"\n      aria-controls="nav"\n      aria-expanded="false"\n      aria-label="Toggle navigation"\n    >\n      <span class="navbar-toggler-icon"></span>\n    </button>\n    <div class="collapse navbar-collapse" id="nav">\n      <ul class="navbar-nav ms-auto">\n        <li class="nav-item"><a class="nav-link active" href="#section-1">Intro</a></li>\n      </ul>\n    </div>\n  </div>\n</nav>',
	footer:
		'<footer class="border-top py-4 mt-5">\n  <div class="container d-flex flex-wrap justify-content-between">\n    <span class="text-body-secondary small">&copy; 2026</span>\n    <a class="small link-body-emphasis text-decoration-none" href="#top">Back to top</a>\n  </div>\n</footer>',
	tailScripts: `${BOOTSTRAP_JS}\n<script>\n  document.addEventListener('DOMContentLoaded', () => {});\n</script>`,
	sections: [
		{
			id: 1,
			label: 'Intro',
			html: '<section id="section-1" class="py-5">\n  <div class="container">\n    <div class="row align-items-center g-4">\n      <div class="col-lg-7">\n        <h1 class="display-5 fw-bold">Headline</h1>\n        <p class="lead text-body-secondary">Supporting copy.</p>\n        <a class="btn btn-primary" href="#section-1" role="button">Primary action</a>\n      </div>\n    </div>\n  </div>\n</section>',
		},
	],
};

const SNIPPETS = [
	{
		label: 'Layout',
		buttons: [
			{
				id: 'container',
				icon: 'fa-square',
				title: 'Container',
				body: '<div class="container">\n  \n</div>',
			},
			{
				id: 'row',
				icon: 'fa-table-columns',
				title: 'Row + columns',
				body: '<div class="row g-4">\n  <div class="col-md-6"></div>\n  <div class="col-md-6"></div>\n</div>',
			},
			{
				id: 'section',
				icon: 'fa-layer-group',
				title: 'Section wrapper',
				body: '<section class="py-5">\n  <div class="container">\n    \n  </div>\n</section>',
			},
			{
				id: 'grid',
				icon: 'fa-grip',
				title: 'Responsive card grid',
				body: '<div class="row row-cols-1 row-cols-md-3 g-4">\n  <div class="col"><div class="card h-100"><div class="card-body"></div></div></div>\n</div>',
			},
			{
				id: 'cssgrid',
				icon: 'fa-border-all',
				title: 'CSS grid (12 columns)',
				body: '<div class="grid">\n  <div class="g-col-12 g-col-md-6"></div>\n  <div class="g-col-12 g-col-md-6"></div>\n</div>',
			},
		],
	},
	{
		label: 'Components',
		buttons: [
			{
				id: 'card',
				icon: 'fa-id-card',
				title: 'Card',
				body: '<div class="card">\n  <div class="card-body">\n    <h5 class="card-title">Title</h5>\n    <p class="card-text">Text.</p>\n  </div>\n</div>',
			},
			{
				id: 'alert',
				icon: 'fa-circle-exclamation',
				title: 'Alert',
				body: '<div class="alert alert-primary" role="alert">Message</div>',
			},
			{
				id: 'button',
				icon: 'fa-hand-pointer',
				title: 'Button',
				body: '<button type="button" class="btn btn-primary">Button</button>',
			},
			{
				id: 'accordion',
				icon: 'fa-bars-staggered',
				title: 'Accordion',
				body: '<div class="accordion" id="acc-1">\n  <div class="accordion-item">\n    <h2 class="accordion-header">\n      <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#acc-1-a">Item</button>\n    </h2>\n    <div id="acc-1-a" class="accordion-collapse collapse" data-bs-parent="#acc-1">\n      <div class="accordion-body"></div>\n    </div>\n  </div>\n</div>',
			},
			{
				id: 'modal',
				icon: 'fa-window-restore',
				title: 'Modal',
				body: '<button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#modal-1">Open</button>\n<div class="modal fade" id="modal-1" tabindex="-1" aria-hidden="true">\n  <div class="modal-dialog">\n    <div class="modal-content">\n      <div class="modal-header">\n        <h5 class="modal-title">Title</h5>\n        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>\n      </div>\n      <div class="modal-body"></div>\n    </div>\n  </div>\n</div>',
			},
			{
				id: 'table',
				icon: 'fa-table',
				title: 'Table',
				body: '<div class="table-responsive">\n  <table class="table table-striped align-middle">\n    <thead><tr><th scope="col">Column</th><th scope="col">Column</th></tr></thead>\n    <tbody><tr><td>Cell</td><td>Cell</td></tr></tbody>\n  </table>\n</div>',
			},
			{
				id: 'list-group',
				icon: 'fa-list',
				title: 'List group',
				body: '<ul class="list-group list-group-flush">\n  <li class="list-group-item">Item</li>\n</ul>',
			},
			{
				id: 'animated',
				icon: 'fa-wand-magic-sparkles',
				title: 'Animated block (animate.css)',
				body: '<div class="animate__animated animate__fadeInUp">\n  \n</div>',
			},
		],
	},
	{
		label: 'Inline',
		buttons: [
			{
				id: 'strong',
				kind: 'wrap',
				open: '<strong>',
				close: '</strong>',
				icon: 'fa-bold',
				title: 'Bold',
			},
			{
				id: 'em',
				kind: 'wrap',
				open: '<em>',
				close: '</em>',
				icon: 'fa-italic',
				title: 'Italic',
			},
			{
				id: 'code',
				kind: 'wrap',
				open: '<code>',
				close: '</code>',
				icon: 'fa-code',
				title: 'Inline code',
			},
			{
				id: 'link',
				kind: 'wrap',
				open: '<a href="#">',
				close: '</a>',
				icon: 'fa-link',
				title: 'Link',
			},
			{
				id: 'comment',
				kind: 'wrap',
				open: '<!-- ',
				close: ' -->',
				icon: 'fa-comment-slash',
				title: 'Comment out',
			},
		],
	},
];

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

const TAG_SPLIT = /<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|<[^>]*>/gi;
const ATTR_TOKENS = /([\w:@.\-[\]]+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)?/g;

const CSS_TOKENS =
	/(\/\*[\s\S]*?\*\/)|("[^"\n]*"|'[^'\n]*')|(@[\w-]+)|([{}();,])|([-\w]+)(?=\s*:)|(#[0-9a-fA-F]{3,8}\b|-?\d*\.?\d+(?:px|rem|em|%|vh|vw|fr|s|ms|deg)?\b)/g;

const JS_TOKENS =
	/(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|(`(?:\\[\s\S]|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|\b(const|let|var|function|return|if|else|for|while|do|new|class|extends|import|from|export|default|async|await|try|catch|finally|switch|case|break|continue|typeof|instanceof|delete|void|yield|in|of|this|null|undefined|true|false)\b|\b(\d+\.?\d*)\b|([A-Za-z_$][\w$]*)(?=\s*\()/g;

export default class HtmlEditorController extends Controller {
	@tracked doctype = STARTER.doctype;
	@tracked _lang = STARTER.lang;
	@tracked metadata = STARTER.metadata;
	@tracked styles = STARTER.styles;
	@tracked headScripts = STARTER.headScripts;
	@tracked navbar = STARTER.navbar;
	@tracked sections = STARTER.sections;
	@tracked footer = STARTER.footer;
	@tracked tailScripts = STARTER.tailScripts;

	@tracked theme = { ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors } };

	@tracked collapsed = {};
	@tracked activeKey = 'navbar';
	@tracked savedAt = null;
	@tracked showToolbarLabels = true;
	@tracked previewSrc = '';

	snippets = SNIPPETS;
	fonts = FONTS;

	_saveTimer = null;
	_nextSectionId = 2;

	get lang() {
		return this._lang;
	}

	set lang(value) {
		this._lang = value;
		this.persist();
	}

	// ---------------------------------------------------------------- lifecycle

	bootEditor = modifier(() => {
		this.setup();
		return () => this.teardown();
	});

	filePicker = modifier((element) => {
		const pick = (event) => this.openFile(event);
		element.addEventListener('change', pick);
		return () => element.removeEventListener('change', pick);
	});

	// Builds the preview document only while the offcanvas is on screen.
	previewBridge = modifier((element) => {
		const refresh = () => {
			this.previewSrc = this.documentHtml;
		};
		element.addEventListener('show.bs.offcanvas', refresh);
		element.addEventListener('hidden.bs.offcanvas', () => {
			this.previewSrc = '';
		});
		return () => element.removeEventListener('show.bs.offcanvas', refresh);
	});

	@action
	setup() {
		try {
			const cached = window.localStorage.getItem(CACHE_KEY);
			if (!cached) return;
			const parsed = JSON.parse(cached);
			for (const key of [
				'doctype',
				'lang',
				'metadata',
				'styles',
				'headScripts',
				'navbar',
				'footer',
				'tailScripts',
			]) {
				if (typeof parsed[key] === 'string') this[key] = parsed[key];
			}
			if (parsed.theme) {
				this.theme = {
					...DEFAULT_THEME,
					...parsed.theme,
					colors: { ...DEFAULT_THEME.colors, ...(parsed.theme.colors ?? {}) },
				};
			}
			if (Array.isArray(parsed.sections) && parsed.sections.length) {
				this.sections = parsed.sections;
				this._nextSectionId =
					Math.max(...parsed.sections.map((s) => s.id ?? 0)) + 1;
			}
			this.savedAt = parsed.savedAt ? new Date(parsed.savedAt) : null;
		} catch {
			// Corrupt or unreadable cache — the starter document stands.
		}
	}

	@action
	teardown() {
		if (this._saveTimer) cancel(this._saveTimer);
	}

	// ------------------------------------------------------------------ panes

	pane(key, label, icon, lang, meta, size = 'sm') {
		const controller = this;
		return {
			key,
			label,
			icon,
			lang,
			meta,
			size,
			get value() {
				return controller.readKey(key);
			},
			set value(next) {
				controller.writeKey(key, next);
			},
			highlighted: this.highlight(this[key], lang),
			collapsed: Boolean(this.collapsed[key]),
			active: this.activeKey === key,
			showLang: key === 'doctype',
		};
	}

	get headPanes() {
		return [
			this.pane(
				'doctype',
				'Doctype',
				'fa-file-code',
				'html',
				'declaration only',
			),
			this.pane(
				'metadata',
				'Metadata',
				'fa-tags',
				'html',
				'charset, viewport, title, meta',
			),
			this.pane('styles', 'Styles', 'fa-palette', 'css', 'wrapped in <style>'),
			this.pane(
				'headScripts',
				'Scripts',
				'fa-link',
				'html',
				'link & script tags — verbatim',
			),
		];
	}

	get navbarPane() {
		return this.pane(
			'navbar',
			'Navbar',
			'fa-bars',
			'html',
			'top of <body>',
			'md',
		);
	}

	get sectionPanes() {
		const controller = this;
		return this.sections.map((section, index) => {
			const key = `section-${section.id}`;
			return {
				id: section.id,
				key,
				get label() {
					return section.label;
				},
				set label(next) {
					controller.writeSectionLabel(section.id, next);
				},
				get value() {
					return controller.readKey(key);
				},
				set value(next) {
					controller.writeKey(key, next);
				},
				highlighted: this.highlight(section.html, 'html'),
				collapsed: Boolean(this.collapsed[key]),
				active: this.activeKey === key,
				index,
				first: index === 0,
				last: index === this.sections.length - 1,
				position: index + 1,
			};
		});
	}

	get tailPanes() {
		return [
			this.pane(
				'footer',
				'Footer',
				'fa-shoe-prints',
				'html',
				'end of <body>',
				'md',
			),
			this.pane(
				'tailScripts',
				'Scripts',
				'fa-code',
				'html',
				'bundle tags + inline JS',
				'md',
			),
		];
	}

	get groups() {
		return [
			{
				key: 'head',
				label: 'HEAD',
				hint: 'everything inside <head>',
				panes: this.headPanes,
			},
			{
				key: 'body',
				label: 'BODY',
				hint: 'navbar, then sections in order',
				panes: [this.navbarPane],
				hasSections: true,
			},
			{
				key: 'tail',
				label: 'TAIL',
				hint: 'closing footer and scripts',
				panes: this.tailPanes,
			},
		];
	}

	// -------------------------------------------------------------- highlight

	escapeHtml(text) {
		return String(text ?? '').replace(/[&<>]/g, (c) => HTML_ESCAPES[c]);
	}

	token(name, text) {
		return `<span class="hl-${name}">${this.escapeHtml(text)}</span>`;
	}

	highlight(text, lang) {
		const source = text ?? '';
		const marked =
			lang === 'css'
				? this.highlightCss(source)
				: lang === 'js'
					? this.highlightJs(source)
					: this.highlightHtml(source);
		return htmlSafe(`${marked}\n`);
	}

	highlightHtml(text) {
		let out = '';
		let cursor = 0;
		let m;
		TAG_SPLIT.lastIndex = 0;

		while ((m = TAG_SPLIT.exec(text))) {
			out += this.escapeHtml(text.slice(cursor, m.index));
			const chunk = m[0];
			if (chunk.startsWith('<!--')) out += this.token('comment', chunk);
			else if (/^<!DOCTYPE/i.test(chunk)) out += this.token('doctype', chunk);
			else out += this.highlightTag(chunk);
			cursor = m.index + chunk.length;
		}
		return out + this.escapeHtml(text.slice(cursor));
	}

	highlightTag(tag) {
		const parts = tag.match(/^(<\/?)([\w:-]*)([\s\S]*?)(\/?>)$/);
		if (!parts) return this.escapeHtml(tag);

		const [, open, name, attrs, close] = parts;
		return (
			this.token('punct', open) +
			this.token('tag-name', name) +
			this.highlightAttrs(attrs) +
			this.token('punct', close)
		);
	}

	highlightAttrs(text) {
		let out = '';
		let cursor = 0;
		let m;
		ATTR_TOKENS.lastIndex = 0;

		while ((m = ATTR_TOKENS.exec(text))) {
			out += this.escapeHtml(text.slice(cursor, m.index));
			out +=
				this.token('attr', m[1]) +
				this.token('punct', m[2]) +
				(m[3] ? this.token('string', m[3]) : '');
			cursor = m.index + m[0].length;
		}
		return out + this.escapeHtml(text.slice(cursor));
	}

	highlightCss(text) {
		let out = '';
		let cursor = 0;
		let depth = 0;
		let m;
		CSS_TOKENS.lastIndex = 0;

		const gap = (chunk) =>
			chunk.trim()
				? this.token(depth > 0 ? 'value' : 'selector', chunk)
				: this.escapeHtml(chunk);

		while ((m = CSS_TOKENS.exec(text))) {
			out += gap(text.slice(cursor, m.index));
			if (m[1]) out += this.token('comment', m[1]);
			else if (m[2]) out += this.token('string', m[2]);
			else if (m[3]) out += this.token('at-rule', m[3]);
			else if (m[4]) {
				if (m[4] === '{') depth += 1;
				if (m[4] === '}') depth = Math.max(0, depth - 1);
				out += this.token('punct', m[4]);
			} else if (m[5]) out += this.token('prop', m[5]);
			else out += this.token('number', m[6]);
			cursor = m.index + m[0].length;
		}
		return out + gap(text.slice(cursor));
	}

	highlightJs(text) {
		let out = '';
		let cursor = 0;
		let m;
		JS_TOKENS.lastIndex = 0;

		while ((m = JS_TOKENS.exec(text))) {
			out += this.escapeHtml(text.slice(cursor, m.index));
			if (m[1]) out += this.token('comment', m[1]);
			else if (m[2]) out += this.token('string', m[2]);
			else if (m[3]) out += this.token('keyword', m[3]);
			else if (m[4]) out += this.token('number', m[4]);
			else out += this.token('fn', m[5]);
			cursor = m.index + m[0].length;
		}
		return out + this.escapeHtml(text.slice(cursor));
	}

	// ------------------------------------------------------------------- theme

	get palette() {
		return THEME_COLORS.map(({ name, label }) => ({
			name,
			label,
			value: this.theme.colors[name],
		}));
	}

	get activeFont() {
		return FONTS.find((f) => f.id === this.theme.font) ?? FONTS[0];
	}

	get fontOptions() {
		return FONTS.map((f) => ({ ...f, selected: f.id === this.theme.font }));
	}

	get themeFlags() {
		return [
			{
				key: 'rounded',
				label: 'Rounded edges',
				icon: 'fa-border-top-left',
				on: this.theme.rounded,
			},
			{
				key: 'cssGrid',
				label: 'CSS grid utilities',
				icon: 'fa-border-all',
				on: this.theme.cssGrid,
			},
			{
				key: 'negativeMargins',
				label: 'Negative margins',
				icon: 'fa-minus',
				on: this.theme.negativeMargins,
			},
		];
	}

	writeTheme(patch) {
		this.theme = { ...this.theme, ...patch };
		this.persist();
	}

	@action
	setFont(event) {
		this.writeTheme({ font: event.target.value });
	}

	@action
	setColor(name, event) {
		this.writeTheme({
			colors: { ...this.theme.colors, [name]: event.target.value },
		});
	}

	@action
	toggleFlag(key) {
		this.writeTheme({ [key]: !this.theme[key] });
	}

	@action
	resetTheme() {
		this.theme = { ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors } };
		this.persist();
	}

	rgb(hex) {
		const h = hex.replace('#', '');
		const full =
			h.length === 3
				? h
						.split('')
						.map((c) => c + c)
						.join('')
				: h.padEnd(6, '0').slice(0, 6);
		return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
	}

	mix(hex, target, weight) {
		const a = this.rgb(hex);
		const b = this.rgb(target);
		const out = a.map((v, i) => Math.round(v + (b[i] - v) * weight));
		return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
	}

	contrast(hex) {
		const [r, g, b] = this.rgb(hex).map((v) => {
			const s = v / 255;
			return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
		});
		return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#000000' : '#ffffff';
	}

	get colorTokens() {
		const roots = [];
		const rules = [];

		for (const { name } of THEME_COLORS) {
			const base = this.theme.colors[name];
			const ink = this.contrast(base);
			const shade = this.mix(
				base,
				ink === '#ffffff' ? '#ffffff' : '#000000',
				0.2,
			);
			const tint = this.mix(base, '#ffffff', 0.8);
			const deep = this.mix(base, '#000000', 0.45);

			roots.push(
				`  --bs-${name}: ${base};`,
				`  --bs-${name}-rgb: ${this.rgb(base).join(', ')};`,
			);
			rules.push(
				`.text-${name} { color: ${base} !important; }`,
				`.bg-${name} { background-color: ${base} !important; }`,
				`.border-${name} { border-color: ${base} !important; }`,
				`.link-${name} { color: ${base} !important; }`,
				`.text-bg-${name} { color: ${ink} !important; background-color: ${base} !important; }`,
				`.btn-${name} {\n  --bs-btn-color: ${ink};\n  --bs-btn-bg: ${base};\n  --bs-btn-border-color: ${base};\n  --bs-btn-hover-color: ${ink};\n  --bs-btn-hover-bg: ${shade};\n  --bs-btn-hover-border-color: ${shade};\n  --bs-btn-active-color: ${ink};\n  --bs-btn-active-bg: ${shade};\n  --bs-btn-active-border-color: ${shade};\n  --bs-btn-disabled-color: ${ink};\n  --bs-btn-disabled-bg: ${base};\n  --bs-btn-disabled-border-color: ${base};\n}`,
				`.btn-outline-${name} {\n  --bs-btn-color: ${base};\n  --bs-btn-border-color: ${base};\n  --bs-btn-hover-color: ${ink};\n  --bs-btn-hover-bg: ${base};\n  --bs-btn-hover-border-color: ${base};\n  --bs-btn-active-color: ${ink};\n  --bs-btn-active-bg: ${base};\n  --bs-btn-active-border-color: ${base};\n}`,
				`.alert-${name} {\n  --bs-alert-color: ${deep};\n  --bs-alert-bg: ${tint};\n  --bs-alert-border-color: ${base};\n}`,
			);
		}

		return { roots, rules };
	}

	get spacingTokens() {
		const rules = [];

		SPACER_SCALE.forEach((step, index) => {
			if (index < 6) return;
			for (const [suffix, props] of SPACING_SIDES) {
				const decl = (prefix) =>
					props.map((p) => `${prefix}${p}: ${step}rem !important;`).join(' ');
				rules.push(`.m${suffix}-${index} { ${decl('margin')} }`);
				rules.push(`.p${suffix}-${index} { ${decl('padding')} }`);
			}
		});

		if (this.theme.negativeMargins) {
			SPACER_SCALE.forEach((step, index) => {
				if (index === 0) return;
				for (const [suffix, props] of SPACING_SIDES) {
					const decl = props
						.map((p) => `margin${p}: -${step}rem !important;`)
						.join(' ');
					rules.push(`.m${suffix}-n${index} { ${decl} }`);
				}
			});
		}

		return rules;
	}

	get gridTokens() {
		if (!this.theme.cssGrid) return [];

		const columns = Array.from({ length: 12 }, (_, i) => i + 1);
		const rules = [
			'.grid {\n  display: grid;\n  gap: var(--bs-gap, 1.5rem);\n  grid-template-rows: repeat(var(--bs-rows, 1), 1fr);\n  grid-template-columns: repeat(var(--bs-columns, 12), 1fr);\n}',
			'.grid > * { grid-column: auto / span var(--bs-columns, 12); }',
		];

		for (const [breakpoint, width] of GRID_BREAKPOINTS) {
			const infix = breakpoint ? `${breakpoint}-` : '';
			const block = columns
				.flatMap((n) => [
					`.g-col-${infix}${n} { grid-column: auto / span ${n}; }`,
					`.g-start-${infix}${n} { grid-column-start: ${n}; }`,
				])
				.join('\n');
			rules.push(
				width
					? `@media (min-width: ${width}px) {\n${this.indent(block, 2)}\n}`
					: block,
			);
		}

		return rules;
	}

	get radiusTokens() {
		if (this.theme.rounded) return [];
		return [
			'--bs-border-radius',
			'--bs-border-radius-sm',
			'--bs-border-radius-lg',
			'--bs-border-radius-xl',
			'--bs-border-radius-xxl',
			'--bs-border-radius-2xl',
			'--bs-border-radius-pill',
		].map((token) => `  ${token}: 0;`);
	}

	get themeCss() {
		const { roots, rules } = this.colorTokens;
		const stack = this.activeFont.stack;

		const root = [
			':root, [data-bs-theme="light"] {',
			`  --bs-body-font-family: ${stack};`,
			`  --bs-font-sans-serif: ${stack};`,
			...roots,
			...this.radiusTokens,
			'}',
		].join('\n');

		const base = [
			'body, .display-1, .display-2, .display-3, .display-4, .display-5, .display-6 {',
			`  font-family: ${stack};`,
			'}',
		].join('\n');

		return [
			root,
			base,
			...rules,
			...this.spacingTokens,
			...this.gridTokens,
		].join('\n\n');
	}

	get fontLink() {
		const { href } = this.activeFont;
		if (!href) return '';
		return `<link rel="preconnect" href="https://fonts.googleapis.com" data-theme-font />\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin data-theme-font />\n<link href="${href}" rel="stylesheet" data-theme-font />`;
	}

	// ---------------------------------------------------------------- document

	indent(text, spaces) {
		const pad = ' '.repeat(spaces);
		return (text || '')
			.split('\n')
			.map((line) => (line.trim() ? pad + line : line))
			.join('\n');
	}

	get documentHtml() {
		const styleBlock = this.styles.trim()
			? `    <style>\n${this.indent(this.styles, 6)}\n    </style>`
			: '';
		const themeBlock = `    <style id="theme-tokens">\n${this.indent(this.themeCss, 6)}\n    </style>`;
		const body = [
			this.navbar,
			...this.sections.map((s) => s.html),
			this.footer,
			this.tailScripts,
		]
			.filter((part) => part && part.trim())
			.map((part) => this.indent(part, 4))
			.join('\n\n');

		return [
			this.doctype.trim(),
			`<html lang="${this.lang || 'en'}">`,
			'  <head>',
			this.indent(this.metadata, 4),
			this.indent(this.headScripts, 4),
			this.indent(this.fontLink, 4),
			themeBlock,
			styleBlock,
			'  </head>',
			'  <body id="top">',
			body,
			'  </body>',
			'</html>',
			'',
		]
			.filter((line) => line !== '')
			.join('\n');
	}

	get downloadName() {
		const d = new Date();
		const p = (n) => String(n).padStart(2, '0');
		return `index-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}-${p(d.getMinutes())}.html`;
	}

	get savedLabel() {
		if (!this.savedAt) return 'Not saved yet';
		const p = (n) => String(n).padStart(2, '0');
		return `Saved ${p(this.savedAt.getHours())}:${p(this.savedAt.getMinutes())}:${p(this.savedAt.getSeconds())}`;
	}

	get lineCount() {
		return this.documentHtml.split('\n').length;
	}

	get sizeLabel() {
		const bytes = new Blob([this.documentHtml]).size;
		return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
	}

	// ---------------------------------------------------------------- storage

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
							doctype: this.doctype,
							lang: this.lang,
							metadata: this.metadata,
							styles: this.styles,
							headScripts: this.headScripts,
							navbar: this.navbar,
							sections: this.sections,
							footer: this.footer,
							tailScripts: this.tailScripts,
							theme: this.theme,
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

	// ------------------------------------------------------------------ editing

	domId(key) {
		return `he-src-${key}`;
	}

	isSection(key) {
		return key.startsWith('section-');
	}

	readKey(key) {
		if (!this.isSection(key)) return this[key] ?? '';
		const id = Number(key.slice(8));
		return this.sections.find((s) => s.id === id)?.html ?? '';
	}

	writeKey(key, value) {
		if (this.isSection(key)) {
			const id = Number(key.slice(8));
			this.sections = this.sections.map((s) =>
				s.id === id ? { ...s, html: value } : s,
			);
		} else {
			this[key] = value;
		}
		this.persist();
	}

	applyEdit(key, start, end, replacement, selStart, selEnd) {
		const value = this.readKey(key);
		const next = value.slice(0, start) + replacement + value.slice(end);
		this.writeKey(key, next);

		const el = document.getElementById(this.domId(key));
		later(this, () => {
			if (!el) return;
			el.value = next;
			el.focus();
			el.setSelectionRange(selStart, selEnd ?? selStart);
		});
	}

	@action
	insertSnippet(btn) {
		const key = this.activeKey;
		const el = document.getElementById(this.domId(key));
		if (!el) return;

		const value = this.readKey(key);
		const s = el.selectionStart;
		const e = el.selectionEnd;
		const selection = value.slice(s, e);

		if (btn.kind === 'wrap') {
			const wrapped = btn.open + selection + btn.close;
			this.applyEdit(
				key,
				s,
				e,
				wrapped,
				s + btn.open.length,
				s + btn.open.length + selection.length,
			);
			return;
		}

		const atLineStart = s === 0 || value[s - 1] === '\n';
		const indent = atLineStart
			? value.slice(value.lastIndexOf('\n', s - 1) + 1, s).match(/^\s*/)[0]
			: '';
		const block = this.indent(btn.body, indent.length).trimStart();
		const snippet = `${atLineStart ? '' : '\n'}${block}\n`;
		this.applyEdit(key, s, e, snippet, s + snippet.length);
	}

	// ----------------------------------------------------------------- sections

	@action
	addSection() {
		const id = this._nextSectionId++;
		this.sections = [
			...this.sections,
			{
				id,
				label: `Section ${id}`,
				html: `<section id="section-${id}" class="py-5">\n  <div class="container">\n    <h2 class="h3 fw-bold mb-3">Heading</h2>\n    <p class="text-body-secondary">Copy.</p>\n  </div>\n</section>`,
			},
		];
		this.activeKey = `section-${id}`;
		this.persist();
	}

	@action
	duplicateSection(pane) {
		const id = this._nextSectionId++;
		const index = this.sections.findIndex((s) => s.id === pane.id);
		const section = this.sections[index];
		const copy = {
			id,
			label: `${this.sectionLabel(section)} copy`,
			html: section.html.replace(/id="section-\d+"/, `id="section-${id}"`),
		};
		this.sections = [
			...this.sections.slice(0, index + 1),
			copy,
			...this.sections.slice(index + 1),
		];
		this.persist();
	}

	@action
	removeSection(pane) {
		const section = this.sections.find((s) => s.id === pane.id);
		if (!window.confirm(`Remove “${this.sectionLabel(section)}”?`)) return;
		this.sections = this.sections.filter((s) => s.id !== pane.id);
		this.persist();
	}

	@action
	moveSection(pane, offset) {
		const index = this.sections.findIndex((s) => s.id === pane.id);
		const target = index + offset;
		if (target < 0 || target >= this.sections.length) return;
		const next = [...this.sections];
		[next[index], next[target]] = [next[target], next[index]];
		this.sections = next;
		this.persist();
	}

	sectionLabel(section) {
		return section.label?.trim() || `Section ${section.id}`;
	}

	writeSectionLabel(id, label) {
		this.sections = this.sections.map((s) =>
			s.id === id ? { ...s, label } : s,
		);
		this.persist();
	}

	// ------------------------------------------------------------------ actions

	@action
	toggleCollapse(key) {
		this.collapsed = { ...this.collapsed, [key]: !this.collapsed[key] };
	}

	@action
	collapseAll(state) {
		const keys = [
			'doctype',
			'metadata',
			'styles',
			'headScripts',
			'navbar',
			'footer',
			'tailScripts',
			...this.sections.map((s) => `section-${s.id}`),
		];
		this.collapsed = Object.fromEntries(keys.map((k) => [k, state]));
	}

	@action
	toggleLabels() {
		this.showToolbarLabels = !this.showToolbarLabels;
	}

	@action
	refreshPreview() {
		this.previewSrc = this.documentHtml;
	}

	@action
	download() {
		const blob = new Blob([this.documentHtml], {
			type: 'text/html;charset=utf-8',
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
	async copySource() {
		await navigator.clipboard.writeText(this.documentHtml);
	}

	// Splits an existing document back into the head / body / tail panes so a
	// downloaded file can be reopened and kept editing.
	async openFile(event) {
		const file = event.target.files?.[0];
		if (!file) return;
		const text = await file.text();
		event.target.value = '';

		const doc = new DOMParser().parseFromString(text, 'text/html');
		const serialize = (nodes) =>
			nodes
				.map((n) => n.outerHTML ?? n.textContent)
				.join('\n')
				.trim();

		this.doctype =
			text.match(/^\s*<!doctype[^>]*>/i)?.[0].trim() ?? '<!doctype html>';
		this.lang = doc.documentElement.getAttribute('lang') || 'en';

		const head = [...doc.head.children];
		this.metadata = serialize(
			head.filter((n) => !['STYLE', 'SCRIPT', 'LINK'].includes(n.tagName)),
		);
		this.styles = head
			.filter((n) => n.tagName === 'STYLE' && n.id !== 'theme-tokens')
			.map((n) => n.textContent.trim())
			.join('\n\n');
		this.headScripts = serialize(
			head.filter(
				(n) =>
					['LINK', 'SCRIPT'].includes(n.tagName) &&
					!n.hasAttribute('data-theme-font'),
			),
		);

		const body = [...doc.body.children];
		this.navbar = serialize(body.filter((n) => n.tagName === 'NAV'));
		this.footer = serialize(body.filter((n) => n.tagName === 'FOOTER'));
		this.tailScripts = serialize(body.filter((n) => n.tagName === 'SCRIPT'));

		const rest = body.filter(
			(n) => !['NAV', 'FOOTER', 'SCRIPT'].includes(n.tagName),
		);
		this._nextSectionId = 1;
		this.sections = rest.map((node) => {
			const id = this._nextSectionId++;
			return {
				id,
				label: node.id || node.tagName.toLowerCase(),
				html: node.outerHTML,
			};
		});
		if (!this.sections.length) this.addSection();

		this.persist();
	}

	@action
	clearAll() {
		if (!window.confirm('Reset every pane and clear the cached copy?')) return;
		Object.assign(this, {
			doctype: STARTER.doctype,
			lang: STARTER.lang,
			metadata: STARTER.metadata,
			styles: STARTER.styles,
			headScripts: STARTER.headScripts,
			navbar: STARTER.navbar,
			footer: STARTER.footer,
			tailScripts: STARTER.tailScripts,
		});
		this.sections = STARTER.sections;
		this.theme = { ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors } };
		this._nextSectionId = 2;
		this.savedAt = null;
		try {
			window.localStorage.removeItem(CACHE_KEY);
		} catch {
			// ignore
		}
	}
}