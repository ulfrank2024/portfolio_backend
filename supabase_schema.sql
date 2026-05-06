-- ============================================================
--  Portfolio Agent IA — Schéma Supabase
--  Coller ce SQL dans l'éditeur SQL de votre projet Supabase
-- ============================================================

-- Sessions de conversation
create table if not exists chat_sessions (
  id          uuid primary key default gen_random_uuid(),
  client_name  text,
  client_email text,
  client_phone text,
  status       text not null default 'active',
  -- status: active | spec_ready | sent
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Messages (historique de conversation)
create table if not exists chat_messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references chat_sessions(id) on delete cascade,
  role        text not null,  -- 'user' | 'assistant'
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_chat_messages_session on chat_messages(session_id, created_at);

-- Cahiers des charges générés
create table if not exists project_specs (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references chat_sessions(id) on delete cascade,
  spec_data         jsonb not null,
  admin_token       text not null,
  status            text not null default 'draft',
  -- status: draft | sent
  claude_code_md    text,   -- CLAUDE.md prompt for Claude Code
  spec_technique_md text,   -- Technical specification markdown
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Row Level Security (désactivé pour service key, ok pour ce projet)
alter table chat_sessions  disable row level security;
alter table chat_messages  disable row level security;
alter table project_specs  disable row level security;
