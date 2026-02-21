<?php
//composer autoload
require __DIR__ . '/vendor/autoload.php';

//dotenv for loading variables in .env as $_ENV
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__, '.env');
$dotenv->load();

//php vars file
require_once __DIR__.'/config/config.php';

$url_parts = parse_url($_SERVER['HTTP_HOST'].$_SERVER['REQUEST_URI']);

$url_path_parts = explode('/', $url_parts['path']);

parse_str(parse_url($_SERVER['REQUEST_URI'], PHP_URL_QUERY), $params);

$url = 'https://'
		.$url_parts['host']
		.($url_parts['path'] ?? '');

$type = $url_path_parts[1] ?? '';
$slug = $url_path_parts[2] ?? '';