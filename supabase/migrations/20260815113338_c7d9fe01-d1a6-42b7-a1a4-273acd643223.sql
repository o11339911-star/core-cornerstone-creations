alter table public.permission_audit_log drop constraint permission_audit_object_type_ck;
alter table public.permission_audit_log add constraint permission_audit_object_type_ck
  check (object_type = any (array[
    'membership','grant','project_party','contracts','contract_versions','contract_version_amounts',
    'contract_parties','contract_extensions','change_orders','change_order_amounts','project_stages',
    'stage_roles','stage_progress','site_visits','stage_observations','observation_actions',
    'observation_reinspections','stage_attachments','stage_completion_criteria','stage_criteria_results',
    'requests','request_messages','property_services','documents','document_versions','document_links',
    'document_audience','reports','report_versions','report_templates','report_assets',
    'report_template_imports','platform_admins','payment_milestones','disbursement_requests',
    'financial_executions','financial_documents','retention_holds','ledger_entries',
    'projects','project_acceptances','project_closure_items','punch_items','warranties',
    'project_reopen_requests','portfolio_entries']));

create or replace function public.set_closure_item_status(
  _item_id uuid, _status text, _document_id uuid default null, _reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); it public.project_closure_items%rowtype;
begin
  if uid is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if _status not in ('pending','satisfied','waived') then raise exception 'INVALID_STATUS' using errcode='22023'; end if;
  select * into it from public.project_closure_items where id = _item_id;
  if it is null then raise exception 'NOT_FOUND' using errcode='22023'; end if;
  if not private.can(uid, 'projects', 'update', null, it.project_id) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  if _status = 'waived' and (_reason is null or length(btrim(_reason)) < 10) then
    raise exception 'WAIVER_REASON_REQUIRED' using errcode='22023';
  end if;

  update public.project_closure_items
     set status = _status,
         document_id = coalesce(_document_id, document_id),
         waiver_reason = case when _status = 'waived' then _reason else waiver_reason end,
         satisfied_by = case when _status = 'pending' then null else uid end,
         satisfied_at = case when _status = 'pending' then null else now() end
   where id = _item_id;

  if _status = 'waived' then
    insert into public.permission_audit_log(actor_user_id, target_project_id, object_type, object_id, action, old_value, new_value)
    values (uid, it.project_id, 'project_closure_items', _item_id, 'status_change',
            jsonb_build_object('status', it.status),
            jsonb_build_object('status', 'waived', 'code', it.code, 'reason', _reason));
  end if;
end; $$;

create or replace function public.close_project(_project_id uuid, _note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_open int; v_pending int;
begin
  if uid is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if not private.can(uid, 'projects', 'approve', null, _project_id) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  if not exists (select 1 from public.project_acceptances a
                  where a.project_id = _project_id and a.phase = 'final' and a.status = 'accepted') then
    raise exception 'FINAL_ACCEPTANCE_REQUIRED' using errcode='22023';
  end if;
  select count(*) into v_open from public.punch_items p
   where p.project_id = _project_id and p.status not in ('closed','rejected');
  if v_open > 0 then
    raise exception 'OPEN_PUNCH_ITEMS: %', v_open using errcode='22023';
  end if;
  select count(*) into v_pending from public.project_closure_items i
   where i.project_id = _project_id and i.is_required and i.status = 'pending';
  if v_pending > 0 then
    raise exception 'PENDING_CLOSURE_ITEMS: %', v_pending using errcode='22023';
  end if;

  update public.projects
     set status = 'closed', closed_at = now(), closed_by = uid,
         closure_note = _note, archived_at = now()
   where id = _project_id;

  insert into public.permission_audit_log(actor_user_id, target_project_id, object_type, object_id, action, old_value, new_value)
  values (uid, _project_id, 'projects', _project_id, 'status_change',
          jsonb_build_object('status', 'active'),
          jsonb_build_object('status', 'closed', 'note', _note));
end; $$;

create or replace function public.decide_project_reopen(_request_id uuid, _approve boolean, _note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.project_reopen_requests%rowtype; p public.projects%rowtype;
begin
  if uid is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select * into r from public.project_reopen_requests where id = _request_id;
  if r is null then raise exception 'NOT_FOUND' using errcode='22023'; end if;
  if not private.can(uid, 'projects', 'approve', null, r.project_id) then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  if uid = r.requested_by then
    raise exception 'REOPEN_SOD_VIOLATION' using errcode='22023';
  end if;

  select * into p from public.projects where id = r.project_id;

  update public.project_reopen_requests
     set status = case when _approve then 'approved' else 'rejected' end,
         decided_by = uid,
         decided_at = transaction_timestamp(),
         decision_note = _note
   where id = _request_id;

  if _approve then
    update public.projects
       set status = 'active', closed_at = null, archived_at = null,
           reopened_count = reopened_count + 1
     where id = r.project_id;
  end if;

  insert into public.permission_audit_log(actor_user_id, target_project_id, object_type, object_id, action, old_value, new_value)
  values (uid, r.project_id, 'project_reopen_requests', _request_id, 'status_change',
          jsonb_build_object('status', p.status, 'closed_at', p.closed_at, 'requested_by', r.requested_by, 'reason', r.reason),
          jsonb_build_object('decision', case when _approve then 'reopen_approved' else 'reopen_rejected' end,
                             'status', case when _approve then 'active' else p.status end,
                             'decided_by', uid, 'note', _note));
end; $$;

revoke execute on function public.set_closure_item_status(uuid, text, uuid, text) from anon;
revoke execute on function public.close_project(uuid, text) from anon;
revoke execute on function public.decide_project_reopen(uuid, boolean, text) from anon;