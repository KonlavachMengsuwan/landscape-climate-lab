# Model notes: Landscape Climate Lab 0.2

## Interpretation

The output is an **illustrative daytime equilibrium temperature of the modeled ground or water surface**. It is not observed LST, a remote-sensing retrieval, canopy temperature, near-surface air temperature or human thermal comfort.

Every slider position describes a new hypothetical state. The model does not integrate temperatures through time. Changing 09:00 to 15:00 solves two independent equilibria, even when the sun control is animated.

## Sun and geometry

The fictional scene covers 80 × 80 m in 100 cells. Each cell is 8 × 8 m. Coordinates are x east, y up and z south. Sun position follows NOAA's compact equations at 52.52° N, 13.405° E. Clock offset is selected manually as UTC+1 or UTC+2. Geometric elevation does not include atmospheric refraction.

The route is 121 m long, including a boardwalk across the pond. Its 152 equal-distance midpoint samples start rays at y = 0.18 m, just above the path surface at y = 0.13 m. Route shade is the weighted fraction with a ray blocked by a tree, building or bench. Mean direct beam onto the route is DNI × max(0, sun vertical component) × unshaded fraction. This excludes diffuse and reflected radiation.

The visible geometry is also the raycast geometry. Crowns are opaque, faceted shapes, not porous or seasonally varying foliage. Soft WebGL shadow edges can differ from binary raycast classifications. The SVG compatibility renderer does not draw shadows, but uses exactly the same analysis geometry.

## Temperature sampling

Each cell has a 4 × 4 stratified sample pattern. Nominal offsets are −3, −1, 1 and 3 m on each axis. Alternating ±0.3 m offsets within the 2 m strata avoid systematic alignment with the narrow boardwalk. The pattern is deterministic, not newly randomized on each calculation.

Temperature rays start at y = 0.03 m. Sample points within building or boardwalk footprints are omitted. The inspector reports **valid sample points out of 16**, not an exact fraction of the cell's physical area. Fine geometry can still fall between points. The mean therefore describes an approximate sampled ground support, not all surfaces within an 8 m pixel.

For each cover, solve the sunlit and shaded energy balances separately. If the valid sample fraction in shade is f, the displayed cell estimate is:

```text
Tcell = (1 − f) × Tsunlit + f × Tshaded
```

This differs from solving a single nonlinear energy balance using averaged radiation. The scene mean weights cells by their valid sample count. Tree crowns are hidden only in the temperature display; their raycast effect remains.

## Equilibrium balance

Solve F(Ts) = 0, where all fluxes are in W/m² and temperatures are in °C unless converted to kelvin:

```text
F(Ts) = (1 − α) Kdown
      + ε [Ldown − σ (Ts + 273.15)^4]
      − h (Ts − Ta)
      − LE
      − g [Ts − (Ta − 3)]

Kdown = DNI × max(sy, 0) × b + 100
Ldown = 0.85 × σ × (Ta + 273.15)^4
h     = 5 + 4u
ra    = ρ cp / h
LE    = β ρ Lv [qsat(Ts) − qair] / (ra + rs)
```

b is 1 for an unblocked direct-sun ray and 0 otherwise. The 100 W/m² diffuse term applies only to daytime calculations. It stays unchanged when DNI changes; it is a separate assumed sky input. The h relationship is an assumed demonstration coefficient, not a calibrated wind-transfer law.

| Symbol | Meaning / value |
|---|---|
| α | Assumed shortwave albedo |
| ε | Assumed surface emissivity |
| σ | 5.670374419 × 10⁻⁸ W m⁻² K⁻⁴ |
| Ta | User-selected air temperature, 5–45 °C |
| u | User-selected wind speed, 0.2–8 m/s |
| ρ | Fixed air density, 1.225 kg/m³ |
| cp | Fixed air heat capacity, 1005 J kg⁻¹ K⁻¹ |
| Lv | Fixed latent heat, 2.45 × 10⁶ J/kg |
| ra | Assumed bulk aerodynamic resistance, s/m |
| rs | Assumed additional surface resistance, s/m |
| β | Effective evaporation availability |
| g | Assumed exchange with a lower thermal reservoir, W m⁻² K⁻¹ |

The lower reservoir is fixed at Ta − 3 °C. For water, this is only a bulk lower-boundary approximation; it does not model a physical water depth or mixing process.

Specific humidity is computed from vapor pressure in Pa at fixed pressure P = 101325 Pa:

```text
e_sat(T) = 610.8 × exp[17.27 T / (T + 237.3)]
q(e)     = 0.622 e / (P − 0.378 e)
qsat(T)  = q[e_sat(T)]
qair     = q[RH/100 × e_sat(Ta)]
```

RH is editable from 10–95%. A negative vapor-pressure gradient can produce a negative latent flux, representing condensation within this simplified exchange formula. There is no evolving moisture reservoir.

## Assumed cover presets

These values are demonstration choices. They are not measurements for Berlin, species-specific parameters, or validated coefficients for this landscape. Grass albedo 0.23 is consistent with the FAO reference-grass convention, but that convention does not validate this combined model.

| Cover | Albedo α | Emissivity ε | Maximum evaporation factor | rs, s/m | g, W m⁻² K⁻¹ |
|---|---:|---:|---:|---:|---:|
| Grass | 0.23 | 0.97 | 0.75 | 70 | 6 |
| Crops, idealized ground layer | 0.20 | 0.97 | 0.75 | 90 | 6 |
| Bare soil | 0.18 | 0.95 | 0.25 | 0 | 8 |
| Paving | 0.16 | 0.94 | 0 | 0 | 12 |
| Water | 0.08 | 0.98 | 1.00 | 0 | 15 |
| Forest floor | 0.15 | 0.97 | 0.60 | 120 | 6 |

For terrestrial covers, β is the maximum evaporation factor multiplied by the user-selected water-availability fraction. Water keeps β = 1; paving keeps β = 0. The slider is not volumetric soil moisture. Tree placement changes shade, but does not modify wind, moisture, humidity or air temperature around the tree.

## Numerical treatment and missing values

The solver bisects a bracket of −40 to 95 °C for 45 iterations. It returns unavailable if the residual is non-finite or has no bracketed root. Liquid-water solutions below 0 °C are unavailable because phase change is outside the model. An unused sunlit or shaded solution does not invalidate a cell; only contributing components are required.

When the sun is below the horizon, all surface-temperature estimates are unavailable. Route direct beam is zero and route shade is not scored. Fully masked cells also have no temperature. Missing values are never silently converted to 0 °C.

The fixed color scale runs from 15 to 60 °C. Values outside that interval use the endpoint colors; numerical values are not clipped. Baseline and design use the same scale and conditions.

## Saved scenarios

Version 2 JSON stores `format`, `version`, `design`, `baseline`, `sun` and `thermal`. Weather is shared by both designs. Version 1 files are still accepted and receive default thermal settings: air 30 °C, wind 2 m/s, RH 50%, water availability 0.6.

Validation restricts the grid to 100 known covers, at most 160 trees, supported tree types/dimensions/positions and bounded sun/weather values. Unknown fields are discarded. Invalid files leave the current scene unchanged. Files are limited to 250 KB.

## Validation and next scientific steps

The code checks conservation at the solved equilibrium and plausible responses to changed forcing. It also checks geometric sampling, valid edits, baseline independence, version compatibility, nighttime handling and freezing guards. Those checks establish implementation behavior, not prediction accuracy.

To support research conclusions, the next steps are matched field observations, parameter estimation, independent-site evaluation, uncertainty analysis and an explicitly defined observation operator for the relevant sensor. Heat-storage and canopy models are needed before interpreting daily recovery, nighttime water behavior or canopy radiometric LST.

Conceptual references: [NOAA](https://gml.noaa.gov/grad/solcalc/solareqns.PDF), [CLM surface fluxes](https://escomp.github.io/CTSM/release-clm5.0/tech_note/Fluxes/CLM50_Tech_Note_Fluxes.html), [FAO-56](https://www.fao.org/4/x0490e/x0490e06.htm), and [USACE water temperature](https://www.hec.usace.army.mil/confluence/wqetm/water-quality-transformation-libaries/water-temperature-simulation-module). This application is a distinct simplified demonstration, not an implementation of those full models.
