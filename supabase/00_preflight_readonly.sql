-- Read-only preflight for 20260729190000_backend_hardening.sql.
-- Every issue_count should be 0 before running the migration.

select 'duplicate_part_sku_case_insensitive' as check_name, pg_catalog.count(*)::bigint as issue_count
from (
  select company_id, pg_catalog.lower(pg_catalog.btrim(sku))
  from public.parts
  group by company_id, pg_catalog.lower(pg_catalog.btrim(sku))
  having pg_catalog.count(*) > 1
) q

union all

select 'duplicate_supplier_name_case_insensitive', pg_catalog.count(*)::bigint
from (
  select company_id, pg_catalog.lower(pg_catalog.btrim(name))
  from public.suppliers
  group by company_id, pg_catalog.lower(pg_catalog.btrim(name))
  having pg_catalog.count(*) > 1
) q

union all

select 'duplicate_machine_code_case_insensitive', pg_catalog.count(*)::bigint
from (
  select company_id, pg_catalog.lower(pg_catalog.btrim(code))
  from public.machine_definitions
  group by company_id, pg_catalog.lower(pg_catalog.btrim(code))
  having pg_catalog.count(*) > 1
) q

union all

select 'duplicate_profile_email_case_insensitive', pg_catalog.count(*)::bigint
from (
  select pg_catalog.lower(pg_catalog.btrim(email))
  from public.profiles
  where email is not null
  group by pg_catalog.lower(pg_catalog.btrim(email))
  having pg_catalog.count(*) > 1
) q

union all

select 'fractional_inventory_quantities', pg_catalog.count(*)::bigint
from public.inventory_lots
where qty_initial <> pg_catalog.trunc(qty_initial)
   or qty_remaining <> pg_catalog.trunc(qty_remaining)

union all

select 'fractional_bom_quantities', pg_catalog.count(*)::bigint
from public.machine_bom_items
where qty <> pg_catalog.trunc(qty)

union all

select 'fractional_machine_stock', pg_catalog.count(*)::bigint
from public.machine_stock
where qty <> pg_catalog.trunc(qty)

union all

select 'fractional_part_thresholds', pg_catalog.count(*)::bigint
from public.parts
where (warning_qty is not null and warning_qty <> pg_catalog.trunc(warning_qty))
   or (critical_qty is not null and critical_qty <> pg_catalog.trunc(critical_qty))

union all

select 'invalid_company_text', pg_catalog.count(*)::bigint
from public.companies
where pg_catalog.char_length(pg_catalog.btrim(name)) not between 1 and 200
   or (
     slug is not null
     and pg_catalog.char_length(pg_catalog.btrim(slug)) not between 1 and 100
   )

union all

select 'invalid_profile_email', pg_catalog.count(*)::bigint
from public.profiles
where (
  email is null
  or pg_catalog.char_length(pg_catalog.btrim(email)) between 3 and 254
) is false

union all

select 'invalid_profile_full_name', pg_catalog.count(*)::bigint
from public.profiles
where (
  full_name is null
  or pg_catalog.char_length(pg_catalog.btrim(full_name)) between 1 and 150
) is false

union all

select 'invalid_part_identifiers_or_lengths', pg_catalog.count(*)::bigint
from public.parts
where pg_catalog.btrim(sku) !~ '^[A-Za-z0-9_-]{1,50}$'
   or pg_catalog.char_length(pg_catalog.btrim(name)) not between 1 and 200
   or (notes is not null and pg_catalog.char_length(notes) > 5000)

union all

select 'invalid_machine_identifiers_or_lengths', pg_catalog.count(*)::bigint
from public.machine_definitions
where pg_catalog.btrim(code) !~ '^[A-Za-z0-9_-]{1,50}$'
   or pg_catalog.char_length(pg_catalog.btrim(name)) not between 1 and 200
   or (notes is not null and pg_catalog.char_length(notes) > 5000)

union all

select 'invalid_supplier_text', pg_catalog.count(*)::bigint
from public.suppliers
where pg_catalog.char_length(pg_catalog.btrim(name)) not between 1 and 200
   or (
     email is not null
     and pg_catalog.char_length(pg_catalog.btrim(email)) not between 3 and 254
   )
   or (
     phone is not null
     and pg_catalog.char_length(pg_catalog.btrim(phone)) > 50
   )
   or (notes is not null and pg_catalog.char_length(notes) > 5000)

union all

select 'invalid_inventory_lot_bounds', pg_catalog.count(*)::bigint
from public.inventory_lots
where qty_initial > 1000000000
   or qty_remaining > 1000000000
   or (unit_price is not null and unit_price > 999999999.99)
   or pg_catalog.char_length(currency) not between 1 and 10
   or (notes is not null and pg_catalog.char_length(notes) > 5000)

union all

select 'invalid_bom_bounds', pg_catalog.count(*)::bigint
from public.machine_bom_items
where qty > 1000000000
   or (notes is not null and pg_catalog.char_length(notes) > 5000)

union all

select 'invalid_machine_stock_bounds', pg_catalog.count(*)::bigint
from public.machine_stock
where qty > 1000000000

union all

select 'invalid_supplier_price_bounds', pg_catalog.count(*)::bigint
from public.supplier_part_prices
where price > 999999999.99
   or pg_catalog.char_length(currency) not between 1 and 10

union all

select 'invalid_history_event_bounds', pg_catalog.count(*)::bigint
from public.history_events
where pg_catalog.char_length(pg_catalog.btrim(title)) not between 1 and 300
   or (
     description is not null
     and pg_catalog.char_length(description) > 2000
   )
   or pg_catalog.octet_length(payload::text) > 1048576

order by check_name;
