<?php
    /**
 * Tribe Framework - Service Health Dashboard
 * Displays the status of all services defined in docker-compose.yml
 */

    function env(string $key, string $default = ''): string
    {
    return $_ENV[$key] ?? getenv($key) ?: $default;
    }

    // Load .env variables if available
    function loadEnv(string $path): void
    {
    if (! file_exists($path)) {
        return;
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (str_starts_with(trim($line), '#')) {
            continue;
        }

        if (! str_contains($line, '=')) {
            continue;
        }

        [$key, $value] = explode('=', $line, 2);
        $key           = trim($key);
        $value         = trim($value, " \t\n\r\0\x0B\"'");
        // Always overwrite: the .env file on disk is the source of truth for
        // this container. Never let a stale/previous value block a fresh load.
        $_ENV[$key] = $value;
        putenv("$key=$value");
    }
    }

    loadEnv(__DIR__ . '/.env');

    function rootProject(): string
    {
    $full = env('PROJECT_NAME', 'tribe');
    // Thread .env always has DB_USER; root .env does not set it
    $isThread = env('DB_USER', '') !== '';
    if (! $isThread) {
        return $full;
    }

    // Thread PROJECT_NAME is "{root}_{threadname}"; root is everything before
    // the last underscore-delimited segment that looks like a thread name.
    // Simplest reliable approach: strip the last "_<segment>" from the name.
    $pos = strrpos($full, '_');
    return $pos !== false ? substr($full, 0, $pos) : $full;
    }

    $projectName = env('PROJECT_NAME', 'tribe');
    if (str_contains($projectName, '_') && env('DB_USER', '') === '') {
    // Only redirect if this looks like an actual thread (root .env has no DB_USER).
    // Being served by a thread's php-fpm — redirect to correct port
    $threadPort = env('TRIBE_PORT', '');
    if ($threadPort !== '') {
        header("Location: http://" . preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST']) . ":$threadPort/", true, 302);
        exit;
    }
    }

    // ── Check Functions ──────────────────────────────────────────────────────────

    function checkMySQL(): array
    {
    $host = env('DB_HOST', 'mysql');
    $port = (int) env('DB_PORT', '3306');
    $db   = env('DB_NAME', '');

    $user = env('DB_USER', '');
    $pass = env('DB_PASS', '');
    if ($user === '') {
        $user = 'root';
        $pass = env('DB_ROOT_PASSWORD', 'rootpassword');
    }

    try {
        $dsn = "mysql:host=$host;port=$port" . ($db !== '' ? ";dbname=$db" : '');
        $pdo = new PDO($dsn, $user, $pass, [
            PDO::ATTR_TIMEOUT => 3,
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        ]);
        $version = $pdo->query('SELECT VERSION()')->fetchColumn();
        return ['ok' => true, 'detail' => "MySQL $version @ $host:$port (user: $user)"];
    } catch (Throwable $e) {
        return ['ok' => false, 'detail' => $e->getMessage()];
    }
    }

    function checkPHPFPM(): array
    {
    $sapi    = php_sapi_name();
    $version = PHP_VERSION;
    if ($sapi === 'fpm-fcgi') {
        return ['ok' => true, 'detail' => "PHP $version via php-fpm (FPM/FastCGI)"];
    }
    return ['ok' => true, 'detail' => "PHP $version via $sapi"];
    }

    function checkCaddy(string $label, string $host, int $port): array
    {
    $sock = @fsockopen($host, $port, $errno, $errstr, 2);
    if ($sock) {
        fclose($sock);
        return ['ok' => true, 'detail' => "$label reachable @ $host:$port"];
    }
    return ['ok' => false, 'detail' => "$label unreachable @ $host:$port — $errstr ($errno)"];
    }

    // Shows the container's network interfaces — useful on multi-project servers
    // to confirm the custom IPAM subnet is active and which IP MySQL sees.
    function checkNetwork(): array
    {
    $hostname = gethostname();
    $ip       = gethostbyname($hostname);
    $rootProj = rootProject();
    $isThread = env('DB_USER', '') !== '';
    $context  = $isThread
        ? 'thread (' . env('PROJECT_NAME', '?') . ')'
        : 'root (' . $rootProj . ')';
    return [
        'ok'     => true,
        'detail' => "Container IP: $ip | hostname: $hostname | context: $context",
    ];
    }

    // NOTE: These sidecar services (phpMyAdmin, Tika, Typesense, Centrifugo,
    // Cronicle) are provisioned per-project, alongside this exact
    // PROJECT_NAME — not under some inferred "root" project. rootProject()
    // strips the last "_<segment>" whenever DB_USER is set, which incorrectly
    // mangles project names that legitimately contain an underscore (e.g.
    // "kojo_loom" becomes "kojo"). Use the raw PROJECT_NAME here instead,
    // matching how the working MySQL/Caddy checks already build their hosts.
    function servicesProject(): string
    {
    return env('PROJECT_NAME', 'tribe');
    }

    function checkPhpMyAdmin(): array
    {
    $project = servicesProject();
    $host    = $project . '_phpmyadmin';
    $port    = 80;
    $sock    = @fsockopen($host, $port, $errno, $errstr, 2);
    if ($sock) {fclose($sock);return ['ok' => true, 'detail' => "phpMyAdmin reachable @ $host:$port"];}
    return ['ok' => false, 'detail' => "phpMyAdmin unreachable — $errstr ($errno)"];
    }

    function checkDiskSpace(): array
    {
    $free  = disk_free_space('/');
    $total = disk_total_space('/');
    $used  = $total - $free;
    $pct   = $total > 0 ? round($used / $total * 100, 1) : 0;
    $ok    = $pct < 90;
    $fmt   = fn($b) => round($b / 1073741824, 2) . ' GB';
    return ['ok' => $ok, 'detail' => "Used {$fmt($used)} of {$fmt($total)} ({$pct}%)"];
    }

    function checkWritableDirs(): array
    {
    $dirs = ['/var/www/html/uploads', '/var/log'];
    $bad  = [];
    foreach ($dirs as $d) {
        if (is_dir($d) && ! is_writable($d)) {
            $bad[] = $d;
        }

        if (! is_dir($d)) {
            $bad[] = "$d (missing)";
        }

    }
    if (empty($bad)) {
        return ['ok' => true, 'detail' => 'uploads & logs directories writable'];
    }

    return ['ok' => false, 'detail' => 'Not writable: ' . implode(', ', $bad)];
    }

    function checkTika(): array
    {
    $project = servicesProject();
    $host    = $project . '_tika';
    $port    = 9998;
    $url     = "http://$host:$port/version";

    $ctx  = stream_context_create(['http' => ['timeout' => 3, 'ignore_errors' => true]]);
    $body = @file_get_contents($url, false, $ctx);

    if ($body !== false && strlen(trim($body)) > 0) {
        $version = trim($body);
        return ['ok' => true, 'detail' => "Tika $version @ $host:$port"];
    }

    $sock = @fsockopen($host, $port, $errno, $errstr, 2);
    if ($sock) {
        fclose($sock);
        return ['ok' => true, 'detail' => "Tika reachable @ $host:$port (version unavailable)"];
    }
    return ['ok' => false, 'detail' => "Tika unreachable @ $host:$port — $errstr ($errno)"];
    }

    function checkTypesense(): array
    {
    $project = servicesProject();
    $host    = $project . '_typesense';
    $port    = 8108;
    $apiKey  = env('TYPESENSE_API_KEY', 'xyz');
    $url     = "http://$host:$port/health";

    $ctx = stream_context_create([
        'http' => [
            'timeout'       => 3,
            'ignore_errors' => true,
            'header'        => "X-TYPESENSE-API-KEY: $apiKey\r\n",
        ],
    ]);
    $body = @file_get_contents($url, false, $ctx);

    if ($body !== false) {
        $json = @json_decode($body, true);
        if (isset($json['ok']) && $json['ok'] === true) {
            return ['ok' => true, 'detail' => "Typesense healthy @ $host:$port"];
        }
        $msg = $json['message'] ?? trim($body);
        return ['ok' => false, 'detail' => "Typesense @ $host:$port — $msg"];
    }

    return ['ok' => false, 'detail' => "Typesense unreachable @ $host:$port"];
    }

    function checkCentrifugo(): array
    {
    $project = servicesProject();
    $host    = $project . '_centrifugo';
    $port    = 8000;
    $sock    = @fsockopen($host, $port, $errno, $errstr, 2);
    if ($sock) {
        fclose($sock);
        return ['ok' => true, 'detail' => "Centrifugo reachable @ $host:$port"];
    }
    return ['ok' => false, 'detail' => "Centrifugo unreachable @ $host:$port — $errstr ($errno)"];
    }

    function checkCronicle(): array
    {
    $project = servicesProject();
    $host    = $project . '_cronicle';
    $port    = 3012;
    $sock    = @fsockopen($host, $port, $errno, $errstr, 2);
    if ($sock) {
        fclose($sock);
        return ['ok' => true, 'detail' => "Cronicle reachable @ $host:$port"];
    }
    return ['ok' => false, 'detail' => "Cronicle unreachable @ $host:$port — $errstr ($errno)"];
    }

    // ── Run All Checks ───────────────────────────────────────────────────────────

    $project = env('PROJECT_NAME', 'tribe');

    $checks = [
    'PHP-FPM'          => checkPHPFPM(),
    'Network'          => checkNetwork(),
    'MySQL'            => checkMySQL(),
    'Tika'             => checkTika(),
    'Typesense'        => checkTypesense(),
    'Centrifugo'       => checkCentrifugo(),
    'Cronicle'         => checkCronicle(),
    'Caddy (Tribe)'    => checkCaddy('Caddy Tribe', $project . '_caddy_tribe', 80),
    'Caddy (Junction)' => checkCaddy('Caddy Junction', $project . '_caddy_junction', 80),
    'Caddy (Dist)'     => checkCaddy('Caddy Dist', $project . '_caddy_dist', 80),
    'Caddy (PHP Dist)' => checkCaddy('Caddy PHP Dist', $project . '_caddy_php_dist', 80),
    'phpMyAdmin'       => checkPhpMyAdmin(),
    'Disk Space'       => checkDiskSpace(),
    'Writable Dirs'    => checkWritableDirs(),
    ];

    $allOk   = array_reduce($checks, fn($c, $v) => $c && $v['ok'], true);
    $okCount = count(array_filter($checks, fn($v) => $v['ok']));
    $total   = count($checks);
    $now     = date('Y-m-d H:i:s T');

?><!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><?php echo htmlspecialchars($project) ?> — Health</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;1,100;1,200;1,300;1,400;1,500;1,600;1,700&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'IBM Plex Mono', monospace;
      background: #ffffff;
      color: #000000;
      padding: 2rem;
      max-width: 860px;
      margin: 0 auto;
    }

    header { border-bottom: 2px solid #000; padding-bottom: 1rem; margin-bottom: 2rem; }
    header h1 { font-size: 1.4rem; font-weight: 600; letter-spacing: -0.02em; }
    header p  { font-size: 0.8rem; font-weight: 300; margin-top: 0.3rem; }

    .summary {
      border: 2px solid #000;
      padding: 0.75rem 1rem;
      margin-bottom: 2rem;
      font-size: 0.9rem;
    }
    .summary .status-all-ok  { font-weight: 700; }
    .summary .status-all-bad { font-weight: 700; }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.82rem;
    }
    thead tr { border-bottom: 2px solid #000; }
    thead th {
      text-align: left;
      padding: 0.5rem 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-size: 0.72rem;
    }
    tbody tr { border-bottom: 1px solid #ccc; }
    tbody tr:last-child { border-bottom: none; }
    tbody td { padding: 0.55rem 0.75rem; vertical-align: top; }

    .badge {
      display: inline-block;
      padding: 0.1rem 0.45rem;
      border: 1px solid #000;
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.08em;
    }
    .badge-ok  { background: #000; color: #fff; }
    .badge-err { background: #fff; color: #000; }

    .detail { color: #444; font-size: 0.78rem; }

    footer {
      margin-top: 2.5rem;
      border-top: 1px solid #ccc;
      padding-top: 0.75rem;
      font-size: 0.72rem;
      color: #666;
    }
  </style>
</head>
<body>

<header>
  <h1><?php echo htmlspecialchars(strtoupper($project)) ?> // SERVICE HEALTH</h1>
  <p>Generated <?php echo $now ?> &nbsp;&middot;&nbsp; PHP <?php echo PHP_VERSION ?> &nbsp;&middot;&nbsp; <?php echo php_uname('n') ?></p>
</header>

<div class="summary">
  <?php if ($allOk): ?>
    <span class="status-all-ok">&#10003; ALL SYSTEMS OPERATIONAL</span>
    &nbsp;&mdash;&nbsp; <?php echo $okCount ?>/<?php echo $total ?> checks passed
  <?php else: ?>
    <span class="status-all-bad">&#x26A0; DEGRADED</span>
    &nbsp;&mdash;&nbsp; <?php echo $okCount ?>/<?php echo $total ?> checks passed
  <?php endif?>
</div>

<table>
  <thead>
    <tr>
      <th style="width:32%">Service</th>
      <th style="width:12%">Status</th>
      <th>Detail</th>
    </tr>
  </thead>
  <tbody>
    <?php foreach ($checks as $name => $result): ?>
    <tr>
      <td><?php echo htmlspecialchars($name) ?></td>
      <td>
        <?php if ($result['ok']): ?>
          <span class="badge badge-ok">OK</span>
        <?php else: ?>
          <span class="badge badge-err">FAIL</span>
        <?php endif?>
      </td>
      <td class="detail"><?php echo htmlspecialchars($result['detail']) ?></td>
    </tr>
    <?php endforeach?>
  </tbody>
</table>

<footer>
  Tribe Framework &nbsp;&middot;&nbsp; <?php echo htmlspecialchars($project) ?> &nbsp;&middot;&nbsp; Auto-refresh:
  <a href="" style="color:#000">reload</a>
</footer>

</body>
</html>