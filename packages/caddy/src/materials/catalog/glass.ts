/**
 * Typical-value property ranges for glass, generated from bd_materials 0.2.5.
 *
 * Ported from bd_materials (`materials/glass.py`), Copyright 2026 Bernhard Walter,
 * licensed under the Apache License 2.0.
 */

import type { Material } from "../material.ts";

import { Range } from "../range.ts";

/** Every glass grade of the catalog. */
export const GLASSES: readonly Material[] = [
    {
        name: "SodaLime_GENERIC",
        category: "glass",
        family: "soda_lime",
        transparent: true,
        density: 2500,
        hardness: new Range(470, 570),
        hardnessScale: "HV",
        modulusOfElasticity: new Range(68, 74),
        poissonRatio: new Range(0.21, 0.24),
        shearModulus: new Range(26, 30),
        tensileStrength: new Range(30, 90),
        glassTransitionTemperature: new Range(520, 570),
        maxServiceTemp: new Range(150, 300),
        meltingTemperature: new Range(1400, 1600),
        specificHeatCapacity: new Range(750, 880),
        thermalConductivity: new Range(0.9, 1.1),
        thermalExpansion: new Range(8.5e-6, 9.5e-6),
    },
    {
        name: "Borosilicate_GENERIC",
        category: "glass",
        family: "borosilicate",
        transparent: true,
        density: 2230,
        hardness: new Range(480, 600),
        hardnessScale: "HV",
        modulusOfElasticity: new Range(60, 66),
        poissonRatio: new Range(0.19, 0.22),
        shearModulus: new Range(24, 28),
        tensileStrength: new Range(30, 90),
        glassTransitionTemperature: new Range(490, 565),
        maxServiceTemp: new Range(230, 400),
        meltingTemperature: new Range(1500, 1650),
        specificHeatCapacity: new Range(750, 830),
        thermalConductivity: new Range(1, 1.2),
        thermalExpansion: new Range(3e-6, 3.5e-6),
    },
];
