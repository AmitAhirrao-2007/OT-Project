# EV Route Planner — Benchmark Methodology & Experimental Apparatus

**Document ID**: DOC-PERF-001  
**Project**: EV Route Planner (Phase 6 Final Optimization & Verification)  
**Authors**: EV Routing & Optimization Research Team  
**Date**: October 2026  

---

## 1. Experimental Objectives

The goal of this benchmarking framework is to establish reproducible, scientifically rigorous empirical evidence regarding:
1. **Mathematical Optimality**: Measuring the optimality gap between the Resource-Constrained Shortest Path (RCSP) solver and an exact brute-force Exhaustive Enumeration Oracle.
2. **Algorithm Comparison**: Quantifying total journey duration, financial charging cost, and stop count trade-offs between RCSP and the baseline Greedy forward-reachability heuristic.
3. **Execution Latency**: Measuring execution time distributions (mean, median, 95th percentile, minimum, maximum, and standard deviation) under interactive web-app conditions.
4. **Boundary Robustness**: Evaluating system stability across 20 edge-case scenarios including missing data, severe thermal derating, battery degradation, opposite carriageway restrictions, and unreachable destinations.

---

## 2. Experimental Apparatus and Hardware Specification

All automated benchmark trials and tests were executed on the following standardized testbench:

- **Host Processor**: AMD Ryzen / Intel Core x86_64 Architecture (Windows 11 OS)
- **Runtime Environment**: Node.js v20.x / Chromium V8 JavaScript Engine
- **Test Framework**: Vitest v3.0 / TypeScript v5.7
- **Timing Instrumentation**: High-resolution monotonic clock (`performance.now()`, sub-millisecond precision)
- **Isolation**: Each benchmark trial executes in an isolated V8 memory context with prior garbage collection warming runs to prevent JIT compilation artifacts.

---

## 3. Reference Vehicle Models

Benchmarks utilize three standardized electric vehicle profiles reflective of current passenger EV models operating on Indian highways:

| Vehicle Parameter | Entry Commuter (Tata Nexon EV Prime) | Mid-Range CUV (MG ZS EV) | Long-Range Flagship (Hyundai Ioniq 5) |
|---|---|---|---|
| **Usable Battery Capacity** | 30.2 kWh | 50.3 kWh | 72.6 kWh |
| **Max DC Fast Charge Rate** | 30 kW | 60 kW | 150 kW |
| **Nominal Consumption** | 0.23 kWh/mi (143 Wh/km) | 0.28 kWh/mi (174 Wh/km) | 0.31 kWh/mi (193 Wh/km) |
| **Standard Reserve Limit** | 10% (3.0 kWh) | 10% (5.0 kWh) | 10% (7.3 kWh) |
| **Emergency Floor Buffer** | 3% (0.9 kWh) | 3% (1.5 kWh) | 3% (2.2 kWh) |

---

## 4. Corridor Topologies and Synthetic Graph Construction

Benchmark corridors are synthesized along a 1D highway line with perpendicular detour projections $(x, y)$ where:
- $x$: Distance along the highway mainline from origin $s$ ($x=0$) to destination $t$ ($x=D$).
- $y$: Perpendicular lateral offset representing detour distance off the expressway.
- Directionality is enforced by tag: `northbound`, `southbound`, or `both`.
- Dual carriageway with physical median barriers imposes an asymmetric detour penalty for opposing-direction stations:
  $$\Delta t_{\text{opposing}} = \frac{2 \cdot d_{\text{u-turn}}}{v_{\text{service\_road}}} + t_{\text{interchange}} = 20\ \text{minutes}$$

---

## 5. The Exhaustive Enumeration Correctness Oracle

To verify that the RCSP solver does not inadvertently prune optimal solutions, we developed an independent, non-heuristic oracle (`src/services/benchmark/exhaustiveOracle.ts`).

### Mathematical Formulation
Let candidate set $S = \{s_1, s_2, \dots, s_N\}$. The oracle enumerates all permutations of subsets:
$$\bigcup_{k=1}^N \mathcal{P}_k(S)$$
For each candidate sequence $(s_{\pi_1}, s_{\pi_2}, \dots, s_{\pi_k})$, the oracle systematically sweeps the departure State of Charge at each stop across the grid:
$$\mathrm{SoC}_{\text{dep}}^{(i)} \in \{ \mathrm{SoC}_{\text{arr}}^{(i)}, \mathrm{SoC}_{\text{arr}}^{(i)} + \Delta\mathrm{SoC}, \dots, \mathrm{SoC}_{\max} \}$$

Every feasible path reaching destination $t$ with $\mathrm{SoC} \ge \mathrm{SoC}_{\text{dest\_reserve}}$ is recorded. The oracle then selects the path minimizing total journey time $T_{\text{total}}$.

### Optimality Gap Formulation
$$\text{Optimality Gap} = \frac{T_{\text{RCSP}} - T_{\text{Oracle}}}{T_{\text{Oracle}}} \times 100\%$$

On identical discretization ($\Delta\mathrm{SoC} = 5\%$), a correct label-setting algorithm must yield an Optimality Gap of exactly **$0.00\%$**.

---

## 6. The 20 Deterministic Benchmark Scenarios

The suite evaluates 20 discrete operational scenarios across 7 testing domains:

1. **Scenario 01 (Direct Destination)**: Origin to destination is 40 miles, within initial battery range; verify 0 stops are scheduled.
2. **Scenario 02 (Single Stop DC Fast)**: 120-mile trip requiring 1 charging stop; verify selection of 60 kW charger.
3. **Scenario 03 (Multi-Stop Corridor)**: 250-mile trip requiring 2-3 stops; compare Greedy vs RCSP total journey time.
4. **Scenario 04 (Detour vs Power Trade-Off)**: Fast 120 kW charger with 1.5-mile detour vs 30 kW charger directly on highway.
5. **Scenario 05 (Uniform Spacing & Power)**: Symmetrical chargers; verify both algorithms identify equivalent optimal stops.
6. **Scenario 06 (Opposite Carriageway Barrier)**: Station on opposite side has 20-minute U-turn penalty; verify avoidance.
7. **Scenario 07 (Single Lane / Bidirectional Access)**: Station accessible from both carriageways without U-turn penalty.
8. **Scenario 08 (High Detour Penalty Station)**: Station requiring 15-mile off-highway detour; verify rejection.
9. **Scenario 09 (Low Reliability Warning)**: Station with 45% reliability score; verify routing succeeds but issues community warning.
10. **Scenario 10 (Downvoted Station Bypass)**: Downvoted station bypassed when equivalent alternative exists nearby.
11. **Scenario 11 (Missing Stall Count Data)**: Station record lacks stall count; verify robust routing without runtime crash.
12. **Scenario 12 (100% Verified Preference)**: Verified station preferred over unverified station with identical electrical specs.
13. **Scenario 13 (Battery Degradation SoH = 0.85)**: Degraded battery reduces range; verify additional stop insertion.
14. **Scenario 14 (Extreme Summer Heat 45°C)**: High HVAC load increases consumption rate by 20%; verify safety margin.
15. **Scenario 15 (Cold Winter 0°C)**: Low temperature derates electrochemical efficiency; verify conservative leg sizing.
16. **Scenario 16 (Conservative 20% Reserve)**: User requests 20% arrival reserve; verify earlier charging stops.
17. **Scenario 17 (Aggressive 5% Emergency Reserve)**: User permits down to 5% arrival reserve; verify skipped intermediate stop.
18. **Scenario 18 (Charging Cost Tie-Breaker)**: Two identical stations with ₹18 vs ₹24/kWh tariffs; verify selection of cheaper station.
19. **Scenario 19 (Dense 12-Station Corridor Scaling)**: Stress test with 12 stations to evaluate label-setting pruning performance.
20. **Scenario 20 (Infeasible Corridor Detection)**: Destination separated by 200 miles with zero chargers; verify clean failure handling.

---

## 7. Statistical Aggregation Methodology

For empirical latency measurements, each scenario is executed across $N = 50$ iterations:
- **Mean Latency**: $\bar{t} = \frac{1}{N}\sum_{i=1}^N t_i$
- **Median Latency**: 50th percentile of sorted latencies.
- **P95 Latency**: 95th percentile (representing worst-case UI responsiveness).
- **Standard Deviation**: $\sigma = \sqrt{\frac{1}{N-1}\sum_{i=1}^N (t_i - \bar{t})^2}$

