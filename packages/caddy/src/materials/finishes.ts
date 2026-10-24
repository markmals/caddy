/**
 * The surface-finish catalog: one group of finishes per process family.
 *
 * A {@link Finish} is a finish's intrinsic spec and nothing else. Which colours it is offered in
 * is a per-application choice ({@link AppliedFinish}, built by the verb functions in
 * `finish-functions.ts`), and which materials it is typically used on lives in
 * `applicability.ts`. Finishes are advisory: any finish may be specified on any material.
 *
 * Ported from bd_materials 0.2.5 (`finishes.py`), Copyright 2026 Bernhard Walter, licensed under
 * the Apache License 2.0.
 */

import type { Color } from "../geometry/color.ts";

/** Surface sheen of a paint or coating — a per-application choice, like colour. */
export const Sheen = { Gloss: "gloss", Matte: "matte" } as const;
export type Sheen = (typeof Sheen)[keyof typeof Sheen];

/** A surface finish's intrinsic spec. */
export interface Finish {
    readonly name: string;
    readonly notes?: string;
}

export const Mechanical = {
    BeadBlast: "bead_blast",
    Brushed: "brushed",
    FineSanding: "fine_sanding",
    SmoothMachining: "smooth_machining",
    Electropolished: "electropolished",
} as const;
export type Mechanical = (typeof Mechanical)[keyof typeof Mechanical];

export const MECHANICAL_FINISHES: Readonly<Record<Mechanical, Finish>> = {
    [Mechanical.BeadBlast]: { name: "Bead Blast" },
    [Mechanical.Brushed]: { name: "Brushed" },
    [Mechanical.FineSanding]: { name: "Fine Sanding" },
    [Mechanical.SmoothMachining]: {
        name: "Smooth machining (Ra1.6µm)",
        notes: "as-machined roughness spec",
    },
    [Mechanical.Electropolished]: { name: "Electropolished" },
};

export const Chemical = {
    Anodized: "anodized",
    ChemFilm: "chem_film",
    ConductiveOxidation: "conductive_oxidation",
    BlackOxide: "black_oxide",
    Passivation: "passivation",
    Pickling: "pickling",
    Dyeing: "dyeing",
} as const;
export type Chemical = (typeof Chemical)[keyof typeof Chemical];

export const CHEMICAL_FINISHES: Readonly<Record<Chemical, Finish>> = {
    [Chemical.Anodized]: {
        name: "Anodized",
        notes:
            "typical colors: natural, black, gray, gold, rose gold, red, blue, " +
            "champagne, brown, purple, green, orange",
    },
    [Chemical.ChemFilm]: {
        name: "Chemical conversion coat (Chem film)",
        notes: "typical colors: clear, gold",
    },
    [Chemical.ConductiveOxidation]: {
        name: "Electrically conductive oxidation",
        notes: "color: clear",
    },
    [Chemical.BlackOxide]: { name: "Black oxide", notes: "color: black" },
    [Chemical.Passivation]: { name: "Passivation" },
    [Chemical.Pickling]: { name: "Pickling" },
    [Chemical.Dyeing]: {
        name: "Dyeing",
        notes: "anodized aluminum, or dyeable polymers (esp. nylon)",
    },
};

export const MetalPlating = {
    ChromePlating: "chrome_plating",
    GoldPlating: "gold_plating",
    NickelPlating: "nickel_plating",
    SilverPlating: "silver_plating",
    TinPlating: "tin_plating",
    Pvd: "pvd",
    ZincPlating: "zinc_plating",
    VacuumPlating: "vacuum_plating",
} as const;
export type MetalPlating = (typeof MetalPlating)[keyof typeof MetalPlating];

export const METAL_PLATING_FINISHES: Readonly<Record<MetalPlating, Finish>> = {
    [MetalPlating.ChromePlating]: { name: "Chrome plating", notes: "color: chrome" },
    [MetalPlating.GoldPlating]: { name: "Gold plating", notes: "color: gold" },
    [MetalPlating.NickelPlating]: { name: "Nickel plating", notes: "color: nickel" },
    [MetalPlating.SilverPlating]: { name: "Silver plating", notes: "color: silver" },
    [MetalPlating.TinPlating]: { name: "Tin plating", notes: "color: silver" },
    [MetalPlating.Pvd]: {
        name: "PVD (Physical Vapor Deposition)",
        notes: "typical colors: gold, rose gold, black, gunmetal, blue",
    },
    [MetalPlating.ZincPlating]: {
        name: "Zinc plating",
        notes:
            "corrosion protection for ferrous steels; " +
            "typical colors: clear, blue, yellow, black",
    },
    [MetalPlating.VacuumPlating]: { name: "Vacuum plating" },
};

export const Coating = {
    PowderCoat: "powder_coat",
    Electrophoresis: "electrophoresis",
    SprayPaint: "spray_paint",
} as const;
export type Coating = (typeof Coating)[keyof typeof Coating];

export const COATING_FINISHES: Readonly<Record<Coating, Finish>> = {
    [Coating.PowderCoat]: { name: "Powder coat" },
    [Coating.Electrophoresis]: { name: "Electrophoresis" },
    [Coating.SprayPaint]: { name: "Spray painting" },
};

export const Marking = {
    LaserEngraving: "laser_engraving",
    Etching: "etching",
    Silkscreen: "silkscreen",
} as const;
export type Marking = (typeof Marking)[keyof typeof Marking];

export const MARKING_FINISHES: Readonly<Record<Marking, Finish>> = {
    [Marking.LaserEngraving]: { name: "Laser engraving" },
    [Marking.Etching]: { name: "Etching" },
    [Marking.Silkscreen]: { name: "Silkscreen" },
};

/** The key of any finish in the catalog, whichever group it belongs to. */
export type FinishKey = Mechanical | Chemical | MetalPlating | Coating | Marking;

/** Every finish, keyed the way `applicability.ts` reads them. */
export const FINISHES_BY_KEY: Readonly<Record<FinishKey, Finish>> = {
    ...MECHANICAL_FINISHES,
    ...CHEMICAL_FINISHES,
    ...METAL_PLATING_FINISHES,
    ...COATING_FINISHES,
    ...MARKING_FINISHES,
};

/** Every finish of the catalog, in group order. */
export const ALL_FINISHES: readonly Finish[] = Object.values(FINISHES_BY_KEY);

/** A finish plus the per-application choices the finish functions bind to it. */
export interface AppliedFinish {
    readonly finish: Finish;
    readonly color?: Color;
    /** Absent when the finish has no sheen choice. */
    readonly sheen?: Sheen;
    /** Texture UV scale `(u, v)`; `[1, 1]` is the as-authored size. */
    readonly scale: readonly [number, number];
    /** Texture rotation in degrees, counterclockwise. */
    readonly rotation: number;
}
