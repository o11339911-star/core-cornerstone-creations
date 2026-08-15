-- =========================================================
-- Phase 16-B — financial documents, retention holds, immutable ledger
-- Contractual/accounting record ONLY. Rakeez holds no funds, moves no money,
-- provides no licensed financial or tax service, and computes no tax.
-- =========================================================

-- ---------------------------------------------------------
-- 0. reference chart of accounts
-- ---------------------------------------------------------
create table public.ledger_accounts (
  code text primary key,
  name_ar text not null,
  name_en text not null,
  normal_side text not null check (normal_side in ('debit','credit')),
  created_at timestamptz not null default now()
);
comment on table public.ledger_accounts is
  'Minimal internal chart of accounts. Not a statutory ledger and not a tax engine.';
grant select on public.ledger_accounts to authenticated;
grant all on public.ledger_accounts to service_role;
alter table public.ledger_accounts enable row level security;
create policy ledger_accounts_select_all on public.ledger_accounts
  for select to authenticated using (true);

insert into public.ledger_accounts (code, name_ar, name_en, normal_side) values
  ('1000','النقد/التحويلات خارج المنصة','Cash / off-platform transfers','debit'),
  ('1200','ذمم مدينة','Accounts receivable','debit'),
  ('1300','ضريبة مدخلات','Input tax','debit'),
  ('1400','محتجز لدى الطرف الآخر','Retention held by counterparty','debit'),
  ('2100','ذمم دائنة','Accounts payable','credit'),
  ('2300','ضريبة مخرجات مستحقة','Output tax payable','credit'),
  ('2400','التزام محتجز','Retention liability','credit'),
  ('4000','إيرادات المشروع','Project revenue','credit'),
  ('4900','إيرادات أخرى/مصادرة','Other income / forfeiture','credit'),
  ('5000','تكاليف المشروع','Project cost','debit');

-- ---------------------------------------------------------
-- 1. ledger entries + lines (append-only, no exception)
-- ---------------------------------------------------------
create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  entry_date date not null default current_date,
  source_type text not null check (source_type in
    ('financial_execution','document_issue','document_cancel','retention_event','manual_adjustment','reversal')),
  source_id uuid,
  memo text,
  is_reversal boolean not null default false,
  reverses_entry_id uuid references public.ledger_entries(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
comment on table public.ledger_entries is
  'Immutable internal double-entry ledger. Append-only for every writer including service_role. Correction happens only through reverse_ledger_entry.';
-- a given entry can be reversed at most once, enforced by the database
create unique index ledger_entries_reverses_uk on public.ledger_entries(reverses_entry_id)
  where reverses_entry_id is not null;
create index idx_ledger_entries_project on public.ledger_entries(project_id);
create index idx_ledger_entries_source on public.ledger_entries(source_type, source_id);

create table public.ledger_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.ledger_entries(id),
  line_no int not null,
  account_code text not null references public.ledger_accounts(code),
  side text not null check (side in ('debit','credit')),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'SAR',
  party_entity_id uuid references public.entities(id),
  memo text,
  created_at timestamptz not null default now(),
  unique (entry_id, line_no)
);
comment on table public.ledger_lines is
  'Ledger amounts. Visible only with finance.view on the project. Append-only, no exception.';
create index idx_ledger_lines_entry on public.ledger_lines(entry_id);

grant select on public.ledger_entries to authenticated;
grant select on public.ledger_lines to authenticated;
grant select, insert on public.ledger_entries to service_role;
grant select, insert on public.ledger_lines to service_role;
alter table public.ledger_entries enable row level security;
alter table public.ledger_lines enable row level security;

-- header visible to anyone on the project (existence + state, no numbers)
create policy ledger_entries_select_scope on public.ledger_entries
  for select to authenticated
  using (private.can_access_project((select auth.uid()), project_id));

-- numbers only with finance.view
create policy ledger_lines_select_finance on public.ledger_lines
  for select to authenticated
  using (
    exists (
      select 1 from public.ledger_entries e
      where e.id = entry_id
        and private.can_view_project_finance((select auth.uid()), e.project_id)
    )
  );

-- absolute append-only
create trigger ledger_entries_append_only
  before update or delete or truncate on public.ledger_entries
  for each statement execute function public.prevent_row_mutation();
create trigger ledger_entries_append_only_row
  before update or delete on public.ledger_entries
  for each row execute function public.prevent_row_mutation();
create trigger ledger_lines_append_only
  before update or delete or truncate on public.ledger_lines
  for each statement execute function public.prevent_row_mutation();
create trigger ledger_lines_append_only_row
  before update or delete on public.ledger_lines
  for each row execute function public.prevent_row_mutation();

-- deferred balance check: evaluated at commit, so a whole entry must balance
create or replace function public.enforce_ledger_balance()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_entry uuid := case when tg_table_name = 'ledger_entries' then new.id else new.entry_id end;
  v_debit numeric := 0;
  v_credit numeric := 0;
  v_count int := 0;
begin
  select coalesce(sum(case when side = 'debit' then amount else 0 end), 0),
         coalesce(sum(case when side = 'credit' then amount else 0 end), 0),
         count(*)
    into v_debit, v_credit, v_count
  from public.ledger_lines where entry_id = v_entry;

  if v_count < 2 then
    raise exception 'A ledger entry needs at least two lines (found %)', v_count using errcode = '22023';
  end if;
  if v_debit <> v_credit then
    raise exception 'Unbalanced ledger entry: debit % <> credit %', v_debit, v_credit using errcode = '22023';
  end if;
  return null;
end; $$;

create constraint trigger ledger_entries_balanced
  after insert on public.ledger_entries
  deferrable initially deferred
  for each row execute function public.enforce_ledger_balance();
create constraint trigger ledger_lines_balanced
  after insert on public.ledger_lines
  deferrable initially deferred
  for each row execute function public.enforce_ledger_balance();

-- ---------------------------------------------------------
-- 2. internal posting helpers (the only write path)
-- ---------------------------------------------------------
-- _lines: [{account_code, side, amount, party_entity_id?, memo?}, ...]
create or replace function private.post_ledger_entry(
  _project_id uuid,
  _source_type text,
  _source_id uuid,
  _memo text,
  _lines jsonb,
  _reverses_entry_id uuid default null,
  _entry_date date default null
) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_entry uuid;
  v_item jsonb;
  v_no int := 0;
begin
  if _lines is null or jsonb_typeof(_lines) <> 'array' or jsonb_array_length(_lines) < 2 then
    raise exception 'A ledger entry needs at least two lines' using errcode = '22023';
  end if;

  insert into public.ledger_entries
    (project_id, entry_date, source_type, source_id, memo, is_reversal, reverses_entry_id, created_by)
  values (_project_id, coalesce(_entry_date, current_date), _source_type, _source_id, _memo,
          _reverses_entry_id is not null, _reverses_entry_id, auth.uid())
  returning id into v_entry;

  for v_item in select * from jsonb_array_elements(_lines) loop
    v_no := v_no + 1;
    insert into public.ledger_lines
      (entry_id, line_no, account_code, side, amount, party_entity_id, memo)
    values (v_entry, v_no, v_item->>'account_code', v_item->>'side',
            (v_item->>'amount')::numeric,
            nullif(v_item->>'party_entity_id','')::uuid, v_item->>'memo');
  end loop;

  return v_entry;
end; $$;
revoke all on function private.post_ledger_entry(uuid,text,uuid,text,jsonb,uuid,date) from public, anon, authenticated;

create or replace function private.post_reversal_entry(
  _entry_id uuid, _memo text, _source_type text default 'reversal', _source_id uuid default null,
  _lines jsonb default null
) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_e public.ledger_entries%rowtype;
  v_lines jsonb;
begin
  select * into v_e from public.ledger_entries where id = _entry_id;
  if v_e.id is null then
    raise exception 'Ledger entry not found' using errcode = '22023';
  end if;
  if v_e.is_reversal then
    raise exception 'A reversal entry cannot itself be reversed' using errcode = '42501';
  end if;
  if exists (select 1 from public.ledger_entries where reverses_entry_id = _entry_id) then
    raise exception 'This ledger entry has already been reversed' using errcode = '42501';
  end if;

  if _lines is null then
    select jsonb_agg(jsonb_build_object(
             'account_code', l.account_code,
             'side', case when l.side = 'debit' then 'credit' else 'debit' end,
             'amount', l.amount,
             'party_entity_id', l.party_entity_id,
             'memo', l.memo) order by l.line_no)
      into v_lines
    from public.ledger_lines l where l.entry_id = _entry_id;
  else
    v_lines := _lines;
  end if;

  if v_lines is null then
    raise exception 'The original entry has no lines to reverse' using errcode = '22023';
  end if;

  return private.post_ledger_entry(
    v_e.project_id, _source_type, coalesce(_source_id, _entry_id), _memo, v_lines, _entry_id);
end; $$;
revoke all on function private.post_reversal_entry(uuid,text,text,uuid,jsonb) from public, anon, authenticated;

-- public correction path
create or replace function public.reverse_ledger_entry(_entry_id uuid, _reason text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_actor uuid := auth.uid();
  v_e public.ledger_entries%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if coalesce(length(btrim(_reason)), 0) < 3 then
    raise exception 'A reversal reason is required' using errcode = '22023';
  end if;
  select * into v_e from public.ledger_entries where id = _entry_id;
  if v_e.id is null then raise exception 'Ledger entry not found' using errcode = '22023'; end if;
  if not private.can(v_actor, 'finance'::public.app_module, 'approve'::public.app_action, null, v_e.project_id) then
    raise exception 'Not allowed to reverse ledger entries on this project' using errcode = '42501';
  end if;
  return private.post_reversal_entry(_entry_id, _reason);
end; $$;
revoke all on function public.reverse_ledger_entry(uuid,text) from public, anon;
grant execute on function public.reverse_ledger_entry(uuid,text) to authenticated, service_role;

-- ---------------------------------------------------------
-- 3. financial documents (header + append-only versions + gated amounts)
-- ---------------------------------------------------------
create table public.financial_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  contract_id uuid references public.contracts(id),
  milestone_id uuid references public.payment_milestones(id),
  disbursement_request_id uuid references public.disbursement_requests(id),
  doc_type text not null check (doc_type in ('invoice','tax_invoice','credit_note','debit_note','receipt')),
  direction text not null check (direction in ('issued','received')),
  doc_number text,
  issue_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft','issued','cancelled')),
  issuer_party_id uuid references public.project_parties(id),
  counterparty_party_id uuid references public.project_parties(id),
  references_document_id uuid references public.financial_documents(id),
  current_version_id uuid,
  cancel_reason text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.financial_documents is
  'Record of financial documents issued/received by the parties OUTSIDE the platform. Rakeez does not issue tax documents, does not compute tax, and is not a licensed financial or tax service. Tax rate and tax amount are plain user-entered fields.';
create unique index financial_documents_number_uk
  on public.financial_documents(project_id, doc_type, doc_number)
  where doc_number is not null;
create index idx_financial_documents_project on public.financial_documents(project_id);

create table public.financial_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.financial_documents(id) on delete cascade,
  version_no int not null,
  change_reason text,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (document_id, version_no)
);
comment on table public.financial_document_versions is
  'Append-only document versions. A correction is always a NEW version; nothing is ever updated in place.';

create table public.financial_document_amounts (
  version_id uuid primary key references public.financial_document_versions(id) on delete cascade,
  subtotal numeric(14,2) not null check (subtotal >= 0),
  tax_rate numeric(5,2) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  total numeric(14,2) not null check (total >= 0),
  retention_amount numeric(14,2) not null default 0 check (retention_amount >= 0),
  currency text not null default 'SAR',
  created_at timestamptz not null default now()
);
comment on table public.financial_document_amounts is
  'User-entered amounts. tax_rate/tax_amount are recorded as declared by the party; the platform performs no tax calculation.';

alter table public.financial_documents
  add constraint financial_documents_current_version_fkey
  foreign key (current_version_id) references public.financial_document_versions(id);

-- a credit/debit note must point at a source document
create or replace function public.enforce_financial_document_reference()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.doc_type in ('credit_note','debit_note') then
    if new.references_document_id is null then
      raise exception 'A credit/debit note must reference the original document' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.financial_documents d
      where d.id = new.references_document_id
        and d.project_id = new.project_id
        and d.doc_type in ('invoice','tax_invoice')
    ) then
      raise exception 'The referenced document must be an invoice in the same project' using errcode = '22023';
    end if;
  end if;
  return new;
end; $$;
create trigger financial_documents_reference_guard
  before insert or update on public.financial_documents
  for each row execute function public.enforce_financial_document_reference();

-- totals must be internally consistent (still no tax computation)
create or replace function public.enforce_document_amount_total()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if abs(new.total - (new.subtotal + new.tax_amount)) > 0.01 then
    raise exception 'total must equal subtotal + tax_amount (no tax is computed by the platform)'
      using errcode = '22023';
  end if;
  return new;
end; $$;
create trigger financial_document_amounts_total_check
  before insert on public.financial_document_amounts
  for each row execute function public.enforce_document_amount_total();

create trigger financial_document_versions_append_only
  before update or delete on public.financial_document_versions
  for each row execute function public.prevent_row_mutation();
create trigger financial_document_amounts_append_only
  before update or delete on public.financial_document_amounts
  for each row execute function public.prevent_row_mutation();
create trigger financial_documents_set_updated_at
  before update on public.financial_documents
  for each row execute function public.set_updated_at();

grant select on public.financial_documents to authenticated;
grant select on public.financial_document_versions to authenticated;
grant select on public.financial_document_amounts to authenticated;
grant all on public.financial_documents to service_role;
grant select, insert on public.financial_document_versions to service_role;
grant select, insert on public.financial_document_amounts to service_role;
alter table public.financial_documents enable row level security;
alter table public.financial_document_versions enable row level security;
alter table public.financial_document_amounts enable row level security;

create policy financial_documents_select_scope on public.financial_documents
  for select to authenticated
  using (private.can_access_project((select auth.uid()), project_id));

create policy financial_document_versions_select_scope on public.financial_document_versions
  for select to authenticated
  using (
    exists (select 1 from public.financial_documents d
            where d.id = document_id
              and private.can_access_project((select auth.uid()), d.project_id))
  );

create policy financial_document_amounts_select_finance on public.financial_document_amounts
  for select to authenticated
  using (
    exists (select 1 from public.financial_document_versions v
            join public.financial_documents d on d.id = v.document_id
            where v.id = version_id
              and private.can_view_project_finance((select auth.uid()), d.project_id))
  );

-- ---------------------------------------------------------
-- 4. retention holds (contractual tracking, NOT custody)
-- ---------------------------------------------------------
create table public.retention_holds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  contract_id uuid references public.contracts(id),
  milestone_id uuid references public.payment_milestones(id),
  kind text not null default 'retention' check (kind in ('retention','advance','guarantee')),
  holder_party_id uuid references public.project_parties(id),
  beneficiary_party_id uuid references public.project_parties(id),
  hold_start_date date not null default current_date,
  expected_release_date date,
  release_terms_ar text,
  release_terms_en text,
  status text not null default 'active'
    check (status in ('active','partially_released','released','forfeited','cancelled')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.retention_holds is
  'Contractual tracking of amounts the parties agreed to retain OUTSIDE the platform. This is NOT custody and NOT escrow: Rakeez never holds these funds.';
create index idx_retention_holds_project on public.retention_holds(project_id);

create table public.retention_hold_amounts (
  hold_id uuid primary key references public.retention_holds(id) on delete cascade,
  held_amount numeric(14,2) not null check (held_amount > 0),
  released_amount numeric(14,2) not null default 0 check (released_amount >= 0),
  currency text not null default 'SAR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.retention_events (
  id uuid primary key default gen_random_uuid(),
  hold_id uuid not null references public.retention_holds(id),
  event_type text not null check (event_type in ('created','partial_release','full_release','forfeit','cancel')),
  event_date date not null default current_date,
  note text,
  document_id uuid references public.financial_documents(id),
  acted_by uuid not null references auth.users(id),
  acted_at timestamptz not null default now()
);
comment on table public.retention_events is 'Append-only history of a contractual retention record.';

create table public.retention_event_amounts (
  event_id uuid primary key references public.retention_events(id) on delete cascade,
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'SAR',
  created_at timestamptz not null default now()
);

create trigger retention_events_append_only
  before update or delete on public.retention_events
  for each row execute function public.prevent_row_mutation();
create trigger retention_event_amounts_append_only
  before update or delete on public.retention_event_amounts
  for each row execute function public.prevent_row_mutation();
create trigger retention_holds_set_updated_at
  before update on public.retention_holds
  for each row execute function public.set_updated_at();

grant select on public.retention_holds to authenticated;
grant select on public.retention_hold_amounts to authenticated;
grant select on public.retention_events to authenticated;
grant select on public.retention_event_amounts to authenticated;
grant all on public.retention_holds to service_role;
grant all on public.retention_hold_amounts to service_role;
grant select, insert on public.retention_events to service_role;
grant select, insert on public.retention_event_amounts to service_role;
alter table public.retention_holds enable row level security;
alter table public.retention_hold_amounts enable row level security;
alter table public.retention_events enable row level security;
alter table public.retention_event_amounts enable row level security;

create policy retention_holds_select_scope on public.retention_holds
  for select to authenticated
  using (private.can_access_project((select auth.uid()), project_id));

create policy retention_hold_amounts_select_finance on public.retention_hold_amounts
  for select to authenticated
  using (
    exists (select 1 from public.retention_holds h
            where h.id = hold_id
              and private.can_view_project_finance((select auth.uid()), h.project_id))
  );

create policy retention_events_select_scope on public.retention_events
  for select to authenticated
  using (
    exists (select 1 from public.retention_holds h
            where h.id = hold_id
              and private.can_access_project((select auth.uid()), h.project_id))
  );

create policy retention_event_amounts_select_finance on public.retention_event_amounts
  for select to authenticated
  using (
    exists (select 1 from public.retention_events e
            join public.retention_holds h on h.id = e.hold_id
            where e.id = event_id
              and private.can_view_project_finance((select auth.uid()), h.project_id))
  );

-- ---------------------------------------------------------
-- 5. automatic ledger generation from phase 16-A executions
-- ---------------------------------------------------------
create or replace function public.post_execution_ledger_entry()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_gross numeric;
  v_ret numeric;
  v_net numeric;
  v_lines jsonb;
begin
  select a.gross_amount, coalesce(a.retention_amount, 0), a.net_amount
    into v_gross, v_ret, v_net
  from public.disbursement_request_amounts a
  where a.request_id = new.request_id;

  if v_gross is null then
    return new;
  end if;

  v_lines := jsonb_build_array(
    jsonb_build_object('account_code','2100','side','debit','amount',v_gross,'memo','Payable settled'),
    jsonb_build_object('account_code','1000','side','credit','amount',v_net,'memo','Off-platform transfer acknowledged')
  );
  if v_ret > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code','2400','side','credit','amount',v_ret,'memo','Retention withheld'));
  end if;

  perform private.post_ledger_entry(
    new.project_id, 'financial_execution', new.id,
    'Disbursement execution ' || coalesce(new.external_reference, new.idempotency_key),
    v_lines, null, new.executed_at::date);
  return new;
end; $$;
create trigger financial_executions_post_ledger
  after insert on public.financial_executions
  for each row execute function public.post_execution_ledger_entry();

-- ---------------------------------------------------------
-- 6. document functions
-- ---------------------------------------------------------
create or replace function private.document_ledger_lines(_version_id uuid, _direction text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  a public.financial_document_amounts%rowtype;
  v_lines jsonb;
begin
  select * into a from public.financial_document_amounts where version_id = _version_id;
  if a.version_id is null then
    raise exception 'The document version has no amounts' using errcode = '22023';
  end if;

  if _direction = 'issued' then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code','1200','side','debit','amount',a.total,'memo','Receivable'),
      jsonb_build_object('account_code','4000','side','credit','amount',a.subtotal,'memo','Revenue'));
    if a.tax_amount > 0 then
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object('account_code','2300','side','credit','amount',a.tax_amount,'memo','Declared tax'));
    end if;
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code','5000','side','debit','amount',a.subtotal,'memo','Project cost'),
      jsonb_build_object('account_code','2100','side','credit','amount',a.total,'memo','Payable'));
    if a.tax_amount > 0 then
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object('account_code','1300','side','debit','amount',a.tax_amount,'memo','Declared input tax'));
    end if;
  end if;
  return v_lines;
end; $$;
revoke all on function private.document_ledger_lines(uuid,text) from public, anon, authenticated;

create or replace function private.latest_document_entry(_document_id uuid)
returns uuid language sql stable security definer set search_path to 'public' as $$
  select e.id
  from public.ledger_entries e
  join public.financial_document_versions v on v.id = e.source_id
  where v.document_id = _document_id
    and e.source_type = 'document_issue'
    and not exists (select 1 from public.ledger_entries r where r.reverses_entry_id = e.id)
  order by e.created_at desc
  limit 1;
$$;
revoke all on function private.latest_document_entry(uuid) from public, anon, authenticated;

create or replace function public.create_financial_document(
  _project_id uuid,
  _doc_type text,
  _direction text,
  _subtotal numeric,
  _tax_rate numeric default 0,
  _tax_amount numeric default 0,
  _doc_number text default null,
  _issue_date date default null,
  _contract_id uuid default null,
  _milestone_id uuid default null,
  _references_document_id uuid default null,
  _retention_amount numeric default 0,
  _payload jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_actor uuid := auth.uid();
  v_doc uuid;
  v_ver uuid;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not private.can(v_actor, 'finance'::public.app_module, 'create'::public.app_action, null, _project_id) then
    raise exception 'Not allowed to create financial documents on this project' using errcode = '42501';
  end if;

  insert into public.financial_documents
    (project_id, contract_id, milestone_id, doc_type, direction, doc_number, issue_date,
     references_document_id, created_by)
  values (_project_id, _contract_id, _milestone_id, _doc_type, _direction, _doc_number,
          coalesce(_issue_date, current_date), _references_document_id, v_actor)
  returning id into v_doc;

  insert into public.financial_document_versions (document_id, version_no, payload, created_by)
  values (v_doc, 1, coalesce(_payload, '{}'::jsonb), v_actor)
  returning id into v_ver;

  insert into public.financial_document_amounts
    (version_id, subtotal, tax_rate, tax_amount, total, retention_amount)
  values (v_ver, _subtotal, coalesce(_tax_rate, 0), coalesce(_tax_amount, 0),
          _subtotal + coalesce(_tax_amount, 0), coalesce(_retention_amount, 0));

  update public.financial_documents set current_version_id = v_ver where id = v_doc;

  perform private.log_finance_event('financial_documents', v_doc, 'insert', _project_id,
    jsonb_build_object('doc_type', _doc_type, 'direction', _direction, 'version_no', 1));
  return v_doc;
end; $$;

create or replace function public.revise_financial_document(
  _document_id uuid,
  _subtotal numeric,
  _change_reason text,
  _tax_rate numeric default 0,
  _tax_amount numeric default 0,
  _retention_amount numeric default 0,
  _payload jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_actor uuid := auth.uid();
  v_d public.financial_documents%rowtype;
  v_next int;
  v_ver uuid;
  v_old_entry uuid;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if coalesce(length(btrim(_change_reason)), 0) < 3 then
    raise exception 'A correction requires an explicit reason' using errcode = '22023';
  end if;
  select * into v_d from public.financial_documents where id = _document_id for update;
  if v_d.id is null then raise exception 'Document not found' using errcode = '22023'; end if;
  if v_d.status = 'cancelled' then
    raise exception 'A cancelled document cannot be revised' using errcode = '22023';
  end if;
  if not private.can(v_actor, 'finance'::public.app_module, 'update'::public.app_action, null, v_d.project_id) then
    raise exception 'Not allowed to revise financial documents on this project' using errcode = '42501';
  end if;

  select coalesce(max(version_no), 0) + 1 into v_next
  from public.financial_document_versions where document_id = _document_id;

  insert into public.financial_document_versions (document_id, version_no, change_reason, payload, created_by)
  values (_document_id, v_next, _change_reason, coalesce(_payload, '{}'::jsonb), v_actor)
  returning id into v_ver;

  insert into public.financial_document_amounts
    (version_id, subtotal, tax_rate, tax_amount, total, retention_amount)
  values (v_ver, _subtotal, coalesce(_tax_rate, 0), coalesce(_tax_amount, 0),
          _subtotal + coalesce(_tax_amount, 0), coalesce(_retention_amount, 0));

  update public.financial_documents set current_version_id = v_ver where id = _document_id;

  -- an already-issued document keeps its ledger honest: reverse then re-post
  if v_d.status = 'issued' then
    v_old_entry := private.latest_document_entry(_document_id);
    if v_old_entry is not null then
      perform private.post_reversal_entry(v_old_entry,
        'Correction: ' || _change_reason, 'document_cancel', _document_id);
    end if;
    perform private.post_ledger_entry(v_d.project_id, 'document_issue', v_ver,
      'Revised document v' || v_next, private.document_ledger_lines(v_ver, v_d.direction));
  end if;

  perform private.log_finance_event('financial_documents', _document_id, 'update', v_d.project_id,
    jsonb_build_object('version_no', v_next, 'reason', _change_reason));
  return v_ver;
end; $$;

create or replace function public.issue_financial_document(_document_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_actor uuid := auth.uid();
  v_d public.financial_documents%rowtype;
  v_entry uuid;
  v_src_entry uuid;
  v_lines jsonb;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into v_d from public.financial_documents where id = _document_id for update;
  if v_d.id is null then raise exception 'Document not found' using errcode = '22023'; end if;
  if v_d.status <> 'draft' then
    raise exception 'Only a draft document can be issued (current: %)', v_d.status using errcode = '22023';
  end if;
  if not private.can(v_actor, 'finance'::public.app_module, 'approve'::public.app_action, null, v_d.project_id) then
    raise exception 'Not allowed to issue financial documents on this project' using errcode = '42501';
  end if;
  if v_d.current_version_id is null then
    raise exception 'The document has no version to issue' using errcode = '22023';
  end if;

  if v_d.doc_type in ('credit_note','debit_note') then
    v_src_entry := private.latest_document_entry(v_d.references_document_id);
    if v_src_entry is null then
      raise exception 'The referenced invoice has no open ledger entry to offset' using errcode = '22023';
    end if;
    -- mirror-opposite lines built from the note's own amounts
    select jsonb_agg(jsonb_build_object(
             'account_code', l->>'account_code',
             'side', case when l->>'side' = 'debit' then 'credit' else 'debit' end,
             'amount', (l->>'amount')::numeric,
             'memo', l->>'memo'))
      into v_lines
    from jsonb_array_elements(private.document_ledger_lines(v_d.current_version_id, v_d.direction)) l;

    v_entry := private.post_reversal_entry(v_src_entry,
      'Credit/debit note ' || coalesce(v_d.doc_number, ''), 'document_cancel', _document_id, v_lines);
  else
    v_entry := private.post_ledger_entry(v_d.project_id, 'document_issue', v_d.current_version_id,
      'Document issued ' || coalesce(v_d.doc_number, ''),
      private.document_ledger_lines(v_d.current_version_id, v_d.direction), null, v_d.issue_date);
  end if;

  update public.financial_documents set status = 'issued' where id = _document_id;

  perform private.log_finance_event('financial_documents', _document_id, 'update', v_d.project_id,
    jsonb_build_object('status', 'issued', 'ledger_entry_id', v_entry));
  return v_entry;
end; $$;

create or replace function public.cancel_financial_document(_document_id uuid, _reason text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_actor uuid := auth.uid();
  v_d public.financial_documents%rowtype;
  v_entry uuid;
  v_rev uuid;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if coalesce(length(btrim(_reason)), 0) < 3 then
    raise exception 'A cancellation reason is required' using errcode = '22023';
  end if;
  select * into v_d from public.financial_documents where id = _document_id for update;
  if v_d.id is null then raise exception 'Document not found' using errcode = '22023'; end if;
  if v_d.status = 'cancelled' then
    raise exception 'The document is already cancelled' using errcode = '22023';
  end if;
  if not private.can(v_actor, 'finance'::public.app_module, 'approve'::public.app_action, null, v_d.project_id) then
    raise exception 'Not allowed to cancel financial documents on this project' using errcode = '42501';
  end if;

  if v_d.status = 'issued' then
    v_entry := private.latest_document_entry(_document_id);
    if v_entry is not null then
      v_rev := private.post_reversal_entry(v_entry, 'Cancelled: ' || _reason, 'document_cancel', _document_id);
    end if;
  end if;

  update public.financial_documents
     set status = 'cancelled', cancel_reason = _reason
   where id = _document_id;

  perform private.log_finance_event('financial_documents', _document_id, 'update', v_d.project_id,
    jsonb_build_object('status', 'cancelled', 'reason', _reason));
  return v_rev;
end; $$;

-- ---------------------------------------------------------
-- 7. retention functions
-- ---------------------------------------------------------
create or replace function public.create_retention_hold(
  _project_id uuid,
  _held_amount numeric,
  _kind text default 'retention',
  _contract_id uuid default null,
  _milestone_id uuid default null,
  _expected_release_date date default null,
  _release_terms_ar text default null,
  _release_terms_en text default null
) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_actor uuid := auth.uid();
  v_hold uuid;
  v_event uuid;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if _held_amount is null or _held_amount <= 0 then
    raise exception 'A retention record needs a positive amount' using errcode = '22023';
  end if;
  if not private.can(v_actor, 'finance'::public.app_module, 'create'::public.app_action, null, _project_id) then
    raise exception 'Not allowed to create retention records on this project' using errcode = '42501';
  end if;

  insert into public.retention_holds
    (project_id, contract_id, milestone_id, kind, expected_release_date,
     release_terms_ar, release_terms_en, created_by)
  values (_project_id, _contract_id, _milestone_id, _kind, _expected_release_date,
          _release_terms_ar, _release_terms_en, v_actor)
  returning id into v_hold;

  insert into public.retention_hold_amounts (hold_id, held_amount) values (v_hold, _held_amount);

  insert into public.retention_events (hold_id, event_type, acted_by, note)
  values (v_hold, 'created', v_actor, 'Contractual retention recorded (not custody)')
  returning id into v_event;
  insert into public.retention_event_amounts (event_id, amount) values (v_event, _held_amount);

  perform private.post_ledger_entry(_project_id, 'retention_event', v_event,
    'Retention recorded',
    jsonb_build_array(
      jsonb_build_object('account_code','1400','side','debit','amount',_held_amount,'memo','Retention tracked'),
      jsonb_build_object('account_code','2400','side','credit','amount',_held_amount,'memo','Retention liability')));

  perform private.log_finance_event('retention_holds', v_hold, 'insert', _project_id,
    jsonb_build_object('kind', _kind));
  return v_hold;
end; $$;

create or replace function public.release_retention(
  _hold_id uuid, _amount numeric, _note text default null, _document_id uuid default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_actor uuid := auth.uid();
  v_h public.retention_holds%rowtype;
  v_a public.retention_hold_amounts%rowtype;
  v_new_released numeric;
  v_event uuid;
  v_type text;
  v_status text;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into v_h from public.retention_holds where id = _hold_id for update;
  if v_h.id is null then raise exception 'Retention record not found' using errcode = '22023'; end if;
  if v_h.status in ('released','forfeited','cancelled') then
    raise exception 'This retention record is % and cannot be released', v_h.status using errcode = '22023';
  end if;
  if not private.can(v_actor, 'finance'::public.app_module, 'approve'::public.app_action, null, v_h.project_id) then
    raise exception 'Not allowed to release retention on this project' using errcode = '42501';
  end if;
  if _amount is null or _amount <= 0 then
    raise exception 'A release needs a positive amount' using errcode = '22023';
  end if;

  select * into v_a from public.retention_hold_amounts where hold_id = _hold_id for update;
  v_new_released := v_a.released_amount + _amount;
  if v_new_released > v_a.held_amount + 0.001 then
    raise exception 'Release exceeds the retained amount (remaining %)', v_a.held_amount - v_a.released_amount
      using errcode = '22023';
  end if;

  v_type := case when v_new_released >= v_a.held_amount - 0.001 then 'full_release' else 'partial_release' end;
  v_status := case when v_type = 'full_release' then 'released' else 'partially_released' end;

  insert into public.retention_events (hold_id, event_type, note, document_id, acted_by)
  values (_hold_id, v_type, _note, _document_id, v_actor)
  returning id into v_event;
  insert into public.retention_event_amounts (event_id, amount) values (v_event, _amount);

  update public.retention_hold_amounts set released_amount = v_new_released, updated_at = now()
   where hold_id = _hold_id;
  update public.retention_holds set status = v_status where id = _hold_id;

  perform private.post_ledger_entry(v_h.project_id, 'retention_event', v_event,
    'Retention release',
    jsonb_build_array(
      jsonb_build_object('account_code','2400','side','debit','amount',_amount,'memo','Retention liability released'),
      jsonb_build_object('account_code','1400','side','credit','amount',_amount,'memo','Retention tracked released')));

  perform private.log_finance_event('retention_holds', _hold_id, 'update', v_h.project_id,
    jsonb_build_object('event', v_type, 'status', v_status));

  return jsonb_build_object('event_id', v_event, 'event_type', v_type, 'status', v_status);
end; $$;

create or replace function public.forfeit_retention(_hold_id uuid, _reason text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_actor uuid := auth.uid();
  v_h public.retention_holds%rowtype;
  v_a public.retention_hold_amounts%rowtype;
  v_event uuid;
  v_remaining numeric;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if coalesce(length(btrim(_reason)), 0) < 3 then
    raise exception 'A forfeiture reason is required' using errcode = '22023';
  end if;
  select * into v_h from public.retention_holds where id = _hold_id for update;
  if v_h.id is null then raise exception 'Retention record not found' using errcode = '22023'; end if;
  if v_h.status in ('released','forfeited','cancelled') then
    raise exception 'This retention record is % and cannot be forfeited', v_h.status using errcode = '22023';
  end if;
  if not private.can(v_actor, 'finance'::public.app_module, 'approve'::public.app_action, null, v_h.project_id) then
    raise exception 'Not allowed to forfeit retention on this project' using errcode = '42501';
  end if;

  select * into v_a from public.retention_hold_amounts where hold_id = _hold_id for update;
  v_remaining := v_a.held_amount - v_a.released_amount;
  if v_remaining <= 0 then
    raise exception 'Nothing remains to forfeit' using errcode = '22023';
  end if;

  insert into public.retention_events (hold_id, event_type, note, acted_by)
  values (_hold_id, 'forfeit', _reason, v_actor) returning id into v_event;
  insert into public.retention_event_amounts (event_id, amount) values (v_event, v_remaining);

  update public.retention_holds set status = 'forfeited' where id = _hold_id;

  perform private.post_ledger_entry(v_h.project_id, 'retention_event', v_event, 'Retention forfeited',
    jsonb_build_array(
      jsonb_build_object('account_code','2400','side','debit','amount',v_remaining,'memo','Retention liability closed'),
      jsonb_build_object('account_code','4900','side','credit','amount',v_remaining,'memo','Forfeited retention')));

  perform private.log_finance_event('retention_holds', _hold_id, 'update', v_h.project_id,
    jsonb_build_object('event', 'forfeit', 'reason', _reason));
  return v_event;
end; $$;

create or replace function public.cancel_retention_hold(_hold_id uuid, _reason text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_actor uuid := auth.uid();
  v_h public.retention_holds%rowtype;
  v_a public.retention_hold_amounts%rowtype;
  v_event uuid;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if coalesce(length(btrim(_reason)), 0) < 3 then
    raise exception 'A cancellation reason is required' using errcode = '22023';
  end if;
  select * into v_h from public.retention_holds where id = _hold_id for update;
  if v_h.id is null then raise exception 'Retention record not found' using errcode = '22023'; end if;
  if v_h.status <> 'active' then
    raise exception 'Only an untouched retention record can be cancelled (current: %)', v_h.status
      using errcode = '22023';
  end if;
  if not private.can(v_actor, 'finance'::public.app_module, 'approve'::public.app_action, null, v_h.project_id) then
    raise exception 'Not allowed to cancel retention on this project' using errcode = '42501';
  end if;

  select * into v_a from public.retention_hold_amounts where hold_id = _hold_id;

  insert into public.retention_events (hold_id, event_type, note, acted_by)
  values (_hold_id, 'cancel', _reason, v_actor) returning id into v_event;
  insert into public.retention_event_amounts (event_id, amount) values (v_event, 0);

  update public.retention_holds set status = 'cancelled' where id = _hold_id;

  perform private.post_ledger_entry(v_h.project_id, 'retention_event', v_event, 'Retention cancelled',
    jsonb_build_array(
      jsonb_build_object('account_code','2400','side','debit','amount',v_a.held_amount - v_a.released_amount,'memo','Retention reversed'),
      jsonb_build_object('account_code','1400','side','credit','amount',v_a.held_amount - v_a.released_amount,'memo','Retention reversed')));

  perform private.log_finance_event('retention_holds', _hold_id, 'update', v_h.project_id,
    jsonb_build_object('event', 'cancel', 'reason', _reason));
  return v_event;
end; $$;

-- ---------------------------------------------------------
-- 8. grants: functions are the only write path
-- ---------------------------------------------------------
revoke insert, update, delete, truncate, references on public.financial_documents from authenticated, anon;
revoke insert, update, delete, truncate, references on public.financial_document_versions from authenticated, anon;
revoke insert, update, delete, truncate, references on public.financial_document_amounts from authenticated, anon;
revoke insert, update, delete, truncate, references on public.retention_holds from authenticated, anon;
revoke insert, update, delete, truncate, references on public.retention_hold_amounts from authenticated, anon;
revoke insert, update, delete, truncate, references on public.retention_events from authenticated, anon;
revoke insert, update, delete, truncate, references on public.retention_event_amounts from authenticated, anon;
revoke insert, update, delete, truncate, references on public.ledger_entries from authenticated, anon;
revoke insert, update, delete, truncate, references on public.ledger_lines from authenticated, anon;
revoke insert, update, delete, truncate, references on public.ledger_accounts from authenticated, anon;
revoke all on public.financial_documents from anon;
revoke all on public.financial_document_versions from anon;
revoke all on public.financial_document_amounts from anon;
revoke all on public.retention_holds from anon;
revoke all on public.retention_hold_amounts from anon;
revoke all on public.retention_events from anon;
revoke all on public.retention_event_amounts from anon;
revoke all on public.ledger_entries from anon;
revoke all on public.ledger_lines from anon;
revoke update, delete, truncate on public.ledger_entries from service_role;
revoke update, delete, truncate on public.ledger_lines from service_role;

revoke all on function public.create_financial_document(uuid,text,text,numeric,numeric,numeric,text,date,uuid,uuid,uuid,numeric,jsonb) from public, anon;
revoke all on function public.revise_financial_document(uuid,numeric,text,numeric,numeric,numeric,jsonb) from public, anon;
revoke all on function public.issue_financial_document(uuid) from public, anon;
revoke all on function public.cancel_financial_document(uuid,text) from public, anon;
revoke all on function public.create_retention_hold(uuid,numeric,text,uuid,uuid,date,text,text) from public, anon;
revoke all on function public.release_retention(uuid,numeric,text,uuid) from public, anon;
revoke all on function public.forfeit_retention(uuid,text) from public, anon;
revoke all on function public.cancel_retention_hold(uuid,text) from public, anon;

grant execute on function public.create_financial_document(uuid,text,text,numeric,numeric,numeric,text,date,uuid,uuid,uuid,numeric,jsonb) to authenticated, service_role;
grant execute on function public.revise_financial_document(uuid,numeric,text,numeric,numeric,numeric,jsonb) to authenticated, service_role;
grant execute on function public.issue_financial_document(uuid) to authenticated, service_role;
grant execute on function public.cancel_financial_document(uuid,text) to authenticated, service_role;
grant execute on function public.create_retention_hold(uuid,numeric,text,uuid,uuid,date,text,text) to authenticated, service_role;
grant execute on function public.release_retention(uuid,numeric,text,uuid) to authenticated, service_role;
grant execute on function public.forfeit_retention(uuid,text) to authenticated, service_role;
grant execute on function public.cancel_retention_hold(uuid,text) to authenticated, service_role;

-- audit object types for the new objects
alter table public.permission_audit_log drop constraint permission_audit_object_type_ck;
alter table public.permission_audit_log add constraint permission_audit_object_type_ck
  check (object_type = any (array['membership','grant','project_party','contracts','contract_versions',
    'contract_version_amounts','contract_parties','contract_extensions','change_orders','change_order_amounts',
    'project_stages','stage_roles','stage_progress','site_visits','stage_observations','observation_actions',
    'observation_reinspections','stage_attachments','stage_completion_criteria','stage_criteria_results',
    'requests','request_messages','property_services','documents','document_versions','document_links',
    'document_audience','reports','report_versions','report_templates','report_assets',
    'report_template_imports','platform_admins','payment_milestones','disbursement_requests',
    'financial_executions','financial_documents','retention_holds','ledger_entries']));