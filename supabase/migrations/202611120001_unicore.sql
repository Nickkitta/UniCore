-- UniCore: first campus, authenticated users only
-- Apply once in Supabase SQL Editor, as one transaction
begin;

create table public.unicore_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Студент' check (char_length(trim(name)) between 1 and 40),
  faculty text not null default '' check (char_length(faculty) <= 80),
  course text not null default '' check (course in ('','1','2','3','4','5','6')),
  group_name text not null default '' check (char_length(group_name) <= 20),
  bio text not null default '' check (char_length(bio) <= 300),
  interests text[] not null default '{}' check (interests <@ array['Учёба','Карьера','Спорт','Общение','Творчество']::text[]),
  created_at timestamptz not null default now()
);
create table public.unicore_activities (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.unicore_profiles(id) on delete cascade,
  kind text not null default 'invite' check (kind in ('invite','event')),
  title text not null check (char_length(trim(title)) between 5 and 80),
  description text not null check (char_length(trim(description)) between 15 and 1500),
  category text not null check (category in ('Учёба','Карьера','Спорт','Общение','Творчество')),
  starts_at timestamptz not null,
  location text not null check (char_length(trim(location)) between 3 and 120),
  capacity integer not null check (capacity between 2 and 100),
  featured boolean not null default false,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);
-- The host occupies one place implicitly and is not a participant row
create table public.unicore_participants (
  activity_id uuid not null references public.unicore_activities(id) on delete cascade,
  user_id uuid not null references public.unicore_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (activity_id,user_id)
);
create table public.unicore_saved (
  activity_id uuid not null references public.unicore_activities(id) on delete cascade,
  user_id uuid not null references public.unicore_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (activity_id,user_id)
);
create index unicore_activities_starts on public.unicore_activities(starts_at);
create index unicore_activities_host on public.unicore_activities(host_id);
create index unicore_participants_user on public.unicore_participants(user_id);
create index unicore_saved_user on public.unicore_saved(user_id);

alter table public.unicore_profiles enable row level security;
alter table public.unicore_activities enable row level security;
alter table public.unicore_participants enable row level security;
alter table public.unicore_saved enable row level security;
revoke all on public.unicore_profiles,public.unicore_activities,public.unicore_participants,public.unicore_saved from anon,authenticated;
grant select on public.unicore_profiles,public.unicore_activities,public.unicore_participants,public.unicore_saved to authenticated;
grant update(name,faculty,course,group_name,bio,interests) on public.unicore_profiles to authenticated;
create policy unicore_read_own_profile on public.unicore_profiles for select to authenticated using (id=(select auth.uid()));
create policy unicore_update_own_profile on public.unicore_profiles for update to authenticated using (id=(select auth.uid())) with check (id=(select auth.uid()));
create policy unicore_read_activities on public.unicore_activities for select to authenticated using (true);
create policy unicore_read_own_participation on public.unicore_participants for select to authenticated using (user_id=(select auth.uid()));
create policy unicore_read_own_saved on public.unicore_saved for select to authenticated using (user_id=(select auth.uid()));

-- A single snapshot keeps counts and membership consistent
-- Security definer is limited to this app's tables and explicitly checks the caller
-- Other users' email, bio, interests and memberships are never included
create function public.unicore_snapshot() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  result jsonb;
begin
  if me is null then raise exception 'UNICORE_AUTH_REQUIRED' using errcode='42501'; end if;
  insert into public.unicore_profiles(id,name)
    select me,coalesce(nullif(left(trim(u.raw_user_meta_data->>'name'),40),''),'Студент')
    from auth.users u where u.id=me on conflict (id) do nothing;
  select jsonb_build_object(
    'version',1,'session',true,
    'profile',jsonb_build_object('id',p.id,'name',p.name,'email',coalesce(auth.jwt()->>'email',''),
      'faculty',p.faculty,'course',p.course,'group',p.group_name,'bio',p.bio,'interests',p.interests),
    'activities',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'kind',a.kind,'title',a.title,'description',a.description,'category',a.category,
        'startsAt',a.starts_at,'location',a.location,'capacity',a.capacity,'featured',a.featured,'tags',a.tags,
        'hostId',a.host_id,'host',h.name,'hostInfo',concat_ws(' · ',nullif(h.faculty,''),case when h.course<>'' then h.course||' курс' end),
        -- UI adds the current user's membership, so exclude it from this count
        'attendees',1+(select count(*) from public.unicore_participants m where m.activity_id=a.id and m.user_id<>me)
      ) order by a.created_at desc,a.id)
      from public.unicore_activities a join public.unicore_profiles h on h.id=a.host_id
    ),'[]'::jsonb),
    'joinedIds',coalesce((select jsonb_agg(m.activity_id order by m.activity_id) from public.unicore_participants m where m.user_id=me),'[]'::jsonb),
    'savedIds',coalesce((select jsonb_agg(s.activity_id order by s.activity_id) from public.unicore_saved s where s.user_id=me),'[]'::jsonb)
  ) into result from public.unicore_profiles p where p.id=me;
  if result is null then raise exception 'UNICORE_AUTH_REQUIRED' using errcode='42501'; end if;
  return result;
end $$;

create function public.unicore_create_invite(
  p_title text,p_description text,p_category text,p_starts_at timestamptz,p_location text,p_capacity integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid:=auth.uid(); created_id uuid;
begin
  if me is null then raise exception 'UNICORE_AUTH_REQUIRED' using errcode='42501'; end if;
  if p_starts_at<=now() then raise exception 'UNICORE_PAST'; end if;
  if not exists(select 1 from public.unicore_profiles where id=me) then raise exception 'UNICORE_PROFILE_REQUIRED'; end if;
  insert into public.unicore_activities(host_id,title,description,category,starts_at,location,capacity,tags)
    values(me,trim(p_title),trim(p_description),p_category,p_starts_at,trim(p_location),p_capacity,array['Новая встреча'])
    returning id into created_id;
  return created_id;
end $$;

-- Explicit desired state makes retrying a request safe
-- All join/cancel operations lock the same activity row before inspecting capacity
create function public.unicore_set_joined(p_activity_id uuid,p_joined boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid:=auth.uid(); a public.unicore_activities; occupied bigint;
begin
  if me is null then raise exception 'UNICORE_AUTH_REQUIRED' using errcode='42501'; end if;
  if p_joined is null then raise exception 'UNICORE_INVALID_INPUT'; end if;
  select * into a from public.unicore_activities where id=p_activity_id for update;
  if not found then raise exception 'UNICORE_NOT_FOUND'; end if;
  if a.host_id=me then raise exception 'UNICORE_HOST'; end if;
  if not p_joined then
    delete from public.unicore_participants where activity_id=a.id and user_id=me;
    return;
  end if;
  if exists(select 1 from public.unicore_participants where activity_id=a.id and user_id=me) then return; end if;
  if a.starts_at<=now() then raise exception 'UNICORE_PAST'; end if;
  select 1+count(*) into occupied from public.unicore_participants where activity_id=a.id;
  if occupied>=a.capacity then raise exception 'UNICORE_FULL'; end if;
  insert into public.unicore_participants(activity_id,user_id) values(a.id,me) on conflict do nothing;
end $$;

create function public.unicore_set_saved(p_activity_id uuid,p_saved boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid:=auth.uid();
begin
  if me is null then raise exception 'UNICORE_AUTH_REQUIRED' using errcode='42501'; end if;
  if p_saved is null then raise exception 'UNICORE_INVALID_INPUT'; end if;
  if not exists(select 1 from public.unicore_activities where id=p_activity_id) then raise exception 'UNICORE_NOT_FOUND'; end if;
  if p_saved then
    insert into public.unicore_saved(activity_id,user_id) values(p_activity_id,me) on conflict do nothing;
  else
    delete from public.unicore_saved where activity_id=p_activity_id and user_id=me;
  end if;
end $$;

revoke all on function public.unicore_snapshot() from public,anon;
revoke all on function public.unicore_create_invite(text,text,text,timestamptz,text,integer) from public,anon;
revoke all on function public.unicore_set_joined(uuid,boolean) from public,anon;
revoke all on function public.unicore_set_saved(uuid,boolean) from public,anon;
grant execute on function public.unicore_snapshot() to authenticated;
grant execute on function public.unicore_create_invite(text,text,text,timestamptz,text,integer) to authenticated;
grant execute on function public.unicore_set_joined(uuid,boolean) to authenticated;
grant execute on function public.unicore_set_saved(uuid,boolean) to authenticated;

notify pgrst,'reload schema';
commit;
