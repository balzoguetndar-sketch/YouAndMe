<?php
// backend-php/src/Controllers/LogsController.php

require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Response.php';
require_once __DIR__ . '/../Middleware/AuthMiddleware.php';

class LogsController {
    private const DEDUPE_WINDOW_SECONDS = 30;

    private array $config;
    private PDO $pdo;
    private AuthMiddleware $auth;
    private string $adminEmail;

    public function __construct(array $config) {
        $this->config = $config;
        $this->pdo = Database::getConnection($config);
        $this->auth = new AuthMiddleware($config);
        $this->adminEmail = strtolower($config['app']['admin_email'] ?? 'balzoguetndar@gmail.com');
    }

    /**
     * POST /log-connection
     */
    public function logConnection(): void {
        $data = $this->getJsonInput();
        $callerEmail = strtolower(trim((string)($data['email'] ?? $data['caller'] ?? '')));
        if (empty($callerEmail)) {
            try {
                $user = $this->auth->authenticate();
                $callerEmail = $user['email'];
            } catch (Throwable) {
                Response::error('Utilisateur non spécifié pour la journalisation.', 400);
            }
        }

        $calleeEmail = strtolower(trim((string)($data['callee'] ?? $data['target'] ?? '')));
        $status = trim((string)($data['status'] ?? 'connected'));
        $clientIp = $this->getClientIp();

        if (empty($calleeEmail)) {
            $calleeEmail = 'session';
        }

        // Déduplication dans la fenêtre des 30 dernières secondes
        $windowAgo = date('Y-m-d H:i:s', time() - self::DEDUPE_WINDOW_SECONDS);
        $stmtCheck = $this->pdo->prepare('
            SELECT id FROM connection_logs
            WHERE caller_email = ? AND callee_email = ? AND created_at >= ?
            LIMIT 1
        ');
        $stmtCheck->execute([$callerEmail, $calleeEmail, $windowAgo]);
        if ($stmtCheck->fetch()) {
            Response::json(['success' => true, 'deduped' => true]);
        }

        $stmt = $this->pdo->prepare('
            INSERT INTO connection_logs (caller_email, callee_email, status, ip_address, created_at)
            VALUES (?, ?, ?, ?, ?)
        ');
        $stmt->execute([$callerEmail, $calleeEmail, $status, $clientIp, date('Y-m-d H:i:s')]);

        Response::json(['success' => true]);
    }

    /**
     * GET /admin/logs
     */
    public function listAdmin(): void {
        $clientIp = $_SERVER['REMOTE_ADDR'] ?? '';
        $isLocal = in_array($clientIp, ['127.0.0.1', '::1', 'localhost'], true) ||
                   preg_match('/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/', $clientIp);

        if (!$isLocal) {
            $user = $this->auth->authenticate();
            if ($user['email'] !== $this->adminEmail) {
                Response::error('Accès refusé. Administrateur requis.', 403);
            }
        }

        $limit = min(500, max(10, (int)($_GET['limit'] ?? 100)));
        $stmt = $this->pdo->prepare('
            SELECT * FROM connection_logs
            ORDER BY created_at DESC
            LIMIT ?
        ');
        $stmt->bindValue(1, $limit, PDO::PARAM_INT);
        $stmt->execute();
        $logs = $stmt->fetchAll();

        Response::json(['logs' => $logs ?: []]);
    }

    /**
     * DELETE ou POST /admin/logs
     */
    public function purgeAdmin(): void {
        $clientIp = $_SERVER['REMOTE_ADDR'] ?? '';
        $isLocal = in_array($clientIp, ['127.0.0.1', '::1', 'localhost'], true) ||
                   preg_match('/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/', $clientIp);

        if (!$isLocal) {
            $user = $this->auth->authenticate();
            if ($user['email'] !== $this->adminEmail) {
                Response::error('Accès refusé. Administrateur requis.', 403);
            }
        }

        $data = $this->getJsonInput();
        $isPurgeAll = ($data['action'] ?? '') === 'purgeAll' || isset($_GET['all']);

        if ($isPurgeAll) {
            $this->pdo->exec('DELETE FROM connection_logs');
            Response::json(['success' => true, 'message' => 'Tous les journaux de connexion ont été supprimés.']);
        }

        $days = isset($_GET['days']) ? (int)$_GET['days'] : 30;
        $threshold = date('Y-m-d H:i:s', time() - ($days * 86400));
        $stmt = $this->pdo->prepare('DELETE FROM connection_logs WHERE created_at < ?');
        $stmt->execute([$threshold]);

        Response::json(['success' => true, 'message' => "Logs antérieurs à $days jours purgés."]);
    }

    private function getClientIp(): string {
        $headers = ['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR'];
        foreach ($headers as $header) {
            if (!empty($_SERVER[$header])) {
                $ips = explode(',', $_SERVER[$header]);
                return trim($ips[0]);
            }
        }
        return '0.0.0.0';
    }

    private function getJsonInput(): array {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }
}

