import 'server-only';

import { createClient } from '@/src/lib/supabase/server';
import { isActiveStandardSession } from '@/src/lib/standardSession';

export type Contact = {
  id: string;
  contact_email: string;
  created_at: string;
};

async function getAuthorizedClient() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user || !(await isActiveStandardSession(user.id))) {
    throw new Error('Session utilisateur invalide.');
  }

  return { supabase, user };
}

export async function getContacts(): Promise<Contact[]> {
  const { supabase } = await getAuthorizedClient();
  const { data, error } = await supabase
    .from('contacts')
    .select('id, contact_email, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error('Impossible de charger votre carnet de contacts.');
  }

  return (data ?? []) as Contact[];
}

export async function addContact(contactEmail: string): Promise<Contact> {
  const { supabase, user } = await getAuthorizedClient();

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

export async function removeContact(contactId: string): Promise<void> {
  const { supabase } = await getAuthorizedClient();
  const { error } = await supabase.from('contacts').delete().eq('id', contactId);

  if (error) {
    throw new Error('Impossible de supprimer ce contact.');
  }
}
