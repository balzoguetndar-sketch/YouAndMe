<?php
// backend-php/src/Controllers/UsageController.php

require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Response.php';
require_once __DIR__ . '/../Middleware/AuthMiddleware.php';

class UsageController {
    private const MAX_FREE_USAGES = 10;
    private const MASTER_LICENSE_KEYS = [
        'YAM-LIFE-2026-VIP',
        'YAM-PRO-2026-LIFE',
        'BALZOG-VIP-ACCESS-2026',
    ];

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
     * GET /usage
     */
    public function getUsage(): void {
        $user = $this->auth->authenticate();
        $email = $user['email'];

        $row = $this->getUsageRow($email);
        $usageInfo = $this->computeUsageInfo($email, $row);

        Response::json(['usage' => $usageInfo]);
    }

    /**
     * POST /usage
     */
    public function handleUsage(): void {
        $user = $this->auth->authenticate();
        $email = $user['email'];

        $data = $this->getJsonInput();
        $action = $data['action'] ?? '';

        // 1. Activation d'une clé de licence
        if ($action === 'activate-license') {
            $key = strtoupper(trim((string)($data['key'] ?? '')));
            $isMaster = in_array($key, self::MASTER_LICENSE_KEYS, true);
            $isValidFormat = preg_match('/^YAM-[A-Z0-9]{4}-[A-Z0-9]{4}$/', $key);

            if (!$isMaster && !$isValidFormat) {
                Response::error('Format de clé de licence invalide.', 400);
            }

            $tier = $isMaster ? 'supporter' : 'legacy';
            $now = date('Y-m-d H:i:s');
            $stmt = $this->pdo->prepare('
                REPLACE INTO user_usage (
                    email, usage_count, has_license, license_key, license_tier,
                    license_status, quota_unlimited, advertising_enabled, updated_at
                ) VALUES (
                    ?, 0, 1, ?, ?, "active", 1, 0, ?
                )
            ');
            $stmt->execute([$email, $key, $tier, $now]);

            Response::json(['success' => true, 'message' => 'Licence activée avec succès.']);
        }

        // 2. Consommation d'un appel (Incrémentation quota)
        if ($action === 'consume') {
            if ($email === $this->adminEmail) {
                Response::json([
                    'usage'   => $this->computeUsageInfo($email, null),
                    'allowed' => true,
                ]);
            }

            $row = $this->getUsageRow($email);
            $usageInfo = $this->computeUsageInfo($email, $row);

            if ($usageInfo['isLocked']) {
                Response::json([
                    'usage'   => $usageInfo,
                    'allowed' => false,
                    'error'   => 'Quota gratuit épuisé.',
                ], 409);
            }

            // Incrémenter en base
            $now = date('Y-m-d H:i:s');
            $stmt = $this->pdo->prepare('SELECT usage_count FROM user_usage WHERE email = ?');
            $stmt->execute([$email]);
            $existing = $stmt->fetch();
            if ($existing) {
                $stmtUpdate = $this->pdo->prepare('UPDATE user_usage SET usage_count = usage_count + 1, updated_at = ? WHERE email = ?');
                $stmtUpdate->execute([$now, $email]);
            } else {
                $stmtInsert = $this->pdo->prepare('INSERT INTO user_usage (email, usage_count, has_license, updated_at) VALUES (?, 1, 0, ?)');
                $stmtInsert->execute([$email, $now]);
            }

            $updatedRow = $this->getUsageRow($email);
            Response::json([
                'usage'   => $this->computeUsageInfo($email, $updatedRow),
                'allowed' => true,
            ]);
        }

        Response::error('Action invalide.', 400);
    }

    private function getUsageRow(string $email): ?array {
        $stmt = $this->pdo->prepare('SELECT * FROM user_usage WHERE email = ?');
        $stmt->execute([$email]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    private function computeUsageInfo(string $email, ?array $row): array {
        $isAdmin = ($email === $this->adminEmail);
        $hasLicense = (bool)($row['has_license'] ?? false) || $isAdmin;
        $quotaUnlimited = (bool)($row['quota_unlimited'] ?? false) || $isAdmin;
        $usageCount = (int)($row['usage_count'] ?? 0);
        $remaining = $quotaUnlimited ? 999999 : max(0, self::MAX_FREE_USAGES - $usageCount);
        $isLocked = !$quotaUnlimited && ($usageCount >= self::MAX_FREE_USAGES);

        return [
            'email'              => $email,
            'usageCount'         => $usageCount,
            'remainingUsages'    => $remaining,
            'hasLicense'         => $hasLicense,
            'licenseKey'         => $row['license_key'] ?? null,
            'licenseTier'        => $isAdmin ? 'supporter' : ($row['license_tier'] ?? 'free'),
            'licenseStatus'      => $isAdmin ? 'active' : ($row['license_status'] ?? 'inactive'),
            'quotaUnlimited'     => $quotaUnlimited,
            'isUnlimited'        => $quotaUnlimited,
            'isLocked'           => $isLocked,
            'advertisingEnabled' => $isAdmin ? false : (bool)($row['advertising_enabled'] ?? true),
        ];
    }

    private function getJsonInput(): array {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }
}

