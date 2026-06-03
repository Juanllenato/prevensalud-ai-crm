# Case Study — PrevenSalud CRM+

**An AI‑powered operations platform for a multi‑branch preventive‑health sales business.**

*Production · [crm.prevensalud.pe](https://crm.prevensalud.pe) · Lima, Perú*

---

## 1. TL;DR

PrevenSalud sells preventive‑health treatments and supplements through in‑person
advisors, street/mall canvassers (OPC), and telemarketing, across multiple branches.
The business ran on spreadsheets, WhatsApp groups, and manual commission math — which
broke down as it grew.

I built (and run in production) **PrevenSalud CRM+**: an async FastAPI platform with a
multi‑tenant PostgreSQL core and four AI/automation subsystems:

- a **contextual AI assistant** that answers finance/operations questions over live data,
- an **OCR‑over‑WhatsApp** pipeline that converts an invoice photo into an approvable expense,
- an **automated executive PDF report** generated and delivered nightly, and
- a **Celery automation layer** for collections alerts, reporting, and cache refresh.

The interesting engineering is not "we called an LLM." It's **how AI is grounded in
real, access‑controlled, multi‑tenant business data without leaking PII, without
runaway cost, and without breaking when a model is unavailable.**

---

## 2. The business problem

| Manual process (before) | What it cost the business |
|---|---|
| Sales "manifiesto" in Excel/paper | No real‑time visibility; reconciliation errors at close |
| Invoices shared in WhatsApp groups | Expenses lost, double‑counted, or never recorded |
| Commissions computed by hand | Hours of work, disputes, and mistakes every fortnight |
| Partner reports typed manually | Owners flying blind; inconsistent, late numbers |
| No accounts‑receivable control | Installments slipping; cash uncollected |
| Verbal appointment scheduling | Missed reconsultations and double‑bookings |

The throughline: **operational data existed but was trapped in unstructured channels.**
The job was to capture it at the source, structure it, enforce who can see what, and
make it answerable in natural language.

---

## 3. Domain model (why multi‑tenant matters)

The unit of isolation is the **`sucursal`** (branch = tenant). A branch has advisors
(`asesor`), canvassers (`opc`), telemarketers, a host/receptionist (`hostess`), a sales‑floor
chief (`jefe_sala`), administrators, and partners (`socio`). Above all of them sits a
`superadmin` (platform/IT) role.

Every operational row — a sale, a payment, an appointment, a commission, an expense —
belongs to exactly one branch. Partners may see one or several branches; an advisor sees
only their own. This drove a **defense‑in‑depth tenancy model** (PostgreSQL Row‑Level
Security + application‑level filtering + a request‑scoped branch selector) described in
the architecture docs.

---

## 4. Solution overview

PrevenSalud CRM+ is a modular monolith:

- **FastAPI async backend** — ~33 routers covering auth, sales, payments, collections,
  commissions, expenses, appointments, clients, products, HR/payroll, multi‑branch
  administration, and the AI assistant.
- **PostgreSQL** — ~30 SQLAlchemy 2.0 models, all tenant‑scoped via a shared `TenantMixin`,
  with Row‑Level Security enforced at the database.
- **Redis + Celery** — async work and scheduled automation.
- **Next.js 14 frontend** — role‑aware dashboard with a glassmorphism design system.
- **Integrations** — Together AI (DeepSeek‑V3), Anthropic (Claude Haiku for vision),
  Google Cloud Vision, Tesseract, Twilio WhatsApp.

---

## 5. AI‑powered features (the core of the story)

### 5.1 Contextual AI assistant — RAG over operational data

Business users ask questions like *"¿quién está flojo este mes?"* or *"¿cuánto se debe en
cobranza?"* The assistant:

1. **Routes intent → modules.** A keyword router maps the question to only the relevant
   data modules (`ventas`, `pagos`, `cartera`, `comisiones`, `citas`, `productos`,
   `clientes`, `reportes`). A "sales" question never touches the seven other tables.
2. **Builds an aggregated, PII‑free context.** Each module runs *one* combined SQL query
   using `FILTER` aggregates (e.g., today + month‑to‑date in a single round‑trip). The
   LLM receives **counts, sums, group‑bys, and a roster of advisor names + branches with
   month‑over‑month trend** — never a customer's name, phone, DNI, or medical data.
3. **Enforces a per‑user access policy.** A `ConfiguracionAI` row gates the assistant by
   access level (`BASICO`/`INTERMEDIO`/`AVANZADO`), enabled modules, and sensitive flags
   (collections, reports). Sensitive payroll/commission data is `AVANZADO`‑only.
4. **Scopes by tenant.** Results are filtered to the user's branch(es); a partner with
   "all branches" can see the aggregate, an advisor sees only theirs.
5. **Defends against prompt injection** (see §7) and **persists the conversation** for a
   threaded history UI.

The model is **DeepSeek‑V3 via Together AI** (an OpenAI‑compatible endpoint), behind a
provider‑agnostic `LLMService` with a 45‑second timeout and bounded output tokens.

> **Engineering decision:** retrieval is *targeted*, not "stuff the whole DB into the
> prompt." This keeps context at ~5–15 KB, latency low, token cost predictable, and—
> critically—keeps PII out of the model entirely.

### 5.2 OCR invoice processing over WhatsApp

Capturing expenses where they happen: an admin photographs an invoice and sends it to a
WhatsApp number.

1. **Twilio webhook** receives the image. The request's **HMAC‑SHA1 signature is verified
   (fail‑closed)**; the sender is matched to a user and checked for the `ADMIN`/`HOSTESS`
   role.
2. The webhook **returns immediately** and enqueues a **Celery task** (fire‑and‑forget) so
   OCR latency never blocks the response.
3. The task downloads the image and runs a **cost‑first multi‑engine OCR**: free local
   **Tesseract** by default; **Google Cloud Vision** / **Claude Haiku Vision** as
   higher‑accuracy options (Claude is opt‑in via an "improve with AI" action). Image
   pre‑processing (grayscale, contrast/sharpness, upscale) boosts accuracy.
4. It **extracts** amount, date, vendor, and reference (with regex fallbacks), validates
   them, and persists an **`Egreso` in `PENDIENTE_CONFIRMACION`** with the raw OCR JSON
   kept for audit.
5. It **replies on WhatsApp** with the parsed summary. The user confirms with `SI`, rejects
   with `NO`, or corrects inline — `CORREGIR monto=125000` — against a **whitelisted field
   map**, with no re‑upload.

> **Engineering decision:** the human stays in the loop. OCR proposes; a person approves.
> The whitelist + type coercion on corrections is also a security boundary.

### 5.3 Automated executive PDF reporting

Every night, partners receive a CFO‑grade PDF on WhatsApp.

1. A **Celery Beat** job fans out per branch, injecting the tenant's RLS context.
2. **`recolectar_datos`** runs the period's aggregations concurrently (income, expenses,
   commissions by role, the operational funnel — entered → attended → bought —, payment
   methods, daily series, top advisors) **and the previous period** for deltas.
3. An **LLM writes the executive narrative** (`generate_reporte_diario`). If the model is
   unavailable, a **deterministic fallback** narrative is generated so the report always ships.
4. **ReportLab** renders a branded A4 PDF — KPI cards with period‑over‑period deltas, a
   funnel, payment‑method and result charts, and a per‑advisor efficiency table — inside a
   **threadpool** so the synchronous render never blocks the event loop.
5. The PDF is delivered via WhatsApp (and downloadable in‑app, rate‑limited and
   role‑gated).

### 5.4 Operational automation

Celery Beat also runs a **collections (`cobranza`) sweep** each morning — flipping overdue
installments `PENDIENTE → VENCIDO` and messaging the affected clients — and refreshes a
**materialized view** that powers sub‑500 ms dashboard/manifest queries.

---

## 6. Beyond AI: the business logic that has to be correct

The **commission engine** is the most correctness‑critical module and is fully implemented
with **`Decimal` precision** and an **800‑line unit test suite**. It computes advisor and
canvasser commissions from **payment percentage × timing** (full‑within‑fortnight 15%,
full‑deferred 12%, partial 8%), gates `EXAMEN` product commissions on a **weekly group
sales target** (ISO‑week logic per branch/shift), applies **personal bonuses** with optional
thresholds, and supports **per‑user rate overrides**. Fortnight ("quincena") periods drive
payroll liquidation.

> **Why it matters in an AI portfolio:** trustworthy AI features are only valuable on top of
> trustworthy data. The same rigor (Decimal money math, deterministic tests, no silent
> exceptions) that makes the commission engine safe is what makes the AI answers grounded.

---

## 7. Security & reliability decisions

- **Multi‑tenant defense in depth:** PostgreSQL **Row‑Level Security** (`app.current_tenant_id`)
  *plus* application‑level `sucursal_id` filtering *plus* a request‑scoped `X‑Sucursal‑Id`
  selector. A leak requires three independent failures.
- **AuthN/Z:** JWT **RS256** in production (HS256 dev), bcrypt password hashing,
  `password_changed_at` invalidates old tokens, and a 9‑role **RBAC** via a `require_roles`
  dependency. **Anti‑privilege‑escalation**: only `SUPERADMIN` can manage `SOCIO` accounts.
- **PII protection:** DNI and medical data are **Fernet‑encrypted at rest**; the AI context
  builder is structurally incapable of sending PII (it only emits aggregates).
- **Prompt‑injection defense (3 layers):** control‑token stripping → cheap jailbreak
  heuristic (blocks *before* spending tokens) → XML‑delimited user input treated as data.
- **Cost & abuse control:** `slowapi` + Redis rate limits on login, token refresh, the AI
  chat (`20/min; 300/day`), OCR extraction, and PDF generation. A subtle bug — *stacked*
  rate‑limit decorators silently not enforcing — was found and fixed by switching to the
  single‑decorator `"8/minute;40/hour"` syntax.
- **Graceful degradation:** Redis cache, LLM, OCR, and WhatsApp all fail soft — the core
  flow never crashes because an external dependency is slow or down.
- **Auditability:** non‑blocking middleware logs every request (endpoint, method, IP,
  status, **SHA‑256 body hash**) without adding response latency.

---

## 8. Implementation challenges (real ones)

- **FastAPI route ordering bug.** A dynamic `/{id}` route was shadowing
  `/citas/disponibilidad`, parsing the literal string as a UUID and returning 422. Fixed by
  ordering specific routes before parameterized ones — a classic that cost real debugging time.
- **Rate limits that silently didn't fire.** Two stacked `@limiter.limit` decorators don't
  compose; only the single‑decorator `;`‑syntax enforces. Verified with parallel request
  bursts (8×200 then 429s), not sequential calls that cross minute boundaries.
- **Hard‑reload logout race.** A child layout's auth guard ran before the provider rehydrated
  the user from `localStorage`. Fixed by gating on `!isLoading && !isAuthenticated`.
- **Tenant‑switch session drop.** Required adding `X‑Sucursal‑Id` to CORS `allow_headers`
  *and* fixing the same hydration race — multi‑tenant UX is subtle.
- **pgBouncer + migrations.** Supabase's pooler is incompatible with `CREATE INDEX
  CONCURRENTLY`; switched to plain `CREATE INDEX IF NOT EXISTS` and `NullPool`.
- **Keeping the model honest.** The assistant once answered "no tengo datos de Los Olivos"
  when the truth was "there are zero advisors assigned to that branch." Fixed by adding a
  `resumen_por_sucursal` (including empty branches) to the context **and** rewriting the
  system prompt to distinguish *"no records"* from *"no access."*

---

## 9. Production deployment

- **Containerized** with Docker Compose: `api`, `frontend`, `redis`, `celery_worker`,
  `celery_beat`.
- **Host:** a Hetzner VPS behind **nginx** (TLS, proxy headers), with the API bound to
  `127.0.0.1` only and `uvicorn --proxy-headers`.
- **Database:** managed PostgreSQL (Supabase) via the pooler with `NullPool`.
- **Deploys** are scripted (git pull → build → `alembic upgrade` → restart) with
  `--skip-migrations`/`--quick` flags.
- **Backups:** `pg_dump` (custom format) on a schedule; a pre‑go‑live full backup is taken
  before any destructive operation.
- **Observability:** Sentry for error tracking (environment‑scoped sampling).

---

## 10. Scalability considerations

- **Async everywhere** (FastAPI + SQLAlchemy async + asyncpg) for I/O‑bound throughput.
- **Targeted retrieval** keeps AI DB load at 1–3 queries/question instead of full scans.
- **Composite indexes** on the hottest paths (`(sucursal_id, fecha_venta)`,
  `(sucursal_id, estado)`), plus a **materialized view** for the daily manifest.
- **CPU‑bound work off the event loop** (PDF render in a threadpool; OCR in Celery workers
  that scale independently of the API).
- **Redis‑backed, distributed rate limiting** so limits hold across horizontally‑scaled API
  instances.
- **Stateless JWT** auth — horizontal scale needs no shared session store.

---

## 11. Results & status

- **In production** and actively used by a multi‑branch sales operation.
- Replaced manual spreadsheets/WhatsApp‑group processes for sales, expenses, commissions,
  collections, and partner reporting.
- AI assistant, OCR capture, nightly PDF reporting, and collections automation are live and
  verified end‑to‑end.

The platform replaced fragmented, manual processes with a single source of truth:
real‑time sales visibility, automated commission liquidation, captured‑at‑source expenses,
and consistent partner reporting — across multiple branches.

---

## 12. What I'd build next

- Consolidate the thin service layer (logic currently lives in some routers) behind
  `VentaService`/`CarteraService` for cleaner transaction boundaries.
- Add MFA/TOTP for high‑privilege roles and a token‑revocation list.
- Token‑usage metering and per‑tenant LLM cost dashboards.
- Broaden TanStack Query adoption on the frontend for caching/retry.
- A retention/archival policy for `audit_logs` and AI conversations.
- Circuit breakers around Twilio/Vision/LLM calls and Sentry‑Celery integration.

---

*Engineering‑only case study. No proprietary source or customer PII is reproduced here.*
