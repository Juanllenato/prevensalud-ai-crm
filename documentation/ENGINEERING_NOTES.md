# Engineering Notes — PrevenSalud CRM+

Polished, interview‑ready explanations of *why* the key design choices matter. Use these as
talking points; they map directly to code in the system.

---

## Why the AI assistant matters

Most "AI in a CRM" demos do one of two unsafe things: they either paste raw database rows
into a prompt (slow, expensive, and a privacy disaster) or they let the model free‑form
guess at numbers it doesn't have. PrevenSalud's assistant is built to be the opposite —
**grounded, bounded, and access‑aware**:

- **Grounded:** every figure comes from a live SQL aggregate, not the model's imagination.
  If the data isn't there, the system prompt forces the model to say so — and to distinguish
  *"no records"* from *"no access."*
- **Bounded:** targeted retrieval keeps the context at a few kilobytes, the output token
  budget is capped, and a 45‑second timeout plus a `20/min; 300/day` rate limit make cost
  and latency predictable.
- **Access‑aware:** a per‑user policy (`ConfiguracionAI`) decides which modules and which
  sensitive flags (collections, payroll) a person can ask about — and the answer is always
  scoped to their branch.

The result is an assistant a business owner can trust with a question at 9 PM and get a
correct, private, instant answer — which is the entire point of putting AI in an operations
tool.

---

## How contextual business retrieval works

The retrieval layer is a small, deliberate **RAG over structured data**:

1. **Intent → modules.** A keyword router maps the question to the minimum set of data
   modules. "¿quién vende más?" touches sales; it never queries appointments, products, or
   payroll.
2. **One query per module.** Each module runs a single combined query using SQL `FILTER`
   aggregates — today and month‑to‑date come back in one round‑trip, not two.
3. **Aggregates, never rows.** The model receives counts, sums, group‑bys, and a staff
   roster (names + branches + trend). It physically never receives a customer's name, phone,
   DNI, or medical data, because the builder doesn't select those columns.
4. **Policy + tenant gates.** Access level and branch scope are applied before the query
   runs, so the context is correct‑by‑construction.

This is why the assistant is fast and cheap: it reads exactly what the question needs, and
nothing else.

---

## How OCR improves operations

The OCR pipeline targets a very human failure mode: invoices that live in a WhatsApp group
and never make it into the books. By meeting staff **where they already are** (WhatsApp) and
returning a structured, one‑tap‑to‑approve expense, it removes the friction that caused
expenses to go missing.

Three engineering choices make it production‑grade:

- **Cost‑first:** free local Tesseract handles the common case; paid vision models (Google
  Vision, Claude Haiku) are opt‑in for hard images. Most invoices cost $0 to read.
- **Human‑in‑the‑loop:** OCR *proposes*; a person *approves*. Confirmation and inline
  corrections (`CORREGIR monto=125000`) happen in chat with no re‑upload, against a
  whitelisted field map that doubles as a security boundary.
- **Async by default:** the webhook verifies the Twilio signature, returns instantly, and
  hands the slow work to a Celery worker — so reading an image never blocks a response.

---

## How PDF generation automates a workflow

Partner reporting used to be a person compiling numbers and typing a WhatsApp message every
night. The reporting engine replaces that role entirely:

- A scheduled job fans out per branch, computes the period's metrics **and the previous
  period** (for deltas), asks the LLM to write the executive narrative, and renders a branded
  PDF with KPI cards, a funnel, charts, and a per‑advisor table.
- The synchronous ReportLab render runs in a **threadpool** so it never blocks the async
  event loop.
- Crucially, if the LLM is unavailable, a **deterministic fallback narrative** ships instead
  — the report is never late because a model had a bad night.

The same code path powers an on‑demand, role‑gated, rate‑limited in‑app download, so the
nightly automation and the "give me this now" button share one tested implementation.

---

## Why the architecture supports scalability

Scalability here is mostly about **not doing expensive things on the hot path**:

- **Async I/O end‑to‑end** (FastAPI + SQLAlchemy async + asyncpg) for high concurrency on
  I/O‑bound work.
- **Targeted retrieval** keeps AI database load at 1–3 queries per question.
- **A materialized view** (`mv_manifiesto_diario`, refreshed every 5 minutes) serves the
  most frequent dashboard/manifest reads in sub‑500 ms.
- **CPU‑bound work is offloaded** — PDF rendering to a threadpool, OCR to Celery workers that
  scale independently of the API.
- **Stateless JWT auth** means API instances scale horizontally with no shared session store,
  and **Redis‑backed rate limiting** holds across all of them.
- **Multi‑tenancy lives in the database** (RLS), so adding branches/tenants needs no code
  changes and no per‑row tenant checks in the application.

---

## How the backend is organized

A clean, conventional separation that keeps business logic testable:

- **`api/v1/*`** — thin routers: validation (Pydantic), authz (`require_roles`), and
  orchestration.
- **`services/*`** — business logic with no HTTP concerns (e.g., the commission engine,
  manifest builder, PDF builder). Domain exceptions are raised here and translated to HTTP at
  the edge.
- **`integrations/*`** — the only place external APIs are called (LLM, OCR/Vision, WhatsApp),
  each with timeouts/retries, so the rest of the system never talks to the outside world
  directly.
- **`core/*`** — security (JWT/RBAC/encryption), database (RLS context, async sessions),
  config (fail‑fast production validation), cache.
- **`models/*`** — SQLAlchemy 2.0 models, all tenant‑scoped via shared mixins.

This boundary is what makes the commission engine independently unit‑testable (800 lines of
tests) and the integrations independently mockable.

---

## How the AI workflows improve business efficiency

Each AI/automation subsystem removes a recurring manual job:

| Manual job (before) | Automated by | Efficiency gain |
|---|---|---|
| Compiling daily numbers, answering owner questions | AI assistant | Self‑serve, instant, private answers |
| Typing invoices into a ledger | OCR over WhatsApp | Capture at source, one‑tap approve |
| Writing the nightly partner report | PDF report engine | Zero‑touch, consistent, on‑time |
| Chasing overdue installments by memory | Collections sweep | Automatic flag + reminder |
| Reconciling the daily manifest | Materialized view + dashboards | Real‑time, sub‑500 ms |

The common thread: **AI is embedded in the workflow, not parked in a separate "AI tab."**
That's what turns it from a demo into operational leverage.

---

## A few decisions I'd defend in an interview

- **Targeted RAG over "big prompt".** Cheaper, faster, and the only way to keep PII out of
  the model entirely.
- **`Decimal` money math + deterministic tests** on the commission engine. Floating‑point
  money is a bug waiting to happen; the financial core is the one place to be uncompromising.
- **Fail‑soft external dependencies.** Redis, LLM, OCR, and WhatsApp can all be down and the
  core business flow still works — including a deterministic report narrative fallback.
- **Defense‑in‑depth tenancy.** RLS *and* app filtering *and* request scoping, because a
  multi‑tenant data leak is the worst possible failure for this product.
