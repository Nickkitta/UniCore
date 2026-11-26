begin;
create table public.unicore_groups(faculty text not null,group_name text not null,primary key(faculty,group_name));
insert into public.unicore_groups values ('ИМИТ','ПИ-221'),('ИМИТ','ПИ-231'),('ИМИТ','ПИ-241'),('ИМИТ','ИВТ-241'),('ИМИТ','ИВТ-251'),('ИЕН','БИО-231'),('ИЕН','ХИМ-241'),('ИФМК','ФИЛ-241'),('ИФМК','ЖУР-231'),('ИФМК','ЛИН-251'),('ИЭУ','ЭК-241'),('ИЭУ','МЕН-231');
insert into public.unicore_groups(faculty,group_name)
select faculty,unnest(string_to_array(codes,' ')) from (values
 ('ФТИ','ИБб-261 ИБб-262 ИБвб-261 ИТСб-261 ИТСб-262 НМТб-261 НМТб-262 НМТб-263 ПМФПб-261 РТИб-261 РФИб-261 ФОб-261 ИБб-251 ИБб-252 ИБвб-251 ИТСб-251 ИТСб-252 НМТб-251 НМТб-252 НМТб-253 ПМФПб-251 РТИб-251 РФИб-251 ФОб-251 ИБб-241 ИБб-242 ИБвб-241 ИТСб-241 НМТб-241 НМТб-242 ПМФб-241 РТб-241 РФб-241 ФОб-241 ИБб-231 ИБб-232 ИТСб-231 НМТб-231 ПМФб-231 РТб-231 РФб-231 ФОб-231 ИБАС-261 КБ-261 ИБТС-261 РСК-261 РСК-262 РСК-263 СЭ-261 ИБАС-251 КБ-251 ИБТС-251 РСК-251 РСК-252 СЭ-251 ИБАС-241 КБ-241 ИБТС-241 РСК-241 СЭ-241 ИБАС-231 БИТ-231 ИБТС-231 РСК-231 СЭ-231 ИБм-261 ИТСм-261 РТПм-261 ФЗПм-261 ИБм-251 ИТСм-251 РТПм-251 ФЗПм-251'),
 ('ИМИТ','ПМИб-251 ПМИб-252 ПМИб-253 МКНб-251 МОСб-251 МОСб-252 МОС-253 ИВТб-251 ПРИб-251 ПРИб-252 ПРИб-253 ПРИб-254 ПРИб-255 ПМИб-241 ПМИб-242 МКНб-241 МКНб-242 МОСб-241 МОСб-242 ИВТб-241 ПРИб-241 ПРИб-242 ПРИб-243 ПРИб-244 ПРИб-245 ПМИб-231 МКНб-231 МОСб-231 МОСб-232 ИВТб-231 ПРИб-231 ПРИб-232 ПРИб-233 ПРИб-234 ПРИб-235 ПРИб-236 ИВТм-251 ПРИм-251 Мм-251 МОСм-251 ПИМм-251 ПМИм-251'),
 ('ИП','Юб-241 Юб-242 Юб-243'),
 ('ИЕН','БСТб-251 ЛДб-241'),
 ('ИИМОСТ','Иб-251 МОб-251 ПОб-242 ПОИб-241 ПОИб-242 МОб-241')
) as published(faculty,codes) on conflict do nothing;
alter table public.unicore_groups enable row level security;
revoke all on public.unicore_groups from public,anon,authenticated;
grant select on public.unicore_groups to authenticated;
create policy unicore_groups_read on public.unicore_groups for select to authenticated using(true);
create function public.unicore_check_group() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and (old.faculty,old.group_name) is not distinct from (new.faculty,new.group_name) then return new; end if;
 if (new.faculty<>'' or new.group_name<>'') and not exists(select 1 from public.unicore_groups where faculty=new.faculty and group_name=new.group_name) then raise exception 'UNICORE_INVALID_GROUP'; end if;
 return new;
end $$;
create trigger unicore_profile_group before insert or update of faculty,group_name on public.unicore_profiles for each row execute function public.unicore_check_group();
grant select on public.unicore_groups to service_role;
create table public.unicore_exclusions(activity_id uuid references public.unicore_activities on delete cascade,user_id uuid references public.unicore_profiles on delete cascade, primary key(activity_id,user_id));
create table public.unicore_messages(id uuid primary key default gen_random_uuid(),activity_id uuid not null references public.unicore_activities on delete cascade,author_id uuid not null references public.unicore_profiles on delete cascade,body text not null check(length(trim(body)) between 1 and 1000),sent_at timestamptz not null default now());
create index unicore_room_recent on public.unicore_messages(activity_id,sent_at desc,id desc);
alter table public.unicore_exclusions enable row level security;
alter table public.unicore_messages enable row level security;
revoke all on public.unicore_exclusions,public.unicore_messages from public,anon,authenticated;
grant select on public.unicore_exclusions to authenticated;
create policy unicore_own_exclusion on public.unicore_exclusions for select to authenticated using(user_id=(select auth.uid()));
create policy unicore_visible_event on public.unicore_activities as restrictive for select to authenticated using(not exists(select 1 from public.unicore_exclusions x where x.activity_id=id and x.user_id=(select auth.uid())));
create function public.unicore_room(p_activity_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); organizer uuid;
begin
 select host_id into organizer from public.unicore_activities where id=p_activity_id;
 if me is null or organizer is null or (me<>organizer and not exists(select 1 from public.unicore_participants where activity_id=p_activity_id and user_id=me)) then raise exception 'UNICORE_ROOM_DENIED' using errcode='42501'; end if;
 return jsonb_build_object('members',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by m.created_at,p.id) from public.unicore_participants m join public.unicore_profiles p on p.id=m.user_id where m.activity_id=p_activity_id and me=organizer),'[]'::jsonb),
 'messages',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',p.name,'body',r.body,'sentAt',r.sent_at) order by r.sent_at,r.id) from (select * from public.unicore_messages where activity_id=p_activity_id order by sent_at desc,id desc limit 100) r join public.unicore_profiles p on p.id=r.author_id),'[]'::jsonb));
end $$;
create function public.unicore_post_message(p_activity_id uuid,p_body text) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); organizer uuid;
begin
 select host_id into organizer from public.unicore_activities where id=p_activity_id for update;
 if me is null or organizer is null or (me<>organizer and not exists(select 1 from public.unicore_participants where activity_id=p_activity_id and user_id=me)) then raise exception 'UNICORE_ROOM_DENIED' using errcode='42501'; end if;
 insert into public.unicore_messages(activity_id,author_id,body) values(p_activity_id,me,trim(p_body));
end $$;
create function public.unicore_remove_member(p_activity_id uuid,p_user_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare organizer uuid;
begin
 select host_id into organizer from public.unicore_activities where id=p_activity_id for update;
 if auth.uid() is null or organizer is distinct from auth.uid() or p_user_id=organizer then raise exception 'UNICORE_ROOM_DENIED' using errcode='42501'; end if;
 delete from public.unicore_participants where activity_id=p_activity_id and user_id=p_user_id;
 if not found then raise exception 'UNICORE_NOT_FOUND'; end if;
 insert into public.unicore_exclusions values(p_activity_id,p_user_id);
 delete from public.unicore_saved where activity_id=p_activity_id and user_id=p_user_id;
end $$;
create function public.unicore_create_tagged_event(p_title text,p_description text,p_category text,p_starts_at timestamptz,p_location text,p_capacity integer,p_price_rub integer,p_latitude float8,p_longitude float8,p_photo_paths text[],p_tags text[],p_organization_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare created uuid;
begin
 if p_tags is null or cardinality(p_tags)>4 or array_position(p_tags,null) is not null or cardinality(p_tags)<>(select count(distinct tag) from unnest(p_tags) tag) or not (p_tags <@ array['Настолки','Знакомства','Кино','Музыка','Книги','Дизайн','Разработка','Наука','Языки','Волонтёрство','Туризм','Командная игра','Мастерская','Для новичков']) then raise exception 'UNICORE_INVALID_TAGS'; end if;
 created:=public.unicore_create_event(p_title,p_description,p_category,p_starts_at,p_location,p_capacity,p_price_rub,p_latitude,p_longitude,p_photo_paths,p_organization_id);
 update public.unicore_activities set tags=p_tags where id=created; return created;
end $$;
revoke all on function public.unicore_room(uuid),public.unicore_post_message(uuid,text),public.unicore_remove_member(uuid,uuid),public.unicore_create_tagged_event(text,text,text,timestamptz,text,integer,integer,float8,float8,text[],text[],uuid) from public,anon;
grant execute on function public.unicore_room(uuid),public.unicore_post_message(uuid,text),public.unicore_remove_member(uuid,uuid),public.unicore_create_tagged_event(text,text,text,timestamptz,text,integer,integer,float8,float8,text[],text[],uuid) to authenticated;
alter table public.unicore_profiles
 add column account_kind text not null default 'student' check(account_kind in ('student','partner')),
 add column company text not null default '' check(length(company)<=80),
 add column company_about text not null default '' check(length(company_about)<=400),
 add check(account_kind <> 'partner' or (length(trim(company))>0 and faculty='' and course='' and group_name=''));
grant update(company,company_about) on public.unicore_profiles to authenticated;

create table public.unicore_admins(user_id uuid primary key references auth.users on delete cascade);
create table public.unicore_partner_codes (
 code_hash bytea primary key, issued_by uuid references auth.users on delete set null,
 expires_at timestamptz not null, used_at timestamptz
);
alter table public.unicore_admins enable row level security;
alter table public.unicore_partner_codes enable row level security;
revoke all on public.unicore_admins,public.unicore_partner_codes from public,anon,authenticated;

create function public.unicore_issue_partner_code() returns text language plpgsql security definer set search_path='' as $$
declare code text:=replace(gen_random_uuid()::text,'-','');
begin
 if not exists(select 1 from public.unicore_admins where user_id=auth.uid()) then raise insufficient_privilege; end if;
 insert into public.unicore_partner_codes values(sha256(convert_to(code,'UTF8')),auth.uid(),now()+interval '7 days',null);
 return code;
end $$;
revoke all on function public.unicore_issue_partner_code() from public,anon;
grant execute on function public.unicore_issue_partner_code() to authenticated;

create function public.unicore_register_partner() returns trigger language plpgsql security definer set search_path='' as $$
declare meta jsonb:=new.raw_user_meta_data;
begin
 if not coalesce(meta ? 'partner_code',false) then return new; end if;
 update public.unicore_partner_codes set used_at=now()
 where code_hash=sha256(convert_to(lower(trim(meta->>'partner_code')),'UTF8')) and used_at is null and expires_at>now();
 if not found then raise exception 'UNICORE_INVALID_CODE'; end if;
 insert into public.unicore_profiles(id,name,account_kind,company)
 values(new.id,trim(meta->>'name'),'partner',trim(meta->>'company'));
 update auth.users set raw_user_meta_data=meta-'partner_code' where id=new.id;
 return new;
end $$;
revoke all on function public.unicore_register_partner() from public,anon,authenticated;
create trigger unicore_partner_signup after insert on auth.users for each row execute function public.unicore_register_partner();

alter table public.unicore_activities add column partner_badge text check(partner_badge in ('Стажировка','Экскурсия','Мастер-класс','Встреча с командой'));
create function public.unicore_create_partner_event(p_title text,p_description text,p_category text,p_starts_at timestamptz,p_location text,p_capacity integer,p_price_rub integer,p_latitude float8,p_longitude float8,p_photo_paths text[],p_tags text[],p_badge text) returns uuid
language plpgsql security definer set search_path='' as $$
declare created uuid;
begin
 if not exists(select 1 from public.unicore_profiles where id=auth.uid() and account_kind='partner') then raise insufficient_privilege; end if;
 if p_badge is null then raise exception 'UNICORE_INVALID_TAGS'; end if;
 created:=public.unicore_create_tagged_event(p_title,p_description,p_category,p_starts_at,p_location,p_capacity,p_price_rub,p_latitude,p_longitude,p_photo_paths,p_tags,null);
 update public.unicore_activities set partner_badge=p_badge where id=created;
 return created;
end $$;
revoke all on function public.unicore_create_partner_event(text,text,text,timestamptz,text,integer,integer,float8,float8,text[],text[],text) from public,anon;
grant execute on function public.unicore_create_partner_event(text,text,text,timestamptz,text,integer,integer,float8,float8,text[],text[],text) to authenticated;
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
      'theme',p.theme,'faculty',p.faculty,'course',p.course,'group',p.group_name,'bio',p.bio,'interests',p.interests,
      'accountKind',p.account_kind,'company',p.company,'companyAbout',p.company_about,'isAdmin',exists(select 1 from public.unicore_admins where user_id=me)),
    'groups',coalesce((select jsonb_agg(jsonb_build_object('faculty',g.faculty,'group',g.group_name) order by g.faculty,g.group_name) from public.unicore_groups g),'[]'::jsonb),
    'organizations',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'description',o.description) order by o.name) from public.unicore_organizations o where o.owner_id=me),'[]'::jsonb),
    'activities',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'kind',a.kind,'title',a.title,'description',a.description,'category',a.category,
        'startsAt',a.starts_at,'location',a.location,'capacity',a.capacity,'featured',a.featured,'tags',a.tags,
        'priceRub',a.price_rub,'photoPaths',a.photo_paths,
        'coordinates',case when a.latitude is null then null else jsonb_build_object('latitude',a.latitude,'longitude',a.longitude) end,
        'organizationId',a.organization_id,'organizationName',case when h.account_kind='partner' then h.company else o.name end,
        'partnerBadge',case when h.account_kind='partner' then coalesce(a.partner_badge,'Партнёрская встреча') end,
        'companyAbout',case when h.account_kind='partner' then h.company_about end,
        'hostId',a.host_id,'host',h.name,'hostInfo',concat_ws(' · ',nullif(h.faculty,''),case when h.course<>'' then h.course||' курс' end),
        -- UI adds the current user's membership, so exclude it from this count
        'attendees',(case when h.account_kind='partner' then 0 else 1 end)+(select count(*) from public.unicore_participants m where m.activity_id=a.id and m.user_id<>me)
      ) order by a.created_at desc,a.id)
      from public.unicore_activities a join public.unicore_profiles h on h.id=a.host_id left join public.unicore_organizations o on o.id=a.organization_id where not exists(select 1 from public.unicore_exclusions x where x.activity_id=a.id and x.user_id=me)
    ),'[]'::jsonb),
    'joinedIds',coalesce((select jsonb_agg(m.activity_id order by m.activity_id) from public.unicore_participants m where m.user_id=me),'[]'::jsonb),
    'savedIds',coalesce((select jsonb_agg(s.activity_id order by s.activity_id) from public.unicore_saved s where s.user_id=me),'[]'::jsonb)
  ) into result from public.unicore_profiles p where p.id=me;
  if result is null then raise exception 'UNICORE_AUTH_REQUIRED' using errcode='42501'; end if;
  return result;
end $$;
create or replace function public.unicore_set_joined(p_activity_id uuid,p_joined boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid:=auth.uid(); a public.unicore_activities; occupied bigint;
begin
  if me is null then raise exception 'UNICORE_AUTH_REQUIRED' using errcode='42501'; end if;
  if p_joined is null then raise exception 'UNICORE_INVALID_INPUT'; end if;
  select * into a from public.unicore_activities where id=p_activity_id for update;
  if not found or exists(select 1 from public.unicore_exclusions where activity_id=p_activity_id and user_id=me) then raise exception 'UNICORE_NOT_FOUND'; end if;
  if a.host_id=me then raise exception 'UNICORE_HOST'; end if;
  if p_joined and exists(select 1 from public.unicore_profiles where id=me and account_kind='partner') then raise exception 'UNICORE_PARTNER_JOIN'; end if;
  if not p_joined then
    delete from public.unicore_participants where activity_id=a.id and user_id=me;
    return;
  end if;
  if exists(select 1 from public.unicore_participants where activity_id=a.id and user_id=me) then return; end if;
  if a.starts_at<=now() then raise exception 'UNICORE_PAST'; end if;
  select (case when exists(select 1 from public.unicore_profiles where id=a.host_id and account_kind='partner') then 0 else 1 end)+count(*) into occupied from public.unicore_participants where activity_id=a.id;
  if occupied>=a.capacity then raise exception 'UNICORE_FULL'; end if;
  insert into public.unicore_participants(activity_id,user_id) values(a.id,me) on conflict do nothing;
end $$;
create or replace function public.unicore_set_saved(p_activity_id uuid,p_saved boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid:=auth.uid();
begin
  if me is null then raise exception 'UNICORE_AUTH_REQUIRED' using errcode='42501'; end if;
  if p_saved is null then raise exception 'UNICORE_INVALID_INPUT'; end if;
  perform 1 from public.unicore_activities where id=p_activity_id for update; if not found or exists(select 1 from public.unicore_exclusions where activity_id=p_activity_id and user_id=me) then raise exception 'UNICORE_NOT_FOUND'; end if;
  if p_saved then
    insert into public.unicore_saved(activity_id,user_id) values(p_activity_id,me) on conflict do nothing;
  else
    delete from public.unicore_saved where activity_id=p_activity_id and user_id=me;
  end if;
end $$;
alter table public.unicore_participants add column is_cohost boolean not null default false;

create function public.unicore_set_cohost(p_activity_id uuid,p_user_id uuid,p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
declare organizer uuid;
begin
 select host_id into organizer from public.unicore_activities where id=p_activity_id for update;
 if auth.uid() is null or organizer is distinct from auth.uid() or p_user_id=organizer then
   raise exception 'UNICORE_ROOM_DENIED' using errcode='42501';
 end if;
 if p_enabled is null then raise exception 'UNICORE_INVALID_INPUT'; end if;
 update public.unicore_participants set is_cohost=p_enabled where activity_id=p_activity_id and user_id=p_user_id;
 if not found then raise exception 'UNICORE_NOT_FOUND'; end if;
end $$;
revoke all on function public.unicore_set_cohost(uuid,uuid,boolean) from public,anon;
grant execute on function public.unicore_set_cohost(uuid,uuid,boolean) to authenticated;

create or replace function public.unicore_room(p_activity_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); organizer uuid; helper boolean;
begin
 select host_id into organizer from public.unicore_activities where id=p_activity_id;
 if me is null or organizer is null or (me<>organizer and not exists(select 1 from public.unicore_participants where activity_id=p_activity_id and user_id=me)) then raise exception 'UNICORE_ROOM_DENIED' using errcode='42501'; end if;
 select exists(select 1 from public.unicore_participants where activity_id=p_activity_id and user_id=me and is_cohost) into helper;
 return jsonb_build_object('isCohost',helper,'members',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'isCohost',m.is_cohost) order by m.is_cohost desc,m.created_at,p.id) from public.unicore_participants m join public.unicore_profiles p on p.id=m.user_id where m.activity_id=p_activity_id and (me=organizer or helper)),'[]'::jsonb),
 'messages',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',p.name,'body',r.body,'sentAt',r.sent_at) order by r.sent_at,r.id) from (select * from public.unicore_messages where activity_id=p_activity_id order by sent_at desc,id desc limit 100) r join public.unicore_profiles p on p.id=r.author_id),'[]'::jsonb));
end $$;

create or replace function public.unicore_remove_member(p_activity_id uuid,p_user_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare organizer uuid;
begin
 select host_id into organizer from public.unicore_activities where id=p_activity_id for update;
 if auth.uid() is null or organizer is null or p_user_id=organizer or p_user_id=auth.uid() or (
     organizer<>auth.uid() and (
       not exists(select 1 from public.unicore_participants where activity_id=p_activity_id and user_id=auth.uid() and is_cohost)
       or exists(select 1 from public.unicore_participants where activity_id=p_activity_id and user_id=p_user_id and is_cohost)
     )
   ) then raise exception 'UNICORE_ROOM_DENIED' using errcode='42501'; end if;
 delete from public.unicore_participants where activity_id=p_activity_id and user_id=p_user_id;
 if not found then raise exception 'UNICORE_NOT_FOUND'; end if;
 insert into public.unicore_exclusions values(p_activity_id,p_user_id);
 delete from public.unicore_saved where activity_id=p_activity_id and user_id=p_user_id;
end $$;

notify pgrst,'reload schema';
commit;
