insert into public.platform_admins(user_id)
select '85a310e7-8812-4a9d-8729-05e1947258c3'::uuid
where not exists (select 1 from public.platform_admins where user_id = '85a310e7-8812-4a9d-8729-05e1947258c3');