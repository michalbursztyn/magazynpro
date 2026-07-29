# Engineering decisions

This document records why Magazyn PRO has its current shape. The choices are
practical rather than universal: they fit a small manufacturing business, a
compact codebase and a system that must remain understandable without a large
operations team.

## Start with the workflow, not the stack

I started Magazyn PRO around a warehouse process I could observe directly:
parts arrive in identifiable lots, machines consume a defined BOM, and a later
stock discrepancy must be traceable to a person and an operation. That is why
deliveries, production, adjustments and history are first-class flows rather
than a generic set of CRUD screens.

## A browser application without a build step

The frontend uses HTML, CSS and four JavaScript files loaded in a fixed order.
This keeps local setup and static hosting simple, and it makes the deployed
artifact easy to inspect. It also has a cost: dependencies between modules are
manual and the shared `window` API needs discipline. If the interface grows
substantially, moving to native ES modules would be the first structural change
I would consider.

## Supabase as the backend

Supabase combines authentication, PostgreSQL, Row Level Security, database
functions and an Edge Function without requiring a separate application server.
That is a good fit for the size of this system. The trade-off is deliberate
coupling to PostgreSQL policies and RPCs, so the SQL migration and read-only
audit are kept in the repository alongside the browser code.

## The browser is not the security boundary

The interface hides actions that a role cannot use, but this is only user
experience. Membership, role and `company_id` are checked again in RLS, RPCs or
the user-provisioning Edge Function. In particular, a company identifier sent
by the browser is never enough to authorize access.

The service-role key exists only inside the Edge Function. The checked-in
browser key is publishable by design and does not replace database policy
enforcement.

## Transactional warehouse operations

A delivery, production run or stock adjustment can touch several records. A
partial result would be worse than a visible failure, so protected writes use
database functions and transactions. Company-level serialization and version
checks prevent two stale screens from silently overwriting each other.

## FIFO with exact lot history

Production defaults to FIFO consumption because it matches the warehouse
workflow, but the selected lots are stored explicitly. This gives the operator
a predictable default and leaves enough detail to reconstruct where consumed
stock came from. Manual lot allocation remains available when the physical
warehouse requires it.

## Archive instead of delete

Catalog records can be referenced by historical operations. Archiving keeps the
active lists clean without breaking that history, so physical deletion is not
the normal application flow.

## No public demo account

The hosted interface is the real application entry point, not a separate mock.
Publishing shared credentials would create avoidable access and cleanup risks.
Screenshots use synthetic data so the product can still be reviewed without
exposing a company account.

## Current boundary

The system is in pre-production validation. Before it stores real company data,
I plan to separate test and production Supabase projects, repeat the
cross-company and failure-path checks against the production configuration, and
add automated browser coverage for the main workflows. That separation is an
operational step, not something the public frontend repository should hide or
simulate.
