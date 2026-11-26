-- UniCore events: photos, optional map pin, price and personal theme
-- Apply after 202611120001_unicore.sql as one transaction
begin;
alter table public.unicore_profiles add column theme text not null default 'violet'
  check (theme in ('violet','forest','light'));
grant update(theme) on public.unicore_profiles to authenticated;
alter table public.unicore_activities
  add column price_rub integer not null default 0 check (price_rub between 0 and 1000000),
  add column latitude double precision,
  add column longitude double precision,
  add column photo_paths text[] not null default '{}',
  add constraint unicore_coordinates_valid check (
    (latitude is null and longitude is null) or
    (latitude is not null and longitude is not null and latitude between -90 and 90 and longitude between -180 and 180)),
  add constraint unicore_photos_limit check (cardinality(photo_paths)<=5 and array_position(photo_paths,null) is null);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('unicore-events','unicore-events',false,5242880,array['image/jpeg']);
create policy unicore_photo_read on storage.objects for select to authenticated using (
  bucket_id='unicore-events' and (
    (storage.foldername(name))[1]=(select auth.uid())::text or
    exists(select 1 from public.unicore_activities a where name=any(a.photo_paths))
  )
);
create policy unicore_photo_insert on storage.objects for insert to authenticated with check (
  bucket_id='unicore-events' and (storage.foldername(name))[1]=(select auth.uid())::text
);
-- Published attachments cannot be deleted by a direct client request
create policy unicore_photo_delete on storage.objects for delete to authenticated using (
  bucket_id='unicore-events' and (storage.foldername(name))[1]=(select auth.uid())::text
  and not exists(select 1 from public.unicore_activities a where name=any(a.photo_paths))
);

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
    'activities',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'kind',a.kind,'title',a.title,'description',a.description,'category',a.category,
        'startsAt',a.starts_at,'location',a.location,'capacity',a.capacity,'featured',a.featured,'tags',a.tags,
        'priceRub',a.price_rub,'photoPaths',a.photo_paths,
        'coordinates',case when a.latitude is null then null else jsonb_build_object('latitude',a.latitude,'longitude',a.longitude) end,
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

create function public.unicore_create_event(
  p_title text,p_description text,p_category text,p_starts_at timestamptz,p_location text,p_capacity integer,
  p_price_rub integer default 0,p_latitude double precision default null,p_longitude double precision default null,
  p_photo_paths text[] default '{}'
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
  insert into public.unicore_activities(host_id,kind,title,description,category,starts_at,location,capacity,price_rub,latitude,longitude,photo_paths)
  values(me,'event',trim(p_title),trim(p_description),p_category,p_starts_at,trim(p_location),p_capacity,p_price_rub,p_latitude,p_longitude,p_photo_paths)
  returning id into created_id;
  return created_id;
end $$;
revoke all on function public.unicore_create_event(text,text,text,timestamptz,text,integer,integer,double precision,double precision,text[]) from public,anon;
grant execute on function public.unicore_create_event(text,text,text,timestamptz,text,integer,integer,double precision,double precision,text[]) to authenticated;
notify pgrst,'reload schema';
commit;
