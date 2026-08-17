-- 1) حقول بطاقة الملف
alter table public.archive_items
  add column if not exists archive_reference text,
  add column if not exists archived_at timestamptz not null default now(),
  add column if not exists original_file_number text,
  add column if not exists archived_from text,
  add column if not exists source_type text,
  add column if not exists copied_from_id uuid references public.archive_items(id) on delete set null;

-- 2) مولّد مرجع عشوائي غير متسلسل
create or replace function private.gen_archive_reference()
returns text
language plpgsql
volatile
security definer
set search_path = private, public, extensions
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  groups text[] := array[]::text[];
  g text;
  i int;
  j int;
begin
  for i in 1..3 loop
    g := '';
    for j in 1..4 loop
      g := g || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    groups := groups || g;
  end loop;
  return 'RKZ-' || array_to_string(groups, '-');
end $$;

revoke execute on function private.gen_archive_reference() from public;

create or replace function private.assign_archive_reference()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
declare candidate text; tries int := 0;
begin
  if new.archive_reference is null then
    loop
      tries := tries + 1;
      candidate := private.gen_archive_reference();
      exit when not exists (select 1 from public.archive_items where archive_reference = candidate);
      if tries > 20 then raise exception 'REFERENCE_GENERATION_FAILED'; end if;
    end loop;
    new.archive_reference := candidate;
  end if;
  if new.archived_at is null then new.archived_at := now(); end if;
  return new;
end $$;

revoke execute on function private.assign_archive_reference() from public;

drop trigger if exists trg_archive_items_reference on public.archive_items;
create trigger trg_archive_items_reference
  before insert on public.archive_items
  for each row execute function private.assign_archive_reference();

-- backfill آمن للملفات القديمة (لا يمس المحتوى)
do $$
declare r record; candidate text; tries int;
begin
  for r in select id from public.archive_items where archive_reference is null loop
    tries := 0;
    loop
      tries := tries + 1;
      candidate := private.gen_archive_reference();
      exit when not exists (select 1 from public.archive_items where archive_reference = candidate);
      if tries > 20 then raise exception 'REFERENCE_GENERATION_FAILED'; end if;
    end loop;
    update public.archive_items set archive_reference = candidate where id = r.id;
  end loop;
end $$;

create unique index if not exists archive_items_reference_key on public.archive_items (archive_reference);
alter table public.archive_items alter column archive_reference set not null;

-- 3) سجل نسخ الملف (داخلي)
create table if not exists public.archive_item_versions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.archive_items(id) on delete cascade,
  version_no integer not null,
  title text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  note text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (item_id, version_no)
);

grant select, insert on public.archive_item_versions to authenticated;
grant all on public.archive_item_versions to service_role;
alter table public.archive_item_versions enable row level security;

create policy "archive versions follow item scope"
  on public.archive_item_versions for select to authenticated
  using (exists (
    select 1 from public.archive_items i
    where i.id = item_id and private.archive_scope_ok(i.entity_id, i.owner_user_id)
  ));

create policy "archive versions insert in scope"
  on public.archive_item_versions for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.archive_items i
      where i.id = item_id and private.archive_scope_ok(i.entity_id, i.owner_user_id)
    )
  );

-- 4) بصمات التوثيق
create table if not exists public.archive_stamps (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.archive_items(id) on delete cascade,
  version_id uuid references public.archive_item_versions(id) on delete set null,
  checksum_sha256 text not null,
  issuer_public_name text not null,
  public_title text not null,
  status text not null default 'valid',
  issued_at timestamptz not null default now(),
  created_by uuid not null,
  constraint archive_stamps_status_ck check (status in ('valid','revoked'))
);

create index if not exists archive_stamps_item_idx on public.archive_stamps (item_id, issued_at desc);

grant select on public.archive_stamps to authenticated;
grant all on public.archive_stamps to service_role;
alter table public.archive_stamps enable row level security;

create policy "archive stamps follow item scope"
  on public.archive_stamps for select to authenticated
  using (exists (
    select 1 from public.archive_items i
    where i.id = item_id and private.archive_scope_ok(i.entity_id, i.owner_user_id)
  ));

-- 5) إصدار بصمة عند التنزيل الموثق
create or replace function public.issue_archive_stamp(
  p_item_id uuid,
  p_checksum text,
  p_version_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, private
as $$
declare it record; issuer text; st record;
begin
  select i.*, e.name as entity_name into it
  from public.archive_items i
  left join public.entities e on e.id = i.entity_id
  where i.id = p_item_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not private.archive_scope_ok(it.entity_id, it.owner_user_id) then
    raise exception 'FORBIDDEN';
  end if;
  if p_checksum !~ '^[0-9a-f]{64}$' then raise exception 'BAD_CHECKSUM'; end if;

  issuer := coalesce(nullif(trim(it.entity_name), ''), 'حساب فردي في منصة ركيز');

  insert into public.archive_stamps (item_id, version_id, checksum_sha256, issuer_public_name, public_title, created_by)
  values (p_item_id, p_version_id, lower(p_checksum), issuer, it.title, auth.uid())
  returning * into st;

  return jsonb_build_object(
    'reference', it.archive_reference,
    'issued_at', st.issued_at,
    'fingerprint', upper(left(st.checksum_sha256, 12)),
    'issuer', st.issuer_public_name,
    'status', st.status
  );
end $$;

revoke execute on function public.issue_archive_stamp(uuid, text, uuid) from public;
grant execute on function public.issue_archive_stamp(uuid, text, uuid) to authenticated;

-- 6) تحقق عام محدود
create or replace function public.verify_archive_file(p_reference text, p_issued_on date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare r record; ref text;
begin
  ref := upper(regexp_replace(coalesce(p_reference, ''), '\s', '', 'g'));
  if ref !~ '^RKZ-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$' or p_issued_on is null then
    return jsonb_build_object('found', false);
  end if;

  select s.status, s.issued_at, s.checksum_sha256, s.issuer_public_name, s.public_title, i.archive_reference
  into r
  from public.archive_stamps s
  join public.archive_items i on i.id = s.item_id
  where i.archive_reference = ref
    and (s.issued_at at time zone 'Asia/Riyadh')::date = p_issued_on
  order by s.issued_at desc
  limit 1;

  if not found then return jsonb_build_object('found', false); end if;

  return jsonb_build_object(
    'found', true,
    'status', r.status,
    'file_name', r.public_title,
    'issuer', r.issuer_public_name,
    'reference', r.archive_reference,
    'issued_at', to_char(r.issued_at at time zone 'Asia/Riyadh', 'YYYY/MM/DD'),
    'fingerprint', upper(left(r.checksum_sha256, 12))
  );
end $$;

revoke execute on function public.verify_archive_file(text, date) from public;
grant execute on function public.verify_archive_file(text, date) to anon, authenticated;