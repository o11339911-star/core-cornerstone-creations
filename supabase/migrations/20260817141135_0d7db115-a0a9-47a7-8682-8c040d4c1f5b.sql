-- ============ 1) الرقم المرجعي المركزي ============
alter table public.contracting_deals add column if not exists reference_no text;

update public.contracting_deals
   set reference_no = 'REQ-' || lpad(nextval('public.request_no_seq')::text, 6, '0')
 where reference_no is null;

alter table public.contracting_deals
  alter column reference_no set default ('REQ-' || lpad(nextval('public.request_no_seq')::text, 6, '0'));
alter table public.contracting_deals alter column reference_no set not null;
create unique index if not exists contracting_deals_reference_no_key
  on public.contracting_deals (reference_no);

create or replace function private.guard_deal_reference_no()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.reference_no is distinct from old.reference_no then
    raise exception 'REFERENCE_NO_IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.guard_deal_reference_no() from public;

drop trigger if exists trg_deal_reference_no_immutable on public.contracting_deals;
create trigger trg_deal_reference_no_immutable
  before update on public.contracting_deals
  for each row execute function private.guard_deal_reference_no();

-- ============ 2) بيانات تعريف الطرف الأول (طالب الخدمة) ============
-- شخص: آخر أربعة أرقام من الهوية المسجلة رسميًا فقط.
update public.deal_parties p
   set identifier_kind = 'national_id',
       identifier_last4 = l.last4
  from private.personal_identity_links l
 where p.party_role = 'first'
   and p.party_kind = 'person'
   and p.matched_user_id = l.user_id
   and p.identifier_last4 is null;

-- منشأة: السجل التجاري أو الرقم الوطني الموحّد من ملف المنشأة.
update public.deal_parties p
   set identifier_kind = 'cr_number',
       cr_number = coalesce(ep.cr_number, ep.unified_national_number)
  from public.entity_profiles ep
 where p.party_role = 'first'
   and p.party_kind = 'entity'
   and p.matched_entity_id = ep.entity_id
   and p.cr_number is null
   and coalesce(ep.cr_number, ep.unified_national_number) is not null;

-- ============ 3) إنشاء المعاملة: تسجيل معرّف الطرف الأول خادميًا ============
create or replace function public.create_contracting_deal(
  _entity_id uuid, _title text, _party_kind text, _identifier_fingerprint text,
  _identifier_last4 text, _cr_number text, _display_name text, _context_type text,
  _context_id uuid, _amount numeric, _currency text, _notes text)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  _uid uuid := auth.uid();
  _deal_id uuid;
  _match_user uuid;
  _match_entity uuid;
  _registered boolean := false;
  _first_name text;
  _first_kind text;
  _first_last4 text;
  _first_cr text;
  _second_name text;
begin
  if _uid is null then raise exception 'UNAUTHENTICATED' using errcode = '42501'; end if;
  if _party_kind not in ('person','entity') then raise exception 'INVALID_PARTY_KIND'; end if;

  _second_name := nullif(btrim(coalesce(_display_name, '')), '');

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
    if _match_user is not null then
      select nullif(btrim(coalesce(pr.full_name, '')), '') into _second_name
        from public.profiles pr where pr.id = _match_user;
      if _second_name is null then
        _second_name := nullif(btrim(coalesce(_display_name, '')), '');
      end if;
    end if;
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
    if _match_entity is not null then
      select nullif(btrim(coalesce(p.legal_name_ar, p.legal_name_en, e.name, '')), '')
        into _second_name
        from public.entities e
        left join public.entity_profiles p on p.entity_id = e.id
        where e.id = _match_entity;
      if _second_name is null then
        _second_name := nullif(btrim(coalesce(_display_name, '')), '');
      end if;
    end if;
  end if;

  insert into public.contracting_deals
    (entity_id, owner_user_id, title, counterparty_name, context_type, context_id,
     amount, currency, notes, created_by, second_party_status)
  values (_entity_id, _uid, _title, _second_name, coalesce(_context_type,'other'), _context_id,
          _amount, coalesce(_currency,'SAR'), _notes, _uid, 'pending')
  returning id into _deal_id;

  -- طالب الخدمة (الطرف الأول): الاسم والمعرّف من المصادر الرسمية فقط، بلا قيم وهمية.
  _first_kind := case when _entity_id is null then 'person' else 'entity' end;
  if _first_kind = 'person' then
    select nullif(btrim(coalesce(pr.full_name, '')), '') into _first_name
      from public.profiles pr where pr.id = _uid;
    select l.last4 into _first_last4
      from private.personal_identity_links l where l.user_id = _uid;
  else
    select nullif(btrim(coalesce(ep.legal_name_ar, ep.legal_name_en, e.name, '')), ''),
           coalesce(ep.cr_number, ep.unified_national_number)
      into _first_name, _first_cr
      from public.entities e
      left join public.entity_profiles ep on ep.entity_id = e.id
      where e.id = _entity_id;
  end if;

  insert into public.deal_parties
    (deal_id, party_role, party_kind, identifier_kind, identifier_last4, cr_number,
     matched_user_id, matched_entity_id, display_name,
     is_registered, acceptance_status, responded_at, responded_by)
  values (_deal_id, 'first', _first_kind,
          case when _first_kind = 'person' then 'national_id' else 'cr_number' end,
          _first_last4, _first_cr,
          case when _entity_id is null then _uid else null end, _entity_id,
          _first_name, true, 'accepted', now(), _uid);

  insert into public.deal_parties
    (deal_id, party_role, party_kind, identifier_kind, identifier_fingerprint, identifier_last4,
     cr_number, matched_user_id, matched_entity_id, display_name, is_registered)
  values (_deal_id, 'second', _party_kind,
          case when _party_kind = 'person' then 'national_id' else 'cr_number' end,
          case when _party_kind = 'person' then _identifier_fingerprint else null end,
          case when _party_kind = 'person' then _identifier_last4 else null end,
          case when _party_kind = 'entity' then _cr_number else null end,
          _match_user, _match_entity, _second_name, _registered);

  return _deal_id;
end $function$;

revoke all on function public.create_contracting_deal(uuid, text, text, text, text, text, text, text, uuid, numeric, text, text) from public, anon;
grant execute on function public.create_contracting_deal(uuid, text, text, text, text, text, text, text, uuid, numeric, text, text) to authenticated;

-- ============ 4) تفاصيل طالب الخدمة عند فتح معاملة محددة ============
create or replace function public.deal_requester_details(_deal_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  _uid uuid := auth.uid();
  _p record;
  _out jsonb;
begin
  if _uid is null then raise exception 'UNAUTHENTICATED' using errcode = '42501'; end if;
  if not private.deal_visible(_deal_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select party_kind, display_name, matched_user_id, matched_entity_id, identifier_last4, cr_number
    into _p
    from public.deal_parties
   where deal_id = _deal_id and party_role = 'first'
   limit 1;

  if not found then return jsonb_build_object('found', false); end if;

  if _p.party_kind = 'person' then
    _out := jsonb_build_object(
      'found', true,
      'kind', 'person',
      'name', coalesce(_p.display_name, (select nullif(btrim(coalesce(pr.full_name,'')),'')
                                           from public.profiles pr where pr.id = _p.matched_user_id)),
      'last4', coalesce(_p.identifier_last4,
                        (select l.last4 from private.personal_identity_links l
                          where l.user_id = _p.matched_user_id)),
      'id_cipher', (select l.id_cipher from private.personal_identity_links l
                     where l.user_id = _p.matched_user_id)
    );
    perform private.log_identity_access(_uid, 'deal_requester_reveal:' || _deal_id::text,
                                        _p.matched_user_id, 1);
  else
    _out := jsonb_build_object(
      'found', true,
      'kind', 'entity',
      'name', coalesce(_p.display_name,
                       (select nullif(btrim(coalesce(ep.legal_name_ar, ep.legal_name_en, e.name,'')),'')
                          from public.entities e
                          left join public.entity_profiles ep on ep.entity_id = e.id
                         where e.id = _p.matched_entity_id)),
      'cr_number', coalesce(_p.cr_number, (select ep.cr_number from public.entity_profiles ep
                                            where ep.entity_id = _p.matched_entity_id)),
      'unified_national_number', (select ep.unified_national_number from public.entity_profiles ep
                                   where ep.entity_id = _p.matched_entity_id)
    );
  end if;

  return _out;
end $function$;

revoke all on function public.deal_requester_details(uuid) from public, anon;
grant execute on function public.deal_requester_details(uuid) to authenticated;