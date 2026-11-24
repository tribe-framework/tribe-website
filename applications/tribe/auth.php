<?php
require __DIR__ . '/_init.php';

$api = new \Tribe\API;

header('Cache-Control: no-store');

if (! \Tribe\Auth::requestOriginIsTrusted()) {
    $api->json(['authenticated' => false, 'error' => 'Origin not allowed.'])->send(403);
}

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$action = is_string($_GET['action'] ?? null) ? $_GET['action'] : 'status';

if ($action === 'status' && $method === 'GET') {
    $api->json(['authenticated' => \Tribe\Auth::isLoggedIn()])->send(200);
}

if ($action === 'login' && $method === 'POST') {
    $password        = $api->body()['password'] ?? '';
    [$status, $body] = \Tribe\Auth::login(is_string($password) ? $password : '');
    $api->json($body)->send($status);
}

if ($action === 'logout' && $method === 'POST') {
    \Tribe\Auth::logout();
    $api->json(['authenticated' => false])->send(200);
}

$api->json(['error' => 'Unsupported action or method.'])->send(405);
