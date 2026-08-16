create or replace function private.archive_scope_ok(_entity_id uuid, _owner_user_id uuid)
returns boolean language sql stable security definer set search_path = private, public as $$
  select case
    when auth.uid() is null then false
    when _entity_id is null then _owner_user_id = auth.uid()
    else private.is_active_member(auth.uid(), _entity_id)
  end
$$;
revoke all on function private.archive_scope_ok(uuid, uuid) from public;
grant execute on function private.archive_scope_ok(uuid, uuid) to authenticated, service_role;

create table if not exists public.archive_folders (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid references public.entities(id) on delete cascade,
  owner_user_id uuid not null,
  parent_id uuid references public.archive_folders(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists archive_folders_scope_idx on public.archive_folders(entity_id, owner_user_id);

create table if not exists public.archive_items (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid references public.entities(id) on delete cascade,
  owner_user_id uuid not null,
  folder_id uuid references public.archive_folders(id) on delete set null,
  title text not null check (length(btrim(title)) between 1 and 200),
  kind text not null default 'file'
    check (kind in ('file','project','property','request','contract','deal','listing','message','thread','document','other')),
  source_table text,
  source_id uuid,
  storage_path text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  note text check (note is null or length(note) <= 2000),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists archive_items_scope_idx on public.archive_items(entity_id, owner_user_id, created_at desc);
create index if not exists archive_items_folder_idx on public.archive_items(folder_id);
create unique index if not exists archive_items_source_uniq
  on public.archive_items(coalesce(entity_id,'00000000-0000-0000-0000-000000000000'::uuid), owner_user_id, source_table, source_id)
  where source_table is not null and source_id is not null;

create table if not exists public.entity_correspondence (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid references public.entities(id) on delete cascade,
  owner_user_id uuid not null,
  channel text not null check (channel in ('email','whatsapp','rfq','other')),
  direction text not null default 'outgoing' check (direction in ('incoming','outgoing')),
  subject text not null check (length(btrim(subject)) between 1 and 200),
  body text not null default '' check (length(body) <= 20000),
  counterparty_name text check (counterparty_name is null or length(counterparty_name) <= 160),
  counterparty_address text check (counterparty_address is null or length(counterparty_address) <= 200),
  project_id uuid references public.projects(id) on delete set null,
  request_id uuid references public.requests(id) on delete set null,
  status text not null default 'logged' check (status in ('draft','logged','queued','sent','received','failed')),
  archived_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists entity_correspondence_scope_idx
  on public.entity_correspondence(entity_id, owner_user_id, created_at desc);

create table if not exists public.entity_messaging_channels (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(id) on delete cascade,
  channel text not null check (channel in ('email','whatsapp')),
  status text not null default 'not_configured'
    check (status in ('not_configured','awaiting_credentials','connected','error')),
  provider text check (provider is null or length(provider) <= 60),
  from_address text check (from_address is null or length(from_address) <= 200),
  secret_env_name text check (secret_env_name is null or secret_env_name ~ '^[A-Z][A-Z0-9_]{2,60}$'),
  note text check (note is null or length(note) <= 500),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (entity_id, channel)
);

create table if not exists public.contracting_deals (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid references public.entities(id) on delete cascade,
  owner_user_id uuid not null,
  title text not null check (length(btrim(title)) between 2 and 200),
  counterparty_name text check (counterparty_name is null or length(counterparty_name) <= 160),
  context_type text not null default 'other'
    check (context_type in ('project','request','assignment','listing','other')),
  context_id uuid,
  status text not null default 'draft'
    check (status in ('draft','negotiating','agreed','signed','cancelled')),
  amount numeric(14,2) check (amount is null or amount >= 0),
  currency text not null default 'SAR' check (currency ~ '^[A-Z]{3}$'),
  notes text check (notes is null or length(notes) <= 4000),
  archived_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contracting_deals_scope_idx
  on public.contracting_deals(entity_id, owner_user_id, created_at desc);

alter table public.service_listings add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.service_listings add column if not exists request_id uuid references public.requests(id) on delete set null;
alter table public.service_listings add column if not exists archived_at timestamptz;

create or replace function private.touch_updated_at()
returns trigger language plpgsql security definer set search_path = public as $$
begin new.updated_at = now(); return new; end $$;
revoke all on function private.touch_updated_at() from public;

drop trigger if exists trg_archive_folders_touch on public.archive_folders;
create trigger trg_archive_folders_touch before update on public.archive_folders
  for each row execute function private.touch_updated_at();
drop trigger if exists trg_archive_items_touch on public.archive_items;
create trigger trg_archive_items_touch before update on public.archive_items
  for each row execute function private.touch_updated_at();
drop trigger if exists trg_entity_correspondence_touch on public.entity_correspondence;
create trigger trg_entity_correspondence_touch before update on public.entity_correspondence
  for each row execute function private.touch_updated_at();
drop trigger if exists trg_contracting_deals_touch on public.contracting_deals;
create trigger trg_contracting_deals_touch before update on public.contracting_deals
  for each row execute function private.touch_updated_at();
drop trigger if exists trg_messaging_channels_touch on public.entity_messaging_channels;
create trigger trg_messaging_channels_touch before update on public.entity_messaging_channels
  for each row execute function private.touch_updated_at();

alter table public.archive_folders enable row level security;
alter table public.archive_items enable row level security;
alter table public.entity_correspondence enable row level security;
alter table public.entity_messaging_channels enable row level security;
alter table public.contracting_deals enable row level security;

drop policy if exists archive_folders_scope on public.archive_folders;
create policy archive_folders_scope on public.archive_folders for all to authenticated
  using (private.archive_scope_ok(entity_id, owner_user_id))
  with check (private.archive_scope_ok(entity_id, owner_user_id) and created_by = auth.uid());

drop policy if exists archive_items_scope on public.archive_items;
create policy archive_items_scope on public.archive_items for all to authenticated
  using (private.archive_scope_ok(entity_id, owner_user_id))
  with check (private.archive_scope_ok(entity_id, owner_user_id) and created_by = auth.uid());

drop policy if exists entity_correspondence_scope on public.entity_correspondence;
create policy entity_correspondence_scope on public.entity_correspondence for all to authenticated
  using (private.archive_scope_ok(entity_id, owner_user_id))
  with check (private.archive_scope_ok(entity_id, owner_user_id) and created_by = auth.uid());

drop policy if exists contracting_deals_scope on public.contracting_deals;
create policy contracting_deals_scope on public.contracting_deals for all to authenticated
  using (private.archive_scope_ok(entity_id, owner_user_id))
  with check (private.archive_scope_ok(entity_id, owner_user_id) and created_by = auth.uid());

drop policy if exists messaging_channels_read on public.entity_messaging_channels;
create policy messaging_channels_read on public.entity_messaging_channels for select to authenticated
  using (private.is_active_member(auth.uid(), entity_id));
drop policy if exists messaging_channels_write on public.entity_messaging_channels;
create policy messaging_channels_write on public.entity_messaging_channels for all to authenticated
  using (private.can(auth.uid(), 'members'::app_module, 'manage_members'::app_action, entity_id, null))
  with check (private.can(auth.uid(), 'members'::app_module, 'manage_members'::app_action, entity_id, null));

revoke all on public.archive_folders from anon, authenticated;
revoke all on public.archive_items from anon, authenticated;
revoke all on public.entity_correspondence from anon, authenticated;
revoke all on public.entity_messaging_channels from anon, authenticated;
revoke all on public.contracting_deals from anon, authenticated;

grant select, insert, update, delete on public.archive_folders to authenticated;
grant select, insert, update, delete on public.archive_items to authenticated;
grant select, insert, update, delete on public.entity_correspondence to authenticated;
grant select, insert, update, delete on public.entity_messaging_channels to authenticated;
grant select, insert, update, delete on public.contracting_deals to authenticated;
grant all on public.archive_folders, public.archive_items, public.entity_correspondence,
  public.entity_messaging_channels, public.contracting_deals to service_role;

create or replace function private.archive_object_ok(_name text)
returns boolean language plpgsql stable security definer set search_path = private, public as $$
declare kind text; ident uuid;
begin
  if auth.uid() is null then return false; end if;
  kind := split_part(_name, '/', 1);
  begin ident := split_part(_name, '/', 2)::uuid; exception when others then return false; end;
  if kind = 'u' then return ident = auth.uid(); end if;
  if kind = 'e' then return private.is_active_member(auth.uid(), ident); end if;
  return false;
end $$;
revoke all on function private.archive_object_ok(text) from public;
grant execute on function private.archive_object_ok(text) to authenticated, service_role;

drop policy if exists archive_objects_rw on storage.objects;
create policy archive_objects_rw on storage.objects for all to authenticated
  using (bucket_id = 'archive' and private.archive_object_ok(name))
  with check (bucket_id = 'archive' and private.archive_object_ok(name));
