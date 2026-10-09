import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { validateEmail } from '@/src/lib/validation';

async function sendMagicLinkEmail(email: string, actionLink: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

  if (!apiKey) {
    throw new Error('RESEND_API_KEY n’est pas configuré.');
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
      subject: 'Votre lien de connexion You&Me',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:0 auto;padding:24px">
          <h1 style="color:#4f46e5;margin-bottom:16px;">Connexion à You&Me</h1>
          <p>Pour vous connecter sécurément, utilisez le bouton ci-dessous.</p>
          <p style="margin:24px 0;">
            <a href="${actionLink}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;">Connexion sécurisée</a>
          </p>
          <p>Le lien expire dans 15 minutes.</p>
          <p>Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :</p>
          <p style="word-break:break-all;"><a href="${actionLink}">${actionLink}</a></p>
        </div>
      `,
      text: `Utilisez ce lien pour vous connecter à You&Me : ${actionLink}. Il expire dans 15 minutes.`,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Resend API error ${response.status}: ${errorBody}`);
  }
}

export async function POST(request: Request) {
  try {
    const { email } = (await request.json()) as { email?: unknown };
    const cleanEmail = typeof email === 'string' ? email : '';
    const { isValid, cleanEmail: validatedEmail } = validateEmail(cleanEmail);

    if (!isValid || !validatedEmail) {
      return NextResponse.json(
        { error: 'Saisissez une adresse e-mail valide.' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: 'La configuration Supabase est incomplète.' },
        { status: 503 }
      );
    }

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const requestOrigin = new URL(request.url).origin;
    const redirectOrigin = process.env.NODE_ENV === 'development'
      ? process.env.LOCAL_APP_URL || requestOrigin
      : requestOrigin;

    const redirectTo = new URL('/verify?next=/', redirectOrigin).toString();
    const { data, error } = await adminSupabase.auth.admin.generateLink({
      email: validatedEmail,
      type: 'magiclink',
      options: { redirectTo },
    });

    if (error) {
      console.error('[Magic Link] Génération du lien échouée :', error.message);
      return NextResponse.json(
        { error: 'Impossible de générer le lien magique.' },
        { status: 502 }
      );
    }

    const actionLink = data?.properties?.action_link;
    if (!actionLink) {
      return NextResponse.json(
        { error: 'Le lien magique n’a pas été généré.' },
        { status: 502 }
      );
    }

    try {
      await sendMagicLinkEmail(validatedEmail, actionLink);
    } catch (emailError) {
      console.error('[Magic Link] Envoi Resend échoué :', emailError);
      return NextResponse.json(
        { error: 'Impossible d’envoyer le lien magique par e-mail.' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      cleanEmail: validatedEmail,
      message: 'Lien magique envoyé. Ouvrez-le dans votre boîte e-mail.',
      expiresInMinutes: 15,
    });
  } catch (error) {
    console.error('[Magic Link] Erreur runtime :', error);
    return NextResponse.json(
      { error: 'Impossible de créer le lien magique.' },
      { status: 500 }
    );
  }
}
