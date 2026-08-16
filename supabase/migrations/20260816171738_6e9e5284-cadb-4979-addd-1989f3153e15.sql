create or replace function public.publish_service_listing(
  _entity_id uuid,
  _service_kind text,
  _title text,
  _description text,
  _areas jsonb default '[]'::jsonb,
  _price_min numeric default null,
  _price_max numeric default null,
  _publish boolean default true,
  _project_id uuid default null,
  _request_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_id uuid; a jsonb; v_ok boolean;
begin
  perform private.require_member(_entity_id);
  perform private.require_writable(_entity_id);

  if _project_id is not null then
    select exists(
      select 1 from public.projects p
      where p.id = _project_id and p.entity_id = _entity_id and p.deleted_at is null
    ) into v_ok;
    if not v_ok then
      raise exception 'PROJECT_OUT_OF_SCOPE' using errcode = '42501';
    end if;
  end if;

  if _request_id is not null then
    select exists(
      select 1 from public.requests r
      left join public.projects p on p.id = r.project_id
      where r.id = _request_id
        and (r.assigned_entity_id = _entity_id or p.entity_id = _entity_id)
    ) into v_ok;
    if not v_ok then
      raise exception 'REQUEST_OUT_OF_SCOPE' using errcode = '42501';
    end if;
  end if;

  insert into public.service_listings(entity_id, created_by, service_kind, title, description,
    price_min, price_max, status, published_at, project_id, request_id)
  values (_entity_id, auth.uid(), _service_kind, _title, _description, _price_min, _price_max,
          case when _publish then 'published' else 'draft' end,
          case when _publish then now() else null end,
          _project_id, _request_id)
  returning id into v_id;

  for a in select * from jsonb_array_elements(coalesce(_areas,'[]'::jsonb)) loop
    insert into public.service_listing_areas(listing_id, country_code, region, city)
    values (v_id, upper(coalesce(a->>'country_code','SA')), a->>'region', a->>'city');
  end loop;

  return v_id;
end;
$function$;

revoke all on function public.publish_service_listing(uuid, text, text, text, jsonb, numeric, numeric, boolean, uuid, uuid) from public, anon;
grant execute on function public.publish_service_listing(uuid, text, text, text, jsonb, numeric, numeric, boolean, uuid, uuid) to authenticated;

revoke insert, update, delete, truncate on public.service_listings from anon, authenticated;
revoke select on public.service_listings from anon;