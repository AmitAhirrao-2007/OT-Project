# EV Route Planner — Limitations and Future Research Directions

**Document ID**: DOC-LIM-001  
**Project**: EV Route Planner (Phase 6 Final Optimization & Verification)  
**Authors**: EV Routing & Optimization Research Team  
**Date**: October 2026  
**Status**: Academic Honesty & Technical Governance Audit  

---

## 1. Explicit Academic Disclosures and Current Boundaries

To maintain scientific rigor and prevent misleading claims, this section outlines the precise scope boundaries of the current EV Route Planner implementation.

### 1.1 Station Catalogue Scale
- **Curated Dataset**: The internal production charging catalogue (`src/data/chargingStations.ts`) contains exactly **20 verified, hand-curated charging plaza records** distributed along primary Indian transit arteries (Yamuna Expressway, Agra–Lucknow Expressway, NH-44 Delhi–Chandigarh, NH-48 Delhi–Jaipur, and Bengaluru–Mysuru Expressway).
- **Boundary**: The platform does **not** yet contain full national coverage of all 900+ registered public charging plazas in India. Scaling to nationwide coverage requires ongoing automated harvesting and validation.

### 1.2 Live CPO Connectivity and OCPI Protocols
- **Architecture**: A complete OCPI v2.2.1 adapter layer (`src/services/ocpi/`) and local proxy server (`server/ocpiProxyServer.ts`) have been implemented and tested against mock endpoints.
- **Boundary**: No commercial, production API credentials or active roaming agreements exist with Indian Charge Point Operators (e.g., Tata Power EZ Charge, Statiq, Jio-bp pulse). Real-time stall availability is demonstrated via synthetic mock feeds and sandbox endpoints.

### 1.3 Community Reliability Network Data
- **Mechanism**: The Bayesian Beta-binomial reliability engine and HMAC-pseudonymized contribution server endpoints are fully implemented and verified with automated test suites.
- **Boundary**: All community reports currently in the system are synthetic benchmark fixtures and automated test records. There is no active deployed fleet of real-world Indian EV drivers reporting live status.

### 1.4 Topography and Elevation Modeling
- **Current Assumption**: Route energy calculations currently assume a baseline flat road profile ($\theta = 0$).
- **Boundary**: In mountainous corridors (e.g., Mumbai–Pune Expressway Bhor Ghat, Bengaluru–Ooty via Nilgiris, or Delhi–Dehradun/Shimla), gradient significantly impacts energy consumption and regenerative braking recovery. These gradients are not yet integrated into the OSRM geometric pipeline.

### 1.5 Real-Time Dynamic Traffic
- **Current Assumption**: Leg driving durations are computed via distance and speed limits or baseline OSRM travel durations.
- **Boundary**: Dynamic live traffic congestion (such as urban bottlenecks or highway toll plaza queues) is not dynamically ingested from live telematics providers (e.g., Google Maps Traffic API or TomTom Traffic).

---

## 2. High-Priority Future Research and Engineering Directions

### 2.1 Elevation Integration via NASA SRTM / Copernicus DEM
Integrating high-resolution Digital Elevation Models (e.g., 30-meter NASA SRTM or Copernicus DEM) into the routing engine:
1. Interpolate altitude $h(x)$ along the OSRM polyline.
2. Compute segment gradient $\theta = \arctan(\Delta h / \Delta d)$.
3. Incorporate potential energy changes $\Delta E_{\text{pot}} = m \cdot g \cdot \Delta h$ and regenerative braking efficiency limits ($\eta_{\text{regen}} \approx 0.70$) into the leg energy equation:
   $$E_{\text{segment}} = \begin{cases}
   \frac{P_{\text{tractive}} \cdot \Delta t}{\eta_{\text{drivetrain}}} & \text{if } P_{\text{tractive}} \ge 0 \\
   P_{\text{tractive}} \cdot \Delta t \cdot \eta_{\text{regen}} & \text{if } P_{\text{tractive}} < 0
   \end{cases}$$

### 2.2 Integration with India's Unified Energy Interface (UEI)
India's Beckn-enabled Unified Energy Interface (UEI) is an emerging open decentralized protocol allowing cross-network charger discovery, booking, and payment:
- Connect the `ocpiService.ts` module to Beckn BAP/BPP gateway endpoints.
- Enable direct in-app slot reservation and wallet settlement for charging stops directly from the route itinerary.

### 2.3 Live In-Vehicle Telemetry via Bluetooth OBD-II / BLE
To eliminate manual initial SoC entry:
- Implement a Web Bluetooth API / Web Serial API connector supporting standard ELM327 OBD-II dongles.
- Read real-time PID parameters from the vehicle CAN bus:
  - Exact battery State of Charge ($0.1\%$ precision)
  - Battery pack temperature
  - Real-time auxiliary HVAC power draw
- Continuously re-evaluate the RCSP Pareto frontier as the vehicle drives, offering dynamic rerouting if real consumption deviates from model estimates.

### 2.4 Progressive Web App (PWA) Offline Routing Engine
- Compile the TypeScript RCSP solver into WebAssembly (Wasm) via Rust or AssemblyScript.
- Cache regional offline corridor subgraphs using Service Workers and IndexedDB, allowing EV drivers to calculate and re-optimize routes even when passing through remote cellular dead zones on rural highways.

