create or replace function public.invite_project_party(
  _project_id uuid,
  _party_entity_id uuid,
  _party_role public.project_party_role,
  _scope_text_ar text default null,
  _scope_text_en text default null,
  _starts_on date default current_date,
  _ends_on date default null,
  _stage_ids uuid[] default '{}'::uuid[],
  _permissions jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if _party_entity_id is null then raise exception 'IDENTIFIER_REQUIRED' using errcode = '22023'; end if;
  return private.invite_project_party_core(
    _project_id, 'entity', null, null, null, null,
    _party_entity_id, null, null, _party_role,
    _scope_text_ar, _scope_text_en, _starts_on, _ends_on, _stage_ids, _permissions);
end $function$;

revoke all on function public.invite_project_party(uuid, uuid, public.project_party_role, text, text, date, date, uuid[], jsonb) from public, anon;
grant execute on function public.invite_project_party(uuid, uuid, public.project_party_role, text, text, date, date, uuid[], jsonb) to authenticated;