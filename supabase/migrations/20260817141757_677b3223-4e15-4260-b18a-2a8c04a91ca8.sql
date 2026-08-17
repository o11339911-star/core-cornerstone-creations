create or replace function public.deal_requester_details(_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
    -- لا يخرج أي cipher أو بصمة أو معرّف مستخدم من private عبر هذه الدالة.
    _out := jsonb_build_object(
      'found', true,
      'kind', 'person',
      'name', coalesce(_p.display_name, (select nullif(btrim(coalesce(pr.full_name,'')),'')
                                           from public.profiles pr where pr.id = _p.matched_user_id)),
      'last4', coalesce(_p.identifier_last4,
                        (select l.last4 from private.personal_identity_links l
                          where l.user_id = _p.matched_user_id))
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

revoke execute on function public.deal_requester_details(uuid) from public, anon;
grant execute on function public.deal_requester_details(uuid) to authenticated;

revoke execute on function public.svc_identity_cipher(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.svc_identity_cipher(uuid, uuid) from public, anon, authenticated;