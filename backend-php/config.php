<?php
/**
 * Configuration active pour YouAndMe
 */

return [
    'db' => [
        'driver'   => 'sqlite',
        'file'     => __DIR__ . '/storage/yam_local.sqlite',
        // Pour le déploiement sur votre hébergement mutualisé, remplacez 'driver' par 'mysql' :
        'host'     => 'localhost',
        'port'     => 3306,
        'database' => 'yam_db',
        'username' => 'root',
        'password' => '',
        'charset'  => 'utf8mb4',
    ],

    'app' => [
        'secret_key'  => '9e6f3b48c12a7d0e5f9182374bca5e6f1029384756abcdef0123456789abcdef',
        'token_ttl'   => 86400 * 30,
        'admin_email' => 'balzoguetndar@gmail.com',
        'admin_pin'   => '580869',
    ],

    'cors' => [
        'allowed_origins' => [
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'https://votre-projet.vercel.app',
        ],
    ],

    'smtp' => [
        'host'       => 'smtp.resend.com',
        'port'       => 587,
        'secure'     => 'tls',
        'username'   => 'resend',
        'password'   => getenv('RESEND_API_KEY') ?: '',
        'from_email' => 'noreply@youandme.cloud',
        'from_name'  => 'You & Me',
    ],

    'stripe' => [
        'secret_key'     => '',
        'webhook_secret' => '',
    ],
];

