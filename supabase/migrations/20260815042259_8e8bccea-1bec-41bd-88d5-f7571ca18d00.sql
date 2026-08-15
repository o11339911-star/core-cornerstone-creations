
-- ============ 0. phase-9 fix ============
grant execute on function private.stage_in_scope(uuid, uuid, uuid) to authenticated;
grant execute on function private.accepted_party_entity(uuid, uuid) to authenticated;
grant execute on function private.is_project_insider(uuid, uuid) to authenticated;
grant execute on function private.party_ceiling(uuid, public.app_module, public.app_action, uuid) to authenticated;
grant execute on function private.can_access_property(uuid, uuid) to authenticated;
grant execute on function private.can_manage_property(uuid, uuid) to authenticated;
grant execute on function private.can_view_exact_location(uuid, uuid) to authenticated;

-- ============ 1. tables ============
create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  property_id uuid references public.properties(id),
  contract_type text not null default 'works'
    check (contract_type in ('design','supervision','works','supply','consulting','service','other')),
  contract_number text,
  title text not null,
  currency text not null default 'SAR',
  status text not null default 'draft'
    check (status in ('draft','active','suspended','completed','terminated')),
  current_version_id uuid,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.contract_versions (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id),
  version_no integer not null,
  starts_on date,
  ends_on date,
  terms_text text,
  file_path text,
  file_hash text,
  source text not null default 'manual' check (source in ('manual','upload','extension','change_order')),
  source_extension_id uuid,
  source_change_order_id uuid,
  change_reason text,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  approval_note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (contract_id, version_no)
);
comment on column public.contract_versions.approved_at is
  'Internal approval only. NOT a legally certified electronic signature.';

create table public.contract_version_amounts (
  version_id uuid primary key references public.contract_versions(id) on delete cascade,
  amount numeric not null,
  payment_terms text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contract_parties (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id),
  project_party_id uuid references public.project_parties(id),
  entity_id uuid references public.entities(id),
  user_id uuid references auth.users(id),
  contract_role text not null
    check (contract_role in ('first_party','second_party','witness','consultant')),
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  acceptance_note text,
  created_at timestamptz not null default now(),
  constraint contract_parties_one_subject check (
    (project_party_id is not null)::int + (entity_id is not null)::int + (user_id is not null)::int = 1
  )
);
comment on column public.contract_parties.accepted_at is
  'Internal acceptance only. NOT a legally certified electronic signature.';

create table public.contract_stages (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id),
  stage_id uuid not null references public.project_stages(id),
  created_at timestamptz not null default now(),
  unique (contract_id, stage_id)
);

create table public.contract_extensions (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id),
  requested_by uuid not null references auth.users(id),
  requested_ends_on date not null,
  reason text,
  status text not null default 'requested'
    check (status in ('requested','approved','rejected','withdrawn')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_note text,
  resulting_version_id uuid references public.contract_versions(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_extensions_decider_not_requester check (
    decided_by is null or decided_by <> requested_by
  )
);

create table public.change_orders (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id),
  requested_by uuid not null references auth.users(id),
  title text not null,
  description text,
  duration_delta_days integer not null default 0,
  status text not null default 'requested'
    check (status in ('requested','under_review','approved','rejected','withdrawn')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_note text,
  resulting_version_id uuid references public.contract_versions(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint change_orders_decider_not_requester check (
    decided_by is null or decided_by <> requested_by
  )
);

create table public.change_order_amounts (
  change_order_id uuid primary key references public.change_orders(id) on delete cascade,
  amount_delta numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.correspondence_threads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  contract_id uuid references public.contracts(id),
  stage_id uuid references public.project_stages(id),
  subject text not null,
  status text not null default 'open' check (status in ('open','closed')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.correspondence_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.correspondence_threads(id),
  author_id uuid not null references auth.users(id),
  body text not null,
  file_path text,
  visibility text not null default 'shared'
    check (visibility in ('shared','party_limited','internal_note')),
  created_at timestamptz not null default now()
);

create table public.correspondence_message_audience (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.correspondence_messages(id) on delete cascade,
  audience_entity_id uuid references public.entities(id),
  audience_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint correspondence_audience_one_subject check (
    (audience_entity_id is not null)::int + (audience_user_id is not null)::int = 1
  )
);

alter table public.contracts
  add constraint contracts_current_version_fkey
  foreign key (current_version_id) references public.contract_versions(id);
alter table public.contract_versions
  add constraint contract_versions_source_extension_fkey
  foreign key (source_extension_id) references public.contract_extensions(id);
alter table public.contract_versions
  add constraint contract_versions_source_change_order_fkey
  foreign key (source_change_order_id) references public.change_orders(id);

create index contracts_project_idx on public.contracts(project_id);
create index contract_versions_contract_idx on public.contract_versions(contract_id);
create index contract_parties_contract_idx on public.contract_parties(contract_id);
create index contract_stages_contract_idx on public.contract_stages(contract_id);
create index contract_extensions_contract_idx on public.contract_extensions(contract_id);
create index change_orders_contract_idx on public.change_orders(contract_id);
create index correspondence_threads_project_idx on public.correspondence_threads(project_id);
create index correspondence_messages_thread_idx on public.correspondence_messages(thread_id);
create index correspondence_message_audience_msg_idx on public.correspondence_message_audience(message_id);

-- ============ 2. grants ============
grant select, insert, update on public.contracts to authenticated;
grant select, insert on public.contract_versions to authenticated;
grant select, insert, update on public.contract_version_amounts to authenticated;
grant select, insert, update, delete on public.contract_parties to authenticated;
grant select, insert, delete on public.contract_stages to authenticated;
grant select, insert, update on public.contract_extensions to authenticated;
grant select, insert, update on public.change_orders to authenticated;
grant select, insert, update on public.change_order_amounts to authenticated;
grant select, insert, update on public.correspondence_threads to authenticated;
grant select, insert on public.correspondence_messages to authenticated;
grant select, insert, delete on public.correspondence_message_audience to authenticated;
grant all on public.contracts, public.contract_versions, public.contract_version_amounts,
  public.contract_parties, public.contract_stages, public.contract_extensions,
  public.change_orders, public.change_order_amounts, public.correspondence_threads,
  public.correspondence_messages, public.correspondence_message_audience to service_role;

-- ============ 3. private helpers ============
create or replace function private.contract_project(_contract_id uuid)
returns uuid language sql stable security definer set search_path to 'public' as $$
  select c.project_id from public.contracts c where c.id = _contract_id and c.deleted_at is null;
$$;

create or replace function private.can_access_contract(_user_id uuid, _contract_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1
    from public.contracts c
    where c.id = _contract_id
      and c.deleted_at is null
      and private.can(_user_id, 'contracts'::public.app_module, 'view'::public.app_action, null, c.project_id)
      and (
        private.is_project_insider(_user_id, c.project_id)
        or exists (
          select 1
          from public.contract_parties cp
          left join public.project_parties pp on pp.id = cp.project_party_id
          where cp.contract_id = c.id
            and (
              cp.user_id = _user_id
              or (cp.entity_id is not null and private.is_entity_member(_user_id, cp.entity_id))
              or (
                pp.id is not null
                and pp.status = 'accepted'
                and (pp.ends_on is null or pp.ends_on >= current_date)
                and private.is_entity_member(_user_id, pp.party_entity_id)
              )
            )
        )
      )
  );
$$;

create or replace function private.can_manage_contract(_user_id uuid, _contract_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.contracts c
    where c.id = _contract_id
      and c.deleted_at is null
      and private.is_project_insider(_user_id, c.project_id)
      and private.can(_user_id, 'contracts'::public.app_module, 'update'::public.app_action, null, c.project_id)
  );
$$;

create or replace function private.can_view_contract_amounts(_user_id uuid, _contract_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select private.can_access_contract(_user_id, _contract_id)
     and exists (
       select 1 from public.contracts c
       where c.id = _contract_id
         and private.can(_user_id, 'finance'::public.app_module, 'view'::public.app_action, null, c.project_id)
     );
$$;

create or replace function private.version_contract(_version_id uuid)
returns uuid language sql stable security definer set search_path to 'public' as $$
  select v.contract_id from public.contract_versions v where v.id = _version_id;
$$;

create or replace function private.thread_project(_thread_id uuid)
returns uuid language sql stable security definer set search_path to 'public' as $$
  select t.project_id from public.correspondence_threads t where t.id = _thread_id;
$$;

create or replace function private.can_access_thread(_user_id uuid, _thread_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.correspondence_threads t
    where t.id = _thread_id
      and private.can(_user_id, 'correspondence'::public.app_module, 'view'::public.app_action, null, t.project_id)
      and (
        private.is_project_insider(_user_id, t.project_id)
        or private.accepted_party_entity(_user_id, t.project_id) is not null
      )
      and (t.contract_id is null or private.can_access_contract(_user_id, t.contract_id))
      and (t.stage_id is null or private.stage_in_scope(_user_id, t.stage_id, t.project_id))
  );
$$;

create or replace function private.can_see_message(_user_id uuid, _message_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1
    from public.correspondence_messages m
    join public.correspondence_threads t on t.id = m.thread_id
    where m.id = _message_id
      and private.can_access_thread(_user_id, m.thread_id)
      and (
        m.author_id = _user_id
        or m.visibility = 'shared'
        or (m.visibility = 'internal_note' and private.is_project_insider(_user_id, t.project_id))
        or (
          m.visibility = 'party_limited'
          and exists (
            select 1 from public.correspondence_message_audience a
            where a.message_id = m.id
              and (
                a.audience_user_id = _user_id
                or (a.audience_entity_id is not null and private.is_entity_member(_user_id, a.audience_entity_id))
              )
          )
        )
      )
  );
$$;

grant execute on function private.contract_project(uuid) to authenticated;
grant execute on function private.can_access_contract(uuid, uuid) to authenticated;
grant execute on function private.can_manage_contract(uuid, uuid) to authenticated;
grant execute on function private.can_view_contract_amounts(uuid, uuid) to authenticated;
grant execute on function private.version_contract(uuid) to authenticated;
grant execute on function private.thread_project(uuid) to authenticated;
grant execute on function private.can_access_thread(uuid, uuid) to authenticated;
grant execute on function private.can_see_message(uuid, uuid) to authenticated;

-- ============ 4. triggers ============
create or replace function public.assign_contract_version()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  select coalesce(max(version_no), 0) + 1 into new.version_no
  from public.contract_versions where contract_id = new.contract_id;
  return new;
end;
$$;
revoke all on function public.assign_contract_version() from public, anon, authenticated;

create or replace function public.sync_contract_current_version()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  update public.contracts set current_version_id = new.id, updated_at = now() where id = new.contract_id;
  return new;
end;
$$;
revoke all on function public.sync_contract_current_version() from public, anon, authenticated;

create or replace function public.lock_approved_contract_version()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Contract versions are append-only and cannot be deleted' using errcode = '42501';
  end if;
  if old.approved_at is not null then
    raise exception 'An approved contract version cannot be modified; create an extension or a new version instead'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.lock_approved_contract_version() from public, anon, authenticated;

create or replace function public.lock_approved_version_amounts()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_approved timestamptz;
begin
  select approved_at into v_approved from public.contract_versions
  where id = coalesce(new.version_id, old.version_id);
  if v_approved is not null then
    raise exception 'Financial terms of an approved contract version cannot be changed'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.lock_approved_version_amounts() from public, anon, authenticated;

create or replace function public.audit_contract_change()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_contract uuid;
  v_project uuid;
begin
  v_contract := case tg_table_name
    when 'contracts' then coalesce(new.id, old.id)
    else coalesce(new.contract_id, old.contract_id) end;
  select project_id into v_project from public.contracts where id = v_contract;

  insert into public.permission_audit_log(
    actor_user_id, target_project_id, object_type, object_id, action, old_value, new_value)
  values (
    auth.uid(), v_project, tg_table_name, coalesce(new.id, old.id),
    case tg_op when 'INSERT' then 'insert' when 'UPDATE' then 'update' else 'delete' end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.audit_contract_change() from public, anon, authenticated;

create trigger contract_versions_assign_no before insert on public.contract_versions
  for each row execute function public.assign_contract_version();
create trigger contract_versions_sync_current after insert on public.contract_versions
  for each row execute function public.sync_contract_current_version();
create trigger contract_versions_lock before update or delete on public.contract_versions
  for each row execute function public.lock_approved_contract_version();
create trigger contract_version_amounts_lock before update or delete on public.contract_version_amounts
  for each row execute function public.lock_approved_version_amounts();

create trigger contracts_set_updated_at before update on public.contracts
  for each row execute function public.set_updated_at();
create trigger contract_version_amounts_set_updated_at before update on public.contract_version_amounts
  for each row execute function public.set_updated_at();
create trigger contract_extensions_set_updated_at before update on public.contract_extensions
  for each row execute function public.set_updated_at();
create trigger change_orders_set_updated_at before update on public.change_orders
  for each row execute function public.set_updated_at();
create trigger change_order_amounts_set_updated_at before update on public.change_order_amounts
  for each row execute function public.set_updated_at();
create trigger correspondence_threads_set_updated_at before update on public.correspondence_threads
  for each row execute function public.set_updated_at();

create trigger contracts_audit after insert or update on public.contracts
  for each row execute function public.audit_contract_change();
create trigger contract_versions_audit after insert or update on public.contract_versions
  for each row execute function public.audit_contract_change();
create trigger contract_parties_audit after insert or update or delete on public.contract_parties
  for each row execute function public.audit_contract_change();
create trigger contract_extensions_audit after insert or update on public.contract_extensions
  for each row execute function public.audit_contract_change();
create trigger change_orders_audit after insert or update on public.change_orders
  for each row execute function public.audit_contract_change();

-- ============ 5. RLS ============
alter table public.contracts enable row level security;
alter table public.contract_versions enable row level security;
alter table public.contract_version_amounts enable row level security;
alter table public.contract_parties enable row level security;
alter table public.contract_stages enable row level security;
alter table public.contract_extensions enable row level security;
alter table public.change_orders enable row level security;
alter table public.change_order_amounts enable row level security;
alter table public.correspondence_threads enable row level security;
alter table public.correspondence_messages enable row level security;
alter table public.correspondence_message_audience enable row level security;

create policy contracts_select on public.contracts for select to authenticated
  using (private.can_access_contract(auth.uid(), id));
create policy contracts_insert on public.contracts for insert to authenticated
  with check (
    created_by = auth.uid()
    and private.is_project_insider(auth.uid(), project_id)
    and private.can(auth.uid(), 'contracts', 'create', null, project_id)
  );
create policy contracts_update on public.contracts for update to authenticated
  using (private.can_manage_contract(auth.uid(), id))
  with check (private.can_manage_contract(auth.uid(), id));

create policy contract_versions_select on public.contract_versions for select to authenticated
  using (private.can_access_contract(auth.uid(), contract_id));
create policy contract_versions_insert on public.contract_versions for insert to authenticated
  with check (created_by = auth.uid() and private.can_manage_contract(auth.uid(), contract_id));

create policy contract_version_amounts_select on public.contract_version_amounts for select to authenticated
  using (private.can_view_contract_amounts(auth.uid(), private.version_contract(version_id)));
create policy contract_version_amounts_insert on public.contract_version_amounts for insert to authenticated
  with check (
    private.can_manage_contract(auth.uid(), private.version_contract(version_id))
    and private.can_view_contract_amounts(auth.uid(), private.version_contract(version_id))
  );
create policy contract_version_amounts_update on public.contract_version_amounts for update to authenticated
  using (private.can_view_contract_amounts(auth.uid(), private.version_contract(version_id))
         and private.can_manage_contract(auth.uid(), private.version_contract(version_id)))
  with check (private.can_manage_contract(auth.uid(), private.version_contract(version_id)));

create policy contract_parties_select on public.contract_parties for select to authenticated
  using (private.can_access_contract(auth.uid(), contract_id));
create policy contract_parties_write on public.contract_parties for insert to authenticated
  with check (private.can_manage_contract(auth.uid(), contract_id));
create policy contract_parties_update on public.contract_parties for update to authenticated
  using (private.can_manage_contract(auth.uid(), contract_id)
         or (user_id = auth.uid()) )
  with check (private.can_manage_contract(auth.uid(), contract_id) or user_id = auth.uid());
create policy contract_parties_delete on public.contract_parties for delete to authenticated
  using (private.can_manage_contract(auth.uid(), contract_id));

create policy contract_stages_select on public.contract_stages for select to authenticated
  using (private.can_access_contract(auth.uid(), contract_id));
create policy contract_stages_insert on public.contract_stages for insert to authenticated
  with check (private.can_manage_contract(auth.uid(), contract_id));
create policy contract_stages_delete on public.contract_stages for delete to authenticated
  using (private.can_manage_contract(auth.uid(), contract_id));

create policy contract_extensions_select on public.contract_extensions for select to authenticated
  using (private.can_access_contract(auth.uid(), contract_id));
create policy contract_extensions_insert on public.contract_extensions for insert to authenticated
  with check (requested_by = auth.uid() and private.can_access_contract(auth.uid(), contract_id));
create policy contract_extensions_update on public.contract_extensions for update to authenticated
  using (requested_by = auth.uid() and status = 'requested')
  with check (requested_by = auth.uid() and status in ('requested','withdrawn')
              and decided_by is null and resulting_version_id is null);

create policy change_orders_select on public.change_orders for select to authenticated
  using (private.can_access_contract(auth.uid(), contract_id));
create policy change_orders_insert on public.change_orders for insert to authenticated
  with check (requested_by = auth.uid() and private.can_access_contract(auth.uid(), contract_id));
create policy change_orders_update on public.change_orders for update to authenticated
  using (requested_by = auth.uid() and status = 'requested')
  with check (requested_by = auth.uid() and status in ('requested','withdrawn')
              and decided_by is null and resulting_version_id is null);

create policy change_order_amounts_select on public.change_order_amounts for select to authenticated
  using (private.can_view_contract_amounts(
           auth.uid(), (select co.contract_id from public.change_orders co where co.id = change_order_id)));
create policy change_order_amounts_insert on public.change_order_amounts for insert to authenticated
  with check (exists (
    select 1 from public.change_orders co
    where co.id = change_order_id and co.requested_by = auth.uid()
      and private.can_access_contract(auth.uid(), co.contract_id)));

create policy threads_select on public.correspondence_threads for select to authenticated
  using (private.can_access_thread(auth.uid(), id));
create policy threads_insert on public.correspondence_threads for insert to authenticated
  with check (
    created_by = auth.uid()
    and private.can(auth.uid(), 'correspondence', 'create', null, project_id)
    and (private.is_project_insider(auth.uid(), project_id)
         or private.accepted_party_entity(auth.uid(), project_id) is not null)
  );
create policy threads_update on public.correspondence_threads for update to authenticated
  using (created_by = auth.uid() or private.is_project_insider(auth.uid(), project_id))
  with check (created_by = auth.uid() or private.is_project_insider(auth.uid(), project_id));

create policy messages_select on public.correspondence_messages for select to authenticated
  using (private.can_see_message(auth.uid(), id));
create policy messages_insert on public.correspondence_messages for insert to authenticated
  with check (
    author_id = auth.uid()
    and private.can_access_thread(auth.uid(), thread_id)
    and (
      visibility <> 'internal_note'
      or private.is_project_insider(auth.uid(), private.thread_project(thread_id))
    )
  );

create policy audience_select on public.correspondence_message_audience for select to authenticated
  using (private.can_see_message(auth.uid(), message_id));
create policy audience_insert on public.correspondence_message_audience for insert to authenticated
  with check (exists (
    select 1 from public.correspondence_messages m
    where m.id = message_id and m.author_id = auth.uid()));
create policy audience_delete on public.correspondence_message_audience for delete to authenticated
  using (exists (
    select 1 from public.correspondence_messages m
    where m.id = message_id and m.author_id = auth.uid()));

-- ============ 6. public view (finance masking) ============
create view public.contract_versions_public with (security_invoker = on) as
select
  v.id,
  v.contract_id,
  v.version_no,
  v.starts_on,
  v.ends_on,
  v.terms_text,
  v.file_path,
  v.source,
  v.change_reason,
  v.approved_by,
  v.approved_at,
  v.approval_note,
  v.created_at,
  a.amount,
  a.payment_terms,
  (a.version_id is not null) as can_view_amounts
from public.contract_versions v
left join public.contract_version_amounts a on a.version_id = v.id;

grant select on public.contract_versions_public to authenticated;
