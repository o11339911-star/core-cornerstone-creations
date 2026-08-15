insert into public.entity_licenses (entity_id, license_number, authority, discipline, issued_on, expires_on, status, verified_at, created_by)
select '6f7a628a-5c02-4676-b527-b53a20329db6', 'TEST-28-LIC-001', 'TEST-28 جهة اختبار', 'general', current_date - 30, current_date + 365, 'active', now(), u.id
from auth.users u where u.email='p28-owner-a@example.com'
on conflict do nothing;