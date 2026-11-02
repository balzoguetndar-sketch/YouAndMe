import 'server-only';

import { createClient } from '@/src/lib/supabase/server';
import { isActiveStandardSession } from '@/src/lib/standardSession';

export type Contact = {
  id: string;
  contact_email: string;
  created_at: string;
};

async function getAuthorizedClient(expectedEmail?: string) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user || !(await isActiveStandardSession(user.id))) {
    throw new Error('Session utilisateur invalide.');
  }

  const authenticatedEmail = (user.email || user.user_metadata?.email || '').toLowerCase().trim();

  if (expectedEmail) {
    const cleanExpected = expectedEmail.toLowerCase().trim();
    if (authenticatedEmail !== cleanExpected) {
      throw new Error(`L’identité Supabase authentifiée (${authenticatedEmail}) ne correspond pas au compte actif (${cleanExpected}).`);
    }
  }

  return { supabase, user, authenticatedEmail };
}

export async function getContacts(expectedEmail?: string): Promise<{ contacts: Contact[]; userEmail: string }> {
  const { supabase, user, authenticatedEmail } = await getAuthorizedClient(expectedEmail);
  const { data, error } = await supabase
    .from('contacts')
    .select('id, contact_email, created_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error('Impossible de charger votre carnet de contacts.');
  }

  return {
    contacts: (data ?? []) as Contact[],
    userEmail: authenticatedEmail,
  };
}

export async function addContact(contactEmail: string, expectedEmail?: string): Promise<Contact> {
  const { supabase, user } = await getAuthorizedClient(expectedEmail);

  const { data, error } = await supabase
    .from('contacts')
    .insert({ owner_id: user.id, contact_email: contactEmail.toLowerCase().trim() })
    .select('id, contact_email, created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('Ce contact est déjà enregistré.');
    }
    throw new Error('Impossible d’ajouter ce contact.');
  }

  return data as Contact;
}

export async function removeContact(contactId: string, expectedEmail?: string): Promise<void> {
  const { supabase, user } = await getAuthorizedClient(expectedEmail);
  const { error } = await supabase
    .from('contacts')
    .delete()
    .eq('id', contactId)
    .eq('owner_id', user.id);

  if (error) {
    throw new Error('Impossible de supprimer ce contact.');
  }
}

