<?php
// backend-php/src/Response.php

class Response {
    public static function json(mixed $data, int $status = 200, array $headers = []): void {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, no-cache, must-revalidate');

        foreach ($headers as $key => $value) {
            header("$key: $value");
        }

        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit();
    }

    public static function error(string $message, int $status = 400, array $extra = []): void {
        self::json(array_merge(['error' => $message], $extra), $status);
    }
}

