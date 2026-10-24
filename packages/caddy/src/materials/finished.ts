/**
 * A material as applied to a part: the shared catalog {@link Material} (the physics) plus the
 * choices that belong to this one part.
 *
 * The material itself stays an immutable typical-values table; colour, pane thickness, opacity,
 * roughness, the texture transform and the finish or process live here. A finish and a process
 * are mutually exclusive: a finish defines the surface, so the raw as-made one is no longer
 * visible.
 *
 * Ported from bd_materials 0.2.5 (`finished.py`), Copyright 2026 Bernhard Walter, licensed under
 * the Apache License 2.0.
 */

import type { Color } from "../geometry/color.ts";
import type { AppliedFinish } from "./finishes.ts";
import type { Material } from "./material.ts";
import type { AppliedProcess } from "./processes.ts";

import { MaterialError } from "../errors.ts";

/** The per-part choices of a {@link FinishedMaterial}. */
export interface FinishedMaterialOptions {
    /** One applied finish or several; mutually exclusive with `process`. */
    readonly finish?: AppliedFinish | readonly AppliedFinish[];
    /** A selectable base colour for this part. */
    readonly color?: Color;
    /** Pane thickness in mm, meaningful only for a transparent material. */
    readonly thicknessMm?: number;
    /** How see-through this part is, 0 (fully clear) to 1 (opaque). */
    readonly opacity?: number;
    /** Surface roughness, 0 (glossy) to 1 (matte or frosted). */
    readonly roughness?: number;
    /** Texture UV scale `(u, v)` of a substrate texture; defaults to `[1, 1]`. */
    readonly scale?: readonly [number, number];
    /** Texture rotation in degrees, counterclockwise; defaults to 0. */
    readonly rotation?: number;
    /** How the part was made; mutually exclusive with `finish`. */
    readonly process?: AppliedProcess;
}

export class FinishedMaterial {
    /** The physics: the shared, immutable range table this part is made of. */
    readonly material: Material;
    finish: AppliedFinish | readonly AppliedFinish[] | undefined;
    color: Color | undefined;
    thicknessMm: number | undefined;
    opacity: number | undefined;
    roughness: number | undefined;
    scale: readonly [number, number];
    rotation: number;
    process: AppliedProcess | undefined;

    constructor(material: Material, options: FinishedMaterialOptions = {}) {
        if (options.finish !== undefined && options.process !== undefined) {
            throw new MaterialError(
                "A finish and a process are mutually exclusive: a finish defines the surface, " +
                    "so the raw as-made surface a process leaves is no longer visible",
            );
        }
        this.material = material;
        this.finish = options.finish;
        this.color = options.color;
        this.thicknessMm = options.thicknessMm;
        this.opacity = options.opacity;
        this.roughness = options.roughness;
        this.scale = options.scale ?? [1, 1];
        this.rotation = options.rotation ?? 0;
        this.process = options.process;
    }

    /** The underlying material's catalog name, e.g. `"Alu_G6061_T6"`. */
    get name(): string {
        return this.material.name;
    }

    /** The density this part masses with, in kg/m³. */
    get density(): number {
        return this.material.density;
    }
}
