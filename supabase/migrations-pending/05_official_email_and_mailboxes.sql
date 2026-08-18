-- 05 — البريد الرسمي + صناديق البريد المربوطة (Gmail / Microsoft / موصل بريد آخر).
-- قواعد ثابتة:
--  * لا قيمة سر في جداول public إطلاقًا: التوكنات مشفّرة في مخطط private فقط.
--  * لا يمنح البريد أي صلاحية بذاته؛ هو بيانات تعريف قابلة للتحقق فقط.
--  * كل سطر معزول بمالكه (مستخدم أو كيان يملك المستخدم صلاحية عليه).

-- ── 1) البريد الرسمي ────────────────────────────────────────────────
create table if not exists public.official_emails (
  id                uuid primary key default gen_random_uuid(),
  owner_user_id     uuid,
  owner_entity_id   uuid references public.entities(id) on delete cascade,
  email             text not null check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$'),
  status            text not null default 'pending'
                      check (status in ('pending', 'verified')),
  verified_at       timestamptz,
  verification_sent_at timestamptz,
  attempts          smallint not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint official_emails_one_owner check (
    (owner_user_id is not null and owner_entity_id is null)
    or (owner_user_id is null and owner_entity_id is not null)
  )
);

create unique index if not exists official_emails_user_uniq
  on public.official_emails (owner_user_id) where owner_user_id is not null;
create unique index if not exists official_emails_entity_uniq
  on public.official_emails (owner_entity_id) where owner_entity_id is not null;

grant select on public.official_emails to authenticated;
grant all on public.official_emails to service_role;
revoke insert, update, delete, truncate on public.official_emails from anon, authenticated;
revoke select on public.official_emails from anon;

alter table public.official_emails enable row level security;

drop policy if exists "official_emails_read_own" on public.official_emails;
create policy "official_emails_read_own"
  on public.official_emails for select to authenticated
  using (
    owner_user_id = auth.uid()
    or (owner_entity_id is not null and private.is_entity_member(auth.uid(), owner_entity_id))
  );

-- رمز التحقق: تجزئة فقط، في مخطط private، بلا أي منح للعميل.
create schema if not exists private;

create table if not exists private.official_email_tokens (
  official_email_id uuid primary key references public.official_emails(id) on delete cascade,
  token_hash        text not null,
  expires_at        timestamptz not null,
  created_at        timestamptz not null default now()
);
revoke all on private.official_email_tokens from public, anon, authenticated;
grant all on private.official_email_tokens to service_role;

-- ── 2) اتصالات صناديق البريد ────────────────────────────────────────
create table if not exists public.mailbox_connections (
  id                 uuid primary key default gen_random_uuid(),
  owner_user_id      uuid not null default auth.uid(),
  owner_entity_id    uuid references public.entities(id) on delete cascade,
  provider           text not null check (provider in ('gmail', 'microsoft', 'other')),
  email_address      text not null,
  external_account_id text,
  scopes             text[] not null default '{}',
  status             text not null default 'connected'
                       check (status in ('connected', 'needs_reauth', 'disconnected')),
  last_sync_at       timestamptz,
  last_error_code    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index if not exists mailbox_connections_owner_provider_uniq
  on public.mailbox_connections (coalesce(owner_entity_id, owner_user_id), provider, email_address);

grant select on public.mailbox_connections to authenticated;
grant all on public.mailbox_connections to service_role;
revoke insert, update, delete, truncate on public.mailbox_connections from anon, authenticated;
revoke select on public.mailbox_connections from anon;

alter table public.mailbox_connections enable row level security;

drop policy if exists "mailbox_connections_read_own" on public.mailbox_connections;
create policy "mailbox_connections_read_own"
  on public.mailbox_connections for select to authenticated
  using (
    owner_user_id = auth.uid()
    or (owner_entity_id is not null and private.is_entity_member(auth.uid(), owner_entity_id))
  );

-- التوكنات: مشفّرة (AES-256-GCM) خارج نطاق Data API نهائيًا.
create table if not exists private.mailbox_tokens (
  connection_id  uuid primary key references public.mailbox_connections(id) on delete cascade,
  access_cipher  text,
  refresh_cipher text,
  expires_at     timestamptz,
  updated_at     timestamptz not null default now()
);
revoke all on private.mailbox_tokens from public, anon, authenticated;
grant all on private.mailbox_tokens to service_role;

-- ── 3) ذاكرة رؤوس الرسائل (أقل قدر من البيانات) ─────────────────────
create table if not exists public.mailbox_messages (
  id             uuid primary key default gen_random_uuid(),
  connection_id  uuid not null references public.mailbox_connections(id) on delete cascade,
  owner_user_id  uuid not null,
  owner_entity_id uuid references public.entities(id) on delete cascade,
  source_id      text not null,
  thread_id      text,
  folder         text not null default 'inbox' check (folder in ('inbox', 'sent', 'draft')),
  subject        text,
  from_address   text,
  to_addresses   text[] not null default '{}',
  snippet        text,
  sent_at        timestamptz,
  is_read        boolean not null default false,
  project_id     uuid references public.projects(id) on delete set null,
  request_id     uuid,
  correspondence_id uuid references public.entity_correspondence(id) on delete set null,
  created_at     timestamptz not null default now()
);

create unique index if not exists mailbox_messages_source_uniq
  on public.mailbox_messages (connection_id, source_id);
create index if not exists mailbox_messages_folder_idx
  on public.mailbox_messages (connection_id, folder, sent_at desc);

grant select on public.mailbox_messages to authenticated;
grant all on public.mailbox_messages to service_role;
revoke insert, update, delete, truncate on public.mailbox_messages from anon, authenticated;
revoke select on public.mailbox_messages from anon;

alter table public.mailbox_messages enable row level security;

drop policy if exists "mailbox_messages_read_own" on public.mailbox_messages;
create policy "mailbox_messages_read_own"
  on public.mailbox_messages for select to authenticated
  using (
    owner_user_id = auth.uid()
    or (owner_entity_id is not null and private.is_entity_member(auth.uid(), owner_entity_id))
  );

-- ── 4) تحديث updated_at ─────────────────────────────────────────────
drop trigger if exists official_emails_updated_at on public.official_emails;
create trigger official_emails_updated_at
  before update on public.official_emails
  for each row execute function public.set_updated_at();

drop trigger if exists mailbox_connections_updated_at on public.mailbox_connections;
create trigger mailbox_connections_updated_at
  before update on public.mailbox_connections
  for each row execute function public.set_updated_at();
