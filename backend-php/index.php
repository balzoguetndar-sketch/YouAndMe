<?php
// backend-php/index.php

if (php_sapi_name() === 'cli-server') {
    $uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    if ($uriPath !== '/' && file_exists(__DIR__ . $uriPath) && !is_dir(__DIR__ . $uriPath)) {
        return false;
    }
}

// 1. Chargement de la configuration
$configFile = __DIR__ . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Fichier config.php introuvable. Veuillez copier config.example.php vers config.php.']);
    exit();
}
$config = require $configFile;

// 2. Gestion globale des erreurs
error_reporting(E_ALL);
ini_set('display_errors', '0'); // Désactivé à l'affichage pour préserver les retours JSON propres
set_error_handler(function ($severity, $message, $file, $line) {
    if (!(error_reporting() & $severity)) return false;
    throw new ErrorException($message, 0, $severity, $file, $line);
});

// 3. Import des classes de base
require_once __DIR__ . '/src/Response.php';
require_once __DIR__ . '/src/Database.php';
require_once __DIR__ . '/src/Middleware/Cors.php';
require_once __DIR__ . '/src/Controllers/AuthController.php';
require_once __DIR__ . '/src/Controllers/ContactsController.php';
require_once __DIR__ . '/src/Controllers/UsageController.php';
require_once __DIR__ . '/src/Controllers/WebRTCController.php';
require_once __DIR__ . '/src/Controllers/BannersController.php';
require_once __DIR__ . '/src/Controllers/LogsController.php';
require_once __DIR__ . '/src/Controllers/StripeController.php';
require_once __DIR__ . '/src/Controllers/FilesController.php';

// 4. Exécution du middleware CORS pour Vercel
Cors::handle($config['cors']['allowed_origins'] ?? []);

// 5. Analyse de la requête entrante
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$requestUri = $_SERVER['REQUEST_URI'] ?? '/';
$path = parse_url($requestUri, PHP_URL_PATH) ?? '/';
$path = str_replace('\\', '/', $path);

// Suppression des sous-dossiers uniquement sous Apache/Nginx (pas avec php -S cli-server)
if (php_sapi_name() !== 'cli-server') {
    $scriptName = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '');
    $scriptDir = rtrim(dirname($scriptName), '/');
    if (!empty($scriptDir) && $scriptDir !== '/' && str_starts_with($path, $scriptDir)) {
        $path = substr($path, strlen($scriptDir));
    }
}
$path = trim($path, '/');

if (str_starts_with($path, 'index.php/')) {
    $path = substr($path, 10);
}
if (str_starts_with($path, 'api/')) {
    $path = substr($path, 4);
}
$path = trim($path, '/');

// 6. Table de routage principale
try {
    switch ("$method $path") {
        // --- Vérification de santé (Health Check) ---
        case 'GET ':
        case 'GET health':
            Response::json([
                'status'    => 'ok',
                'service'   => 'YouAndMe PHP API',
                'version'   => '1.0.0',
                'php'       => PHP_VERSION,
                'timestamp' => date('c'),
            ]);
            break;

        // --- Authentification & Utilisateurs ---
        case 'POST verify-email':
            (new AuthController($config))->verifyEmail();
            break;

        case 'POST auth/otp':
            (new AuthController($config))->handleOtp();
            break;

        case 'POST auth/magic-link':
            (new AuthController($config))->sendMagicLink();
            break;

        case 'POST auth/magic-link/verify':
            (new AuthController($config))->verifyMagicLink();
            break;

        case 'GET auth/magic-link/handoff':
        case 'POST auth/magic-link/handoff':
            (new AuthController($config))->handleMagicLinkHandoff();
            break;

        case 'POST auth/session':
            (new AuthController($config))->handleSession();
            break;

        case 'POST auth/logout':
            (new AuthController($config))->handleLogout();
            break;

        case 'POST auth/admin':
            (new AuthController($config))->handleAdminLogin();
            break;

        case 'GET auth/admin/session':
            (new AuthController($config))->handleAdminSession();
            break;

        case 'POST auth/admin/logout':
            (new AuthController($config))->handleAdminLogout();
            break;

        // --- Carnet de Contacts ---
        case 'GET contacts':
            (new ContactsController($config))->list();
            break;

        case 'POST contacts':
            (new ContactsController($config))->add();
            break;

        case 'DELETE contacts':
            (new ContactsController($config))->remove();
            break;

        // --- Quotas & Licences ---
        case 'GET usage':
            (new UsageController($config))->getUsage();
            break;

        case 'POST usage':
            (new UsageController($config))->handleUsage();
            break;

        // --- Signalement WebRTC 100% PHP/MySQL ---
        case 'POST webrtc/signal':
            (new WebRTCController($config))->sendSignal();
            break;

        case 'GET webrtc/poll':
            (new WebRTCController($config))->pollSignals();
            break;

        case 'GET webrtc/presence':
        case 'POST webrtc/presence':
            (new WebRTCController($config))->handlePresence();
            break;

        // --- Bannières Publicitaires ---
        case 'GET banners':
            (new BannersController($config))->listPublic();
            break;

        case 'GET admin/banners':
            (new BannersController($config))->listAdmin();
            break;

        case 'POST admin/banners':
            (new BannersController($config))->create();
            break;

        case 'PUT admin/banners':
            (new BannersController($config))->update();
            break;

        case 'DELETE admin/banners':
            (new BannersController($config))->delete();
            break;

        // --- Logs de Connexion ---
        case 'POST log-connection':
            (new LogsController($config))->logConnection();
            break;

        case 'GET admin/logs':
            (new LogsController($config))->listAdmin();
            break;

        case 'POST admin/logs':
        case 'DELETE admin/logs':
            (new LogsController($config))->purgeAdmin();
            break;

        // --- Paiements & Stripe ---
        case 'POST checkout':
            (new StripeController($config))->createCheckoutSession();
            break;

        case 'POST webhooks/stripe':
            (new StripeController($config))->handleWebhook();
            break;

        // --- Fichiers Partagés en Session ---
        case 'POST collaboration/files':
            (new FilesController($config))->upload();
            break;

        case 'GET collaboration/files':
            (new FilesController($config))->download();
            break;

        // --- 404 Route non trouvée ---
        default:
            Response::error("Route non trouvée : [$method] /$path", 404);
            break;
    }
} catch (Throwable $e) {
    Response::error('Erreur interne du serveur : ' . $e->getMessage(), 500);
}

