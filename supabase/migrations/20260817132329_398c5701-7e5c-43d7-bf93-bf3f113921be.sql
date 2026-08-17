alter table public.deal_parties alter column display_name drop not null;

create or replace function public.create_contracting_deal(_entity_id uuid, _title text, _party_kind text, _identifier_fingerprint text, _identifier_last4 text, _cr_number text, _display_name text, _context_type text, _context_id uuid, _amount numeric, _currency text, _notes text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  _uid uuid := auth.uid();
  _deal_id uuid;
  _match_user uuid;
  _match_entity uuid;
  _registered boolean := false;
  _first_name text;
  _second_name text;
begin
  if _uid is null then raise exception 'UNAUTHENTICATED' using errcode = '42501'; end if;
  if _party_kind not in ('person','entity') then raise exception 'INVALID_PARTY_KIND'; end if;

  -- الاسم اختياري: يُطبَّع إلى null عند الفراغ ولا يُستبدل بأي اسم وهمي.
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
    -- الخادم هو المصدر النهائي للاسم عند وجود مطابقة.
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
          _match_user, _match_entity, _second_name, _registered);

  return _deal_id;
end $function$;

revoke execute on function public.create_contracting_deal(uuid, text, text, text, text, text, text, text, uuid, numeric, text, text) from public, anon;
grant execute on function public.create_contracting_deal(uuid, text, text, text, text, text, text, text, uuid, numeric, text, text) to authenticated;