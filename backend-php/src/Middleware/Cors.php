<?php
// backend-php/src/Middleware/Cors.php

class Cors {
    public static function handle(array $allowedOrigins): void {
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

        // Si l'origine est dans la liste autorisée ou si on autorise en local
        $isAllowed = in_array($origin, $allowedOrigins, true);

        // En local, mobile sur Wi-Fi LAN, ou avec Vercel preview (*.vercel.app)
        if (!$isAllowed && !empty($origin)) {
            if (preg_match('#^https://[a-z0-9\-]+\.vercel\.app$#i', $origin) ||
                preg_match('#^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$#i', $origin)) {
                $isAllowed = true;
            }
        }

        if ($isAllowed && !empty($origin)) {
            header("Access-Control-Allow-Origin: $origin");
            header('Access-Control-Allow-Credentials: true');
            header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
            header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept');
            header('Access-Control-Max-Age: 86400'); // Cache pré-vol 24h
        }

        // Si c'est une requête préalable (pre-flight OPTIONS), on valide immédiatement
        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
            http_response_code(204);
            exit();
        }
    }
}

