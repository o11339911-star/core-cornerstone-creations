create or replace function public.build_notification_digest(_mode text default 'daily')
returns table(digest_id uuid, item_count integer)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_start timestamptz; v_end timestamptz;
        v_digest uuid; v_count integer := 0; n public.notifications%rowtype; v_nid uuid;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED' using errcode='28000'; end if;
  if _mode not in ('daily','weekly') then raise exception 'INVALID_MODE' using errcode='22023'; end if;

  select b.day_start, b.day_end into v_start, v_end from private.riyadh_day_bounds(now()) b;
  if _mode = 'weekly' then v_start := v_end - interval '7 days'; end if;

  insert into public.notification_digests(user_id, digest_mode, period_start, period_end)
  values (v_uid, _mode, v_start, v_end)
  on conflict (user_id, digest_mode, period_start) do update set built_at = now()
  returning id into v_digest;

  for v_nid in
    select distinct n2.id
      from public.notifications n2
      join public.notification_deliveries d on d.notification_id = n2.id
      join public.notification_types t on t.code = n2.type_code
     where n2.recipient_user_id = v_uid
       and d.status = 'deferred'
       and d.deferred_reason = 'digest_batched'
       and not (t.is_mandatory or t.is_security)
       and n2.created_at >= v_start and n2.created_at < v_end
       and not exists (select 1 from public.notification_digest_items i where i.notification_id = n2.id)
  loop
    select * into n from public.notifications where id = v_nid;
    if private.can_see_notification_now(v_uid, n) then
      insert into public.notification_digest_items(digest_id, notification_id)
      values (v_digest, v_nid) on conflict do nothing;
      -- deliveries are append-only: record a new delivery row instead of editing
      insert into public.notification_deliveries(notification_id, channel, status, sent_at)
      values (v_nid, 'in_app', 'sent', now());
      v_count := v_count + 1;
    end if;
  end loop;

  update public.notification_digests set item_count = v_count, sent_at = now() where id = v_digest;
  return query select v_digest, v_count;
end; $$;

revoke execute on function public.build_notification_digest(text) from public, anon;
grant execute on function public.build_notification_digest(text) to authenticated;