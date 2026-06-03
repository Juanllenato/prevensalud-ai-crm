# Technical README — PrevenSalud CRM+

A developer‑oriented overview of the production system: stack, repository layout, runtime
topology, configuration, and operational commands. (Documentation only — no proprietary
source is reproduced.)

---

## Stack

- **Backend:** Python 3.12 · FastAPI (async) · SQLAlchemy 2.0 (async) · Pydantic v2 ·
  Alembic · asyncpg
- **Database:** PostgreSQL with Row‑Level Security (prod: managed/Supabase PG 17; dev:
  postgres:16 / SQLite)
- **Cache / queue:** Redis 7 · Celery 5.3 (+ Celery Beat)
- **AI:** DeepSeek‑V3 via Together AI (assistant) · Claude Haiku (vision OCR) · Tesseract ·
  Google Cloud Vision
- **Messaging:** Twilio WhatsApp Business API
- **Reporting:** ReportLab 4
- **Frontend:** Next.js 14 (App Router) · React 18 · TanStack Query · Axios · Tailwind +
  ShadCN
- **Security:** JWT RS256 · passlib/bcrypt · Fernet (PII) · slowapi (Redis)
- **Infra:** Docker Compose · Hetzner VPS · nginx · Sentry

---

## Repository layout (backend)

```
backend/app/
├── api/v1/            # ~33 routers (auth, ventas, pagos, cobranza, comisiones,
│                      #   egresos, citas, clientes, productos, nomina, asistente,
│                      #   reportes, presencia, sucursales, usuarios, ...)
├── core/              # security (JWT/RBAC/encryption), database (RLS), config, cache,
│                      #   rate_limit
├── models/            # ~30 SQLAlchemy models (TenantMixin + TimeStampMixin)
├── schemas/           # Pydantic v2 in/out schemas
├── services/          # comision_engine, manifiesto, reporte_pdf, venta/cartera services
├── integrations/      # llm (DeepSeek), vision_ocr (Tesseract/Vision/Claude), whatsapp (Twilio)
├── middleware/        # security_headers, audit
└── main.py            # app factory, router registration, middleware chain, lifespan

workers/
├── celery_app.py      # production Celery config + Beat schedule
└── tasks/             # reportes_diarios, alertas_cobranza, ocr_processing, whatsapp_sender

frontend/
├── app/(auth)/        # login
├── app/(dashboard)/   # role-aware dashboard, ventas, clientes, financiero, agenda, reportes
├── components/        # ui (ShadCN), ventas, financiero, shared
└── lib/               # api.ts (Axios + X-Sucursal-Id), auth.tsx, providers, theme
```

---

## Runtime topology

Docker Compose services: `api`, `frontend`, `redis`, `celery_worker`, `celery_beat`.
In production these run on a Hetzner VPS behind **nginx** (TLS); the API listens on
`127.0.0.1:8000` only and runs `uvicorn --proxy-headers --forwarded-allow-ips=*`. The
database is managed PostgreSQL accessed via the pooler with `NullPool`.

---

## Configuration (environment)

Key settings (validated fail‑fast in production by `core/config.py`):

```
DATABASE_URL / DATABASE_URL_SYNC      # asyncpg + sync (Alembic)
REDIS_URL                             # cache + Celery broker/backend
SECRET_KEY / ENCRYPTION_KEY           # ≥ 32 chars
JWT_ALGORITHM=RS256 + JWT_PRIVATE_KEY / JWT_PUBLIC_KEY
LLM_API_KEY / LLM_BASE_URL / LLM_MODEL / LLM_MAX_TOKENS   # Together AI / DeepSeek-V3
ANTHROPIC_API_KEY                     # Claude Haiku (vision OCR)
GOOGLE_APPLICATION_CREDENTIALS        # Google Cloud Vision (optional engine)
TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM / TWILIO_WEBHOOK_SECRET
SENTRY_DSN                            # error tracking
APP_ENV=production
```

Production validation rejects: localhost/http CORS origins, missing RS256 keys, short
secrets, and placeholder Twilio webhook secrets.

---

## Common operations

```bash
# Local dev
docker compose up -d                      # api + db + redis + frontend + workers
alembic upgrade head                      # migrations
pytest tests/unit/test_comision_engine.py # the financial core's test suite

# Quality gates
ruff check app/ && ruff format app/
mypy app/
bandit -r app/ -ll

# Production deploy (scripted)
bash deploy.sh                            # pull → build → alembic upgrade → restart
bash deploy.sh --skip-migrations          # skip alembic
bash deploy.sh --quick                    # restart only

# Backup (PG 17 dump)
pg_dump --no-owner --no-acl -F c -f backup.dump "$DATABASE_URL_SYNC"
```

---

## Security posture (summary)

- JWT RS256 (fixed algorithm), bcrypt passwords, `password_changed_at` invalidation.
- 9‑role RBAC via `require_roles`; only SUPERADMIN manages SOCIO (anti‑privilege‑escalation).
- Multi‑tenant: PostgreSQL RLS + app‑level filtering + `X‑Sucursal‑Id` request scoping.
- Fernet encryption for PII (DNI, medical data).
- slowapi + Redis rate limiting on auth, AI chat, OCR, and PDF endpoints.
- Twilio webhook HMAC‑SHA1 verification (fail‑closed).
- Security headers (HSTS/CSP/etc.) + non‑blocking audit logging (SHA‑256 body hash).
- 3‑layer prompt‑injection defense on the AI assistant.

---

## Known gaps / roadmap

See [`../case-study/CASE_STUDY.md`](../case-study/CASE_STUDY.md) §12 and
[`FEATURES.md`](./FEATURES.md) TODOs. Headlines: MFA/TOTP, token revocation list, audit/AI
retention policy, service‑layer consolidation, CI security gates, circuit breakers.
