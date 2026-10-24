/**
 * Which finishes are typically used on which materials, as one central table.
 *
 * Advisory only — any finish may be applied to any material — so this is a hint, never a
 * constraint. A finish's substrate set holds category names (`"metal"`) and family names
 * (`"stainless"`); a material matches when either of its own matches.
 *
 * Ported from bd_materials 0.2.5 (`applicability.py`, substrate groupings from `core.py`),
 * Copyright 2026 Bernhard Walter, licensed under the Apache License 2.0.
 */

import type { AppliedFinish, Finish, FinishKey } from "./finishes.ts";
import type { Material } from "./material.ts";

import { MaterialError } from "../errors.ts";
import { ALL_MATERIALS } from "./catalog/index.ts";
import {
    Chemical,
    Coating,
    FINISHES_BY_KEY,
    Marking,
    Mechanical,
    MetalPlating,
} from "./finishes.ts";

/** The ferrous steel families, a grouping below the category taxonomy. */
const FERROUS = ["mild_steel", "alloy_steel", "tool_steel", "spring_steel"];
const METAL = ["metal"];
const PAINTABLE = ["metal", "plastic", "resin", "wood"];
const COATABLE_POLY = ["metal", "plastic", "resin"];
const EVERYTHING = ["metal", "plastic", "resin", "wood", "glass", "paper", "textile"];

/** Finish to the substrate keys — categories and families — it is typically used on. */
export const TYPICAL_SUBSTRATES: Readonly<Record<FinishKey, readonly string[]>> = {
    [Mechanical.BeadBlast]: ["metal", "plastic"],
    [Mechanical.Brushed]: METAL,
    [Mechanical.FineSanding]: ["metal", "plastic", "wood"],
    [Mechanical.SmoothMachining]: ["metal", "plastic", "wood"],
    [Mechanical.Electropolished]: ["stainless", "titanium"],
    [Chemical.Anodized]: ["aluminum", "titanium"],
    [Chemical.ChemFilm]: ["aluminum"],
    [Chemical.ConductiveOxidation]: ["aluminum"],
    [Chemical.BlackOxide]: [...FERROUS, "stainless", "copper", "brass"],
    [Chemical.Passivation]: ["stainless", "titanium"],
    [Chemical.Pickling]: [...FERROUS, "stainless"],
    [Chemical.Dyeing]: ["plastic", "resin", "aluminum"],
    [MetalPlating.ChromePlating]: METAL,
    [MetalPlating.GoldPlating]: METAL,
    [MetalPlating.NickelPlating]: METAL,
    [MetalPlating.SilverPlating]: METAL,
    [MetalPlating.TinPlating]: METAL,
    [MetalPlating.Pvd]: METAL,
    [MetalPlating.ZincPlating]: FERROUS,
    [MetalPlating.VacuumPlating]: COATABLE_POLY,
    [Coating.PowderCoat]: METAL,
    [Coating.Electrophoresis]: METAL,
    [Coating.SprayPaint]: PAINTABLE,
    [Marking.LaserEngraving]: EVERYTHING,
    [Marking.Etching]: ["metal", "glass"],
    [Marking.Silkscreen]: ["metal", "plastic", "resin", "glass"],
};

const KEY_BY_FINISH = new Map<Finish, FinishKey>(
    Object.entries(FINISHES_BY_KEY).map(([key, finish]) => [finish, key as FinishKey]),
);

function substrateKey(finish: FinishKey | Finish | AppliedFinish): FinishKey {
    if (typeof finish === "string") return finish;
    let spec = "finish" in finish ? finish.finish : finish;
    let key = KEY_BY_FINISH.get(spec);
    if (key === undefined) {
        throw new MaterialError(`${spec.name} is not a catalog finish`);
    }
    return key;
}

function matches(material: Material, substrates: readonly string[]): boolean {
    return substrates.includes(material.category) || substrates.includes(material.family);
}

/** The finishes typically used on `material`, matched by its category and family. */
export function typicalFinishes(material: Material): Finish[] {
    return Object.entries(TYPICAL_SUBSTRATES)
        .filter(([, substrates]) => matches(material, substrates))
        .map(([key]) => FINISHES_BY_KEY[key as FinishKey]);
}

/** The catalog materials `finish` is typically used on. */
export function typicalMaterials(finish: FinishKey | Finish | AppliedFinish): Material[] {
    let substrates = TYPICAL_SUBSTRATES[substrateKey(finish)];
    return ALL_MATERIALS.filter(material => matches(material, substrates));
}
