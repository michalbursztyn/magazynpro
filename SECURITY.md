# Security policy

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability, leaked
credential or tenant-isolation problem. Use GitHub's private vulnerability
reporting feature for this repository when available, or contact the repository
owner privately through the contact information on their GitHub profile.

Include:

- the affected flow or file,
- clear reproduction steps using test data,
- the expected and observed result,
- the potential impact,
- any suggested mitigation.

Do not include passwords, access tokens, `service_role` keys, personal data or
production database exports in the report.

## Security model

- The UI is not treated as an authorization boundary.
- Company access is enforced by active profile and membership checks.
- Row Level Security protects business-table reads.
- Protected writes use validated PostgreSQL RPC functions.
- Multi-record warehouse operations are transactional.
- The Supabase `service_role` key exists only in the Edge Function environment.
- User-facing errors exclude raw backend details.

## Local security checks

Before publishing a change:

```powershell
node --check app-core.js
node --check app-ui.js
node --check app-supabase.js
node --check app-init.js
node --experimental-strip-types --check supabase/functions/create-company-worker/index.ts
node --test tests/regression.test.js
```

Database migrations and Edge Functions must be deployed manually and only
after the read-only preflight described in
[`supabase/WDROZENIE.md`](supabase/WDROZENIE.md).

## Supported version

Security fixes target the current `main` branch. Historical uploaded versions
and old deployments are not supported.
