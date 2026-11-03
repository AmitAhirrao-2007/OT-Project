# Architectural & Legal Evaluation: Google Places API (New) vs. TomTom Orbis for EV Route Planning

**Document Version:** 1.0.0  
**Phase:** 6C.1 Architectural Audit  
**Author:** Antigravity Senior Geospatial & Systems Architecture Team  
**Status:** Approved for Architectural Decision Record (ADR)  

---

## 1. Executive Summary

This assessment addresses the core requirement for **Google Maps-grade place search coverage** (arbitrary localities, rural roads, restaurants, hotels, historical landmarks, international addresses, and small villages) within the EV Route Planner platform. 

While the platform currently integrates **TomTom Orbis Places API** and **TomTom Search API v2** via a secure backend proxy daemon, evaluating a direct transition to the **Google Places API (New)** reveals critical legal, technical, and commercial constraints. Most notably, **Google Maps Platform Terms of Service strictly prohibit displaying Google Places data on third-party mapping libraries such as Leaflet and OpenStreetMap**.

This document outlines the comparative coverage differences, legal boundaries, architectural migration options, and billing implications.

---

## 2. Search Coverage Comparison: TomTom vs. Google Places

| Evaluation Dimension | TomTom Orbis & Search v2 | Google Places API (New) | Architectural Impact on EV Route Planner |
| :--- | :--- | :--- | :--- |
| **Interstate Highways & Expressways** | **Superior / Automotive Grade**<br>Pre-compiled carriageway directions, lane connectivity, grade separations, toll plaza geometry. | **High**<br>General navigation road geometry. | TomTom is purpose-built for automotive navigation and electric vehicle range calculation along highway corridors. |
| **Urban POIs (Hotels, Dining, Cafes)** | **High**<br>Extensive coverage of formal hotels, registered restaurants, and commercial chains. | **Exceptional**<br>Unrivaled coverage of micro-businesses, local dhabas, street food, and colloquial listings. | Google provides broader coverage for informal highway stops and local amenities. |
| **Micro-Localities, Villages & Wards** | **Moderate**<br>Administrative municipalities, census towns, postal localities, and major arterial roads. | **Superior**<br>Deep crowdsourced mapping of rural villages, mohallas, and informal neighborhood names. | Indian tier-3/tier-4 villages (e.g. interior Bihar, Purvanchal) resolve more reliably on Google Places. |
| **International Addresses** | **Comprehensive**<br>Global coverage across Europe, North America, APAC, and Middle East. | **Comprehensive**<br>Global coverage across 200+ countries and territories. | Both providers adequately resolve international landmarks and foreign city addresses. |
| **Keystroke Autocomplete / Typeahead** | **Orbis Places Suggest**<br>Session-aware keystroke suggestions with coordinate payloads. | **Autocomplete (New)**<br>High-speed typeahead with rich place predictions. | Both provide sub-100ms response times when properly proxied and debounced. |

---

## 3. Legal and Regulatory Constraints: Google Maps Platform Terms of Service

### 3.1 The Non-Google Map Prohibition (Section 3.2.4)

Google Maps Platform Terms of Service (specifically Section 3.2.4 "Display on Non-Google Maps") explicitly state:

> *"Customer will not display Google Maps Core Services Content on or in connection with an application or service that displays non-Google maps."*

Because our EV Route Planner utilizes **Leaflet 1.9.4** with **OpenStreetMap (CartoDB Positron / OSM Standard)** tile layers:
1. **Direct Integration Violation:** Fetching coordinates or place metadata from Google Places API (New) and rendering them as markers, polylines, or route waypoints on our Leaflet map is a direct, severe breach of Google's Terms of Service.
2. **Enforcement Consequence:** Google routinely audits API traffic and user-agent referrers. Violations result in immediate project suspension, API key revocation, and potential IP blacklisting.
3. **No Mixed Basemap Exemption:** There is no commercial exemption allowing Google Places autocomplete to populate coordinates on an OpenStreetMap or Leaflet canvas without purchasing specialized Enterprise OEM licenses (which run into tens of thousands of dollars annually).

---

## 4. Architectural Migration Paths

If the product steering committee mandates Google Places coverage for all user-entered locations, two architectural paths are viable:

### Path A: Complete Frontend Basemap Migration (Google Maps JS API)
* **Action:** Replace Leaflet entirely with `@googlemaps/js-api-loader` and the official Google Maps JavaScript API.
* **Benefits:** Full compliance with Google ToS; native Google autocomplete widgets; satellite imagery; Street View integration; comprehensive coverage of all Indian villages and small commercial venues.
* **Drawbacks:**
  * Complete rewrite of map interaction components (`MapView.tsx`, custom SVG charger markers, charging radius circles, detour vectors).
  * Incompatible with open-source OSRM routing fallbacks.
  * Significant recurring API billing.

### Path B: Hybrid Architecture with Strict Provider Separation
* **Action:** Retain Leaflet for EV route rendering with TomTom Orbis / OSRM routing, but offer an auxiliary Google Maps modal exclusively embedded inside an official Google Map iframe for location picking.
* **Benefits:** Retains Leaflet's lightweight modularity while accessing Google's place database within a Google-rendered map frame.
* **Drawbacks:** Clunky user experience (switching between map windows); complex cross-iframe communication; high licensing overhead.

---

## 5. Financial & Billing Analysis (Cost per 1,000 Interactions)

| Operation | TomTom Orbis (Current) | Google Places API (New) | Cost Differential |
| :--- | :--- | :--- | :--- |
| **Free Tier Allowance** | **2,500 transactions / day** (Free forever, no credit card required) | **$200 monthly credit** (Credit card required) | TomTom offers generous development quota. |
| **Typeahead Autocomplete** | Included in free quota; ~$0.50 / 1,000 queries | **$2.83 to $17.00 / 1,000 sessions** | **5x to 34x more expensive** |
| **Full Text / Place Search** | Included in free quota; ~$0.50 / 1,000 queries | **$32.00 / 1,000 requests** (Text Search Pro) | **64x more expensive** |
| **Reverse Geocoding** | Included in free quota; ~$0.50 / 1,000 queries | **$5.00 / 1,000 requests** | **10x more expensive** |
| **Estimated Monthly Cost (10,000 active trip plans)** | **$0.00 – $15.00 / month** | **$320.00 – $980.00 / month** | Google entails significant budget overhead. |

---

## 6. Strategic Recommendation for Phase 6C.1

1. **Retain TomTom Orbis & Search v2 as Primary Provider:**
   TomTom provides full global coverage, unrestricted fuzzy search across cities, streets, hotels, restaurants, and landmarks, and legal compatibility with Leaflet and OpenStreetMap at a fraction of the cost.
2. **Transparent Diagnostic Messaging:**
   When credentials are not yet configured, the system must truthfully display `Local 20-station catalogue only (API key unconfigured)` rather than pretending global search failed.
3. **Future Extensibility:**
   The `placesSearchService.ts` abstraction layer is architected with a decoupled `SearchResultPlace` schema. If a full Google Maps migration is funded in a future commercial phase, the backend proxy can swap upstream adapters without altering the core React routing and RCSP optimization engine.

