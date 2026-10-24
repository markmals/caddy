/**
 * Name to material lookup: the string entry point to the catalog, so a part can be given a
 * material as `shape.material = "aluminum"`.
 *
 * Two disjoint key sets, both derived from the catalog: a **family** name (`aluminum`, `walnut`)
 * resolves to that family's default grade, and a **grade** name (`Alu_G7075_T6`) to that exact
 * grade. Names are matched case-insensitively with spaces and hyphens read as underscores, so
 * `"Mild Steel"`, `"mild-steel"` and `"mild_steel"` are one name.
 *
 * The registry stores materials, never finished materials: a {@link FinishedMaterial} carries
 * per-part choices, so every lookup builds a fresh one and one part's tweak cannot leak into
 * another.
 *
 * Ported from bd_materials 0.2.5 (`registry.py`), Copyright 2026 Bernhard Walter, licensed under
 * the Apache License 2.0.
 */

import type { FinishedMaterialOptions } from "./finished.ts";
import type { Material } from "./material.ts";

import { MaterialError } from "../errors.ts";
import { MATERIAL_FAMILIES } from "./catalog/families.ts";
import { ALL_MATERIALS } from "./catalog/index.ts";
import { FinishedMaterial } from "./finished.ts";
import { withDensity } from "./material.ts";

/** Everything a catalog lookup can be given: the per-part choices plus a density override. */
export interface CatalogMaterialOptions extends FinishedMaterialOptions {
    /** Override the grade's single representative density, in kg/m³, for this part. */
    readonly density?: number;
}

/** A catalog entry: the material a name stands for, ready to be finished per part. */
export type MaterialFactory = (options?: CatalogMaterialOptions) => FinishedMaterial;

function normalize(name: string): string {
    return name.trim().toLowerCase().replaceAll(" ", "_").replaceAll("-", "_");
}

function buildRegistry(): ReadonlyMap<string, Material> {
    let entries = new Map<string, Material>();
    for (let material of ALL_MATERIALS) {
        entries.set(normalize(material.name), material);
    }
    for (let [family, grade] of Object.entries(MATERIAL_FAMILIES)) {
        let material = entries.get(normalize(grade));
        if (material === undefined) {
            throw new MaterialError(
                `Family ${family} names a grade ${grade} that is not in the catalog`,
            );
        }
        entries.set(normalize(family), material);
    }
    return entries;
}

const REGISTRY = buildRegistry();

/** Every name {@link resolveMaterial} accepts — the family names and the grade names — sorted. */
export function materialNames(): string[] {
    return [...REGISTRY.keys()].sort();
}

/** The catalog material a name stands for, without the per-part wrapper. */
export function catalogMaterial(name: string): Material {
    let material = REGISTRY.get(normalize(name));
    if (material === undefined) {
        throw new MaterialError(
            `Unknown material "${name}"; materialNames() lists all ${REGISTRY.size}`,
        );
    }
    return material;
}

/**
 * The entry a material name stands for, uncalled — the customizable counterpart of
 * {@link resolveMaterial}, for a caller that wants to pass the per-part choices too:
 * `materialFactory("aluminum")({ finish: anodize(blue) })`.
 */
export function materialFactory(name: string): MaterialFactory {
    let material = catalogMaterial(name);
    return (options = {}) => new FinishedMaterial(withDensity(material, options.density), options);
}

/**
 * A material in any of its three spellings as a fresh {@link FinishedMaterial}: a catalog name,
 * a bare {@link Material}, or a finished material (returned unchanged).
 */
export function resolveMaterial(material: string | Material | FinishedMaterial): FinishedMaterial {
    if (material instanceof FinishedMaterial) {
        return material;
    }
    if (typeof material === "string") {
        return new FinishedMaterial(catalogMaterial(material));
    }
    let candidate = material as Partial<Material> | null | undefined;
    if (
        candidate === null ||
        candidate === undefined ||
        typeof candidate.name !== "string" ||
        typeof candidate.density !== "number"
    ) {
        throw new MaterialError(
            "A material must be a catalog name, a Material or a FinishedMaterial",
        );
    }
    return new FinishedMaterial(material);
}

/**
 * The catalog name of a material, as {@link resolveMaterial} accepts it back. Always the grade
 * name, never the family name, so it stays exact if a family's default grade ever changes. The
 * per-part choices of a finished material are not encoded and are lost by the round trip.
 */
export function canonicalName(material: Material | FinishedMaterial): string {
    let name = material.name;
    if (!REGISTRY.has(normalize(name))) {
        throw new MaterialError(
            `"${name}" is not a catalog material, so it has no name resolveMaterial() would accept`,
        );
    }
    return name;
}
