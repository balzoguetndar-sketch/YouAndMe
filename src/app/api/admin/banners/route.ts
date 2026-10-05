import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/src/lib/adminAuth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function isAdminRequest(): Promise<boolean> {
  const cookieStore = await cookies();
  return Boolean(await verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value));
}

export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('banners')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Impossible de charger les bannières.' }, { status: 500 });
  }
  return NextResponse.json({ banners: data || [] });
}

export async function POST(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const durationTypes = ['day', 'week', 'month'];
    if (
      typeof body?.title !== 'string' ||
      typeof body?.image_url !== 'string' ||
      typeof body?.advertiser_email !== 'string' ||
      !durationTypes.includes(body?.duration_type) ||
      !Number.isInteger(body?.duration_value) ||
      body.duration_value < 1 ||
      !Number.isFinite(body?.amount_due) ||
      body.amount_due <= 0
    ) {
      return NextResponse.json({ error: 'Informations de bannière invalides.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.from('banners').insert([{
      title: body.title.trim(),
      image_url: body.image_url,
      target_url: typeof body.target_url === 'string' ? body.target_url : '#',
      advertiser_email: body.advertiser_email.trim().toLowerCase(),
      duration_type: body.duration_type,
      duration_value: body.duration_value,
      amount_due: body.amount_due,
      payment_status: 'pending',
      active: false,
    }]).select('*').single();

    if (error) {
      return NextResponse.json({ error: 'Impossible de créer la bannière.' }, { status: 500 });
    }
    return NextResponse.json({ banner: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const updates: { active?: boolean; payment_status?: 'paid' | 'pending' } = {};
    if (typeof body?.active === 'boolean') {
      updates.active = body.active;
    }
    if (body?.payment_status === 'paid' || body?.payment_status === 'pending') {
      updates.payment_status = body.payment_status;
    }
    if (typeof body?.id !== 'string' || !Object.keys(updates).length) {
      return NextResponse.json({ error: 'Modification de bannière invalide.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from('banners').update(updates).eq('id', body.id);
    if (error) {
      return NextResponse.json({ error: 'Impossible de modifier la bannière.' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (typeof body?.id !== 'string' || !body.id) {
      return NextResponse.json({ error: 'Identifiant de bannière invalide.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from('banners').delete().eq('id', body.id);
    if (error) {
      return NextResponse.json({ error: 'Impossible de supprimer la bannière.' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }
}