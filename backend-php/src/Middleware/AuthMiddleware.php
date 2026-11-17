<?php
// backend-php/src/Middleware/AuthMiddleware.php

require_once __DIR__ . '/../Services/TokenService.php';
require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Response.php';

class AuthMiddleware {
    private array $config;
    private TokenService $tokenService;

    public function __construct(array $config) {
        $this->config = $config;
        $this->tokenService = new TokenService($config);
    }

    /**
     * Authentifie la requête et renvoie les infos de l'utilisateur ou coupe avec une 401
     */
    public function authenticate(): array {
        $token = $this->extractToken();
        if (!$token) {
            Response::error('Session non authentifiée. Jeton manquant.', 401);
        }

        // Vérification prioritaire si c'est une session administrateur
        if ($this->isAdminToken($token)) {
            return [
                'user_id'  => 'admin',
                'email'    => strtolower($this->config['app']['admin_email'] ?? 'balzoguetndar@gmail.com'),
                'is_admin' => true,
            ];
        }

        $payload = $this->tokenService->verifyToken($token);
        if (!$payload || empty($payload['sub']) || empty($payload['email'])) {
            Response::error('Session invalide ou expirée.', 401);
        }

        $userId = $payload['sub'];
        $email = strtolower(trim($payload['email']));

        // Vérification de la session active en BDD (règle de session unique de YouAndMe)
        $pdo = Database::getConnection($this->config);
        $stmt = $pdo->prepare('SELECT session_token_hash FROM active_standard_sessions WHERE user_id = ?');
        $stmt->execute([$userId]);
        $activeSession = $stmt->fetch();

        if (!$activeSession) {
            Response::error('Aucune session active trouvée.', 401);
        }

        $tokenHash = hash('sha256', $token);
        if (!hash_equals($activeSession['session_token_hash'], $tokenHash)) {
            Response::error('Session invalidée (une nouvelle connexion a été ouverte ailleurs).', 401);
        }

        return [
            'user_id'  => $userId,
            'email'    => $email,
            'is_admin' => false,
        ];
    }

    private function isAdminToken(string $token): bool {
        $parts = explode('.', $token);
        if (count($parts) !== 2) return false;
        list($b64Payload, $b64Sig) = $parts;
        $secret = $this->config['app']['secret_key'] ?? '9e6f3b48c12a7d0e5f9182374bca5e6f1029384756abcdef0123456789abcdef';
        $key = "$secret:youandme-admin-session-v1";
        $expectedSig = rtrim(strtr(base64_encode(hash_hmac('sha256', $b64Payload, $key, true)), '+/', '-_'), '=');
        if (!hash_equals($expectedSig, $b64Sig)) return false;
        $payload = json_decode(base64_decode(strtr($b64Payload, '-_', '+/')), true);
        if (!$payload) return false;
        $expiry = (int)($payload['expiresAt'] ?? $payload['exp'] ?? 0);
        return $expiry > time();
    }

    private function extractToken(): ?string {
        $authHeader = '';
        if (function_exists('getallheaders')) {
            $headers = getallheaders();
            $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
        }
        if (empty($authHeader)) {
            $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        }

        // 1. En-tête Authorization: Bearer <token>
        if (preg_match('/Bearer\s+(\S+)/i', $authHeader, $matches)) {
            return $matches[1];
        }

        // 2. Cookie de session utilisateur standard
        if (!empty($_COOKIE['yam_session_token'])) {
            return $_COOKIE['yam_session_token'];
        }

        // 3. Cookie de session administrateur
        if (!empty($_COOKIE['yam_admin_session'])) {
            return $_COOKIE['yam_admin_session'];
        }

        // 4. Corps JSON { token: "..." }
        $raw = file_get_contents('php://input');
        if (!empty($raw)) {
            $data = json_decode($raw, true);
            if (!empty($data['token'])) {
                return $data['token'];
            }
        }

        return null;
    }
}
