create or replace function private.p28_cascade_delete(_schema text, _table text, _ids uuid[], _depth int default 0)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r record; child_ids uuid[];
begin
  if _ids is null or array_length(_ids,1) is null or _depth > 8 then return; end if;
  for r in
    select con.conrelid::regclass::text as child_tbl, att.attname as child_col
    from pg_constraint con
    join pg_class pc on pc.oid = con.confrelid
    join pg_namespace pn on pn.oid = pc.relnamespace
    join unnest(con.conkey) with ordinality k(attnum, ord) on true
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum
    where con.contype='f' and pn.nspname=_schema and pc.relname=_table
  loop
    execute format('select coalesce(array_agg(id),''{}'') from %s where %I = any($1)', r.child_tbl, r.child_col)
      into child_ids using _ids;
    begin
      perform private.p28_cascade_delete(split_part(r.child_tbl,'.',1), split_part(r.child_tbl,'.',2), child_ids, _depth+1);
    exception when undefined_column then null;
    end;
    execute format('delete from %s where %I = any($1)', r.child_tbl, r.child_col) using _ids;
  end loop;
  execute format('delete from %I.%I where id = any($1)', _schema, _table) using _ids;
end $$;
revoke all on function private.p28_cascade_delete(text,text,uuid[],int) from public, anon, authenticated;