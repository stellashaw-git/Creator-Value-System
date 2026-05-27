-- WorthyIQ evaluations — lightweight creator memory per user.
-- Run in Supabase SQL editor or via CLI.

create table if not exists public.evaluations (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  creator_handle text,
  display_name text,
  platform text,
  niche text,

  decision text,
  commercial_score integer,
  purchase_intent_score integer,
  engagement_score integer,
  growth_score integer,

  confidence_level text,
  evidence_summary text,

  followers bigint,
  avg_likes numeric,
  avg_comments numeric,
  avg_reposts numeric,
  avg_shares numeric,
  avg_saves numeric,
  engagement_rate numeric,

  report_json jsonb not null,
  workflow_status text,
  campaign_outcome text,

  saved boolean not null default false,
  shortlisted boolean not null default false,
  contacted boolean not null default false,
  campaign_launched boolean not null default false,

  screenshot_count integer
);

create index if not exists evaluations_user_id_created_at_idx
  on public.evaluations (user_id, created_at desc);

alter table public.evaluations enable row level security;

create policy "Users read own evaluations"
  on public.evaluations for select
  using (auth.uid() = user_id);

create policy "Users insert own evaluations"
  on public.evaluations for insert
  with check (auth.uid() = user_id);

create policy "Users update own evaluations"
  on public.evaluations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own evaluations"
  on public.evaluations for delete
  using (auth.uid() = user_id);
