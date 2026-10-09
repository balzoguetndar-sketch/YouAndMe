create extension if not exists pgcrypto;

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  contact_email text not null,
  created_at timestamptz not null default now(),
  constraint contacts_contact_email_check check (contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

create unique index if not exists contacts_owner_email_key
  on public.contacts (owner_id, lower(contact_email));

alter table public.contacts enable row level security;

create policy "Contacts: user can read own contacts"
  on public.contacts for select
  using (auth.uid() = owner_id);

create policy "Contacts: user can insert own contacts"
  on public.contacts for insert
  with check (auth.uid() = owner_id);

create policy "Contacts: user can delete own contacts"
  on public.contacts for delete
  using (auth.uid() = owner_id);
