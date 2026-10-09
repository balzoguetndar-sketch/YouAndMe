'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { Contact } from '@/src/lib/contacts';

type ContactListProps = {
  currentUserEmail: string;
  onlineUsers: Set<string>;
  onSelectContact: (email: string, callType: 'video' | 'audio') => void;
};

export function ContactList({ currentUserEmail, onlineUsers, onSelectContact }: ContactListProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadContacts() {
      try {
        const response = await fetch('/api/contacts', { cache: 'no-store' });
        const data = await response.json() as { contacts?: Contact[]; error?: string };
        if (!response.ok) throw new Error(data.error || 'Impossible de charger les contacts.');
        if (active) setContacts(data.contacts ?? []);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Impossible de charger les contacts.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadContacts();
    return () => { active = false; };
  }, []);

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactEmail: newEmail }),
      });
      const data = await response.json() as { contact?: Contact; error?: string };
      if (!response.ok || !data.contact) throw new Error(data.error || 'Impossible d’ajouter le contact.');
      setContacts((current) => [data.contact as Contact, ...current]);
      setNewEmail('');
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : 'Impossible d’ajouter le contact.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (contactId: string) => {
    setError(null);
    try {
      const response = await fetch('/api/contacts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Impossible de supprimer le contact.');
      setContacts((current) => current.filter((contact) => contact.id !== contactId));
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Impossible de supprimer le contact.');
    }
  };

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 shadow-2xl sm:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-white">Mon carnet de contacts</h2>
          <p className="mt-1 text-xs text-slate-400">Ajoutez un e-mail pour l’appeler directement depuis votre carnet.</p>
        </div>
        <span className="rounded-full border border-indigo-800 bg-indigo-950 px-3 py-1 text-xs font-semibold text-indigo-300">
          {contacts.length} contact{contacts.length > 1 ? 's' : ''}
        </span>
      </div>

      <form onSubmit={handleAdd} className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <input
          type="email"
          value={newEmail}
          onChange={(event) => setNewEmail(event.target.value)}
          placeholder="correspondant@domaine.com"
          required
          autoComplete="email"
          className="rounded-xl bg-slate-950 border border-slate-800 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? 'Enregistrement…' : 'Ajouter'}
        </button>
      </form>

      {error && <p role="alert" className="rounded-xl bg-red-950/80 px-3 py-2 text-xs text-red-300">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">Chargement de votre carnet…</p>
      ) : contacts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 p-6 text-center">
          <p className="text-sm font-semibold text-slate-300">Votre carnet est vide</p>
          <p className="mt-1 text-xs text-slate-500">Ajoutez un correspondant pour commencer.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {contacts.map((contact) => {
            const isOnline = onlineUsers.has(contact.contact_email);
            return (
              <article key={contact.id} className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{contact.contact_email}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`} />
                    <span className={`text-xs font-bold ${isOnline ? 'text-emerald-300' : 'text-slate-500'}`}>
                      {isOnline ? 'En ligne' : 'Hors ligne'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectContact(contact.contact_email, 'video')}
                    disabled={!isOnline}
                    className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
                    title={isOnline ? 'Démarrer un appel vidéo' : 'Le correspondant est hors ligne'}
                  >
                    📹 Vidéo
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectContact(contact.contact_email, 'audio')}
                    disabled={!isOnline}
                    className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
                    title={isOnline ? 'Démarrer un appel audio' : 'Le correspondant est hors ligne'}
                  >
                    🎙️ Audio
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRemove(contact.id)}
                    className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-400 hover:border-red-700 hover:text-red-300"
                    aria-label={`Supprimer ${contact.contact_email}`}
                  >
                    Supprimer
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {currentUserEmail && (
        <p className="text-[11px] text-slate-600">Votre compte : {currentUserEmail}</p>
      )}
    </section>
  );
}
