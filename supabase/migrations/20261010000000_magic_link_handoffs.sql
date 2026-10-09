create table if not exists public.magic_link_handoffs (
  handoff_id_hash text primary key,
  encrypted_credential text not null,
  nonce text not null,
  auth_tag text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.magic_link_handoffs enable row level security;
revoke all on public.magic_link_handoffs from anon, authenticated;
grant all on public.magic_link_handoffs to service_role;

create index if not exists magic_link_handoffs_expires_at_idx
  on public.magic_link_handoffs (expires_at);