# EV Route Planner — ABRP Clone & RCSP Optimization Engine

A high-performance Electric Vehicle (EV) route-planning platform inspired by the public capabilities of A Better Routeplanner (ABRP), focused on India's national highway corridors. Developed as an academic Optimization Techniques project.

---

## 1. Routing Engines Overview

The application features two distinct calculation engines that users can select between in **Plan Options**:

```
                                 [ User Trip Request ]
                                           │
                        Is Patna → Delhi Demo Corridor?
                                 /              \
                             [YES]              [NO]
                               /                  \
              [ Calibrated Demo Fixture ]      [ Dynamic Custom Router ]
              - 3 verified alternatives                   │
              - Purvanchal / NH-31 links      useRcspOptimizer Enabled?
              - Pre-calibrated geometry                  /        \
                                                     [NO]          [YES]
                                                     /                \
                                    [ Greedy Heuristic ]      [ RCSP Solver ]
                                    - Strategy loops          - Label setting
                                    - Forward reachability    - 5% SoC discretization
                                    - Local scoring           - Dominance pruning
                                                              - OSRM Road Revalidation
```

### A. Greedy Heuristic Engine (Default)
- **Heuristic**: Forward step-by-step corridor greedy search.
- **Strategies**:
  - `Optimal`: Target SoC ~72%, balances charging speed on the steep part of the DC taper curve.
  - `Fewer stops`: Target SoC ~82%, stretches legs with longer charging dwell times.
  - `Fewest stops`: Target SoC ~90%, minimizes stop count by deeply utilizing battery capacity.
- **Local Scoring**: Evaluates candidate chargers reachable within current SoC reserve, scoring progression along corridor, charging speed (kW), preferred network bonus, and lateral detour penalty.

### B. Resource-Constrained Shortest Path (RCSP) Optimizer
- **Formulation**: Label-setting shortest path algorithm on an acyclic progression graph $G = (V, E)$.
- **Nodes ($V$)**: Origin node, destination node, and eligible charging stations projected along the route corridor ($5\text{ mi} < \text{distFromOrigin} < \text{roadDistance} - 5\text{ mi}$ and lateral detour $\le 25\text{ mi}$).
- **State Labels ($L$)**: Each label at node $u$ tracks a tuple:
  $$L = (\text{nodeId}, \text{SoC}, T_{\text{elapsed}}, C_{\text{inr}}, \text{stops})$$
  where:
  - $\text{SoC} \in [0, 100]$: Remaining battery percentage on arrival.
  - $T_{\text{elapsed}}$: Total accumulated time (driving + charging + 5-min stop buffer).
  - $C_{\text{inr}}$: Total accumulated energy tariff expense in ₹ INR.
  - $\text{stops}$: Ordered sequence of charging stops selected so far.
- **Objective Function**: Lexicographic multi-objective minimization:
  1. **Primary**: Minimize total journey time $T_{\text{total}} = T_{\text{driving}} + T_{\text{charging}} + T_{\text{buffers}}$.
  2. **Secondary**: Minimize total charging expense $C_{\text{inr}}$ (tie-breaker).
  3. **Tertiary**: Minimize number of stops (tie-breaker).

---

## 2. Mathematical Consistency & Battery Constraints

1. **5% Battery-State Discretization**:
   To prevent exponential state-space explosion on dense highway networks while maintaining tractability in browser execution, candidate charging departure SoCs are discretized in $5\%$ increments:
   $$\text{targetSoC} \in \{\text{arrivalSoC} + 5\%, \dots, \min(100\%, \text{maxChargeLimit})\}$$
2. **Dominance Pruning**:
   A label $L_1$ dominates label $L_2$ at node $u$ if and only if $L_1$ provides at least as much battery energy in no more time, no higher expense, and no more stops:
   $$\text{SoC}_1 \ge \text{SoC}_2 \quad\wedge\quad T_1 \le T_2 \quad\wedge\quad C_1 \le C_2 \quad\wedge\quad |\text{stops}_1| \le |\text{stops}_2|$$
   Dominated labels are strictly pruned before propagating forward, ensuring state-space efficiency without discarding Pareto-optimal paths.
3. **Hard Battery Reserves**:
   - **Charger Arrival Reserve**: Vehicle must arrive at every intermediate charger with at least `preferredMinArrivalBatteryCharger` (default 10%).
   - **Destination Arrival Reserve**: Vehicle must arrive at final destination with at least `destinationArrivalSoc` (default 10%).
4. **Physical DC Taper Curve**:
   Uses a 4-stage piecewise charging power curve ($0\text{--}60\%$ peak power, $60\text{--}75\%$ ramp to $70\%$, $75\text{--}85\%$ ramp to $45\%$, $85\text{--}100\%$ trickle to $20\%$). Vehicle `maxDcChargingKw` and station `ratedPowerKw` limits are strictly enforced.

---

## 3. OSRM Road Geometry & Road-Leg Revalidation

1. **Candidate Path Reconstruction**:
   The RCSP solver initially evaluates corridor topology using straight-line (Haversine) progression distances.
2. **Real-Road OSRM Integration**:
   Once the candidate stop sequence is selected:
   $$\text{Origin} \longrightarrow \text{Stop}_1 \longrightarrow \text{Stop}_2 \longrightarrow \dots \longrightarrow \text{Destination}$$
   A multi-waypoint road route request is dispatched to the OSRM driving service (`https://router.project-osrm.org`).
3. **Battery Revalidation on Actual Road Distances**:
   - Each individual leg's road distance and duration is extracted from OSRM `route.legs`.
   - Physical energy consumption is recalculated for every leg using `calculateLegEnergy`.
   - If real road distance causes any leg to drop below minimum charger reserve, or destination SoC to drop below minimum reserve:
     - The route is flagged `isFeasible = false`.
     - The engine automatically activates the verified **Greedy Fallback** as active route, clearly badged in the UI.
4. **Geometry Source Metadata**:
   - `geometrySource = 'osrm'` and `roadValidated = true`: Road verified through OSRM.
   - `geometrySource = 'estimated'` and `roadValidated = false`: Offline simulation / approximate geometry warning shown.

---

## 4. UI Algorithm Selection & Identification

- **Plan Options**: Toggle **Use RCSP Optimizer** on/off. Setting persists in `localStorage` and resets to `false` on default reset.
- **Route Panel**:
  - Displays algorithm badge: `RCSP Optimizer`, `Greedy Heuristic`, `Greedy Fallback`, or `Demo Fixture (Calibrated)`.
  - Displays geometry verification pill: `Road Verified (OSRM)` vs `Approximate Geometry`.
  - Explanatory note: Details 5% SoC discretization and candidate graph optimality assumptions.
  - Side-by-side alternative selector: When RCSP is active, both the optimized RCSP route and greedy baseline alternatives appear in the segmented bar for direct comparison.

---

## 5. Real-Road Charger Accessibility & Carriageway Validation (Phase 5A)

Phase 5A addresses physical road-network accessibility, preventing chargers from being selected merely because they are geometrically near a polyline:

1. **Divided Highways & Directional Carriageway Barriers**:
   - Computes route heading and cardinal bearing from polyline segments.
   - For stations tagged with `carriagewayAccess: 'divided_unidirectional'`, validates vehicle travel direction against `supportedDirections`.
   - Stations on opposing carriageways separated by median barriers without authorized U-turns are automatically rejected.
2. **True Spur Road Detour vs Flat-Earth Proximity**:
   - Accounts for physical highway off-ramp entrance coordinates (`entranceCoordinates`).
   - Computes drivable spur round-trip detour to prevent underestimating diversion distance and energy.
   - Detour travel time is incorporated into the RCSP label transition cost.
3. **Backup Charger Reachability**:
   - Evaluates whether an EV arriving at a primary charger with low reserve (e.g. 10%) can safely reach a configured failover station (`backupStationId`) with at least a 3% emergency battery buffer.
   - Identifies failover safety in UI stop cards (`Backup: Reachable` vs `Backup: Risk`).
4. **Charger Verification Status Badging**:
   - Station cards in the itinerary display real-road verification pills: `Verified Access`, `Service Road`, `Access Uncertain`, along with true detour distances and access notes.
   - 100% backward-compatible: stations without explicit metadata default cleanly to `estimated` without breaking.

---

## 6. Indian EV Charging-Station Catalogue Quality & Provenance (Phase 5B)

Phase 5B establishes complete data integrity, normalization, and provenance tracking across the Indian charging infrastructure:

1. **Exact Catalogue Record Audit**:
   - Replaced speculative "~900 stations" assumptions with an exact, verified inventory of the **20 active stations** across major Indian highway corridors.
   - Identified 0 duplicate IDs and 0 invalid/unparseable coordinates.
2. **Network Alias & Operator Normalization**:
   - Canonical operator mapping (`Tata Power EZ Charge`, `Adani TotalEnergies`, `Jio-bp pulse`, `Statiq`, `Zeon Charging`, `Renovatio`, `Charge_IN by Mahindra`, `ChargeZone`, `Statcon Energiaa`).
   - Ensures preferred and avoided operator settings match both canonical and alias names.
3. **Connector Standard Normalization**:
   - Canonical standard aliasing mapping Indian commercial variants (`CCS`, `CCS2`, `CCS-2` -> `CCS2`; `Type 2`, `CHAdeMO`, `GB/T`, `Bharat DC-001`, `Bharat AC-001`).
   - Bi-directional vehicle-station connector compatibility matching.
4. **Tariff Classification & Transparency**:
   - Distinguishes operator-confirmed rates (`₹XX.XX / kWh`), session fees, free charging, and estimated fallback defaults (`₹21.00 / kWh`).
   - Transparently badges unconfirmed tariffs as `Est. Tariff` in stop cards and station dialogs.
5. **Stall Occupancy Distinction**:
   - Accurately distinguishes `0 stalls` (known full) from `undefined` (live occupancy unverified) to prevent misleading users about real-time availability.
6. **Curated National Highway Test Corridors**:
   - Purvanchal Expressway, Sitapur–Bareilly–Delhi, Delhi–Jaipur (NH-48), Mumbai–Pune Expressway, Bengaluru–Chennai (NH-44/48), and GT Road (NH-19).

---

## 7. Live EV Charging Network & OCPI Integration (Phase 5C)

Phase 5C introduces a robust, provider-independent integration architecture based on the Open Charge Point Interface (OCPI 2.2.1 and 2.3.0) standards:

1. **Provider-Independent Adapter Layer**:
   - `src/services/providers/`: Modular abstraction decoupling routing algorithms from external CPO protocols.
   - `OcpiClient`: Secure HTTP client with request timeouts, exponential backoff, rate limit handling (`Retry-After`), and automatic token redaction.
2. **Standard Locations, EVSE & Connector Hierarchy**:
   - Preserves complete physical hierarchy: `Location` $\rightarrow$ `EVSE` $\rightarrow$ `Connector`.
   - Maps standard OCPI statuses (`AVAILABLE`, `CHARGING`, `BLOCKED`, `INOPERATIVE`, `OUTOFORDER`, `RESERVED`) into internal availability models.
   - Converts electric power ratings from OCPI Watts into kW.
3. **Multi-Component Tariff Synchronization**:
   - Parses complex multi-tier tariffs, isolating `ENERGY` (rate per kWh) from `FLAT` (session connection fees) and `TIME` (per-minute charging fees).
4. **Data Freshness & Precedence Reconciliation**:
   - Classifies telemetry as `fresh` (<15m), `aging` (15–60m), `stale` (>60m), or `unknown`.
   - Fresh live observations update stall counts while preserving static road-access metadata.
   - If an external provider experiences downtime, the system falls back to the static catalogue baseline without triggering false station outages.
5. **Secure Server-Side Credential Architecture**:
   - `server/ocpiProxyServer.ts`: Lightweight Node.js server daemon shielding upstream tokens from browser code.
   - `server/.env.example`: Secure environment configuration template with zero exposed secrets.
6. **Deterministic Mock OCPI Sandbox**:
   - `MockOcpiProvider`: Testable fixture explicitly labeled `SIMULATED PROVIDER DATA` for development and deterministic testing without fabricating live operator access.

---

## 8. Community Reliability Network (Phase 5D)

A participatory verification network allowing EV drivers to report real charging experiences and access evidence-based reliability insights:

1. **Strictly-Typed Community Data Model (`src/types/communityReports.ts`)**:
   - Observation categories: `session_outcome`, `connector_status`, `station_availability`, `road_access`, `payment_issue`.
   - Distinct connector-level vs station-level tracking.
   - Pseudonymous contributor tokens with rate limiting and abuse mitigation.

2. **Durable File-Backed Persistence (`server/reportStorage.ts`)**:
   - Atomic disk persistence in `server/data/communityReports.json` surviving server restarts.
   - Rate limiting: max 5 submissions per 10 minutes per IP/contributor.
   - Deduplication window: 30 minutes (prevents artificial inflating of reports by a single contributor).
   - Independent corroboration: 24-hour window (promotes reports to `corroborated` when confirmed by 2+ independent drivers).
   - Category-specific TTL expiry (2 hours for queues/occupancy, 48 hours for session failures, 72 hours for broken connectors, 7 days for road barriers).
   - Text sanitization: strips HTML/scripts, enforces 280-char limit.

3. **Bayesian Beta-Binomial Multi-Dimensional Reliability Model**:
   - Beta prior ($\alpha_0 = 2.0, \beta_0 = 0.5$) reflecting baseline functionality with low prior weight (2.5 observations).
   - Exponential time-decay weights: $w_i = \exp(-\lambda \Delta t)$.
   - Transparent confidence tiers: `high` ($\ge 10$), `medium` ($5-9$), `low` ($2-4$), `insufficient_evidence` ($< 2$).
   - Explicit honesty: returns `null` score and "Insufficient community evidence" for small samples rather than inventing certainty.
   - Evidence-based queue wait times (median of recent observations).
   - Dual-signal conflict handling: preserves side-by-side visibility when official CPO telemetry reports "Available" but drivers report session activation failures.

4. **Routing Engine & Backup Charger Integration**:
   - Secondary risk tie-breaker for Greedy candidate scoring and RCSP label cost without overriding physical battery feasibility constraints.
   - Extended `evaluateBackupCharger` checking battery reserve buffer ($\ge 3\%$), connector compatibility, road access, and community reliability scores.

---

## 9. Final Benchmarking & Academic Validation Package (Phase 6)

Phase 6 completes the technical evaluation and academic validation of the platform:

1. **Harmonized Lexicographic Multi-Objective Hierarchy (Option A)**:
   - Primary: Minimize total journey time $T_{\text{total}}$.
   - Secondary: Minimize financial charging cost $C_{\text{inr}}$.
   - Tertiary: Minimize number of charging stops $k$.
   - Quaternary: Maximize community reliability score $R$ (tie-breaker).
2. **Exhaustive Enumeration Correctness Oracle (`src/services/benchmark/exhaustiveOracle.ts`)**:
   - Independent brute-force algorithm verifying that RCSP achieves a **0.00% optimality gap** on identical 5% state-of-charge discretization.
3. **Deterministic 20-Scenario Benchmark Suite (`src/__tests__/benchmarkSuite.test.ts`)**:
   - 23 automated tests covering direct arrival, single stop, multi-stop corridors, power vs detour trade-offs, carriageway barriers, missing stall counts, thermal extremes (0°C and 45°C), battery degradation, and unreachable corridor detection.
4. **Empirical Benchmarking Engine (`scripts/runBenchmarks.ts`)**:
   - High-resolution monotonic timing measuring Mean, Median, P95, Min, Max, and Std Dev.
   - Proves sub-millisecond execution (< 0.10 ms mean) and sub-linear scaling across 3, 6, and 12-station corridors.
5. **Academic Documentation Package**:
   - [`docs/system-architecture.md`](file:///c:/Users/abhis/Downloads/my%20code/pot/ev-route-planner-clone/docs/system-architecture.md): Architectural flow and data pipeline Mermaid diagrams.
   - [`docs/final-project-report.md`](file:///c:/Users/abhis/Downloads/my%20code/pot/ev-route-planner-clone/docs/final-project-report.md): Formal academic project report with mathematical formulations, pseudocode, and references.
   - [`docs/benchmark-methodology.md`](file:///c:/Users/abhis/Downloads/my%20code/pot/ev-route-planner-clone/docs/benchmark-methodology.md): Experimental apparatus, vehicle parameters, and scenario design.
   - [`docs/benchmark-results.md`](file:///c:/Users/abhis/Downloads/my%20code/pot/ev-route-planner-clone/docs/benchmark-results.md): Complete tabular results, empirical distributions, and trade-off analysis.
   - [`docs/sensitivity-analysis.md`](file:///c:/Users/abhis/Downloads/my%20code/pot/ev-route-planner-clone/docs/sensitivity-analysis.md): Sensitivity studies for $\Delta\mathrm{SoC}$, battery degradation, temperature, and power.
   - [`docs/limitations-and-future-work.md`](file:///c:/Users/abhis/Downloads/my%20code/pot/ev-route-planner-clone/docs/limitations-and-future-work.md): Honest academic boundaries and future research roadmap.
   - [`docs/deployment-readiness.md`](file:///c:/Users/abhis/Downloads/my%20code/pot/ev-route-planner-clone/docs/deployment-readiness.md): Four-tier deployment evaluation and operations runbook.

---

## 10. Verification & Testing

Run all checks individually:

```bash
# Type-checking
npm run typecheck

# Full Vitest Test Suite (202 tests across 10 suites)
npm test

# Production Build
npm run build
```

---

## 11. User-Added Stops, Universal Place Search & Live Real-World Traffic (Phase 6B & 6B.1)

Phase 6B and 6B.1 establish an audited, compliant, production-grade EV journey platform:

1. **Compliant Places Search Architecture (`placesSearchService.ts`)**:
   - Primary: **TomTom Orbis Places Search** (`POST /maps/orbis/places/suggest` with version header `3`, followed by `POST /maps/orbis/places/discover` and `GET /maps/orbis/places/details/{entityId}`).
   - Reverse Geocoding: **TomTom Orbis Reverse Geocode** (`GET /maps/orbis/places/reverseGeocode` with version header `2`).
   - Nominatim Policy Compliance: In strict accordance with OpenStreetMap/Nominatim Terms of Use, public Nominatim is **completely removed** from client-side keystroke autocomplete. When unconfigured, queries surface verified records from our local charging catalogue and honestly indicate that web-wide typeahead requires a provider key.
   - Documented Legacy Fallback: Retains `/search/2/search` strictly as a secondary fallback explicitly labeled `tomtom_legacy`.
2. **Verified Traffic APIs & Version Consistency (`trafficService.ts`)**:
   - Primary Flow Tiles: **TomTom Orbis Raster Flow Tiles** (`/maps/orbis/traffic/flow/raster/tile/{z}/{x}/{y}?apiVersion=2&style=dark`).
   - Primary Incidents: **TomTom Orbis Traffic Incidents** (`/maps/orbis/traffic/incidentDetails?apiVersion=1`).
   - Primary Routing: **TomTom Orbis v3 Routing** (`POST /routing/3/routes/calculate`), parsing GeoJSON LineStrings and Orbis summary durations (`travelDurationInSeconds`, `trafficDelayDurationInSeconds`).
   - Secondary Fallback: Documented legacy v4 tiles, v5 incidents, and v1 routing.
3. **Real Traffic Visualization & Honest Status (`MapView.tsx`)**:
   - Status indicators strictly reflect recent verified data: `"Live • Orbis"` (HTTP 200 within 3-min TTL), `"Stale Data"` (3–15 min cache), `"Unavailable"` (network failure), or `"Unconfigured"` (no key).
   - Legend maps provider speed-relative-to-free-flow color bands: Green ($\ge 80\%$), Amber ($50\text{--}80\%$), Rose ($< 50\%$), and Dark/Border (Road Closed).
   - Traffic layer failures never hide the underlying road route or charging stations.
4. **Charger Verification Boundaries & Global Limits**:
   - Explicit 6-state taxonomy: `verified_station`, `source_reported_station`, `estimated_station`, `incomplete_charger_listing`, `unverified_charger_poi`, `unavailable_charger_data`.
   - International routes outside India (where the 20-station catalogue has no records) are honestly flagged as `unavailable_outside_catalogue` with `isFeasible: false` and explanatory notes, avoiding fake charger fabrication.
5. **Pinned Charging Stop Safety Validation (`routingService.ts`)**:
   - Validates road reachability, connector compatibility against vehicle `selectedPlugTypes`, rated power, and arrival battery reserve.
   - If arrival SoC drops below emergency reserve ($3\%$) or connectors mismatch, the stop is preserved but the route is clearly marked `isFeasible: false` with explanatory diagnostics.
6. **Secure Server-Side Proxy Daemon (`server/ocpiProxyServer.ts`)**:
   - Fully covers `/api/traffic/status`, `/api/traffic/flow-tile`, `/api/traffic/incidents`, `/api/traffic/route`, and `/api/places/suggest` to protect tokens from browser exposure.
7. **Official Pricing Model (TomTom Developer Platform)**:
   - **Places Suggest / Discover**: 2,500 free daily non-tile requests on Freemium tier; subsequent requests ~\$0.50 per 1,000.
   - **Routing API (Orbis v3)**: 2,500 free daily requests; subsequent ~\$0.50 per 1,000.
   - **Traffic Flow Raster Tiles**: High-volume free allowance (~50,000+ tile loads/month); subsequent ~\$0.10–\$0.25 per 1,000 tiles.
   - **Incident Details**: Included under unified daily service quota.
   - **Typical Journey Plan Cost**: 1 user planning session (5 suggests + 1 discover + 1 route calculation + 1 incident query + 24 map flow tiles = ~32 requests) costs \$0.00 inside free tier, or ~\$0.004 on pay-as-you-grow overage.


