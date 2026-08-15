create or replace function private.p28_cascade_delete(_rel text, _ids uuid[], _depth int default 0)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r record; child_ids uuid[];
begin
  if _ids is null or array_length(_ids,1) is null or _depth > 8 then return; end if;
  for r in
    select con.conrelid::regclass::text as child_tbl, att.attname as child_col
    from pg_constraint con
    join unnest(con.conkey) with ordinality k(attnum, ord) on true
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum
    where con.contype='f' and con.confrelid = _rel::regclass
  loop
    begin
      execute format('select coalesce(array_agg(id),''{}'') from %s where %I = any($1)', r.child_tbl, r.child_col)
        into child_ids using _ids;
      perform private.p28_cascade_delete(r.child_tbl, child_ids, _depth+1);
    exception when undefined_column then null;
    end;
    execute format('delete from %s where %I = any($1)', r.child_tbl, r.child_col) using _ids;
  end loop;
  begin
    execute format('delete from %s where id = any($1)', _rel) using _ids;
  exception when undefined_column then null;
  end;
end $$;
revoke all on function private.p28_cascade_delete(text,uuid[],int) from public, anon, authenticated;

do $$
declare ents uuid[] := array['6f7a628a-5c02-4676-b527-b53a20329db6'::uuid,'d9fc5e0e-a7ee-42c6-a166-f135f7108700'::uuid];
  usrs uuid[]; t record;
begin
  select coalesce(array_agg(id),'{}') into usrs from auth.users where email like 'p28-%@example.com';
  for t in select c.relname from pg_class c join pg_namespace ns on ns.oid=c.relnamespace and ns.nspname='public' where c.relkind='r' loop
    execute format('alter table public.%I disable trigger user', t.relname);
  end loop;
  for t in select c.relname, a.attname from pg_class c
      join pg_namespace ns on ns.oid=c.relnamespace and ns.nspname='public'
      join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped and not a.attnotnull
      where c.relkind='r' and (a.attname like '%current%version%' or a.attname like '%latest%version%' or a.attname like '%active%version%') loop
    execute format('update public.%I set %I = null', t.relname, t.attname);
  end loop;
  perform private.p28_cascade_delete('public.entities'::text, ents, 0);
  for t in select c.relname, a.attname from pg_class c
      join pg_namespace ns on ns.oid=c.relnamespace and ns.nspname='public'
      join pg_attribute a on a.attrelid=c.oid and a.attname in ('user_id','actor_user_id','created_by','requested_by','decided_by','assigned_to')
      where c.relkind='r' loop
    execute format('delete from public.%I where %I = any($1)', t.relname, t.attname) using usrs;
  end loop;
  delete from public.integration_requests where idempotency_key like 'TEST-28%';
  for t in select c.relname from pg_class c join pg_namespace ns on ns.oid=c.relnamespace and ns.nspname='public' where c.relkind='r' loop
    execute format('alter table public.%I enable trigger user', t.relname);
  end loop;
  delete from auth.identities where user_id = any(usrs);
  delete from auth.sessions where user_id = any(usrs);
  delete from auth.refresh_tokens where user_id::uuid = any(usrs);
  delete from auth.users where id = any(usrs);
end $$;
drop function if exists private.p28_cascade_delete(text,uuid[],int);