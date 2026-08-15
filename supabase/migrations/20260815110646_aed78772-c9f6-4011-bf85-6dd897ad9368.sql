create or replace function public.run_duration_scan()
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.duration_timers%rowtype; eff timestamptz; bucket text; overdue_hours numeric;
        rcpt uuid; pol public.escalation_policies%rowtype; stp public.escalation_steps%rowtype; nid uuid;
        v_pre int := 0; v_over int := 0; v_esc int := 0; v_skipped int := 0;
begin
  for t in select * from public.duration_timers where state = 'running' and due_at is not null loop
    eff := private.timer_effective_now(t);

    if eff < t.due_at then
      bucket := case
        when eff >= t.due_at - interval '1 day' then 'due-1d'
        when eff >= t.due_at - interval '3 days' then 'due-3d'
        else null end;
      if bucket is not null and coalesce(t.last_pre_due_bucket,'') is distinct from bucket then
        for rcpt in select * from private.timer_recipients(t) loop
          if private.emit_notification(rcpt, 'duration.pre_due', t.project_id, t.entity_id,
               t.subject_kind, t.subject_id,
               jsonb_build_object('subject_kind', t.subject_kind, 'bucket', bucket),
               bucket, 'warning') is not null then
            v_pre := v_pre + 1;
          end if;
        end loop;
        update public.duration_timers set last_pre_due_bucket = bucket where id = t.id;
      end if;
    else
      overdue_hours := extract(epoch from (eff - t.due_at)) / 3600.0;
      bucket := case
        when overdue_hours >= 168 then 'overdue-d7'
        when overdue_hours >= 72 then 'overdue-d3'
        when overdue_hours >= 24 then 'overdue-d1'
        else 'overdue-d0' end;
      if coalesce(t.last_overdue_bucket,'') is distinct from bucket then
        for rcpt in select * from private.timer_recipients(t) loop
          if private.emit_notification(rcpt, 'duration.overdue', t.project_id, t.entity_id,
               t.subject_kind, t.subject_id,
               jsonb_build_object('subject_kind', t.subject_kind, 'bucket', bucket),
               bucket, 'critical') is not null then
            v_over := v_over + 1;
          end if;
        end loop;
        update public.duration_timers set last_overdue_bucket = bucket where id = t.id;
      end if;

      for pol in
        select * from public.escalation_policies p
         where p.is_active
           and p.subject_kind = t.subject_kind
           and (p.project_id is null or p.project_id = t.project_id)
           and (p.contract_id is null or p.contract_id = t.contract_id)
           and (t.entity_id is null or p.entity_id = t.entity_id)
      loop
        for stp in select * from public.escalation_steps s where s.policy_id = pol.id order by s.step_no loop
          continue when overdue_hours < (pol.trigger_after_hours + stp.delay_hours);
          continue when exists (select 1 from public.escalation_events e
                                 where e.timer_id = t.id and e.policy_id = pol.id and e.step_no = stp.step_no);
          rcpt := private.resolve_escalation_recipient(t, stp);
          if rcpt is null then
            insert into public.escalation_events(timer_id, policy_id, step_no, project_id, reason)
            values (t.id, pol.id, stp.step_no, t.project_id, 'recipient_unresolved')
            on conflict do nothing;
            v_skipped := v_skipped + 1;
          else
            nid := private.emit_notification(rcpt, 'escalation.raised', t.project_id, t.entity_id,
                     t.subject_kind, t.subject_id,
                     jsonb_build_object('subject_kind', t.subject_kind, 'policy_id', pol.id, 'step_no', stp.step_no),
                     pol.id::text || ':' || stp.step_no::text, 'critical');
            insert into public.escalation_events(timer_id, policy_id, step_no, project_id, resolved_recipient_user_id, notification_id, reason)
            values (t.id, pol.id, stp.step_no, t.project_id, rcpt, nid, 'policy_step')
            on conflict do nothing;
            v_esc := v_esc + 1;
          end if;
        end loop;
      end loop;
    end if;
  end loop;

  return jsonb_build_object('pre_due', v_pre, 'overdue', v_over, 'escalations', v_esc, 'unresolved', v_skipped);
end; $$;

revoke execute on function public.run_duration_scan() from public, anon, authenticated;
grant execute on function public.run_duration_scan() to service_role;

create or replace function public.build_notification_digest(_mode text default 'daily')
returns table(digest_id uuid, item_count integer)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_start timestamptz; v_end timestamptz;
        v_digest uuid; v_count integer := 0; n public.notifications%rowtype; v_delivery uuid;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED' using errcode='28000'; end if;
  if _mode not in ('daily','weekly') then raise exception 'INVALID_MODE' using errcode='22023'; end if;

  select b.day_start, b.day_end into v_start, v_end from private.riyadh_day_bounds(now()) b;
  if _mode = 'weekly' then v_start := v_end - interval '7 days'; end if;

  insert into public.notification_digests(user_id, digest_mode, period_start, period_end)
  values (v_uid, _mode, v_start, v_end)
  on conflict (user_id, digest_mode, period_start) do update set built_at = now()
  returning id into v_digest;

  for v_delivery in
    select d.id
      from public.notifications n2
      join public.notification_deliveries d on d.notification_id = n2.id
      join public.notification_types t on t.code = n2.type_code
     where n2.recipient_user_id = v_uid
       and d.status = 'deferred'
       and d.deferred_reason = 'digest_batched'
       and not (t.is_mandatory or t.is_security)
       and n2.created_at >= v_start and n2.created_at < v_end
  loop
    select n2.* into n from public.notifications n2
      join public.notification_deliveries d2 on d2.notification_id = n2.id
     where d2.id = v_delivery;
    if private.can_see_notification_now(v_uid, n) then
      insert into public.notification_digest_items(digest_id, notification_id)
      values (v_digest, n.id) on conflict do nothing;
      update public.notification_deliveries
         set status = 'sent', sent_at = now(), deferred_reason = null
       where id = v_delivery;
      v_count := v_count + 1;
    end if;
  end loop;

  update public.notification_digests set item_count = v_count, sent_at = now() where id = v_digest;
  return query select v_digest, v_count;
end; $$;

revoke execute on function public.build_notification_digest(text) from public, anon;
grant execute on function public.build_notification_digest(text) to authenticated;