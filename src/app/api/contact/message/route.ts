import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { validateEmail } from '@/src/lib/validation';

const resend = new Resend(process.env.RESEND_API_KEY);
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const AUDIO_EXTENSIONS: Record<string, string> = {
  'audio/aac': 'aac',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { senderEmail, recipientEmail, subject, message, audio } = body;

    // Validation des champs
    const senderCheck = validateEmail(senderEmail);
    if (!senderCheck.isValid) {
      return NextResponse.json({ error: 'Adresse e-mail expéditeur invalide.' }, { status: 400 });
    }

    const recipientCheck = validateEmail(recipientEmail);
    if (!recipientCheck.isValid) {
      return NextResponse.json({ error: 'Adresse e-mail destinataire invalide.' }, { status: 400 });
    }

    const hasAudio = audio !== null && typeof audio === 'object';
    let audioAttachment: { filename: string; content: string } | null = null;

    if (hasAudio) {
      const audioBase64 = typeof audio.base64 === 'string' ? audio.base64 : '';
      const audioType = typeof audio.contentType === 'string'
        ? audio.contentType.split(';')[0].trim().toLowerCase()
        : '';
      const extension = AUDIO_EXTENSIONS[audioType];
      const validBase64 = audioBase64.length > 0 && audioBase64.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(audioBase64);

      if (!extension || !validBase64) {
        return NextResponse.json({ error: 'Fichier audio invalide ou format non pris en charge.' }, { status: 400 });
      }

      const audioBuffer = Buffer.from(audioBase64, 'base64');
      if (audioBuffer.byteLength === 0 || audioBuffer.byteLength > MAX_AUDIO_BYTES) {
        return NextResponse.json({ error: 'L’enregistrement audio doit faire 2 Mio maximum.' }, { status: 413 });
      }

      audioAttachment = {
        filename: `message-audio.${extension}`,
        content: audioBase64,
      };
    }

    if (!hasAudio && (typeof message !== 'string' || message.trim().length < 5)) {
      return NextResponse.json(
        { error: 'Le message doit contenir au moins 5 caractères.' },
        { status: 400 }
      );
    }

    const cleanSubject = subject?.trim() || 'Message You&Me';
    const messageBody = typeof message === 'string' && message.trim()
      ? message.trim()
      : 'Vous avez reçu un message audio en pièce jointe.';

    const readableDate = new Date().toLocaleString('fr-FR', {
      timeZone: 'Europe/Paris',
      dateStyle: 'full',
      timeStyle: 'short',
    });

    // Envoi du message au destinataire via Resend
    const { data, error } = await resend.emails.send({
      from: 'You&Me Messages <noreply@youandme.cloud>',
      to: [recipientCheck.cleanEmail],
      replyTo: senderCheck.cleanEmail,
      subject: `💬 ${cleanSubject} — via You&Me`,
      attachments: audioAttachment ? [audioAttachment] : undefined,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 32px; border-radius: 16px; max-width: 600px; margin: 0 auto;">
          
          <!-- En-tête -->
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #1e293b;">
            <div style="width: 44px; height: 44px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 22px;">
              💬
            </div>
            <div>
              <h1 style="margin: 0; font-size: 18px; font-weight: 700; color: #fff;">You&amp;Me</h1>
              <p style="margin: 0; font-size: 12px; color: #64748b;">Message de votre réseau</p>
            </div>
          </div>

          <!-- Expéditeur -->
          <div style="background: #1e293b; border-radius: 10px; padding: 14px 18px; margin-bottom: 16px; border-left: 3px solid #6366f1;">
            <p style="margin: 0 0 4px; font-size: 11px; font-weight: 600; color: #6366f1; text-transform: uppercase; letter-spacing: 0.05em;">Expéditeur</p>
            <p style="margin: 0; font-size: 14px; color: #e2e8f0; font-weight: 600;">${senderCheck.cleanEmail}</p>
          </div>

          <!-- Objet -->
          <div style="margin-bottom: 20px;">
            <p style="margin: 0 0 6px; font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Objet</p>
            <p style="margin: 0; font-size: 16px; font-weight: 700; color: #fff;">${cleanSubject}</p>
          </div>

          <!-- Message -->
          <div style="background: #1e293b; border-radius: 12px; padding: 20px; margin-bottom: 24px; border: 1px solid #334155;">
            <p style="margin: 0 0 10px; font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Message</p>
            <p style="margin: 0; font-size: 14px; color: #f1f5f9; line-height: 1.7; white-space: pre-wrap;">${messageBody}</p>
          </div>

          ${audioAttachment ? '<p style="margin: 0 0 24px; color: #cbd5e1;">L’enregistrement audio est joint à cet e-mail. Vous pouvez le lire ou le télécharger même lorsque vous êtes hors ligne.</p>' : ''}

          <!-- CTA Répondre -->
          <div style="text-align: center; margin-bottom: 24px;">
            <a href="mailto:${senderCheck.cleanEmail}?subject=Re: ${encodeURIComponent(cleanSubject)}" 
               style="display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; font-weight: 700; font-size: 14px; padding: 12px 28px; border-radius: 50px; text-decoration: none;">
              ↩️ Répondre à ${senderCheck.cleanEmail}
            </a>
          </div>

          <!-- Footer -->
          <div style="padding-top: 16px; border-top: 1px solid #1e293b; text-align: center;">
            <p style="margin: 0; font-size: 11px; color: #475569;">
              Message envoyé le ${readableDate} via <strong style="color: #6366f1;">You&amp;Me</strong> — plateforme de communication sécurisée.
            </p>
            <p style="margin: 6px 0 0; font-size: 11px; color: #334155;">
              Pour vous connecter et répondre directement : 
              <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://youandme.cloud'}" style="color: #6366f1;">youandme.cloud</a>
            </p>
          </div>
        </div>
      `,
    });

    if (error) {
      console.error('Erreur Resend envoi message contact:', error);
      return NextResponse.json({ error: 'Échec de l\'envoi du message.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data?.id });
  } catch (err) {
    console.error('Erreur serveur envoi message contact:', err);
    return NextResponse.json({ error: 'Erreur interne du serveur.' }, { status: 500 });
  }
}
