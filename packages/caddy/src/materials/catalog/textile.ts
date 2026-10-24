/**
 * Typical-value property ranges for textiles, generated from bd_materials 0.2.5.
 *
 * Ported from bd_materials (`materials/textile.py`), Copyright 2026 Bernhard Walter,
 * licensed under the Apache License 2.0.
 */

import type { Material } from "../material.ts";

import { Range } from "../range.ts";

/** Every textile grade of the catalog. */
export const TEXTILES: readonly Material[] = [
    {
        name: "Woven_GENERIC",
        category: "textile",
        family: "fabric_weave",
        transparent: false,
        density: 500,
        arealDensity: new Range(150, 300),
        tensileStrength: new Range(10, 50),
        thickness: new Range(0.3, 0.6),
        specificHeatCapacity: new Range(1300, 1700),
        thermalConductivity: new Range(0.03, 0.07),
    },
    {
        name: "Felt_GENERIC",
        category: "textile",
        family: "felt",
        transparent: false,
        density: 120,
        arealDensity: new Range(200, 400),
        tensileStrength: new Range(2, 10),
        thickness: new Range(2, 4),
        specificHeatCapacity: new Range(1300, 1700),
        thermalConductivity: new Range(0.04, 0.08),
    },
    {
        name: "Leather_GENERIC",
        category: "textile",
        family: "leather",
        transparent: false,
        density: 950,
        arealDensity: new Range(800, 1600),
        tensileStrength: new Range(10, 30),
        thickness: new Range(1, 3),
        specificHeatCapacity: new Range(1500, 2000),
        thermalConductivity: new Range(0.14, 0.2),
    },
];
