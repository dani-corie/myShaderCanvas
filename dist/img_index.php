<?php

$directory = isset($_GET['dir']) ? $_GET['dir'] : '';
$directory = $_SERVER['DOCUMENT_ROOT'] . '/' . $directory;

if (is_dir($directory) && is_readable($directory)) {
    $files = scandir($directory);
    
    $files = array_filter($files, function($e) {
      $ext = pathinfo($e, PATHINFO_EXTENSION);
      return in_array(strtolower($ext), ['gif', 'jpeg', 'jpg', 'png', 'webp']);
    });
    
    $files = array_values($files);
    
    header('Content-Type: application/json');
    echo json_encode($files);
} else {
    header('HTTP/1.1 400 Bad Request');
    echo json_encode(array('error' => 'Invalid directory'));
}