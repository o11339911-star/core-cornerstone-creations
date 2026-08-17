-- ============ 1) أعمدة جديدة على معاملات التعاقد ============
alter table public.contracting_deals
  add column if not exists recipient_status text not null default 'pending',
  add column if not exists recipient_response_reason text,
  add column if not exists recipient_responded_at timestamptz,
  add column if not exists recipient_responded_by uuid,
  add column if not exists resubmitted_from_id uuid references public.contracting_deals(id) on delete set null,
  add column if not exists project_id uuid references public.projects(id) on delete set null;

alter table public.contracting_deals
  drop constraint if exists contracting_deals_recipient_status_check;
alter table public.contracting_deals
  add constraint contracting_deals_recipient_status_check
  check (recipient_status in ('pending','accepted','rejected'));
alter table public.contracting_deals
  drop constraint if exists contracting_deals_reject_reason_len;
alter table public.contracting_deals
  add constraint contracting_deals_reject_reason_len
  check (recipient_response_reason is null or length(recipient_response_reason) <= 2000);

update public.contracting_deals
   set recipient_status = case when second_party_status = 'declined' then 'rejected'
                               else second_party_status end
 where recipient_status = 'pending' and second_party_status <> 'pending';

-- ============ 2) مرجع عشوائي غير متسلسل ============
create or replace function private.gen_request_reference()
returns text
language plpgsql
security definer
set search_path to 'private','public','extensions'
as $$
declare v text; i int;
begin
  for i in 1..20 loop
    v := 'REQ-' ||
         lpad((floor(random()*10000))::int::text, 4, '0') || '-' ||
         lpad((floor(random()*10000))::int::text, 4, '0') || '-' ||
         lpad((floor(random()*10000))::int::text, 4, '0');
    if not exists (select 1 from public.contracting_deals d where d.reference_no = v)
       and not exists (select 1 from public.requests r where r.request_no = v) then
      return v;
    end if;
  end loop;
  raise exception 'REFERENCE_GENERATION_FAILED';
end $$;

revoke execute on function private.gen_request_reference() from public;

alter table public.contracting_deals alter column reference_no set default private.gen_request_reference();
alter table public.requests alter column request_no set default private.gen_request_reference();

-- المرجع لا يتغيّر بعد الإنشاء
create or replace function private.deal_reference_immutable()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.reference_no is distinct from old.reference_no then
    raise exception 'REFERENCE_IMMUTABLE';
  end if;
  return new;
end $$;
revoke execute on function private.deal_reference_immutable() from public;
drop trigger if exists trg_deal_reference_immutable on public.contracting_deals;
create trigger trg_deal_reference_immutable before update on public.contracting_deals
for each row execute function private.deal_reference_immutable();

-- ============ 3) سجل أحداث التعاقد (تدقيق) ============
create table if not exists public.contracting_deal_events (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.contracting_deals(id) on delete cascade,
  event_type text not null check (event_type in ('created','accepted','rejected','resubmitted','message','attachment','project_linked')),
  actor_user_id uuid,
  reason text check (reason is null or length(reason) <= 2000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_deal_events_deal on public.contracting_deal_events(deal_id, created_at desc);

grant select on public.contracting_deal_events to authenticated;
grant all on public.contracting_deal_events to service_role;
revoke insert, update, delete, truncate on public.contracting_deal_events from anon, authenticated;
revoke select on public.contracting_deal_events from anon;
alter table public.contracting_deal_events enable row level security;
drop policy if exists deal_events_read on public.contracting_deal_events;
create policy deal_events_read on public.contracting_deal_events
  for select to authenticated using (private.deal_visible(deal_id));

-- ============ 4) ردود المعاملة والمرفقات ============
create table if not exists public.deal_messages (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.contracting_deals(id) on delete cascade,
  author_user_id uuid not null,
  author_entity_id uuid references public.entities(id) on delete set null,
  kind text not null check (kind in ('reply','info_request','document_request')),
  body text check (body is null or length(body) <= 4000),
  created_at timestamptz not null default now()
);
create index if not exists idx_deal_messages_deal on public.deal_messages(deal_id, created_at);

create table if not exists public.deal_message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.deal_messages(id) on delete cascade,
  deal_id uuid not null references public.contracting_deals(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (length(file_name) between 1 and 240),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  created_at timestamptz not null default now()
);
create index if not exists idx_deal_attachments_msg on public.deal_message_attachments(message_id);

grant select on public.deal_messages, public.deal_message_attachments to authenticated;
grant all on public.deal_messages, public.deal_message_attachments to service_role;
revoke insert, update, delete, truncate on public.deal_messages, public.deal_message_attachments from anon, authenticated;
revoke select on public.deal_messages, public.deal_message_attachments from anon;

alter table public.deal_messages enable row level security;
alter table public.deal_message_attachments enable row level security;
drop policy if exists deal_messages_read on public.deal_messages;
create policy deal_messages_read on public.deal_messages
  for select to authenticated using (private.deal_visible(deal_id));
drop policy if exists deal_attachments_read on public.deal_message_attachments;
create policy deal_attachments_read on public.deal_message_attachments
  for select to authenticated using (private.deal_visible(deal_id));

-- سياسات التخزين: مرفقات التعاقد محصورة بأطراف المعاملة (المجلد الأول = معرّف المعاملة)
drop policy if exists deal_attachments_storage_read on storage.objects;
create policy deal_attachments_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'deal-attachments'
    and private.deal_visible(nullif((storage.foldername(name))[1], '')::uuid)
  );
drop policy if exists deal_attachments_storage_write on storage.objects;
create policy deal_attachments_storage_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'deal-attachments'
    and private.deal_visible(nullif((storage.foldername(name))[1], '')::uuid)
  );

grant execute on function private.deal_visible(uuid) to authenticated;

-- ============ 5) الرد على المعاملة: الرفض يُلغيها ============
drop function if exists public.respond_contracting_deal(uuid, boolean);
create or replace function public.respond_contracting_deal(_deal_id uuid, _accept boolean, _reason text default null)
returns text
language plpgsql
security definer
set search_path to ''
as $$
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

  update public.contracting_deals
     set second_party_status = _new,
         recipient_status = case when _accept then 'accepted' else 'rejected' end,
         recipient_response_reason = case when _accept then null else nullif(btrim(coalesce(_reason,'')), '') end,
         recipient_responded_at = now(),
         recipient_responded_by = _uid,
         status = case when _accept then status else 'cancelled' end,
         updated_at = now()
   where id = _deal_id;

  insert into public.contracting_deal_events(deal_id, event_type, actor_user_id, reason)
  values (_deal_id, case when _accept then 'accepted' else 'rejected' end, _uid,
          case when _accept then null else nullif(btrim(coalesce(_reason,'')), '') end);

  return _new;
end $$;

revoke execute on function public.respond_contracting_deal(uuid, boolean, text) from public;
grant execute on function public.respond_contracting_deal(uuid, boolean, text) to authenticated;

-- ============ 6) ربط إعادة الطلب والمشروع ============
create or replace function public.link_deal_resubmission(_new_deal_id uuid, _source_deal_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare _uid uuid := auth.uid();
begin
  if _uid is null then raise exception 'UNAUTHENTICATED' using errcode = '42501'; end if;
  if not private.deal_visible(_new_deal_id) or not private.deal_visible(_source_deal_id) then
    raise exception 'DEAL_FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (select 1 from public.contracting_deals d
                 where d.id = _source_deal_id and d.status = 'cancelled') then
    raise exception 'SOURCE_NOT_CANCELLED';
  end if;
  update public.contracting_deals set resubmitted_from_id = _source_deal_id, updated_at = now()
   where id = _new_deal_id and resubmitted_from_id is null;
  insert into public.contracting_deal_events(deal_id, event_type, actor_user_id, metadata)
  values (_source_deal_id, 'resubmitted', _uid, jsonb_build_object('new_deal_id', _new_deal_id));
end $$;
revoke execute on function public.link_deal_resubmission(uuid, uuid) from public;
grant execute on function public.link_deal_resubmission(uuid, uuid) to authenticated;

create or replace function public.link_deal_project(_deal_id uuid, _project_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare _uid uuid := auth.uid();
begin
  if _uid is null then raise exception 'UNAUTHENTICATED' using errcode = '42501'; end if;
  if not exists (select 1 from public.contracting_deals d
                 where d.id = _deal_id
                   and (d.owner_user_id = _uid or d.created_by = _uid
                        or (d.entity_id is not null and exists (
                              select 1 from public.entity_memberships m
                              where m.entity_id = d.entity_id and m.user_id = _uid and m.status = 'active')))) then
    raise exception 'DEAL_FORBIDDEN' using errcode = '42501';
  end if;
  if _project_id is not null and not private.can_access_project(_uid, _project_id) then
    raise exception 'PROJECT_FORBIDDEN' using errcode = '42501';
  end if;
  update public.contracting_deals set project_id = _project_id, updated_at = now() where id = _deal_id;
  insert into public.contracting_deal_events(deal_id, event_type, actor_user_id, metadata)
  values (_deal_id, 'project_linked', _uid, jsonb_build_object('project_id', _project_id));
end $$;
revoke execute on function public.link_deal_project(uuid, uuid) from public;
grant execute on function public.link_deal_project(uuid, uuid) to authenticated;

-- الربط بالمشروع لا يمنح وصولًا: حارس يمنع أي تعديل مباشر على project_id من العميل
create or replace function private.deal_project_guard()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if tg_op = 'UPDATE' and new.project_id is distinct from old.project_id then
    if not private.can_access_project(auth.uid(), new.project_id) and new.project_id is not null then
      raise exception 'PROJECT_FORBIDDEN' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'INSERT' and new.project_id is not null
     and not private.can_access_project(auth.uid(), new.project_id) then
    raise exception 'PROJECT_FORBIDDEN' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function private.deal_project_guard() from public;
drop trigger if exists trg_deal_project_guard on public.contracting_deals;
create trigger trg_deal_project_guard before insert or update on public.contracting_deals
for each row execute function private.deal_project_guard();

-- ============ 7) الردود والمرفقات عبر دوال محمية ============
create or replace function public.post_deal_message(_deal_id uuid, _kind text, _body text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare _uid uuid := auth.uid(); _id uuid; _entity uuid;
begin
  if _uid is null then raise exception 'UNAUTHENTICATED' using errcode = '42501'; end if;
  if not private.deal_visible(_deal_id) then raise exception 'DEAL_FORBIDDEN' using errcode = '42501'; end if;
  if _kind not in ('reply','info_request','document_request') then raise exception 'INVALID_KIND'; end if;

  select d.entity_id into _entity from public.contracting_deals d where d.id = _deal_id;

  insert into public.deal_messages(deal_id, author_user_id, author_entity_id, kind, body)
  values (_deal_id, _uid, null, _kind, nullif(btrim(coalesce(_body,'')), ''))
  returning id into _id;

  insert into public.contracting_deal_events(deal_id, event_type, actor_user_id, metadata)
  values (_deal_id, 'message', _uid, jsonb_build_object('kind', _kind, 'message_id', _id));
  return _id;
end $$;
revoke execute on function public.post_deal_message(uuid, text, text) from public;
grant execute on function public.post_deal_message(uuid, text, text) to authenticated;

create or replace function public.attach_deal_message_file(
  _message_id uuid, _storage_path text, _file_name text, _mime_type text, _size_bytes bigint)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare _uid uuid := auth.uid(); _deal uuid; _id uuid;
begin
  if _uid is null then raise exception 'UNAUTHENTICATED' using errcode = '42501'; end if;
  select m.deal_id into _deal from public.deal_messages m where m.id = _message_id and m.author_user_id = _uid;
  if _deal is null then raise exception 'MESSAGE_FORBIDDEN' using errcode = '42501'; end if;
  if _storage_path not like (_deal::text || '/%') then raise exception 'INVALID_PATH'; end if;
  if _mime_type not in (
      'application/pdf','image/jpeg','image/png','image/webp','text/plain','text/csv',
      'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  then raise exception 'MIME_NOT_ALLOWED'; end if;
  if _size_bytes <= 0 or _size_bytes > 26214400 then raise exception 'SIZE_NOT_ALLOWED'; end if;

  insert into public.deal_message_attachments(message_id, deal_id, storage_path, file_name, mime_type, size_bytes)
  values (_message_id, _deal, _storage_path, _file_name, _mime_type, _size_bytes)
  returning id into _id;

  insert into public.contracting_deal_events(deal_id, event_type, actor_user_id, metadata)
  values (_deal, 'attachment', _uid, jsonb_build_object('message_id', _message_id));
  return _id;
end $$;
revoke execute on function public.attach_deal_message_file(uuid, text, text, text, bigint) from public;
grant execute on function public.attach_deal_message_file(uuid, text, text, text, bigint) to authenticated;

-- ============ 8) الإشعارات ============
alter table public.notification_types drop constraint if exists notification_types_target_kind_check;
alter table public.notification_types add constraint notification_types_target_kind_check
  check (target_kind = any (array['request','stage','contract','document','disbursement','financial_document','milestone','retention','membership','warranty','queue_item','breakglass','marketing_version','marketing_contract','media_asset','media_publication','appointment','order','integration','deal']));

insert into public.notification_types(code, category, default_channel, is_mandatory, is_security, subject_key, body_key, target_kind)
values
  ('deal.received','action_required','in_app', false, false, 'notif.deal.received.subject','notif.deal.received.body','deal'),
  ('deal.responded','info','in_app', false, false, 'notif.deal.responded.subject','notif.deal.responded.body','deal'),
  ('deal.message','action_required','in_app', false, false, 'notif.deal.message.subject','notif.deal.message.body','deal')
on conflict (code) do nothing;

create or replace function private.notify_deal_recipient()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare r record; d record;
begin
  if new.party_role <> 'second' then return new; end if;
  select * into d from public.contracting_deals where id = new.deal_id;
  if d is null then return new; end if;

  if new.matched_user_id is not null then
    perform private.emit_notification(new.matched_user_id, 'deal.received', null, null,
      'deal', new.deal_id, jsonb_build_object('reference_no', d.reference_no, 'title', d.title), 'created', 'info');
  elsif new.matched_entity_id is not null then
    for r in select m.user_id from public.entity_memberships m
              where m.entity_id = new.matched_entity_id and m.status = 'active' loop
      perform private.emit_notification(r.user_id, 'deal.received', null, new.matched_entity_id,
        'deal', new.deal_id, jsonb_build_object('reference_no', d.reference_no, 'title', d.title), 'created', 'info');
    end loop;
  end if;
  return new;
end $$;
revoke execute on function private.notify_deal_recipient() from public;
drop trigger if exists trg_notify_deal_recipient on public.deal_parties;
create trigger trg_notify_deal_recipient after insert on public.deal_parties
for each row execute function private.notify_deal_recipient();

create or replace function private.notify_deal_owner_response()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  if new.recipient_status is not distinct from old.recipient_status then return new; end if;
  if new.recipient_status = 'pending' then return new; end if;
  perform private.emit_notification(new.owner_user_id, 'deal.responded', null, new.entity_id,
    'deal', new.id, jsonb_build_object('reference_no', new.reference_no, 'status', new.recipient_status),
    'resp:' || new.recipient_status, 'info');
  if new.entity_id is not null then
    for r in select m.user_id from public.entity_memberships m
              where m.entity_id = new.entity_id and m.status = 'active' and m.user_id <> new.owner_user_id loop
      perform private.emit_notification(r.user_id, 'deal.responded', null, new.entity_id,
        'deal', new.id, jsonb_build_object('reference_no', new.reference_no, 'status', new.recipient_status),
        'resp:' || new.recipient_status, 'info');
    end loop;
  end if;
  return new;
end $$;
revoke execute on function private.notify_deal_owner_response() from public;
drop trigger if exists trg_notify_deal_owner_response on public.contracting_deals;
create trigger trg_notify_deal_owner_response after update on public.contracting_deals
for each row execute function private.notify_deal_owner_response();

create or replace function private.notify_deal_message()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare d record; p record; r record;
begin
  select * into d from public.contracting_deals where id = new.deal_id;
  if d is null then return new; end if;

  if d.owner_user_id <> new.author_user_id then
    perform private.emit_notification(d.owner_user_id, 'deal.message', null, d.entity_id,
      'deal', d.id, jsonb_build_object('reference_no', d.reference_no, 'kind', new.kind),
      'msg:' || new.id::text, 'info');
  end if;

  select * into p from public.deal_parties where deal_id = new.deal_id and party_role = 'second';
  if p is null then return new; end if;
  if p.matched_user_id is not null and p.matched_user_id <> new.author_user_id then
    perform private.emit_notification(p.matched_user_id, 'deal.message', null, null,
      'deal', d.id, jsonb_build_object('reference_no', d.reference_no, 'kind', new.kind),
      'msg:' || new.id::text, 'info');
  elsif p.matched_entity_id is not null then
    for r in select m.user_id from public.entity_memberships m
              where m.entity_id = p.matched_entity_id and m.status = 'active' and m.user_id <> new.author_user_id loop
      perform private.emit_notification(r.user_id, 'deal.message', null, p.matched_entity_id,
        'deal', d.id, jsonb_build_object('reference_no', d.reference_no, 'kind', new.kind),
        'msg:' || new.id::text, 'info');
    end loop;
  end if;
  return new;
end $$;
revoke execute on function private.notify_deal_message() from public;
drop trigger if exists trg_notify_deal_message on public.deal_messages;
create trigger trg_notify_deal_message after insert on public.deal_messages
for each row execute function private.notify_deal_message();

-- توجيه النقر على إشعار التعاقد إلى المعاملة نفسها
create or replace function public.resolve_notification_target(_notification_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare n record; ok boolean := false; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'NOT_FOUND_OR_FORBIDDEN'; end if;
  select * into n from public.notifications where id = _notification_id and recipient_user_id = uid;
  if n is null or private.user_is_suspended(uid) then raise exception 'NOT_FOUND_OR_FORBIDDEN'; end if;

  if n.target_kind = 'request' then
    ok := exists (select 1 from public.requests r where r.id = n.target_id)
          and private.can_access_request(uid, n.target_id);
  elsif n.target_kind = 'deal' then
    ok := exists (select 1 from public.contracting_deals d where d.id = n.target_id)
          and private.deal_visible(n.target_id);
  elsif n.target_kind = 'stage' then
    ok := exists (select 1 from public.project_stages s where s.id = n.target_id)
          and private.can_access_stage(uid, n.target_id, n.project_id);
  elsif n.target_kind = 'contract' then
    ok := exists (select 1 from public.contracts c where c.id = n.target_id)
          and private.can_access_contract(uid, n.target_id);
  elsif n.target_kind = 'document' then
    ok := exists (select 1 from public.documents d where d.id = n.target_id)
          and private.can_access_document(uid, n.target_id, 'view');
  elsif n.target_kind = 'warranty' then
    ok := exists (select 1 from public.warranties w where w.id = n.target_id)
          and n.project_id is not null and private.can_access_project(uid, n.project_id);
  elsif n.target_kind in ('disbursement','financial_document','milestone','retention') then
    ok := n.project_id is not null and private.can_view_project_finance(uid, n.project_id)
          and case n.target_kind
                when 'disbursement' then exists (select 1 from public.disbursement_requests x where x.id = n.target_id)
                when 'financial_document' then exists (select 1 from public.financial_documents x where x.id = n.target_id)
                when 'milestone' then exists (select 1 from public.payment_milestones x where x.id = n.target_id)
                else exists (select 1 from public.retention_holds x where x.id = n.target_id)
              end;
  elsif n.target_kind = 'membership' then
    ok := exists (select 1 from public.entity_memberships m where m.id = n.target_id and m.user_id = uid);
  end if;

  if not ok then raise exception 'NOT_FOUND_OR_FORBIDDEN'; end if;
  return jsonb_build_object('target_kind', n.target_kind, 'target_id', n.target_id, 'project_id', n.project_id);
end; $function$;
revoke execute on function public.resolve_notification_target(uuid) from public;
grant execute on function public.resolve_notification_target(uuid) to authenticated;