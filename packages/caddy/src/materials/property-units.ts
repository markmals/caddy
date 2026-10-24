/**
 * The one unit per material property, split into the two groups a property table is read in.
 * `hardness` is absent on purpose: its unit is per material, the grade's `hardnessScale`.
 *
 * Ported from bd_materials 0.2.5 (`core.py`), Copyright 2026 Bernhard Walter, licensed under the
 * Apache License 2.0.
 */

import type { Material } from "./material.ts";

/** The properties quoted in a mechanical unit; `Pick` ties the names to {@link Material}. */
export type MechanicalProperty = keyof Pick<
    Material,
    | "arealDensity"
    | "compressiveStrengthParallel"
    | "density"
    | "elongationAtBreak"
    | "jankaHardness"
    | "modulusOfElasticity"
    | "modulusOfRupture"
    | "poissonRatio"
    | "shearModulus"
    | "shearStrength"
    | "tensileStrength"
    | "thickness"
    | "yieldStrength"
>;

/** The properties quoted in a thermal unit. */
export type ThermalProperty = keyof Pick<
    Material,
    | "glassTransitionTemperature"
    | "heatDeflectionTemperature"
    | "maxServiceTemp"
    | "meltingTemperature"
    | "specificHeatCapacity"
    | "thermalConductivity"
    | "thermalExpansion"
>;

/** Every material property that has one fixed unit. */
export type MaterialProperty = MechanicalProperty | ThermalProperty;

export const MECHANICAL_PROPERTY_UNITS: Readonly<Record<MechanicalProperty, string>> = {
    arealDensity: "g/m²",
    compressiveStrengthParallel: "MPa",
    density: "kg/m³",
    elongationAtBreak: "%",
    jankaHardness: "N",
    modulusOfElasticity: "GPa",
    modulusOfRupture: "MPa",
    poissonRatio: "",
    shearModulus: "GPa",
    shearStrength: "MPa",
    tensileStrength: "MPa",
    thickness: "mm",
    yieldStrength: "MPa",
};

export const THERMAL_PROPERTY_UNITS: Readonly<Record<ThermalProperty, string>> = {
    glassTransitionTemperature: "°C",
    heatDeflectionTemperature: "°C",
    maxServiceTemp: "°C",
    meltingTemperature: "°C",
    specificHeatCapacity: "J/(kg·K)",
    thermalConductivity: "W/(m·K)",
    thermalExpansion: "1/K",
};

/** Both groups flattened: the unit of every material property. */
export const PROPERTY_UNITS: Readonly<Record<MaterialProperty, string>> = {
    ...MECHANICAL_PROPERTY_UNITS,
    ...THERMAL_PROPERTY_UNITS,
};
