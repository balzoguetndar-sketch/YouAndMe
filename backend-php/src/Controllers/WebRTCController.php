<?php
// backend-php/src/Controllers/WebRTCController.php

require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Response.php';
require_once __DIR__ . '/../Middleware/AuthMiddleware.php';

class WebRTCController {
    private array $config;
    private PDO $pdo;
    private AuthMiddleware $auth;

    public function __construct(array $config) {
        $this->config = $config;
        $this->pdo = Database::getConnection($config);
        $this->auth = new AuthMiddleware($config);
    }

    /**
     * GET /webrtc/turn-credentials
     * Fournit la configuration TURN aux utilisateurs authentifiés.
     */
    public function getTurnCredentials(): void {
        $this->auth->authenticate();
        $meteredConfig = $this->config['metered'] ?? [];
        $iceServersJson = trim((string)(getenv('METERED_TURN_ICE_SERVERS') ?: ($meteredConfig['ice_servers_json'] ?? '')));
        if ($iceServersJson !== '') {
            $iceServers = json_decode($iceServersJson, true);
            if (!is_array($iceServers) || !$this->hasTurnCredentials($iceServers)) {
                Response::error('La configuration TURN locale est invalide.', 503);
            }

            Response::json(['iceServers' => $iceServers]);
        }

        $appName = trim((string)($meteredConfig['app_name'] ?? getenv('METERED_APP_NAME') ?: ''));
        $apiKey = trim((string)($meteredConfig['api_key'] ?? getenv('METERED_API_KEY') ?: ''));

        if ($appName === '' || $apiKey === '' || !preg_match('/^[a-zA-Z0-9-]+$/', $appName)) {
            Response::error('Open Relay n’est pas configuré sur le backend.', 503);
        }

        $url = sprintf(
            'https://%s.metered.live/api/v1/turn/credentials?apiKey=%s',
            $appName,
            rawurlencode($apiKey)
        );
        $curl = curl_init($url);
        if ($curl === false) {
            Response::error('Impossible d’initialiser la connexion au service TURN.', 502);
        }

        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_HTTPHEADER => ['Accept: application/json'],
        ]);
        $responseBody = curl_exec($curl);
        $statusCode = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $curlError = curl_errno($curl);
        curl_close($curl);

        if ($responseBody === false || $curlError !== 0 || $statusCode < 200 || $statusCode >= 300) {
            Response::error('Open Relay n’a pas pu fournir les paramètres TURN.', 502);
        }

        $iceServers = json_decode($responseBody, true);
        if (!is_array($iceServers) || !$this->hasTurnCredentials($iceServers)) {
            Response::error('Open Relay a renvoyé une configuration TURN invalide.', 502);
        }

        Response::json(['iceServers' => $iceServers]);
    }

    /**
     * POST /webrtc/signal
     * Envoie un signal WebRTC (appel entrant, offre SDP, réponse, candidat ICE, raccrochage)
     */
    public function sendSignal(): void {
        $user = $this->auth->authenticate();
        $senderEmail = $user['email'];

        $data = $this->getJsonInput();
        $targetEmail = strtolower(trim((string)($data['targetEmail'] ?? '')));
        $signal = $data['signal'] ?? null;

        if (empty($targetEmail) || !$signal || !is_array($signal)) {
            Response::error('Destinataire ou signal invalide.', 400);
        }

        $signalType = (string)($signal['type'] ?? 'unknown');
        $payloadJson = json_encode($signal, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        $stmt = $this->pdo->prepare('
            INSERT INTO webrtc_signals (sender_email, recipient_email, signal_type, payload, consumed, created_at)
            VALUES (?, ?, ?, ?, 0, ?)
        ');
        $stmt->execute([$senderEmail, $targetEmail, $signalType, $payloadJson, date('Y-m-d H:i:s')]);

        Response::json(['success' => true]);
    }

    /**
     * GET /webrtc/poll
     * Interroge les signaux en attente pour l'utilisateur connecté (Polling 1 à 1.5s)
     * et actualise la présence en ligne
     */
    public function pollSignals(): void {
        $user = $this->auth->authenticate();
        $userEmail = strtolower(trim((string)$user['email']));

        // Actualisation automatique de la présence en ligne
        $onlineUsers = $this->recordPresence($userEmail);

        // 1. Récupérer les signaux non consommés pour cet utilisateur
        $stmt = $this->pdo->prepare('
            SELECT id, sender_email, signal_type, payload, created_at
            FROM webrtc_signals
            WHERE recipient_email = ? AND consumed = 0
            ORDER BY id ASC
        ');
        $stmt->execute([$userEmail]);
        $rows = $stmt->fetchAll();

        $signals = [];
        $consumedIds = [];

        foreach ($rows as $row) {
            $consumedIds[] = (int)$row['id'];
            $decoded = json_decode($row['payload'], true);
            if (is_array($decoded)) {
                $signals[] = $decoded;
            }
        }

        // 2. Marquer les signaux comme consommés ou les supprimer
        if (!empty($consumedIds)) {
            $placeholders = implode(',', array_fill(0, count($consumedIds), '?'));
            $stmtUpdate = $this->pdo->prepare("UPDATE webrtc_signals SET consumed = 1 WHERE id IN ($placeholders)");
            $stmtUpdate->execute($consumedIds);
        }

        // 3. Purge automatique des anciens signaux consommés de plus de 2 minutes
        if (random_int(1, 20) === 1) { // 5% des requêtes pour ne pas surcharger
            $twoMinsAgo = date('Y-m-d H:i:s', time() - 120);
            $tenMinsAgo = date('Y-m-d H:i:s', time() - 600);
            $stmtPurge = $this->pdo->prepare('DELETE FROM webrtc_signals WHERE (consumed = 1 AND created_at < ?) OR created_at < ?');
            $stmtPurge->execute([$twoMinsAgo, $tenMinsAgo]);
        }

        Response::json([
            'signals'      => $signals,
            'online_users' => $onlineUsers,
            'timestamp'    => time(),
        ]);
    }

    /**
     * GET ou POST /webrtc/presence
     * Enregistre le battement de cœur (heartbeat) et retourne la liste des utilisateurs en ligne
     */
    public function handlePresence(): void {
        $user = $this->auth->authenticate();
        $userEmail = strtolower(trim((string)$user['email']));
        $onlineUsers = $this->recordPresence($userEmail);

        Response::json([
            'online_users' => $onlineUsers,
            'timestamp'    => time(),
        ]);
    }

    private function recordPresence(string $email): array {
        $now = time();
        try {
            // REPLACE INTO est supporté nativement par SQLite et MySQL
            $stmt = $this->pdo->prepare('REPLACE INTO active_presence (email, last_seen_at) VALUES (?, ?)');
            $stmt->execute([$email, $now]);

            // Nettoyage occasionnel des inactifs (> 60s)
            if (random_int(1, 10) === 1) {
                $offlineThreshold = $now - 60;
                $stmtDel = $this->pdo->prepare('DELETE FROM active_presence WHERE last_seen_at < ?');
                $stmtDel->execute([$offlineThreshold]);
            }

            // Récupération des utilisateurs connectés dans les 10 dernières secondes
            $activeThreshold = $now - 10;
            $stmtActive = $this->pdo->prepare('SELECT email FROM active_presence WHERE last_seen_at >= ?');
            $stmtActive->execute([$activeThreshold]);
            $list = $stmtActive->fetchAll(PDO::FETCH_COLUMN) ?: [];
            return array_values(array_unique(array_map('strtolower', $list)));
        } catch (\Throwable $e) {
            return [$email];
        }
    }

    private function getJsonInput(): array {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }

    private function hasTurnCredentials(array $iceServers): bool {
        foreach ($iceServers as $server) {
            if (!is_array($server) || empty($server['username']) || empty($server['credential'])) {
                continue;
            }

            $urls = $server['urls'] ?? [];
            $urls = is_array($urls) ? $urls : [$urls];
            foreach ($urls as $url) {
                if (is_string($url) && preg_match('/^turns?:/i', $url)) {
                    return true;
                }
            }
        }

        return false;
    }
}
