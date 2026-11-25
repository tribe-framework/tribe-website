<?php

const TRIBE_DIR            = __DIR__;
const JUNCTION_DIST        = '/var/www/junction/dist';
const VERSIONS_DIR         = '/var/www/versions';
const JUNCTION_ZIP_URL     = 'https://github.com/tribe-framework/junction/raw/refs/heads/master/dist.zip';
const JUNCTION_HISTORY_URL = 'https://github.com/tribe-framework/junction/commits/master/dist.zip';
const JUNCTION_ASSET       = 'dist.zip';
const PHP_CLI              = '/usr/local/bin/php';
const COMPOSER_BIN         = '/usr/bin/composer';

const JUNCTION_KEEP_ON_UPGRADE = ['uploads', '.env', 'vendor', 'composer.lock', 'assets/css/custom.css', 'assets/js/custom.js'];
const JUNCTION_KEEP_ON_RESTORE = ['uploads', '.env', 'assets/css/custom.css', 'assets/js/custom.js'];
const JUNCTION_BACKUP_SKIP     = ['uploads'];

final class UpgradeError extends RuntimeException
{
    public string $log = '';

    public function __construct(string $message, string $log = '')
    {
        parent::__construct($message);
        $this->log = $log;
    }
}

function load_env_file(string $path): void
{
    if (! is_file($path)) {
        return;
    }

    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || ! str_contains($line, '=')) {
            continue;
        }

        [$key, $value] = explode('=', $line, 2);
        $key           = trim($key);
        $value         = trim(trim($value), "\"'");
        if ($key === '') {
            continue;
        }

        $_ENV[$key] = $value;
        putenv("$key=$value");
    }
}

function env_value(string $key): string
{
    $value = $_ENV[$key] ?? getenv($key);
    return ($value === false || $value === null) ? '' : (string) $value;
}

function normalized_origin(?string $url): ?string
{
    if (! $url) {
        return null;
    }

    $parts = parse_url(trim($url));
    if (empty($parts['scheme']) || empty($parts['host'])) {
        return null;
    }

    $scheme = strtolower($parts['scheme']);
    $host   = strtolower($parts['host']);
    $port   = $parts['port'] ?? null;

    if (($scheme === 'https' && $port === 443) || ($scheme === 'http' && $port === 80)) {
        $port = null;
    }

    return $scheme . '://' . $host . ($port ? ':' . $port : '');
}

function trusted_origins(): array
{
    $origins  = [];
    $junction = normalized_origin(env_value('JUNCTION_URL'));
    if ($junction) {
        $origins[] = $junction;
    }

    $port = env_value('JUNCTION_PORT');
    if ($port !== '' && ctype_digit($port)) {
        $origins[] = 'http://localhost:' . $port;
        $origins[] = 'http://127.0.0.1:' . $port;
    }

    return array_values(array_unique($origins));
}

function origin_is_trusted(?string $origin): bool
{
    $normalized = normalized_origin($origin);
    return $normalized !== null && in_array($normalized, trusted_origins(), true);
}

function request_origin_is_trusted(): bool
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '') {
        return origin_is_trusted($origin);
    }

    return ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'same-origin';
}

function apply_cors(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '' && origin_is_trusted($origin)) {
        header('Access-Control-Allow-Origin: ' . normalized_origin($origin));
        header('Access-Control-Allow-Credentials: true');
    }

    header('Access-Control-Allow-Headers: Content-Type, Accept');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Vary: Origin', false);
}

function respond(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR);
    exit;
}

function run_command(array $command, string $cwd): array
{
    $env = [
        'PATH'                     => '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        'HOME'                     => VERSIONS_DIR,
        'COMPOSER_HOME'            => VERSIONS_DIR . '/.composer',
        'COMPOSER_NO_INTERACTION'  => '1',
        'COMPOSER_MEMORY_LIMIT'    => '-1',
        'COMPOSER_ALLOW_SUPERUSER' => '1',
    ];

    $process = proc_open($command, [1 => ['pipe', 'w'], 2 => ['redirect', 1]], $pipes, $cwd, $env);
    if (! is_resource($process)) {
        return [1, 'Could not start: ' . implode(' ', $command)];
    }

    $output = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    $code = proc_close($process);

    return [$code, (string) $output];
}

function vendor_is_healthy(): bool
{
    if (! is_file(TRIBE_DIR . '/vendor/autoload.php')) {
        return false;
    }

    $probe  = 'require "vendor/autoload.php"; exit(class_exists("Tribe\\\\Auth") && class_exists("Tribe\\\\API") && class_exists("Dotenv\\\\Dotenv") ? 0 : 3);';
    [$code] = run_command([PHP_CLI, '-r', $probe], TRIBE_DIR);
    return $code === 0;
}

function fallback_session_is_valid(): bool
{
    $password = env_value('JUNCTION_PASSWORD');
    if (empty($_COOKIE['tribe_session']) || $password === '') {
        return false;
    }

    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start([
            'name'             => 'tribe_session',
            'use_strict_mode'  => 1,
            'use_only_cookies' => 1,
            'use_trans_sid'    => 0,
            'gc_maxlifetime'   => 43200,
            'read_and_close'   => true,
        ]);
    }

    $data = $_SESSION ?? [];
    $now  = time();

    return ! empty($data['apikey'])
    && hash_equals((string) ($data['fingerprint'] ?? ''), hash_hmac('sha256', 'tribe-session', $password))
    && ($now - (int) ($data['created'] ?? 0)) < 604800
    && ($now - (int) ($data['last_seen'] ?? 0)) < 43200;
}

function is_authorized(): bool
{
    if (! request_origin_is_trusted()) {
        return false;
    }

    if (vendor_is_healthy()) {
        try {
            require_once TRIBE_DIR . '/vendor/autoload.php';
            return \Tribe\Auth::isLoggedIn();
        } catch (\Throwable $e) {
            return fallback_session_is_valid();
        }
    }

    return fallback_session_is_valid();
}

function protected_roots(): array
{
    $roots = [];
    foreach ([TRIBE_DIR . '/uploads', JUNCTION_DIST . '/uploads'] as $path) {
        $real = realpath($path);
        if ($real !== false) {
            $roots[] = $real;
        }
        $roots[] = $path;
    }
    return array_unique($roots);
}

function is_protected(string $path): bool
{
    $candidates = [$path];
    $real       = realpath($path);
    if ($real !== false) {
        $candidates[] = $real;
    }

    foreach ($candidates as $candidate) {
        foreach (protected_roots() as $root) {
            if ($candidate === $root || str_starts_with($candidate, $root . '/')) {
                return true;
            }
        }
    }

    return false;
}

function assert_not_protected(string $path): void
{
    if (is_protected($path)) {
        throw new UpgradeError('Refused to modify a protected path: ' . $path);
    }
}

function delete_tree(string $path): void
{
    if (! file_exists($path) && ! is_link($path)) {
        return;
    }

    assert_not_protected($path);

    if (is_link($path) || ! is_dir($path)) {
        if (! unlink($path)) {
            throw new UpgradeError('Could not delete ' . $path);
        }
        return;
    }

    foreach (scandir($path) as $entry) {
        if ($entry === '.' || $entry === '..') {
            continue;
        }
        delete_tree($path . '/' . $entry);
    }

    if (! rmdir($path)) {
        throw new UpgradeError('Could not delete ' . $path);
    }
}

function copy_entry(string $source, string $target): void
{
    assert_not_protected($target);

    if (is_link($source)) {
        if (! symlink(readlink($source), $target)) {
            throw new UpgradeError('Could not link ' . $target);
        }
        return;
    }

    $temporary = $target . '.upgrade-' . bin2hex(random_bytes(4));
    if (! copy($source, $temporary)) {
        @unlink($temporary);
        throw new UpgradeError('Could not copy ' . $source . ' to ' . $target);
    }

    @chmod($temporary, fileperms($source) & 0777);

    if (! rename($temporary, $target)) {
        @unlink($temporary);
        throw new UpgradeError('Could not write ' . $target);
    }
}

function make_dir(string $path): void
{
    assert_not_protected($path);
    if (! is_dir($path) && ! mkdir($path, 0775, true) && ! is_dir($path)) {
        throw new UpgradeError('Could not create ' . $path);
    }
}

function copy_tree(string $source, string $target, array $skip = [], string $relative = ''): void
{
    make_dir($target);

    foreach (scandir($source) as $entry) {
        if ($entry === '.' || $entry === '..') {
            continue;
        }

        $rel = ltrim($relative . '/' . $entry, '/');
        if (in_array($rel, $skip, true)) {
            continue;
        }

        $from = $source . '/' . $entry;
        $to   = $target . '/' . $entry;

        if (is_dir($from) && ! is_link($from)) {
            copy_tree($from, $to, $skip, $rel);
        } else {
            copy_entry($from, $to);
        }
    }
}

function sync_tree(string $source, string $target, array $keep, string $relative = ''): void
{
    make_dir($target);

    foreach (scandir($source) as $entry) {
        if ($entry === '.' || $entry === '..') {
            continue;
        }

        $rel  = ltrim($relative . '/' . $entry, '/');
        $from = $source . '/' . $entry;
        $to   = $target . '/' . $entry;

        if (is_protected($to)) {
            continue;
        }

        if (in_array($rel, $keep, true) && (file_exists($to) || is_link($to))) {
            continue;
        }

        if (is_dir($from) && ! is_link($from)) {
            if ((file_exists($to) || is_link($to)) && (! is_dir($to) || is_link($to))) {
                delete_tree($to);
            }
            sync_tree($from, $to, $keep, $rel);
        } else {
            if (is_dir($to) && ! is_link($to)) {
                delete_tree($to);
            } elseif (is_link($to)) {
                delete_tree($to);
            }
            copy_entry($from, $to);
        }
    }

    foreach (scandir($target) as $entry) {
        if ($entry === '.' || $entry === '..') {
            continue;
        }

        $rel = ltrim($relative . '/' . $entry, '/');
        if (in_array($rel, $keep, true) || is_protected($target . '/' . $entry)) {
            continue;
        }

        if (! file_exists($source . '/' . $entry) && ! is_link($source . '/' . $entry)) {
            delete_tree($target . '/' . $entry);
        }
    }
}

function read_json(string $path): ?array
{
    if (! is_file($path)) {
        return null;
    }
    $data = json_decode((string) file_get_contents($path), true);
    return is_array($data) ? $data : null;
}

function write_json(string $path, array $data): void
{
    $temporary = $path . '.tmp-' . bin2hex(random_bytes(4));
    if (file_put_contents($temporary, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)) === false || ! rename($temporary, $path)) {
        @unlink($temporary);
        throw new UpgradeError('Could not write ' . $path);
    }
}

function kind_dir(string $kind): string
{
    return VERSIONS_DIR . '/' . $kind;
}

function previous_dir(string $kind): string
{
    return kind_dir($kind) . '/previous';
}

function previous_meta(string $kind): ?array
{
    return read_json(previous_dir($kind) . '/meta.json');
}

function clear_pending(string $kind): void
{
    if (! is_dir(kind_dir($kind))) {
        return;
    }
    foreach (scandir(kind_dir($kind)) as $entry) {
        if (str_starts_with($entry, '.pending-')) {
            delete_tree(kind_dir($kind) . '/' . $entry);
        }
    }
}

function new_pending_dir(string $kind): string
{
    make_dir(kind_dir($kind));
    $dir = kind_dir($kind) . '/.pending-' . bin2hex(random_bytes(4));
    make_dir($dir);
    return $dir;
}

function promote_pending(string $kind, string $pending): void
{
    delete_tree(previous_dir($kind));
    if (! rename($pending, previous_dir($kind))) {
        throw new UpgradeError('Could not keep the previous version for revert.');
    }
}

function reset_opcache(): void
{
    if (function_exists('opcache_reset')) {
        @opcache_reset();
    }
}

function tribe_packages(): array
{
    $composer = read_json(TRIBE_DIR . '/composer.json') ?? [];
    $lock     = read_json(TRIBE_DIR . '/composer.lock') ?? [];

    $locked = [];
    foreach (($lock['packages'] ?? []) as $package) {
        $locked[$package['name']] = $package['version'] ?? '';
    }

    $packages = [];
    foreach (array_keys($composer['require'] ?? []) as $name) {
        if ($name === 'php' || str_starts_with($name, 'ext-')) {
            continue;
        }
        $packages[] = ['name' => $name, 'version' => $locked[$name] ?? null];
    }

    return $packages;
}

function junction_installed(): ?array
{
    return read_json(kind_dir('junction') . '/installed.json');
}

function http_get(string $url, string $accept, ?string $saveTo = null): string
{
    $context = stream_context_create(['http' => [
        'method'          => 'GET',
        'header'          => "User-Agent: tribe-version-upgrades\r\nAccept: $accept\r\nCache-Control: no-cache\r\n",
        'timeout'         => 120,
        'follow_location' => 1,
        'max_redirects'   => 5,
        'ignore_errors'   => true,
    ]]);

    $stream = @fopen($url, 'rb', false, $context);
    if ($stream === false) {
        throw new UpgradeError('Could not reach ' . $url);
    }

    $status = 0;
    foreach (stream_get_meta_data($stream)['wrapper_data'] ?? [] as $header) {
        if (preg_match('#^HTTP/\S+\s+(\d{3})#', $header, $match)) {
            $status = (int) $match[1];
        }
    }

    if ($status < 200 || $status >= 300) {
        fclose($stream);
        throw new UpgradeError('GitHub responded with ' . $status . ' for ' . $url);
    }

    if ($saveTo === null) {
        $body = stream_get_contents($stream);
        fclose($stream);
        return (string) $body;
    }

    $file = fopen($saveTo, 'wb');
    if ($file === false || stream_copy_to_stream($stream, $file) === false) {
        fclose($stream);
        throw new UpgradeError('Could not download ' . $url);
    }
    fclose($stream);
    fclose($file);
    return $saveTo;
}

function download_junction(string $saveTo): array
{
    http_get(JUNCTION_ZIP_URL, 'application/zip', $saveTo);

    return [
        'tag'      => substr(hash_file('sha256', $saveTo), 0, 12),
        'html_url' => JUNCTION_HISTORY_URL,
    ];
}

function find_dist_root(string $base): ?string
{
    $queue = [$base];
    while ($queue) {
        $dir = array_shift($queue);
        if (is_file($dir . '/index.php') && is_dir($dir . '/assets')) {
            return $dir;
        }
        foreach (scandir($dir) as $entry) {
            if ($entry === '.' || $entry === '..' || $entry === '__MACOSX') {
                continue;
            }
            if (is_dir($dir . '/' . $entry) && ! is_link($dir . '/' . $entry)) {
                $queue[] = $dir . '/' . $entry;
            }
        }
    }
    return null;
}

function require_ready(): void
{
    if (! is_dir(VERSIONS_DIR) || ! is_writable(VERSIONS_DIR)) {
        throw new UpgradeError('The backups folder ' . VERSIONS_DIR . ' is missing or not writable. Update docker-compose.yml and restart the stack.');
    }
}

function require_junction_mounted(): void
{
    if (! is_dir(JUNCTION_DIST) || ! is_writable(JUNCTION_DIST) || ! is_file(JUNCTION_DIST . '/index.php')) {
        throw new UpgradeError('Junction dist is not mounted or not writable at ' . JUNCTION_DIST . '.');
    }
}

function backup_junction(string $dir): void
{
    try {
        copy_tree(JUNCTION_DIST, $dir . '/files', JUNCTION_BACKUP_SKIP);
        write_json($dir . '/meta.json', [
            'created_at' => time(),
            'version'    => junction_installed()['tag'] ?? null,
        ]);
    } catch (\Throwable $e) {
        delete_tree($dir);
        throw new UpgradeError('Backup failed, nothing was changed: ' . $e->getMessage());
    }
}

function restore_junction_files(string $backupDir): void
{
    sync_tree($backupDir . '/files', JUNCTION_DIST, JUNCTION_KEEP_ON_RESTORE);
}

function set_junction_installed(?string $tag): void
{
    make_dir(kind_dir('junction'));
    write_json(kind_dir('junction') . '/installed.json', ['tag' => $tag, 'installed_at' => time()]);
}

function upgrade_junction(): array
{
    require_junction_mounted();

    $installed = junction_installed()['tag'] ?? null;

    $work = VERSIONS_DIR . '/.work-' . bin2hex(random_bytes(4));
    make_dir($work);

    try {
        $zipPath = $work . '/' . JUNCTION_ASSET;
        $latest  = download_junction($zipPath);
        if ($installed === $latest['tag']) {
            throw new UpgradeError('Junction is already at ' . $latest['tag'] . '.');
        }

        $zip = new \ZipArchive();
        if ($zip->open($zipPath) !== true || ! $zip->extractTo($work . '/extracted')) {
            throw new UpgradeError('Could not unpack ' . JUNCTION_ASSET . '.');
        }
        $zip->close();

        $root = find_dist_root($work . '/extracted');
        if ($root === null) {
            throw new UpgradeError(JUNCTION_ASSET . ' does not contain a Junction dist with index.php and assets.');
        }

        $pending = new_pending_dir('junction');
        backup_junction($pending);

        $log = '';
        try {
            $composerChanged = @md5_file($root . '/composer.json') !== @md5_file(JUNCTION_DIST . '/composer.json');
            sync_tree($root, JUNCTION_DIST, JUNCTION_KEEP_ON_UPGRADE);

            if ($composerChanged && is_file(JUNCTION_DIST . '/composer.json')) {
                [$code, $log] = run_command([PHP_CLI, COMPOSER_BIN, 'update', '--no-interaction', '--optimize-autoloader'], JUNCTION_DIST);
                if ($code !== 0) {
                    throw new UpgradeError('composer update failed for Junction.', $log);
                }
            }

            set_junction_installed($latest['tag']);
        } catch (\Throwable $e) {
            restore_junction_files($pending);
            delete_tree($pending);
            $message = $e->getMessage() . ' Junction was restored to the previous version.';
            throw new UpgradeError($message, $e instanceof UpgradeError ? $e->log : '');
        }

        promote_pending('junction', $pending);
    } finally {
        delete_tree($work);
    }

    reset_opcache();

    return [
        'message'         => 'Junction updated from ' . ($installed ?? 'unknown') . ' to ' . $latest['tag'] . '.',
        'log'             => $log,
        'reload_junction' => true,
    ];
}

function revert_junction(): array
{
    require_junction_mounted();

    $previous = previous_dir('junction');
    $meta     = previous_meta('junction');
    if ($meta === null) {
        throw new UpgradeError('There is no previous Junction version to revert to.');
    }

    $pending = new_pending_dir('junction');
    backup_junction($pending);

    try {
        restore_junction_files($previous);
        set_junction_installed($meta['version'] ?? null);
    } catch (\Throwable $e) {
        restore_junction_files($pending);
        delete_tree($pending);
        throw new UpgradeError('Revert failed: ' . $e->getMessage() . ' Junction was left as it was.');
    }

    delete_tree($pending);
    delete_tree($previous);
    reset_opcache();

    return [
        'message'         => 'Junction reverted to ' . ($meta['version'] ?? 'the version from ' . gmdate('Y-m-d H:i', $meta['created_at']) . ' UTC') . '.',
        'reload_junction' => true,
    ];
}

function backup_tribe(string $dir): void
{
    try {
        if (is_dir(TRIBE_DIR . '/vendor')) {
            copy_tree(TRIBE_DIR . '/vendor', $dir . '/vendor');
        }
        if (is_file(TRIBE_DIR . '/composer.lock')) {
            copy_entry(TRIBE_DIR . '/composer.lock', $dir . '/composer.lock');
        }
        write_json($dir . '/meta.json', [
            'created_at' => time(),
            'version'    => tribe_packages(),
            'has_vendor' => is_dir($dir . '/vendor'),
            'has_lock'   => is_file($dir . '/composer.lock'),
        ]);
    } catch (\Throwable $e) {
        delete_tree($dir);
        throw new UpgradeError('Backup failed, nothing was changed: ' . $e->getMessage());
    }
}

function restore_tribe_files(string $backupDir): void
{
    $meta  = read_json($backupDir . '/meta.json') ?? [];
    $token = bin2hex(random_bytes(4));

    if (! empty($meta['has_vendor'])) {
        $incoming = TRIBE_DIR . '/.vendor-incoming-' . $token;
        $outgoing = TRIBE_DIR . '/.vendor-outgoing-' . $token;

        copy_tree($backupDir . '/vendor', $incoming);

        if (is_dir(TRIBE_DIR . '/vendor') && ! rename(TRIBE_DIR . '/vendor', $outgoing)) {
            delete_tree($incoming);
            throw new UpgradeError('Could not move the current vendor folder aside.');
        }

        if (! rename($incoming, TRIBE_DIR . '/vendor')) {
            if (is_dir($outgoing)) {
                rename($outgoing, TRIBE_DIR . '/vendor');
            }
            throw new UpgradeError('Could not put the restored vendor folder in place.');
        }

        delete_tree($outgoing);
    }

    if (! empty($meta['has_lock'])) {
        copy_entry($backupDir . '/composer.lock', TRIBE_DIR . '/composer.lock');
    } elseif (is_file(TRIBE_DIR . '/composer.lock')) {
        unlink(TRIBE_DIR . '/composer.lock');
    }

    reset_opcache();
}

function upgrade_tribe(): array
{
    $before  = tribe_packages();
    $pending = new_pending_dir('tribe');
    backup_tribe($pending);

    [$code, $log] = run_command([PHP_CLI, COMPOSER_BIN, 'update', '--no-interaction', '--optimize-autoloader'], TRIBE_DIR);

    if ($code !== 0 || ! vendor_is_healthy()) {
        restore_tribe_files($pending);
        delete_tree($pending);
        throw new UpgradeError(
            ($code !== 0 ? 'composer update failed.' : 'The updated packages did not load.') . ' Tribe was restored to the previous packages.',
            $log
        );
    }

    $after   = tribe_packages();
    $changes = [];
    $old     = array_column($before, 'version', 'name');
    foreach ($after as $package) {
        if (($old[$package['name']] ?? null) !== $package['version']) {
            $changes[] = $package['name'] . ' ' . ($old[$package['name']] ?? 'none') . ' → ' . $package['version'];
        }
    }

    if ($changes) {
        promote_pending('tribe', $pending);
    } else {
        delete_tree($pending);
    }

    reset_opcache();

    return [
        'message' => $changes ? 'Updated: ' . implode(', ', $changes) . '.' : 'All Tribe packages were already up to date.',
        'log'     => $log,
    ];
}

function revert_tribe(): array
{
    $previous = previous_dir('tribe');
    $meta     = previous_meta('tribe');
    if ($meta === null) {
        throw new UpgradeError('There are no previous Tribe packages to revert to.');
    }

    $pending = new_pending_dir('tribe');
    backup_tribe($pending);

    try {
        restore_tribe_files($previous);
        if (! vendor_is_healthy()) {
            throw new UpgradeError('The restored packages did not load.');
        }
    } catch (\Throwable $e) {
        restore_tribe_files($pending);
        delete_tree($pending);
        throw new UpgradeError('Revert failed: ' . $e->getMessage() . ' Tribe was left as it was.');
    }

    delete_tree($pending);
    delete_tree($previous);

    return ['message' => 'Tribe packages reverted to the version from ' . gmdate('Y-m-d H:i', $meta['created_at']) . ' UTC.'];
}

function is_busy(): bool
{
    $handle = @fopen(VERSIONS_DIR . '/.lock', 'c');
    if ($handle === false) {
        return false;
    }
    $free = flock($handle, LOCK_EX | LOCK_NB);
    if ($free) {
        flock($handle, LOCK_UN);
    }
    fclose($handle);
    return ! $free;
}

function status(): array
{
    $latest      = null;
    $latestError = null;
    $probe       = tempnam(sys_get_temp_dir(), 'junction-');
    try {
        $latest = download_junction($probe);
    } catch (\Throwable $e) {
        $latestError = $e->getMessage();
    } finally {
        @unlink($probe);
    }

    $ready = is_dir(VERSIONS_DIR) && is_writable(VERSIONS_DIR);

    return [
        'status'   => 'success',
        'ready'    => $ready,
        'busy'     => $ready && is_busy(),
        'junction' => [
            'available'    => is_dir(JUNCTION_DIST) && is_writable(JUNCTION_DIST) && is_file(JUNCTION_DIST . '/index.php'),
            'installed'    => junction_installed()['tag'] ?? null,
            'latest'       => $latest,
            'latest_error' => $latestError,
            'previous'     => previous_meta('junction'),
        ],
        'tribe'    => [
            'available' => is_writable(TRIBE_DIR) && (! is_dir(TRIBE_DIR . '/vendor') || is_writable(TRIBE_DIR . '/vendor')),
            'healthy'   => vendor_is_healthy(),
            'packages'  => tribe_packages(),
            'previous'  => previous_meta('tribe'),
        ],
    ];
}

load_env_file(TRIBE_DIR . '/.env');
apply_cors();
header('Cache-Control: no-store');

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (! is_authorized()) {
    respond(['status' => 'error', 'error_message' => 'Sign in to Junction to manage versions.'], 403);
}

if ($method === 'GET') {
    respond(status());
}

if ($method !== 'POST') {
    respond(['status' => 'error', 'error_message' => 'Unsupported method.'], 405);
}

ignore_user_abort(true);
set_time_limit(0);

$body   = json_decode((string) file_get_contents('php://input'), true) ?: [];
$action = is_string($body['action'] ?? null) ? $body['action'] : '';

try {
    require_ready();

    $lock = fopen(VERSIONS_DIR . '/.lock', 'c');
    if ($lock === false || ! flock($lock, LOCK_EX | LOCK_NB)) {
        respond(['status' => 'error', 'error_message' => 'Another upgrade or revert is already running.'], 409);
    }

    clear_pending('junction');
    clear_pending('tribe');

    $result = match ($action) {
        'upgrade_junction' => upgrade_junction(),
        'revert_junction'  => revert_junction(),
        'upgrade_tribe'    => upgrade_tribe(),
        'revert_tribe'     => revert_tribe(),
        default            => throw new UpgradeError('Unknown action.'),
    };

    flock($lock, LOCK_UN);
    respond(['status' => 'success'] + $result + status());
} catch (UpgradeError $e) {
    respond(['status' => 'error', 'error_message' => $e->getMessage(), 'log' => $e->log], 422);
} catch (\Throwable $e) {
    respond(['status' => 'error', 'error_message' => $e->getMessage()], 500);
}
