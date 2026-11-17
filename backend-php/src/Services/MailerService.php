<?php
// backend-php/src/Services/MailerService.php

class MailerService {
    private array $config;

    public function __construct(array $config) {
        $this->config = $config['smtp'] ?? [];
    }

    /**
     * Envoie un email au format HTML/Texte via SMTP direct (sans dépendance externe)
     */
    public function send(string $toEmail, string $subject, string $htmlBody, string $textBody = ''): array {
        $host = $this->config['host'] ?? '';
        $port = (int)($this->config['port'] ?? 465);
        $user = $this->config['username'] ?? '';
        $pass = $this->config['password'] ?? '';
        $fromEmail = $this->config['from_email'] ?? $user;
        $fromName = $this->config['from_name'] ?? 'You & Me';

        // Si le mot de passe SMTP n'est pas encore configuré (mode dev / test)
        if (empty($host) || empty($user) || empty($pass)) {
            $this->logLocalMail($toEmail, $subject, $textBody ?: strip_tags($htmlBody));
            return [
                'sent'    => false,
                'reason'  => 'smtp_not_configured',
                'message' => 'SMTP non configuré. Le message a été consigné localement.',
            ];
        }

        try {
            $socketHost = ($port === 465) ? "ssl://$host" : $host;
            $socket = @fsockopen($socketHost, $port, $errno, $errstr, 15);
            if (!$socket) {
                throw new Exception("Impossible de se connecter au serveur SMTP ($errstr)");
            }

            $this->expectResponse($socket, 220);

            // EHLO
            $this->sendCommand($socket, 'EHLO ' . gethostname());
            $this->expectResponse($socket, 250);

            // STARTTLS si port 587
            if ($port === 587) {
                $this->sendCommand($socket, 'STARTTLS');
                $this->expectResponse($socket, 220);
                stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT);
                $this->sendCommand($socket, 'EHLO ' . gethostname());
                $this->expectResponse($socket, 250);
            }

            // AUTH LOGIN
            $this->sendCommand($socket, 'AUTH LOGIN');
            $this->expectResponse($socket, 334);
            $this->sendCommand($socket, base64_encode($user));
            $this->expectResponse($socket, 334);
            $this->sendCommand($socket, base64_encode($pass));
            $this->expectResponse($socket, 235);

            // MAIL FROM & RCPT TO
            $this->sendCommand($socket, "MAIL FROM:<$fromEmail>");
            $this->expectResponse($socket, 250);
            $this->sendCommand($socket, "RCPT TO:<$toEmail>");
            $this->expectResponse($socket, 250);

            // DATA
            $this->sendCommand($socket, 'DATA');
            $this->expectResponse($socket, 354);

            $boundary = '=_yam_' . md5(uniqid((string)time(), true));
            $headers = [
                "From: =?UTF-8?B?" . base64_encode($fromName) . "?= <$fromEmail>",
                "To: <$toEmail>",
                "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=",
                "MIME-Version: 1.0",
                "Content-Type: multipart/alternative; boundary=\"$boundary\"",
                "Date: " . date('r'),
            ];

            $message = implode("\r\n", $headers) . "\r\n\r\n";
            if ($textBody) {
                $message .= "--$boundary\r\n";
                $message .= "Content-Type: text/plain; charset=UTF-8\r\n";
                $message .= "Content-Transfer-Encoding: base64\r\n\r\n";
                $message .= chunk_split(base64_encode($textBody)) . "\r\n";
            }
            $message .= "--$boundary\r\n";
            $message .= "Content-Type: text/html; charset=UTF-8\r\n";
            $message .= "Content-Transfer-Encoding: base64\r\n\r\n";
            $message .= chunk_split(base64_encode($htmlBody)) . "\r\n";
            $message .= "--$boundary--\r\n.";

            $this->sendCommand($socket, $message);
            $this->expectResponse($socket, 250);

            $this->sendCommand($socket, 'QUIT');
            fclose($socket);

            return ['sent' => true, 'message' => 'Email envoyé avec succès.'];
        } catch (Throwable $e) {
            $this->logLocalMail($toEmail, $subject, $textBody ?: strip_tags($htmlBody));
            return [
                'sent'    => false,
                'reason'  => 'smtp_error',
                'message' => 'Erreur SMTP : ' . $e->getMessage(),
            ];
        }
    }

    private function sendCommand($socket, string $command): void {
        fwrite($socket, $command . "\r\n");
    }

    private function expectResponse($socket, int $expectedCode): string {
        $response = '';
        while ($line = fgets($socket, 515)) {
            $response .= $line;
            if (isset($line[3]) && $line[3] === ' ') break;
        }
        $code = (int)substr($response, 0, 3);
        if ($code !== $expectedCode) {
            throw new Exception("Réponse SMTP inattendue ($code) : $response");
        }
        return $response;
    }

    private function logLocalMail(string $to, string $subject, string $body): void {
        $dir = __DIR__ . '/../../storage/logs';
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        $logFile = $dir . '/mail.log';
        $entry = sprintf(
            "[%s] À : %s | Sujet : %s\nMessage :\n%s\n----------------------------------------\n",
            date('Y-m-d H:i:s'),
            $to,
            $subject,
            $body
        );
        @file_put_contents($logFile, $entry, FILE_APPEND);
    }
}

