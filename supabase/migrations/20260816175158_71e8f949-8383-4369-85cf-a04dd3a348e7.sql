create extension if not exists pg_trgm with schema public;

-- 1) الأشكال النظامية / الصفة القانونية
create table if not exists public.legal_forms (
  code text primary key,
  name_ar text not null,
  name_en text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.legal_forms to authenticated;
grant all on public.legal_forms to service_role;
revoke insert, update, delete, truncate on public.legal_forms from anon, authenticated;
revoke select on public.legal_forms from anon;
alter table public.legal_forms enable row level security;
drop policy if exists legal_forms_read on public.legal_forms;
create policy legal_forms_read on public.legal_forms
  for select to authenticated using (active);

insert into public.legal_forms (code, name_ar, name_en, sort_order) values
  ('person','شخص / حساب شخصي','Individual account',10),
  ('sole_establishment','مؤسسة فردية','Sole establishment',20),
  ('general_partnership','شركة تضامن','General partnership',30),
  ('limited_partnership','شركة توصية بسيطة','Limited partnership',40),
  ('joint_stock','شركة مساهمة','Joint stock company',50),
  ('simplified_joint_stock','شركة مساهمة مبسطة','Simplified joint stock company',60),
  ('llc','شركة ذات مسؤولية محدودة','Limited liability company',70),
  ('single_member_llc','شركة ذات مسؤولية محدودة لشخص واحد','Single member LLC',80),
  ('professional','صفة مهنية','Professional entity',90),
  ('non_profit','صفة غير ربحية','Non-profit entity',100),
  ('branch_saudi','فرع شركة سعودية','Branch of a Saudi company',110),
  ('branch_foreign','فرع شركة أجنبية / منشأة مستثمر','Branch of a foreign company',120),
  ('association','جمعية / مؤسسة أهلية','Association / civil foundation',130),
  ('endowment','وقف','Endowment (Waqf)',140),
  ('government','جهة حكومية','Government entity',150)
on conflict (code) do nothing;

-- 2) تطبيع النص العربي للبحث
create or replace function private.ar_normalize(txt text)
returns text
language sql
immutable
as $$
  select pg_catalog.lower(
    pg_catalog.translate(
      pg_catalog.regexp_replace(coalesce(txt, ''::text), '[\u064B-\u0652\u0640]', '', 'g'),
      'أإآٱىئؤةـ',
      'اااايياه '
    )
  )
$$;

-- 3) قاموس الأنشطة الاقتصادية (مُصدَّر بإصدار)
create table if not exists public.economic_activities (
  version text not null,
  code text not null,
  parent_code text,
  level int not null check (level between 1 and 5),
  name_ar text not null,
  name_en text not null,
  keywords_ar text[] not null default '{}',
  keywords_en text[] not null default '{}',
  source text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (version, code)
);

create index if not exists economic_activities_parent_idx
  on public.economic_activities (version, parent_code);
create index if not exists economic_activities_search_idx
  on public.economic_activities
  using gin ((lower(name_ar || ' ' || name_en)) public.gin_trgm_ops);

grant select on public.economic_activities to authenticated;
grant all on public.economic_activities to service_role;
revoke insert, update, delete, truncate on public.economic_activities from anon, authenticated;
revoke select on public.economic_activities from anon;
alter table public.economic_activities enable row level security;
drop policy if exists economic_activities_read on public.economic_activities;
create policy economic_activities_read on public.economic_activities
  for select to authenticated using (active);

-- 4) أنشطة الكيان: نشاط أساسي + أنشطة ثانوية
create table if not exists public.entity_activities (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(id) on delete cascade,
  activity_version text not null,
  activity_code text not null,
  is_primary boolean not null default false,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_id, activity_code)
);
create unique index if not exists entity_activities_one_primary
  on public.entity_activities (entity_id) where is_primary;

grant select, insert, update, delete on public.entity_activities to authenticated;
grant all on public.entity_activities to service_role;
revoke select, insert, update, delete, truncate on public.entity_activities from anon;
alter table public.entity_activities enable row level security;

drop policy if exists entity_activities_read on public.entity_activities;
create policy entity_activities_read on public.entity_activities
  for select to authenticated
  using (private.can(auth.uid(), 'members'::public.app_module, 'view'::public.app_action, entity_activities.entity_id, null));

drop policy if exists entity_activities_write on public.entity_activities;
create policy entity_activities_write on public.entity_activities
  for all to authenticated
  using (private.can(auth.uid(), 'members'::public.app_module, 'manage_members'::public.app_action, entity_activities.entity_id, null))
  with check (private.can(auth.uid(), 'members'::public.app_module, 'manage_members'::public.app_action, entity_activities.entity_id, null));

-- الشكل النظامي في ملف الكيان
alter table public.entity_profiles
  add column if not exists legal_form_code text references public.legal_forms(code);

-- 5) تدقيق تعديل التصنيف
create or replace function private.audit_entity_activity_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.permission_audit_log (actor_user_id, target_entity_id, action, object_type, object_id, old_value, new_value)
  values (
    auth.uid(),
    coalesce(new.entity_id, old.entity_id),
    tg_op,
    'entity_activities',
    coalesce(new.id, old.id),
    to_jsonb(old),
    to_jsonb(new)
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_audit_entity_activity on public.entity_activities;
create trigger trg_audit_entity_activity
  after insert or update or delete on public.entity_activities
  for each row execute function private.audit_entity_activity_change();

-- 6) بحث الأنشطة بالمرادفات والمسار
create or replace function public.search_economic_activities(
  _q text,
  _version text default 'NCEA-2023-ISIC4',
  _limit int default 25
)
returns table (
  code text,
  parent_code text,
  level int,
  name_ar text,
  name_en text,
  path_ar text,
  score real
)
language sql
stable
security definer
set search_path = ''
as $$
  with q as (select private.ar_normalize(coalesce(_q,'')) as term),
  base as (
    select a.*,
      private.ar_normalize(a.name_ar || ' ' || a.name_en || ' ' ||
        array_to_string(a.keywords_ar,' ') || ' ' || array_to_string(a.keywords_en,' ')) as hay
    from public.economic_activities a, q
    where a.version = _version and a.active
  )
  select b.code, b.parent_code, b.level, b.name_ar, b.name_en,
    coalesce(
      (select string_agg(p.name_ar, ' › ' order by p.level)
       from public.economic_activities p
       where p.version = b.version and p.active and p.level < b.level
         and (b.code like p.code || '%' or p.code = b.parent_code)),
      b.name_ar
    ) as path_ar,
    greatest(
      case when b.hay like '%' || (select term from q) || '%' then 1.0 else 0 end,
      public.similarity(b.hay, (select term from q))
    )::real as score
  from base b
  where (select term from q) = ''
     or b.hay like '%' || (select term from q) || '%'
     or public.similarity(b.hay, (select term from q)) > 0.25
  order by score desc, b.level, b.code
  limit least(coalesce(_limit,25), 100)
$$;

revoke execute on function public.search_economic_activities(text, text, int) from public, anon;
grant execute on function public.search_economic_activities(text, text, int) to authenticated;
revoke execute on function private.ar_normalize(text) from public, anon;
grant execute on function private.ar_normalize(text) to authenticated;

-- 7) بذور القاموس: الأقسام العليا (ISIC4) والشُعب ذات الصلة
insert into public.economic_activities (version, code, parent_code, level, name_ar, name_en, keywords_ar, keywords_en, source) values
('NCEA-2023-ISIC4','A',null,1,'الزراعة والحراجة وصيد الأسماك','Agriculture, forestry and fishing','{"زراعة","مزارع","نخيل","دواجن","ماشية","صيد","حراجة","مشاتل"}','{"agriculture","farming","poultry","livestock","fishing"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','B',null,1,'التعدين واستغلال المحاجر','Mining and quarrying','{"تعدين","محاجر","نفط","غاز","معادن","كسارات"}','{"mining","quarrying","oil","gas","minerals"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','C',null,1,'الصناعة التحويلية','Manufacturing','{"صناعة","مصنع","تصنيع","إنتاج","خرسانة جاهزة","حدادة"}','{"manufacturing","factory","production"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','D',null,1,'إمدادات الكهرباء والغاز والبخار وتكييف الهواء','Electricity, gas, steam and air conditioning supply','{"كهرباء","طاقة","غاز","طاقة شمسية","تكييف"}','{"electricity","energy","gas","solar"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','E',null,1,'إمدادات المياه وأنشطة الصرف الصحي وإدارة النفايات','Water supply; sewerage, waste management','{"مياه","صرف صحي","نفايات","تدوير","معالجة","نظافة"}','{"water","sewerage","waste","recycling"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','F',null,1,'التشييد','Construction','{"مقاولات","مقاول","بناء","تشييد","إنشاءات","طرق","بنية تحتية","تشطيبات","صيانة","ترميم"}','{"construction","contracting","contractor","building","infrastructure","finishing"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','G',null,1,'تجارة الجملة والتجزئة وإصلاح المركبات','Wholesale and retail trade; repair of motor vehicles','{"تجارة","جملة","تجزئة","بيع","مواد بناء","إصلاح مركبات","معارض"}','{"trade","wholesale","retail","vehicle repair"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','H',null,1,'النقل والتخزين','Transportation and storage','{"نقل","ناقل","شحن","لوجستيات","توصيل","مستودعات","تخزين","بري","بحري","جوي"}','{"transport","logistics","freight","delivery","warehousing","storage"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','I',null,1,'أنشطة خدمات الإقامة والطعام','Accommodation and food service activities','{"فنادق","إقامة","ضيافة","مطاعم","تموين","سياحة"}','{"hotels","accommodation","restaurants","catering","hospitality"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','J',null,1,'المعلومات والاتصالات','Information and communication','{"تقنية","برمجيات","اتصالات","ذكاء اصطناعي","أمن سيبراني","استضافة","تطبيقات","بيانات"}','{"technology","software","telecom","artificial intelligence","cybersecurity","IT"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','K',null,1,'الأنشطة المالية وأنشطة التأمين','Financial and insurance activities','{"مالية","تمويل","بنوك","تأمين","استثمار","محافظ"}','{"finance","banking","insurance","investment"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','L',null,1,'الأنشطة العقارية','Real estate activities','{"عقار","عقاري","تطوير عقاري","مطور","وساطة","تسويق عقاري","إدارة أملاك","تأجير","مزادات"}','{"real estate","developer","brokerage","property management","leasing"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','M',null,1,'الأنشطة المهنية والعلمية والتقنية','Professional, scientific and technical activities','{"مكتب هندسي","هندسة","معماري","تصميم","مساحة","إدارة مشاريع","استشارات","تقييم عقاري","محاماة","محاسبة","تدقيق"}','{"engineering","architecture","surveying","project management","consulting","valuation","legal","accounting"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','N',null,1,'أنشطة الخدمات الإدارية وخدمات الدعم','Administrative and support service activities','{"خدمات إدارية","تشغيل","أمن","حراسات","نظافة","توظيف","تأجير معدات","سفر"}','{"administrative","facility management","security","cleaning","staffing","equipment rental"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','O',null,1,'الإدارة العامة والدفاع؛ الضمان الاجتماعي الإلزامي','Public administration and defence; compulsory social security','{"حكومي","إدارة عامة","دفاع","ضمان اجتماعي","بلدية","أمانة"}','{"government","public administration","defence"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','P',null,1,'التعليم','Education','{"تعليم","مدارس","تدريب","جامعات","معاهد"}','{"education","schools","training","universities"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','Q',null,1,'الأنشطة في مجال صحة الإنسان والعمل الاجتماعي','Human health and social work activities','{"صحة","مستشفى","عيادات","رعاية","مختبرات","صيدليات","عمل اجتماعي"}','{"health","hospital","clinics","care","laboratories"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','R',null,1,'الفنون والترفيه والتسلية','Arts, entertainment and recreation','{"فنون","ترفيه","فعاليات","رياضة","إنتاج فني","تصوير"}','{"arts","entertainment","events","sports","recreation"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','S',null,1,'أنشطة الخدمات الأخرى','Other service activities','{"خدمات أخرى","جمعيات","إصلاح","خدمات شخصية"}','{"other services","repair","personal services"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','T',null,1,'أنشطة الأسر المعيشية بصفتها صاحبة عمل','Activities of households as employers','{"أسر معيشية","عمالة منزلية"}','{"households","domestic personnel"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','U',null,1,'أنشطة المنظمات والهيئات غير الخاضعة للولاية القضائية الوطنية','Activities of extraterritorial organizations and bodies','{"منظمات دولية","هيئات","سفارات"}','{"international organizations","embassies"}','GASTAT NCEA (ISIC4)')
on conflict (version, code) do nothing;

insert into public.economic_activities (version, code, parent_code, level, name_ar, name_en, keywords_ar, keywords_en, source) values
('NCEA-2023-ISIC4','41','F',2,'تشييد المباني','Construction of buildings','{"مقاولات مباني","مقاول عام","بناء","فلل","عمائر","أبراج"}','{"building construction","general contracting"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','42','F',2,'الهندسة المدنية','Civil engineering','{"طرق","جسور","سدود","بنية تحتية","شبكات","سفلتة"}','{"civil engineering","roads","bridges","infrastructure"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','43','F',2,'أنشطة التشييد المتخصصة','Specialized construction activities','{"كهرباء","ميكانيكا","سباكة","تكييف","تشطيبات","دهانات","عزل","هدم","حفر","صيانة"}','{"electrical","mechanical","plumbing","HVAC","finishing","demolition","maintenance"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','4100','41',3,'تشييد المباني السكنية وغير السكنية','Construction of residential and non-residential buildings','{"مباني سكنية","مباني تجارية","مقاولات عامة"}','{"residential buildings","non-residential buildings"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','4210','42',3,'تشييد الطرق والسكك الحديدية','Construction of roads and railways','{"طرق","سفلتة","سكك حديدية","أرصفة"}','{"roads","railways","paving"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','4220','42',3,'تشييد مشاريع المرافق','Construction of utility projects','{"شبكات مياه","صرف","كهرباء","اتصالات","مرافق"}','{"utility networks","water","sewer","power lines"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','4321','43',3,'التركيبات الكهربائية','Electrical installation','{"كهرباء","تمديدات كهربائية","لوحات"}','{"electrical installation","wiring"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','4322','43',3,'تركيبات السباكة والتدفئة والتكييف','Plumbing, heat and air-conditioning installation','{"سباكة","تكييف","ميكانيكا","تبريد"}','{"plumbing","HVAC","mechanical"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','4330','43',3,'إتمام وإنهاء المباني','Building completion and finishing','{"تشطيبات","دهانات","أرضيات","ديكور","جبس"}','{"finishing","painting","flooring","decoration"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','68','L',2,'الأنشطة العقارية','Real estate activities','{"عقار","تطوير","تأجير","إدارة أملاك"}','{"real estate","development","leasing"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','6810','68',3,'الأنشطة العقارية بالممتلكات المملوكة أو المؤجرة','Real estate activities with own or leased property','{"تطوير عقاري","مطور عقاري","بيع عقار","تأجير عقار"}','{"real estate development","property developer","leasing"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','6820','68',3,'الأنشطة العقارية على أساس رسم أو عقد','Real estate activities on a fee or contract basis','{"وساطة عقارية","تسويق عقاري","إدارة أملاك","مزادات عقارية","تقييم"}','{"brokerage","real estate marketing","property management","auctions"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','71','M',2,'الأنشطة المعمارية والهندسية؛ الاختبارات والتحليل','Architectural and engineering activities; technical testing','{"مكتب هندسي","معماري","هندسة","مساحة","إشراف","فحص","اختبارات"}','{"architecture","engineering office","surveying","supervision","testing"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','7110','71',3,'الأنشطة المعمارية والهندسية والاستشارات الفنية','Architectural and engineering activities and related technical consultancy','{"مكتب هندسي","تصميم معماري","إدارة مشاريع","استشارات هندسية","مساحة"}','{"architectural design","engineering consultancy","project management","surveying"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','7120','71',3,'الاختبارات والتحاليل التقنية','Technical testing and analysis','{"فحص","اختبار مواد","جودة","تفتيش"}','{"testing","inspection","quality"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','69','M',2,'الأنشطة القانونية والمحاسبية','Legal and accounting activities','{"محاماة","قانوني","محاسبة","مراجعة","تدقيق","زكاة وضريبة"}','{"legal","law firm","accounting","audit","tax"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','70','M',2,'أنشطة المكاتب الرئيسية والاستشارات الإدارية','Activities of head offices; management consultancy','{"استشارات إدارية","حوكمة","تطوير أعمال"}','{"management consultancy","governance"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','73','M',2,'الدعاية والإعلان وبحوث السوق','Advertising and market research','{"تسويق","دعاية","إعلان","حملات","بحوث سوق"}','{"advertising","marketing","market research"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','74','M',2,'الأنشطة المهنية والعلمية والتقنية الأخرى','Other professional, scientific and technical activities','{"تصوير","ترجمة","تصميم","تقييم"}','{"photography","translation","design","valuation"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','62','J',2,'أنشطة البرمجة الحاسوبية والاستشارات','Computer programming, consultancy and related activities','{"برمجة","تطوير برمجيات","تطبيقات","ذكاء اصطناعي","أمن سيبراني","استشارات تقنية"}','{"software development","programming","artificial intelligence","cybersecurity","IT consulting"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','63','J',2,'أنشطة خدمات المعلومات','Information service activities','{"استضافة","بيانات","معالجة بيانات","بوابات"}','{"hosting","data processing","web portals"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','61','J',2,'الاتصالات السلكية واللاسلكية','Telecommunications','{"اتصالات","شبكات","ألياف","اتصال لاسلكي"}','{"telecommunications","networks","fiber"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','49','H',2,'النقل البري والنقل عبر الأنابيب','Land transport and transport via pipelines','{"نقل بري","ناقل","شاحنات","نقل ركاب","أنابيب"}','{"land transport","trucking","passenger transport"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','50','H',2,'النقل المائي','Water transport','{"نقل بحري","سفن","موانئ"}','{"water transport","shipping","ports"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','51','H',2,'النقل الجوي','Air transport','{"نقل جوي","طيران","شحن جوي"}','{"air transport","aviation","air freight"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','52','H',2,'التخزين وأنشطة الدعم للنقل','Warehousing and support activities for transportation','{"تخزين","مستودعات","لوجستيات","مناولة","تخليص"}','{"warehousing","logistics","freight forwarding"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','53','H',2,'أنشطة البريد وخدمات التوصيل','Postal and courier activities','{"توصيل","بريد","شحن سريع","مندوب"}','{"courier","delivery","postal"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','64','K',2,'أنشطة الخدمات المالية','Financial service activities','{"تمويل","بنوك","استثمار","تمويل عقاري"}','{"financial services","banking","investment"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','65','K',2,'التأمين وإعادة التأمين وصناديق التقاعد','Insurance, reinsurance and pension funding','{"تأمين","إعادة تأمين","تقاعد","تأمين مشاريع"}','{"insurance","reinsurance","pension"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','80','N',2,'أنشطة الأمن والتحقيقات','Security and investigation activities','{"أمن","حراسات","سلامة","مراقبة"}','{"security","guarding","safety"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','81','N',2,'أنشطة خدمات المباني وتنسيق المواقع','Services to buildings and landscape activities','{"تشغيل وصيانة","نظافة","تنسيق حدائق","إدارة مرافق"}','{"facility management","cleaning","landscaping"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','77','N',2,'أنشطة التأجير والاستئجار','Rental and leasing activities','{"تأجير معدات","تأجير سيارات","تأجير آليات"}','{"equipment rental","car rental","machinery leasing"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','23','C',2,'صنع منتجات المعادن اللافلزية الأخرى','Manufacture of other non-metallic mineral products','{"خرسانة جاهزة","بلوك","أسمنت","زجاج","سيراميك"}','{"ready mix concrete","cement","glass","ceramics"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','25','C',2,'صنع منتجات المعادن المشكلة','Manufacture of fabricated metal products','{"حدادة","هياكل معدنية","ألمنيوم","تصنيع معادن"}','{"metal structures","aluminium","fabrication"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','46','G',2,'تجارة الجملة','Wholesale trade','{"جملة","توريد","مواد بناء","معدات"}','{"wholesale","supply","building materials"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','47','G',2,'تجارة التجزئة','Retail trade','{"تجزئة","متاجر","بيع مفرق","متجر إلكتروني"}','{"retail","stores","e-commerce"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','55','I',2,'أنشطة الإقامة','Accommodation','{"فنادق","شقق مفروشة","منتجعات","ضيافة"}','{"hotels","furnished apartments","resorts"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','56','I',2,'أنشطة خدمات الأطعمة والمشروبات','Food and beverage service activities','{"مطاعم","مقاهي","تموين","كاترينج"}','{"restaurants","cafes","catering"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','35','D',2,'إمدادات الكهرباء والغاز والبخار','Electricity, gas, steam and air conditioning supply','{"كهرباء","طاقة متجددة","طاقة شمسية","محطات"}','{"electricity","renewable energy","solar power"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','36','E',2,'تجميع المياه ومعالجتها وتوصيلها','Water collection, treatment and supply','{"مياه","تحلية","معالجة مياه","شبكات مياه"}','{"water treatment","desalination","water supply"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','38','E',2,'جمع النفايات ومعالجتها وتصريفها','Waste collection, treatment and disposal','{"نفايات","تدوير","مخلفات بناء","نقل نفايات"}','{"waste","recycling","construction debris"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','01','A',2,'الزراعة وإنتاج المحاصيل والحيوانات','Crop and animal production','{"زراعة","مزارع","نخيل","دواجن","ماشية"}','{"crops","farming","poultry","livestock"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','08','B',2,'التعدين واستغلال المحاجر الأخرى','Other mining and quarrying','{"محاجر","رمل","بحص","كسارات"}','{"quarrying","sand","gravel"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','85','P',2,'التعليم','Education','{"تعليم","تدريب","مدارس","معاهد"}','{"education","training","schools"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','86','Q',2,'أنشطة صحة الإنسان','Human health activities','{"مستشفيات","عيادات","رعاية صحية","مختبرات"}','{"hospitals","clinics","healthcare"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','79','N',2,'وكالات السفر ومنظمو الرحلات','Travel agency and tour operator activities','{"سياحة","سفر","رحلات","حج وعمرة"}','{"travel","tourism","tour operators"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','93','R',2,'الأنشطة الرياضية والترفيهية','Sports and recreation activities','{"رياضة","ترفيه","فعاليات","أندية"}','{"sports","recreation","events"}','GASTAT NCEA (ISIC4)'),
('NCEA-2023-ISIC4','94','S',2,'أنشطة المنظمات ذات العضوية','Activities of membership organizations','{"جمعيات","منظمات","نقابات","أوقاف"}','{"associations","organizations","unions"}','GASTAT NCEA (ISIC4)')
on conflict (version, code) do nothing;

create trigger set_legal_forms_updated_at before update on public.legal_forms
  for each row execute function public.set_updated_at();
create trigger set_economic_activities_updated_at before update on public.economic_activities
  for each row execute function public.set_updated_at();
create trigger set_entity_activities_updated_at before update on public.entity_activities
  for each row execute function public.set_updated_at();