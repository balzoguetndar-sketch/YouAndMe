<?php
// backend-php/src/Controllers/FilesController.php

require_once __DIR__ . '/../Response.php';
require_once __DIR__ . '/../Middleware/AuthMiddleware.php';

class FilesController {
    private const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 Mo

    private array $config;
    private AuthMiddleware $auth;

    public function __construct(array $config) {
        $this->config = $config;
        $this->auth = new AuthMiddleware($config);
    }

    /**
     * POST /collaboration/files
     */
    public function upload(): void {
        $user = $this->auth->authenticate();
        $senderEmail = $user['email'];

        if (empty($_FILES['file'])) {
            Response::error('Aucun fichier reçu.', 400);
        }

        $file = $_FILES['file'];
        if ($file['error'] !== UPLOAD_ERR_OK) {
            Response::error('Erreur lors du transfert du fichier.', 400);
        }

        if ($file['size'] > self::MAX_FILE_SIZE) {
            Response::error('Le fichier dépasse la taille maximale autorisée (2 Mo).', 400);
        }

        $targetEmail = strtolower(trim((string)($_POST['targetEmail'] ?? '')));
        if (empty($targetEmail)) {
            Response::error('Destinataire requis.', 400);
        }

        $room = $this->getRoomFolder($senderEmail, $targetEmail);
        $dir = __DIR__ . '/../../storage/files/' . $room;
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }

        $origName = basename((string)$file['name']);
        $safeName = preg_replace('/[^a-zA-Z0-9_\-\.]/', '_', $origName) ?: 'fichier';
        $fileId = bin2hex(random_bytes(8));
        $destPath = $dir . '/' . $fileId . '_' . $safeName;

        if (!move_uploaded_file($file['tmp_name'], $destPath)) {
            Response::error('Impossible d’enregistrer le fichier.', 500);
        }

        $frontendUrl = $this->config['cors']['allowed_origins'][0] ?? '';
        $downloadUrl = "/api/collaboration/files?room=" . urlencode($room) . "&file=" . urlencode($fileId . '_' . $safeName);

        Response::json([
            'success'     => true,
            'fileName'    => $safeName,
            'fileSize'    => $file['size'],
            'downloadUrl' => $downloadUrl,
        ]);
    }

    /**
     * GET /collaboration/files
     */
    public function download(): void {
        $user = $this->auth->authenticate();
        $userEmail = $user['email'];

        $room = basename((string)($_GET['room'] ?? ''));
        $fileName = basename((string)($_GET['file'] ?? ''));

        if (empty($room) || empty($fileName)) {
            Response::error('Paramètres de téléchargement invalides.', 400);
        }

        $filePath = __DIR__ . '/../../storage/files/' . $room . '/' . $fileName;
        if (!file_exists($filePath)) {
            Response::error('Fichier introuvable ou expiré.', 404);
        }

        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="' . addslashes($fileName) . '"');
        header('Content-Length: ' . filesize($filePath));
        readfile($filePath);
        exit();
    }

    private function getRoomFolder(string $email1, string $email2): string {
        $k1 = hash('sha256', $email1);
        $k2 = hash('sha256', $email2);
        $keys = [$k1, $k2];
        sort($keys);
        return $keys[0] . '--' . $keys[1];
    }
}

