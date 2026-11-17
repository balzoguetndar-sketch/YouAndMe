<?php
// backend-php/src/Controllers/AuthController.php

require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Response.php';
require_once __DIR__ . '/../Services/MailerService.php';
require_once __DIR__ . '/../Services/TokenService.php';

class AuthController {
    private array $config;
    private ?PDO $pdo = null;
    private MailerService $mailer;
    private TokenService $tokenService;
    private string $adminEmail;

    public function __construct(array $config) {
        $this->config = $config;
        $this->mailer = new MailerService($config);
        $this->tokenService = new TokenService($config);
        $this->adminEmail = strtolower($config['app']['admin_email'] ?? 'balzoguetndar@gmail.com');
    }

    private function getDb(): PDO {
        if ($this->pdo === null) {
            $this->pdo = Database::getConnection($this->config);
        }
        return $this->pdo;
    }

    /**
     * POST /verify-email
     */
    public function verifyEmail(): void {
        $data = $this->getJsonInput();
        $email = $data['email'] ?? '';
        $validation = $this->validateEmailSyntax($email);

        if (!$validation['isValid']) {
            Response::json([
                'valid' => false,
                'error' => $validation['error'],
                'suggestedEmail' => $validation['suggestedEmail'] ?? null,
            ], 400);
        }

        $cleanEmail = $validation['cleanEmail'];
        $isAdmin = ($cleanEmail === $this->adminEmail);

        Response::json([
            'valid'      => true,
            'cleanEmail' => $cleanEmail,
            'isAdmin'    => $isAdmin,
        ]);
    }

    /**
     * POST /auth/otp
     */
    public function handleOtp(): void {
        $data = $this->getJsonInput();
        $action = $data['action'] ?? 'send';
        $email = $data['email'] ?? '';
        $code = trim((string)($data['code'] ?? ''));

        $validation = $this->validateEmailSyntax($email);
        if (!$validation['isValid']) {
            Response::error($validation['error'], 400);
        }
        $cleanEmail = $validation['cleanEmail'];
        $isAdmin = ($cleanEmail === $this->adminEmail);

        // Action 1 : Génération et envoi du code
        if ($action === 'send') {
            $otpCode = (string)random_int(100000, 999999);
            $this->storeOtpCode($cleanEmail, $otpCode);

            // Sujet et corps de l'email
            $subject = 'Votre code de sécurité You&Me';
            $html = "
                <div style='font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a; max-width: 500px; margin: 0 auto;'>
                    <h2 style='margin-bottom: 12px; color: #1e3a8a;'>Code de sécurité You&Me</h2>
                    <p>Voici votre code de confirmation pour finaliser votre connexion :</p>
                    <div style='font-size: 32px; letter-spacing: 6px; font-weight: bold; padding: 18px 0; color: #0f172a; text-align: center;'>
                        $otpCode
                    </div>
                    <p style='color: #64748b; font-size: 14px;'>Ce code est valable 10 minutes.</p>
                </div>
            ";
            $text = "Votre code de sécurité You&Me est : $otpCode (valable 10 minutes).";

            $mailResult = $this->mailer->send($cleanEmail, $subject, $html, $text);

            Response::json([
                'success'    => true,
                'cleanEmail' => $cleanEmail,
                'message'    => $mailResult['sent']
                    ? 'Code de confirmation envoyé par e-mail.'
                    : 'Code généré localement (vérifiez storage/logs/mail.log ou devCode).',
                'devCode'    => (!$mailResult['sent'] || ($this->config['app']['debug'] ?? true)) ? $otpCode : null,
            ]);
        }

        // Action 2 : Vérification du code
        if ($action === 'verify') {
            // Bypass développeur ou master PIN admin
            $isBypass = ($code === '690858');
            $storedOtp = $this->getStoredOtpCode($cleanEmail);

            if (!$isBypass) {
                if (!$storedOtp) {
                    Response::error('Aucun code de confirmation en attente. Veuillez redemander un code.', 400);
                }
                if ($storedOtp['expires_at'] < time()) {
                    $this->deleteStoredOtp($cleanEmail);
                    Response::error('Le code de sécurité a expiré. Veuillez en générer un nouveau.', 400);
                }
                if ($storedOtp['attempts'] >= 5) {
                    $this->deleteStoredOtp($cleanEmail);
                    Response::error('Nombre maximal de tentatives dépassé. Veuillez redemander un code.', 429);
                }
                if ($storedOtp['code'] !== $code) {
                    $this->incrementOtpAttempts($cleanEmail);
                    Response::error('Code de sécurité incorrect. Veuillez vérifier le code saisi.', 400);
                }
            }

            // Code validé avec succès
            $this->deleteStoredOtp($cleanEmail);
            $user = $this->ensureUserRecord($cleanEmail);
            $sessionData = $this->createSessionForUser($user['id'], $cleanEmail);

            Response::json([
                'success'      => true,
                'cleanEmail'   => $cleanEmail,
                'isAdmin'      => $isAdmin,
                'userId'       => $user['id'],
                'token'        => $sessionData['token'],
                'sessionToken' => $sessionData['sessionToken'],
                'message'      => 'Adresse e-mail vérifiée avec succès.',
            ]);
        }

        Response::error('Action OTP inconnue.', 400);
    }

    /**
     * POST /auth/magic-link
     */
    public function sendMagicLink(): void {
        $data = $this->getJsonInput();
        $email = $data['email'] ?? '';
        $handoffId = $data['handoffId'] ?? '';

        $validation = $this->validateEmailSyntax($email);
        if (!$validation['isValid']) {
            Response::error($validation['error'], 400);
        }
        $cleanEmail = $validation['cleanEmail'];

        // Token temporaire pour le clic dans l'email
        $magicToken = $this->tokenService->createToken([
            'email'     => $cleanEmail,
            'handoffId' => $handoffId,
            'exp'       => time() + (15 * 60), // 15 minutes
        ]);

        // En développement local, utiliser l'IP LAN (ex: 192.168.43.133:3000)
        // pour que le lien cliqué sur mobile joigne la machine hôte via le Wi-Fi
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        $lanIp = gethostbyname(gethostname());
        $isLocalHost = empty($origin) || str_contains($origin, 'localhost') || str_contains($origin, '127.0.0.1');

        if ($isLocalHost && !empty($lanIp) && $lanIp !== '127.0.0.1') {
            $frontendUrl = "http://$lanIp:3000";
        } else {
            $frontendUrl = !empty($origin) ? $origin : ($this->config['cors']['allowed_origins'][0] ?? 'http://localhost:3000');
        }

        $actionLink = rtrim($frontendUrl, '/') . "/verify?token_hash=" . urlencode($magicToken) . "&type=magiclink&handoff=" . urlencode($handoffId);

        $subject = 'Votre lien de connexion You&Me';
        $html = "
            <div style='font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a; max-width: 560px; margin: 0 auto; padding: 24px;'>
                <h2 style='color: #4f46e5; margin-bottom: 16px;'>Connexion à You&Me</h2>
                <p>Pour vous connecter en toute sécurité, cliquez sur le bouton ci-dessous :</p>
                <p style='margin: 24px 0;'>
                    <a href='$actionLink' style='display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: bold;'>Connexion sécurisée</a>
                </p>
                <p style='color: #64748b; font-size: 14px;'>Ce lien est valable 15 minutes et ne peut être utilisé qu'une seule fois.</p>
            </div>
        ";
        $text = "Pour vous connecter à You&Me, ouvrez ce lien sécurisé : $actionLink (valable 15 minutes).";

        $mailResult = $this->mailer->send($cleanEmail, $subject, $html, $text);

        Response::json([
            'success' => true,
            'message' => $mailResult['sent'] ? 'Lien magique envoyé par e-mail.' : 'Lien généré localement.',
            'devLink' => (!$mailResult['sent'] || ($this->config['app']['debug'] ?? true)) ? $actionLink : null,
        ]);
    }

    /**
     * POST /auth/magic-link/verify
     */
    public function verifyMagicLink(): void {
        $data = $this->getJsonInput();
        $token = $data['token'] ?? '';
        $handoffId = $data['handoffId'] ?? '';

        if (empty($token)) {
            Response::error('Jeton de vérification manquant.', 400);
        }

        $payload = $this->tokenService->verifyToken($token);
        if (!$payload || empty($payload['email'])) {
            Response::error('Ce lien magique est invalide ou a expiré.', 400);
        }

        $email = strtolower(trim($payload['email']));
        $user = $this->ensureUserRecord($email);
        $sessionData = $this->createSessionForUser($user['id'], $email);

        // Si un handoffId est fourni, stocker le credential pour le navigateur d'origine
        if (!empty($handoffId)) {
            $hash = hash('sha256', $handoffId);
            $credential = [
                'type'         => 'session',
                'accessToken'  => $sessionData['token'],
                'refreshToken' => $sessionData['sessionToken'],
                'email'        => $email,
            ];
            $encrypted = $this->encryptHandoffCredential($credential);
            $expiresAt = date('Y-m-d H:i:s', time() + (15 * 60));

            $stmt = $this->getDb()->prepare('
                REPLACE INTO magic_link_handoffs (handoff_id_hash, encrypted_credential, nonce, auth_tag, expires_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            ');
            $stmt->execute([
                $hash,
                $encrypted['encrypted_credential'],
                $encrypted['nonce'],
                $encrypted['auth_tag'],
                $expiresAt,
                date('Y-m-d H:i:s'),
            ]);
        }

        Response::json([
            'success'      => true,
            'email'        => $email,
            'userId'       => $user['id'],
            'token'        => $sessionData['token'],
            'sessionToken' => $sessionData['sessionToken'],
            'message'      => 'Connexion réussie.',
        ]);
    }

    /**
     * GET /auth/magic-link/handoff?id=...
     * POST /auth/magic-link/handoff
     */
    public function handleMagicLinkHandoff(): void {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

        if ($method === 'GET') {
            $handoffId = $_GET['id'] ?? '';
            if (empty($handoffId)) {
                Response::error('Identifiant de transfert manquant.', 400);
            }

            $hash = hash('sha256', $handoffId);
            $stmt = $this->getDb()->prepare('SELECT * FROM magic_link_handoffs WHERE handoff_id_hash = ?');
            $stmt->execute([$hash]);
            $row = $stmt->fetch();

            if (!$row) {
                // Pas encore validé -> statut 202 Accepted pour demander au frontend de patienter
                Response::json(['ready' => false, 'message' => 'En attente de validation du lien...'], 202);
            }

            if (strtotime($row['expires_at']) < time()) {
                $stmtDel = $this->getDb()->prepare('DELETE FROM magic_link_handoffs WHERE handoff_id_hash = ?');
                $stmtDel->execute([$hash]);
                Response::json(['ready' => false, 'error' => 'Le lien magique a expiré.'], 410);
            }

            // Déchiffrement du credential
            $credential = $this->decryptHandoffCredential($row['encrypted_credential'], $row['nonce'], $row['auth_tag']);
            if (!$credential) {
                Response::json(['ready' => false, 'error' => 'Échec de déchiffrement du credential.'], 400);
            }

            // Supprimer après consommation
            $stmtDel = $this->getDb()->prepare('DELETE FROM magic_link_handoffs WHERE handoff_id_hash = ?');
            $stmtDel->execute([$hash]);

            Response::json([
                'ready'      => true,
                'credential' => $credential,
            ]);
        }

        if ($method === 'POST') {
            $data = $this->getJsonInput();
            $handoffId = $data['handoffId'] ?? '';
            $credential = $data['credential'] ?? null;
            $acknowledge = $data['acknowledge'] ?? false;

            if (empty($handoffId)) {
                Response::error('Identifiant de transfert invalide.', 400);
            }

            $hash = hash('sha256', $handoffId);

            if ($acknowledge) {
                $stmt = $this->getDb()->prepare('DELETE FROM magic_link_handoffs WHERE handoff_id_hash = ?');
                $stmt->execute([$hash]);
                Response::json(['success' => true]);
            }

            if (!$credential) {
                Response::error('Credential manquant.', 400);
            }

            $encrypted = $this->encryptHandoffCredential($credential);
            $expiresAt = date('Y-m-d H:i:s', time() + (15 * 60));

            $stmt = $this->getDb()->prepare('
                REPLACE INTO magic_link_handoffs (handoff_id_hash, encrypted_credential, nonce, auth_tag, expires_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            ');
            $stmt->execute([
                $hash,
                $encrypted['encrypted_credential'],
                $encrypted['nonce'],
                $encrypted['auth_tag'],
                $expiresAt,
                date('Y-m-d H:i:s'),
            ]);

            Response::json(['success' => true]);
        }
    }

    private function encryptHandoffCredential(array $credential): array {
        $key = hash('sha256', $this->config['app']['secret_key'] ?? 'yam_fallback_secret', true);
        $nonce = random_bytes(12);
        $tag = '';
        $ciphertext = openssl_encrypt(
            json_encode($credential),
            'aes-256-gcm',
            $key,
            OPENSSL_RAW_DATA,
            $nonce,
            $tag
        );

        return [
            'encrypted_credential' => rtrim(strtr(base64_encode($ciphertext), '+/', '-_'), '='),
            'nonce'                => rtrim(strtr(base64_encode($nonce), '+/', '-_'), '='),
            'auth_tag'             => rtrim(strtr(base64_encode($tag), '+/', '-_'), '='),
        ];
    }

    private function decryptHandoffCredential(string $encrypted, string $nonce, string $tag): ?array {
        $key = hash('sha256', $this->config['app']['secret_key'] ?? 'yam_fallback_secret', true);
        $ciphertext = base64_decode(strtr($encrypted, '-_', '+/'));
        $rawNonce = base64_decode(strtr($nonce, '-_', '+/'));
        $rawTag = base64_decode(strtr($tag, '-_', '+/'));

        $decrypted = openssl_decrypt(
            $ciphertext,
            'aes-256-gcm',
            $key,
            OPENSSL_RAW_DATA,
            $rawNonce,
            $rawTag
        );

        if ($decrypted === false) return null;
        $data = json_decode($decrypted, true);
        return is_array($data) ? $data : null;
    }

    /**
     * POST /auth/session
     */
    public function handleSession(): void {
        $token = $this->extractBearerOrCookieToken();
        if (!$token) {
            Response::error('Session non authentifiée.', 401);
        }

        $payload = $this->tokenService->verifyToken($token);
        if (!$payload || empty($payload['sub']) || empty($payload['email'])) {
            Response::error('Session expirée ou invalide.', 401);
        }

        $userId = $payload['sub'];
        $email = $payload['email'];

        // Vérification de la session active en BDD
        $stmt = $this->getDb()->prepare('SELECT session_token_hash FROM active_standard_sessions WHERE user_id = ?');
        $stmt->execute([$userId]);
        $active = $stmt->fetch();

        $tokenHash = hash('sha256', $token);
        $activateNew = ($_SERVER['HTTP_X_YAM_SESSION_ACTION'] ?? '') === 'activate';
        $now = date('Y-m-d H:i:s');

        if ($activateNew || !$active) {
            $stmt = $this->getDb()->prepare('
                REPLACE INTO active_standard_sessions (user_id, session_token_hash, updated_at)
                VALUES (?, ?, ?)
            ');
            $stmt->execute([$userId, $tokenHash, $now]);
        } elseif (!hash_equals($active['session_token_hash'], $tokenHash)) {
            Response::error('Cette session a été remplacée par une connexion sur un autre appareil.', 409);
        }

        Response::json([
            'email'  => $email,
            'userId' => $userId,
            'token'  => $token,
        ]);
    }

    /**
     * POST /auth/logout
     */
    public function handleLogout(): void {
        $token = $this->extractBearerOrCookieToken();
        if ($token) {
            $payload = $this->tokenService->verifyToken($token);
            if ($payload && !empty($payload['sub'])) {
                $stmt = $this->getDb()->prepare('DELETE FROM active_standard_sessions WHERE user_id = ?');
                $stmt->execute([$payload['sub']]);
            }
        }

        // Effacer les cookies de session
        setcookie('yam_session_token', '', ['expires' => time() - 3600, 'path' => '/', 'httponly' => true]);
        setcookie('yam_user_email', '', ['expires' => time() - 3600, 'path' => '/']);

        Response::json(['success' => true, 'message' => 'Déconnexion effectuée avec succès.']);
    }

    // --------------------------------------------------------------------------
    // Méthodes utilitaires et BDD
    // --------------------------------------------------------------------------

    private function ensureUserRecord(string $email): array {
        $stmt = $this->getDb()->prepare('SELECT * FROM users WHERE email = ?');
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user) {
            $userId = $this->generateUuid();
            $now = date('Y-m-d H:i:s');
            $stmt = $this->getDb()->prepare('
                INSERT INTO users (id, email, email_confirmed_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
            ');
            $stmt->execute([$userId, $email, $now, $now, $now]);

            // Initialiser le quota d'utilisation (table user_usage)
            $stmtUsage = $this->getDb()->prepare('
                INSERT INTO user_usage (email, usage_count, has_license, license_tier, license_status, quota_unlimited, advertising_enabled, created_at, updated_at)
                VALUES (?, 0, 0, "free", "inactive", 0, 1, ?, ?)
            ');
            $stmtUsage->execute([$email, $now, $now]);

            return ['id' => $userId, 'email' => $email];
        }

        return $user;
    }

    private function createSessionForUser(string $userId, string $email): array {
        $token = $this->tokenService->createToken([
            'sub'   => $userId,
            'email' => $email,
        ]);

        $tokenHash = hash('sha256', $token);
        $stmt = $this->getDb()->prepare('
            REPLACE INTO active_standard_sessions (user_id, session_token_hash, updated_at)
            VALUES (?, ?, ?)
        ');
        $stmt->execute([$userId, $tokenHash, date('Y-m-d H:i:s')]);

        // Définir les cookies pour le navigateur
        $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
        setcookie('yam_session_token', $token, [
            'expires'  => time() + ($this->config['app']['token_ttl'] ?? (86400 * 30)),
            'path'     => '/',
            'secure'   => $secure,
            'httponly' => true,
            'samesite' => $secure ? 'None' : 'Lax',
        ]);
        setcookie('yam_user_email', $email, [
            'expires'  => time() + ($this->config['app']['token_ttl'] ?? (86400 * 30)),
            'path'     => '/',
            'secure'   => $secure,
            'httponly' => false,
            'samesite' => $secure ? 'None' : 'Lax',
        ]);

        return [
            'token'        => $token,
            'sessionToken' => $token,
        ];
    }

    private function validateEmailSyntax(string $email): array {
        $clean = strtolower(trim($email));
        if (empty($clean) || strlen($clean) < 5 || strlen($clean) > 254) {
            return ['isValid' => false, 'error' => "L'adresse e-mail doit comporter entre 5 et 254 caractères."];
        }
        if (!filter_var($clean, FILTER_VALIDATE_EMAIL)) {
            return ['isValid' => false, 'error' => "Format d'adresse e-mail invalide (ex: nom@domaine.com)."];
        }
        return ['isValid' => true, 'cleanEmail' => $clean];
    }

    private function getJsonInput(): array {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }

    private function extractBearerOrCookieToken(): ?string {
        $authHeader = '';
        if (function_exists('getallheaders')) {
            $headers = getallheaders();
            $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
        }
        if (empty($authHeader)) {
            $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        }

        if (preg_match('/Bearer\s+(\S+)/i', $authHeader, $matches)) {
            return $matches[1];
        }
        if (!empty($_COOKIE['yam_session_token'])) {
            return $_COOKIE['yam_session_token'];
        }
        $input = $this->getJsonInput();
        if (!empty($input['token'])) {
            return $input['token'];
        }
        return null;
    }

    private function generateUuid(): string {
        $data = random_bytes(16);
        $data[6] = chr(ord($data[6]) & 0x0f | 0x40); // UUID version 4
        $data[8] = chr(ord($data[8]) & 0x3f | 0x80); // UUID variant
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }

    // Gestion du cache OTP (dans le dossier de stockage temporaire)
    private function storeOtpCode(string $email, string $code): void {
        $file = $this->getOtpFilePath($email);
        $data = [
            'code'       => $code,
            'expires_at' => time() + (10 * 60),
            'attempts'   => 0,
        ];
        file_put_contents($file, json_encode($data));
    }

    /**
     * POST /auth/admin
     * Connexion sécurisée de l'administrateur
     */
    public function handleAdminLogin(): void {
        $data = $this->getJsonInput();
        $email = strtolower(trim((string)($data['email'] ?? '')));
        $code = trim((string)($data['code'] ?? ''));

        $adminEmail = strtolower(trim((string)($this->config['app']['admin_email'] ?? 'balzoguetndar@gmail.com')));
        $expectedPin = trim((string)($this->config['app']['admin_pin'] ?? (getenv('ADMIN_2FA_PIN') ?: '580869')));

        if ($email !== $adminEmail || empty($code) || $code !== $expectedPin) {
            Response::error('Adresse ou code administrateur incorrect.', 401);
        }

        // Création du token admin compatible avec Next.js verifyAdminSessionToken
        $secret = $this->config['app']['secret_key'] ?? '9e6f3b48c12a7d0e5f9182374bca5e6f1029384756abcdef0123456789abcdef';
        $key = "$secret:youandme-admin-session-v1";
        $ttl = 8 * 3600;
        $exp = time() + $ttl;
        // Format attendu par verifyAdminSessionToken dans Next.js : email et expiresAt
        $payload = json_encode([
            'email'     => $adminEmail,
            'expiresAt' => $exp,
            'exp'       => $exp,
        ], JSON_UNESCAPED_SLASHES);
        $b64Payload = rtrim(strtr(base64_encode($payload), '+/', '-_'), '=');
        $signature = hash_hmac('sha256', $b64Payload, $key, true);
        $b64Sig = rtrim(strtr(base64_encode($signature), '+/', '-_'), '=');
        $adminToken = "$b64Payload.$b64Sig";

        // Définition des cookies de session admin
        setcookie('yam_admin_session', $adminToken, [
            'expires'  => $exp,
            'path'     => '/',
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        setcookie('yam_user_email', $adminEmail, [
            'expires'  => $exp,
            'path'     => '/',
            'httponly' => false,
            'samesite' => 'Lax',
        ]);

        Response::json([
            'success' => true,
            'email'   => $adminEmail,
            'token'   => $adminToken,
        ]);
    }

    /**
     * GET /auth/admin/session
     */
    public function handleAdminSession(): void {
        $token = $_COOKIE['yam_admin_session'] ?? $this->extractBearerOrCookieToken();
        if (empty($token)) {
            Response::json(['isAdmin' => false], 401);
        }

        $parts = explode('.', $token);
        if (count($parts) !== 2) {
            Response::json(['isAdmin' => false], 401);
        }

        list($b64Payload, $b64Sig) = $parts;
        $secret = $this->config['app']['secret_key'] ?? '9e6f3b48c12a7d0e5f9182374bca5e6f1029384756abcdef0123456789abcdef';
        $key = "$secret:youandme-admin-session-v1";
        $expectedSig = rtrim(strtr(base64_encode(hash_hmac('sha256', $b64Payload, $key, true)), '+/', '-_'), '=');

        if (!hash_equals($expectedSig, $b64Sig)) {
            Response::json(['isAdmin' => false], 401);
        }

        $payload = json_decode(base64_decode(strtr($b64Payload, '-_', '+/')), true);
        $expiry = (int)($payload['expiresAt'] ?? $payload['exp'] ?? 0);
        if (!$payload || $expiry < time()) {
            Response::json(['isAdmin' => false], 401);
        }

        Response::json([
            'isAdmin' => true,
            'email'   => $payload['email'] ?? '',
        ]);
    }

    /**
     * POST /auth/admin/logout
     */
    public function handleAdminLogout(): void {
        setcookie('yam_admin_session', '', ['expires' => time() - 3600, 'path' => '/']);
        setcookie('yam_user_email', '', ['expires' => time() - 3600, 'path' => '/']);
        Response::json(['success' => true]);
    }

    private function getStoredOtpCode(string $email): ?array {
        $file = $this->getOtpFilePath($email);
        if (!file_exists($file)) return null;
        $data = json_decode((string)file_get_contents($file), true);
        return is_array($data) ? $data : null;
    }

    private function incrementOtpAttempts(string $email): void {
        $data = $this->getStoredOtpCode($email);
        if ($data) {
            $data['attempts'] = ($data['attempts'] ?? 0) + 1;
            file_put_contents($this->getOtpFilePath($email), json_encode($data));
        }
    }

    private function deleteStoredOtp(string $email): void {
        $file = $this->getOtpFilePath($email);
        if (file_exists($file)) @unlink($file);
    }

    private function getOtpFilePath(string $email): string {
        $dir = __DIR__ . '/../../storage/cache/otp';
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        return $dir . '/' . md5($email) . '.json';
    }
}
