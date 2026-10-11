import { NextResponse } from 'next/server';
import { getContacts, addContact, removeContact } from '@/src/lib/contacts';

export async function GET() {
  try {
    const contacts = await getContacts();
    return NextResponse.json({ contacts: contacts || [] });
  } catch (err) {
    console.error('Erreur GET /api/contacts:', err);
    return NextResponse.json(
      { contacts: [], error: err instanceof Error ? err.message : 'Erreur de chargement.' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { contactEmail } = body;

    if (!contactEmail || !contactEmail.includes('@')) {
      return NextResponse.json({ error: 'Adresse e-mail invalide.' }, { status: 400 });
    }

    const contact = await addContact(contactEmail);
    return NextResponse.json({ contact });
  } catch (err) {
    console.error('Erreur POST /api/contacts:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur d’ajout.' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    const { contactId } = body;

    await removeContact(contactId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erreur DELETE /api/contacts:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur de suppression.' },
      { status: 500 }
    );
  }
}