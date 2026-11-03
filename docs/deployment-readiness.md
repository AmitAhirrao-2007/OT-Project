# EV Route Planner — Production Deployment Readiness & Operations Runbook

**Document ID**: DOC-OPS-001  
**Project**: EV Route Planner (Phase 6 Final Optimization & Verification)  
**Authors**: EV Routing & Infrastructure Engineering Team  
**Date**: October 2026  
**Baseline Status**: 181 Tests Passing, 0 Typecheck Errors, Production Build Verified  

---

## 1. Executive Summary & Four-Tier Readiness Evaluation

This document assesses the production maturity of the EV Route Planner system. To prevent premature public exposure while recognizing operational milestones, we formally classify system readiness across four operational tiers:

```text
===================================================================================================
Tier Classification                 Readiness Status   Key Milestone Met / Prerequisite Needed
===================================================================================================
1. Academic Demonstration Readiness    READY (100%)     Verified mathematical formulation, 0% gap,
                                                        20 deterministic benchmark tests, report.
---------------------------------------------------------------------------------------------------
2. Local Application Readiness         READY (100%)     Vite client + Express proxy running smoothly,
                                                        responsive UI, full interactive features.
---------------------------------------------------------------------------------------------------
3. Staging Deployment Readiness        READY WITH        Requires Docker containerization, cloud
                                       PREREQUISITES    environment variables, and PostgreSQL setup.
---------------------------------------------------------------------------------------------------
4. Public Production Readiness         NOT READY        Requires commercial CPO roaming agreements,
                                                        PostGIS spatial database, live driver traffic.
===================================================================================================
```

---

## 2. Technical Audit: Single-Instance Prototype vs Production Scale

The current prototype is engineered as a lightweight, single-process application suitable for local research and demonstrations:
- **Frontend**: Vite + React 18 + TailwindCSS single-page application.
- **Backend / Proxy**: Node.js + Express proxy server (`server/ocpiProxyServer.ts`).
- **Data Persistence**: Local JSON file storage (`server/data/communityReports.json`).

### 2.1 Production Gap Analysis

| System Dimension | Current Prototype Baseline | Production Target Architecture | Gap Severity |
|---|---|---|---|
| **Data Storage** | Local flat JSON file | PostgreSQL 16 + PostGIS extension | High |
| **Identity & Auth** | Server-side HMAC guest masking | OAuth 2.0 / OIDC (Auth0 / Google) | Medium |
| **API Caching** | In-memory 60-second cache | Distributed Redis Cluster | Medium |
| **Web Security** | Permissive local CORS | Strict CSP headers, Cloudflare WAF | High |
| **Scalability** | Single Node process | Multi-container Kubernetes cluster | Medium |
| **Monitoring** | Console output | Prometheus + Grafana + OpenTelemetry | Medium |

---

## 3. Database Migration Architecture (JSON to PostGIS)

To scale beyond a single instance and support concurrent writes from thousands of mobile drivers, local JSON storage must be migrated to a relational spatial database.

### Recommended PostgreSQL Schema
```sql
-- Charging Stations Core Table
CREATE TABLE charging_stations (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    operator_name VARCHAR(128) NOT NULL,
    coordinates GEOMETRY(Point, 4326) NOT NULL,
    highway_id VARCHAR(64),
    carriageway_direction VARCHAR(32) NOT NULL,
    max_power_kw NUMERIC(6, 2) NOT NULL,
    total_stalls INT NOT NULL,
    tariff_inr_per_kwh NUMERIC(6, 2) NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Spatial Index for Fast Corridor Bounding-Box Lookups
CREATE INDEX idx_stations_spatial ON charging_stations USING GIST(coordinates);

-- Community Feedback Reports
CREATE TABLE community_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    station_id VARCHAR(64) REFERENCES charging_stations(id),
    contributor_hash VARCHAR(64) NOT NULL,
    contributor_role VARCHAR(32) NOT NULL,
    overall_outcome VARCHAR(32) NOT NULL,
    charging_speed_kw NUMERIC(6, 2),
    wait_time_minutes INT,
    flags JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_reports_station_date ON community_reports(station_id, created_at DESC);
```

---

## 4. Security Hardening Checklist

Prior to staging deployment, the following security controls must be enabled in `server/ocpiProxyServer.ts`:

- [x] **Keyed HMAC Contributor Masking**: Implemented in Phase 6 (`crypto.createHmac('sha256', process.env.CONTRIBUTOR_HMAC_SALT)`), preventing dictionary reversal of client IP addresses.
- [ ] **HTTP Security Headers**: Install and configure `helmet` for strict `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, and `Strict-Transport-Security`.
- [ ] **Rate Limiting**: Configure `express-rate-limit` (limit report submissions to 5 per IP per hour; limit routing requests to 60 per IP per minute).
- [ ] **Input Sanitization**: Validate all incoming report payloads against a strict Zod schema before processing.
- [ ] **CORS Restriction**: Replace `app.use(cors())` with an explicit origin whitelist matching the production domain.

---

## 5. Operations & Deployment Runbooks

### 5.1 Deployment Runbook (Staging Container Release)

1. **Pre-Flight Validation**:
   ```bash
   npm run typecheck
   npm test
   npm run build
   ```
   *Requirement: Zero TypeScript errors, 100% test pass rate across all 9 test suites.*

2. **Docker Container Build**:
   ```dockerfile
   # Example Multi-Stage Dockerfile
   FROM node:20-alpine AS builder
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci
   COPY . .
   RUN npm run build

   FROM node:20-alpine AS runner
   WORKDIR /app
   COPY --from=builder /app/dist ./dist
   COPY --from=builder /app/server ./server
   COPY --from=builder /app/package*.json ./
   RUN npm ci --only=production
   EXPOSE 3001
   CMD ["node", "server/ocpiProxyServer.ts"]
   ```

3. **Deploy & Health Check**:
   ```bash
   curl -f http://localhost:3001/api/health || exit 1
   ```

### 5.2 Rollback Runbook (Automated Recovery)

If production error rates exceed $1.0\%$ or latency exceeds $500\ \text{ms}$:
1. Trigger blue-green router diversion to the previous stable release container image.
2. If data corruption occurs in the JSON reports store:
   - Restore `server/data/communityReports.json` from the most recent hourly backup snapshot:
     ```bash
     cp /backups/reports/communityReports_$(date -d '1 hour ago' +%Y%m%d_%H00).json server/data/communityReports.json
     ```
3. Restart proxy process:
   ```bash
   pm2 reload ocpiProxyServer
   ```

