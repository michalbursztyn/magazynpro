# Contributing

Magazyn PRO is maintained around a specific manufacturing workflow. Bug reports
and focused pull requests are welcome. For a change that affects the database
schema, authorization model or warehouse rules, please open an issue first so
the operational impact can be discussed before implementation.

## Local development

The application has no build step. Serve the repository over HTTP:

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Keep the browser script order from `index.html`: `app-core.js`, `app-ui.js`,
`app-supabase.js`, then `app-init.js`. These files share a small public surface
through `window`, so renaming a function or changing a payload requires checking
all of its callers.

## Backend safety

- Never commit passwords, session tokens, `service_role` keys, database dumps or
  real company data.
- Treat role checks in the UI as a convenience, not as authorization. Access
  must also be enforced by RLS, an RPC or an Edge Function.
- Scope company data through verified membership. Do not trust a `company_id`
  supplied only by the browser.
- Keep multi-record warehouse operations transactional and preserve the
  existing conflict checks.
- Do not deploy migrations or Edge Functions as part of a pull request. State
  any required Supabase step explicitly in the PR description.

## Checks

Run the dependency-free checks with Node.js 22:

```powershell
node --check app-core.js
node --check app-ui.js
node --check app-supabase.js
node --check app-init.js
node --experimental-strip-types --check supabase/functions/create-company-worker/index.ts
node --test tests/regression.test.js
```

For interface changes, also test the affected flow through a local HTTP server
at desktop and phone widths. Exercise the failure path as well as the successful
path, especially for authentication and warehouse writes.

## Pull requests

Keep a pull request focused on one concern. Explain the behavior that changed,
why it changed, how it was verified and whether any manual backend
configuration is required. If a relevant scenario could not be tested, list it
instead of assuming it works.
