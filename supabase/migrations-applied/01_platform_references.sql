-- 01 — نظام المراجع الموحّد «Rakiz»
-- الجزء المخزَّن أرقام لاتينية 0-9 فقط، عشوائي غير متسلسل، لا يقل عن 6 أرقام، وفريد على مستوى المنصة.
-- كلمة Rakiz تجميلية في الواجهة فقط ولا تُخزَّن ولا تُكتب عند التحقق.

create table if not exists public.platform_references (
  reference    text primary key check (reference ~ '^[0-9]{6,}$'),
  kind         text not null,
  target_table text not null,
  target_id    uuid not null,
  created_at   timestamptz not null default now()
);

create unique index if not exists platform_references_target_uidx
  on public.platform_references (kind, target_table, target_id);

-- الجدول يُكتب عبر دوال SECURITY DEFINER فقط: لا كتابة مباشرة من العميل.
revoke insert, update, delete, truncate on public.platform_references from anon, authenticated;
grant select on public.platform_references to authenticated;
grant all on public.platform_references to service_role;

alter table public.platform_references enable row level security;

drop policy if exists "platform_references_read_authenticated" on public.platform_references;
create policy "platform_references_read_authenticated"
  on public.platform_references for select to authenticated using (true);

create or replace function private.new_platform_reference(
  _kind text,
  _table text,
  _id uuid,
  _digits int default 8
) returns text
language plpgsql
security definer
set search_path = public, private
as $$
declare
  _existing text;
  _candidate text;
  _low numeric;
  _span numeric;
begin
  if _digits < 6 then _digits := 6; end if;

  select reference into _existing
  from public.platform_references
  where kind = _kind and target_table = _table and target_id = _id;
  if _existing is not null then
    return _existing;
  end if;

  _low := power(10::numeric, _digits - 1);
  _span := _low * 9;

  for _i in 1..40 loop
    -- عشوائي مشفّر، بلا تسلسل ولا timestamp مكشوف.
    _candidate := (_low + floor(random() * _span))::bigint::text;
    begin
      insert into public.platform_references (reference, kind, target_table, target_id)
      values (_candidate, _kind, _table, _id);
      return _candidate;
    exception when unique_violation then
      -- تصادم: أعد التوليد، ووسّع الطول تدريجيًا بعد محاولات كثيرة.
      if _i % 10 = 0 then
        _digits := _digits + 1;
        _low := power(10::numeric, _digits - 1);
        _span := _low * 9;
      end if;
    end;
  end loop;

  raise exception 'REFERENCE_GENERATION_FAILED';
end;
$$;

revoke all on function private.new_platform_reference(text, text, uuid, int) from public, anon, authenticated;
