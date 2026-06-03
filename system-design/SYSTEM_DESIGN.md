# System Design — PrevenSalud CRM+

Mermaid diagrams for the major flows. They render on GitHub and in the HTML showcase
(`../html-presentation/index.html`). Every diagram reflects the actual implementation.

---

## 1. Component / container diagram

```mermaid
flowchart TB
    subgraph Clients
        B["Browser — Next.js 14 dashboard"]
        WA["WhatsApp — staff & clients"]
    end

    NGINX["nginx — TLS, reverse proxy"]

    subgraph API["FastAPI (async) — ~33 routers"]
        MW["Middleware: rate-limit · security headers · audit · CORS · JWT/RBAC · RLS context"]
        R1["Sales / Payments / Collections / Commissions"]
        R2["Expenses / Appointments / Clients / Products / Payroll"]
        R3["AI Assistant · Reports · Presence · Admin"]
    end

    subgraph Domain["Services & Integrations"]
        CE["comision_engine"]
        RP["reporte_pdf (ReportLab)"]
        LLM["LLMService → DeepSeek-V3 (Together AI)"]
        OCR["vision_ocr → Tesseract / Google Vision / Claude Haiku"]
        TW["whatsapp → Twilio"]
    end

    subgraph Data
        PG[("PostgreSQL — Row-Level Security")]
        RD[("Redis — cache + broker")]
    end

    subgraph Async["Celery + Celery Beat"]
        T1["Nightly partner reports (8 PM)"]
        T2["Collections sweep (9 AM)"]
        T3["Materialized view refresh (5 min)"]
        T4["OCR invoice processing"]
    end

    EXT["External APIs: Together AI · Anthropic · Google Vision · Twilio"]

    B -->|HTTPS| NGINX --> API
    WA -->|Webhook HMAC-SHA1| API
    MW --> R1 & R2 & R3
    R1 & R2 & R3 --> Domain
    Domain --> PG
    Domain --> RD
    LLM & OCR & TW --> EXT
    Async --> PG
    Async --> RD
    Async --> EXT
    RD <-->|broker| Async
```

---

## 2. Authentication & multi‑tenant request flow

```mermaid
sequenceDiagram
    autonumber
    participant U as Browser
    participant N as nginx
    participant A as FastAPI
    participant DB as PostgreSQL (RLS)

    U->>N: POST /auth/login (email, password)
    N->>A: forward (rate-limit 10/min)
    A->>DB: SELECT usuario WHERE email
    A->>A: verify bcrypt hash, check activo
    A-->>U: access JWT (RS256, 480m) + refresh JWT (7d)

    Note over U,A: Subsequent protected request
    U->>A: GET /api/v1/... (Bearer JWT, X-Sucursal-Id)
    A->>A: decode JWT, validate exp/jti/type
    A->>DB: load user, check activo & password_changed_at
    A->>A: narrow sucursales_visibles via X-Sucursal-Id
    A->>DB: SET app.current_tenant_id (RLS context)
    A->>A: require_roles(...) RBAC check
    A->>DB: query (RLS + app scope → tenant-correct)
    A-->>U: JSON (only this branch's data)
```

---

## 3. AI assistant — contextual retrieval flow

```mermaid
flowchart TD
    Q["User question (POST /asistente/chat)"] --> CFG{ConfiguracionAI.activo?}
    CFG -- no --> E403["403 — assistant disabled"]
    CFG -- yes --> SAN["Sanitize: strip control tokens, collapse whitespace"]
    SAN --> INJ{Jailbreak heuristic?}
    INJ -- match --> SAFE["Return safe refusal (no LLM cost)"]
    INJ -- clean --> INT{PDF/report intent?}
    INT -- yes & role ok --> ACT["Return download action (no LLM call)"]
    INT -- no --> ROUTE["Keyword router → relevant modules only"]
    ROUTE --> POL["Apply access policy: level + module + sensitive flags"]
    POL --> QRY["Per-module single FILTER-aggregate query (tenant-scoped)"]
    QRY --> CTX["Build context: counts/sums/group-bys + advisor roster (NO PII)"]
    CTX --> PROMPT["Assemble: system rules + prefs + history + &lt;consulta_usuario&gt;"]
    PROMPT --> LLM["LLMService → DeepSeek-V3 (45s timeout, bounded tokens)"]
    LLM --> PERSIST["Persist conversation (JSON)"]
    PERSIST --> RESP["ChatResponse {respuesta, contexto_usado, conversacion_id}"]
```

---

## 4. OCR invoice processing over WhatsApp

```mermaid
sequenceDiagram
    autonumber
    participant U as Admin (WhatsApp)
    participant TW as Twilio
    participant W as /whatsapp/webhook
    participant C as Celery worker
    participant O as OCR engines
    participant DB as PostgreSQL

    U->>TW: Send invoice photo
    TW->>W: POST webhook (image, From, signature)
    W->>W: Verify HMAC-SHA1 (fail-closed) + role ∈ {ADMIN, HOSTESS}
    W-->>TW: 200 TwiML (immediate, async)
    W->>C: enqueue procesar_factura(media_url, user, sucursal)
    C->>TW: download image (Basic auth) + preprocess (Pillow)
    C->>O: Tesseract (default) → Google Vision / Claude Haiku (opt-in)
    O-->>C: {monto, fecha, proveedor, referencia}
    C->>C: validate fields (amount/date/length)
    C->>DB: INSERT Egreso (PENDIENTE_CONFIRMACION, ocr_datos_raw)
    C->>TW: send parsed summary + options
    TW-->>U: "Proveedor/Monto/Fecha — SI / NO / CORREGIR campo=valor"
    U->>TW: "SI" (or "CORREGIR monto=125000")
    TW->>W: POST reply
    W->>DB: confirm (CONFIRMADO) / patch whitelisted field / reject
```

---

## 5. Automated executive PDF report

```mermaid
sequenceDiagram
    autonumber
    participant BEAT as Celery Beat (8 PM)
    participant T as reportes_diarios task
    participant DB as PostgreSQL (RLS per branch)
    participant LLM as LLMService
    participant RL as ReportLab (threadpool)
    participant TW as Twilio

    BEAT->>T: trigger generar_y_enviar()
    loop per sucursal
        T->>DB: set tenant context (RLS)
        T->>DB: recolectar_datos (income, expenses, commissions, funnel, methods, series) + previous period
        T->>LLM: generate_reporte_diario(payload)
        alt LLM available
            LLM-->>T: executive narrative
        else LLM down
            T->>T: deterministic fallback narrative
        end
        T->>RL: run_in_threadpool(construir_pdf, ...)
        RL-->>T: PDF bytes (KPI cards w/ deltas, funnel, charts, advisor table)
        T->>TW: send PDF to each partner
    end
```

> The same `generar_reporte_pdf` path backs the in‑app, role‑gated, rate‑limited
> (`8/minute;40/hour`) `GET /reportes/pdf` endpoint.

---

## 6. Collections (cobranza) automation

```mermaid
flowchart LR
    BEAT["Celery Beat — 9 AM"] --> SCAN["Find Pago: estado=PENDIENTE AND fecha_programada &lt; today"]
    SCAN --> FLIP["Batch UPDATE → VENCIDO"]
    FLIP --> GROUP["Group overdue by cliente"]
    GROUP --> MSG["Send WhatsApp reminder per client"]
    SCAN --> NONE{none overdue?}
    NONE -- yes --> SKIP["No-op"]
```

---

## 7. Deployment topology

```mermaid
flowchart TB
    DEV["Developer — git push (feature branch)"] --> GH["GitHub"]
    GH --> DEPLOY["deploy.sh — SSH to VPS"]
    subgraph VPS["Hetzner VPS"]
        NG["nginx (TLS)"]
        subgraph DC["Docker Compose"]
            API["prevensalud_api (127.0.0.1:8000)"]
            FE["prevensalud_frontend"]
            RDS["prevensalud_redis"]
            CW["prevensalud_celery"]
            CB["prevensalud_celery_beat"]
        end
    end
    PG[("Managed PostgreSQL — Supabase pooler, NullPool")]
    SENTRY["Sentry"]

    DEPLOY -->|pull · build · alembic upgrade · restart| DC
    NG --> FE
    NG --> API
    API --> PG
    API --> RDS
    CW --> PG
    CB --> RDS
    API --> SENTRY
    CW --> SENTRY
```

---

## 8. Simplified data model (tenant‑scoped core)

```mermaid
erDiagram
    SUCURSAL ||--o{ USUARIO : has
    SUCURSAL ||--o{ CLIENTE : has
    SUCURSAL ||--o{ VENTA : has
    USUARIO ||--o{ VENTA : "sells (vendedor_id)"
    CLIENTE ||--o{ VENTA : "buys"
    VENTA ||--o{ PAGO : "installments (≤4)"
    VENTA ||--o{ COMISION : "generates"
    USUARIO ||--o{ COMISION : "earns"
    CLIENTE ||--o{ CITA : "appointments"
    SUCURSAL ||--o{ EGRESO : "expenses (OCR)"
    USUARIO ||--o{ CONFIGURACION_AI : "AI access policy"

    SUCURSAL {
        uuid id PK
        string nombre
    }
    USUARIO {
        uuid id PK
        uuid sucursal_id FK
        enum rol "9 roles"
        string nombre_completo
        string dni "Fernet-encrypted"
    }
    VENTA {
        uuid id PK
        uuid sucursal_id FK
        uuid vendedor_id FK
        decimal monto_total
        enum estado
        date fecha_venta
    }
    PAGO {
        uuid id PK
        uuid venta_id FK
        int numero_cuota
        decimal monto
        enum estado "PENDIENTE/PAGADO/VENCIDO/ANULADO"
        date fecha_programada
    }
    COMISION {
        uuid id PK
        uuid usuario_id FK
        uuid venta_id FK
        enum tipo "6 types"
        decimal monto
        string periodo_quincena
    }
    EGRESO {
        uuid id PK
        uuid sucursal_id FK
        decimal monto
        enum estado
        json ocr_datos_raw
    }
    CONFIGURACION_AI {
        uuid usuario_id FK
        string nivel_acceso
        string modulos_habilitados
        bool puede_consultar_cartera
    }
```

> All operational tables inherit `TenantMixin` (`sucursal_id`) and `TimeStampMixin`
> (`created_at`/`updated_at`). `audit_logs` is intentionally global and INSERT‑only.
