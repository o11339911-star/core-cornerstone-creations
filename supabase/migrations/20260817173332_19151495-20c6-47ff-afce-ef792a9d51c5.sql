create or replace function public.set_entity_classification(
  _entity_id uuid,
  _legal_form_code text default null,
  _set_legal_form boolean default false,
  _apply_activities boolean default false,
  _primary_code text default null,
  _secondary_codes text[] default '{}',
  _version text default 'NCEA-2023-ISIC4'
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  _uid uuid := auth.uid();
  _codes text[];
begin
  if _uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not private.can(_uid, 'members'::public.app_module, 'manage_members'::public.app_action, _entity_id, null::uuid) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (select 1 from public.entities where id = _entity_id) then
    raise exception 'TARGET_NOT_FOUND' using errcode = '22023';
  end if;

  if _set_legal_form then
    if _legal_form_code is not null and not exists (
      select 1 from public.legal_forms lf where lf.code = _legal_form_code and lf.active
    ) then
      raise exception 'INVALID_LEGAL_FORM' using errcode = '22023';
    end if;

    insert into public.entity_profiles (entity_id, legal_form_code)
    values (_entity_id, _legal_form_code)
    on conflict (entity_id) do update set legal_form_code = excluded.legal_form_code;
  end if;

  if _apply_activities then
    _codes := (
      select coalesce(array_agg(distinct c), '{}')
      from unnest(coalesce(_secondary_codes, '{}') || case when _primary_code is null then '{}'::text[] else array[_primary_code] end) as c
      where c is not null and btrim(c) <> ''
    );

    if array_length(_codes, 1) is not null and exists (
      select 1 from unnest(_codes) c
      where not exists (
        select 1 from public.economic_activities ea
        where ea.code = c and ea.version = _version
      )
    ) then
      raise exception 'INVALID_ACTIVITY_CODE' using errcode = '22023';
    end if;

    delete from public.entity_activities a
      where a.entity_id = _entity_id
        and not (a.activity_code = any (_codes));

    -- إلغاء الأساسي القديم أولًا (قيد: نشاط أساسي واحد لكل كيان)
    update public.entity_activities a
       set is_primary = false, updated_at = now()
     where a.entity_id = _entity_id
       and a.is_primary
       and (_primary_code is null or a.activity_code <> _primary_code);

    insert into public.entity_activities (entity_id, activity_version, activity_code, is_primary, created_by)
    select _entity_id, _version, c, false, _uid
      from unnest(_codes) c
      where not exists (
        select 1 from public.entity_activities e
        where e.entity_id = _entity_id and e.activity_code = c
      );

    update public.entity_activities a
       set is_primary = (a.activity_code = _primary_code),
           activity_version = _version,
           updated_at = now()
     where a.entity_id = _entity_id
       and (a.is_primary is distinct from (_primary_code is not null and a.activity_code = _primary_code)
            or a.activity_version is distinct from _version);
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.set_entity_classification(uuid, text, boolean, boolean, text, text[], text) from public, anon;
grant execute on function public.set_entity_classification(uuid, text, boolean, boolean, text, text[], text) to authenticated;