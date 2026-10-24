/**
 * Manufacturing processes — how a part was produced, and the surface that leaves.
 *
 * A {@link Process} is the intrinsic route and nothing per-part; the verb functions bind the
 * geometry of the surface it leaves and return an {@link AppliedProcess}. Which geometry a verb
 * exposes follows what the surface looks like: FDM layer lines are directional, so `fdm` takes a
 * rotation and a pitch; a sintered powder surface is isotropic, so `sls` takes a scale only; a
 * machined or moulded surface has no as-made relief, so those verbs take nothing.
 *
 * A process and a finish are mutually exclusive on a {@link FinishedMaterial}: a finish defines
 * the surface, so the raw as-made one is no longer visible.
 *
 * Ported from bd_materials 0.2.5 (`processes.py`), Copyright 2026 Bernhard Walter, licensed under
 * the Apache License 2.0.
 */

/** The printed pitch the bundled FDM wall look is authored at, in mm. */
export const AUTHORED_LAYER_HEIGHT_MM = 0.2;

/** The printed pitch the bundled FDM skin look is authored at, in mm (the extrusion width). */
export const AUTHORED_LINE_WIDTH_MM = 0.4;

/** The infill direction the skin look is authored at; slicers alternate, so a bottom face is -45. */
export const AUTHORED_SKIN_ROTATION = 45;

/** How a part is produced — the intrinsic route behind the verb functions. */
export const Process = {
    Fdm: "fdm",
    Sls: "sls",
    Mjf: "mjf",
    /** Metal powder bed / additive. */
    Slm: "slm",
    /** SLA / DLP resin. */
    Vat: "vat",
    Molded: "molded",
    Machined: "machined",
    Cast: "cast",
    Wrought: "wrought",
} as const;
export type Process = (typeof Process)[keyof typeof Process];

/** A process plus the per-part geometry of the surface it leaves. */
export interface AppliedProcess {
    readonly process: Process;
    /** Texture UV scale `(u, v)`; `[1, 1]` is the as-authored size. */
    readonly scale: readonly [number, number];
    /** Texture rotation in degrees, counterclockwise. */
    readonly rotation: number;
    /**
     * FDM only: the pitch of the extrusion lines a face shows, in mm — the layer height on a
     * wall, the infill line width on a skin.
     */
    readonly pitchMm?: number;
    /** FDM only: the solid top/bottom surface rather than the wall. */
    readonly skin: boolean;
    /** How many millimetres one UV unit spans on this face; 1 is an already metric face. */
    readonly mmPerUv: number;
}

function applied(process: Process, parts: Partial<AppliedProcess> = {}): AppliedProcess {
    return { process, scale: [1, 1], rotation: 0, skin: false, mmPerUv: 1, ...parts };
}

/** Options of {@link fdm}. */
export interface FdmOptions {
    /** The printed layer pitch in mm; defaults to {@link AUTHORED_LAYER_HEIGHT_MM}. */
    readonly layerHeightMm?: number;
    /** Lays the layer lines parallel to the base plate, in degrees. Defaults to 0. */
    readonly rotation?: number;
    /**
     * How many millimetres one UV unit spans on this face. 1 is right wherever the
     * parameterization is already metric — a planar face, a cylinder's lateral surface. It is not
     * right where the parameter is an angle: pass a sphere's radius there.
     */
    readonly mmPerUv?: number;
}

/** Fused-deposition (filament) printing — the wall, showing stacked extruded layer lines. */
export function fdm(options: FdmOptions = {}): AppliedProcess {
    return applied(Process.Fdm, {
        rotation: options.rotation ?? 0,
        pitchMm: options.layerHeightMm ?? AUTHORED_LAYER_HEIGHT_MM,
        mmPerUv: options.mmPerUv ?? 1,
    });
}

/** Options of {@link fdmSkin}. */
export interface FdmSkinOptions {
    /** The infill line pitch in mm, i.e. the extrusion width; defaults to 0.4. */
    readonly lineWidthMm?: number;
    /** Infill direction in degrees; defaults to 45, and a bottom face is -45. */
    readonly rotation?: number;
}

/**
 * Fused-deposition printing, the solid top/bottom surface rather than the wall: side-by-side
 * infill beads squashed flat, a far finer relief than the wall's stacked layer lines. Its pitch
 * is the extrusion width, which is why this is a verb of its own rather than a flag on
 * {@link fdm}.
 */
export function fdmSkin(options: FdmSkinOptions = {}): AppliedProcess {
    return applied(Process.Fdm, {
        rotation: options.rotation ?? AUTHORED_SKIN_ROTATION,
        pitchMm: options.lineWidthMm ?? AUTHORED_LINE_WIDTH_MM,
        skin: true,
    });
}

/** Options of the isotropic powder-bed verbs. */
export interface PowderBedOptions {
    /** Texture UV scale `(u, v)`; `[2, 2]` reads the grain twice as large. Defaults to `[1, 1]`. */
    readonly scale?: readonly [number, number];
}

/** Selective laser sintering — a matte sintered-powder surface. */
export function sls(options: PowderBedOptions = {}): AppliedProcess {
    return applied(Process.Sls, { scale: options.scale ?? [1, 1] });
}

/** Multi Jet Fusion — a matte fused-powder surface. */
export function mjf(options: PowderBedOptions = {}): AppliedProcess {
    return applied(Process.Mjf, { scale: options.scale ?? [1, 1] });
}

/** Selective laser melting — metal powder bed, a matte as-built surface. */
export function slm(options: PowderBedOptions = {}): AppliedProcess {
    return applied(Process.Slm, { scale: options.scale ?? [1, 1] });
}

/** Vat photopolymerization (SLA / DLP) — a smooth as-printed resin surface. */
export function vat(): AppliedProcess {
    return applied(Process.Vat);
}

/** Injection or compression moulding — takes the tool's smooth surface. */
export function molded(): AppliedProcess {
    return applied(Process.Molded);
}

/** Machined from stock — a smooth as-cut surface. */
export function machined(): AppliedProcess {
    return applied(Process.Machined);
}

/** Cast — a smooth as-cast surface. */
export function cast(): AppliedProcess {
    return applied(Process.Cast);
}

/** Wrought or formed stock — a smooth mill surface. */
export function wrought(): AppliedProcess {
    return applied(Process.Wrought);
}
