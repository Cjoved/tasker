-- Web Push subscriptions + settings flag + night cron at 8PM PH

alter table public.user_settings
  add column if not exists web_push_reminders boolean not null default true;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_unique unique (endpoint)
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

drop trigger if exists set_push_subscriptions_updated_at on public.push_subscriptions;
create trigger set_push_subscriptions_updated_at
before update on public.push_subscriptions
for each row execute function public.set_updated_at();

alter table public.push_subscriptions enable row level security;

drop policy if exists "Users can read own push subscriptions" on public.push_subscriptions;
create policy "Users can read own push subscriptions"
on public.push_subscriptions for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own push subscriptions" on public.push_subscriptions;
create policy "Users can insert own push subscriptions"
on public.push_subscriptions for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own push subscriptions" on public.push_subscriptions;
create policy "Users can update own push subscriptions"
on public.push_subscriptions for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own push subscriptions" on public.push_subscriptions;
create policy "Users can delete own push subscriptions"
on public.push_subscriptions for delete to authenticated
using ((select auth.uid()) = user_id);

-- 8:00 PM Asia/Manila = 12:00 UTC (was 10 PM PH / 14:00 UTC)
select cron.unschedule(jobid)
from cron.job
where jobname = 'tasker-reminder-night';

select cron.schedule(
  'tasker-reminder-night',
  '0 12 * * *',
  $$select public.invoke_task_reminder('night');$$
);
