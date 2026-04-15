begin;

-- 将 cases.id 从 text 迁移为 uuid，并保留原 text id 到 case_key
alter table public.cases add column if not exists case_key text;
update public.cases set case_key = id where case_key is null;

alter table public.cases add column if not exists id_uuid uuid;
update public.cases set id_uuid = gen_random_uuid() where id_uuid is null;

alter table public.user_cases add column if not exists case_id_uuid uuid;
update public.user_cases uc
set case_id_uuid = c.id_uuid
from public.cases c
where uc.case_id_uuid is null and uc.case_id = c.case_key;

alter table public.case_items add column if not exists case_id_uuid uuid;
update public.case_items ci
set case_id_uuid = c.id_uuid
from public.cases c
where ci.case_id_uuid is null and ci.case_id = c.case_key;

alter table public.user_cases drop constraint if exists user_cases_case_id_fkey;
alter table public.case_items drop constraint if exists case_items_case_id_fkey;

alter table public.case_items drop column if exists case_id;
alter table public.case_items rename column case_id_uuid to case_id;

alter table public.user_cases drop column if exists case_id;
alter table public.user_cases rename column case_id_uuid to case_id;

alter table public.cases drop constraint if exists cases_pkey;
alter table public.cases drop column if exists id;
alter table public.cases rename column id_uuid to id;
alter table public.cases alter column id set default gen_random_uuid();
alter table public.cases add primary key (id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cases_case_key_key') then
    alter table public.cases add constraint cases_case_key_key unique (case_key);
  end if;
end $$;

alter table public.user_cases
  add constraint user_cases_case_id_fkey
  foreign key (case_id) references public.cases(id) on delete cascade;

alter table public.case_items
  add constraint case_items_case_id_fkey
  foreign key (case_id) references public.cases(id) on delete cascade;

commit;

