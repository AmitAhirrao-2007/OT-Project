# EV Route Planner — Parameter Sensitivity Analysis

**Document ID**: DOC-SENS-001  
**Project**: EV Route Planner (Phase 6 Final Optimization & Verification)  
**Authors**: EV Routing & Optimization Research Team  
**Date**: October 2026  

---

## 1. Introduction

Mathematical models in electric vehicle route optimization depend on several physical, chemical, and algorithmic parameters. This document analyzes the sensitivity of the optimization engine to variations in:
1. **State of Charge (SoC) Discretization Step Size ($\Delta\mathrm{SoC}$)**
2. **Battery State of Health ($\mathrm{SoH}$)**
3. **Ambient Temperature and Auxiliary Thermal Loads ($T_{\text{ambient}}$)**
4. **Charger Power Capacities ($P_{\text{charger}}$)**
5. **Bayesian Community Reliability Time-Decay Half-Life ($\tau_{1/2}$)**

---

## 2. Sensitivity to SoC Discretization Step Size ($\Delta\mathrm{SoC}$)

In label-setting RCSP algorithms, continuous departure SoC must be discretized into finite states $\Delta\mathrm{SoC}$. Finer discretization theoretically yields paths closer to the continuous optimum but increases computational complexity.

We evaluated $\Delta\mathrm{SoC} \in \{5\%, 2\%, 1\%\}$ across a standardized 300-mile highway corridor with 6 candidate charging stations:

```text
Table 2.1: Discretization Granularity Sensitivity
------------------------------------------------------------------------------------------------------
Step (ΔSoC)   Labels Generated   Labels Pruned   Optimal Time (min)   Optimal Cost (INR)   Runtime (ms)
------------------------------------------------------------------------------------------------------
5%                  184           142 (77.2%)          312.2               ₹642.50           0.06 ms
2%                  460           368 (80.0%)          311.1               ₹639.20           0.15 ms
1%                  920           754 (81.9%)          310.4               ₹637.80           0.35 ms
------------------------------------------------------------------------------------------------------
```

### Analytical Interpretation
- **Time Optimality Delta**: Moving from 5% to 1% discretization reduces calculated journey duration by only **$1.8\ \text{minutes}$ ($0.58\%$)**.
- **Cost Optimality Delta**: Charging cost decreases by **₹4.70 ($0.73\%$)** due to avoiding slight overcharging past the exact destination arrival requirement.
- **Computational Cost**: Label exploration expands by **$5\times$** ($184 \to 920$ states).
- **Engineering Justification for 5% Default**: Real-world highway factors (traffic congestion, wind gusts, auxiliary AC fluctuations) easily introduce 5% to 10% variances in consumption. Spending additional CPU cycles to optimize within 1% precision produces negligible real-world benefit while degrading UI responsiveness on low-power mobile devices. Thus, $\mathbf{\Delta\mathrm{SoC} = 5\%}$ is mathematically justified as the Pareto-optimal operating baseline.

---

## 3. Sensitivity to Battery Degradation (State of Health)

Battery State of Health ($\mathrm{SoH}$) reflects capacity loss over cumulative charge-discharge cycles:
$$Q_{\text{effective}} = Q_{\text{nominal}} \cdot \mathrm{SoH}$$

We evaluated a 220-mile trip across different battery health states for a 50 kWh vehicle (10% arrival reserve target):

```text
Table 3.1: Impact of Battery Degradation on Itinerary
---------------------------------------------------------------------------------------------
Battery SoH   Effective Capacity   Stops Required   Avg Stop Duration   Total Trip Time (min)
---------------------------------------------------------------------------------------------
1.00 (New)         50.0 kWh              1              24.2 min               245.0 min
0.90 (Normal)      45.0 kWh              1              29.8 min               250.6 min
0.85 (Aged)        42.5 kWh              2              16.5 min               264.8 min  <-- Transition!
0.75 (Degraded)    37.5 kWh              2              21.4 min               274.6 min
---------------------------------------------------------------------------------------------
```

### Critical Bifurcation Point
Between $\mathrm{SoH} = 0.90$ and $\mathrm{SoH} = 0.85$, the vehicle crosses a **structural bifurcation threshold**: single-stop feasibility is lost because the distance between stations exceeds the degraded battery's 80% usable highway range. The solver automatically inserts a second intermediate charging stop, adding connection overhead (5 min) and increasing total journey duration by 14.2 minutes.

---

## 4. Sensitivity to Ambient Temperature ($T_{\text{ambient}}$)

Ambient temperature directly influences EV highway range through cabin HVAC thermal management and battery internal resistance:

```text
Table 4.1: Temperature Impact on Highway Efficiency and Trip Time
---------------------------------------------------------------------------------------------------
Temperature (°C)   HVAC Power (kW)   Wh/km Consumption   Efficiency Factor   Total Journey Time (min)
---------------------------------------------------------------------------------------------------
0°C (Winter)          2.5 kW            205 Wh/km              0.84                 276.5 min
15°C (Cool)           0.8 kW            178 Wh/km              0.96                 258.0 min
25°C (Optimal)        0.0 kW            172 Wh/km              1.00                 252.0 min
35°C (Warm)           1.2 kW            182 Wh/km              0.94                 260.4 min
45°C (Extreme Summer) 3.2 kW            212 Wh/km              0.81                 281.2 min
---------------------------------------------------------------------------------------------------
```

### Observation on Indian Summer Highway Driving
At $45^\circ\mathrm{C}$ (typical peak daytime conditions across Rajasthan, Haryana, and Uttar Pradesh in May–June), cabin cooling requires continuous 3.2 kW auxiliary draw. Over a 4-hour highway journey, HVAC alone consumes $12.8\ \text{kWh}$—equivalent to $25\%$ of a 50 kWh battery pack. The planner's dynamic thermal model prevents sudden mid-corridor stranding by automatically expanding charging stops to compensate for HVAC derating.

---

## 5. Sensitivity to Charger Power Limits ($P_{\text{charger}}$)

We analyzed the charging duration required to add 35 kWh to a mid-range vehicle with an onboard BMS DC fast charge ceiling of $60\ \text{kW}$ versus a flagship vehicle with a $150\ \text{kW}$ ceiling:

```text
Table 5.1: Charger Power vs Vehicle BMS Acceptance Ceiling
------------------------------------------------------------------------------------------
Charger Rating   Time (60 kW BMS Limit)   Time (150 kW BMS Limit)   Diminishing Returns Note
------------------------------------------------------------------------------------------
30 kW Fast DC           78.5 min                 78.5 min           Station-constrained
60 kW Fast DC           42.0 min                 42.0 min           Parity point
120 kW HPC DC           42.0 min                 23.5 min           60 kW BMS throttles
150 kW HPC DC           42.0 min                 19.2 min           60 kW BMS throttles
240 kW Ultra-Fast       42.0 min                 18.5 min           Both BMS taper limit
------------------------------------------------------------------------------------------
```

### Practical Routing Implication
For entry and mid-range passenger vehicles (e.g., Tata Nexon EV, MG ZS EV), routing algorithms should **never take a significant highway detour (> 5 minutes)** to reach a 150 kW or 240 kW ultra-fast charger over an existing 60 kW charger, because the vehicle's onboard battery management system cannot accept power exceeding 60 kW. The RCSP optimizer's vehicle-aware modeling accurately avoids these futile detours.

---

## 6. Bayesian Community Reliability Time-Decay ($\tau_{1/2}$)

In our Bayesian Beta-binomial model, community feedback evidence is weighted by exponential time decay:
$$w_i = \exp\left( -\frac{\Delta t_i \cdot \ln 2}{\tau_{1/2}} \right)$$

We analyzed the model's response to an unannounced charger failure (e.g., payment terminal breakdown) occurring at $t=0$:

```text
Table 6.1: Community Score Adjustment Speed vs Half-Life
------------------------------------------------------------------------------------
Half-Life (τ_1/2)   Score Prior   Score after 2 Failures (Day 1)   Score after 7 Days No Reports
------------------------------------------------------------------------------------
3 Days                 0.80                  0.48                            0.62
7 Days                 0.80                  0.54                            0.69
14 Days (Default)      0.80                  0.62                            0.74
30 Days                0.80                  0.71                            0.77
------------------------------------------------------------------------------------
```

### Recommendation
A half-life $\tau_{1/2} = 14\ \text{days}$ provides the optimal balance for emerging charging networks: it reacts within 24–48 hours to consecutive driver failure reports while preventing short-term transient network spikes from permanently suppressing trustworthy stations.

