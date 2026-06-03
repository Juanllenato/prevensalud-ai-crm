# PrevenSalud CRM+ — Applied AI Engineering Case Study

> A production, AI‑powered business platform for a multi‑branch preventive‑health
> sales operation. **Live:** [crm.prevensalud.pe](https://crm.prevensalud.pe)

This repository folder is a **portfolio case study** that documents the engineering
behind PrevenSalud CRM+: a real, in‑production SaaS that combines a FastAPI async
backend, a multi‑tenant PostgreSQL data layer, a contextual AI assistant, an
OCR‑over‑WhatsApp invoice pipeline, automated PDF reporting, and a Celery‑driven
automation layer.

It is written for **AI Engineer / Applied AI Engineer / AI Systems Engineer /
Backend AI Engineer / GenAI Engineer** audiences — recruiters, hiring managers,
and interview panels.

---

## 🎥 Demo

https://github.com/Juanllenato/prevensalud-ai-crm/raw/main/media/crm-ai-demo.mp4

> The AI features live: contextual assistant over business data, OCR invoice capture, and automated reporting.
> ▶ [Download / watch the demo](./media/crm-ai-demo.mp4)

---

## 30‑second pitch

PrevenSalud CRM+ replaces spreadsheets, WhatsApp groups, and manual commission math
for a healthcare sales business with multiple branches. It is an **AI systems
engineering** project: a retrieval‑augmented assistant that answers business
questions over live operational data, an **OCR pipeline** that turns a photo of an
invoice sent over WhatsApp into a structured, approvable expense, and an **automated
reporting engine** that writes and delivers an executive PDF every night. All of it
runs behind a hardened, multi‑tenant backend with row‑level security, RBAC, rate
limiting, and audit logging.

---

## What's inside this case study

| Folder | What it contains |
|---|---|
| [`case-study/`](./case-study/CASE_STUDY.md) | The narrative case study — problem, solution, AI features, decisions, challenges, results |
| [`architecture/`](./architecture/ARCHITECTURE.md) | Architecture analysis, technical stack, strengths, scalability & production‑readiness |
| [`system-design/`](./system-design/SYSTEM_DESIGN.md) | Mermaid diagrams: component, request, OCR, AI assistant, PDF, auth & deploy flows |
| [`documentation/`](./documentation/FEATURES.md) | Per‑feature deep docs, engineering notes, and the technical README |
| [`portfolio-content/`](./portfolio-content/PORTFOLIO_CONTENT.md) | LinkedIn summary, GitHub blurb, recruiter descriptions, stack highlights |
| [`html-presentation/`](./html-presentation/index.html) | A polished, dark‑mode HTML showcase site (open `index.html` in a browser) |

---

## The system at a glance

- **Backend:** Python 3.12 · FastAPI (async) · SQLAlchemy 2.0 (async) · Pydantic v2 · asyncpg
- **Data:** PostgreSQL with **Row‑Level Security** multi‑tenancy · Redis 7 cache/queue
- **AI/LLM:** **DeepSeek‑V3 via Together AI** (OpenAI‑compatible) for the conversational
  assistant · **Claude Haiku** (Anthropic) for opt‑in vision OCR
- **OCR:** multi‑engine — **Tesseract** (local default) → **Google Cloud Vision** →
  **Claude Haiku Vision** (cost‑first design)
- **Messaging:** Twilio WhatsApp Business API (webhook + outbound)
- **Reporting:** ReportLab vector PDFs with KPI cards, funnels, and charts
- **Automation:** Celery 5.3 + Celery Beat (nightly reports, collections alerts, view refresh)
- **Frontend:** Next.js 14 (App Router) · React 18 · TanStack Query · Tailwind + ShadCN
- **Security:** JWT RS256 · bcrypt · Fernet PII encryption · slowapi rate limiting · audit log
- **Infra:** Docker Compose · Hetzner VPS · nginx · Sentry

> **Scale (grounded):** multi‑tenant by branch (`sucursal`), ~30 data models across
> ~33 API routers, 9‑role RBAC. Currently serving a two‑branch operation in Lima, Perú
> (Soles, IGV 18%), architected to add branches and tenants without code changes.

---

## AI engineering highlights

1. **Retrieval‑augmented business assistant** — keyword‑routed module retrieval queries
   *only* the tables relevant to a question, sends **aggregated metrics (zero PII)** to
   the LLM, and gates data by a per‑user access policy.
2. **Defense‑in‑depth prompt‑injection handling** — control‑token stripping, a cheap
   jailbreak heuristic that blocks before spending tokens, and XML‑delimited user input.
3. **Cost‑aware multi‑engine OCR** — free local Tesseract handles the common case;
   paid vision models are opt‑in, with graceful fallback.
4. **LLM‑authored executive reports** with a **deterministic fallback** so a model
   outage never breaks the nightly report.
5. **AI woven into real workflows**, not bolted on: WhatsApp invoice capture, sales
   attendance assistance, and partner Q&A all live inside the operational system.

---

## How to read this

- **Recruiters / non‑technical:** open [`html-presentation/index.html`](./html-presentation/index.html)
  and read [`portfolio-content/PORTFOLIO_CONTENT.md`](./portfolio-content/PORTFOLIO_CONTENT.md).
- **Engineers / interviewers:** start with [`case-study/CASE_STUDY.md`](./case-study/CASE_STUDY.md),
  then [`architecture/ARCHITECTURE.md`](./architecture/ARCHITECTURE.md) and
  [`system-design/SYSTEM_DESIGN.md`](./system-design/SYSTEM_DESIGN.md).

---

## Contact / attribution

> **Author:** Juan Sebastian Perez — AI / Backend Engineer
> - Email: [juans.perezc@gmail.com](mailto:juans.perezc@gmail.com)
> - LinkedIn: [linkedin.com/in/juan-perez-91b797251](https://www.linkedin.com/in/juan-perez-91b797251/)
> - GitHub: [github.com/Juanllenato](https://github.com/Juanllenato)
> - Live system: https://crm.prevensalud.pe (production; access is restricted to staff)

*This documentation describes a real production system. Source code and customer data
are private; this case study presents architecture and engineering only — no
proprietary code or PII is reproduced.*
