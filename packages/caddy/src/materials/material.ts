/**
 * A material of the catalog: its identity and its typical-value property table.
 *
 * Every property is optional because the categories carry different ones — a wood has a Janka
 * hardness and no yield strength — and an absent property means the catalog has no value for it.
 * {@link NOT_SUITABLE} is the stronger statement that the property does not apply at all.
 * A material is plain data, so a user-defined one is an object literal.
 *
 * Ported from bd_materials 0.2.5 (`core.py`), Copyright 2026 Bernhard Walter, licensed under the
 * Apache License 2.0.
 */

import type { Range } from "./range.ts";

/** The category taxonomy every catalog material belongs to. */
export const MaterialCategory = {
    Metal: "metal",
    Plastic: "plastic",
    Resin: "resin",
    Wood: "wood",
    Glass: "glass",
    Paper: "paper",
    Textile: "textile",
} as const;
export type MaterialCategory = (typeof MaterialCategory)[keyof typeof MaterialCategory];

export interface Material {
    /** Catalog name of this exact grade, e.g. `"Alu_G6061_T6"`. */
    readonly name: string;
    readonly category: MaterialCategory;
    /** Identity key shared by every grade of a family, e.g. `"aluminum"`. */
    readonly family: string;
    /** Intrinsically see-through, so a part of it has a meaningful pane thickness. */
    readonly transparent: boolean;
    /** The one single-valued property, in kg/m³; what {@link Shape#computeMass} integrates. */
    readonly density: number;

    // mechanical properties
    /** Grammage of an areal good (paper, textile), in g/m². */
    readonly arealDensity?: Range;
    /** Wood strength along the grain, in MPa. */
    readonly compressiveStrengthParallel?: Range;
    /** Ductility, in %. */
    readonly elongationAtBreak?: Range;
    /** On the scale named by {@link Material#hardnessScale}. */
    readonly hardness?: Range;
    /** Which scale {@link Material#hardness} is quoted on: `"HB"`, `"HRC"`, `"HV"`, `"Shore D"`. */
    readonly hardnessScale?: string;
    /** Wood indentation resistance, in N. */
    readonly jankaHardness?: Range;
    /** Young's modulus, in GPa. */
    readonly modulusOfElasticity?: Range;
    /** Wood bending strength, in MPa. */
    readonly modulusOfRupture?: Range;
    /** Dimensionless. */
    readonly poissonRatio?: Range;
    /** In GPa. */
    readonly shearModulus?: Range;
    /** In MPa. */
    readonly shearStrength?: Range;
    /** In MPa. */
    readonly tensileStrength?: Range;
    /** Sheet thickness of an areal good, in mm. */
    readonly thickness?: Range;
    /** In MPa. */
    readonly yieldStrength?: Range;

    // thermal properties
    /** In °C. */
    readonly glassTransitionTemperature?: Range;
    /** In °C. */
    readonly heatDeflectionTemperature?: Range;
    /** Engineering guide limit rather than a hard maximum, in °C. */
    readonly maxServiceTemp?: Range;
    /** In °C; for glass the furnace-melt range, not a service limit. */
    readonly meltingTemperature?: Range;
    /** In J/(kg·K). */
    readonly specificHeatCapacity?: Range;
    /** In W/(m·K). */
    readonly thermalConductivity?: Range;
    /** In 1/K. */
    readonly thermalExpansion?: Range;
}

/**
 * `material` itself, or a copy whose density is `density` — how a part overrides the single
 * representative density of a grade without touching the shared catalog entry.
 */
export function withDensity(material: Material, density: number | undefined): Material {
    return density === undefined ? material : { ...material, density };
}
