# Multi-Tenant SaaS Migration Plan

Status: **approved direction** (owner chose SaaS over single-tenant product, 2026-07).
This document is the architectural roadmap; phases ship independently and each keeps the
existing single-tenant deployment working unchanged.

## 1. Goal

One central Kontext deployment, operated by us, hosting many independent businesses
("tenants"). Each tenant connects its own Facebook page / WhatsApp number / Telegram bot,
manages its own inventory and knowledge base, sees only its own data, and pays a
subscription. All three channels stay at feature parity.

## 2. Tenancy model decision

**Chosen: shared schema with a `tenant_id` column + Postgres Row-Level Security (RLS).**

Considered alternatives:

| Model | Verdict |
|---|---|
| Schema-per-tenant (`SET search_path`) | Tempting because existing raw-SQL queries wouldn't need edits, but Alembic migrations across N schemas, pgvector index duplication per tenant, and connection-pool `search_path` juggling with asyncpg make it operationally fragile at the 100s-of-tenants scale we want. |
| Database-per-tenant | Maximum isolation, but per-tenant Postgres overhead kills the economics of small BD merchants paying ~2,000 BDT/mo. |
| `tenant_id` column + RLS | One migration path, one set of indexes, RLS gives defense-in-depth (a forgotten `WHERE tenant_id` filter cannot leak cross-tenant data because the DB session's `app.tenant_id` setting is enforced by policy). Standard, boring, correct. |

## 3. Target architecture

### 3.1 New tables
- `tenants(id, slug, name, status[active|suspended|trial], plan, created_at)`
- `tenant_channels(id, tenant_id FK, platform[facebook|whatsapp|instagram|telegram], channel_key, credentials JSONB encrypted, active)`
  - `channel_key` is the webhook-routing identity: FB **page id**, WhatsApp **phone_number_id**, Telegram **bot token hash**. Unique index on `(platform, channel_key)`.
- `tenant_settings(tenant_id PK, business_name, business_type, custom_prompt, shipping_info, ai_provider, ai_credentials JSONB encrypted, ...)` — replaces today's `.env`-as-business-config.
- Add `tenant_id BIGINT NOT NULL REFERENCES tenants` to: `conversations`, `knowledge_base`,
  `inventory`, `pending_orders`, `user_profiles`, `active_tickets`, `admin_users`,
  `admin_audit_log`. Composite indexes led by `tenant_id` replace today's single-column ones.

### 3.2 Webhook routing (the tenancy entry point)
- Meta signature validation stays **platform-level**: one Meta app for the whole SaaS, so
  `META_APP_SECRET` remains a global env secret — validation happens before tenant
  resolution, keeping the fail-closed invariant untouched.
- After validation: FB `entry[].id` (page id) or WhatsApp `metadata.phone_number_id` →
  `tenant_channels` lookup (Redis-cached) → tenant context.
- Telegram: per-tenant bots register webhooks at `/telegram-webhook/{channel_uuid}`; the
  path segment resolves the tenant, and each channel keeps its own secret token.
- Unknown channel id → 404, logged; never processed.

### 3.3 Tenant context propagation
- A `TenantContext` dataclass (id, settings, credentials) resolved once per webhook/ARQ job
  and **passed explicitly** through `message_processor` → `ai` → `order_extraction` →
  send functions. This is the deep refactor: everything that reads `config.BUSINESS_NAME`,
  `config.PAGE_ACCESS_TOKEN`, `config.CUSTOM_SYSTEM_PROMPT` etc. takes the context instead.
  `app/core/config.py` shrinks back to genuinely global infrastructure settings
  (DB/Redis URLs, JWT secret, Meta app secret, Sentry).
- ARQ jobs carry `tenant_id` in their payload; the worker re-resolves context on dequeue.
- Every DB acquire for tenant work runs `SET app.tenant_id = $1` so RLS applies; Redis keys
  gain a `t:{tenant_id}:` prefix (debounce, dedup, caches, rate limits).

### 3.4 Admin & onboarding
- `admin_users.tenant_id` scopes every existing admin panel view; the RBAC dependency chain
  gains a tenant check. A new `superadmin` role (tenant_id NULL) gets a tenant-management
  console: create/suspend tenants, usage stats, impersonate-for-support.
- The **setup wizard** (`/admin/setup`, shipped Phase 22) becomes the tenant onboarding
  flow verbatim — business identity → AI key → channels → first products — writing to
  `tenant_settings`/`tenant_channels` instead of `.env`.
- Signup flow: superadmin creates tenant + first owner account (manual sales-led motion
  first; self-serve signup later).

### 3.5 Billing & limits (last phase)
- `tenants.plan` + a `tenant_usage(tenant_id, month, messages, ai_calls)` counter table
  (incremented in the worker, Redis-buffered).
- Enforcement: soft warning at 80%, hard stop with a polite customer-facing fallback
  message at 100%. Payment collection starts manual (bKash/bank transfer, BD reality) —
  gateway automation only when volume justifies it.

## 4. Phases

| Phase | Deliverable | Risk |
|---|---|---|
| A | **SHIPPED.** `tenants`/`tenant_channels`/`tenant_settings` tables (migration `a1b2c3d4e5f6`), default tenant (id=1) seeded, `tenant_id DEFAULT 1` stamped on all business tables, tenant resolution service (`app/services/tenancy.py`, Redis-cached, default-tenant fallback on every failure path), and the tenant-management API (`app/routers/tenants.py`: CRUD + channel mapping with uniqueness enforcement). | Low |
| B | **SHIPPED**: FB/WA handlers resolve tenants live (page id / phone_number_id) and every ARQ message job carries `tenant_id` (default 1 for backward compat). Per-tenant Telegram bot paths live at `/telegram-webhook/{channel_key}` with per-channel secret tokens (404 unknown / 503 unconfigured / 403 wrong secret -- fail-closed, no default-tenant fallback on the auth path) and per-tenant dedup keys; the legacy single-bot route stays on the deployment secret for the default tenant. Remaining Redis key prefixing (debounce/profile caches) moves into Phase C alongside context threading, where those call sites are being touched anyway. | Medium |
| C | `TenantContext` refactor of message pipeline + per-tenant credentials/settings from DB. The big one; landing in slices with the existing test suite guarding behavior for tenant 1. **Slice 1 SHIPPED**: tenant identity now flows end-to-end through the main reply path -- webhook -> ARQ job -> `process_facebook/whatsapp_message` -> debounce buffer (tenant_id rides in each buffered entry; pre-tenancy entries default to 1) -> flush -> `process_customer_message` (loads `TenantContext`) -> `generate_ai_reply`, whose system prompt now speaks as the tenant's business (name/type/custom prompt). **Slice 2 SHIPPED (data isolation)**: every knowledge_base and inventory read on the conversation path (`get_kb_context`, `get_database_exact_match`, `search_inventory`, `format_inventory_context`, the negotiation price lookup) now filters `WHERE tenant_id = $N`, with the tenant id threaded from the message pipeline; a test asserts every issued query carries the tenant filter. **Slice 3 SHIPPED (write attribution)**: customers are stamped with their tenant at first contact (`save_user_profile`; existing users never migrate on later saves), and conversations/tickets/extracted orders derive their tenant from that stamp via a Redis-cached `get_tenant_id_for_user` lookup -- no per-call-site threading needed. **Slice 4 SHIPPED (identity everywhere)**: KB placeholder filling, rule-based greeting/thanks replies, escalation fallback text, and the negotiation prompt all speak as the tenant's business; `load_tenant_context` is Redis-cached for non-default tenants. **Slice 5 SHIPPED (outbound credentials)**: replies, typing indicators, and WhatsApp sends go out through the recipient tenant's own page token / WA token + phone_number_id (stored on `tenant_channels.credentials` via the management API), with the deployment config as default-tenant fallback. **Remaining (minor)**: Redis key prefixing for profile caches (debounce keys are tenant-prefixed since Phase 27; per-tenant AI keys shipped in Phase E). | High |
| D | **CORE SHIPPED**: `AdminIdentity` (role + tenant) drives every admin data endpoint -- orders, database explorer (list/create/update/delete/bulk-upload), analytics, learning review -- so a tenant-scoped owner sees and touches only their tenant's data; tenant management + settings API is gated behind the new `superadmin` role (default-tenant owner acts as deployment operator, keeping single-tenant installs identical); `GET/PUT /tenants/{id}/settings` manages business identity with context-cache invalidation; escalation alerts page the tenant's own Telegram group (per-channel `alert_chat_id`/`bot_token`), deployment group as fallback. **Superadmin console UI SHIPPED** (`/admin/tenants`, server-side gate): tenant list with live usage bars, create/suspend, channel mapping, per-tenant settings editor including the tenant's own Gemini key. Tenant settings API opened to each tenant's own owner (self-service). **Client dashboard SHIPPED**: tenant owners get a "My Business" page (profile, custom prompt, own AI key, live usage vs plan), tenant login creation from the console (`POST /tenants/{id}/admins`), and deployment-level endpoints (.env, system settings, restart) are now superadmin-only -- a client owner literally cannot reach them; their broadcasts are stamped with their tenant scope and only reach their own customers. **Remaining**: wizard-as-tenant-onboarding (covered operationally by the console + My Business page). | Medium |
| E | **METERING + LIMITS SHIPPED**: `tenant_usage` table (migration `b2c3d4e5f6a7`), Redis-buffered per-tenant message/AI-call counters flushed by a 10-minute worker cron (GREATEST guard against counter regression), plan allowances (trial 500 / standard 5,000 / pro 20,000 / unlimited) with a once-daily operator warning at 80% and a polite customer-facing stop at 100%; default tenant exempt, all failures fail open. **RLS SHIPPED** (migration `c3d4e5f6a7b8`, verified live on Postgres 16): NULL-permissive FORCE row-level-security policies on all nine tenant-scoped tables -- unset GUC preserves exact legacy behavior; a transaction that arms `session.set_tenant_guc(conn, tid)` gets database-enforced isolation (cross-tenant SELECT/INSERT/UPDATE all blocked, cast-safe against the empty-string GUC state Postgres leaves after a local set_config). **Per-tenant AI keys SHIPPED**: replies bill the tenant's own Gemini key from `tenant_settings.ai_credentials`. Usage endpoint (`GET /tenants/usage`) powers invoicing. **Remaining**: billing collection (manual bKash/bank per plan, an operations process); incremental adoption of set_tenant_guc across hot-path transactions. | Medium |

Each phase ships with regression tests proving tenant-1 behavior is byte-identical to
today's single-tenant behavior, plus new cross-tenant isolation tests (tenant A must never
see tenant B's inventory/conversations — tested behaviorally, like the RBAC suite).

## 5. What explicitly does NOT change
- Webhooks stay fail-closed on missing platform secrets (invariant #1 in CLAUDE.md).
- Price-floor enforcement stays in code, per tenant's own inventory.
- Audit log stays name-only (now also carrying tenant_id).
- The Docker Compose single-VPS deployment remains the unit of hosting; SaaS scale-out
  uses the existing stateless-web-node topology plus a bigger managed Postgres when needed.

## 6. Post-launch hardening (Phase 31, 2026-07-24)
A full-codebase audit of the tenant surface fixed: tenant-scoped inventory uniqueness
(migration `e5f6a7b8c9d0` — the global constraint let one tenant's CSV upsert overwrite
another tenant's same-named product), tenant-scoped pre-update reads in the database
explorer (price-leak via validation errors), the missing Telegram branch on the
plan-limit stop reply, and `app/db/models.py` lockstep with the migration chain.
Still open, tracked here: RLS GUC-arming on hot-path transactions (`set_tenant_guc`
exists, unused), Redis key prefixing for profile caches, billing collection as a manual
bKash/bank operations process, and Meta App Review / Tech Provider approval for
onboarding external tenants' pages and WhatsApp numbers.
