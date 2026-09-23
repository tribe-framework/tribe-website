import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function password() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function base64Key(bytes) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf));
}

// derived(projectName, loomProjectName) → value
const DERIVED = {
  DB_NAME:   (p) => p ? `${p}_db`    : '',
  DB_USER:   (p) => p ? `${p}_user`  : '',
  DB_HOST:   (p, l) => l ? `${l}_mysql` : (p ? `${p}_mysql` : ''),
  TIKA_HOST: (p, l) => l ? `${l}_tika`  : (p ? `${p}_tika`  : ''),
};

// key → offset added to the user-supplied base port
const PORT_OFFSETS = {
  TRIBE_PORT:       0,
  PHPMYADMIN_PORT:  1,
  JUNCTION_PORT:    2,
  DIST_PORT:        3,
  DIST_PHP_PORT:    4,
  PLAUSIBLE_PORT:   5,
  TYPESENSE_PORT:   6,
  CRONICLE_PORT:    7,
  CENTRIFUGO_PORT:  8,
};

const PORT_FIELDS = [
  { key: 'TRIBE_PORT',      label: 'Tribe Port',      hide: true, comment: 'Ports' },
  { key: 'PHPMYADMIN_PORT', label: 'phpMyAdmin Port', hide: true },
  { key: 'JUNCTION_PORT',   label: 'Junction Port',   hide: true },
  { key: 'DIST_PORT',       label: 'Dist Port',       hide: true },
  { key: 'DIST_PHP_PORT',   label: 'Dist PHP Port',   hide: true },
  { key: 'PLAUSIBLE_PORT',  label: 'Plausible Port',  hide: true },
  { key: 'TYPESENSE_PORT',  label: 'Typesense Port',  hide: true },
  { key: 'CRONICLE_PORT',   label: 'Cronicle Port',   hide: true },
  { key: 'CENTRIFUGO_PORT', label: 'Centrifugo Port', hide: true },
];

const APPLICATION_FIELDS = (url, email) => [
  { key: 'BARE_URL',                          label: 'Bare URL',                   placeholder: url, comment: 'Application' },
  { key: 'ALLOW_ALL_CONNECTIONS_DANGEROUSLY', label: 'Allow All Connections',      hide: true, placeholder: 'false' },
  { key: 'DISPLAY_ERRORS',                    label: 'Display Errors',             hide: true, placeholder: 'false' },
  { key: 'DEFAULT_TIMEZONE',                  label: 'Default Timezone',           hide: true, placeholder: 'Asia/Kolkata' },
  { key: 'CONTACT_EMAIL',                     label: 'Contact Email',              placeholder: email },
  { key: 'CACHE_WEBAPP_TOTAL_OBJECTS',        label: 'Cache Webapp Total Objects', hide: true, placeholder: 'false' },
];

const DATABASE_FIELDS = (rootGenerate) => [
  { key: 'DB_ROOT_PASSWORD', label: 'DB Root Password', comment: 'Database', ...(rootGenerate ? { generate: password } : {}) },
  { key: 'DB_NAME',          label: 'DB Name',          hide: true },
  { key: 'DB_USER',          label: 'DB User',          hide: true },
  { key: 'DB_PASS',          label: 'DB Password',      generate: password },
  { key: 'DB_PORT',          label: 'DB Port',          hide: true, placeholder: '3306' },
  { key: 'DB_HOST',          label: 'DB Host',          hide: true },
];

const DIST_FIELDS = [
  { key: 'DIST_URL',     label: 'Dist URL',     placeholder: 'https://domain.tld', comment: 'Dist' },
  { key: 'DIST_PHP_URL', label: 'Dist PHP URL', placeholder: 'https://alt.domain.tld' },
];

const JUNCTION_FIELDS = (apiUrl) => [
  { key: 'JUNCTION_SLUG',             label: 'Junction Slug',             hide: true, placeholder: 'junction', comment: 'Junction' },
  { key: 'JUNCTION_PASSWORD',         label: 'Junction Password',         generate: password },
  { key: 'JUNCTION_URL',              label: 'Junction URL',              placeholder: 'https://junction.domain.tld' },
  { key: 'PLAUSIBLE_EMBED_URL',       label: 'Plausible Embed URL',       hide: true, placeholder: '' },
  { key: 'TRIBE_API_URL',             label: 'Tribe API URL',             placeholder: apiUrl },
  { key: 'TRIBE_API_KEY',             label: 'Tribe API Key',             hide: true, placeholder: '' },
  { key: 'HIDE_TRIBE_ATTRIBUTION', label: 'Hide Tribe Attribution', hide: true, placeholder: 'false' },
];

const PLAUSIBLE_FIELDS = [
  { key: 'PLAUSIBLE_BASE_URL',             label: 'Plausible Base URL',             hide: true, placeholder: 'https://analytics.domain.tld', comment: 'Plausible Analytics (optional)' },
  { key: 'PLAUSIBLE_SECRET_KEY_BASE',      label: 'Plausible Secret Key Base',      hide: true, generate: () => base64Key(64) },
  { key: 'PLAUSIBLE_TOTP_VAULT_KEY',       label: 'Plausible TOTP Vault Key',       hide: true, generate: () => base64Key(32) },
  { key: 'PLAUSIBLE_DB_PASSWORD',          label: 'Plausible DB Password',          hide: true, generate: password },
  { key: 'PLAUSIBLE_DISABLE_REGISTRATION', label: 'Plausible Disable Registration', hide: true, placeholder: 'invite_only' },
];

const TIKA_FIELDS = (comment) => [
  { key: 'TRANSCRIBE_FILE_RECORDS', label: 'Transcribe File Records', hide: true, placeholder: 'false', ...(comment ? { comment } : {}) },
  { key: 'TIKA_HOST',               label: 'Tika Host',               hide: true },
  { key: 'TIKA_PORT',               label: 'Tika Port',               hide: true, placeholder: '9998' },
];

const TAIL_FIELDS = [
  { key: 'CRONICLE_SECRET_KEY',                     label: 'Cronicle Secret Key',       hide: true, generate: uuid, comment: 'Cronicle' },
  { key: 'CRONICLE_LOG_KEEP_DAYS',                  label: 'Cronicle Log Keep Days',    hide: true, placeholder: '30' },
  { key: 'CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY', label: 'Centrifugo HMAC Secret',    hide: true, generate: uuid, comment: 'Centrifugo' },
  { key: 'CENTRIFUGO_HTTP_API_KEY',                 label: 'Centrifugo HTTP API Key',   hide: true, generate: uuid },
  { key: 'CENTRIFUGO_ADMIN_PASSWORD',               label: 'Centrifugo Admin Password', generate: password },
  { key: 'CENTRIFUGO_ADMIN_SECRET',                 label: 'Centrifugo Admin Secret',   hide: true, generate: uuid },
];

const SCHEMAS = {
  tribe: [
    { key: 'PROJECT_NAME', label: 'Project Name', placeholder: 'tribe', comment: 'Project Identity' },
    ...APPLICATION_FIELDS('tribe.example.com', 'tribe@example.com'),
    ...DATABASE_FIELDS(true),
    ...PORT_FIELDS,
    ...DIST_FIELDS,
    ...JUNCTION_FIELDS('https://tribe.example.com'),
    ...PLAUSIBLE_FIELDS,
    { key: 'TYPESENSE_SHOW_PUBLIC_OBJECTS_ONLY', label: 'Typesense Public Only', hide: true, placeholder: 'true', comment: 'Typesense and Search' },
    { key: 'TYPESENSE_API_KEY',                  label: 'Typesense API Key',     hide: true, placeholder: 'xyz' },
    ...TIKA_FIELDS(null),
    ...TAIL_FIELDS,
  ],
  thread: [
    { key: 'PROJECT_NAME',      label: 'Project Name',      placeholder: 'acme',  comment: 'Project Identity' },
    { key: 'LOOM_PROJECT_NAME', label: 'Loom Project Name', placeholder: 'tribe' },
    ...APPLICATION_FIELDS('acme.example.com', 'acme@example.com'),
    ...DATABASE_FIELDS(false),
    ...PORT_FIELDS,
    ...DIST_FIELDS,
    ...JUNCTION_FIELDS('https://acme.example.com'),
    ...PLAUSIBLE_FIELDS,
    ...TIKA_FIELDS('Transcribe for Search'),
    ...TAIL_FIELDS,
  ],
  junction: [
    { key: 'TRIBE_API_URL',             label: 'Tribe API URL',             placeholder: 'https://tribe.example.com' },
    { key: 'TRIBE_API_KEY',             label: 'Tribe API Key',             placeholder: '' },
    { key: 'JUNCTION_SLUG',             label: 'Junction Slug',             hide: true, placeholder: 'junction' },
    { key: 'JUNCTION_PASSWORD',         label: 'Junction Password',         generate: password },
    { key: 'JUNCTION_URL',              label: 'Junction URL',              placeholder: 'https://junction.domain.tld' },
    { key: 'PLAUSIBLE_EMBED_URL',       label: 'Plausible Embed URL',       hide: true, placeholder: '' },
    { key: 'HIDE_TRIBE_ATTRIBUTION', label: 'Hide Tribe Attribution', hide: true, placeholder: 'false' },
  ],
  'ember-tribe': [
    { key: 'TRIBE_API_URL', label: 'Tribe API URL', placeholder: 'https://tribe.example.com' },
    { key: 'TRIBE_API_KEY', label: 'Tribe API Key', placeholder: '' },
  ],
};

function seedValues(schema) {
  const seeded = {};
  for (const field of schema) {
    if (field.generate) seeded[field.key] = field.generate();
  }
  return seeded;
}

export default class EnvController extends Controller {
  @tracked activeTarget = 'tribe';
  @tracked portBase = '12000';
  @tracked values = seedValues(SCHEMAS['tribe']);
  @tracked generated = null;

  get schema() {
    return SCHEMAS[this.activeTarget];
  }

  get visibleFields() {
    return this.schema.filter((f) => !f.hide);
  }

  get hasPorts() {
    return this.schema.some((f) => f.key in PORT_OFFSETS);
  }

  get targets() {
    return ['tribe', 'thread', 'junction', 'ember-tribe'];
  }

  get portBaseHint() {
    return this.activeTarget === 'thread'
      ? 'Threads use blocks of 10 from 13000 — 13000, 13010, 13020 …'
      : '12000 → 12000, 12001 … 12009 (shared services stack)';
  }

  @action
  selectTarget(target) {
    this.activeTarget = target;
    this.values = seedValues(SCHEMAS[target]);
    this.portBase = target === 'thread' ? '13000' : '12000';
    this.generated = null;
  }

  @action
  updateValue(key, event) {
    this.values = { ...this.values, [key]: event.target.value };
  }

  @action
  updatePortBase(event) {
    this.portBase = event.target.value.trim();
  }

  @action
  generate() {
    const projectName = (this.values['PROJECT_NAME'] ?? 'tribe').trim();
    const loomProjectName = (this.values['LOOM_PROJECT_NAME'] ?? '').trim();
    const lines = [];
    let lastComment = null;

    for (const field of this.schema) {
      if (field.comment && field.comment !== lastComment) {
        if (lines.length) lines.push('');
        lines.push(`# ─── ${field.comment} ${'─'.repeat(Math.max(0, 50 - field.comment.length))}─`);
        lastComment = field.comment;
      }

      let val;
      if (DERIVED[field.key]) {
        val = DERIVED[field.key](projectName, loomProjectName);
      } else if (field.key in PORT_OFFSETS) {
        const base = parseInt(this.portBase, 10);
        val = Number.isNaN(base) ? '' : base + PORT_OFFSETS[field.key];
      } else {
        val = this.values[field.key] ?? field.placeholder ?? '';
      }

      lines.push(`${field.key}=${val}`);
    }

    this.generated = lines.join('\n');
  }

  @action
  copyOutput() {
    navigator.clipboard.writeText(this.generated);
  }
}