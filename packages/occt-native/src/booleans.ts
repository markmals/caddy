// Boolean operations (OCCT BRepAlgoAPI). Results are OCCT's raw output, usually a compound.

import type { Recorded } from "./history.ts";
import type { Shape } from "./types.ts";

import { addon } from "./addon.ts";

/** How shared sub-shapes are glued: off, shift (touching shapes) or full (coincident faces). */
export type GlueMode = "off" | "shift" | "full";

/** The boolean algorithms, by the name `withHistory` and the operations below pass on. */
export type BooleanKind = "fuse" | "cut" | "common" | "section";

export interface BooleanOptions {
    /** Additional tolerance used to merge nearly coincident geometry (OCCT fuzzy value). */
    readonly fuzzyValue?: number;
    readonly glue?: GlueMode;
    /** Run OCCT's parallel algorithm; defaults to true as build123d does. */
    readonly parallel?: boolean;
}

interface BooleanAddon {
    booleanOperation(
        kind: BooleanKind,
        args: readonly Shape[],
        tools: readonly Shape[],
        fuzzy: number,
        glue: GlueMode,
        parallel: boolean,
    ): Recorded;
    booleanSplit(
        args: readonly Shape[],
        tools: readonly Shape[],
        fuzzy: number,
        parallel: boolean,
    ): Shape;
    unifySameDomain(
        shape: Shape,
        unifyEdges: boolean,
        unifyFaces: boolean,
        concatBSplines: boolean,
        allowInternalEdges: boolean,
    ): Recorded;
}

function native(): BooleanAddon {
    return addon<BooleanAddon>();
}

/**
 * One boolean operation, with the record of what it did to its inputs' sub-shapes; the
 * operations below are this one with the record dropped.
 */
export function withHistory(
    kind: BooleanKind,
    args: readonly Shape[],
    tools: readonly Shape[],
    options: BooleanOptions = {},
): Recorded {
    return native().booleanOperation(
        kind,
        args,
        tools,
        options.fuzzyValue ?? 0,
        options.glue ?? "off",
        options.parallel ?? true,
    );
}

export function fuse(
    args: readonly Shape[],
    tools: readonly Shape[],
    options: BooleanOptions = {},
): Shape {
    return withHistory("fuse", args, tools, options).shape;
}

export function cut(
    args: readonly Shape[],
    tools: readonly Shape[],
    options: BooleanOptions = {},
): Shape {
    return withHistory("cut", args, tools, options).shape;
}

export function common(
    args: readonly Shape[],
    tools: readonly Shape[],
    options: BooleanOptions = {},
): Shape {
    return withHistory("common", args, tools, options).shape;
}

/** Intersection curves/points of `args` with `tools` (BRepAlgoAPI_Section). */
export function section(
    args: readonly Shape[],
    tools: readonly Shape[],
    options: BooleanOptions = {},
): Shape {
    return withHistory("section", args, tools, options).shape;
}

/** Splits `args` by `tools`, keeping every piece (BRepAlgoAPI_Splitter). */
export function split(
    args: readonly Shape[],
    tools: readonly Shape[],
    options: Pick<BooleanOptions, "fuzzyValue" | "parallel"> = {},
): Shape {
    return native().booleanSplit(args, tools, options.fuzzyValue ?? 0, options.parallel ?? true);
}

export interface UnifyOptions {
    readonly unifyEdges?: boolean;
    readonly unifyFaces?: boolean;
    readonly concatBSplines?: boolean;
    readonly allowInternalEdges?: boolean;
}

/**
 * Merges faces and edges lying on the same geometry (ShapeUpgrade_UnifySameDomain), with the
 * record of what the merge did to them.
 */
export function unifyWithHistory(shape: Shape, options: UnifyOptions = {}): Recorded {
    return native().unifySameDomain(
        shape,
        options.unifyEdges ?? true,
        options.unifyFaces ?? true,
        options.concatBSplines ?? true,
        options.allowInternalEdges ?? false,
    );
}

/** Merges faces and edges lying on the same geometry (ShapeUpgrade_UnifySameDomain). */
export function unifySameDomain(shape: Shape, options: UnifyOptions = {}): Shape {
    return unifyWithHistory(shape, options).shape;
}
