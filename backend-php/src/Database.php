<?php
// backend-php/src/Database.php

class Database {
    private static ?PDO $instance = null;

    public static function getConnection(array $config): PDO {
        if (self::$instance === null) {
            $dbConfig = $config['db'] ?? [];
            $driver = $dbConfig['driver'] ?? 'mysql';

            if ($driver === 'sqlite') {
                $sqliteFile = $dbConfig['file'] ?? (__DIR__ . '/../../storage/yam_local.sqlite');
                $sqliteDir = dirname($sqliteFile);
                if (!is_dir($sqliteDir)) {
                    @mkdir($sqliteDir, 0755, true);
                }

                $dsn = "sqlite:$sqliteFile";
                $options = [
                    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                ];

                try {
                    self::$instance = new PDO($dsn, null, null, $options);
                    self::$instance->exec('PRAGMA foreign_keys = ON;');
                    self::$instance->exec('PRAGMA journal_mode = WAL;');
                    self::$instance->exec('PRAGMA synchronous = NORMAL;');
                    self::ensureSqliteSchema(self::$instance);
                } catch (PDOException $e) {
                    http_response_code(503);
                    header('Content-Type: application/json; charset=utf-8');
                    echo json_encode([
                        'error'   => 'Impossible de se connecter à la base de données SQLite locale.',
                        'details' => $e->getMessage(),
                    ]);
                    exit();
                }
            } else {
                // Moteur MySQL standard pour l'hébergement mutualisé
                $dsn = sprintf(
                    'mysql:host=%s;port=%d;dbname=%s;charset=%s',
                    $dbConfig['host'] ?? 'localhost',
                    $dbConfig['port'] ?? 3306,
                    $dbConfig['database'] ?? 'yam_db',
                    $dbConfig['charset'] ?? 'utf8mb4'
                );

                $options = [
                    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES   => false,
                ];

                try {
                    self::$instance = new PDO($dsn, $dbConfig['username'] ?? 'root', $dbConfig['password'] ?? '', $options);
                } catch (PDOException $e) {
                    http_response_code(503);
                    header('Content-Type: application/json; charset=utf-8');
                    echo json_encode([
                        'error'   => 'Impossible de se connecter à la base de données MySQL.',
                        'details' => $e->getMessage(),
                    ]);
                    exit();
                }
            }
        }

        return self::$instance;
    }

    /**
     * Initialise automatiquement les tables en SQLite local si le fichier est neuf
     */
    private static function ensureSqliteSchema(PDO $pdo): void {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NULL,
                email_confirmed_at DATETIME NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS active_standard_sessions (
                user_id TEXT PRIMARY KEY,
                session_token_hash TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS magic_link_handoffs (
                handoff_id_hash TEXT PRIMARY KEY,
                encrypted_credential TEXT NOT NULL,
                nonce TEXT NOT NULL,
                auth_tag TEXT NOT NULL,
                expires_at DATETIME NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS contacts (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL,
                contact_email TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (owner_id, contact_email),
                FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS user_usage (
                email TEXT PRIMARY KEY,
                usage_count INTEGER DEFAULT 0,
                has_license INTEGER DEFAULT 0,
                license_key TEXT NULL,
                license_tier TEXT DEFAULT 'free',
                license_status TEXT DEFAULT 'inactive',
                licensed_until DATETIME NULL,
                quota_unlimited INTEGER DEFAULT 0,
                advertising_enabled INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS donations (
                id TEXT PRIMARY KEY,
                donor_email TEXT DEFAULT 'Donateur Anonyme',
                amount REAL DEFAULT 0.0,
                stripe_payment_id TEXT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS banners (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                image_url TEXT NOT NULL,
                target_url TEXT NULL,
                active INTEGER DEFAULT 1,
                payment_status TEXT DEFAULT 'unpaid',
                amount_due REAL DEFAULT 0.0,
                display_order INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS connection_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                caller_email TEXT NOT NULL,
                callee_email TEXT NOT NULL,
                status TEXT NOT NULL,
                ip_address TEXT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS webrtc_signals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender_email TEXT NOT NULL,
                recipient_email TEXT NOT NULL,
                signal_type TEXT NOT NULL,
                payload TEXT NOT NULL,
                consumed INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS active_presence (
                email TEXT PRIMARY KEY,
                last_seen_at INTEGER NOT NULL
            );
        ");
    }
}
