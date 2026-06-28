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

// derived(projectName) → value, or null to fall through to user input
const DERIVED = {
  DB_NAME:   (p) => p ? `${p}_db`    : '',
  DB_USER:   (p) => p ? `${p}_user`  : '',
  DB_HOST:   (p) => p ? `${p}_mysql` : '',
  TIKA_HOST: (p) => p ? `${p}_tika`  : '',
};

const SCHEMAS = {
  tribe: [
    { key: 'PROJECT_NAME',                           label: 'Project Name',              placeholder: 'my_project',                comment: 'Project Identity' },
    { key: 'BARE_URL',                               label: 'Bare URL',                  placeholder: 'example.com',               comment: 'Application' },
    { key: 'ALLOW_ALL_CONNECTIONS_DANGEROUSLY',      label: 'Allow All Connections',     placeholder: 'false' },
    { key: 'DISPLAY_ERRORS',                         label: 'Display Errors',            placeholder: 'false' },
    { key: 'DEFAULT_TIMEZONE',                       label: 'Default Timezone',          placeholder: 'Asia/Kolkata' },
    { key: 'CONTACT_EMAIL',                          label: 'Contact Email',             placeholder: 'admin@example.com' },
    { key: 'CACHE_WEBAPP_TOTAL_OBJECTS',             label: 'Cache Webapp Total Objects',placeholder: 'false' },
    { key: 'DB_ROOT_PASSWORD',                       label: 'DB Root Password',          generate: password,                       comment: 'Database' },
    { key: 'DB_NAME',                                label: 'DB Name',                   hide: true },
    { key: 'DB_USER',                                label: 'DB User',                   hide: true },
    { key: 'DB_PASS',                                label: 'DB Password',               generate: password },
    { key: 'DB_PORT',                                label: 'DB Port',                   placeholder: '3306' },
    { key: 'DB_HOST',                                label: 'DB Host',                   hide: true },
    { key: 'TRIBE_PORT',                             label: 'Tribe Port',                placeholder: '12000',                     comment: 'Ports' },
    { key: 'PHPMYADMIN_PORT',                        label: 'phpMyAdmin Port',           placeholder: '12001' },
    { key: 'JUNCTION_PORT',                          label: 'Junction Port',             placeholder: '12002' },
    { key: 'DIST_PORT',                              label: 'Dist Port',                 placeholder: '12003' },
    { key: 'DIST_PHP_PORT',                          label: 'Dist PHP Port',             placeholder: '12004' },
    { key: 'FILEBROWSER_PORT',                       label: 'FileBrowser Port',          placeholder: '12005' },
    { key: 'TYPESENSE_PORT',                         label: 'Typesense Port',            placeholder: '12006' },
    { key: 'CRONICLE_PORT',                          label: 'Cronicle Port',             placeholder: '12007' },
    { key: 'CENTRIFUGO_PORT',                        label: 'Centrifugo Port',           placeholder: '12008' },
    { key: 'JUNCTION_SLUG',                          label: 'Junction Slug',             placeholder: 'junction',                  comment: 'Junction' },
    { key: 'JUNCTION_PASSWORD',                      label: 'Junction Password',         generate: password },
    { key: 'TRIBE_API_URL',                          label: 'Tribe API URL',             placeholder: 'http://example.com:12000' },
    { key: 'TRIBE_API_KEY',                          label: 'Tribe API Key',             placeholder: '' },
    { key: 'PLAUSIBLE_AUTH',                         label: 'Plausible Auth',            placeholder: '',                          comment: 'Plausible Analytics (optional)' },
    { key: 'PLAUSIBLE_DOMAIN',                       label: 'Plausible Domain',          placeholder: '' },
    { key: 'FILEBROWSER_PASSWORD',                   label: 'FileBrowser Password',      generate: password,                       comment: 'FileBrowser' },
    { key: 'TYPESENSE_SHOW_PUBLIC_OBJECTS_ONLY',     label: 'Typesense Public Only',     placeholder: 'true',                      comment: 'Typesense and Search' },
    { key: 'TYPESENSE_API_KEY',                      label: 'Typesense API Key',         placeholder: 'xyz' },
    { key: 'TRANSCRIBE_FILE_RECORDS',                label: 'Transcribe File Records',   placeholder: 'false' },
    { key: 'TIKA_HOST',                              label: 'Tika Host',                 hide: true },
    { key: 'TIKA_PORT',                              label: 'Tika Port',                 placeholder: '9998' },
    { key: 'HIDE_POSTCODE_ATTRIBUTION',              label: 'Hide Postcode Attribution', placeholder: 'false',                     comment: 'Hide Postcode Attribution' },
    { key: 'CRONICLE_SECRET_KEY',                    label: 'Cronicle Secret Key',       generate: uuid,                           comment: 'Cronicle' },
    { key: 'CRONICLE_LOG_KEEP_DAYS',                 label: 'Cronicle Log Keep Days',    placeholder: '30' },
    { key: 'CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY',label: 'Centrifugo HMAC Secret',    generate: uuid,                           comment: 'Centrifugo' },
    { key: 'CENTRIFUGO_HTTP_API_KEY',                label: 'Centrifugo HTTP API Key',   generate: uuid },
    { key: 'CENTRIFUGO_ADMIN_PASSWORD',              label: 'Centrifugo Admin Password', generate: password },
    { key: 'CENTRIFUGO_ADMIN_SECRET',                label: 'Centrifugo Admin Secret',   generate: uuid },
  ],
  junction: [
    { key: 'TRIBE_API_URL',              label: 'Tribe API URL',             placeholder: 'http://example.com:12000' },
    { key: 'TRIBE_API_KEY',              label: 'Tribe API Key',             placeholder: '' },
    { key: 'JUNCTION_SLUG',              label: 'Junction Slug',             placeholder: 'junction' },
    { key: 'JUNCTION_PASSWORD',          label: 'Junction Password',         generate: password },
    { key: 'PLAUSIBLE_AUTH',             label: 'Plausible Auth',            placeholder: '' },
    { key: 'PLAUSIBLE_DOMAIN',           label: 'Plausible Domain',          placeholder: '' },
    { key: 'HIDE_POSTCODE_ATTRIBUTION',  label: 'Hide Postcode Attribution', placeholder: 'false' },
  ],
  'ember-tribe': [
    { key: 'TRIBE_API_URL', label: 'Tribe API URL', placeholder: 'http://example.com:12000' },
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
  @tracked values = seedValues(SCHEMAS['tribe']);
  @tracked generated = null;

  get schema() {
    return SCHEMAS[this.activeTarget];
  }

  get visibleFields() {
    return this.schema.filter((f) => !f.hide);
  }

  get targets() {
    return ['tribe', 'junction', 'ember-tribe'];
  }

  @action
  selectTarget(target) {
    this.activeTarget = target;
    this.values = seedValues(SCHEMAS[target]);
    this.generated = null;
  }

  @action
  updateValue(key, event) {
    this.values = { ...this.values, [key]: event.target.value };
  }

  @action
  generate() {
    const projectName = (this.values['PROJECT_NAME'] ?? '').trim();
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
        val = DERIVED[field.key](projectName);
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