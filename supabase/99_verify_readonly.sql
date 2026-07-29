-- Read-only verification after applying 20260729190000_backend_hardening.sql.
-- Every row should have ok = true.

with relevant_tables(table_name) as (
  values
    ('companies'),
    ('company_members'),
    ('company_role_permissions'),
    ('profiles'),
    ('parts'),
    ('suppliers'),
    ('supplier_part_prices'),
    ('machine_definitions'),
    ('machine_bom_items'),
    ('inventory_lots'),
    ('machine_stock'),
    ('history_events')
),
required_rpcs(function_name) as (
  values
    ('save_company_thresholds'),
    ('create_catalog_supplier'),
    ('set_catalog_part_active'),
    ('set_catalog_supplier_active'),
    ('set_machine_definition_active'),
    ('save_catalog_part'),
    ('save_machine_definition'),
    ('save_supplier_prices'),
    ('update_company_member'),
    ('finalize_delivery'),
    ('apply_stock_adjustment'),
    ('finalize_production')
)
select
  'all_relevant_tables_have_rls' as check_name,
  pg_catalog.count(*) = 12
    and pg_catalog.bool_and(c.relrowsecurity) as ok,
  pg_catalog.count(*)::text || ' tables checked' as details
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
join relevant_tables rt on rt.table_name = c.relname
where n.nspname = 'public'
  and c.relkind in ('r', 'p')

union all

select
  'anon_has_no_table_privileges',
  not pg_catalog.bool_or(
    pg_catalog.has_table_privilege('anon', format('public.%I', rt.table_name), 'SELECT')
    or pg_catalog.has_table_privilege('anon', format('public.%I', rt.table_name), 'INSERT')
    or pg_catalog.has_table_privilege('anon', format('public.%I', rt.table_name), 'UPDATE')
    or pg_catalog.has_table_privilege('anon', format('public.%I', rt.table_name), 'DELETE')
  ),
  'checked SELECT/INSERT/UPDATE/DELETE'
from relevant_tables rt

union all

select
  'browser_cannot_mutate_protected_tables_directly',
  not pg_catalog.bool_or(
    pg_catalog.has_table_privilege(
      'authenticated',
      format('public.%I', rt.table_name),
      'INSERT'
    )
    or pg_catalog.has_table_privilege(
      'authenticated',
      format('public.%I', rt.table_name),
      'UPDATE'
    )
    or pg_catalog.has_table_privilege(
      'authenticated',
      format('public.%I', rt.table_name),
      'DELETE'
    )
  ),
  'companies, profiles, company_members and catalog tables'
from relevant_tables rt
where rt.table_name in (
  'companies',
  'profiles',
  'company_members',
  'parts',
  'suppliers',
  'supplier_part_prices',
  'machine_definitions',
  'machine_bom_items'
)

union all

select
  'four_private_authorization_helpers_exist',
  pg_catalog.count(*) = 4
    and pg_catalog.bool_and(p.prosecdef)
    and pg_catalog.bool_and(
      exists (
        select 1
        from pg_catalog.unnest(p.proconfig) setting
        where setting like 'search_path=%'
          and setting not like '%public%'
      )
    ),
  pg_catalog.count(*)::text || ' helpers checked'
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private'
  and p.proname in (
    'is_active_member_of_company',
    'is_owner_of_company',
    'has_tab_permission',
    'has_feature_permission'
  )

union all

select
  'required_rpcs_exist_and_are_auth_only',
  pg_catalog.count(*) = 12
    and pg_catalog.bool_and(
      pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
    ),
  pg_catalog.count(*)::text || ' RPCs checked'
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
join required_rpcs rr on rr.function_name = p.proname
where n.nspname = 'public'

union all

select
  'provision_rpc_is_service_role_only',
  pg_catalog.count(*) = 1
    and pg_catalog.bool_and(
      pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
      and not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
    ),
  pg_catalog.count(*)::text || ' function checked'
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'provision_company_user'

union all

select
  'case_insensitive_unique_indexes_exist',
  pg_catalog.count(*) = 4,
  pg_catalog.count(*)::text || ' indexes found'
from pg_catalog.pg_indexes i
where i.schemaname = 'public'
  and i.indexname in (
    'parts_company_sku_ci_key',
    'suppliers_company_name_ci_key',
    'machine_definitions_company_code_ci_key',
    'profiles_email_ci_key'
  )

union all

select
  'profiles_self_update_policy_removed',
  pg_catalog.count(*) = 0,
  pg_catalog.count(*)::text || ' matching policies found'
from pg_catalog.pg_policies p
where p.schemaname = 'public'
  and p.tablename = 'profiles'
  and p.cmd = 'UPDATE'

order by check_name;
