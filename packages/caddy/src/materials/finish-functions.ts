/**
 * The finish verbs: the public way to apply a finish, binding the per-part colour, sheen and
 * texture transform to a catalog {@link Finish}.
 *
 * Ported from bd_materials 0.2.5 (`finishes.py`), Copyright 2026 Bernhard Walter, licensed under
 * the Apache License 2.0.
 */

import type { AppliedFinish, Sheen } from "./finishes.ts";

import { Color } from "../geometry/color.ts";
import {
    Chemical,
    CHEMICAL_FINISHES,
    Coating,
    COATING_FINISHES,
    Marking,
    MARKING_FINISHES,
    Mechanical,
    MECHANICAL_FINISHES,
    METAL_PLATING_FINISHES,
    MetalPlating,
    Sheen as Sheens,
} from "./finishes.ts";

/** The ink and primer colour the marking and e-coat verbs use when none is given. */
const BLACK = new Color(0, 0, 0);

/** The texture transform a tileable finish accepts. */
export interface TextureOptions {
    /** Texture UV scale `(u, v)`; `[2, 2]` tiles the grain twice as fine. Defaults to `[1, 1]`. */
    readonly scale?: readonly [number, number];
    /** Texture rotation in degrees, counterclockwise. Defaults to 0. */
    readonly rotation?: number;
}

/** What a painted or coated finish is offered in besides its colour. */
export interface SheenOptions {
    /** Defaults to {@link Sheen.Gloss}. */
    readonly sheen?: Sheen;
}

function applied(
    finish: AppliedFinish["finish"],
    options: TextureOptions & { readonly color?: Color; readonly sheen?: Sheen } = {},
): AppliedFinish {
    return {
        finish,
        ...(options.color === undefined ? {} : { color: options.color }),
        ...(options.sheen === undefined ? {} : { sheen: options.sheen }),
        scale: options.scale ?? [1, 1],
        rotation: options.rotation ?? 0,
    };
}

// --- mechanical (no colour) ------------------------------------------------

/** Bead-blasted matte finish; isotropic, so it takes no rotation. */
export function beadBlast(options: Pick<TextureOptions, "scale"> = {}): AppliedFinish {
    return applied(MECHANICAL_FINISHES[Mechanical.BeadBlast], options);
}

/** Brushed directional-satin finish; `rotation` runs the brush lines across the part. */
export function brushed(options: TextureOptions = {}): AppliedFinish {
    return applied(MECHANICAL_FINISHES[Mechanical.Brushed], options);
}

/** Fine-sanded smooth-matte finish; isotropic, so it takes no rotation. */
export function fineSanding(options: Pick<TextureOptions, "scale"> = {}): AppliedFinish {
    return applied(MECHANICAL_FINISHES[Mechanical.FineSanding], options);
}

/** Smooth as-machined finish (Ra 1.6 µm). */
export function smoothMachining(): AppliedFinish {
    return applied(MECHANICAL_FINISHES[Mechanical.SmoothMachining]);
}

/** Electropolished bright finish. */
export function electropolish(): AppliedFinish {
    return applied(MECHANICAL_FINISHES[Mechanical.Electropolished]);
}

// --- chemical --------------------------------------------------------------

/** Anodized finish in `color`, which is mandatory: anodizing is done to add colour. */
export function anodize(color: Color): AppliedFinish {
    return applied(CHEMICAL_FINISHES[Chemical.Anodized], { color });
}

/** Chromate conversion coating (chem film). */
export function chemFilm(): AppliedFinish {
    return applied(CHEMICAL_FINISHES[Chemical.ChemFilm]);
}

/** Electrically conductive oxidation coating. */
export function conductiveOxidation(): AppliedFinish {
    return applied(CHEMICAL_FINISHES[Chemical.ConductiveOxidation]);
}

/** Black-oxide conversion finish. */
export function blackOxide(): AppliedFinish {
    return applied(CHEMICAL_FINISHES[Chemical.BlackOxide]);
}

/** Passivation finish (stainless corrosion resistance). */
export function passivate(): AppliedFinish {
    return applied(CHEMICAL_FINISHES[Chemical.Passivation]);
}

/** Pickling finish (oxide and scale removal). */
export function pickle(): AppliedFinish {
    return applied(CHEMICAL_FINISHES[Chemical.Pickling]);
}

/** Dyed finish in `color` (anodized aluminium or a dyeable polymer). */
export function dye(color: Color): AppliedFinish {
    return applied(CHEMICAL_FINISHES[Chemical.Dyeing], { color });
}

// --- metal plating ---------------------------------------------------------

export function chrome(): AppliedFinish {
    return applied(METAL_PLATING_FINISHES[MetalPlating.ChromePlating]);
}

export function goldPlate(): AppliedFinish {
    return applied(METAL_PLATING_FINISHES[MetalPlating.GoldPlating]);
}

export function nickelPlate(): AppliedFinish {
    return applied(METAL_PLATING_FINISHES[MetalPlating.NickelPlating]);
}

export function silverPlate(): AppliedFinish {
    return applied(METAL_PLATING_FINISHES[MetalPlating.SilverPlating]);
}

/** Tin plating (matte, solderable). */
export function tinPlate(): AppliedFinish {
    return applied(METAL_PLATING_FINISHES[MetalPlating.TinPlating]);
}

/** PVD coating; without a `color` it is the bright natural coating the substrate shows through. */
export function pvd(color?: Color): AppliedFinish {
    return applied(METAL_PLATING_FINISHES[MetalPlating.Pvd], color === undefined ? {} : { color });
}

/** Zinc plating; without a `color` it is the clear/bright chromate, the natural zinc look. */
export function zincPlate(color?: Color): AppliedFinish {
    return applied(
        METAL_PLATING_FINISHES[MetalPlating.ZincPlating],
        color === undefined ? {} : { color },
    );
}

/** Vacuum-metallised plating in `color`. */
export function vacuumPlating(color: Color, options: SheenOptions = {}): AppliedFinish {
    return applied(METAL_PLATING_FINISHES[MetalPlating.VacuumPlating], {
        color,
        sheen: options.sheen ?? Sheens.Gloss,
    });
}

// --- coating and paint -----------------------------------------------------

/** Powder coat in `color`. */
export function powderCoat(color: Color, options: SheenOptions = {}): AppliedFinish {
    return applied(COATING_FINISHES[Coating.PowderCoat], {
        color,
        sheen: options.sheen ?? Sheens.Gloss,
    });
}

/** Spray paint in `color`. */
export function sprayPaint(color: Color, options: SheenOptions = {}): AppliedFinish {
    return applied(COATING_FINISHES[Coating.SprayPaint], {
        color,
        sheen: options.sheen ?? Sheens.Gloss,
    });
}

/** Electrophoretic e-coat in `color`, defaulting to black, the common automotive primer. */
export function electrophoresis(color: Color = BLACK): AppliedFinish {
    return applied(COATING_FINISHES[Coating.Electrophoresis], { color });
}

// --- marking ---------------------------------------------------------------

export function laserEngrave(): AppliedFinish {
    return applied(MARKING_FINISHES[Marking.LaserEngraving]);
}

export function etch(): AppliedFinish {
    return applied(MARKING_FINISHES[Marking.Etching]);
}

/** Silkscreen marking in `color`, defaulting to black ink. */
export function silkscreen(color: Color = BLACK): AppliedFinish {
    return applied(MARKING_FINISHES[Marking.Silkscreen], { color });
}
