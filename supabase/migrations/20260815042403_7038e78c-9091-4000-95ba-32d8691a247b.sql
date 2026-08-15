
-- Internal approval only. NOT a legally certified electronic signature.
create or replace function public.approve_contract_version(_version_id uuid, _note text default null)
returns timestamptz
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_contract uuid;
  v_project uuid;
  v_approved timestamptz;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select v.contract_id, v.approved_at into v_contract, v_approved
  from public.contract_versions v where v.id = _version_id for update;
  if v_contract is null then
    raise exception 'Contract version not found' using errcode = '22023';
  end if;
  if v_approved is not null then
    raise exception 'This contract version is already approved' using errcode = '22023';
  end if;

  select c.project_id into v_project from public.contracts c where c.id = v_contract;

  if not private.is_project_insider(v_actor, v_project)
     or not private.can(v_actor, 'contracts', 'approve', null, v_project) then
    raise exception 'Not allowed to approve contract versions on this project' using errcode = '42501';
  end if;

  update public.contract_versions
    set approved_by = v_actor, approved_at = now(), approval_note = _note
    where id = _version_id
    returning approved_at into v_approved;

  update public.contracts set status = 'active', updated_at = now()
    where id = v_contract and status = 'draft';

  return v_approved;
end;
$$;

create or replace function public.decide_contract_extension(_extension_id uuid, _approve boolean, _note text default null)
returns uuid
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_ext public.contract_extensions%rowtype;
  v_project uuid;
  v_prev public.contract_versions%rowtype;
  v_new_id uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_ext from public.contract_extensions where id = _extension_id for update;
  if v_ext.id is null then
    raise exception 'Extension request not found' using errcode = '22023';
  end if;
  if v_ext.status <> 'requested' then
    raise exception 'Extension request is % and cannot be decided', v_ext.status using errcode = '22023';
  end if;
  if v_ext.requested_by = v_actor then
    raise exception 'The requester cannot decide their own extension request' using errcode = '42501';
  end if;

  select c.project_id into v_project from public.contracts c where c.id = v_ext.contract_id;
  if not private.is_project_insider(v_actor, v_project)
     or not private.can(v_actor, 'contracts', 'approve', null, v_project) then
    raise exception 'Not allowed to decide extension requests on this contract' using errcode = '42501';
  end if;

  if not _approve then
    update public.contract_extensions
      set status = 'rejected', decided_by = v_actor, decided_at = now(), decision_note = _note
      where id = _extension_id;
    return null;
  end if;

  select v.* into v_prev from public.contract_versions v
    where v.contract_id = v_ext.contract_id order by v.version_no desc limit 1;

  insert into public.contract_versions
    (contract_id, starts_on, ends_on, terms_text, source, source_extension_id, change_reason, created_by)
  values
    (v_ext.contract_id, v_prev.starts_on, v_ext.requested_ends_on, v_prev.terms_text,
     'extension', _extension_id, coalesce(_note, v_ext.reason), v_actor)
  returning id into v_new_id;

  insert into public.contract_version_amounts (version_id, amount, payment_terms)
  select v_new_id, a.amount, a.payment_terms
  from public.contract_version_amounts a where a.version_id = v_prev.id;

  update public.contract_extensions
    set status = 'approved', decided_by = v_actor, decided_at = now(),
        decision_note = _note, resulting_version_id = v_new_id
    where id = _extension_id;

  return v_new_id;
end;
$$;

create or replace function public.decide_change_order(_change_order_id uuid, _approve boolean, _note text default null)
returns uuid
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_co public.change_orders%rowtype;
  v_project uuid;
  v_prev public.contract_versions%rowtype;
  v_delta numeric := 0;
  v_new_id uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_co from public.change_orders where id = _change_order_id for update;
  if v_co.id is null then
    raise exception 'Change order not found' using errcode = '22023';
  end if;
  if v_co.status not in ('requested','under_review') then
    raise exception 'Change order is % and cannot be decided', v_co.status using errcode = '22023';
  end if;
  if v_co.requested_by = v_actor then
    raise exception 'The requester cannot decide their own change order' using errcode = '42501';
  end if;

  select c.project_id into v_project from public.contracts c where c.id = v_co.contract_id;
  if not private.is_project_insider(v_actor, v_project)
     or not private.can(v_actor, 'contracts', 'approve', null, v_project) then
    raise exception 'Not allowed to decide change orders on this contract' using errcode = '42501';
  end if;

  if not _approve then
    update public.change_orders
      set status = 'rejected', decided_by = v_actor, decided_at = now(), decision_note = _note
      where id = _change_order_id;
    return null;
  end if;

  select v.* into v_prev from public.contract_versions v
    where v.contract_id = v_co.contract_id order by v.version_no desc limit 1;

  select coalesce(amount_delta, 0) into v_delta
    from public.change_order_amounts where change_order_id = _change_order_id;

  insert into public.contract_versions
    (contract_id, starts_on, ends_on, terms_text, source, source_change_order_id, change_reason, created_by)
  values
    (v_co.contract_id, v_prev.starts_on,
     case when v_prev.ends_on is null then null
          else v_prev.ends_on + make_interval(days => coalesce(v_co.duration_delta_days, 0)) end::date,
     v_prev.terms_text, 'change_order', _change_order_id, coalesce(_note, v_co.title), v_actor)
  returning id into v_new_id;

  insert into public.contract_version_amounts (version_id, amount, payment_terms)
  select v_new_id, a.amount + coalesce(v_delta, 0), a.payment_terms
  from public.contract_version_amounts a where a.version_id = v_prev.id;

  update public.change_orders
    set status = 'approved', decided_by = v_actor, decided_at = now(),
        decision_note = _note, resulting_version_id = v_new_id
    where id = _change_order_id;

  return v_new_id;
end;
$$;

revoke all on function public.approve_contract_version(uuid, text) from public, anon;
revoke all on function public.decide_contract_extension(uuid, boolean, text) from public, anon;
revoke all on function public.decide_change_order(uuid, boolean, text) from public, anon;
grant execute on function public.approve_contract_version(uuid, text) to authenticated;
grant execute on function public.decide_contract_extension(uuid, boolean, text) to authenticated;
grant execute on function public.decide_change_order(uuid, boolean, text) to authenticated;
