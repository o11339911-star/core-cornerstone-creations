/* تصحيح التطبيق (2026-08-18): `private.can(uid, entity, 'entities','manage')`
   غير موجودة بهذا التوقيع/القيم، فاستُبدلت بدالة صريحة للعضوية الإدارية. */
create or replace function private.is_entity_manager(_uid uuid, _entity uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1 from public.entity_memberships m
     where m.user_id = _uid
       and m.entity_id = _entity
       and m.status = 'active'
       and m.role in ('owner','admin','manager')
  )
$$;
revoke all on function private.is_entity_manager(uuid, uuid) from public, anon;
grant execute on function private.is_entity_manager(uuid, uuid) to authenticated;

-- 03 — «شبكة التواصل»: جهات الاتصال الخاصة + طلبات التواصل + الارتباطات وأذونات المشاركة.
-- قاعدة أمنية: معرفة رقم الهوية/السجل لا تمنح أي وصول ولا تكشف بيانات اتصال.
-- كشف البريد/الجوال يحدث فقط بعد قبول صريح، وبحسب ما سمح به الطرف المستقبل.

-- ── جهات الاتصال الخاصة ─────────────────────────────────────────────
create table if not exists public.network_contacts (
  id               uuid primary key default gen_random_uuid(),
  owner_user_id    uuid not null default auth.uid(),
  owner_entity_id  uuid references public.entities(id) on delete cascade,
  full_name        text not null check (length(btrim(full_name)) between 2 and 160),
  organization     text,
  role_title       text,
  email            text,
  phone            text,
  activity         text,
  address          text,
  notes            text,
  suggested_user_id   uuid,
  suggested_entity_id uuid references public.entities(id) on delete set null,
  linked_user_id      uuid,
  linked_entity_id    uuid references public.entities(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

grant select, insert, update, delete on public.network_contacts to authenticated;
grant all on public.network_contacts to service_role;
revoke all on public.network_contacts from anon;

alter table public.network_contacts enable row level security;

drop policy if exists "network_contacts_owner_all" on public.network_contacts;
create policy "network_contacts_owner_all"
  on public.network_contacts for all to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop trigger if exists network_contacts_updated_at on public.network_contacts;
create trigger network_contacts_updated_at
  before update on public.network_contacts
  for each row execute function public.set_updated_at();

-- ── طلبات/ارتباطات التواصل بين حسابين مسجّلين ───────────────────────
create table if not exists public.network_links (
  id                  uuid primary key default gen_random_uuid(),
  reference           text unique,
  requester_user_id   uuid not null default auth.uid(),
  requester_entity_id uuid references public.entities(id) on delete cascade,
  target_user_id      uuid,
  target_entity_id    uuid references public.entities(id) on delete cascade,
  status              text not null default 'pending'
                      check (status in ('pending', 'accepted', 'rejected', 'revoked')),
  message             text check (message is null or length(message) <= 500),
  share_email         boolean not null default false,
  share_phone         boolean not null default false,
  share_internal_call boolean not null default true,
  responded_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint network_links_target_one_of check (num_nonnulls(target_user_id, target_entity_id) = 1)
);

create unique index if not exists network_links_pair_uidx
  on public.network_links (
    requester_user_id,
    coalesce(requester_entity_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(target_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(target_entity_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) where status in ('pending', 'accepted');

-- كل الكتابة عبر دوال SECURITY DEFINER؛ العميل يقرأ فقط صفوفه.
revoke insert, update, delete, truncate on public.network_links from anon, authenticated;
revoke select on public.network_links from anon;
grant select on public.network_links to authenticated;
grant all on public.network_links to service_role;

alter table public.network_links enable row level security;

drop policy if exists "network_links_party_select" on public.network_links;
create policy "network_links_party_select"
  on public.network_links for select to authenticated
  using (
    requester_user_id = auth.uid()
    or target_user_id = auth.uid()
    or (target_entity_id is not null and private.is_entity_manager(auth.uid(), target_entity_id))
    or (requester_entity_id is not null and private.is_entity_manager(auth.uid(), requester_entity_id))
  );

drop trigger if exists network_links_updated_at on public.network_links;
create trigger network_links_updated_at
  before update on public.network_links
  for each row execute function public.set_updated_at();

-- ── بحث آمن: اسم وتصنيف فقط، بلا بريد ولا جوال ─────────────────────
create or replace function public.network_search(_q text)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare _digits text := regexp_replace(coalesce(_q, ''), '[^0-9]', '', 'g');
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if length(btrim(coalesce(_q, ''))) < 3 then return '[]'::json; end if;

  return coalesce((
    select json_agg(row_to_json(x))
    from (
      select 'entity'::text as kind,
             e.id::text     as id,
             coalesce(p.legal_name_ar, p.legal_name_en, e.name) as name,
             e.entity_type  as activity
      from public.entities e
      left join public.entity_profiles p on p.entity_id = e.id
      where (length(_digits) = 10 and (p.cr_number = _digits or p.unified_national_number = _digits))
         or (length(_digits) <> 10 and coalesce(p.legal_name_ar, e.name) ilike '%' || btrim(_q) || '%')
      limit 10
    ) x
  ), '[]'::json);
end;
$$;

revoke all on function public.network_search(text) from public, anon;
grant execute on function public.network_search(text) to authenticated;

-- ── طلب تواصل ───────────────────────────────────────────────────────
create or replace function public.network_request_link(
  _target_kind text,
  _target_id uuid,
  _requester_entity_id uuid default null,
  _message text default null
) returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare _id uuid;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if _target_kind not in ('user', 'entity') then raise exception 'TARGET_INVALID'; end if;
  if _requester_entity_id is not null
     and not private.is_entity_manager(auth.uid(), _requester_entity_id) then
    raise exception 'FORBIDDEN';
  end if;

  insert into public.network_links (
    requester_user_id, requester_entity_id, target_user_id, target_entity_id, message
  ) values (
    auth.uid(), _requester_entity_id,
    case when _target_kind = 'user' then _target_id end,
    case when _target_kind = 'entity' then _target_id end,
    _message
  )
  on conflict do nothing
  returning id into _id;

  if _id is null then raise exception 'LINK_ALREADY_EXISTS'; end if;

  update public.network_links
     set reference = private.new_platform_reference('network_link', 'network_links', _id)
   where id = _id;

  return _id;
end;
$$;

revoke all on function public.network_request_link(text, uuid, uuid, text) from public, anon;
grant execute on function public.network_request_link(text, uuid, uuid, text) to authenticated;

-- ── الرد على الطلب وتحديد وسائل الاتصال المسموح بمشاركتها ───────────
create or replace function public.network_respond_link(
  _link_id uuid,
  _accept boolean,
  _share_email boolean default false,
  _share_phone boolean default false,
  _share_internal_call boolean default true
) returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare l public.network_links%rowtype;
begin
  select * into l from public.network_links where id = _link_id;
  if l.id is null then raise exception 'LINK_NOT_FOUND'; end if;
  if l.status <> 'pending' then raise exception 'LINK_STATE_INVALID'; end if;

  if not (
    l.target_user_id = auth.uid()
    or (l.target_entity_id is not null and private.is_entity_manager(auth.uid(), l.target_entity_id))
  ) then
    raise exception 'FORBIDDEN';
  end if;

  update public.network_links
     set status = case when _accept then 'accepted' else 'rejected' end,
         share_email = _accept and coalesce(_share_email, false),
         share_phone = _accept and coalesce(_share_phone, false),
         share_internal_call = _accept and coalesce(_share_internal_call, true),
         responded_at = now(),
         updated_at = now()
   where id = _link_id;

  return true;
end;
$$;

revoke all on function public.network_respond_link(uuid, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.network_respond_link(uuid, boolean, boolean, boolean, boolean) to authenticated;

-- ── إلغاء ارتباط قائم من أي من الطرفين ──────────────────────────────
create or replace function public.network_revoke_link(_link_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare l public.network_links%rowtype;
begin
  select * into l from public.network_links where id = _link_id;
  if l.id is null then raise exception 'LINK_NOT_FOUND'; end if;
  if not (
    l.requester_user_id = auth.uid()
    or l.target_user_id = auth.uid()
    or (l.target_entity_id is not null and private.is_entity_manager(auth.uid(), l.target_entity_id))
    or (l.requester_entity_id is not null and private.is_entity_manager(auth.uid(), l.requester_entity_id))
  ) then
    raise exception 'FORBIDDEN';
  end if;

  update public.network_links set status = 'revoked', updated_at = now() where id = _link_id;
  return true;
end;
$$;

revoke all on function public.network_revoke_link(uuid) from public, anon;
grant execute on function public.network_revoke_link(uuid) to authenticated;

-- ── قائمة الارتباطات مع البيانات المسموح بها فقط ────────────────────
create or replace function public.network_list_links()
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;

  return coalesce((
    select json_agg(row_to_json(x) order by x.created_at desc)
    from (
      select l.id,
             l.reference,
             l.status,
             l.message,
             l.created_at,
             (l.requester_user_id = auth.uid()
               or (l.requester_entity_id is not null
                   and private.is_entity_manager(auth.uid(), l.requester_entity_id))) as outgoing,
             coalesce(
               (select coalesce(ep.legal_name_ar, ep.legal_name_en, e.name)
                  from public.entities e
                  left join public.entity_profiles ep on ep.entity_id = e.id
                 where e.id = coalesce(l.target_entity_id, l.requester_entity_id)),
               (select pr.full_name from public.profiles pr
                 where pr.id = coalesce(nullif(l.target_user_id, auth.uid()), l.requester_user_id))
             ) as counterpart_name,
             l.share_email, l.share_phone, l.share_internal_call,
             case when l.status = 'accepted' and l.share_email then
               -- قراءة فقط من auth.users، بلا أي تعديل على المخطط المحجوز.
               (select u.email::text from auth.users u
                 where u.id = coalesce(nullif(l.target_user_id, auth.uid()), l.requester_user_id))
             end as email,
             case when l.status = 'accepted' and l.share_phone then
               (select pr.phone from public.profiles pr
                 where pr.id = coalesce(nullif(l.target_user_id, auth.uid()), l.requester_user_id))
             end as phone
      from public.network_links l
      where l.requester_user_id = auth.uid()
         or l.target_user_id = auth.uid()
         or (l.target_entity_id is not null and private.is_entity_manager(auth.uid(), l.target_entity_id))
         or (l.requester_entity_id is not null and private.is_entity_manager(auth.uid(), l.requester_entity_id))
      order by l.created_at desc
      limit 200
    ) x
  ), '[]'::json);
end;
$$;

revoke all on function public.network_list_links() from public, anon;
grant execute on function public.network_list_links() to authenticated;
