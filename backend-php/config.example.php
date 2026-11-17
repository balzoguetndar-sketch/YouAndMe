<?php
/**
 * Configuration exemple pour le backend PHP / MySQL de YouAndMe
 * À copier vers config.php et adapter avec vos paramètres réels d'hébergement.
 */

return [
    // Connexion Base de Données MySQL (cPanel / phpMyAdmin / localhost)
    'db' => [
        'host'     => 'localhost',
        'port'     => 3306,
        'database' => 'yam_db',
        'username' => 'root',
        'password' => '',
        'charset'  => 'utf8mb4',
    ],

    // Sécurité de l'application
    'app' => [
        'secret_key' => 'REMPLACER_PAR_UNE_CLE_SECRETE_ALEATOIRE_64_CARACTERES',
        'token_ttl'  => 86400 * 30, // 30 jours
        'admin_email'=> 'ton-email-admin@example.com',
    ],

    // Autorisations CORS (Frontend Vercel et Localhost)
    'cors' => [
        'allowed_origins' => [
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'https://votre-projet.vercel.app',
        ],
    ],

    // Configuration SMTP pour l'envoi d'OTP / Magic-link (Hébergement mutualisé)
    'smtp' => [
        'host'       => 'mail.votre-domaine.com',
        'port'       => 465,
        'secure'     => 'ssl', // 'ssl' ou 'tls'
        'username'   => 'contact@votre-domaine.com',
        'password'   => 'MOT_DE_PASSE_EMAIL',
        'from_email' => 'contact@votre-domaine.com',
        'from_name'  => 'You & Me',
    ],

    // Stripe (pour les dons et abonnements)
    'stripe' => [
        'secret_key'      => '',
        'webhook_secret'  => '',
    ],
];

