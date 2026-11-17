<?php
// backend-php/src/Controllers/ContactsController.php

require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Response.php';
require_once __DIR__ . '/../Middleware/AuthMiddleware.php';

class ContactsController {
    private array $config;
    private PDO $pdo;
    private AuthMiddleware $auth;

    public function __construct(array $config) {
        $this->config = $config;
        $this->pdo = Database::getConnection($config);
        $this->auth = new AuthMiddleware($config);
    }

    /**
     * GET /contacts?account=...
     */
    public function list(): void {
        $user = $this->auth->authenticate();
        $ownerId = $user['user_id'];

        $stmt = $this->pdo->prepare('
            SELECT id, contact_email, created_at
            FROM contacts
            WHERE owner_id = ?
            ORDER BY created_at DESC
        ');
        $stmt->execute([$ownerId]);
        $contacts = $stmt->fetchAll();

        Response::json([
            'contacts'  => $contacts ?: [],
            'userEmail' => $user['email'],
        ]);
    }

    /**
     * POST /contacts
     */
    public function add(): void {
        $user = $this->auth->authenticate();
        $ownerId = $user['user_id'];

        $data = $this->getJsonInput();
        $contactEmail = strtolower(trim((string)($data['contactEmail'] ?? '')));

        if (empty($contactEmail) || !filter_var($contactEmail, FILTER_VALIDATE_EMAIL)) {
            Response::error('Adresse e-mail invalide.', 400);
        }

        // Vérifier si le contact existe déjà pour cet utilisateur
        $stmtCheck = $this->pdo->prepare('SELECT id FROM contacts WHERE owner_id = ? AND contact_email = ?');
        $stmtCheck->execute([$ownerId, $contactEmail]);
        if ($stmtCheck->fetch()) {
            Response::error('Ce contact est déjà enregistré.', 409);
        }

        $id = $this->generateUuid();
        $now = date('Y-m-d H:i:s');

        $stmt = $this->pdo->prepare('
            INSERT INTO contacts (id, owner_id, contact_email, created_at)
            VALUES (?, ?, ?, ?)
        ');
        $stmt->execute([$id, $ownerId, $contactEmail, $now]);

        Response::json([
            'contact' => [
                'id'            => $id,
                'contact_email' => $contactEmail,
                'created_at'    => $now,
            ],
        ]);
    }

    /**
     * DELETE /contacts
     */
    public function remove(): void {
        $user = $this->auth->authenticate();
        $ownerId = $user['user_id'];

        $data = $this->getJsonInput();
        $contactId = trim((string)($data['contactId'] ?? ''));

        if (empty($contactId)) {
            Response::error('Identifiant requis.', 400);
        }

        $stmt = $this->pdo->prepare('DELETE FROM contacts WHERE id = ? AND owner_id = ?');
        $stmt->execute([$contactId, $ownerId]);

        Response::json(['success' => true]);
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

