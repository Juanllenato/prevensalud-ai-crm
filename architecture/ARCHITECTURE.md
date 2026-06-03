# Architecture Analysis — PrevenSalud CRM+

This document is the engineering deep‑dive: how the system is structured, the technical
stack, its strengths, scalability profile, and production‑readiness — all grounded in the
actual codebase.

---

## 1. Architectural style

PrevenSalud CRM+ is a **modular monolith** with a clear separation between an async API,
a tenant‑isolated data layer, an integrations layer for external services, and an
asynchronous automation layer.

```
                ┌──────────────────────────────────────────────────────┐
                │                   Clients                            │
                │   Browser (Next.js 14)      WhatsApp (Twilio)        │
                └───────────────┬───────────────────────┬──────────────┘
                                │ HTTPS                   │ Webhook (HMAC)
                        ┌───────▼───────┐        ┌────────▼─────────┐
                        │     nginx     │        │  /whatsapp/*     │
                        │ reverse proxy │        │  (signature‑     │
                        └───────┬───────┘        │   verified)      │
                                │                └────────┬─────────┘
                    ┌───────────▼─────────────────────────▼────────────┐
                    │            FastAPI (async) — ~33 routers          │
                    │  auth · ventas · pagos · cobranza · comisiones    │
                    │  egresos · citas · clientes · productos · nomina  │
                    │  asistente(IA) · reportes · presencia · ...       │
                    ├───────────────────────────────────────────────────┤
                    │  Cross‑cutting: JWT/RBAC · RLS context · rate     │
                    │  limit · security headers · audit middleware      │
                    ├──────────────┬───────────────────┬────────────────┤
                    │  Services    │   Integrations     │   Core         │
                    │  comision_   │  llm (DeepSeek)    │  security      │
                    │  engine ·    │  vision_ocr        │  database(RLS) │
                    │  manifiesto ·│  whatsapp (Twilio) │  config        │
                    │  reporte_pdf │  (Claude/GVision)  │  cache         │
                    └──────┬───────┴─────────┬──────────┴───────┬────────┘
                           │                 │                  │
                    ┌──────▼──────┐   ┌───────▼───────┐   ┌──────▼───────┐
                    │ PostgreSQL  │   │     Redis     │   │ Celery +     │
                    │ (RLS multi‑ │   │ cache + broker│   │ Celery Beat  │
                    │  tenant)    │   │               │   │ (automation) │
                    └─────────────┘   └───────────────┘   └──────────────┘
```

See [`../system-design/SYSTEM_DESIGN.md`](../system-design/SYSTEM_DESIGN.md) for Mermaid
component, sequence, and flow diagrams.

---

## 2. Technical stack (verified)

### Backend
| Concern | Technology |
|---|---|
| Language / runtime | Python 3.12 |
| Web framework | FastAPI 0.104+ (async) |
| ORM | SQLAlchemy 2.0 (async) + asyncpg |
| Validation / settings | Pydantic v2 + pydantic‑settings |
| Migrations | Alembic |
| Auth | python‑jose (JWT), passlib + bcrypt |
| Encryption | cryptography (Fernet) for PII at rest |
| Rate limiting | slowapi + Redis (in‑memory fallback) |
| Task queue | Celery 5.3 + Redis (broker & backend) + Celery Beat |
| HTTP client | httpx |
| Retry | tenacity |
| Monitoring | sentry‑sdk |

### AI / ML
| Concern | Technology |
|---|---|
| Conversational assistant LLM | **DeepSeek‑V3 via Together AI** (OpenAI‑compatible API) |
| Vision OCR (opt‑in, high‑accuracy) | **Claude Haiku** (Anthropic) |
| OCR (default, local) | **Tesseract** |
| OCR (cloud option) | **Google Cloud Vision** |
| Image pre‑processing | Pillow |

### Frontend
| Concern | Technology |
|---|---|
| Framework | Next.js 14 (App Router, `force-dynamic`) |
| UI runtime | React 18 |
| Server state | TanStack Query v5 (selective) |
| HTTP | Axios (interceptors) + `apiFetch` helper |
| Forms | react‑hook‑form + Zod |
| Components | ShadCN (Radix UI) |
| Styling | Tailwind CSS (glassmorphism design system) |
| Icons | lucide‑react |

### Data & Infra
| Concern | Technology |
|---|---|
| Database | PostgreSQL (prod: managed/Supabase, PG 17; dev: postgres:16 / SQLite) |
| Multi‑tenancy | PostgreSQL Row‑Level Security + app‑level filtering |
| Cache / queue | Redis 7 |
| Containers | Docker Compose (api, frontend, redis, celery_worker, celery_beat) |
| Hosting | Hetzner VPS + nginx reverse proxy |
| Messaging | Twilio WhatsApp Business API |
| Reporting | ReportLab 4 |

> **Note on declared vs. used dependencies:** the project manifest also lists
> `langchain‑anthropic` and `boto3`. The *implemented* LLM path is the provider‑agnostic
> `LLMService` (OpenAI‑compatible → DeepSeek‑V3 on Together AI) plus Anthropic's SDK for
> Claude Haiku vision. This doc documents what the code actually runs.

---

## 3. Multi‑tenant architecture (the backbone)

Tenancy is enforced at **three independent layers** — defense in depth:

1. **Database (PostgreSQL RLS).** Tenant‑scoped tables carry `sucursal_id` (via a shared
   `TenantMixin`). RLS policies enforce
   `sucursal_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid`.
   `FORCE ROW LEVEL SECURITY` applies even to the table owner; a `prevensalud_admin` role
   allows controlled cross‑tenant traversal for `ADMIN`/`SOCIO` global views.
2. **Application filtering.** Services and routers also constrain queries to
   `current_user.sucursales_visibles` — so a missing RLS context still can't leak data.
3. **Request‑scoped selector.** An `X‑Sucursal‑Id` request header narrows a multi‑branch
   user's view to a single branch for that request; `get_current_user` validates the header
   against the user's allowed branches and rewrites `sucursal_id`/`sucursales_visibles`
   accordingly.

This is the architectural decision the rest of the system leans on: **AI answers, reports,
dashboards, and exports are all automatically tenant‑correct** because the constraint lives
below them.

---

## 4. Request lifecycle & cross‑cutting concerns

A protected request passes through, in order:

1. **nginx** (TLS termination, proxy headers) → API bound to `127.0.0.1` only.
2. **slowapi** rate limiting (per‑route limits, Redis‑backed).
3. **Security headers** middleware (HSTS, CSP, `X‑Frame‑Options: DENY`, nosniff,
   Referrer‑Policy, Permissions‑Policy).
4. **Audit logging** middleware — non‑blocking; records endpoint, method, IP, status, and a
   **SHA‑256 hash of the body** (INSERT‑only `audit_logs`).
5. **CORS** (explicit origins, `allow_credentials`, `X‑Sucursal‑Id` allowed).
6. **`get_current_user`** — decode JWT (RS256 prod), validate `exp/iat/jti/type`, load the
   user, check `activo` and `password_changed_at`, apply the `X‑Sucursal‑Id` narrowing, set
   the RLS context.
7. **`require_roles(...)`** dependency — RBAC enforcement.
8. **Router → service → ORM** — queries auto‑filtered by RLS + app scope.

---

## 5. The AI subsystem architecture

```
question ─▶ sanitize ─▶ injection heuristic ─▶ intent (PDF? ) ─▶ module router
                                                                      │
                         ┌────────────────────────────────────────────┘
                         ▼
            per‑module single aggregate query (FILTER) × {ventas, pagos, cartera,
            comisiones, citas, productos, clientes, reportes}  ── filtered by tenant
                         │   (aggregates only — NO PII)
                         ▼
            access policy (ConfiguracionAI: level + module + sensitive flags)
                         │
                         ▼
            prompt assembly: system rules + custom prefs + history + <consulta_usuario>
                         │
                         ▼
            LLMService → DeepSeek‑V3 (Together AI)  ── 45s timeout, bounded tokens
                         │
                         ▼
            persist conversation (JSON) ─▶ ChatResponse {respuesta, contexto_usado, ...}
```

Key properties:

- **Retrieval is targeted**, reducing both latency and the attack/PII surface.
- **The context builder cannot emit PII** — it only produces counts, sums, group‑bys, and
  staff rosters (names + branches), by construction.
- **Access is data‑driven**, per user, not hard‑coded.

---

## 6. Strengths analysis

- **Security‑first, multi‑tenant core.** RLS + app filtering + request scoping is genuine
  defense in depth, not a single `WHERE` clause.
- **AI grounded in real data with guardrails.** Targeted RAG, PII‑free context, per‑user
  policy, and prompt‑injection defenses — the hard parts of applied GenAI done deliberately.
- **Cost‑aware AI.** Free local OCR by default; paid vision and LLM calls are bounded,
  rate‑limited, and opt‑in where expensive.
- **Resilience by design.** Every external dependency (LLM, OCR, WhatsApp, Redis) degrades
  gracefully; the nightly report has a deterministic fallback narrative.
- **Correctness where it counts.** The commission engine uses `Decimal` money math and an
  800‑line test suite — the financial core is test‑guarded.
- **Operational maturity.** Scripted deploys, scheduled `pg_dump` backups, Sentry, audit
  logging, and a pre‑go‑live backup discipline.

---

## 7. Scalability observations

| Dimension | Current design | Headroom / next step |
|---|---|---|
| API throughput | Async FastAPI + asyncpg; stateless JWT | Horizontal scale behind nginx/LB; no session store needed |
| AI DB load | 1–3 targeted aggregate queries per question | Cache hot aggregates; the materialized view already helps |
| Dashboards | `mv_manifiesto_diario` refreshed every 5 min; composite indexes | Tune refresh cadence vs. freshness; add read replicas |
| CPU‑bound work | PDF render in threadpool; OCR in Celery workers | Scale worker pool independently of the API |
| Rate limiting | Redis‑backed (distributed) | Holds across multiple API replicas |
| Background jobs | Celery + Beat, per‑tenant fan‑out | Add priority queues / dead‑letter queue |

---

## 8. Production‑readiness observations

**Strong today**
- TLS + nginx, API not exposed publicly, proxy‑header handling.
- RS256 JWT, bcrypt, Fernet PII encryption, `password_changed_at` invalidation.
- Rate limiting on auth and all cost‑sensitive endpoints.
- Audit logging with body hashing; Sentry error tracking.
- Backups via `pg_dump`; scripted, repeatable deploys.

**Honest gaps (tracked, not hidden)**
- No MFA/TOTP yet for high‑privilege roles; no token‑revocation list (only
  `password_changed_at` invalidation).
- `audit_logs` and AI conversations lack a retention/archival policy (unbounded growth).
- Thin service layer in places — some transaction logic lives in routers and would be
  cleaner behind `VentaService`/`CarteraService`.
- No CI gate yet for `bandit`/`pip‑audit`/`tsc --noEmit`; frontend build skips type errors.
- No circuit breakers around Twilio/Vision/LLM (retries/backoff only).

These are catalogued in [`../documentation/FEATURES.md`](../documentation/FEATURES.md) and
the case study's "What I'd build next."

---

## 9. Notable engineering patterns

- **`FILTER`‑aggregate single queries** (today + MTD in one round‑trip).
- **`run_in_threadpool`** for synchronous, CPU‑bound rendering.
- **Fire‑and‑forget webhooks** → Celery, so external latency never blocks responses.
- **Provider‑agnostic `LLMService`** with timeout + bounded tokens + deterministic fallback.
- **Whitelisted correction map** for OCR edits (a UX *and* security boundary).
- **`Decimal` money math** with `quantize(Decimal('0.01'))` throughout the financial core.
