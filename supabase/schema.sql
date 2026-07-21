-- ─────────────────────────────────────────────────────────────
-- TripOS · Supabase schema
-- Run this ONCE in your Supabase project → SQL Editor → New query → Run.
-- Safe to re-run: every statement is idempotent.
-- ─────────────────────────────────────────────────────────────

-- ── profiles · one row per authenticated user ──
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  title        text,   -- passenger record: Mr. / Ms. (gender signal, skippable)
  full_name    text,   -- passenger record: powers "PASSENGER: MR. G. LEVY"
  home_currency text default 'USD',
  created_at   timestamptz default now()
);

-- ── trips · a user's plan for a destination (what the check-in wizard produces) ──
create table if not exists public.trips (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  destination   text not null default 'bali',
  vibe          text,            -- nomad | surf | wellness | party | mix
  vibe_detail   text,            -- branch answer: surf level / work load / wellness focus / party scene
  party         text,            -- solo | couple | family | crew
  duration_days int,             -- 0 = open-ended
  budget_tier   text,            -- back | comf | prem
  priorities    text[],          -- work | food | nightlife | nature | fitness | wellness
  arrive        date,
  depart        date,
  created_at    timestamptz default now()
);

-- ── places · saved + curated places ──
create table if not exists public.places (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  area          text,
  category      text,
  notes         text,
  tags          text[],
  curated       boolean default false,
  cost_estimate int,             -- typical spend, IDR thousands
  created_at    timestamptz default now()
);

-- ── expenses · spend log ──
create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  trip_id     uuid references public.trips(id) on delete set null,
  amount_idr  bigint not null,
  category    text,
  note        text,
  spent_at    timestamptz default now(),
  created_at  timestamptz default now()
);

-- ── checkins · GPS timeline ("I'm going 📍") ──
create table if not exists public.checkins (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  place_id    uuid references public.curated_places(id) on delete set null,  -- the app checks into curated spots
  place_name  text,
  lat         double precision,
  lng         double precision,
  amount_idr  bigint,
  created_at  timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- Row Level Security — every user can only ever touch their own rows
-- ─────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.trips    enable row level security;
alter table public.places   enable row level security;
alter table public.expenses enable row level security;
alter table public.checkins enable row level security;

-- profiles keyed on id (= auth.uid)
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- own-row policies for the rest (keyed on user_id)
drop policy if exists "trips_own"    on public.trips;
drop policy if exists "places_own"   on public.places;
drop policy if exists "expenses_own" on public.expenses;
drop policy if exists "checkins_own" on public.checkins;
create policy "trips_own"    on public.trips    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "places_own"   on public.places   for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "expenses_own" on public.expenses for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "checkins_own" on public.checkins for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- Auto-create a profile row the moment a user signs up
-- ─────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
