begin;

-- Migration version: 20260729190000.
-- Magazyn PRO backend hardening
-- Run as the database owner in Supabase SQL Editor.
-- This migration intentionally fails instead of silently changing conflicting data.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

do $$
begin
  if to_regprocedure('public.is_active_member_of_company(uuid)') is not null
     and to_regprocedure('private.is_active_member_of_company(uuid)') is null then
    alter function public.is_active_member_of_company(uuid) set schema private;
  end if;

  if to_regprocedure('public.has_feature_permission(uuid,text)') is not null
     and to_regprocedure('private.has_feature_permission(uuid,text)') is null then
    alter function public.has_feature_permission(uuid,text) set schema private;
  end if;

  if to_regprocedure('public.has_tab_permission(uuid,text)') is not null
     and to_regprocedure('private.has_tab_permission(uuid,text)') is null then
    alter function public.has_tab_permission(uuid,text) set schema private;
  end if;

  if to_regprocedure('public.is_owner_of_company(uuid)') is not null
     and to_regprocedure('private.is_owner_of_company(uuid)') is null then
    alter function public.is_owner_of_company(uuid) set schema private;
  end if;
end;
$$;

create or replace function private.is_active_member_of_company(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_members cm
    join public.profiles pr
      on pr.id = cm.user_id
     and pr.is_active = true
    join public.companies c
      on c.id = cm.company_id
     and c.is_active = true
    where cm.company_id = p_company_id
      and cm.user_id = auth.uid()
      and cm.is_active = true
  );
$$;

create or replace function private.is_owner_of_company(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_members cm
    join public.profiles pr
      on pr.id = cm.user_id
     and pr.is_active = true
    join public.companies c
      on c.id = cm.company_id
     and c.is_active = true
    where cm.company_id = target_company_id
      and cm.user_id = auth.uid()
      and cm.role = 'owner'::public.app_role
      and cm.is_active = true
  );
$$;

create or replace function private.has_tab_permission(
  p_company_id uuid,
  p_tab_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
  v_permissions jsonb;
  v_value jsonb;
begin
  if auth.uid() is null
     or p_company_id is null
     or nullif(pg_catalog.btrim(p_tab_key), '') is null then
    return false;
  end if;

  select cm.role
  into v_role
  from public.company_members cm
  join public.profiles pr
    on pr.id = cm.user_id
   and pr.is_active = true
  join public.companies c
    on c.id = cm.company_id
   and c.is_active = true
  where cm.company_id = p_company_id
    and cm.user_id = auth.uid()
    and cm.is_active = true
  limit 1;

  if v_role is null then
    return false;
  end if;

  if v_role = 'owner'::public.app_role then
    return true;
  end if;

  if p_tab_key = 'users' then
    return false;
  end if;

  select crp.tab_permissions
  into v_permissions
  from public.company_role_permissions crp
  where crp.company_id = p_company_id
    and crp.role = v_role
  limit 1;

  v_value := v_permissions -> p_tab_key;
  return pg_catalog.jsonb_typeof(v_value) = 'boolean'
    and (v_value #>> '{}')::boolean;
exception
  when invalid_text_representation then
    return false;
end;
$$;

create or replace function private.has_feature_permission(
  p_company_id uuid,
  p_feature_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
  v_tab_key text;
  v_tab_permissions jsonb;
  v_feature_permissions jsonb;
  v_tab_value jsonb;
  v_feature_value jsonb;
begin
  if auth.uid() is null
     or p_company_id is null
     or nullif(pg_catalog.btrim(p_feature_key), '') is null then
    return false;
  end if;

  select cm.role
  into v_role
  from public.company_members cm
  join public.profiles pr
    on pr.id = cm.user_id
   and pr.is_active = true
  join public.companies c
    on c.id = cm.company_id
   and c.is_active = true
  where cm.company_id = p_company_id
    and cm.user_id = auth.uid()
    and cm.is_active = true
  limit 1;

  if v_role is null then
    return false;
  end if;

  if v_role = 'owner'::public.app_role then
    return true;
  end if;

  if p_feature_key in ('users_manage', 'users_permissions_manage') then
    return false;
  end if;

  v_tab_key := case
    when p_feature_key in ('company_thresholds_manage', 'stock_adjustments_manage') then 'parts'
    when p_feature_key in ('suppliers_create', 'suppliers_edit') then 'catalog_suppliers'
    when p_feature_key in ('parts_create', 'parts_edit') then 'catalog_parts'
    when p_feature_key in ('machines_create', 'machines_edit') then 'catalog_machines'
    else null
  end;

  if v_tab_key is null then
    return false;
  end if;

  select crp.tab_permissions, crp.feature_permissions
  into v_tab_permissions, v_feature_permissions
  from public.company_role_permissions crp
  where crp.company_id = p_company_id
    and crp.role = v_role
  limit 1;

  v_tab_value := v_tab_permissions -> v_tab_key;
  v_feature_value := v_feature_permissions -> p_feature_key;

  return pg_catalog.jsonb_typeof(v_tab_value) = 'boolean'
    and (v_tab_value #>> '{}')::boolean
    and pg_catalog.jsonb_typeof(v_feature_value) = 'boolean'
    and (v_feature_value #>> '{}')::boolean;
exception
  when invalid_text_representation then
    return false;
end;
$$;

revoke all on function private.is_active_member_of_company(uuid) from public, anon;
revoke all on function private.is_owner_of_company(uuid) from public, anon;
revoke all on function private.has_tab_permission(uuid,text) from public, anon;
revoke all on function private.has_feature_permission(uuid,text) from public, anon;
grant execute on function private.is_active_member_of_company(uuid) to authenticated;
grant execute on function private.is_owner_of_company(uuid) to authenticated;
grant execute on function private.has_tab_permission(uuid,text) to authenticated;
grant execute on function private.has_feature_permission(uuid,text) to authenticated;

drop policy if exists profiles_update_own on public.profiles;
revoke update on public.profiles from authenticated;

-- Catalog and company writes are performed only by validated RPC functions below.
revoke insert, update, delete on public.companies from authenticated;
revoke insert, update, delete on public.company_members from authenticated;
revoke insert, update, delete on public.parts from authenticated;
revoke insert, update, delete on public.suppliers from authenticated;
revoke insert, update, delete on public.supplier_part_prices from authenticated;
revoke insert, update, delete on public.machine_definitions from authenticated;
revoke insert, update, delete on public.machine_bom_items from authenticated;

drop policy if exists parts_delete_permission on public.parts;
drop policy if exists suppliers_delete_permission on public.suppliers;
drop policy if exists machine_definitions_delete_permission on public.machine_definitions;

-- Case-insensitive business identifiers.
create unique index if not exists parts_company_sku_ci_key
  on public.parts (company_id, pg_catalog.lower(pg_catalog.btrim(sku)));

create unique index if not exists suppliers_company_name_ci_key
  on public.suppliers (company_id, pg_catalog.lower(pg_catalog.btrim(name)));

create unique index if not exists machine_definitions_company_code_ci_key
  on public.machine_definitions (company_id, pg_catalog.lower(pg_catalog.btrim(code)));

create unique index if not exists profiles_email_ci_key
  on public.profiles (pg_catalog.lower(pg_catalog.btrim(email)))
  where email is not null;

-- Indexes used by RLS, history pagination and FIFO consumption.
create index if not exists company_members_access_idx
  on public.company_members (user_id, company_id, is_active, role);

create index if not exists history_events_company_created_idx
  on public.history_events (company_id, created_at desc, id);

create index if not exists inventory_lots_fifo_idx
  on public.inventory_lots (company_id, part_id, received_at, id)
  where qty_remaining > 0;

-- Align database quantities with the integer-only browser application.
alter table public.inventory_lots
  drop constraint if exists inventory_lots_integer_quantities_check,
  add constraint inventory_lots_integer_quantities_check
    check (
      qty_initial = pg_catalog.trunc(qty_initial)
      and qty_remaining = pg_catalog.trunc(qty_remaining)
    );

alter table public.machine_bom_items
  drop constraint if exists machine_bom_items_integer_qty_check,
  add constraint machine_bom_items_integer_qty_check
    check (qty = pg_catalog.trunc(qty));

alter table public.machine_stock
  drop constraint if exists machine_stock_integer_qty_check,
  add constraint machine_stock_integer_qty_check
    check (qty = pg_catalog.trunc(qty));

alter table public.parts
  drop constraint if exists parts_integer_thresholds_check,
  add constraint parts_integer_thresholds_check
    check (
      (warning_qty is null or warning_qty = pg_catalog.trunc(warning_qty))
      and (critical_qty is null or critical_qty = pg_catalog.trunc(critical_qty))
    );

-- Bounded values and text prevent oversized history/RPC payloads.
alter table public.companies
  drop constraint if exists companies_text_length_check,
  add constraint companies_text_length_check
    check (
      pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 200
      and (slug is null or pg_catalog.char_length(pg_catalog.btrim(slug)) between 1 and 100)
    );

alter table public.profiles
  drop constraint if exists profiles_text_length_check,
  add constraint profiles_text_length_check
    check (
      email is null or pg_catalog.char_length(pg_catalog.btrim(email)) between 3 and 254
    ),
  drop constraint if exists profiles_full_name_length_check,
  add constraint profiles_full_name_length_check
    check (
      full_name is null or pg_catalog.char_length(pg_catalog.btrim(full_name)) between 1 and 150
    );

alter table public.parts
  drop constraint if exists parts_business_text_check,
  add constraint parts_business_text_check
    check (
      pg_catalog.btrim(sku) ~ '^[A-Za-z0-9_-]{1,50}$'
      and pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 200
      and (notes is null or pg_catalog.char_length(notes) <= 5000)
    );

alter table public.suppliers
  drop constraint if exists suppliers_business_text_check,
  add constraint suppliers_business_text_check
    check (
      pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 200
      and (email is null or pg_catalog.char_length(pg_catalog.btrim(email)) between 3 and 254)
      and (phone is null or pg_catalog.char_length(pg_catalog.btrim(phone)) <= 50)
      and (notes is null or pg_catalog.char_length(notes) <= 5000)
    );

alter table public.machine_definitions
  drop constraint if exists machine_definitions_business_text_check,
  add constraint machine_definitions_business_text_check
    check (
      pg_catalog.btrim(code) ~ '^[A-Za-z0-9_-]{1,50}$'
      and pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 200
      and (notes is null or pg_catalog.char_length(notes) <= 5000)
    );

alter table public.inventory_lots
  drop constraint if exists inventory_lots_upper_bounds_check,
  add constraint inventory_lots_upper_bounds_check
    check (
      qty_initial <= 1000000000
      and qty_remaining <= 1000000000
      and (unit_price is null or unit_price <= 999999999.99)
      and pg_catalog.char_length(currency) between 1 and 10
      and (notes is null or pg_catalog.char_length(notes) <= 5000)
    );

alter table public.machine_bom_items
  drop constraint if exists machine_bom_items_upper_bound_check,
  add constraint machine_bom_items_upper_bound_check
    check (
      qty <= 1000000000
      and (notes is null or pg_catalog.char_length(notes) <= 5000)
    );

alter table public.machine_stock
  drop constraint if exists machine_stock_upper_bound_check,
  add constraint machine_stock_upper_bound_check
    check (qty <= 1000000000);

alter table public.supplier_part_prices
  drop constraint if exists supplier_part_prices_upper_bound_check,
  add constraint supplier_part_prices_upper_bound_check
    check (
      price <= 999999999.99
      and pg_catalog.char_length(currency) between 1 and 10
    );

alter table public.history_events
  drop constraint if exists history_events_payload_size_check,
  add constraint history_events_payload_size_check
    check (
      pg_catalog.char_length(pg_catalog.btrim(title)) between 1 and 300
      and (description is null or pg_catalog.char_length(description) <= 2000)
      and pg_catalog.octet_length(payload::text) <= 1048576
    );

create or replace function public.save_company_thresholds(
  p_company_id uuid,
  p_low_warn integer,
  p_low_danger integer,
  p_expected_updated_at timestamp with time zone
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company public.companies%rowtype;
begin
  if not private.has_feature_permission(p_company_id, 'company_thresholds_manage') then
    raise exception 'Brak uprawnienia do zmiany progów firmy';
  end if;

  if p_low_warn is null
     or p_low_danger is null
     or p_low_warn < 0
     or p_low_danger < 0
     or p_low_danger > p_low_warn
     or p_low_warn > 1000000000 then
    raise exception 'Nieprawidłowe progi firmy';
  end if;

  if p_expected_updated_at is null then
    raise exception 'Brak wersji ustawień firmy';
  end if;

  select *
  into v_company
  from public.companies c
  where c.id = p_company_id
    and c.is_active = true
  for update;

  if v_company.id is null then
    raise exception 'Nie znaleziono aktywnej firmy';
  end if;

  if v_company.updated_at is distinct from p_expected_updated_at then
    raise exception 'Ustawienia firmy zostały zmienione przez innego użytkownika';
  end if;

  update public.companies
  set low_warn = p_low_warn,
      low_danger = p_low_danger
  where id = p_company_id
  returning * into v_company;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'company', pg_catalog.jsonb_build_object(
      'id', v_company.id,
      'name', v_company.name,
      'low_warn', v_company.low_warn,
      'low_danger', v_company.low_danger,
      'updated_at', v_company.updated_at
    )
  );
end;
$$;

create or replace function public.create_catalog_supplier(
  p_company_id uuid,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := pg_catalog.btrim(coalesce(p_name, ''));
  v_supplier public.suppliers%rowtype;
begin
  if not private.has_feature_permission(p_company_id, 'suppliers_create') then
    raise exception 'Brak uprawnienia do tworzenia dostawców';
  end if;

  if pg_catalog.char_length(v_name) not between 1 and 200 then
    raise exception 'Nazwa dostawcy ma nieprawidłową długość';
  end if;

  if exists (
    select 1
    from public.suppliers s
    where s.company_id = p_company_id
      and pg_catalog.lower(pg_catalog.btrim(s.name)) = pg_catalog.lower(v_name)
  ) then
    raise exception 'Dostawca o tej nazwie już istnieje';
  end if;

  insert into public.suppliers (
    company_id,
    name,
    is_active,
    created_by
  )
  values (
    p_company_id,
    v_name,
    true,
    auth.uid()
  )
  returning * into v_supplier;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'supplier', pg_catalog.jsonb_build_object(
      'id', v_supplier.id,
      'company_id', v_supplier.company_id,
      'name', v_supplier.name,
      'is_active', v_supplier.is_active,
      'updated_at', v_supplier.updated_at
    )
  );
end;
$$;

create or replace function public.set_catalog_part_active(
  p_company_id uuid,
  p_sku text,
  p_is_active boolean,
  p_expected_updated_at timestamp with time zone
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_part public.parts%rowtype;
begin
  if not private.has_feature_permission(p_company_id, 'parts_edit') then
    raise exception 'Brak uprawnienia do edycji części';
  end if;
  if p_is_active is null or p_expected_updated_at is null then
    raise exception 'Brak wymaganych danych wersji części';
  end if;

  select *
  into v_part
  from public.parts p
  where p.company_id = p_company_id
    and pg_catalog.lower(pg_catalog.btrim(p.sku)) =
        pg_catalog.lower(pg_catalog.btrim(coalesce(p_sku, '')))
  for update;

  if v_part.id is null then
    raise exception 'Nie znaleziono części';
  end if;
  if v_part.updated_at is distinct from p_expected_updated_at then
    raise exception 'Część została zmieniona przez innego użytkownika';
  end if;

  update public.parts
  set is_active = p_is_active
  where id = v_part.id
  returning * into v_part;

  return pg_catalog.jsonb_build_object('ok', true, 'part', pg_catalog.to_jsonb(v_part));
end;
$$;

create or replace function public.set_catalog_supplier_active(
  p_company_id uuid,
  p_name text,
  p_is_active boolean,
  p_expected_updated_at timestamp with time zone
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_supplier public.suppliers%rowtype;
begin
  if not private.has_feature_permission(p_company_id, 'suppliers_edit') then
    raise exception 'Brak uprawnienia do edycji dostawcy';
  end if;
  if p_is_active is null or p_expected_updated_at is null then
    raise exception 'Brak wymaganych danych wersji dostawcy';
  end if;

  select *
  into v_supplier
  from public.suppliers s
  where s.company_id = p_company_id
    and pg_catalog.lower(pg_catalog.btrim(s.name)) =
        pg_catalog.lower(pg_catalog.btrim(coalesce(p_name, '')))
  for update;

  if v_supplier.id is null then
    raise exception 'Nie znaleziono dostawcy';
  end if;
  if v_supplier.updated_at is distinct from p_expected_updated_at then
    raise exception 'Dostawca został zmieniony przez innego użytkownika';
  end if;

  update public.suppliers
  set is_active = p_is_active
  where id = v_supplier.id
  returning * into v_supplier;

  return pg_catalog.jsonb_build_object('ok', true, 'supplier', pg_catalog.to_jsonb(v_supplier));
end;
$$;

create or replace function public.set_machine_definition_active(
  p_company_id uuid,
  p_code text,
  p_is_active boolean,
  p_expected_updated_at timestamp with time zone
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_machine public.machine_definitions%rowtype;
begin
  if not private.has_feature_permission(p_company_id, 'machines_edit') then
    raise exception 'Brak uprawnienia do edycji maszyny';
  end if;
  if p_is_active is null or p_expected_updated_at is null then
    raise exception 'Brak wymaganych danych wersji maszyny';
  end if;

  select *
  into v_machine
  from public.machine_definitions md
  where md.company_id = p_company_id
    and pg_catalog.lower(pg_catalog.btrim(md.code)) =
        pg_catalog.lower(pg_catalog.btrim(coalesce(p_code, '')))
  for update;

  if v_machine.id is null then
    raise exception 'Nie znaleziono maszyny';
  end if;
  if v_machine.updated_at is distinct from p_expected_updated_at then
    raise exception 'Maszyna została zmieniona przez innego użytkownika';
  end if;

  update public.machine_definitions
  set is_active = p_is_active
  where id = v_machine.id
  returning * into v_machine;

  return pg_catalog.jsonb_build_object('ok', true, 'machine', pg_catalog.to_jsonb(v_machine));
end;
$$;

create or replace function public.save_catalog_part(
  p_company_id uuid,
  p_original_sku text,
  p_sku text,
  p_name text,
  p_is_active boolean,
  p_warning_qty integer,
  p_critical_qty integer,
  p_expected_updated_at timestamp with time zone,
  p_supplier_prices jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original_sku text := pg_catalog.btrim(coalesce(p_original_sku, ''));
  v_sku text := pg_catalog.btrim(coalesce(p_sku, ''));
  v_name text := pg_catalog.btrim(coalesce(p_name, ''));
  v_current_part public.parts%rowtype;
  v_saved_part public.parts%rowtype;
  v_is_edit boolean := false;
  v_supplier_item jsonb;
  v_supplier_id uuid;
  v_price numeric;
  v_seen_supplier_ids uuid[] := '{}';
begin
  if p_company_id is null then
    raise exception 'Brak identyfikatora firmy';
  end if;
  if v_sku !~ '^[A-Za-z0-9_-]{1,50}$' then
    raise exception 'Nieprawidłowy identyfikator części';
  end if;
  if pg_catalog.char_length(v_name) not between 1 and 200 then
    raise exception 'Nieprawidłowa nazwa części';
  end if;
  if p_warning_qty is not null and (p_warning_qty < 0 or p_warning_qty > 1000000000) then
    raise exception 'Nieprawidłowy próg ostrzegawczy';
  end if;
  if p_critical_qty is not null and (p_critical_qty < 0 or p_critical_qty > 1000000000) then
    raise exception 'Nieprawidłowy próg krytyczny';
  end if;
  if (p_warning_qty is null) <> (p_critical_qty is null) then
    raise exception 'Uzupełnij oba progi albo pozostaw oba puste';
  end if;
  if p_critical_qty is not null and p_critical_qty > p_warning_qty then
    raise exception 'Próg krytyczny nie może przewyższać ostrzegawczego';
  end if;

  p_supplier_prices := coalesce(p_supplier_prices, '[]'::jsonb);
  if pg_catalog.jsonb_typeof(p_supplier_prices) <> 'array'
     or pg_catalog.jsonb_array_length(p_supplier_prices) > 500 then
    raise exception 'Nieprawidłowa lista cen dostawców';
  end if;

  if v_original_sku = '' then
    v_original_sku := v_sku;
  end if;

  select *
  into v_current_part
  from public.parts p
  where p.company_id = p_company_id
    and pg_catalog.lower(pg_catalog.btrim(p.sku)) = pg_catalog.lower(v_original_sku)
  for update;

  v_is_edit := v_current_part.id is not null;

  if v_is_edit then
    if not private.has_feature_permission(p_company_id, 'parts_edit') then
      raise exception 'Brak uprawnienia do edycji części';
    end if;
    if p_expected_updated_at is null
       or v_current_part.updated_at is distinct from p_expected_updated_at then
      raise exception 'Część została zmieniona przez innego użytkownika';
    end if;
  else
    if not private.has_feature_permission(p_company_id, 'parts_create') then
      raise exception 'Brak uprawnienia do tworzenia części';
    end if;
  end if;

  if exists (
    select 1
    from public.parts p
    where p.company_id = p_company_id
      and pg_catalog.lower(pg_catalog.btrim(p.sku)) = pg_catalog.lower(v_sku)
      and (not v_is_edit or p.id <> v_current_part.id)
  ) then
    raise exception 'Część o takim SKU już istnieje';
  end if;

  if v_is_edit then
    update public.parts
    set sku = v_sku,
        name = v_name,
        is_active = coalesce(p_is_active, true),
        warning_qty = p_warning_qty,
        critical_qty = p_critical_qty
    where id = v_current_part.id
    returning * into v_saved_part;
  else
    insert into public.parts (
      company_id,
      sku,
      name,
      is_active,
      warning_qty,
      critical_qty,
      created_by
    )
    values (
      p_company_id,
      v_sku,
      v_name,
      coalesce(p_is_active, true),
      p_warning_qty,
      p_critical_qty,
      auth.uid()
    )
    returning * into v_saved_part;
  end if;

  for v_supplier_item in
    select value
    from pg_catalog.jsonb_array_elements(p_supplier_prices)
  loop
    if pg_catalog.jsonb_typeof(v_supplier_item) <> 'object' then
      raise exception 'Nieprawidłowa pozycja ceny dostawcy';
    end if;

    v_supplier_id := nullif(
      pg_catalog.btrim(coalesce(v_supplier_item ->> 'supplier_id', '')),
      ''
    )::uuid;
    v_price := coalesce((v_supplier_item ->> 'price')::numeric, 0);

    if v_supplier_id is null then
      raise exception 'Brak dostawcy w pozycji ceny';
    end if;
    if v_price < 0
       or v_price > 999999999.99
       or v_price::text = any(array['NaN', 'Infinity', '-Infinity']) then
      raise exception 'Nieprawidłowa cena dostawcy';
    end if;
    if v_supplier_id = any(v_seen_supplier_ids) then
      raise exception 'Lista dostawców zawiera duplikaty';
    end if;
    v_seen_supplier_ids := pg_catalog.array_append(v_seen_supplier_ids, v_supplier_id);

    if not exists (
      select 1
      from public.suppliers s
      where s.id = v_supplier_id
        and s.company_id = p_company_id
    ) then
      raise exception 'Dostawca nie należy do tej firmy';
    end if;
  end loop;

  delete from public.supplier_part_prices spp
  where spp.company_id = p_company_id
    and spp.part_id = v_saved_part.id;

  if pg_catalog.jsonb_array_length(p_supplier_prices) > 0 then
    insert into public.supplier_part_prices (
      company_id,
      supplier_id,
      part_id,
      price,
      is_active
    )
    select
      p_company_id,
      nullif(pg_catalog.btrim(coalesce(value ->> 'supplier_id', '')), '')::uuid,
      v_saved_part.id,
      coalesce((value ->> 'price')::numeric, 0),
      true
    from pg_catalog.jsonb_array_elements(p_supplier_prices);
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'part', pg_catalog.jsonb_build_object(
      'id', v_saved_part.id,
      'company_id', v_saved_part.company_id,
      'sku', v_saved_part.sku,
      'name', v_saved_part.name,
      'is_active', v_saved_part.is_active,
      'warning_qty', v_saved_part.warning_qty,
      'critical_qty', v_saved_part.critical_qty,
      'updated_at', v_saved_part.updated_at
    )
  );
end;
$$;

create or replace function public.save_machine_definition(
  p_company_id uuid,
  p_original_code text,
  p_code text,
  p_name text,
  p_is_active boolean,
  p_expected_updated_at timestamp with time zone,
  p_bom jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original_code text := pg_catalog.btrim(coalesce(p_original_code, ''));
  v_code text := pg_catalog.btrim(coalesce(p_code, ''));
  v_name text := pg_catalog.btrim(coalesce(p_name, ''));
  v_current_machine public.machine_definitions%rowtype;
  v_saved_machine public.machine_definitions%rowtype;
  v_is_edit boolean := false;
  v_bom_item jsonb;
  v_part_id uuid;
  v_qty numeric;
  v_seen_part_ids uuid[] := '{}';
begin
  if p_company_id is null then
    raise exception 'Brak identyfikatora firmy';
  end if;
  if v_code !~ '^[A-Za-z0-9_-]{1,50}$' then
    raise exception 'Nieprawidłowy kod maszyny';
  end if;
  if pg_catalog.char_length(v_name) not between 1 and 200 then
    raise exception 'Nieprawidłowa nazwa maszyny';
  end if;

  p_bom := coalesce(p_bom, '[]'::jsonb);
  if pg_catalog.jsonb_typeof(p_bom) <> 'array'
     or pg_catalog.jsonb_array_length(p_bom) > 500 then
    raise exception 'Nieprawidłowa lista BOM';
  end if;

  if v_original_code = '' then
    v_original_code := v_code;
  end if;

  select *
  into v_current_machine
  from public.machine_definitions md
  where md.company_id = p_company_id
    and pg_catalog.lower(pg_catalog.btrim(md.code)) = pg_catalog.lower(v_original_code)
  for update;

  v_is_edit := v_current_machine.id is not null;

  if v_is_edit then
    if not private.has_feature_permission(p_company_id, 'machines_edit') then
      raise exception 'Brak uprawnienia do edycji maszyny';
    end if;
    if p_expected_updated_at is null
       or v_current_machine.updated_at is distinct from p_expected_updated_at then
      raise exception 'Maszyna została zmieniona przez innego użytkownika';
    end if;
  else
    if not private.has_feature_permission(p_company_id, 'machines_create') then
      raise exception 'Brak uprawnienia do tworzenia maszyny';
    end if;
  end if;

  if exists (
    select 1
    from public.machine_definitions md
    where md.company_id = p_company_id
      and pg_catalog.lower(pg_catalog.btrim(md.code)) = pg_catalog.lower(v_code)
      and (not v_is_edit or md.id <> v_current_machine.id)
  ) then
    raise exception 'Maszyna o takim kodzie już istnieje';
  end if;

  if v_is_edit then
    update public.machine_definitions
    set code = v_code,
        name = v_name,
        is_active = coalesce(p_is_active, true)
    where id = v_current_machine.id
    returning * into v_saved_machine;
  else
    insert into public.machine_definitions (
      company_id,
      code,
      name,
      is_active,
      created_by
    )
    values (
      p_company_id,
      v_code,
      v_name,
      coalesce(p_is_active, true),
      auth.uid()
    )
    returning * into v_saved_machine;
  end if;

  for v_bom_item in
    select value
    from pg_catalog.jsonb_array_elements(p_bom)
  loop
    if pg_catalog.jsonb_typeof(v_bom_item) <> 'object' then
      raise exception 'Nieprawidłowa pozycja BOM';
    end if;

    v_part_id := nullif(
      pg_catalog.btrim(coalesce(v_bom_item ->> 'part_id', '')),
      ''
    )::uuid;
    v_qty := coalesce((v_bom_item ->> 'qty')::numeric, 0);

    if v_part_id is null then
      raise exception 'Brak części w pozycji BOM';
    end if;
    if v_qty <= 0
       or v_qty > 1000000000
       or v_qty <> pg_catalog.trunc(v_qty)
       or v_qty::text = any(array['NaN', 'Infinity', '-Infinity']) then
      raise exception 'Ilość BOM musi być dodatnią liczbą całkowitą';
    end if;
    if v_part_id = any(v_seen_part_ids) then
      raise exception 'BOM zawiera zduplikowane części';
    end if;
    v_seen_part_ids := pg_catalog.array_append(v_seen_part_ids, v_part_id);

    if not exists (
      select 1
      from public.parts p
      where p.id = v_part_id
        and p.company_id = p_company_id
    ) then
      raise exception 'Część BOM nie należy do tej firmy';
    end if;
  end loop;

  delete from public.machine_bom_items mbi
  where mbi.company_id = p_company_id
    and mbi.machine_definition_id = v_saved_machine.id;

  if pg_catalog.jsonb_array_length(p_bom) > 0 then
    insert into public.machine_bom_items (
      company_id,
      machine_definition_id,
      part_id,
      qty
    )
    select
      p_company_id,
      v_saved_machine.id,
      nullif(pg_catalog.btrim(coalesce(value ->> 'part_id', '')), '')::uuid,
      coalesce((value ->> 'qty')::numeric, 0)
    from pg_catalog.jsonb_array_elements(p_bom);
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'machine', pg_catalog.jsonb_build_object(
      'id', v_saved_machine.id,
      'company_id', v_saved_machine.company_id,
      'code', v_saved_machine.code,
      'name', v_saved_machine.name,
      'is_active', v_saved_machine.is_active,
      'updated_at', v_saved_machine.updated_at
    )
  );
end;
$$;

create or replace function public.save_supplier_prices(
  p_company_id uuid,
  p_supplier_name text,
  p_expected_updated_at timestamp with time zone,
  p_prices jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_supplier_name text := pg_catalog.btrim(coalesce(p_supplier_name, ''));
  v_supplier public.suppliers%rowtype;
  v_price_item jsonb;
  v_part_id uuid;
  v_price numeric;
  v_seen_part_ids uuid[] := '{}';
begin
  if not private.has_feature_permission(p_company_id, 'suppliers_edit') then
    raise exception 'Brak uprawnienia do edycji cennika dostawcy';
  end if;
  if pg_catalog.char_length(v_supplier_name) not between 1 and 200 then
    raise exception 'Nieprawidłowa nazwa dostawcy';
  end if;
  if p_expected_updated_at is null then
    raise exception 'Brak wersji dostawcy';
  end if;

  p_prices := coalesce(p_prices, '[]'::jsonb);
  if pg_catalog.jsonb_typeof(p_prices) <> 'array'
     or pg_catalog.jsonb_array_length(p_prices) > 500 then
    raise exception 'Nieprawidłowa lista cen';
  end if;

  select *
  into v_supplier
  from public.suppliers s
  where s.company_id = p_company_id
    and pg_catalog.lower(pg_catalog.btrim(s.name)) = pg_catalog.lower(v_supplier_name)
  for update;

  if v_supplier.id is null then
    raise exception 'Nie znaleziono dostawcy';
  end if;
  if v_supplier.updated_at is distinct from p_expected_updated_at then
    raise exception 'Dostawca został zmieniony przez innego użytkownika';
  end if;

  for v_price_item in
    select value
    from pg_catalog.jsonb_array_elements(p_prices)
  loop
    if pg_catalog.jsonb_typeof(v_price_item) <> 'object' then
      raise exception 'Nieprawidłowa pozycja cennika';
    end if;

    v_part_id := nullif(
      pg_catalog.btrim(coalesce(v_price_item ->> 'part_id', '')),
      ''
    )::uuid;
    v_price := coalesce((v_price_item ->> 'price')::numeric, 0);

    if v_part_id is null then
      raise exception 'Brak części w pozycji cennika';
    end if;
    if v_price < 0
       or v_price > 999999999.99
       or v_price::text = any(array['NaN', 'Infinity', '-Infinity']) then
      raise exception 'Nieprawidłowa cena części';
    end if;
    if v_part_id = any(v_seen_part_ids) then
      raise exception 'Lista części zawiera duplikaty';
    end if;
    v_seen_part_ids := pg_catalog.array_append(v_seen_part_ids, v_part_id);

    if not exists (
      select 1
      from public.parts p
      where p.id = v_part_id
        and p.company_id = p_company_id
    ) then
      raise exception 'Część nie należy do tej firmy';
    end if;
  end loop;

  update public.suppliers
  set name = v_supplier.name
  where id = v_supplier.id
  returning * into v_supplier;

  delete from public.supplier_part_prices spp
  where spp.company_id = p_company_id
    and spp.supplier_id = v_supplier.id;

  if pg_catalog.jsonb_array_length(p_prices) > 0 then
    insert into public.supplier_part_prices (
      company_id,
      supplier_id,
      part_id,
      price,
      is_active
    )
    select
      p_company_id,
      v_supplier.id,
      nullif(pg_catalog.btrim(coalesce(value ->> 'part_id', '')), '')::uuid,
      coalesce((value ->> 'price')::numeric, 0),
      true
    from pg_catalog.jsonb_array_elements(p_prices);
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'supplier', pg_catalog.jsonb_build_object(
      'id', v_supplier.id,
      'company_id', v_supplier.company_id,
      'name', v_supplier.name,
      'is_active', v_supplier.is_active,
      'updated_at', v_supplier.updated_at
    )
  );
end;
$$;

create or replace function public.update_company_member(
  p_member_id uuid,
  p_role text default null,
  p_is_active boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.company_members%rowtype;
  v_next_role public.app_role;
begin
  if p_member_id is null then
    raise exception 'Brak identyfikatora członkostwa';
  end if;

  select *
  into v_target
  from public.company_members cm
  where cm.id = p_member_id
  for update;

  if v_target.id is null then
    raise exception 'Nie znaleziono użytkownika firmy';
  end if;
  if not private.is_owner_of_company(v_target.company_id) then
    raise exception 'Tylko aktywny owner może zarządzać użytkownikami';
  end if;
  if v_target.role = 'owner'::public.app_role or v_target.user_id = auth.uid() then
    raise exception 'Nie można zmienić ownera ani własnego członkostwa';
  end if;
  if p_role is null and p_is_active is null then
    raise exception 'Brak zmian do zapisania';
  end if;

  if p_role is not null then
    if pg_catalog.lower(pg_catalog.btrim(p_role)) not in ('admin', 'worker') then
      raise exception 'Można ustawić wyłącznie rolę admin albo worker';
    end if;
    v_next_role := pg_catalog.lower(pg_catalog.btrim(p_role))::public.app_role;
  else
    v_next_role := v_target.role;
  end if;

  update public.company_members
  set role = v_next_role,
      is_active = coalesce(p_is_active, v_target.is_active)
  where id = v_target.id
  returning * into v_target;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'membership', pg_catalog.jsonb_build_object(
      'id', v_target.id,
      'user_id', v_target.user_id,
      'company_id', v_target.company_id,
      'role', v_target.role,
      'is_active', v_target.is_active,
      'updated_at', v_target.updated_at
    )
  );
end;
$$;

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

create or replace function public.finalize_delivery(
  p_company_id uuid,
  p_supplier_id uuid,
  p_received_at timestamp with time zone,
  p_items jsonb,
  p_invoice_number text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_part_id uuid;
  v_part_sku text;
  v_part_name text;
  v_qty integer;
  v_unit_price numeric;
  v_inserted_count integer := 0;
  v_history_event_id uuid;
  v_supplier_name text;
  v_payload_items jsonb := '[]'::jsonb;
  v_invoice_number text := pg_catalog.btrim(coalesce(p_invoice_number, ''));
  v_seen_part_ids uuid[] := '{}';
begin
  if not private.has_tab_permission(p_company_id, 'delivery') then
    raise exception 'Brak uprawnienia do przyjmowania dostaw';
  end if;
  if p_company_id is null or p_supplier_id is null or p_received_at is null then
    raise exception 'Brak wymaganych danych dostawy';
  end if;
  if pg_catalog.char_length(v_invoice_number) not between 1 and 200 then
    raise exception 'Numer faktury ma nieprawidłową długość';
  end if;
  if p_items is null
     or pg_catalog.jsonb_typeof(p_items) <> 'array'
     or pg_catalog.jsonb_array_length(p_items) not between 1 and 500 then
    raise exception 'Dostawa musi zawierać od 1 do 500 pozycji';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_company_id::text, 0)
  );

  select s.name
  into v_supplier_name
  from public.suppliers s
  where s.id = p_supplier_id
    and s.company_id = p_company_id
    and s.is_active = true;

  if v_supplier_name is null then
    raise exception 'Nie znaleziono aktywnego dostawcy w tej firmie';
  end if;

  for v_item in
    select value
    from pg_catalog.jsonb_array_elements(p_items)
  loop
    if pg_catalog.jsonb_typeof(v_item) <> 'object' then
      raise exception 'Nieprawidłowa pozycja dostawy';
    end if;

    v_part_id := nullif(
      pg_catalog.btrim(coalesce(v_item ->> 'part_id', '')),
      ''
    )::uuid;
    v_qty := coalesce((v_item ->> 'qty')::integer, 0);
    v_unit_price := coalesce((v_item ->> 'unit_price')::numeric, 0);

    if v_part_id is null then
      raise exception 'Brak części w pozycji dostawy';
    end if;
    if v_qty <= 0 or v_qty > 1000000000 then
      raise exception 'Ilość dostawy musi być dodatnią liczbą całkowitą';
    end if;
    if v_unit_price < 0
       or v_unit_price > 999999999.99
       or v_unit_price::text = any(array['NaN', 'Infinity', '-Infinity']) then
      raise exception 'Nieprawidłowa cena dostawy';
    end if;
    if v_part_id = any(v_seen_part_ids) then
      raise exception 'Dostawa zawiera zduplikowaną część';
    end if;
    v_seen_part_ids := pg_catalog.array_append(v_seen_part_ids, v_part_id);

    select p.sku, p.name
    into v_part_sku, v_part_name
    from public.parts p
    where p.id = v_part_id
      and p.company_id = p_company_id
      and p.is_active = true;

    if v_part_sku is null then
      raise exception 'Część dostawy nie jest aktywna w tej firmie';
    end if;

    if not exists (
      select 1
      from public.supplier_part_prices spp
      where spp.company_id = p_company_id
        and spp.supplier_id = p_supplier_id
        and spp.part_id = v_part_id
        and spp.is_active = true
    ) then
      raise exception 'Część nie jest przypisana do wybranego dostawcy';
    end if;

    v_payload_items := v_payload_items || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'part_id', v_part_id,
        'sku', v_part_sku,
        'name', v_part_name,
        'qty', v_qty,
        'unit_price', v_unit_price
      )
    );
  end loop;

  insert into public.history_events (
    company_id,
    event_type,
    title,
    description,
    payload,
    created_by
  )
  values (
    p_company_id,
    'delivery_finalized',
    'Dostawa • ' || v_supplier_name,
    'Przyjęto ' || pg_catalog.jsonb_array_length(v_payload_items) || ' pozycji',
    pg_catalog.jsonb_build_object(
      'dateISO', pg_catalog.to_char(p_received_at at time zone 'UTC', 'YYYY-MM-DD'),
      'supplier_id', p_supplier_id,
      'supplier', v_supplier_name,
      'invoice_number', v_invoice_number,
      'items', v_payload_items
    ),
    auth.uid()
  )
  returning id into v_history_event_id;

  for v_item in
    select value
    from pg_catalog.jsonb_array_elements(v_payload_items)
  loop
    insert into public.inventory_lots (
      company_id,
      part_id,
      supplier_id,
      unit_price,
      qty_initial,
      qty_remaining,
      received_at,
      source_type,
      source_history_event_id,
      created_by
    )
    values (
      p_company_id,
      (v_item ->> 'part_id')::uuid,
      p_supplier_id,
      (v_item ->> 'unit_price')::numeric,
      (v_item ->> 'qty')::integer,
      (v_item ->> 'qty')::integer,
      p_received_at,
      'delivery',
      v_history_event_id,
      auth.uid()
    );

    v_inserted_count := v_inserted_count + 1;
  end loop;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'inserted_lot_count', v_inserted_count,
    'history_event_id', v_history_event_id
  );
end;
$$;

create or replace function public.apply_stock_adjustment(
  p_company_id uuid,
  p_date timestamp with time zone,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_part_id uuid;
  v_part_sku text;
  v_part_name text;
  v_actual_previous_qty integer;
  v_new_qty integer;
  v_diff integer;
  v_reference_unit_price numeric;
  v_parts_changed integer := 0;
  v_history_event_id uuid;
  v_payload_items jsonb := '[]'::jsonb;
  v_total_net_diff bigint := 0;
  v_created_lot_payload jsonb;
  v_affected_lots_payload jsonb;
  v_remaining_to_remove integer;
  v_lot record;
  v_taken integer;
  v_seen_part_ids uuid[] := '{}';
begin
  if not private.has_feature_permission(p_company_id, 'stock_adjustments_manage') then
    raise exception 'Brak uprawnienia do korekty stanów';
  end if;
  if p_company_id is null or p_date is null then
    raise exception 'Brak wymaganych danych korekty';
  end if;
  if p_items is null
     or pg_catalog.jsonb_typeof(p_items) <> 'array'
     or pg_catalog.jsonb_array_length(p_items) not between 1 and 500 then
    raise exception 'Korekta musi zawierać od 1 do 500 pozycji';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_company_id::text, 0)
  );

  for v_item in
    select value
    from pg_catalog.jsonb_array_elements(p_items)
  loop
    if pg_catalog.jsonb_typeof(v_item) <> 'object' then
      raise exception 'Nieprawidłowa pozycja korekty';
    end if;

    v_part_sku := pg_catalog.btrim(coalesce(v_item ->> 'sku', ''));
    v_new_qty := coalesce((v_item ->> 'new_qty')::integer, -1);
    v_reference_unit_price := coalesce(
      (v_item ->> 'reference_unit_price')::numeric,
      0
    );

    if v_part_sku = '' then
      raise exception 'Brak SKU w pozycji korekty';
    end if;
    if v_new_qty < 0 or v_new_qty > 1000000000 then
      raise exception 'Nowy stan musi być nieujemną liczbą całkowitą';
    end if;
    if v_reference_unit_price < 0
       or v_reference_unit_price > 999999999.99
       or v_reference_unit_price::text = any(array['NaN', 'Infinity', '-Infinity']) then
      raise exception 'Nieprawidłowa cena referencyjna';
    end if;

    select p.id, p.sku, p.name
    into v_part_id, v_part_sku, v_part_name
    from public.parts p
    where p.company_id = p_company_id
      and pg_catalog.lower(pg_catalog.btrim(p.sku)) = pg_catalog.lower(v_part_sku)
      and p.is_active = true;

    if v_part_id is null then
      raise exception 'Nie znaleziono aktywnej części w tej firmie';
    end if;
    if v_part_id = any(v_seen_part_ids) then
      raise exception 'Korekta zawiera zduplikowaną część';
    end if;
    v_seen_part_ids := pg_catalog.array_append(v_seen_part_ids, v_part_id);

    select coalesce(pg_catalog.sum(l.qty_remaining), 0)::integer
    into v_actual_previous_qty
    from public.inventory_lots l
    where l.company_id = p_company_id
      and l.part_id = v_part_id;

    v_diff := v_new_qty - v_actual_previous_qty;
    if v_diff = 0 then
      continue;
    end if;

    v_parts_changed := v_parts_changed + 1;
    v_total_net_diff := v_total_net_diff + v_diff;
    v_created_lot_payload := null;
    v_affected_lots_payload := '[]'::jsonb;

    if v_diff > 0 then
      v_created_lot_payload := pg_catalog.jsonb_build_object(
        'lot_id', null,
        'qty', v_diff,
        'sku', v_part_sku,
        'name', v_part_name,
        'supplier', 'Korekta stanu',
        'date_in', pg_catalog.to_char(p_date at time zone 'UTC', 'YYYY-MM-DD'),
        'unit_price', v_reference_unit_price
      );
    else
      v_remaining_to_remove := pg_catalog.abs(v_diff);

      for v_lot in
        select
          l.id,
          l.qty_remaining,
          l.unit_price,
          l.received_at,
          s.name as supplier_name
        from public.inventory_lots l
        left join public.suppliers s
          on s.id = l.supplier_id
         and s.company_id = l.company_id
        where l.company_id = p_company_id
          and l.part_id = v_part_id
          and l.qty_remaining > 0
        order by l.received_at asc nulls last, l.id asc
        for update of l
      loop
        exit when v_remaining_to_remove <= 0;
        v_taken := least(v_lot.qty_remaining::integer, v_remaining_to_remove);

        update public.inventory_lots
        set qty_remaining = qty_remaining - v_taken
        where id = v_lot.id
          and company_id = p_company_id
          and part_id = v_part_id;

        v_remaining_to_remove := v_remaining_to_remove - v_taken;
        v_affected_lots_payload := v_affected_lots_payload || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'lot_id', v_lot.id,
            'removed_qty', v_taken,
            'sku', v_part_sku,
            'name', v_part_name,
            'supplier', coalesce(v_lot.supplier_name, '-'),
            'date_in', pg_catalog.to_char(v_lot.received_at at time zone 'UTC', 'YYYY-MM-DD'),
            'unit_price', coalesce(v_lot.unit_price, 0),
            'remaining_after', greatest(v_lot.qty_remaining::integer - v_taken, 0)
          )
        );
      end loop;

      if v_remaining_to_remove > 0 then
        raise exception 'Brak wystarczającego stanu do wykonania korekty';
      end if;
    end if;

    v_payload_items := v_payload_items || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'part_id', v_part_id,
        'sku', v_part_sku,
        'name', v_part_name,
        'previous_qty', v_actual_previous_qty,
        'new_qty', v_new_qty,
        'diff', v_diff,
        'direction', case when v_diff > 0 then 'plus' else 'minus' end,
        'reference_unit_price', case when v_diff > 0 then v_reference_unit_price else 0 end,
        'created_lot', v_created_lot_payload,
        'affected_lots', v_affected_lots_payload
      )
    );
  end loop;

  if v_parts_changed = 0 then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'parts_changed', 0,
      'history_event_id', null
    );
  end if;

  insert into public.history_events (
    company_id,
    event_type,
    title,
    description,
    payload,
    created_by
  )
  values (
    p_company_id,
    'stock_adjustment',
    'Korekta stanów • ' || v_parts_changed || ' cz.',
    'Bilans korekty: ' ||
      case when v_total_net_diff > 0
        then '+' || v_total_net_diff::text
        else v_total_net_diff::text
      end,
    pg_catalog.jsonb_build_object(
      'dateISO', pg_catalog.to_char(p_date at time zone 'UTC', 'YYYY-MM-DD'),
      'parts_changed', v_parts_changed,
      'items', v_payload_items
    ),
    auth.uid()
  )
  returning id into v_history_event_id;

  for v_item in
    select value
    from pg_catalog.jsonb_array_elements(v_payload_items)
  loop
    if (v_item ->> 'diff')::integer > 0 then
      insert into public.inventory_lots (
        company_id,
        part_id,
        supplier_id,
        unit_price,
        qty_initial,
        qty_remaining,
        received_at,
        source_type,
        source_history_event_id,
        created_by
      )
      values (
        p_company_id,
        (v_item ->> 'part_id')::uuid,
        null,
        (v_item ->> 'reference_unit_price')::numeric,
        (v_item ->> 'diff')::integer,
        (v_item ->> 'diff')::integer,
        p_date,
        'adjustment',
        v_history_event_id,
        auth.uid()
      );
    end if;
  end loop;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'parts_changed', v_parts_changed,
    'history_event_id', v_history_event_id
  );
end;
$$;

create or replace function public.finalize_production(
  p_company_id uuid,
  p_build_date timestamp with time zone,
  p_items jsonb,
  p_manual_allocations jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_build_item jsonb;
  v_machine_code text;
  v_machine_qty bigint;
  v_machine_id uuid;
  v_machine_name text;
  v_requirement record;
  v_bom_item record;
  v_consumption record;
  v_history_event_id uuid;
  v_history_items jsonb := '[]'::jsonb;
  v_manual_mode boolean := false;
  v_parts_used jsonb;
  v_lots_used jsonb;
  v_manual_alloc jsonb;
  v_manual_sku text;
  v_manual_qty bigint;
  v_manual_lot_id uuid;
  v_manual_part_id uuid;
  v_allocated_sum bigint;
  v_remaining bigint;
  v_taken bigint;
  v_assign_remaining bigint;
  v_lot record;
  v_component_count integer;
begin
  if not private.has_tab_permission(p_company_id, 'build') then
    raise exception 'Brak uprawnienia do finalizacji produkcji';
  end if;
  if p_company_id is null or p_build_date is null then
    raise exception 'Brak wymaganych danych produkcji';
  end if;
  if p_items is null
     or pg_catalog.jsonb_typeof(p_items) <> 'array'
     or pg_catalog.jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'Produkcja musi zawierać od 1 do 50 pozycji';
  end if;
  if p_manual_allocations is not null
     and pg_catalog.jsonb_typeof(p_manual_allocations) <> 'array' then
    raise exception 'Ręczne alokacje muszą być tablicą JSON';
  end if;
  if p_manual_allocations is not null
     and pg_catalog.jsonb_array_length(p_manual_allocations) > 2000 then
    raise exception 'Ręczna alokacja może zawierać maksymalnie 2000 pozycji';
  end if;

  v_manual_mode := p_manual_allocations is not null
    and pg_catalog.jsonb_array_length(p_manual_allocations) > 0;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_company_id::text, 0)
  );

  create temporary table tmp_build_items (
    build_item_id bigint generated always as identity primary key,
    machine_code text not null,
    machine_qty bigint not null,
    machine_definition_id uuid not null unique,
    machine_name text not null
  ) on commit drop;

  create temporary table tmp_requirements (
    part_id uuid primary key,
    sku text not null,
    name text not null,
    needed_qty bigint not null default 0
  ) on commit drop;

  create temporary table tmp_manual_allocations (
    lot_id uuid primary key,
    part_id uuid not null,
    sku text not null,
    qty bigint not null
  ) on commit drop;

  create temporary table tmp_consumption (
    consumption_id bigint generated always as identity primary key,
    part_id uuid not null,
    sku text not null,
    name text not null,
    lot_id uuid not null,
    qty bigint not null,
    unassigned_qty bigint not null,
    supplier text not null,
    date_in text,
    unit_price numeric not null
  ) on commit drop;

  create temporary table tmp_history_consumption (
    history_consumption_id bigint generated always as identity primary key,
    build_item_id bigint not null,
    part_id uuid not null,
    lot_id uuid not null,
    qty bigint not null,
    sku text not null,
    name text not null,
    supplier text not null,
    date_in text,
    unit_price numeric not null
  ) on commit drop;

  for v_build_item in
    select value
    from pg_catalog.jsonb_array_elements(p_items)
  loop
    if pg_catalog.jsonb_typeof(v_build_item) <> 'object' then
      raise exception 'Nieprawidłowa pozycja produkcji';
    end if;

    v_machine_code := pg_catalog.btrim(
      coalesce(v_build_item ->> 'machine_code', '')
    );
    v_machine_qty := coalesce((v_build_item ->> 'qty')::bigint, 0);

    if v_machine_code = '' then
      raise exception 'Brak kodu maszyny w pozycji produkcji';
    end if;
    if v_machine_qty <= 0 or v_machine_qty > 1000000000 then
      raise exception 'Ilość produkcji musi być dodatnią liczbą całkowitą';
    end if;

    select md.id, md.name
    into v_machine_id, v_machine_name
    from public.machine_definitions md
    where md.company_id = p_company_id
      and pg_catalog.lower(pg_catalog.btrim(md.code)) =
          pg_catalog.lower(v_machine_code)
      and md.is_active = true;

    if v_machine_id is null then
      raise exception 'Nie znaleziono aktywnej maszyny w tej firmie';
    end if;
    if exists (
      select 1
      from pg_temp.tmp_build_items bi
      where bi.machine_definition_id = v_machine_id
    ) then
      raise exception 'Produkcja zawiera zduplikowaną maszynę';
    end if;
    if not exists (
      select 1
      from public.machine_bom_items mbi
      where mbi.company_id = p_company_id
        and mbi.machine_definition_id = v_machine_id
    ) then
      raise exception 'Maszyna nie ma zdefiniowanego BOM';
    end if;
    if exists (
      select 1
      from public.machine_bom_items mbi
      join public.parts p
        on p.id = mbi.part_id
       and p.company_id = mbi.company_id
      where mbi.company_id = p_company_id
        and mbi.machine_definition_id = v_machine_id
        and p.is_active = false
    ) then
      raise exception 'BOM maszyny zawiera nieaktywną część';
    end if;

    insert into pg_temp.tmp_build_items (
      machine_code,
      machine_qty,
      machine_definition_id,
      machine_name
    )
    values (
      v_machine_code,
      v_machine_qty,
      v_machine_id,
      v_machine_name
    );
  end loop;

  select pg_catalog.count(*)::integer
  into v_component_count
  from pg_temp.tmp_build_items bi
  join public.machine_bom_items mbi
    on mbi.company_id = p_company_id
   and mbi.machine_definition_id = bi.machine_definition_id;

  if v_component_count > 2000 then
    raise exception 'Produkcja zawiera zbyt wiele pozycji BOM';
  end if;

  for v_requirement in
    select *
    from pg_temp.tmp_build_items
    order by machine_definition_id
  loop
    for v_bom_item in
      select
        mbi.part_id,
        p.sku,
        p.name,
        mbi.qty::bigint as bom_qty
      from public.machine_bom_items mbi
      join public.parts p
        on p.id = mbi.part_id
       and p.company_id = mbi.company_id
      where mbi.company_id = p_company_id
        and mbi.machine_definition_id = v_requirement.machine_definition_id
        and p.is_active = true
      order by mbi.part_id
    loop
      if v_bom_item.bom_qty <= 0 then
        raise exception 'BOM zawiera nieprawidłową ilość';
      end if;
      if v_bom_item.bom_qty * v_requirement.machine_qty > 1000000000 then
        raise exception 'Zapotrzebowanie produkcji przekracza dozwolony limit';
      end if;

      insert into pg_temp.tmp_requirements as target (
        part_id,
        sku,
        name,
        needed_qty
      )
      values (
        v_bom_item.part_id,
        v_bom_item.sku,
        v_bom_item.name,
        v_bom_item.bom_qty * v_requirement.machine_qty
      )
      on conflict (part_id) do update
      set needed_qty = target.needed_qty + excluded.needed_qty;
    end loop;
  end loop;

  if exists (
    select 1
    from pg_temp.tmp_requirements r
    where r.needed_qty <= 0 or r.needed_qty > 1000000000
  ) then
    raise exception 'Łączne zapotrzebowanie produkcji przekracza dozwolony limit';
  end if;

  if v_manual_mode then
    for v_manual_alloc in
      select value
      from pg_catalog.jsonb_array_elements(p_manual_allocations)
    loop
      if pg_catalog.jsonb_typeof(v_manual_alloc) <> 'object' then
        raise exception 'Nieprawidłowa ręczna alokacja';
      end if;

      v_manual_lot_id := nullif(
        pg_catalog.btrim(coalesce(v_manual_alloc ->> 'lot_id', '')),
        ''
      )::uuid;
      v_manual_sku := pg_catalog.btrim(
        coalesce(v_manual_alloc ->> 'sku', '')
      );
      v_manual_qty := coalesce((v_manual_alloc ->> 'qty')::bigint, 0);

      if v_manual_lot_id is null or v_manual_sku = '' then
        raise exception 'Ręczna alokacja wymaga partii i SKU';
      end if;
      if v_manual_qty <= 0 or v_manual_qty > 1000000000 then
        raise exception 'Ilość ręcznej alokacji musi być dodatnią liczbą całkowitą';
      end if;
      if exists (
        select 1
        from pg_temp.tmp_manual_allocations ma
        where ma.lot_id = v_manual_lot_id
      ) then
        raise exception 'Ręczna alokacja zawiera zduplikowaną partię';
      end if;

      select r.part_id
      into v_manual_part_id
      from pg_temp.tmp_requirements r
      where pg_catalog.lower(pg_catalog.btrim(r.sku)) =
            pg_catalog.lower(v_manual_sku);

      if v_manual_part_id is null then
        raise exception 'Ręczna alokacja zawiera część spoza BOM';
      end if;

      insert into pg_temp.tmp_manual_allocations (
        lot_id,
        part_id,
        sku,
        qty
      )
      values (
        v_manual_lot_id,
        v_manual_part_id,
        v_manual_sku,
        v_manual_qty
      );
    end loop;

    for v_requirement in
      select *
      from pg_temp.tmp_requirements
      order by part_id
    loop
      select coalesce(pg_catalog.sum(ma.qty), 0)::bigint
      into v_allocated_sum
      from pg_temp.tmp_manual_allocations ma
      where ma.part_id = v_requirement.part_id;

      if v_allocated_sum <> v_requirement.needed_qty then
        raise exception 'Ręczna alokacja nie pokrywa dokładnego zapotrzebowania BOM';
      end if;
    end loop;

    for v_requirement in
      select *
      from pg_temp.tmp_manual_allocations
      order by lot_id
    loop
      select
        l.id,
        p.sku,
        p.name,
        l.qty_remaining,
        l.unit_price,
        l.received_at,
        coalesce(s.name, '-') as supplier_name
      into v_lot
      from public.inventory_lots l
      join public.parts p
        on p.id = l.part_id
       and p.company_id = l.company_id
      left join public.suppliers s
        on s.id = l.supplier_id
       and s.company_id = l.company_id
      where l.id = v_requirement.lot_id
        and l.company_id = p_company_id
        and l.part_id = v_requirement.part_id
      for update of l;

      if v_lot.id is null then
        raise exception 'Nie znaleziono partii ręcznej alokacji';
      end if;
      if v_lot.qty_remaining < v_requirement.qty then
        raise exception 'Partia nie ma wystarczającego stanu';
      end if;

      update public.inventory_lots
      set qty_remaining = qty_remaining - v_requirement.qty
      where id = v_lot.id
        and company_id = p_company_id
        and part_id = v_requirement.part_id;

      insert into pg_temp.tmp_consumption (
        part_id,
        sku,
        name,
        lot_id,
        qty,
        unassigned_qty,
        supplier,
        date_in,
        unit_price
      )
      values (
        v_requirement.part_id,
        v_lot.sku,
        v_lot.name,
        v_lot.id,
        v_requirement.qty,
        v_requirement.qty,
        v_lot.supplier_name,
        pg_catalog.to_char(v_lot.received_at at time zone 'UTC', 'YYYY-MM-DD'),
        coalesce(v_lot.unit_price, 0)
      );
    end loop;
  else
    for v_requirement in
      select *
      from pg_temp.tmp_requirements
      order by part_id
    loop
      v_remaining := v_requirement.needed_qty;

      for v_lot in
        select
          l.id,
          l.qty_remaining,
          l.unit_price,
          l.received_at,
          coalesce(s.name, '-') as supplier_name
        from public.inventory_lots l
        left join public.suppliers s
          on s.id = l.supplier_id
         and s.company_id = l.company_id
        where l.company_id = p_company_id
          and l.part_id = v_requirement.part_id
          and l.qty_remaining > 0
        order by l.received_at asc nulls last, l.id asc
        for update of l
      loop
        exit when v_remaining <= 0;
        v_taken := least(v_lot.qty_remaining::bigint, v_remaining);

        update public.inventory_lots
        set qty_remaining = qty_remaining - v_taken
        where id = v_lot.id
          and company_id = p_company_id
          and part_id = v_requirement.part_id;

        insert into pg_temp.tmp_consumption (
          part_id,
          sku,
          name,
          lot_id,
          qty,
          unassigned_qty,
          supplier,
          date_in,
          unit_price
        )
        values (
          v_requirement.part_id,
          v_requirement.sku,
          v_requirement.name,
          v_lot.id,
          v_taken,
          v_taken,
          v_lot.supplier_name,
          pg_catalog.to_char(v_lot.received_at at time zone 'UTC', 'YYYY-MM-DD'),
          coalesce(v_lot.unit_price, 0)
        );

        v_remaining := v_remaining - v_taken;
      end loop;

      if v_remaining > 0 then
        raise exception 'Brak wystarczającego stanu do produkcji';
      end if;
    end loop;
  end if;

  -- Assign aggregate lot consumption to individual build rows for accurate history.
  for v_requirement in
    select *
    from pg_temp.tmp_build_items
    order by build_item_id
  loop
    for v_bom_item in
      select
        mbi.part_id,
        p.sku,
        p.name,
        mbi.qty::bigint as bom_qty
      from public.machine_bom_items mbi
      join public.parts p
        on p.id = mbi.part_id
       and p.company_id = mbi.company_id
      where mbi.company_id = p_company_id
        and mbi.machine_definition_id = v_requirement.machine_definition_id
      order by mbi.part_id
    loop
      v_assign_remaining := v_bom_item.bom_qty * v_requirement.machine_qty;

      for v_consumption in
        select *
        from pg_temp.tmp_consumption c
        where c.part_id = v_bom_item.part_id
          and c.unassigned_qty > 0
        order by c.consumption_id
      loop
        exit when v_assign_remaining <= 0;
        v_taken := least(v_consumption.unassigned_qty, v_assign_remaining);

        insert into pg_temp.tmp_history_consumption (
          build_item_id,
          part_id,
          lot_id,
          qty,
          sku,
          name,
          supplier,
          date_in,
          unit_price
        )
        values (
          v_requirement.build_item_id,
          v_bom_item.part_id,
          v_consumption.lot_id,
          v_taken,
          v_bom_item.sku,
          v_bom_item.name,
          v_consumption.supplier,
          v_consumption.date_in,
          v_consumption.unit_price
        );

        update pg_temp.tmp_consumption
        set unassigned_qty = unassigned_qty - v_taken
        where consumption_id = v_consumption.consumption_id;

        v_assign_remaining := v_assign_remaining - v_taken;
      end loop;

      if v_assign_remaining > 0 then
        raise exception 'Nie udało się przypisać zużycia partii do historii produkcji';
      end if;
    end loop;
  end loop;

  if exists (
    select 1
    from pg_temp.tmp_consumption c
    where c.unassigned_qty <> 0
  ) then
    raise exception 'Historia produkcji nie rozliczyła całego zużycia';
  end if;

  for v_requirement in
    select *
    from pg_temp.tmp_build_items
    order by build_item_id
  loop
    if coalesce((
      select ms.qty
      from public.machine_stock ms
      where ms.company_id = p_company_id
        and ms.machine_definition_id = v_requirement.machine_definition_id
    ), 0) + v_requirement.machine_qty > 1000000000 then
      raise exception 'Stan wyprodukowanych maszyn przekracza dozwolony limit';
    end if;

    insert into public.machine_stock (
      company_id,
      machine_definition_id,
      qty
    )
    values (
      p_company_id,
      v_requirement.machine_definition_id,
      v_requirement.machine_qty
    )
    on conflict (company_id, machine_definition_id)
    do update set qty = public.machine_stock.qty + excluded.qty;
  end loop;

  for v_requirement in
    select *
    from pg_temp.tmp_build_items
    order by build_item_id
  loop
    v_parts_used := '[]'::jsonb;

    for v_bom_item in
      select
        mbi.part_id,
        p.sku,
        p.name,
        mbi.qty::bigint as bom_qty
      from public.machine_bom_items mbi
      join public.parts p
        on p.id = mbi.part_id
       and p.company_id = mbi.company_id
      where mbi.company_id = p_company_id
        and mbi.machine_definition_id = v_requirement.machine_definition_id
      order by mbi.part_id
    loop
      select coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'lot_id', hc.lot_id,
            'qty', hc.qty,
            'sku', hc.sku,
            'name', hc.name,
            'supplier', hc.supplier,
            'date_in', hc.date_in,
            'unit_price', hc.unit_price
          )
          order by hc.history_consumption_id
        ),
        '[]'::jsonb
      )
      into v_lots_used
      from pg_temp.tmp_history_consumption hc
      where hc.build_item_id = v_requirement.build_item_id
        and hc.part_id = v_bom_item.part_id;

      v_parts_used := v_parts_used || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'sku', v_bom_item.sku,
          'name', v_bom_item.name,
          'qty', v_bom_item.bom_qty * v_requirement.machine_qty,
          'lots', v_lots_used
        )
      );
    end loop;

    v_history_items := v_history_items || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', v_requirement.machine_code,
        'name', v_requirement.machine_name,
        'qty', v_requirement.machine_qty,
        'parts_used', v_parts_used
      )
    );
  end loop;

  insert into public.history_events (
    company_id,
    event_type,
    title,
    description,
    payload,
    created_by
  )
  values (
    p_company_id,
    'production_finalized',
    'Produkcja • ' || pg_catalog.jsonb_array_length(v_history_items) || ' poz.',
    'Wyprodukowano ' || (
      select coalesce(pg_catalog.sum(machine_qty), 0)::text
      from pg_temp.tmp_build_items
    ) || ' szt.',
    pg_catalog.jsonb_build_object(
      'dateISO', pg_catalog.to_char(p_build_date at time zone 'UTC', 'YYYY-MM-DD'),
      'items', v_history_items
    ),
    auth.uid()
  )
  returning id into v_history_event_id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'history_event_id', v_history_event_id,
    'build_items_count', (
      select pg_catalog.count(*)
      from pg_temp.tmp_build_items
    )
  );
end;
$$;

-- Mutation policies are no longer needed because authenticated users write
-- through the explicitly authorized SECURITY DEFINER RPC functions.
drop policy if exists companies_update_thresholds on public.companies;
drop policy if exists parts_insert_permission on public.parts;
drop policy if exists parts_update_permission on public.parts;
drop policy if exists suppliers_insert_permission on public.suppliers;
drop policy if exists suppliers_update_permission on public.suppliers;
drop policy if exists supplier_prices_insert_permission on public.supplier_part_prices;
drop policy if exists supplier_prices_update_permission on public.supplier_part_prices;
drop policy if exists supplier_prices_delete_permission on public.supplier_part_prices;
drop policy if exists machine_definitions_insert_permission on public.machine_definitions;
drop policy if exists machine_definitions_update_permission on public.machine_definitions;
drop policy if exists machine_bom_insert_permission on public.machine_bom_items;
drop policy if exists machine_bom_update_permission on public.machine_bom_items;
drop policy if exists machine_bom_delete_permission on public.machine_bom_items;

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    alter function public.set_updated_at() set search_path = '';
  end if;
  if to_regprocedure('public.set_company_role_permissions_updated_at()') is not null then
    alter function public.set_company_role_permissions_updated_at() set search_path = '';
  end if;
end;
$$;

revoke all on function public.save_company_thresholds(uuid,integer,integer,timestamp with time zone)
  from public, anon;
revoke all on function public.create_catalog_supplier(uuid,text)
  from public, anon;
revoke all on function public.set_catalog_part_active(uuid,text,boolean,timestamp with time zone)
  from public, anon;
revoke all on function public.set_catalog_supplier_active(uuid,text,boolean,timestamp with time zone)
  from public, anon;
revoke all on function public.set_machine_definition_active(uuid,text,boolean,timestamp with time zone)
  from public, anon;
revoke all on function public.save_catalog_part(uuid,text,text,text,boolean,integer,integer,timestamp with time zone,jsonb)
  from public, anon;
revoke all on function public.save_machine_definition(uuid,text,text,text,boolean,timestamp with time zone,jsonb)
  from public, anon;
revoke all on function public.save_supplier_prices(uuid,text,timestamp with time zone,jsonb)
  from public, anon;
revoke all on function public.update_company_member(uuid,text,boolean)
  from public, anon;
revoke all on function public.finalize_delivery(uuid,uuid,timestamp with time zone,jsonb,text)
  from public, anon;
revoke all on function public.apply_stock_adjustment(uuid,timestamp with time zone,jsonb)
  from public, anon;
revoke all on function public.finalize_production(uuid,timestamp with time zone,jsonb,jsonb)
  from public, anon;

grant execute on function public.save_company_thresholds(uuid,integer,integer,timestamp with time zone)
  to authenticated;
grant execute on function public.create_catalog_supplier(uuid,text)
  to authenticated;
grant execute on function public.set_catalog_part_active(uuid,text,boolean,timestamp with time zone)
  to authenticated;
grant execute on function public.set_catalog_supplier_active(uuid,text,boolean,timestamp with time zone)
  to authenticated;
grant execute on function public.set_machine_definition_active(uuid,text,boolean,timestamp with time zone)
  to authenticated;
grant execute on function public.save_catalog_part(uuid,text,text,text,boolean,integer,integer,timestamp with time zone,jsonb)
  to authenticated;
grant execute on function public.save_machine_definition(uuid,text,text,text,boolean,timestamp with time zone,jsonb)
  to authenticated;
grant execute on function public.save_supplier_prices(uuid,text,timestamp with time zone,jsonb)
  to authenticated;
grant execute on function public.update_company_member(uuid,text,boolean)
  to authenticated;
grant execute on function public.finalize_delivery(uuid,uuid,timestamp with time zone,jsonb,text)
  to authenticated;
grant execute on function public.apply_stock_adjustment(uuid,timestamp with time zone,jsonb)
  to authenticated;
grant execute on function public.finalize_production(uuid,timestamp with time zone,jsonb,jsonb)
  to authenticated;

revoke all on function public.provision_company_user(uuid,uuid,text,text,text,uuid)
  from public, anon, authenticated;
grant execute on function public.provision_company_user(uuid,uuid,text,text,text,uuid)
  to service_role;

commit;
