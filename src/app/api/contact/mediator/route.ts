import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { validateEmail, ADMIN_EMAIL } from '@/src/lib/validation';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userEmail, licenseTier, planType, message, submittedAt } = body;

    const emailCheck = validateEmail(userEmail);
    if (!emailCheck.isValid) {
      return NextResponse.json({ error: 'Adresse e-mail de l’expéditeur invalide.' }, { status: 400 });
    }

    if (!message || message.trim().length < 10) {
      return NextResponse.json(
        { error: 'Le message doit contenir au moins 10 caractères.' },
        { status: 400 }
      );
    }

    const readableDate = new Date(submittedAt || Date.now()).toLocaleString('fr-FR', {
      timeZone: 'Europe/Paris',
      dateStyle: 'full',
      timeStyle: 'medium',
    });

    const resolvedTier = ['ad_supported', 'no_ads', 'supporter', 'free', 'legacy'].includes(licenseTier)
      ? licenseTier
      : planType === '7euro'
        ? 'ad_supported'
        : planType === '12euro'
          ? 'no_ads'
          : planType === '50euro'
            ? 'supporter'
            : 'free';
    const planLabel =
      resolvedTier === 'ad_supported'
        ? '7 € / an (Annuelle avec pub)'
        : resolvedTier === 'no_ads'
        ? '12 € / an (Annuelle sans pub)'
        : resolvedTier === 'supporter'
        ? '50 € + (Soutien / À vie VIP)'
        : resolvedTier === 'legacy'
        ? 'Licence active (formule historique)'
        : 'Formule Gratuite (Quota 10 appels)';

    // Envoi de l'e-mail à l'administrateur avec Resend
    const { data, error } = await resend.emails.send({
      from: 'You&Me Médiation <contact@youandme.cloud>',
      to: [ADMIN_EMAIL],
      replyTo: emailCheck.cleanEmail,
      subject: `🚨 [Saisine Médiateur] Demande de ${emailCheck.cleanEmail}`,
      html: `
        <div style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 24px; border-radius: 12px;">
          <h2 style="color: #6366f1; border-bottom: 1px solid #334155; padding-bottom: 12px;">
            ⚖️ Nouvelle Saisine du Médiateur Administrateur
          </h2>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
              <td style="padding: 8px 0; color: #94a3b8; font-weight: bold;">Utilisateur :</td>
              <td style="padding: 8px 0; color: #f8fafc;">${emailCheck.cleanEmail}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #94a3b8; font-weight: bold;">Formule souscrite :</td>
              <td style="padding: 8px 0; color: #38bdf8;">${planLabel}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #94a3b8; font-weight: bold;">Date de la saisine :</td>
              <td style="padding: 8px 0; color: #cbd5e1;">${readableDate}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #94a3b8; font-weight: bold;">Engagement :</td>
              <td style="padding: 8px 0; color: #f59e0b; font-weight: bold;">⏱️ Réponse garantie sous 48h max</td>
            </tr>
          </table>

          <div style="background-color: #1e293b; padding: 16px; border-radius: 8px; border-left: 4px solid #6366f1;">
            <h4 style="margin-top: 0; color: #cbd5e1;">Message / Explication du litige :</h4>
            <p style="white-space: pre-wrap; color: #f1f5f9; line-height: 1.6;">${message.trim()}</p>
          </div>

          <p style="margin-top: 24px; font-size: 12px; color: #64748b;">
            Pour répondre directement à l'utilisateur, faites simplement "Répondre" à cet e-mail.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error('Erreur d’envoi Resend:', error);
      return NextResponse.json({ error: 'Échec de l’envoi du message.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data?.id });
  } catch (err) {
    console.error('Erreur serveur saisine médiateur:', err);
    return NextResponse.json({ error: 'Erreur interne du serveur.' }, { status: 500 });
  }
}