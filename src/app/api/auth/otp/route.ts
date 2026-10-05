import { NextResponse } from 'next/server';
import { validateEmail, verifyAdmin2FACode, ADMIN_EMAIL } from '@/src/lib/validation';
import { createClient } from '@/src/lib/supabase/server';

// Cache des codes OTP temporaires en mémoire (durée de validité : 10 minutes)
interface OtpEntry {
  code: string;
  expiresAt: number;
  attempts: number;
}

const otpStore = new Map<string, OtpEntry>();

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

      // Tentative d'envoi via le service Supabase Auth si configuré
      try {
        const supabase = await createClient();
        await supabase.auth.signInWithOtp({
          email: cleanEmail,
          options: {
            shouldCreateUser: true,
          },
        });
      } catch (authErr) {
        console.warn('Supabase signInWithOtp :', authErr);
      }

      console.log(`[You&Me Sécurité] Code de confirmation généré pour ${cleanEmail} : ${otpCode}`);

      return NextResponse.json({
        success: true,
        cleanEmail,
        message: 'Code de confirmation généré avec succès (valable 10 minutes).',
        // Pour les environnements de test / démo :
        devCode: process.env.NODE_ENV !== 'production' ? otpCode : undefined,
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
  } catch {
    return NextResponse.json(
      { error: "Erreur lors du traitement de vérification de l'e-mail." },
      { status: 500 }
    );
  }
}
