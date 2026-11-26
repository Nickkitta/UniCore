-- Organizations and deterministic seed ownership markers
begin;
alter table public.unicore_profiles add column seed_key text unique;
alter table public.unicore_activities add column seed_key text unique;
create table public.unicore_organizations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.unicore_profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 80),
  description text not null default '' check (char_length(description)<=500),
  seed_key text unique,
  created_at timestamptz not null default now()
);
alter table public.unicore_organizations enable row level security;
revoke all on public.unicore_organizations from anon,authenticated;
grant select(id,owner_id,name,description,created_at) on public.unicore_organizations to authenticated;
create policy unicore_read_organizations on public.unicore_organizations for select to authenticated using (true);
alter table public.unicore_activities add column organization_id uuid references public.unicore_organizations(id) on delete set null;
create index unicore_activities_organization on public.unicore_activities(organization_id);
-- Admin-only seeder uses the official Auth API and these app tables
-- Client roles still cannot set seed markers or claim organizations
grant all on public.unicore_profiles,public.unicore_organizations,public.unicore_activities to service_role;

create or replace function public.unicore_snapshot() returns jsonb
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
      'theme',p.theme,'faculty',p.faculty,'course',p.course,'group',p.group_name,'bio',p.bio,'interests',p.interests),
    'organizations',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'description',o.description) order by o.name) from public.unicore_organizations o where o.owner_id=me),'[]'::jsonb),
    'activities',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'kind',a.kind,'title',a.title,'description',a.description,'category',a.category,
        'startsAt',a.starts_at,'location',a.location,'capacity',a.capacity,'featured',a.featured,'tags',a.tags,
        'priceRub',a.price_rub,'photoPaths',a.photo_paths,
        'coordinates',case when a.latitude is null then null else jsonb_build_object('latitude',a.latitude,'longitude',a.longitude) end,
        'organizationId',a.organization_id,'organizationName',o.name,
        'hostId',a.host_id,'host',h.name,'hostInfo',concat_ws(' · ',nullif(h.faculty,''),case when h.course<>'' then h.course||' курс' end),
        -- UI adds the current user's membership, so exclude it from this count
        'attendees',1+(select count(*) from public.unicore_participants m where m.activity_id=a.id and m.user_id<>me)
      ) order by a.created_at desc,a.id)
      from public.unicore_activities a join public.unicore_profiles h on h.id=a.host_id left join public.unicore_organizations o on o.id=a.organization_id
    ),'[]'::jsonb),
    'joinedIds',coalesce((select jsonb_agg(m.activity_id order by m.activity_id) from public.unicore_participants m where m.user_id=me),'[]'::jsonb),
    'savedIds',coalesce((select jsonb_agg(s.activity_id order by s.activity_id) from public.unicore_saved s where s.user_id=me),'[]'::jsonb)
  ) into result from public.unicore_profiles p where p.id=me;
  if result is null then raise exception 'UNICORE_AUTH_REQUIRED' using errcode='42501'; end if;
  return result;
end $$;

drop function public.unicore_create_event(text,text,text,timestamptz,text,integer,integer,double precision,double precision,text[]);
create function public.unicore_create_event(
  p_title text,p_description text,p_category text,p_starts_at timestamptz,p_location text,p_capacity integer,
  p_price_rub integer default 0,p_latitude double precision default null,p_longitude double precision default null,
  p_photo_paths text[] default '{}',p_organization_id uuid default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); created_id uuid;
begin
  if me is null then raise exception 'UNICORE_AUTH_REQUIRED' using errcode='42501'; end if;
  if p_starts_at<=now() then raise exception 'UNICORE_PAST'; end if;
  if not exists(select 1 from public.unicore_profiles where id=me) then raise exception 'UNICORE_PROFILE_REQUIRED'; end if;
  if p_photo_paths is null or cardinality(p_photo_paths)>5 or array_position(p_photo_paths,null) is not null then
    raise exception 'UNICORE_INVALID_PHOTOS';
  end if;
  if exists(select 1 from unnest(p_photo_paths) path where
    split_part(path,'/',1)<>me::text or not exists(
      select 1 from storage.objects o where o.bucket_id='unicore-events' and o.name=path
    )) then raise exception 'UNICORE_INVALID_PHOTOS'; end if;
  if p_organization_id is not null and not exists(select 1 from public.unicore_organizations where id=p_organization_id and owner_id=me) then raise exception 'UNICORE_ORGANIZATION_FORBIDDEN' using errcode='42501'; end if;
  insert into public.unicore_activities(host_id,kind,title,description,category,starts_at,location,capacity,price_rub,latitude,longitude,photo_paths,organization_id)
  values(me,'event',trim(p_title),trim(p_description),p_category,p_starts_at,trim(p_location),p_capacity,p_price_rub,p_latitude,p_longitude,p_photo_paths,p_organization_id)
  returning id into created_id;
  return created_id;
end $$;
revoke all on function public.unicore_create_event(text,text,text,timestamptz,text,integer,integer,double precision,double precision,text[],uuid) from public,anon;
grant execute on function public.unicore_create_event(text,text,text,timestamptz,text,integer,integer,double precision,double precision,text[],uuid) to authenticated;
notify pgrst,'reload schema';
commit;
