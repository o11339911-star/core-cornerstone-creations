-- ---------- audit helper ----------
create or replace function private.log_media(_object_type text, _object_id uuid, _action text, _project_id uuid, _new jsonb)
returns void language sql security definer set search_path to 'public' as $$
  insert into public.permission_audit_log(actor_user_id, target_project_id, object_type, object_id, action, new_value)
  values (auth.uid(), _project_id, _object_type, _object_id, _action, _new);
$$;

-- ---------- shoot lifecycle ----------
create or replace function public.request_media_shoot(_project_id uuid, _property_id uuid default null, _scheduled_at timestamptz default null, _notes text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not private.can(auth.uid(), 'media', 'create', null, _project_id) then raise exception 'MEDIA_FORBIDDEN'; end if;
  perform private.assert_project_open(_project_id);
  insert into public.media_shoot_requests(project_id, property_id, requested_by, scheduled_at, notes,
    status)
  values (_project_id, _property_id, auth.uid(), _scheduled_at, _notes,
    case when _scheduled_at is null then 'requested' else 'scheduled' end)
  returning id into v_id;
  perform private.log_media('media_shoot_requests', v_id, 'request', _project_id, jsonb_build_object('scheduled_at', _scheduled_at));
  return v_id;
end; $$;

create or replace function public.assign_media_photographer(_shoot_id uuid, _photographer_entity_id uuid default null, _photographer_user_id uuid default null, _scheduled_at timestamptz default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_pid uuid;
begin
  select project_id into v_pid from public.media_shoot_requests where id = _shoot_id;
  if v_pid is null then raise exception 'SHOOT_NOT_FOUND'; end if;
  if not private.can(auth.uid(), 'media', 'approve', null, v_pid) then raise exception 'MEDIA_FORBIDDEN'; end if;
  if _photographer_entity_id is null and _photographer_user_id is null then raise exception 'PHOTOGRAPHER_REQUIRED'; end if;
  perform private.assert_project_open(v_pid);
  update public.media_shoot_requests
     set photographer_entity_id = coalesce(_photographer_entity_id, photographer_entity_id),
         photographer_user_id = coalesce(_photographer_user_id, photographer_user_id),
         scheduled_at = coalesce(_scheduled_at, scheduled_at),
         status = case when status = 'requested' then 'scheduled' else status end
   where id = _shoot_id;
  perform private.log_media('media_shoot_requests', _shoot_id, 'assign', v_pid,
    jsonb_build_object('entity_id', _photographer_entity_id, 'user_id', _photographer_user_id));
end; $$;

create or replace function public.check_in_media_shoot(_shoot_id uuid, _lat numeric default null, _lng numeric default null, _accuracy_m numeric default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_pid uuid; v_id uuid;
begin
  select project_id into v_pid from public.media_shoot_requests where id = _shoot_id;
  if v_pid is null then raise exception 'SHOOT_NOT_FOUND'; end if;
  if not private.is_media_photographer(auth.uid(), v_pid) then raise exception 'NOT_ASSIGNED_PHOTOGRAPHER'; end if;
  perform private.assert_project_open(v_pid);
  insert into public.media_shoot_attendance(shoot_id, user_id, lat, lng, accuracy_m)
  values (_shoot_id, auth.uid(), _lat, _lng, _accuracy_m) returning id into v_id;
  update public.media_shoot_requests set status = 'in_progress' where id = _shoot_id and status in ('requested','scheduled');
  perform private.log_media('media_shoot_attendance', v_id, 'check_in', v_pid, jsonb_build_object('has_geo', _lat is not null));
  return v_id;
end; $$;

-- ---------- assets ----------
create or replace function public.register_media_asset(_shoot_id uuid, _title text, _raw_object_path text, _kind text default 'panorama_360', _checksum text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_pid uuid; v_id uuid;
begin
  select project_id into v_pid from public.media_shoot_requests where id = _shoot_id;
  if v_pid is null then raise exception 'SHOOT_NOT_FOUND'; end if;
  if not private.can(auth.uid(), 'media', 'create', null, v_pid) then raise exception 'MEDIA_FORBIDDEN'; end if;
  if coalesce(trim(_title),'') = '' then raise exception 'TITLE_REQUIRED'; end if;
  if _raw_object_path not like v_pid::text || '/%' then raise exception 'BAD_OBJECT_PATH'; end if;
  perform private.assert_project_open(v_pid);
  insert into public.media_assets(shoot_id, project_id, kind, title, raw_object_path, created_by)
  values (_shoot_id, v_pid, _kind, trim(_title), _raw_object_path, auth.uid()) returning id into v_id;
  insert into public.media_asset_versions(asset_id, version_no, object_path, is_blurred, checksum, created_by)
  values (v_id, 1, _raw_object_path, false, _checksum, auth.uid());
  perform private.log_media('media_assets', v_id, 'register', v_pid, jsonb_build_object('kind', _kind));
  return v_id;
end; $$;

create or replace function public.attach_blurred_media_version(_asset_id uuid, _object_path text, _ack_text text, _checksum text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_pid uuid; v_next int;
begin
  select project_id into v_pid from public.media_assets where id = _asset_id;
  if v_pid is null then raise exception 'ASSET_NOT_FOUND'; end if;
  if not private.can(auth.uid(), 'media', 'update', null, v_pid) then raise exception 'MEDIA_FORBIDDEN'; end if;
  if length(coalesce(trim(_ack_text),'')) < 10 then raise exception 'BLUR_ACK_REQUIRED'; end if;
  if _object_path not like v_pid::text || '/%' then raise exception 'BAD_OBJECT_PATH'; end if;
  perform private.assert_project_open(v_pid);
  select coalesce(max(version_no),0) + 1 into v_next from public.media_asset_versions where asset_id = _asset_id;
  insert into public.media_asset_versions(asset_id, version_no, object_path, is_blurred, checksum, created_by)
  values (_asset_id, v_next, _object_path, true, _checksum, auth.uid());
  update public.media_assets
     set blurred_object_path = _object_path, blur_ack_by = auth.uid(), blur_ack_at = now(), blur_ack_text = trim(_ack_text)
   where id = _asset_id;
  perform private.log_media('media_asset_versions', _asset_id, 'blur_ack', v_pid, jsonb_build_object('version_no', v_next));
end; $$;

create or replace function public.submit_media_asset(_asset_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare a public.media_assets;
begin
  select * into a from public.media_assets where id = _asset_id;
  if a.id is null then raise exception 'ASSET_NOT_FOUND'; end if;
  if not private.can(auth.uid(), 'media', 'update', null, a.project_id) then raise exception 'MEDIA_FORBIDDEN'; end if;
  if a.status not in ('draft','rejected') then raise exception 'BAD_STATUS'; end if;
  if a.blurred_object_path is null or a.blur_ack_at is null then raise exception 'BLUR_REQUIRED'; end if;
  perform private.assert_project_open(a.project_id);
  update public.media_assets set status = 'pending_review', submitted_by = auth.uid(), submitted_at = now(),
    reviewed_by = null, reviewed_at = null, rejection_reason = null where id = _asset_id;
  perform private.log_media('media_assets', _asset_id, 'submit', a.project_id, '{}'::jsonb);
end; $$;

create or replace function public.review_media_asset(_asset_id uuid, _approve boolean, _reason text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare a public.media_assets;
begin
  select * into a from public.media_assets where id = _asset_id;
  if a.id is null then raise exception 'ASSET_NOT_FOUND'; end if;
  if not private.can(auth.uid(), 'media', 'update', null, a.project_id) then raise exception 'MEDIA_FORBIDDEN'; end if;
  if a.status <> 'pending_review' then raise exception 'BAD_STATUS'; end if;
  if a.submitted_by = auth.uid() then raise exception 'MEDIA_SOD_VIOLATION'; end if;
  if not _approve and length(coalesce(trim(_reason),'')) < 5 then raise exception 'REASON_REQUIRED'; end if;
  perform private.assert_project_open(a.project_id);
  update public.media_assets
     set status = case when _approve then 'review_approved' else 'rejected' end,
         reviewed_by = auth.uid(), reviewed_at = now(),
         rejection_reason = case when _approve then null else trim(_reason) end
   where id = _asset_id;
  perform private.log_media('media_assets', _asset_id, case when _approve then 'review_approve' else 'review_reject' end, a.project_id, jsonb_build_object('reason', _reason));
end; $$;

create or replace function public.approve_media_asset(_asset_id uuid, _approve boolean, _reason text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare a public.media_assets;
begin
  select * into a from public.media_assets where id = _asset_id;
  if a.id is null then raise exception 'ASSET_NOT_FOUND'; end if;
  if not private.can(auth.uid(), 'media', 'approve', null, a.project_id) then raise exception 'MEDIA_FORBIDDEN'; end if;
  if a.status <> 'review_approved' then raise exception 'BAD_STATUS'; end if;
  if auth.uid() in (a.submitted_by, a.reviewed_by) then raise exception 'MEDIA_SOD_VIOLATION'; end if;
  if not _approve and length(coalesce(trim(_reason),'')) < 5 then raise exception 'REASON_REQUIRED'; end if;
  perform private.assert_project_open(a.project_id);
  update public.media_assets
     set status = case when _approve then 'owner_approved' else 'rejected' end,
         approved_by = case when _approve then auth.uid() else null end,
         approved_at = case when _approve then now() else null end,
         rejection_reason = case when _approve then null else trim(_reason) end
   where id = _asset_id;
  perform private.log_media('media_assets', _asset_id, case when _approve then 'owner_approve' else 'owner_reject' end, a.project_id, jsonb_build_object('reason', _reason));
end; $$;

create or replace function public.withdraw_media_asset(_asset_id uuid, _reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare a public.media_assets;
begin
  select * into a from public.media_assets where id = _asset_id;
  if a.id is null then raise exception 'ASSET_NOT_FOUND'; end if;
  if not private.can(auth.uid(), 'media', 'approve', null, a.project_id) then raise exception 'MEDIA_FORBIDDEN'; end if;
  if length(coalesce(trim(_reason),'')) < 5 then raise exception 'REASON_REQUIRED'; end if;
  update public.media_assets set status = 'withdrawn', rejection_reason = trim(_reason) where id = _asset_id;
  perform private.log_media('media_assets', _asset_id, 'withdraw', a.project_id, jsonb_build_object('reason', _reason));
end; $$;

-- ---------- publication ----------
create or replace function public.publish_media_asset(_asset_id uuid, _public_object_path text)
returns text language plpgsql security definer set search_path to 'public' as $$
declare a public.media_assets; v_token text;
begin
  select * into a from public.media_assets where id = _asset_id;
  if a.id is null then raise exception 'ASSET_NOT_FOUND'; end if;
  if not private.can(auth.uid(), 'media', 'share', null, a.project_id) then raise exception 'MEDIA_FORBIDDEN'; end if;
  if a.status <> 'owner_approved' then raise exception 'NOT_APPROVED'; end if;
  if _public_object_path not like a.project_id::text || '/%' then raise exception 'BAD_OBJECT_PATH'; end if;
  perform private.assert_project_open(a.project_id);
  v_token := encode(gen_random_bytes(18), 'hex');
  insert into public.media_publications(asset_id, project_id, public_token, public_object_path, published_by)
  values (_asset_id, a.project_id, v_token, _public_object_path, auth.uid());
  perform private.log_media('media_publications', _asset_id, 'publish', a.project_id, '{}'::jsonb);
  return v_token;
end; $$;

create or replace function public.revoke_media_publication(_publication_id uuid, _reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare p public.media_publications;
begin
  select * into p from public.media_publications where id = _publication_id;
  if p.id is null then raise exception 'PUBLICATION_NOT_FOUND'; end if;
  if not private.can(auth.uid(), 'media', 'share', null, p.project_id) then raise exception 'MEDIA_FORBIDDEN'; end if;
  if length(coalesce(trim(_reason),'')) < 5 then raise exception 'REASON_REQUIRED'; end if;
  update public.media_publications set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = trim(_reason)
   where id = _publication_id and revoked_at is null;
  perform private.log_media('media_publications', _publication_id, 'revoke', p.project_id, jsonb_build_object('reason', _reason));
end; $$;

-- ---------- public verification (uniform null) ----------
create or replace function public.get_public_media(_token text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare r record;
begin
  if _token is null or length(_token) < 8 then return null; end if;
  select a.title, a.kind, p.published_at into r
  from public.media_publications p
  join public.media_assets a on a.id = p.asset_id
  where p.public_token = _token and p.revoked_at is null and a.status = 'owner_approved';
  if not found then return null; end if;
  return jsonb_build_object('title', r.title, 'kind', r.kind, 'published_at', r.published_at);
end; $$;

-- object path resolution is server-only (service_role signs the URL)
create or replace function public.resolve_public_media_object(_token text)
returns text language plpgsql stable security definer set search_path to 'public' as $$
declare v text;
begin
  select p.public_object_path into v
  from public.media_publications p
  join public.media_assets a on a.id = p.asset_id
  where p.public_token = _token and p.revoked_at is null and a.status = 'owner_approved';
  return v;
end; $$;

-- ---------- storage policies: raw bucket ----------
create policy media_raw_read on storage.objects for select to authenticated
using (bucket_id = 'media-360-raw'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and private.can(auth.uid(), 'media'::app_module, 'view'::app_action, null, ((storage.foldername(name))[1])::uuid));

create policy media_raw_write on storage.objects for insert to authenticated
with check (bucket_id = 'media-360-raw'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and private.can(auth.uid(), 'media'::app_module, 'create'::app_action, null, ((storage.foldername(name))[1])::uuid));

-- ---------- execute grants ----------
revoke execute on function private.log_media(text, uuid, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.request_media_shoot(uuid, uuid, timestamptz, text) from public, anon;
revoke execute on function public.assign_media_photographer(uuid, uuid, uuid, timestamptz) from public, anon;
revoke execute on function public.check_in_media_shoot(uuid, numeric, numeric, numeric) from public, anon;
revoke execute on function public.register_media_asset(uuid, text, text, text, text) from public, anon;
revoke execute on function public.attach_blurred_media_version(uuid, text, text, text) from public, anon;
revoke execute on function public.submit_media_asset(uuid) from public, anon;
revoke execute on function public.review_media_asset(uuid, boolean, text) from public, anon;
revoke execute on function public.approve_media_asset(uuid, boolean, text) from public, anon;
revoke execute on function public.withdraw_media_asset(uuid, text) from public, anon;
revoke execute on function public.publish_media_asset(uuid, text) from public, anon;
revoke execute on function public.revoke_media_publication(uuid, text) from public, anon;
revoke execute on function public.resolve_public_media_object(text) from public, anon, authenticated;
revoke execute on function public.get_public_media(text) from public;

grant execute on function public.request_media_shoot(uuid, uuid, timestamptz, text),
  public.assign_media_photographer(uuid, uuid, uuid, timestamptz),
  public.check_in_media_shoot(uuid, numeric, numeric, numeric),
  public.register_media_asset(uuid, text, text, text, text),
  public.attach_blurred_media_version(uuid, text, text, text),
  public.submit_media_asset(uuid),
  public.review_media_asset(uuid, boolean, text),
  public.approve_media_asset(uuid, boolean, text),
  public.withdraw_media_asset(uuid, text),
  public.publish_media_asset(uuid, text),
  public.revoke_media_publication(uuid, text)
to authenticated;
grant execute on function public.get_public_media(text) to anon, authenticated;
grant execute on function public.resolve_public_media_object(text) to service_role;