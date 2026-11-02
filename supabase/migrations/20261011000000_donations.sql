-- Table des dons enregistrés via Stripe
create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  donor_email text not null default 'Donateur Anonyme',
  amount numeric not null default 0,
  stripe_payment_id text,
  created_at timestamptz not null default now()
);

-- Index pour les recherches par paiement ou date
create index if not exists idx_donations_created_at on public.donations (created_at desc);
create index if not exists idx_donations_stripe_id on public.donations (stripe_payment_id);

-- Sécurité RLS : réservé au rôle service_role (webhooks Stripe)
alter table public.donations enable row level security;
revoke all on public.donations from anon, authenticated;
grant all on public.donations to service_role;
