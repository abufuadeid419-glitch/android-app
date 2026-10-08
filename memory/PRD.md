# Smart System (النظام الذكي) — Mobile (Expo) PRD

## Original problem
"clone this mobile app: https://github.com/abufuadeid419-glitch/api-verfy.git" (earlier: number-verifications.git)

## User choices (this clone session, 2026-06)
- Full clone — all 4 roles (Developer, Owner, Accountant, Field Agent) and all screens.
- Login: phone + OTP via the user's own Bird account (key provided); keep the original flow.
- Database: connect to the user's EXISTING Convex deployment `fearless-ostrich-878`
  (URL + deploy key provided) with its real data — do NOT wipe/reseed.
- Arabic RTL (like the original).
- Developer (super-admin) phone +963984644375 — must NOT appear in the codebase
  (stored only in Convex env var `DEVELOPER_PHONES`).

## What this app is
Arabic RTL sales & distribution ERP. Roles: DEVELOPER, OWNER, ACCOUNTANT, FIELD_AGENT (distributor).
Auth: phone number + 6-digit OTP (Bird SMS, WhatsApp fallback). 30-day bearer sessions.
Activation by license code (LIC-), employee code (EMP-), or a self-service trial.

## Architecture (as restored on this platform)
- Backend + DB: **Convex** (external, user-managed deployment `fearless-ostrich-878`).
  The entire REST surface (`/api/...`) is served by `convex/http.ts` from the deployment's
  `.site` domain; all data, auth, OTP and file (logo) storage live in Convex.
  `convex/` source: schema.ts, lib.ts, edge.ts (auth/OTP/logo), extra.ts (dev console + misc),
  products/customers/sales/collections/returns/deliveries/employees/tracking/stats/
  notifications/routes/vouchers/purchases/targets/crons.
- FastAPI (`backend/server.py`) is a DB-less stub kept only so the platform supervisor has a
  healthy backend service; the app does not use it.
- Frontend: Expo Router. `src/api.ts` calls `EXPO_PUBLIC_CONVEX_SITE_URL/api{path}`. Root gate in
  `app/_layout.tsx` routes to login / consent / activate / blocked / dev / owner / acct / dist.
  Role tab groups via `src/RoleTabs.tsx`. UI kit `src/ui.tsx`. Cairo font, moss-green theme, forced RTL.
- Env:
  - frontend/.env: EXPO_PUBLIC_CONVEX_URL, EXPO_PUBLIC_CONVEX_SITE_URL (+ protected packager vars).
  - backend/.env: CONVEX_URL, CONVEX_DEPLOY_KEY (secret; server-side only).
  - Convex deployment env: BIRD_API_KEY, BIRD_BASE_URL, BIRD_WHATSAPP_LANGUAGE, DEVELOPER_PHONES,
    OTP_PEPPER (all already set on `fearless-ostrich-878`).

## Clone / restore done (2026-06, this session)
- Copied the full repo frontend (app/, src/, convex/, constants/, assets/, scripts/, app.json,
  package.json, tsconfig) and the backend stub into /app; preserved protected .env packager vars.
- Pointed frontend at the live Convex deployment; `yarn install` (adds `convex` client etc).
- Verified the deployment is live and fully configured (Bird key, DEVELOPER_PHONES=+963984644375,
  OTP_PEPPER all present via `npx convex env list`).
- Verified end-to-end:
  - Convex HTTP root `GET /api/` → "Smart System API (Convex)"; `GET /api/auth/me` (no token) → 401.
  - `POST /api/auth/otp/request` (bad phone) → Arabic 400; `/auth/otp/verify` (no request) → Arabic error.
  - Login screen renders (Arabic RTL, +963 default, warehouse hero).
  - Seeded isolated test org `org_test_1` (edge:seedTestAccounts); owner dashboard renders live
    (KPIs, onboarding, alerts, bottom tabs) with `test_token_owner`. Dev/acct/agent tokens auth OK.

## Feature set (inherited, all implemented in Convex)
- Developer: stats, licenses, orgs (extend/suspend/reactivate), plans, payment settings, upgrade
  approvals, app-version/update gate, monitoring, deletion review.
- Owner: KPIs, low-stock alerts, agent performance + leaderboard, products CRUD, purchases,
  deliveries, employees (invite by code), org profile/logo, GPS agent map, route planner,
  customer price lists, reports, sales targets, trial countdown, Pro upsell.
- Distributor (field agent): own inventory, new sale (cash/credit, discounts), collections,
  sales/warehouse returns, payment vouchers, customers CRUD, today's route, offline-first sync,
  PDF/80mm Bluetooth receipts, WhatsApp debt reminders.
- Accountant: overview, invoices/collections/returns, debts with collect, customer statements.
- Blocked screen for suspended/expired orgs; consent gate; legal screens.

## Known constraints
- OTP login sends real (paid) Bird SMS/WhatsApp → cannot be automated; validated via seeded tokens.
- Bluetooth thermal printing & background GPS require a native build (not Expo Go / web preview).
- Maps render on native devices; web preview shows list fallbacks.

## Backlog / next (P1/P2)
- P1: seed a demo org with sample products/customers/sales for quick exploration (on request).
- P1: review SMS deliverability to Syria in the Bird workspace (external; WhatsApp is the working path).
- P2: push notifications (Emergent managed) — needs google-services.json + a native build.

## Bug fix (2026-06): phone verification surfaces real delivery status
- Reported: "make sure phone verification working correctly and real verification code."
- Root cause (EXTERNAL Bird account): SMS to Syria is disabled (E12020 SMSDestinationNotEnabled)
  and the WhatsApp fallback is REJECTED by Bird ~3s after a 202 "accepted" with
  last_error code `price_not_found` ("whatsapp pricing unavailable"). The old code polled the
  WhatsApp status only once at 2.5s, racing the later rejection, so requestOtp returned a false
  {ok:true, channel:"whatsapp"} while no code ever arrived.
- Fix (convex/edge.ts, deployed to fearless-ostrich-878): sendWhatsApp now polls the message
  status up to 5×1.5s (~7.5s), returns failure on rejected/failed and success only once Bird
  reports sent/delivered/read; requestOtp returns a precise Arabic error when the body shows a
  pricing/balance block. No more false "code sent".
- Verified by testing_agent (iteration_1): backend 7/7 (+963 request → 400 Arabic WhatsApp/Bird
  error; bad phone → 400; verify guard; seeded-token auth + 401) and the login UI shows the error
  and stays on phone-step.
- STILL REQUIRED (user action in Bird, cannot be fixed in code) for a real code to be delivered:
  (a) enable the destination country (Syria) in Bird → SMS destination settings, and/or
  (b) set up WhatsApp pricing/billing (payment method + balance, approved WA Business sender) so
  WhatsApp is not rejected with price_not_found. Once either is enabled, codes send with no code change.

## Enhancement (2026-06): friendlier resend copy + one-tap WhatsApp fallback on failure
- app/login.tsx: phone-step now shows a one-tap WhatsApp retry button (testID login-whatsapp-retry,
  calls requestOtp(phone,"whatsapp")) whenever a send attempt errors. Resend countdown copy changed
  to "يمكنك إعادة الإرسال خلال {n} ثانية". Frontend-only; verified via screenshot (button appears
  after a failed +963 send; error + retry button render on phone-step).

## Features (2026-06): auto-WhatsApp fallback, Trusted Devices, invite QR
- Auto WhatsApp fallback (convex/edge.ts sendSms): SMS now polls Bird delivery status (4×1.2s); an
  accepted-then-rejected SMS is treated as failure so requestOtp auto-sends WhatsApp with no extra tap.
- Trusted Devices: sessions slide to +30d and record device/platform on every app open via a new
  POST /api/auth/touch (convex/sessions.ts touch). GET /api/auth/sessions lists devices (device_id,
  device, platform, last_seen_at, current — never the raw token); DELETE /api/auth/sessions/:id revokes.
  user_sessions schema gained device_id/device/platform/last_seen_at (all optional). openSession stamps
  device_id. Frontend: src/device.ts label helper; src/auth.tsx calls /auth/touch on startup + after
  verify; AccountButton shows a "الأجهزة الموثوقة" card with current-device badge + per-device revoke.
- Invite QR: OwnerMore InviteSheet renders a scannable QR (react-native-qrcode-svg) of the EMP- code
  plus a copy button; app/activate.tsx adds a "مسح رمز QR" button opening an expo-camera CameraView QR
  scanner (permission handled per contract: request → settings fallback) that auto-fills and activates.
  Packages added: expo-camera, react-native-svg, react-native-qrcode-svg, expo-device, expo-clipboard.
  app.json: NSCameraUsageDescription, android CAMERA permission, expo-camera plugin.
- Verified by testing_agent (iteration_2): 14/14 backend + frontend (trusted-devices card, invite QR,
  scan button). QR camera scanning works only on a real device / Expo Go, not web preview.

## Feature (2026-06): share invite via WhatsApp + import QR from gallery
- Share invite (src/screens/OwnerMore.tsx InviteSheet): after creating an employee code, a composed
  white card (app name + QR + EMP code + instruction) is captured with react-native-view-shot
  (captureRef) and shared via expo-sharing (share-invite-whatsapp button) so the owner sends the QR
  image + code in one tap; on web it falls back to a wa.me text link. Copy button retained.
- Import QR from gallery (app/activate.tsx): new import-qr-button uses expo-image-picker
  (launchImageLibraryAsync {mediaTypes:['images']}) + expo-camera scanFromURLAsync(uri,['qr']) to decode
  a QR screenshot/photo and auto-activate; sits beside the existing camera scan-qr-button. Arabic toasts
  for no-QR-found / unreadable image.
- Packages already present: react-native-view-shot, expo-sharing, expo-image-picker, expo-camera.
- Native-only (share sheet, camera scan, gallery decode) — work in Expo Go / builds, not web preview.
- Verified by testing_agent (iteration_3): 14/14 backend + frontend; share button renders and web-tap
  does not crash; activate scan+import buttons + importQr handler confirmed in source.


## Clone session 2026-10 (api-verfy.git)
- Full exact clone copied into /app, connected to Convex `fearless-ostrich-878` (URL + deploy key in env).
- Restored missing `app/dist/` (field-agent tabs), which the repo's `.gitignore` had excluded (taken from number-verifications.git); added gitignore negations.
- OTP SMS now goes through **SMS Gateway for Android** (api.sms-gate.app, Basic auth from Convex env SMS_GATE_USERNAME / SMS_GATE_PASSWORD). SMS only, with clear Arabic errors; Bird/WhatsApp removed from the send path and the WhatsApp buttons removed from login. Deployed to Convex.
- Verified: gateway credentials valid (device samsung/a17xx registered); a real send reached the device but failed with "No SIMs found", so the gateway phone needs an active SIM. All 4 role dashboards render from seeded tokens.

## Next
- P0 (user): insert an active SIM in the gateway phone and keep it online.
- P1: demo data seed; P2: resizeMode deprecation warning (expo-image).

## 2026-10 — Daily SMS summary + global keyboard handling
- Daily SMS summary (convex/dailySms.ts): cron daily 18:00 UTC (21:00 Syria) sends each active org owner today's sales (count/total), collections and new debts via SMS Gateway. Per-org opt-out `daily_sms`. Routes: GET/PUT /api/org/daily-sms, POST /api/org/daily-sms/test. Owner UI: Org settings → "ملخص SMS اليومي" (switch, preview, send-now).
- Keyboard: reusable `src/components/KeyboardScreen.tsx` (KeyboardAwareScrollView + KeyboardStickyView footer; tab-bar aware). Login rebuilt on it (collapsing hero, error + CTA in sticky footer); NewSale and Activate use it; `Sheet` wrapped in KeyboardAvoidingView so sheet footers stay above the keyboard.
- Tested (iteration_2): all green.

## 2026-10 — Maps without Google Maps API
- All maps use Leaflet + Esri World Street Map / World Imagery (+ labels for hybrid) tiles — no API key. New `src/components/LeafletMap.tsx` (WebView) / `.web.tsx` (iframe) and generic `leafletHtml()` in `src/maps.ts`.
- AgentsMap, RouteMap, AgentMapSheet live view (streets/satellite/hybrid) and TrailMap migrated; agent pin click opens the agent sheet (postMessage). Removed `react-native-maps` and GoogleMapEmbed. "Open"/"directions" buttons still hand off to the phone's maps app via plain keyless links.
- Tested (iteration_3): pass; CARTO watermark issue fixed by switching streets to Esri.
