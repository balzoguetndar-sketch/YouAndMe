import { NextResponse } from 'next/server';
import { getContacts, addContact, removeContact } from '@/src/lib/contacts';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const expectedEmail = searchParams.get('account')?.toLowerCase().trim() || undefined;
    const { contacts, userEmail } = await getContacts(expectedEmail);
    return NextResponse.json({ contacts: contacts || [], userEmail });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de chargement.';
    console.error('Erreur GET /api/contacts:', message);
    const isForbidden = message.includes('ne correspond pas');
    const isAuth = message.includes('Session utilisateur invalide');
    const status = isForbidden ? 403 : isAuth ? 401 : 500;
    return NextResponse.json(
      { contacts: [], error: message },
      { status }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { contactEmail, account } = body;

    if (!contactEmail || !contactEmail.includes('@')) {
      return NextResponse.json({ error: 'Adresse e-mail invalide.' }, { status: 400 });
    }

    const contact = await addContact(
      contactEmail,
      typeof account === 'string' ? account.toLowerCase().trim() : undefined
    );
    return NextResponse.json({ contact });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur d’ajout.';
    console.error('Erreur POST /api/contacts:', message);
    const isForbidden = message.includes('ne correspond pas');
    const isAuth = message.includes('Session utilisateur invalide');
    const status = isForbidden ? 403 : isAuth ? 401 : 500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    const { contactId, account } = body;

    if (!contactId) {
      return NextResponse.json({ error: 'Identifiant requis.' }, { status: 400 });
    }

    await removeContact(
      contactId,
      typeof account === 'string' ? account.toLowerCase().trim() : undefined
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de suppression.';
    console.error('Erreur DELETE /api/contacts:', message);
    const isForbidden = message.includes('ne correspond pas');
    const isAuth = message.includes('Session utilisateur invalide');
    const status = isForbidden ? 403 : isAuth ? 401 : 500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}