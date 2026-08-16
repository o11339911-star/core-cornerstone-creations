-- =========================================================
-- 1) IDENTITY: reversible cipher + deterministic fingerprint
-- =========================================================
alter table private.personal_identity_links
  add column if not exists id_fingerprint text,
  add column if not exists id_cipher text,
  add column if not exists cipher_alg text;

create unique index if not exists personal_identity_links_fingerprint_key
  on private.personal_identity_links (id_fingerprint)
  where id_fingerprint is not null;

create table if not exists private.identity_access_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  subject_user_id uuid,
  action text not null check (action in ('upsert','lookup','reveal','backfill')),
  outcome text not null check (outcome in ('ok','not_found','conflict','denied')),
  created_at timestamptz not null default now()
);
revoke all on private.identity_access_log from public, anon, authenticated;

-- service-role only helpers (keys live in the server runtime, never in the DB)
create or replace function private.svc_identity_upsert(
  _user_id uuid, _fingerprint text, _cipher text, _last4 text
) returns text
language plpgsql security definer set search_path to '' as $$
declare _other uuid;
begin
  select user_id into _other from private.personal_identity_links
   where id_fingerprint = _fingerprint and user_id <> _user_id;
  if _other is not null then
    insert into private.identity_access_log(actor_user_id, subject_user_id, action, outcome)
    values (_user_id, _user_id, 'upsert', 'conflict');
    return 'IDENTITY_ALREADY_LINKED';
  end if;

  insert into private.personal_identity_links as p
    (user_id, id_hash, last4, status, format_checked_at, id_fingerprint, id_cipher, cipher_alg)
  values (_user_id, 'fp:' || _fingerprint, _last4, 'pending', now(), _fingerprint, _cipher, 'aes-256-gcm')
  on conflict (user_id) do update
    set id_fingerprint = excluded.id_fingerprint,
        id_cipher = excluded.id_cipher,
        cipher_alg = excluded.cipher_alg,
        last4 = excluded.last4,
        format_checked_at = now(),
        updated_at = now()
    where p.user_id = _user_id;

  insert into private.identity_access_log(actor_user_id, subject_user_id, action, outcome)
  values (_user_id, _user_id, 'upsert', 'ok');
  return 'OK';
end $$;

create or replace function private.svc_identity_lookup(_fingerprint text)
returns uuid
language plpgsql security definer set search_path to '' as $$
declare _uid uuid;
begin
  select user_id into _uid from private.personal_identity_links where id_fingerprint = _fingerprint;
  insert into private.identity_access_log(subject_user_id, action, outcome)
  values (_uid, 'lookup', case when _uid is null then 'not_found' else 'ok' end);
  return _uid;
end $$;

create or replace function private.svc_identity_cipher(_user_id uuid, _actor uuid)
returns text
language plpgsql security definer set search_path to '' as $$
declare _c text;
begin
  select id_cipher into _c from private.personal_identity_links where user_id = _user_id;
  insert into private.identity_access_log(actor_user_id, subject_user_id, action, outcome)
  values (_actor, _user_id, 'reveal', case when _c is null then 'not_found' else 'ok' end);
  return _c;
end $$;

-- one-time backfill source: legacy pgp ciphertext -> plaintext for rows missing a fingerprint
create or replace function private.svc_identity_backfill_pending()
returns table (user_id uuid, plain text)
language sql security definer set search_path to '' as $$
  select l.user_id, private.decrypt_identity(l.id_encrypted)
  from private.personal_identity_links l
  where l.id_fingerprint is null and l.id_encrypted is not null
$$;

revoke all on function private.svc_identity_upsert(uuid, text, text, text) from public, anon, authenticated;
revoke all on function private.svc_identity_lookup(text) from public, anon, authenticated;
revoke all on function private.svc_identity_cipher(uuid, uuid) from public, anon, authenticated;
revoke all on function private.svc_identity_backfill_pending() from public, anon, authenticated;
grant execute on function private.svc_identity_upsert(uuid, text, text, text) to service_role;
grant execute on function private.svc_identity_lookup(text) to service_role;
grant execute on function private.svc_identity_cipher(uuid, uuid) to service_role;
grant execute on function private.svc_identity_backfill_pending() to service_role;

-- =========================================================
-- 2) DEAL PARTIES: mandatory second party
-- =========================================================
create table if not exists public.deal_parties (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.contracting_deals(id) on delete cascade,
  party_role text not null check (party_role in ('first','second')),
  party_kind text not null check (party_kind in ('person','entity')),
  identifier_kind text check (identifier_kind in ('national_id','cr_number')),
  identifier_fingerprint text,
  identifier_last4 text,
  cr_number text,
  matched_user_id uuid,
  matched_entity_id uuid references public.entities(id) on delete set null,
  display_name text not null,
  is_registered boolean not null default false,
  acceptance_status text not null default 'pending'
    check (acceptance_status in ('pending','accepted','declined')),
  responded_at timestamptz,
  responded_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deal_id, party_role)
);

create index if not exists deal_parties_match_user_idx on public.deal_parties (matched_user_id);
create index if not exists deal_parties_match_entity_idx on public.deal_parties (matched_entity_id);

grant select on public.deal_parties to authenticated;
grant all on public.deal_parties to service_role;
revoke insert, update, delete, truncate on public.deal_parties from anon, authenticated;
revoke select on public.deal_parties from anon;

alter table public.deal_parties enable row level security;

create or replace function private.deal_visible(_deal_id uuid)
returns boolean
language sql stable security definer set search_path to '' as $$
  select exists (
    select 1 from public.contracting_deals d
    where d.id = _deal_id
      and (
        d.owner_user_id = auth.uid()
        or d.created_by = auth.uid()
        or (d.entity_id is not null and exists (
              select 1 from public.entity_memberships m
              where m.entity_id = d.entity_id and m.user_id = auth.uid() and m.status = 'active'))
      )
  )
  or exists (
    select 1 from public.deal_parties p
    where p.deal_id = _deal_id and p.party_role = 'second'
      and (
        p.matched_user_id = auth.uid()
        or (p.matched_entity_id is not null and exists (
              select 1 from public.entity_memberships m
              where m.entity_id = p.matched_entity_id and m.user_id = auth.uid() and m.status = 'active'))
      )
  )
$$;
revoke all on function private.deal_visible(uuid) from public, anon;
grant execute on function private.deal_visible(uuid) to authenticated, service_role;

create policy deal_parties_read on public.deal_parties
  for select to authenticated
  using (private.deal_visible(deal_id));

-- second party must also see the deal itself
drop policy if exists contracting_deals_second_party_read on public.contracting_deals;
create policy contracting_deals_second_party_read on public.contracting_deals
  for select to authenticated
  using (private.deal_visible(id));

alter table public.contracting_deals
  add column if not exists second_party_status text not null default 'pending'
    check (second_party_status in ('pending','accepted','declined'));

-- =========================================================
-- 3) RPCs
-- =========================================================
create or replace function public.create_contracting_deal(
  _entity_id uuid,
  _title text,
  _party_kind text,
  _identifier_fingerprint text,   -- for person (computed server-side)
  _identifier_last4 text,
  _cr_number text,                -- for entity
  _display_name text,
  _context_type text,
  _context_id uuid,
  _amount numeric,
  _currency text,
  _notes text
) returns uuid
language plpgsql security definer set search_path to '' as $$
declare
  _uid uuid := auth.uid();
  _deal_id uuid;
  _match_user uuid;
  _match_entity uuid;
  _registered boolean := false;
  _first_name text;
begin
  if _uid is null then raise exception 'UNAUTHENTICATED' using errcode = '42501'; end if;
  if _party_kind not in ('person','entity') then raise exception 'INVALID_PARTY_KIND'; end if;
  if coalesce(btrim(_display_name), '') = '' then raise exception 'SECOND_PARTY_NAME_REQUIRED'; end if;

  if _entity_id is not null and not exists (
      select 1 from public.entity_memberships m
      where m.entity_id = _entity_id and m.user_id = _uid and m.status = 'active') then
    raise exception 'NOT_ENTITY_MEMBER' using errcode = '42501';
  end if;

  if _party_kind = 'person' then
    if coalesce(_identifier_fingerprint, '') = '' then raise exception 'SECOND_PARTY_ID_REQUIRED'; end if;
    select l.user_id into _match_user from private.personal_identity_links l
      where l.id_fingerprint = _identifier_fingerprint;
    if _match_user = _uid then raise exception 'SECOND_PARTY_IS_SELF'; end if;
    _registered := _match_user is not null;
  else
    if private.to_ascii_digits(coalesce(_cr_number,'')) !~ '^[0-9]{10}$' then
      raise exception 'SECOND_PARTY_CR_INVALID';
    end if;
    _cr_number := private.to_ascii_digits(_cr_number);
    select p.entity_id into _match_entity from public.entity_profiles p
      where p.cr_number = _cr_number
         or p.unified_national_number = _cr_number
      limit 1;
    if _match_entity is not null and _match_entity = _entity_id then raise exception 'SECOND_PARTY_IS_SELF'; end if;
    _registered := _match_entity is not null;
  end if;

  insert into public.contracting_deals
    (entity_id, owner_user_id, title, counterparty_name, context_type, context_id,
     amount, currency, notes, created_by, second_party_status)
  values (_entity_id, _uid, _title, _display_name, coalesce(_context_type,'other'), _context_id,
          _amount, coalesce(_currency,'SAR'), _notes, _uid, 'pending')
  returning id into _deal_id;

  select coalesce(e.name, pr.full_name, 'الطرف الأول') into _first_name
  from (select 1) x
  left join public.entities e on e.id = _entity_id
  left join public.profiles pr on pr.id = _uid;

  insert into public.deal_parties
    (deal_id, party_role, party_kind, matched_user_id, matched_entity_id, display_name,
     is_registered, acceptance_status, responded_at, responded_by)
  values (_deal_id, 'first', case when _entity_id is null then 'person' else 'entity' end,
          case when _entity_id is null then _uid else null end, _entity_id,
          coalesce(_first_name, 'الطرف الأول'), true, 'accepted', now(), _uid);

  insert into public.deal_parties
    (deal_id, party_role, party_kind, identifier_kind, identifier_fingerprint, identifier_last4,
     cr_number, matched_user_id, matched_entity_id, display_name, is_registered)
  values (_deal_id, 'second', _party_kind,
          case when _party_kind = 'person' then 'national_id' else 'cr_number' end,
          case when _party_kind = 'person' then _identifier_fingerprint else null end,
          case when _party_kind = 'person' then _identifier_last4 else null end,
          case when _party_kind = 'entity' then _cr_number else null end,
          _match_user, _match_entity, btrim(_display_name), _registered);

  return _deal_id;
end $$;

create or replace function public.respond_contracting_deal(_deal_id uuid, _accept boolean)
returns text
language plpgsql security definer set search_path to '' as $$
declare _uid uuid := auth.uid(); _p record; _new text;
begin
  if _uid is null then raise exception 'UNAUTHENTICATED' using errcode = '42501'; end if;
  select * into _p from public.deal_parties
   where deal_id = _deal_id and party_role = 'second' for update;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;

  if not (
    _p.matched_user_id = _uid
    or (_p.matched_entity_id is not null and exists (
          select 1 from public.entity_memberships m
          where m.entity_id = _p.matched_entity_id and m.user_id = _uid and m.status = 'active'))
  ) then
    raise exception 'NOT_SECOND_PARTY' using errcode = '42501';
  end if;

  _new := case when _accept then 'accepted' else 'declined' end;
  update public.deal_parties set acceptance_status = _new, responded_at = now(),
         responded_by = _uid, updated_at = now()
   where id = _p.id;
  update public.contracting_deals set second_party_status = _new, updated_at = now()
   where id = _deal_id;
  return _new;
end $$;

-- guard: no agreement/signature before the second party accepts
create or replace function private.enforce_deal_second_party()
returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.status in ('agreed','signed') and coalesce(new.second_party_status,'pending') <> 'accepted' then
    raise exception 'SECOND_PARTY_NOT_ACCEPTED';
  end if;
  return new;
end $$;

drop trigger if exists trg_deal_second_party on public.contracting_deals;
create trigger trg_deal_second_party
  before insert or update on public.contracting_deals
  for each row execute function private.enforce_deal_second_party();

revoke all on function public.create_contracting_deal(uuid, text, text, text, text, text, text, text, uuid, numeric, text, text) from public, anon;
revoke all on function public.respond_contracting_deal(uuid, boolean) from public, anon;
revoke all on function private.enforce_deal_second_party() from public, anon;
grant execute on function public.create_contracting_deal(uuid, text, text, text, text, text, text, text, uuid, numeric, text, text) to authenticated, service_role;
grant execute on function public.respond_contracting_deal(uuid, boolean) to authenticated, service_role;
grant execute on function private.enforce_deal_second_party() to authenticated, service_role;