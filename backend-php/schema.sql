-- ==============================================================================
-- BASE DE DONNÉES YOUANDME (YAM) - SCHÉMA MYSQL 8.0+ / MariaDB
-- Encodage : utf8mb4_unicode_ci / Moteur : InnoDB
-- ==============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------------------------
-- 1. Table des Utilisateurs (Remplace auth.users de Supabase)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` CHAR(36) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `password_hash` VARCHAR(255) NULL,
  `email_confirmed_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 2. Sessions Utilisateur Actives (Garantit une seule session active à la fois)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `active_standard_sessions` (
  `user_id` CHAR(36) NOT NULL,
  `session_token_hash` VARCHAR(255) NOT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 3. Authentification par Liens Magiques (Magic-links & Handoffs sécurisés)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `magic_link_handoffs` (
  `handoff_id_hash` VARCHAR(191) NOT NULL,
  `encrypted_credential` TEXT NOT NULL,
  `nonce` VARCHAR(64) NOT NULL,
  `auth_tag` VARCHAR(64) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`handoff_id_hash`),
  KEY `idx_magic_link_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 4. Carnet de Contacts
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `contacts` (
  `id` CHAR(36) NOT NULL,
  `owner_id` CHAR(36) NOT NULL,
  `contact_email` VARCHAR(191) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_contacts_owner_contact` (`owner_id`, `contact_email`),
  KEY `idx_contacts_owner` (`owner_id`),
  CONSTRAINT `fk_contacts_owner` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 5. Licences et Quotas d'Utilisation
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_usage` (
  `email` VARCHAR(191) NOT NULL,
  `usage_count` INT NOT NULL DEFAULT 0,
  `has_license` TINYINT(1) NOT NULL DEFAULT 0,
  `license_key` VARCHAR(191) NULL,
  `license_tier` ENUM('free', 'ad_supported', 'no_ads', 'supporter', 'legacy') NOT NULL DEFAULT 'free',
  `license_status` VARCHAR(50) NOT NULL DEFAULT 'inactive',
  `licensed_until` DATETIME NULL,
  `quota_unlimited` TINYINT(1) NOT NULL DEFAULT 0,
  `advertising_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 6. Historique des Dons Stripe
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `donations` (
  `id` CHAR(36) NOT NULL,
  `donor_email` VARCHAR(191) NOT NULL DEFAULT 'Donateur Anonyme',
  `amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `stripe_payment_id` VARCHAR(191) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_donations_created_at` (`created_at`),
  KEY `idx_donations_stripe_id` (`stripe_payment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 7. Bannières Publicitaires (Panneau d'administration)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `banners` (
  `id` CHAR(36) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `image_url` TEXT NOT NULL,
  `target_url` TEXT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `payment_status` VARCHAR(50) NOT NULL DEFAULT 'unpaid',
  `amount_due` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `display_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_banners_active` (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 8. Journal des Connexions (Logs d'appels / sécurité)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `connection_logs` (
  `id` BIGINT AUTO_INCREMENT NOT NULL,
  `caller_email` VARCHAR(191) NOT NULL,
  `callee_email` VARCHAR(191) NOT NULL,
  `status` VARCHAR(50) NOT NULL,
  `ip_address` VARCHAR(45) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_logs_caller` (`caller_email`),
  KEY `idx_logs_callee` (`callee_email`),
  KEY `idx_logs_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 9. Table de Signalement WebRTC (Pour l'option 100% PHP/MySQL)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `webrtc_signals` (
  `id` BIGINT AUTO_INCREMENT NOT NULL,
  `sender_email` VARCHAR(191) NOT NULL,
  `recipient_email` VARCHAR(191) NOT NULL,
  `signal_type` VARCHAR(50) NOT NULL,
  `payload` MEDIUMTEXT NOT NULL,
  `consumed` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_signals_recipient` (`recipient_email`, `consumed`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 10. Table de Présence en Ligne (Temps réel sans WebSocket)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `active_presence` (
  `email` VARCHAR(191) NOT NULL,
  `last_seen_at` INT NOT NULL,
  PRIMARY KEY (`email`),
  KEY `idx_presence_last_seen` (`last_seen_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

