<?php
/*

This file provides 4 URL variables for use across the middleware of an Ember app

$url = URL of the app
$type = type
$slug = slug
$params = query parameters array
*/
require __DIR__ . '/../../../../_init.php';

$url_parts = parse_url($_SERVER['HTTP_HOST'].$_SERVER['REQUEST_URI']);

$url_path_parts = explode('/', $url_parts['path']);

parse_str(parse_url($_SERVER['REQUEST_URI'], PHP_URL_QUERY), $params);

$url = 'https://'
		.$url_parts['host']
		.($url_parts['path'] ?? '');

$type = $url_path_parts[1] ?? '';
$slug = $url_path_parts[2] ?? '';
?>