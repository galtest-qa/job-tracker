-- ============================================
-- Job Tracker — Supabase Schema
-- Run this in the Supabase SQL Editor
-- ============================================

-- 1. Profiles
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  created_at timestamptz default now()
);

alter table profiles enable row level security;
create policy "Users read own profile" on profiles for select using (auth.uid() = id);
create policy "Users insert own profile" on profiles for insert with check (auth.uid() = id);
create policy "Users update own profile" on profiles for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. Kanban Columns
create table if not exists columns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  sort_order integer default 0,
  is_default boolean default false,
  created_at timestamptz default now()
);

alter table columns enable row level security;
create policy "Users read own columns" on columns for select using (auth.uid() = user_id);
create policy "Users insert own columns" on columns for insert with check (auth.uid() = user_id);
create policy "Users update own columns" on columns for update using (auth.uid() = user_id);
create policy "Users delete own columns" on columns for delete using (auth.uid() = user_id);

-- 3. Jobs
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  company text not null,
  role text not null,
  link text default '',
  description text default '',
  summary text default '',
  source text default 'LinkedIn',
  status text default 'Backlog',
  tags jsonb default '[]'::jsonb,
  match_score integer,
  notes text default '',
  interview_notes text default '',
  company_overview text default '',
  company_industry text default '',
  company_size text default '',
  requirements_met jsonb default '[]'::jsonb,
  requirements_partial jsonb default '[]'::jsonb,
  requirements_unmet jsonb default '[]'::jsonb,
  positioning_tips text default '',
  sort_order integer default 0,
  tailored_resume text default '',
  resume_improvements jsonb default '[]'::jsonb,
  interview_prep_ai jsonb default '{}'::jsonb,
  contact_name text default '',
  contact_role text default '',
  contact_linkedin text default '',
  contact_email text default '',
  logo_url text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table jobs enable row level security;
create policy "Users read own jobs" on jobs for select using (auth.uid() = user_id);
create policy "Users insert own jobs" on jobs for insert with check (auth.uid() = user_id);
create policy "Users update own jobs" on jobs for update using (auth.uid() = user_id);
create policy "Users delete own jobs" on jobs for delete using (auth.uid() = user_id);

-- 4. Reminders
create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  job_id uuid not null references jobs on delete cascade,
  type text default 'custom',
  title text not null,
  due_at timestamptz not null,
  completed boolean default false,
  note text default '',
  snoozed_until timestamptz,
  created_at timestamptz default now()
);

alter table reminders enable row level security;
create policy "Users read own reminders" on reminders for select using (auth.uid() = user_id);
create policy "Users insert own reminders" on reminders for insert with check (auth.uid() = user_id);
create policy "Users update own reminders" on reminders for update using (auth.uid() = user_id);
create policy "Users delete own reminders" on reminders for delete using (auth.uid() = user_id);

-- 5. Resumes
create table if not exists resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  raw_text text default '',
  parsed jsonb default '{}'::jsonb,
  filename text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table resumes enable row level security;
create policy "Users read own resumes" on resumes for select using (auth.uid() = user_id);
create policy "Users insert own resumes" on resumes for insert with check (auth.uid() = user_id);
create policy "Users update own resumes" on resumes for update using (auth.uid() = user_id);

-- 6. updated_at trigger
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger jobs_updated_at before update on jobs
  for each row execute function update_updated_at();
create trigger resumes_updated_at before update on resumes
  for each row execute function update_updated_at();

-- 7. Seed default columns function (called from app on first login)
-- Not auto-seeded — the app handles this per-user on first sign-in.
