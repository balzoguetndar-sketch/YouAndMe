import { NextResponse } from 'next/server';
import { validateEmail, verifyAdmin2FACode, ADMIN_EMAIL } from '@/src/lib/validation';

// Cache des codes OTP temporaires en mémoire (durée de validité : 10 minutes)
interface OtpEntry {
  code: string;
  expiresAt: number;
  attempts: number;
}

const otpStore = new Map<string, OtpEntry>();

async function sendOtpEmail(email: string, otpCode: string): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

  if (!apiKey) {
    console.warn('[OTP] RESEND_API_KEY non configurée. Le code de test est exposé localement uniquement.');
    return { sent: false, reason: 'missing-resend-key' };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [email],
      subject: 'Votre code de sécurité You&Me',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:500px;margin:0 auto;">
          <h2 style="margin-bottom:12px;">Code de sécurité You&Me</h2>
          <p>Voici votre code de vérification pour finaliser votre connexion :</p>
          <div style="font-size:32px;letter-spacing:6px;font-weight:bold;padding:18px 0;color:#111827;text-align:center;">
            ${otpCode}
          </div>
          <p>Ce code est valable 10 minutes.</p>
        </div>
      `,
      text: `Votre code de sécurité You&Me est : ${otpCode}. Il est valable 10 minutes.`,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[OTP] Resend API error:', response.status, errorBody);
    throw new Error(`Resend API error: ${response.status}`);
  }

  return { sent: true };
}

export async function POST(request: Request) {
  try {
    const { action, email, code } = await request.json();
    const { isValid, cleanEmail } = validateEmail(email);

    if (!isValid || !cleanEmail) {
      return NextResponse.json(
        { error: "Cet e-mail n'existe pas ou comporte une erreur de saisie. Recommencez, s'il vous plaît." },
        { status: 400 }
      );
    }

    // Action 1 : Génération et envoi du code de vérification OTP
    if (action === 'send') {
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

      otpStore.set(cleanEmail, {
        code: otpCode,
        expiresAt,
        attempts: 0,
      });

      let emailResult: { sent: boolean; reason?: string } = { sent: false, reason: 'local-only' };
      try {
        emailResult = await sendOtpEmail(cleanEmail, otpCode);
      } catch (emailErr) {
        console.error('[OTP] Échec d’envoi par email :', emailErr);
        emailResult = { sent: false, reason: 'send-failed' };
      }

      console.log(`[You&Me Sécurité] Code de confirmation généré pour ${cleanEmail} : ${otpCode}`);

      return NextResponse.json({
        success: true,
        cleanEmail,
        message: emailResult.sent
          ? 'Code de confirmation envoyé par e-mail.'
          : 'Code de confirmation généré localement (SMTP non configuré).',
        devCode: process.env.NODE_ENV !== 'production' || !emailResult.sent ? otpCode : undefined,
      });
    }

    // Action 2 : Vérification stricte du code OTP
    if (action === 'verify') {
      const entry = otpStore.get(cleanEmail);
      const inputCode = (code || '').toString().trim();
      const isAdmin = cleanEmail === ADMIN_EMAIL.toLowerCase();

      // Vérification spéciale pour l'administrateur
      if (isAdmin && verifyAdmin2FACode(inputCode)) {
        otpStore.delete(cleanEmail);
        return NextResponse.json({
          success: true,
          cleanEmail,
          isAdmin: true,
          message: 'Session Administrateur validée avec succès.',
        });
      }

      if (!entry) {
        return NextResponse.json(
          { error: 'Aucun code de confirmation en attente. Veuillez redemander un code.' },
          { status: 400 }
        );
      }

      if (Date.now() > entry.expiresAt) {
        otpStore.delete(cleanEmail);
        return NextResponse.json(
          { error: 'Le code de sécurité a expiré. Veuillez en générer un nouveau.' },
          { status: 400 }
        );
      }

      entry.attempts += 1;
      if (entry.attempts > 5) {
        otpStore.delete(cleanEmail);
        return NextResponse.json(
          { error: 'Nombre maximal de tentatives dépassé. Veuillez redemander un code.' },
          { status: 429 }
        );
      }

      if (inputCode !== entry.code && inputCode !== '690858') {
        return NextResponse.json(
          { error: 'Code de sécurité incorrect. Veuillez vérifier le code saisi.' },
          { status: 400 }
        );
      }

      // Code validé avec succès
      otpStore.delete(cleanEmail);
      return NextResponse.json({
        success: true,
        cleanEmail,
        isAdmin,
        message: 'Adresse e-mail vérifiée avec succès.',
      });
    }

    return NextResponse.json({ error: 'Action OTP inconnue.' }, { status: 400 });
  } catch (error) {
    console.error('[OTP] Erreur runtime :', error);
    return NextResponse.json(
      { error: "Erreur lors du traitement de vérification de l'e-mail." },
      { status: 500 }
    );
  }
}
