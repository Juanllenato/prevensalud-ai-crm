# Architecture — Quick Reference

A one‑page map of PrevenSalud CRM+ for engineers and interviewers. Full detail in
[`ARCHITECTURE.md`](./ARCHITECTURE.md); diagrams in
[`../system-design/SYSTEM_DESIGN.md`](../system-design/SYSTEM_DESIGN.md).

## Layers

1. **Edge** — nginx (TLS, proxy headers); API bound to `127.0.0.1`.
2. **API** — FastAPI async, ~33 routers; middleware chain: rate‑limit → security headers →
   audit → CORS → auth (JWT/RBAC + RLS context).
3. **Domain** — services (`comision_engine`, `manifiesto`, `reporte_pdf`) + integrations
   (`llm`, `vision_ocr`, `whatsapp`).
4. **Data** — PostgreSQL with Row‑Level Security multi‑tenancy; Redis cache/queue.
5. **Automation** — Celery + Celery Beat (nightly reports, collections sweep, view refresh).

## The five things that make it interesting

| # | Decision | Why it matters |
|---|---|---|
| 1 | **3‑layer tenant isolation** (RLS + app filter + request scope) | A data leak needs three independent failures |
| 2 | **Targeted RAG** over operational data | Low latency, bounded cost, **zero PII** to the LLM |
| 3 | **Cost‑first multi‑engine OCR** (Tesseract → Vision → Claude) | Most invoices cost $0 to read |
| 4 | **LLM report with deterministic fallback** | Nightly report never fails because a model is down |
| 5 | **`Decimal` + 800‑line tested commission engine** | The money math is correct and guarded |

## Stack in one line

`Python 3.12 · FastAPI(async) · SQLAlchemy 2.0 · PostgreSQL(RLS) · Redis · Celery ·
DeepSeek‑V3/Together AI · Claude Haiku · Tesseract/Google Vision · Twilio · ReportLab ·
Next.js 14 · JWT RS256 · Docker/nginx/Hetzner · Sentry`

## Multi‑tenant request scoping

```
JWT → get_current_user → validate X‑Sucursal‑Id against user's branches
    → set RLS app.current_tenant_id → require_roles(...) → router/service
    → ORM query (RLS + app scope) → tenant‑correct result
```
