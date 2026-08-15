create or replace function public.publish_media_asset(_asset_id uuid, _public_object_path text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare a public.media_assets; v_token text;
begin
  select * into a from public.media_assets where id = _asset_id;
  if a.id is null then raise exception 'ASSET_NOT_FOUND'; end if;
  if not private.can(auth.uid(), 'media', 'share', null, a.project_id) then raise exception 'MEDIA_FORBIDDEN'; end if;
  if a.status <> 'owner_approved' then raise exception 'NOT_APPROVED'; end if;
  if _public_object_path not like a.project_id::text || '/%' then raise exception 'BAD_OBJECT_PATH'; end if;
  perform private.assert_project_open(a.project_id);
  v_token := encode(extensions.gen_random_bytes(18), 'hex');
  insert into public.media_publications(asset_id, project_id, public_token, public_object_path, published_by)
  values (_asset_id, a.project_id, v_token, _public_object_path, auth.uid());
  perform private.log_media('media_publications', _asset_id, 'publish', a.project_id, '{}'::jsonb);
  return v_token;
end; $function$;

revoke execute on function public.publish_media_asset(uuid, text) from public, anon;
grant execute on function public.publish_media_asset(uuid, text) to authenticated;