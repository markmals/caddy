/**
 * Typical-value property ranges for papers, generated from bd_materials 0.2.5.
 *
 * Ported from bd_materials (`materials/paper.py`), Copyright 2026 Bernhard Walter,
 * licensed under the Apache License 2.0.
 */

import type { Material } from "../material.ts";

import { Range } from "../range.ts";

/** Every paper grade of the catalog. */
export const PAPERS: readonly Material[] = [
    {
        name: "Paper_OFFICE",
        category: "paper",
        family: "paper",
        transparent: false,
        density: 800,
        arealDensity: new Range(70, 90),
        tensileStrength: new Range(20, 60),
        thickness: new Range(0.09, 0.12),
        specificHeatCapacity: new Range(1300, 1400),
        thermalConductivity: new Range(0.05, 0.1),
    },
    {
        name: "Cardboard_CORRUGATED",
        category: "paper",
        family: "corrugated_cardboard",
        transparent: false,
        density: 140,
        arealDensity: new Range(400, 700),
        tensileStrength: new Range(5, 25),
        thickness: new Range(3, 5),
        specificHeatCapacity: new Range(1300, 1400),
        thermalConductivity: new Range(0.05, 0.1),
    },
    {
        name: "Foamboard_GENERIC",
        category: "paper",
        family: "foamboard",
        transparent: false,
        density: 120,
        arealDensity: new Range(400, 550),
        tensileStrength: new Range(2, 10),
        thickness: new Range(3, 6),
        specificHeatCapacity: new Range(1300, 1500),
        thermalConductivity: new Range(0.03, 0.06),
    },
];
