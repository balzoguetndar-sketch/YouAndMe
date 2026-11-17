<?php
// backend-php/src/Services/TokenService.php

class TokenService {
    private string $secret;
    private int $ttl;

    public function __construct(array $config) {
        $this->secret = $config['app']['secret_key'] ?? 'yam_fallback_secret_change_me';
        $this->ttl = $config['app']['token_ttl'] ?? (86400 * 30);
    }

    /**
     * Génère un jeton sécurisé signé avec HMAC-SHA256
     */
    public function createToken(array $payload): string {
        $header = ['alg' => 'HS256', 'typ' => 'JWT'];
        
        if (!isset($payload['iat'])) {
            $payload['iat'] = time();
        }
        if (!isset($payload['exp'])) {
            $payload['exp'] = time() + $this->ttl;
        }

        $base64UrlHeader = self::base64UrlEncode(json_encode($header));
        $base64UrlPayload = self::base64UrlEncode(json_encode($payload));

        $signature = hash_hmac('sha256', "$base64UrlHeader.$base64UrlPayload", $this->secret, true);
        $base64UrlSignature = self::base64UrlEncode($signature);

        return "$base64UrlHeader.$base64UrlPayload.$base64UrlSignature";
    }

    /**
     * Vérifie et décode un jeton signé
     */
    public function verifyToken(string $jwt): ?array {
        $parts = explode('.', $jwt);
        if (count($parts) !== 3) {
            return null;
        }

        [$headerB64, $payloadB64, $sigB64] = $parts;

        $expectedSig = hash_hmac('sha256', "$headerB64.$payloadB64", $this->secret, true);
        $providedSig = self::base64UrlDecode($sigB64);

        if (!hash_equals($expectedSig, $providedSig)) {
            return null; // Signature invalide
        }

        $payload = json_decode(self::base64UrlDecode($payloadB64), true);
        if (!is_array($payload)) {
            return null;
        }

        // Vérification de l'expiration
        if (isset($payload['exp']) && $payload['exp'] < time()) {
            return null; // Expiré
        }

        return $payload;
    }

    private static function base64UrlEncode(string $data): string {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function base64UrlDecode(string $data): string {
        return base64_decode(strtr($data, '-_', '+/'));
    }
}

