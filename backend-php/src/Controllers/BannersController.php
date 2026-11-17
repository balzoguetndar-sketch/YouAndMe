<?php
// backend-php/src/Controllers/BannersController.php

require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Response.php';
require_once __DIR__ . '/../Middleware/AuthMiddleware.php';

class BannersController {
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
     * GET /banners
     * Récupère les bannières actives pour l'affichage public
     */
    public function listPublic(): void {
        $stmt = $this->pdo->query('
            SELECT id, title, image_url, target_url, display_order
            FROM banners
            WHERE active = 1
            ORDER BY display_order ASC, created_at DESC
        ');
        $banners = $stmt->fetchAll();

        Response::json(['banners' => $banners ?: []]);
    }

    /**
     * GET /admin/banners
     * Récupère toutes les bannières pour le panneau d'administration
     */
    public function listAdmin(): void {
        $this->requireAdmin();

        $stmt = $this->pdo->query('SELECT * FROM banners ORDER BY created_at DESC');
        $banners = $stmt->fetchAll();

        Response::json(['banners' => $banners ?: []]);
    }

    /**
     * POST /admin/banners
     */
    public function create(): void {
        $this->requireAdmin();

        $data = $this->getJsonInput();
        $title = trim((string)($data['title'] ?? ''));
        $imageUrl = trim((string)($data['image_url'] ?? ''));
        $targetUrl = trim((string)($data['target_url'] ?? ''));
        $amountDue = (float)($data['amount_due'] ?? 0.0);
        $active = isset($data['active']) ? (int)(bool)$data['active'] : 1;

        if (empty($title) || empty($imageUrl)) {
            Response::error('Titre et URL de l’image requis.', 400);
        }

        $id = $this->generateUuid();
        $now = date('Y-m-d H:i:s');
        $stmt = $this->pdo->prepare('
            INSERT INTO banners (id, title, image_url, target_url, active, amount_due, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ');
        $stmt->execute([$id, $title, $imageUrl, $targetUrl ?: null, $active, $amountDue, $now, $now]);

        Response::json(['success' => true, 'id' => $id]);
    }

    /**
     * PUT /admin/banners
     */
    public function update(): void {
        $this->requireAdmin();

        $data = $this->getJsonInput();
        $id = trim((string)($data['id'] ?? ''));

        if (empty($id)) {
            Response::error('Identifiant de la bannière requis.', 400);
        }

        $fields = [];
        $params = [];

        if (isset($data['title'])) {
            $fields[] = 'title = ?';
            $params[] = trim((string)$data['title']);
        }
        if (isset($data['image_url'])) {
            $fields[] = 'image_url = ?';
            $params[] = trim((string)$data['image_url']);
        }
        if (isset($data['target_url'])) {
            $fields[] = 'target_url = ?';
            $params[] = trim((string)$data['target_url']);
        }
        if (isset($data['active'])) {
            $fields[] = 'active = ?';
            $params[] = (int)(bool)$data['active'];
        }
        if (isset($data['payment_status'])) {
            $fields[] = 'payment_status = ?';
            $params[] = trim((string)$data['payment_status']);
        }

        if (empty($fields)) {
            Response::error('Aucun champ à mettre à jour.', 400);
        }

        $fields[] = 'updated_at = ?';
        $params[] = date('Y-m-d H:i:s');
        $params[] = $id;

        $sql = 'UPDATE banners SET ' . implode(', ', $fields) . ' WHERE id = ?';
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);

        Response::json(['success' => true]);
    }

    /**
     * DELETE /admin/banners
     */
    public function delete(): void {
        $this->requireAdmin();

        $data = $this->getJsonInput();
        $id = trim((string)($data['id'] ?? ''));

        if (empty($id)) {
            Response::error('Identifiant requis.', 400);
        }

        $stmt = $this->pdo->prepare('DELETE FROM banners WHERE id = ?');
        $stmt->execute([$id]);

        Response::json(['success' => true]);
    }

    private function requireAdmin(): array {
        $user = $this->auth->authenticate();
        if ($user['email'] !== $this->adminEmail) {
            Response::error('Accès refusé. Administrateur requis.', 403);
        }
        return $user;
    }

    private function getJsonInput(): array {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }

    private function generateUuid(): string {
        $data = random_bytes(16);
        $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
        $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }
}

