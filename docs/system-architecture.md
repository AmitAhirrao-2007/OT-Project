# System Architecture & Technical Specification
## Reliability-Aware Electric Vehicle Route Optimization Platform

This document specifies the software architecture, data flows, graph models, and subsystem interfaces for the India-focused EV Route Planner platform.

---

## 1. High-Level System Architecture

The platform follows a layered, modular architecture decoupling user interactions, routing optimization algorithms, geospatial validation, live network adapters, and participatory community telemetry.

```mermaid
flowchart TD
    subgraph UI ["Client Layer (React 18 + TypeScript + Vite)"]
        UI_Map["Interactive Map View<br/>(Leaflet / Canvas Polyline)"]
        UI_Plan["Plan Options & Controls<br/>(Greedy vs RCSP Toggle)"]
        UI_Stops["Charging Stop Cards<br/>(Dual Signals & Reliability)"]
        UI_Report["Driver Report Modal<br/>(Mobile Structured Reporting)"]
    end

    subgraph ServiceLayer ["Client Routing & Optimization Engines"]
        RS["Routing Service (Facade)"]
        GREEDY["Greedy Heuristic Engine<br/>(Corridor Forward Step)"]
        RCSP["RCSP Label-Setting Solver<br/>(Acyclic Progression Graph)"]
        EM["Physical Energy Model<br/>(Aerodynamic & Taper Curves)"]
        RA["Road Access & Carriageway Validator<br/>(Divided Highway Check)"]
        CS["Community Service<br/>(Bayesian Posterior Engine)"]
    end

    subgraph ServerLayer ["Backend Proxy & Storage Daemon (Node.js)"]
        PROXY["OCPI Token-Shielding Proxy<br/>(server/ocpiProxyServer.ts)"]
        STORAGE["Durable JSON Persistence<br/>(server/reportStorage.ts)"]
        MOCK_CPO["Mock OCPI Sandbox<br/>(Simulated Telemetry)"]
        DB_FILE[("communityReports.json<br/>(server/data/)")]
    end

    subgraph External ["External Infrastructure (Staging / Production)"]
        OSRM["OSRM Routing Engine<br/>(Road Geometry)"]
        CPO["Upstream OCPI CPO API<br/>(Production Keys)"]
    end

    UI_Map --> RS
    UI_Plan --> RS
    UI_Stops --> RS
    UI_Report --> PROXY

    RS --> GREEDY
    RS --> RCSP
    GREEDY --> EM
    GREEDY --> RA
    RCSP --> EM
    RCSP --> RA
    RCSP --> CS

    RS -.-> OSRM
    PROXY --> STORAGE
    STORAGE --> DB_FILE
    PROXY --> MOCK_CPO
    PROXY -.-> CPO
```

---

## 2. User Trip Request & Routing Engine Data Flow

The routing engine processes user trip inputs through a strict corridor detector, delegating either to the pre-calibrated baseline fixture (Patna–Delhi demo) or the dynamic custom routing engines:

```mermaid
flowchart TD
    REQ["User Trip Request<br/>(Origin, Destination, Waypoints, Vehicle, Settings)"] --> CORRIDOR{"Is Default Patna-Delhi<br/>Demonstration Corridor?"}
    
    CORRIDOR -- YES --> FIXTURE["Calibrated Demo Fixture<br/>(replanPatnaDelhiFixture)"]
    FIXTURE --> OUT_FIX["3 Pre-Calibrated Alternatives<br/>(Optimal, Fewer Stops, Fewest Stops)"]

    CORRIDOR -- NO --> ROAD_FETCH["Fetch Road Geometry from OSRM<br/>(Fallback: Interpolated Haversine Polyline)"]
    ROAD_FETCH --> CORRIDOR_FILTER["Filter Corridor Candidate Stations<br/>(Eligible Plugs, Detour <= 25 mi, Min Power)"]
    CORRIDOR_FILTER --> ROAD_ACCESS["Road Access & Carriageway Filter<br/>(validateStationRoadAccess)"]
    
    ROAD_ACCESS --> ALGO_CHECK{"planOptions.useRcspOptimizer<br/>Enabled?"}

    ALGO_CHECK -- NO (Default) --> GREEDY_RUN["Greedy Multi-Strategy Engine<br/>- Optimal (Target ~72% SoC)<br/>- Fewer Stops (Target ~78% SoC)<br/>- Fewest Stops (Target ~85% SoC)"]
    GREEDY_RUN --> GREEDY_TIE["Candidate Scoring & Reliability Tie-Breaker"]
    GREEDY_TIE --> GREEDY_OUT["Multi-Strategy Route Options"]

    ALGO_CHECK -- YES --> RCSP_GRAPH["Construct Directed Progression Graph<br/>V = {Origin, Stations, Destination}"]
    RCSP_GRAPH --> RCSP_SOLVE["RCSP Label Setting with 5% Discretization<br/>Pareto Dominance Pruning (Time, Cost, Stops)"]
    RCSP_SOLVE --> RCSP_RECON["Reconstruct Path Timings & Charges"]
    RCSP_RECON --> RCSP_ROAD["OSRM Road Geometry Revalidation<br/>(roadValidated = true)"]
    RCSP_ROAD --> RCSP_OUT["RCSP Optimal Route Option"]

    GREEDY_OUT --> MERGE["Assemble Final RouteCalculationResult"]
    RCSP_OUT --> MERGE
    OUT_FIX --> MERGE
```

---

## 3. Battery State Transition & Discretized Progression Graph

In the RCSP model, the highway corridor is modeled as an acyclic directed graph $G = (V, E)$, topologically sorted by progression distance along the route.

```mermaid
stateDiagram-v2
    [*] --> Origin: Departure SoC = 95%
    
    Origin --> Station_1: Highway Leg (d1 miles, ΔSoC1)
    note right of Station_1: Arrival SoC = 95% - ΔSoC1 >= 10%<br/>Enumerate Target SoCs: [35%, 40%, ..., 85%]
    
    Station_1 --> Station_2: Highway Leg (d2 miles, ΔSoC2)
    note right of Station_2: Arrival SoC = Target_1 - ΔSoC2 >= 10%<br/>Dominance Test: Prune suboptimal labels
    
    Station_1 --> Destination: Long Range Direct Reachable?
    Station_2 --> Destination: Final Leg (d_dest miles, ΔSoC_dest)
    note right of Destination: Arrival SoC >= Destination Reserve (10%)<br/>Lexicographic Best Label Selection
    
    Destination --> [*]
```

---

## 4. Community Reporting & Verification Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor Driver as EV Driver (Client)
    participant UI as DriverReportModal
    participant Proxy as Server Daemon (/api/reports)
    participant Store as reportStorage.ts
    participant Engine as communityService.ts
    participant Router as RCSP / Greedy Router

    Driver->>UI: Selects Station & Observed Condition
    UI->>UI: Validates mandatory fields & text length (<= 280 chars)
    UI->>Proxy: HTTP POST /api/reports (with client IP)
    Proxy->>Store: submitCommunityReport(payload, clientIp)
    
    Store->>Store: Keyed HMAC(IP) -> contributorId
    Store->>Store: Check Rate Limit (max 5 req / 10 min)
    Store->>Store: Check Deduplication (30 min window)
    
    alt Duplicate within 30 min by same contributor
        Store-->>Proxy: HTTP 409 Conflict (Duplicate Rejected)
        Proxy-->>UI: Alert: Duplicate submission rejected
    else Independent report within 24h by different contributor
        Store->>Store: Increment corroborationCount (corroborated)
        Store->>Store: Save to server/data/communityReports.json
        Store-->>Proxy: HTTP 201 Created (corroborated status)
        Proxy-->>UI: Success: Report corroborated by community
    else New incident
        Store->>Store: Save new record (published status)
        Store-->>Proxy: HTTP 201 Created
        Proxy-->>UI: Success: Observation recorded
    end

    Note over Engine,Router: On Subsequent Route Calculation
    Router->>Engine: computeStationReliability(reports, stationId, cpoStatus)
    Engine->>Engine: Apply exponential time-decay weights (w_i)
    Engine->>Engine: Beta-binomial posterior mean & confidence tier
    Engine->>Engine: Detect CPO Telemetry vs Community Discrepancies
    Engine-->>Router: StationReliabilitySummary (Score, Confidence, Dual Signal)
    Router->>Driver: Renders ChargingStopCard with Badges & Warnings
```

---

## 5. Backup Charger Decision Flow

```mermaid
flowchart TD
    STOP["Planned Charging Stop (Primary)"] --> CHECK_CFG{"Configured backupStationId<br/>in Access Metadata?"}
    
    CHECK_CFG -- YES --> TARGET_CFG["Select Configured Backup Station"]
    CHECK_CFG -- NO --> DYNAMIC["Dynamic Search: Candidate Stations within Battery Range<br/>(Exclude Primary, Filter roadAccess != inaccessible)"]
    DYNAMIC --> RANK["Rank Candidates by Haversine Distance & Reliability Score"]
    RANK --> TARGET_CFG

    TARGET_CFG --> PLUG{"Vehicle Plug Compatibility Check<br/>(supportedPlugTypes vs Station Connectors)"}
    PLUG -- NO --> INFEASIBLE_PLUG["reachabilityClassification = 'no_feasible_backup'<br/>Reason: Incompatible connector"]

    PLUG -- YES --> ROAD{"Road Access Check<br/>(roadAccessStatus == 'inaccessible'?)"}
    ROAD -- YES (Inaccessible) --> INFEASIBLE_ROAD["reachabilityClassification = 'no_feasible_backup'<br/>Reason: Inaccessible from road network"]

    ROAD -- NO (Accessible) --> CALC_ENERGY["Calculate Energy: Primary -> Backup<br/>estimatedSocAtBackup = arrivalSoc - legEnergy.socPercent"]
    
    CALC_ENERGY --> RESERVE{"Battery Reserve Buffer Check"}
    RESERVE -- "< 3.0% (Critical Depletion Risk)" --> INFEASIBLE_BATT["reachabilityClassification = 'no_feasible_backup'<br/>Reason: Insufficient battery (< 3% emergency buffer)"]
    
    RESERVE -- ">= 3.0% and < Configured Reserve (10%)" --> REACH_WARN["reachabilityClassification = 'estimated_reachable'<br/>Emergency Reachable (Reserve Warning Flagged)"]
    
    RESERVE -- ">= Configured Reserve (10%)" --> REACH_OK["reachabilityClassification = 'verified_reachable'<br/>(or 'estimated_reachable' based on access validation)"]
```

