/**
 * The material catalog, one module per category, generated from bd_materials 0.2.5.
 *
 * Ported from bd_materials (`materials/`), Copyright 2026 Bernhard Walter, licensed under the
 * Apache License 2.0.
 */

import type { Material } from "../material.ts";

import { MATERIAL_FAMILIES } from "./families.ts";
import { GLASSES } from "./glass.ts";
import { METALS } from "./metals.ts";
import { PAPERS } from "./paper.ts";
import { PLASTICS } from "./plastics.ts";
import { RESINS } from "./resins.ts";
import { TEXTILES } from "./textile.ts";
import { WOODS } from "./wood.ts";

/** Every catalog material, in category order. */
export const ALL_MATERIALS: readonly Material[] = [
    ...METALS,
    ...PLASTICS,
    ...RESINS,
    ...GLASSES,
    ...WOODS,
    ...PAPERS,
    ...TEXTILES,
];

export { MATERIAL_FAMILIES, GLASSES, METALS, PAPERS, PLASTICS, RESINS, TEXTILES, WOODS };
