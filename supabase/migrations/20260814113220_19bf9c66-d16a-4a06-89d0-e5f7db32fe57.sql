-- ============ project_templates ============
create table public.project_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name_ar text not null,
  name_en text not null,
  description_ar text,
  description_en text,
  is_active boolean not null default true,
  requires_license boolean not null default false,
  feature_flag text,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index idx_project_templates_code on public.project_templates (code) where deleted_at is null;

grant select on public.project_templates to authenticated;
grant all on public.project_templates to service_role;
alter table public.project_templates enable row level security;
create policy project_templates_select_authenticated on public.project_templates
  for select to authenticated using (deleted_at is null and is_active = true);

create trigger project_templates_set_updated_at before update on public.project_templates
  for each row execute function public.set_updated_at();

-- ============ stage_templates ============
create table public.stage_templates (
  id uuid primary key default gen_random_uuid(),
  project_template_id uuid not null references public.project_templates(id) on delete cascade,
  code text not null,
  order_index int not null,
  name_ar text not null,
  name_en text not null,
  description_ar text,
  kind text not null default 'core',
  is_required boolean not null default false,
  default_duration_days int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint stage_templates_kind_check check (kind in ('core','optional'))
);
create unique index idx_stage_templates_tpl_code on public.stage_templates (project_template_id, code) where deleted_at is null;
create index idx_stage_templates_project_template_id on public.stage_templates (project_template_id);

grant select on public.stage_templates to authenticated;
grant all on public.stage_templates to service_role;
alter table public.stage_templates enable row level security;
create policy stage_templates_select_authenticated on public.stage_templates
  for select to authenticated using (deleted_at is null);

create trigger stage_templates_set_updated_at before update on public.stage_templates
  for each row execute function public.set_updated_at();

-- ============ projects ============
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  entity_id uuid references public.entities(id) on delete restrict,
  project_template_id uuid not null references public.project_templates(id) on delete restrict,
  name text not null,
  code text,
  status text not null default 'draft',
  city text,
  district text,
  land_area numeric,
  start_date date,
  expected_end_date date,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint projects_status_check check (status in ('draft','active','on_hold','completed','cancelled'))
);
create index idx_projects_owner_id on public.projects (owner_id);
create index idx_projects_entity_id on public.projects (entity_id);
create index idx_projects_template_id on public.projects (project_template_id);

grant select, insert, update on public.projects to authenticated;
grant all on public.projects to service_role;
alter table public.projects enable row level security;

create policy projects_select_scope on public.projects
  for select to authenticated
  using (
    deleted_at is null
    and (
      owner_id = (select auth.uid())
      or (entity_id is not null and private.is_entity_member((select auth.uid()), entity_id))
    )
  );

create policy projects_insert_scope on public.projects
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and created_by = (select auth.uid())
    and (entity_id is null or private.is_entity_member((select auth.uid()), entity_id))
  );

create policy projects_update_scope on public.projects
  for update to authenticated
  using (
    deleted_at is null
    and (
      owner_id = (select auth.uid())
      or (entity_id is not null and (
        private.has_role((select auth.uid()), entity_id, 'owner'::app_role)
        or private.has_role((select auth.uid()), entity_id, 'admin'::app_role)
        or private.has_role((select auth.uid()), entity_id, 'manager'::app_role)
      ))
    )
  )
  with check (
    owner_id = (select auth.uid())
    or (entity_id is not null and (
      private.has_role((select auth.uid()), entity_id, 'owner'::app_role)
      or private.has_role((select auth.uid()), entity_id, 'admin'::app_role)
      or private.has_role((select auth.uid()), entity_id, 'manager'::app_role)
    ))
  );

create trigger projects_set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

-- ============ access helper ============
create or replace function private.can_access_project(_user_id uuid, _project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.projects p
    where p.id = _project_id
      and p.deleted_at is null
      and (
        p.owner_id = _user_id
        or (p.entity_id is not null and private.is_entity_member(_user_id, p.entity_id))
      )
  );
$$;
revoke all on function private.can_access_project(uuid, uuid) from public;
grant execute on function private.can_access_project(uuid, uuid) to authenticated, service_role;

-- ============ project_stages ============
create table public.project_stages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stage_template_id uuid references public.stage_templates(id) on delete set null,
  source text not null default 'core',
  order_index int not null,
  name_ar text not null,
  name_en text not null,
  status text not null default 'pending',
  is_required boolean not null default false,
  planned_start date,
  planned_end date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint project_stages_source_check check (source in ('core','library','custom')),
  constraint project_stages_status_check check (status in ('pending','in_progress','done','skipped'))
);
create index idx_project_stages_project_id on public.project_stages (project_id);

grant select, insert, update on public.project_stages to authenticated;
grant all on public.project_stages to service_role;
alter table public.project_stages enable row level security;

create policy project_stages_select_scope on public.project_stages
  for select to authenticated
  using (deleted_at is null and private.can_access_project((select auth.uid()), project_id));
create policy project_stages_insert_scope on public.project_stages
  for insert to authenticated
  with check (private.can_access_project((select auth.uid()), project_id));
create policy project_stages_update_scope on public.project_stages
  for update to authenticated
  using (private.can_access_project((select auth.uid()), project_id))
  with check (private.can_access_project((select auth.uid()), project_id));

create trigger project_stages_set_updated_at before update on public.project_stages
  for each row execute function public.set_updated_at();

-- ============ stage_dependencies ============
create table public.stage_dependencies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  predecessor_stage_id uuid not null references public.project_stages(id) on delete cascade,
  successor_stage_id uuid not null references public.project_stages(id) on delete cascade,
  type text not null default 'finish_to_start',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint stage_dependencies_type_check check (type in ('finish_to_start','start_to_start','finish_to_finish')),
  constraint stage_dependencies_no_self check (predecessor_stage_id <> successor_stage_id)
);
create unique index idx_stage_dependencies_pair on public.stage_dependencies (predecessor_stage_id, successor_stage_id) where deleted_at is null;
create index idx_stage_dependencies_project_id on public.stage_dependencies (project_id);

grant select, insert, update on public.stage_dependencies to authenticated;
grant all on public.stage_dependencies to service_role;
alter table public.stage_dependencies enable row level security;

create policy stage_dependencies_select_scope on public.stage_dependencies
  for select to authenticated
  using (deleted_at is null and private.can_access_project((select auth.uid()), project_id));
create policy stage_dependencies_insert_scope on public.stage_dependencies
  for insert to authenticated
  with check (private.can_access_project((select auth.uid()), project_id));
create policy stage_dependencies_update_scope on public.stage_dependencies
  for update to authenticated
  using (private.can_access_project((select auth.uid()), project_id))
  with check (private.can_access_project((select auth.uid()), project_id));

create trigger stage_dependencies_set_updated_at before update on public.stage_dependencies
  for each row execute function public.set_updated_at();

-- ============ Seed: project templates ============
insert into public.project_templates (code, name_ar, name_en, description_ar, description_en, is_active, requires_license, feature_flag) values
  ('villa','فيلا','Villa','مشروع بناء فيلا سكنية خاصة من الدراسة حتى التسليم.','Private villa construction project.',true,false,null),
  ('residential_building','عمارة سكنية','Residential Building','عمارة سكنية متعددة الوحدات مع أنظمة MEP والسلامة والفرز.','Multi-unit residential building.',true,false,null),
  ('compound','مجمع','Compound','مجمع سكني متعدد الوحدات مع بنية تحتية ومرافق مشتركة.','Residential compound with shared facilities.',true,false,null),
  ('commercial','مشروع تجاري','Commercial Project','مشروع تجاري بمساحات مؤجّرة واشتراطات تشغيلية.','Commercial project with leasable areas.',true,false,null),
  ('land_development','تطوير أرض','Land Development','تطوير وإفراز أرض خام مع الاعتمادات والبنية التحتية.','Raw land development and subdivision.',true,false,null),
  ('offplan_sales','بيع على الخارطة','Off-plan Sales','بيع وحدات على الخارطة — يتطلب ترخيصًا نظاميًا وبوابة تفعيل منفصلة.','Off-plan unit sales — requires licensing.',false,true,'offplan_sales');

-- ============ Seed: stage templates ============
insert into public.stage_templates (project_template_id, code, order_index, name_ar, name_en, kind, is_required, default_duration_days)
select t.id, s.code, s.order_index, s.name_ar, s.name_en, s.kind, s.is_required, s.duration
from public.project_templates t
join (values
  -- villa
  ('villa','feasibility',1,'دراسة الجدوى والمتطلبات','Feasibility & Requirements','core',true,14),
  ('villa','architectural_design',2,'التصميم المعماري','Architectural Design','core',true,30),
  ('villa','structural_design',3,'التصميم الإنشائي','Structural Design','core',true,21),
  ('villa','municipal_permits',4,'التراخيص البلدية','Municipal Permits','core',true,30),
  ('villa','contracting',5,'التعاقد والتنفيذ','Contracting','core',true,21),
  ('villa','structural_works',6,'الأعمال الإنشائية','Structural Works','core',true,120),
  ('villa','finishing',7,'التشطيبات','Finishing Works','core',true,90),
  ('villa','handover',8,'التسليم والضمان','Handover & Warranty','core',true,14),
  ('villa','interior_design',9,'التصميم الداخلي','Interior Design','optional',false,30),
  ('villa','landscaping',10,'تنسيق الموقع','Landscaping','optional',false,21),
  -- residential_building
  ('residential_building','market_study',1,'دراسة السوق والتأجير','Market & Leasing Study','core',true,21),
  ('residential_building','feasibility',2,'دراسة الجدوى والمتطلبات','Feasibility & Requirements','core',true,14),
  ('residential_building','architectural_design',3,'التصميم المعماري','Architectural Design','core',true,45),
  ('residential_building','structural_design',4,'التصميم الإنشائي','Structural Design','core',true,30),
  ('residential_building','mep_design',5,'أنظمة MEP','MEP Systems','core',true,30),
  ('residential_building','civil_defense',6,'السلامة والدفاع المدني','Safety & Civil Defense','core',true,30),
  ('residential_building','municipal_permits',7,'التراخيص البلدية','Municipal Permits','core',true,45),
  ('residential_building','contracting',8,'التعاقد والتنفيذ','Contracting','core',true,30),
  ('residential_building','structural_works',9,'الأعمال الإنشائية','Structural Works','core',true,240),
  ('residential_building','finishing',10,'التشطيبات','Finishing Works','core',true,120),
  ('residential_building','subdivision_deeds',11,'الفرز والصكوك','Subdivision & Deeds','core',true,60),
  ('residential_building','handover',12,'التسليم والضمان','Handover & Warranty','core',true,21),
  ('residential_building','property_management',13,'إدارة الأملاك','Property Management','optional',false,30),
  -- compound
  ('compound','feasibility',1,'دراسة الجدوى والمتطلبات','Feasibility & Requirements','core',true,30),
  ('compound','master_planning',2,'التخطيط العام والكتلي','Master & Massing Planning','core',true,45),
  ('compound','repeated_designs',3,'التصاميم المكرّرة','Repeated Unit Designs','core',true,45),
  ('compound','infrastructure',4,'البنية التحتية','Infrastructure Works','core',true,120),
  ('compound','municipal_permits',5,'التراخيص البلدية','Municipal Permits','core',true,60),
  ('compound','contracting',6,'التعاقد والتنفيذ','Contracting','core',true,30),
  ('compound','construction',7,'أعمال التنفيذ','Construction Works','core',true,360),
  ('compound','shared_facilities',8,'إدارة المرافق المشتركة','Shared Facilities Management','optional',false,45),
  ('compound','handover',9,'التسليم والضمان','Handover & Warranty','core',true,30),
  -- commercial
  ('commercial','commercial_feasibility',1,'دراسة الجدوى التجارية','Commercial Feasibility','core',true,30),
  ('commercial','facade_space_design',2,'تصميم الواجهات والمساحات المؤجّرة','Facade & Leasable Space Design','core',true,45),
  ('commercial','structural_design',3,'التصميم الإنشائي','Structural Design','core',true,30),
  ('commercial','operational_requirements',4,'الاشتراطات التشغيلية','Operational Requirements','core',true,21),
  ('commercial','municipal_permits',5,'التراخيص البلدية','Municipal Permits','core',true,45),
  ('commercial','contracting',6,'التعاقد والتنفيذ','Contracting','core',true,30),
  ('commercial','construction',7,'أعمال التنفيذ','Construction Works','core',true,270),
  ('commercial','tenant_fitout',8,'تجهيز المستأجرين','Tenant Fit-out','optional',false,60),
  ('commercial','handover',9,'التسليم والضمان','Handover & Warranty','core',true,21),
  -- land_development
  ('land_development','deed_verification',1,'التحقق من الصك والاستخدام','Deed & Land-use Verification','core',true,14),
  ('land_development','preliminary_plan',2,'المخطط الأولي','Preliminary Plan','core',true,30),
  ('land_development','municipal_approvals',3,'الاعتمادات البلدية','Municipal Approvals','core',true,60),
  ('land_development','infrastructure_services',4,'خدمات البنية التحتية','Infrastructure Services','core',true,120),
  ('land_development','subdivision',5,'الإفراز','Subdivision','core',true,45),
  ('land_development','marketing',6,'التسويق','Marketing','optional',false,30),
  -- offplan_sales
  ('offplan_sales','license_eligibility',1,'التحقق من أهلية الترخيص','License Eligibility','core',true,30),
  ('offplan_sales','escrow_account',2,'حساب الضمان','Escrow Account','core',true,21),
  ('offplan_sales','sales_documentation',3,'وثائق البيع','Sales Documentation','core',true,21),
  ('offplan_sales','unit_sales',4,'بيع الوحدات','Unit Sales','core',true,180),
  ('offplan_sales','delivery_transfer',5,'التسليم ونقل الملكية','Delivery & Title Transfer','core',true,60)
) as s(template_code, code, order_index, name_ar, name_en, kind, is_required, duration)
  on s.template_code = t.code;