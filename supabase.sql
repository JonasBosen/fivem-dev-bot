-- Kør i Supabase: SQL Editor -> New query -> Run
create table if not exists public.bot_state (
  id int primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Slå Row Level Security til uden policies: kun service_role-nøglen (botten) kan læse/skrive.
alter table public.bot_state enable row level security;
