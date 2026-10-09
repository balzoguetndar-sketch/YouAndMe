create table if not exists public.active_standard_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  session_token_hash text not null,
  updated_at timestamptz not null default now()
);

alter table public.active_standard_sessions enable row level security;
revoke all on public.active_standard_sessions from anon, authenticated;
grant all on public.active_standard_sessions to service_role;