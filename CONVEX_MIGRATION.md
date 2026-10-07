# MongoDB → Convex migration (Smart System)

Self-managed external Convex deployment: `fearless-ostrich-878`
(`EXPO_PUBLIC_CONVEX_URL=https://fearless-ostrich-878.eu-west-1.convex.cloud`).

The existing Expo + **FastAPI + MongoDB** stack is UNCHANGED and remains the running,
Emergent-deployable backend. Convex has been set up alongside it and proven end-to-end.

## What is in place (done & verified)

1. **Schema** — `frontend/convex/schema.ts` translates all 29 Mongo collections into Convex
   tables with indexes. Original string ids (`org_id`, `user_id`, `customer_id`, `product_id`, …)
   are kept as indexed fields so relationships survive the migration unchanged.
   `schemaValidation: false` lets the bulk import tolerate field drift.
   → Deployed: all 29 tables + indexes created on the Convex deployment.

2. **CRUD functions** — `frontend/convex/`
   - `lib.ts` — shared helpers: bearer-token auth (`getUser`/`require`, same roles as FastAPI:
     OWNER / STAFF / AGENT / ANY_ORG / DEV), counters (`nextNo`), stock-movement + price-history
     logging, `orgCustomer`, `priceFor`, `distInv`, `geoFields`, `sumBy`.
   - `products.ts` — list / create / update / remove (OWNER-gated writes, ANY_ORG reads).
   - `customers.ts` — list / create / update / reminded / statement (agent-scoped like FastAPI).
   - `sales.ts` — list (ANY_ORG, agent-scoped) + create (AGENT): inventory check, price lists,
     discounts, stock movements, customer balance, invoice numbering — mirrors server.py exactly.
   - `collections.ts` — list + create (ANY_ORG): debt check, balance decrement, receipt numbering.
   - `stats.ts` — `overview` (ANY_ORG dashboard), `agents` (STAFF), `leaderboard` (STAFF, monthly).
   - `returns.ts` — sales-returns (list/create, stock + customer balance) and warehouse-returns
     (list/create/accept/reject, distributor→warehouse flow with owner confirmation).
   - `deliveries.ts` — deliveries (list/create/confirm/reject), distributor stock top-ups via
     stock-requests (list/create/fulfill/reject), plus `myInventory` + `distributorsInventory`.
   - `employees.ts` — employees list, invite (EMP- codes), deleteInvite, remove, plus `activate`
     (redeem employee/license code) and `trial`.
   - `tracking.ts` — `postLocation` (GPS ping) + `agents` + `trail` for the live owner agent map.
   - `auth.ts` — `syncSession`: mirrors the already-authenticated FastAPI session (token+user+org)
     into Convex so the SAME bearer token authenticates Convex functions. Does not change auth.
   - `migrate.ts` — `importBatch` / `clearTable` / `countTable` (secret-guarded dev utilities).
   Verified via `npx convex run` + `scripts/verify_convex.sh` and `scripts/verify_convex2.mjs`
   (23/23 end-to-end assertions): deliver→confirm→inventory, sell→inventory down, sales-return
   back into stock, warehouse-return→accept→warehouse stock up, stock-request→fulfil creates a
   delivery, invite→activate, GPS ping→owner map + trail. Role gates reject (agent→403, bad
   token→401). Sale/collection/overview/leaderboard numbers match FastAPI exactly.

3. **Migration script** — `scripts/migrate_mongo_to_convex.mjs` (+ `scripts/package.json`).
   Reads every Mongo collection and bulk-inserts into Convex via `migrate:importBatch`, then
   VERIFIES per-table record counts (Mongo vs Convex) and exits non-zero on mismatch.
   ✓ Run against the live Mongo in this environment: migrated the real data (2 users + the
   "Anmira" organization); all count checks passed.

   Run it:
   ```
   cd /app/scripts && npm install
   MONGO_URL="mongodb://localhost:27017" DB_NAME="test_database" \
   CONVEX_URL="https://fearless-ostrich-878.eu-west-1.convex.cloud" \
   CLEAR=1 node migrate_mongo_to_convex.mjs
   ```

4. **Frontend Convex hooks** — `frontend/src/convex.ts` (client), `ConvexProvider` in
   `app/_layout.tsx`, session token from `src/auth.tsx`. `app/convex-check.tsx` is now a LIVE
   Convex dashboard: it mirrors the current session (`auth.syncSession`), then renders
   `stats.overview` + `stats.leaderboard` + `products.list` via `useQuery` and writes via
   `useMutation` — reachable from Owner → الإدارة → ملف المؤسسة → "فحص Convex (تجريبي)".
   Verified in the web preview as the real Anmira owner: dashboard renders live and a product
   added from the UI appeared instantly.

## Deploying Convex changes
```
cd /app/frontend
CONVEX_DEPLOY_KEY='dev:fearless-ostrich-878|...' CONVEX_TMPDIR=/app/frontend/.convex-tmp \
  npx convex dev --once
```
(The deploy key is stored in `backend/.env` as `CONVEX_DEPLOY_KEY`; it is a secret — never bundle it
into the client. Only `EXPO_PUBLIC_CONVEX_URL` is safe for the app.)

## Remaining work for a FULL cutover (not yet done)
Porting the rest of the FastAPI endpoints to Convex functions, then switching the production
screens off FastAPI **all at once**:
- payment-vouchers, purchases, purchase-returns, void-sale
- routes + optimize
- dev (licenses/orgs/plans/payment/upgrades), org profile/logo (logo needs object storage)
- customer-types/price-lists, notifications read/mark, consent/legal, deletion requests
- app-version/update gate, stats: alerts / finance / full reports
- offline queue/idempotency semantics (src/offline.ts / offlineActions.ts)

Already ported & live: products, customers, sales, collections, stats.overview/agents/leaderboard,
**sales-returns, warehouse-returns, deliveries, stock-requests, distributor inventory, employees +
invitations + activate/trial, GPS tracking (agent map + trail)**, plus `auth.syncSession` so the
real session authenticates Convex. The `app/convex-check.tsx` live dashboard now surfaces the
owner overview, leaderboard, products (add/delete), live agent map, distributor inventory, recent
deliveries and employees — all via Convex `useQuery`/`useMutation`.

⚠️ Important: switching screens one-by-one breaks cross-feature flows (e.g. a product created in
Convex can't be delivered by the FastAPI delivery endpoint). A clean cutover must port all functions
first, then flip the whole frontend data layer together. Until then the app keeps running on
FastAPI + MongoDB (unchanged).
