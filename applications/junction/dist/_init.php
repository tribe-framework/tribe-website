<?php
//composer autoload
require __DIR__ . '/vendor/autoload.php';

//dotenv for loading variables in .env as $_ENV
$dotenv = Dotenv\Dotenv::createUnsafeImmutable(__DIR__);
$dotenv->safeLoad(); // safeLoad() won't throw if .env is missing