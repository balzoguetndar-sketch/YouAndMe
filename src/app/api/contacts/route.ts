import { NextResponse } from 'next/server';
import { addContact, getContacts, removeContact } from '@/src/lib/contacts';
import { validateEmail } from '@/src/lib/validation';

export async function GET() {
  try {
    return NextResponse.json({ contacts: await getContacts() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Impossible de charger les contacts.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { contactEmail } = (await request.json()) as { contactEmail?: unknown };
    const normalizedContactEmail = typeof contactEmail === 'string' ? contactEmail : '';
    const { isValid, cleanEmail } = validateEmail(normalizedContactEmail);

    if (!isValid || !cleanEmail) {
      return NextResponse.json({ error: 'Saisissez une adresse e-mail valide.' }, { status: 400 });
    }

    const contact = await addContact(cleanEmail);
    return NextResponse.json({ contact }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Impossible d’ajouter le contact.' },
      { status: 409 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { contactId } = (await request.json()) as { contactId?: unknown };
    if (typeof contactId !== 'string' || !contactId) {
      return NextResponse.json({ error: 'Contact invalide.' }, { status: 400 });
    }

    await removeContact(contactId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Impossible de supprimer le contact.' },
      { status: 500 }
    );
  }
}
