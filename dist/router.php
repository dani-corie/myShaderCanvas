<?php
// router.php

// Get the requested URL path
$path = parse_url($_SERVER["REQUEST_URI"], PHP_URL_PATH);
$file = pathinfo($path, PATHINFO_BASENAME);
$dir = pathinfo($path, PATHINFO_DIRNAME);

if ($file === 'index.json' && !file_exists($_SERVER['DOCUMENT_ROOT'] . $path)) {
  $_GET['dir'] = $dir;
  require('img_index.php');
} else {
  return false;
}