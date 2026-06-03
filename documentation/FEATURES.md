# Feature Documentation — PrevenSalud CRM+

Each major feature is documented with: overview · business value · technical
implementation · backend flow · AI workflow (where relevant) · scaling · security.
Everything here is grounded in the actual codebase.

---

## 1. Contextual AI Assistant

**Overview.** A conversational interface that lets administrators and partners ask
natural‑language questions about the business ("¿cuánto vendimos hoy?", "¿quién está flojo
este mes?", "¿cuánto se debe en cobranza?") and get grounded answers from live data.

**Business value.** Replaces manually compiled reports and WhatsApp back‑and‑forth with
instant, self‑serve operational intelligence — without exposing raw customer data.

**Technical implementation.**
- Endpoint: `POST /api/v1/asistente/chat` (rate‑limited `20/minute;300/day`).
- Provider: **DeepSeek‑V3 via Together AI** through a provider‑agnostic `LLMService`
  (OpenAI‑compatible client, 45 s timeout, bounded output tokens).
- Per‑user policy: `ConfiguracionAI` (`activo`, `nivel_acceso` ∈
  BASICO/INTERMEDIO/AVANZADO, `modulos_habilitados`, `puede_consultar_cartera`,
  `puede_ver_reportes`).
- Conversations persisted to `conversaciones_ia` (JSON message array, capped) with a
  threaded‑history UI (list, rename, pin, delete).

**Backend flow.** sanitize → injection heuristic → intent check (PDF?) → keyword module
router → access policy → per‑module aggregate queries (tenant‑scoped) → prompt assembly →
LLM → persist → respond. See `SYSTEM_DESIGN.md §3`.

**AI workflow (RAG).** A `_KEYWORDS` map routes the question to only the relevant modules.
Each module emits **one** combined `FILTER`‑aggregate query (e.g., today + month‑to‑date in
a single round‑trip). The context is **aggregates + staff roster only — never PII**. A
notable context block, `equipo_asesores`, gives the model each advisor's name, branch, and
**month‑over‑month sales trend** (`sube`/`baja`/`estable`/`sin_ventas`/`cayo_a_cero`) plus a
`resumen_por_sucursal` so it can distinguish *"this branch has zero advisors"* from *"no
access."*

**Scaling.** Targeted retrieval = 1–3 queries per question; context ~5–15 KB; indexed on
`(sucursal_id, fecha_venta)` etc.; async DB + async LLM client.

**Security.** 3‑layer prompt‑injection defense (control‑token stripping → jailbreak
heuristic that blocks before spending tokens → XML‑delimited user input); parameterized
ORM (no string SQL); PII never enters the prompt; per‑user + per‑tenant access gates.

> **TODO:** module keywords and system prompts are code‑level (not admin‑configurable);
> add an admin UI and a conversation‑retention policy.

---

## 2. Contextual Retrieval System (the RAG layer)

**Overview.** The retrieval layer that grounds every AI answer in current, access‑controlled
business data.

**Business value.** Trustworthy answers (no hallucinated numbers) at low, predictable cost.

**Technical implementation.**
- `_modulos_relevantes(question, enabled_modules)` — intent → module selection.
- `_build_context(...)` — per‑module aggregate builders (`ventas`, `ventas_detalle_mes`,
  `equipo_asesores`, `clientes`, `pagos`, `cartera`, `citas`, `productos`, `comisiones`,
  `egresos`), each gated by access level and tenant scope.
- Output: a compact JSON object of metrics, plus `contexto_usado` echoed back to the client
  for transparency.

**Why it's designed this way.** Stuffing the whole database into a prompt is slow, expensive,
and a PII hazard. Targeted retrieval is the opposite: minimal data, maximal grounding.

**Scaling / security.** Covered in §1. The context builder is **structurally PII‑free** —
it cannot emit a customer name or phone because it only computes aggregates and staff
rosters.

---

## 3. OCR Invoice Processing (over WhatsApp)

**Overview.** Staff photograph an invoice and send it to WhatsApp; the system reads it,
proposes a structured expense, and lets the user approve or correct it in chat.

**Business value.** Captures expenses at the moment they occur, eliminating lost or
double‑counted invoices and manual data entry.

**Technical implementation.**
- Webhook: `POST /whatsapp/webhook` — **Twilio HMAC‑SHA1 signature verified (fail‑closed)**,
  sender matched to a user, role checked (`ADMIN`/`HOSTESS`).
- Async: enqueues `procesar_factura` (Celery) and returns TwiML 200 immediately.
- OCR: **cost‑first multi‑engine** — Tesseract (local, free, default) → Google Cloud Vision
  → Claude Haiku Vision (opt‑in "improve with AI"). Pillow pre‑processing (grayscale,
  contrast/sharpness, upscale).
- Extraction: amount, date, vendor, reference (with regex fallbacks) + validation.
- Persistence: `Egreso` in `PENDIENTE_CONFIRMACION` with `ocr_datos_raw` (audit trail).
- Confirmation loop: `SI` → CONFIRMADO; `NO` → RECHAZADO; `CORREGIR campo=valor` → patch a
  **whitelisted** field (`{proveedor, monto, fecha, descripcion}`) with type coercion.
- In‑app variant: `POST /egresos/ocr-extract` (rate‑limited `20/minute`).

**Backend flow.** See `SYSTEM_DESIGN.md §4`.

**Scaling.** OCR runs in Celery workers that scale independently of the API; image download
inside the task respects Twilio URL expiry; retries with exponential backoff.

**Security.** Signature verification, RBAC, Basic‑auth media download, whitelist + type
coercion on corrections (SQL‑injection‑safe), tenant scoping, DEBUG‑only URL logging.

> **TODO:** parameterize the extraction prompt per country/currency; consolidate duplicated
> regex into shared utils; add a retention policy for rejected expenses; validate that
> `media_url` is a Twilio host.

---

## 4. PDF Report Generation

**Overview.** CFO‑grade financial/operational PDFs (daily/fortnightly/monthly) with an
LLM‑written executive summary, KPI cards, an operational funnel, charts, and a per‑advisor
efficiency table.

**Business value.** Partners get consistent, on‑time, understandable reporting automatically
— no analyst required.

**Technical implementation.**
- Builder: `services/reporte_pdf.py` (ReportLab 4) — branded A4, page bands/footers via
  canvas callbacks, markdown‑to‑flowable conversion for the narrative.
- Data: `recolectar_datos(...)` runs the period's aggregations concurrently **and** the
  previous period for deltas (income, expenses, commissions by role, funnel
  entered→attended→bought, payment methods, daily series, top advisors).
- Narrative: `LLMService.generate_reporte_diario(...)`; **deterministic fallback** if the
  model is unavailable.
- Rendering: `run_in_threadpool(construir_pdf, ...)` keeps the synchronous render off the
  event loop.
- Delivery: in‑app `GET /reportes/pdf` (roles `ADMIN`/`SOCIO`/`HOSTESS`, rate‑limited
  `8/minute;40/hour`, branch‑scoped) and via WhatsApp from the nightly Celery job.

**Scaling.** Concurrent async data collection; fixed chart complexity (top‑10 advisors,
top‑8 commissions, etc.); materialized‑view fast path for the manifest.

**Security.** Role‑gated, branch‑scoped (`ve_todas_sucursales` required for cross‑branch);
the worker injects RLS context per branch; the footer shows branch + date only.

> **TODO:** the report emission date uses `today()` (historical reports show the current
> date in the footer); commissions group by `created_at` vs. transaction date.

---

## 5. Automation Workflows (Celery + Beat)

**Overview.** Scheduled, tenant‑aware background jobs.

| Job | Schedule | What it does |
|---|---|---|
| Partner reports | ~8 PM | Per‑branch KPI report → LLM narrative → PDF → WhatsApp |
| Collections sweep | ~9 AM | Flip overdue `PENDIENTE → VENCIDO`, group by client, send reminders |
| Materialized view refresh | every 5 min | Keeps `mv_manifiesto_diario` fresh for sub‑500 ms dashboards |
| OCR processing | event‑driven | Invoice extraction pipeline (see §3) |

**Implementation.** Celery 5.3 with Redis broker/backend; JSON serialization only (no
pickle); per‑branch fan‑out injecting RLS context; retries with exponential backoff;
tenacity around external calls.

**Security/scaling.** Tenant context per task; time limits prevent zombie tasks; workers
scale independently; `ignore_result=True` on the high‑frequency view refresh.

> **TODO:** unify the production (`/workers/`) and legacy (`/backend/app/workers/`) Celery
> configs; add Sentry‑Celery integration, a dead‑letter queue, and circuit breakers.

---

## 6. Authentication & Authorization

**Overview.** JWT auth with a 9‑role RBAC model and multi‑branch access control.

**Business value.** Each person sees exactly what their role and branch allow — partners,
chiefs, advisors, hostess, and platform admins all get a correct, safe view.

**Technical implementation.**
- Tokens: **RS256** in production (HS256 dev), `access` (480 min) + `refresh` (7 d) with
  `jti/iat/type` claims.
- Passwords: bcrypt (passlib); `password_changed_at` invalidates older tokens.
- RBAC: `Rol` enum (SUPERADMIN → CLIENTE) + `require_roles(...)` dependency; **only
  SUPERADMIN can manage SOCIO accounts** (anti‑privilege‑escalation).
- Multi‑branch: `AlcanceAcceso` (EMPRESA/SUCURSAL) + `UsuarioSucursal` assignments +
  `X‑Sucursal‑Id` request narrowing.
- Rate limits: login `10/min`, refresh `30/min`, password change `5/hour`.

**Backend flow.** See `SYSTEM_DESIGN.md §2`.

**Security.** bcrypt, RS256, fixed algorithm (no `alg:none`), explicit CORS origins,
security headers (HSTS/CSP/etc.), audit logging.

> **TODO:** add MFA/TOTP, a forgot‑password flow, a token‑revocation list, and login‑anomaly
> detection.

---

## 7. API Surface

**Overview.** ~33 routers exposing the full operation under `/api/v1/*`.

**Representative endpoints.**
- Sales/finance: `POST /ventas`, `POST /pagos`, `GET /pagos/cobranza`,
  `PATCH /pagos/{id}/cobrar`, `GET /manifiesto/dia/{fecha}`, `POST /ventas/{id}/retracto`.
- Appointments: `POST /citas`, `GET /citas/disponibilidad`, `GET /citas/mis-reconsultas`.
- AI/reports: `POST /asistente/chat`, `GET /reportes/pdf`, `GET /presencia/asesores`.
- Admin: `POST /usuarios`, `GET /sucursales/visibles`, expense OCR, payroll, etc.

**Conventions.** Pydantic v2 in/out schemas, `require_roles` on protected routes,
`response_model`, tenant‑scoped queries, and specific routes ordered before parameterized
(`/{id}`) routes to avoid shadowing.

**Security/scaling.** Per‑route rate limiting; async handlers; RLS + app scoping on every
data path.

---

## 8. Business Intelligence Features

**Overview.** Real‑time operational analytics beyond the AI chat.

- **Digital manifest** — live daily branch view (sales, cash, volume) backed by a
  materialized view for sub‑500 ms reads.
- **Role dashboards** — KPI cards, 7‑day and monthly sales series, advisor efficiency
  (entered → attended → bought, conversion, average ticket), commissions by role.
- **Collections (cobranza)** — who owes, how much, due date, days overdue, status
  (`VENCIDO`/`POR_VENCER`/`AL_DIA`), with a one‑click "register payment" action.
- **Presence grid** — live advisor presence (online / attending) via 45 s heartbeats for
  the sales‑floor chief.
- **Commission engine** — `Decimal`‑precise, fortnight‑based, group‑target‑gated, with an
  800‑line test suite (see `ENGINEERING_NOTES.md`).

**Business value.** Turns the operation's raw events into decisions: who to coach, what to
collect, where the funnel leaks.

**Security/scaling.** Everything branch‑scoped; hot paths cached/indexed; aggregates
computed in single queries.
