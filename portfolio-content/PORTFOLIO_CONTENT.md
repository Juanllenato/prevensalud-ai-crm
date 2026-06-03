# Portfolio Content — PrevenSalud CRM+

Ready‑to‑use copy for LinkedIn, GitHub, your portfolio site, and recruiter conversations.
Optimized for **AI Engineer / Applied AI Engineer / AI Systems Engineer / Backend AI
Engineer / GenAI Engineer** roles.

> **Author:** Juan Sebastian Perez · [juans.perezc@gmail.com](mailto:juans.perezc@gmail.com) ·
> [LinkedIn](https://www.linkedin.com/in/juan-perez-91b797251/) ·
> [GitHub](https://github.com/Juanllenato)
>
> Keep the quantified claims honest — fill the `TODO` metrics with numbers you can defend in
> an interview.

---

## 1. One‑line headline

> **Built and shipped a production, AI‑powered CRM** — a multi‑tenant FastAPI platform with a
> retrieval‑augmented business assistant, OCR‑over‑WhatsApp invoice capture, and automated
> LLM‑written executive reporting.

---

## 2. Short project description (portfolio card)

**PrevenSalud CRM+ — Production AI Business Platform**
An AI‑powered operations platform for a multi‑branch healthcare sales business. A contextual
AI assistant answers finance/operations questions over live, access‑controlled data
(retrieval‑augmented, PII‑free); an OCR pipeline turns a WhatsApp invoice photo into an
approvable expense; and a nightly engine generates and delivers CFO‑grade PDF reports.
Built on async FastAPI, multi‑tenant PostgreSQL with Row‑Level Security, Redis/Celery, and
DeepSeek/Claude — hardened with RBAC, rate limiting, prompt‑injection defenses, and audit
logging. **Live in production.**

`Python · FastAPI · SQLAlchemy(async) · PostgreSQL(RLS) · Redis · Celery · DeepSeek‑V3 ·
Claude · Tesseract/Google Vision · Twilio · ReportLab · Next.js 14`

---

## 3. LinkedIn "About"/featured summary

> I design and ship **applied‑AI backend systems** — and PrevenSalud CRM+ is the one I'm
> proudest of. It's a real, in‑production platform that runs a multi‑branch healthcare sales
> operation, and it's where I got to do AI systems engineering for real, not in a notebook.
>
> The centerpiece is a **contextual AI assistant**: a retrieval‑augmented layer that routes
> a natural‑language question to only the relevant business data, sends the LLM **aggregated
> metrics with zero customer PII**, enforces a per‑user access policy, and defends against
> prompt injection in three layers. Around it I built an **OCR‑over‑WhatsApp** pipeline
> (cost‑first: free local Tesseract by default, paid vision models opt‑in) that captures
> expenses at the source, and an **automated reporting engine** that writes an executive PDF
> with an LLM — with a deterministic fallback so it never fails.
>
> Underneath: async FastAPI, SQLAlchemy 2.0, **PostgreSQL with Row‑Level Security**
> multi‑tenancy (defense in depth), Redis/Celery automation, JWT RS256 + RBAC, Fernet PII
> encryption, and a `Decimal`‑precise, 800‑line‑tested commission engine. Deployed with
> Docker/nginx, monitored with Sentry.
>
> If you're hiring for **AI / Applied AI / Backend AI / GenAI Engineering**, this is the kind
> of production, business‑grounded AI I build.

---

## 4. LinkedIn post (announcement style)

> 🚀 Shipped: **PrevenSalud CRM+**, a production AI‑powered CRM for a multi‑branch healthcare
> sales business.
>
> The fun part isn't "it calls an LLM" — it's making AI **safe and grounded** in a real,
> multi‑tenant operation:
>
> 🧠 A retrieval‑augmented assistant that answers business questions over live data — routing
> each question to only the tables it needs and sending the model **aggregated metrics, zero
> PII**.
> 🧾 OCR over WhatsApp: photograph an invoice → structured, one‑tap‑approve expense
> (cost‑first: free Tesseract default, paid vision opt‑in).
> 📊 Nightly LLM‑written executive PDF reports — with a deterministic fallback so they never
> fail.
> 🔒 Multi‑tenant Row‑Level Security, JWT RS256 + RBAC, rate limiting, 3‑layer
> prompt‑injection defense, audit logging.
>
> Stack: FastAPI · SQLAlchemy(async) · PostgreSQL(RLS) · Redis/Celery · DeepSeek‑V3/Together
> AI · Claude · Twilio · ReportLab · Next.js 14.
>
> #AIEngineering #AppliedAI #BackendEngineering #GenAI #LLM #Python #FastAPI

---

## 5. GitHub project summary (README top)

> ### PrevenSalud CRM+ — Production AI Business Platform
> Multi‑tenant FastAPI CRM with a retrieval‑augmented AI assistant, OCR‑over‑WhatsApp invoice
> capture, and automated LLM‑written PDF reporting. PostgreSQL Row‑Level Security, Redis/Celery
> automation, JWT RS256 + RBAC, prompt‑injection defenses. **In production.**
>
> **Highlights:** targeted RAG over operational data (PII‑free) · cost‑first multi‑engine OCR ·
> deterministic LLM‑report fallback · `Decimal`‑precise, 800‑line‑tested commission engine ·
> defense‑in‑depth multi‑tenancy.

---

## 6. Recruiter‑friendly descriptions

**Non‑technical (1 sentence).**
> I built and run a live, AI‑powered business platform that lets a multi‑branch company ask
> its data questions in plain language, snap a photo of an invoice to record an expense, and
> receive an automatic nightly financial report.

**Semi‑technical (3 sentences).**
> PrevenSalud CRM+ is a production SaaS that puts AI inside everyday operations: a contextual
> assistant answers finance/operations questions over live company data without exposing any
> personal information, an OCR pipeline reads invoices sent over WhatsApp, and an automated
> engine writes and delivers executive PDF reports each night. It runs on an async Python
> (FastAPI) backend with a secure, multi‑tenant PostgreSQL database, Redis/Celery automation,
> and integrations with DeepSeek, Claude, Google Vision, and Twilio. I designed the
> architecture, the AI workflows, the security model, and the deployment.

---

## 7. Résumé bullet points

- Designed and shipped a **production multi‑tenant AI CRM** (FastAPI · SQLAlchemy async ·
  PostgreSQL RLS · Redis/Celery) serving a multi‑branch sales operation.
- Built a **retrieval‑augmented AI assistant** with keyword‑routed module retrieval,
  **PII‑free aggregated context**, per‑user access policy, and **3‑layer prompt‑injection
  defense** (DeepSeek‑V3 via Together AI).
- Engineered a **cost‑first multi‑engine OCR pipeline** (Tesseract → Google Vision → Claude
  Haiku) over **WhatsApp** with human‑in‑the‑loop confirmation and inline corrections.
- Automated **LLM‑written executive PDF reporting** (ReportLab, threadpool render) with a
  **deterministic fallback** for model outages, delivered nightly via Celery Beat + Twilio.
- Implemented **defense‑in‑depth multi‑tenancy** (Row‑Level Security + app filtering +
  request‑scoped branch selector), **JWT RS256 + 9‑role RBAC**, Fernet PII encryption,
  Redis‑backed rate limiting, and audit logging.
- Authored a `Decimal`‑precise **commission engine** with an **800‑line unit test suite**
  covering fortnight timing, group‑target gating, bonuses, and per‑user overrides.

---

## 8. Architecture highlights (for interviews)

- **Targeted RAG, not big‑prompt:** 1–3 aggregate queries per question; ~5–15 KB context;
  zero PII to the model.
- **Multi‑tenant defense in depth:** a data leak requires three independent failures.
- **Fail‑soft everything:** Redis, LLM, OCR, and WhatsApp degrade gracefully; the nightly
  report has a deterministic narrative fallback.
- **Async + offload:** async FastAPI/SQLAlchemy; PDF render in a threadpool; OCR in Celery
  workers that scale independently.
- **Correctness where it counts:** `Decimal` money math + 800‑line tested commission engine.

---

## 9. AI engineering highlights (for GenAI roles)

- Production **RAG over structured operational data** with access control and tenant scoping.
- **Prompt engineering for reliability:** system prompt distinguishes "no records" vs. "no
  access," forbids invented numbers, and stays on‑domain (finance/operations only).
- **Prompt‑injection mitigation:** control‑token sanitization, pre‑LLM jailbreak heuristics
  (block before spending tokens), XML‑delimited user input.
- **Cost‑aware model routing:** free local OCR default, paid vision/LLM bounded and
  rate‑limited; provider‑agnostic `LLMService` abstraction.
- **Resilient LLM integration:** timeouts, bounded tokens, retries, and deterministic
  fallbacks so the product never depends on a model being up.

---

## 10. Talking points / likely interview questions

- *"How do you keep PII out of the LLM?"* → The context builder only emits aggregates and
  staff rosters; it never selects customer PII columns.
- *"How do you stop prompt injection?"* → Three layers: sanitize control tokens, a cheap
  heuristic that blocks jailbreaks before any token spend, and XML‑delimited input treated as
  data.
- *"How is multi‑tenancy enforced?"* → RLS at the DB, app‑level filtering, and a request‑scoped
  `X‑Sucursal‑Id` selector — defense in depth.
- *"What happens when the LLM is down?"* → The nightly report ships a deterministic narrative;
  the assistant returns a clean error; nothing core breaks.
- *"What was the hardest bug?"* → Stacked rate‑limit decorators silently not enforcing; fixed
  with single‑decorator `;` syntax and verified with parallel request bursts.

---

## 11. Suggested visuals

- Hero screenshot of the dashboard (dark glassmorphism).
- The AI assistant answering a business question.
- A generated PDF report page (KPI cards + charts).
- The WhatsApp OCR confirmation flow.
- The Mermaid component diagram from `system-design/SYSTEM_DESIGN.md`.

> **TODO:** capture these screenshots from production (redact any real PII) and drop them into
> `../html-presentation/assets/`.
