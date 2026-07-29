begin;

-- Migration version: 20260729194800.
-- Follow-up for projects where an auth.users trigger creates public.profiles.
-- The RPC accepts that trigger-created profile only when it belongs to the
-- exact newly created Auth user. An e-mail owned by any other profile remains
-- a hard conflict.
create or replace function public.provision_company_user(
  p_caller_user_id uuid,
  p_new_user_id uuid,
  p_email text,
  p_full_name text,
  p_role text,
  p_requested_company_id uuid default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_company_count integer;
  v_company_id uuid;
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
  v_full_name text := pg_catalog.btrim(coalesce(p_full_name, ''));
  v_role public.app_role;
  v_membership public.company_members%rowtype;
begin
  if p_caller_user_id is null or p_new_user_id is null then
    raise exception 'Brak identyfikatora użytkownika';
  end if;
  if pg_catalog.char_length(v_email) not between 3 and 254
     or pg_catalog.strpos(v_email, '@') <= 1 then
    raise exception 'Nieprawidłowy adres e-mail';
  end if;
  if pg_catalog.char_length(v_full_name) not between 1 and 150 then
    raise exception 'Nieprawidłowe imię i nazwisko';
  end if;
  if pg_catalog.lower(pg_catalog.btrim(coalesce(p_role, '')))
     not in ('admin', 'worker') then
    raise exception 'Nieprawidłowa rola użytkownika';
  end if;
  v_role := pg_catalog.lower(pg_catalog.btrim(p_role))::public.app_role;

  select
    pg_catalog.count(*)::integer,
    pg_catalog.min(cm.company_id::text)::uuid
  into v_company_count, v_company_id
  from public.company_members cm
  join public.profiles pr
    on pr.id = cm.user_id
   and pr.is_active = true
  join public.companies c
    on c.id = cm.company_id
   and c.is_active = true
  where cm.user_id = p_caller_user_id
    and cm.role = 'owner'::public.app_role
    and cm.is_active = true;

  if v_company_count <> 1 or v_company_id is null then
    raise exception 'Caller nie jest aktywnym ownerem dokładnie jednej firmy';
  end if;
  if p_requested_company_id is not null and p_requested_company_id <> v_company_id then
    raise exception 'Nie można utworzyć użytkownika w innej firmie';
  end if;
  if exists (
    select 1
    from public.profiles p
    where pg_catalog.lower(pg_catalog.btrim(p.email)) = v_email
      and p.id <> p_new_user_id
  ) then
    raise exception 'Użytkownik z tym adresem e-mail już istnieje';
  end if;

  insert into public.profiles (
    id,
    email,
    full_name,
    is_active
  )
  values (
    p_new_user_id,
    v_email,
    v_full_name,
    true
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = excluded.full_name,
    is_active = true;

  insert into public.company_members (
    user_id,
    company_id,
    role,
    is_active,
    invited_by
  )
  values (
    p_new_user_id,
    v_company_id,
    v_role,
    true,
    p_caller_user_id
  )
  returning * into v_membership;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'company_id', v_company_id,
    'membership', pg_catalog.jsonb_build_object(
      'id', v_membership.id,
      'user_id', v_membership.user_id,
      'company_id', v_membership.company_id,
      'role', v_membership.role,
      'is_active', v_membership.is_active
    )
  );
end;
$$;

revoke all on function public.provision_company_user(uuid,uuid,text,text,text,uuid)
  from public, anon, authenticated;
grant execute on function public.provision_company_user(uuid,uuid,text,text,text,uuid)
  to service_role;

commit;
