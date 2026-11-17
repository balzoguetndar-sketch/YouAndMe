<?php
// backend-php/src/Controllers/StripeController.php

require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Response.php';
require_once __DIR__ . '/../Middleware/AuthMiddleware.php';

class StripeController {
    private array $config;
    private PDO $pdo;
    private AuthMiddleware $auth;

    public function __construct(array $config) {
        $this->config = $config;
        $this->pdo = Database::getConnection($config);
        $this->auth = new AuthMiddleware($config);
    }

    /**
     * POST /checkout
     * Crée une session Stripe Checkout via l'API REST officielle de Stripe
     */
    public function createCheckoutSession(): void {
        $user = $this->auth->authenticate();
        $email = $user['email'];

        $secretKey = $this->config['stripe']['secret_key'] ?? '';
        if (empty($secretKey)) {
            Response::error('Clé Stripe serveur non configurée.', 503);
        }

        $data = $this->getJsonInput();
        $supportAmount = isset($data['supportAmount']) ? (int)$data['supportAmount'] : null;
        $frontendUrl = $this->config['cors']['allowed_origins'][0] ?? 'https://votre-projet.vercel.app';

        $postFields = [
            'success_url'                  => rtrim($frontendUrl, '/') . '/?payment=success&session_id={CHECKOUT_SESSION_ID}',
            'cancel_url'                   => rtrim($frontendUrl, '/') . '/?payment=cancelled',
            'customer_email'               => $email,
            'mode'                         => 'payment',
            'metadata[user_email]'         => $email,
        ];

        if ($supportAmount !== null) {
            if ($supportAmount < 50 || $supportAmount > 999999) {
                Response::error('Le soutien doit être un montant compris entre 50 € et 999 999 €.', 400);
            }
            $postFields['line_items[0][price_data][currency]'] = 'eur';
            $postFields['line_items[0][price_data][product_data][name]'] = 'Soutien au projet You&Me';
            $postFields['line_items[0][price_data][unit_amount]'] = $supportAmount * 100;
            $postFields['line_items[0][quantity]'] = 1;
            $postFields['metadata[plan]'] = 'supporter';
        } else {
            $priceId = trim((string)($data['priceId'] ?? ''));
            if (empty($priceId)) {
                Response::error('Formule invalide.', 400);
            }
            $postFields['line_items[0][price]'] = $priceId;
            $postFields['line_items[0][quantity]'] = 1;
        }

        // Appel direct à l'API Stripe en cURL (sans dépendance externe)
        $ch = curl_init('https://api.stripe.com/v1/checkout/sessions');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($postFields));
        curl_setopt($ch, CURLOPT_USERPWD, $secretKey . ':');
        curl_setopt($ch, CURLOPT_TIMEOUT, 20);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $json = json_decode((string)$response, true);
        if ($httpCode !== 200 || empty($json['url'])) {
            $errorMsg = $json['error']['message'] ?? 'Erreur lors de la création de la session Stripe.';
            Response::error($errorMsg, 500);
        }

        Response::json([
            'sessionId' => $json['id'],
            'url'       => $json['url'],
        ]);
    }

    /**
     * POST /webhooks/stripe
     * Reçoit les événements validés de Stripe
     */
    public function handleWebhook(): void {
        $payload = file_get_contents('php://input');
        $sigHeader = $_SERVER['HTTP_STRIPE_SIGNATURE'] ?? '';
        $webhookSecret = $this->config['stripe']['webhook_secret'] ?? '';

        $event = json_decode($payload, true);
        if (!is_array($event) || empty($event['type'])) {
            Response::error('Payload webhook invalide.', 400);
        }

        // Si le secret webhook est configuré, on valide la signature HMAC SHA256
        if (!empty($webhookSecret) && !empty($sigHeader)) {
            if (!$this->verifyStripeSignature($payload, $sigHeader, $webhookSecret)) {
                Response::error('Signature Stripe invalide.', 400);
            }
        }

        if ($event['type'] === 'checkout.session.completed') {
            $session = $event['data']['object'] ?? [];
            $customerEmail = strtolower(trim((string)($session['metadata']['user_email'] ?? $session['customer_details']['email'] ?? '')));
            $plan = $session['metadata']['plan'] ?? 'supporter';
            $amountTotal = ((float)($session['amount_total'] ?? 0)) / 100.0;
            $paymentId = $session['payment_intent'] ?? $session['id'] ?? null;

            if (!empty($customerEmail)) {
                $now = date('Y-m-d H:i:s');
                // 1. Mise à jour de la licence dans user_usage
                $stmt = $this->pdo->prepare('
                    REPLACE INTO user_usage (
                        email, has_license, license_key, license_tier,
                        license_status, quota_unlimited, advertising_enabled, updated_at
                    ) VALUES (
                        ?, 1, "stripe-supporter", ?, "active", 1, 0, ?
                    )
                ');
                $stmt->execute([$customerEmail, $plan, $now]);

                // 2. Enregistrement dans la table des dons
                $stmtDonation = $this->pdo->prepare('
                    INSERT INTO donations (id, donor_email, amount, stripe_payment_id, created_at)
                    VALUES (?, ?, ?, ?, ?)
                ');
                $stmtDonation->execute([$this->generateUuid(), $customerEmail, $amountTotal, $paymentId, $now]);
            }
        }

        Response::json(['received' => true]);
    }

    private function verifyStripeSignature(string $payload, string $sigHeader, string $secret): bool {
        $timestamp = null;
        $signatures = [];

        foreach (explode(',', $sigHeader) as $item) {
            $parts = explode('=', trim($item), 2);
            if (count($parts) === 2) {
                if ($parts[0] === 't') $timestamp = $parts[1];
                if ($parts[0] === 'v1') $signatures[] = $parts[1];
            }
        }

        if (!$timestamp || empty($signatures)) return false;
        if (abs(time() - (int)$timestamp) > 300) return false; // Décalage max 5 minutes

        $signedPayload = "$timestamp.$payload";
        $expectedSignature = hash_hmac('sha256', $signedPayload, $secret);

        foreach ($signatures as $sig) {
            if (hash_equals($expectedSignature, $sig)) {
                return true;
            }
        }
        return false;
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
