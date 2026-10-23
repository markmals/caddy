// Boolean operations (OCCT BRepAlgoAPI). Results are OCCT's raw output, usually a compound.

import type { Shape } from "./types.ts";

import { addon } from "./addon.ts";

/** How shared sub-shapes are glued: off, shift (touching shapes) or full (coincident faces). */
export type GlueMode = "off" | "shift" | "full";

export interface BooleanOptions {
    /** Additional tolerance used to merge nearly coincident geometry (OCCT fuzzy value). */
    readonly fuzzyValue?: number;
    readonly glue?: GlueMode;
    /** Run OCCT's parallel algorithm; defaults to true as build123d does. */
    readonly parallel?: boolean;
}

type BooleanFunction = (
    args: readonly Shape[],
    tools: readonly Shape[],
    fuzzy: number,
    glue: GlueMode,
    parallel: boolean,
) => Shape;

interface BooleanAddon {
    booleanFuse: BooleanFunction;
    booleanCut: BooleanFunction;
    booleanCommon: BooleanFunction;
    booleanSection: BooleanFunction;
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
    ): Shape;
}

function native(): BooleanAddon {
    return addon<BooleanAddon>();
}

function run(
    operation: BooleanFunction,
    args: readonly Shape[],
    tools: readonly Shape[],
    options: BooleanOptions,
): Shape {
    return operation(
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
    return run(native().booleanFuse, args, tools, options);
}

export function cut(
    args: readonly Shape[],
    tools: readonly Shape[],
    options: BooleanOptions = {},
): Shape {
    return run(native().booleanCut, args, tools, options);
}

export function common(
    args: readonly Shape[],
    tools: readonly Shape[],
    options: BooleanOptions = {},
): Shape {
    return run(native().booleanCommon, args, tools, options);
}

/** Intersection curves/points of `args` with `tools` (BRepAlgoAPI_Section). */
export function section(
    args: readonly Shape[],
    tools: readonly Shape[],
    options: BooleanOptions = {},
): Shape {
    return run(native().booleanSection, args, tools, options);
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

/** Merges faces and edges lying on the same geometry (ShapeUpgrade_UnifySameDomain). */
export function unifySameDomain(shape: Shape, options: UnifyOptions = {}): Shape {
    return native().unifySameDomain(
        shape,
        options.unifyEdges ?? true,
        options.unifyFaces ?? true,
        options.concatBSplines ?? true,
        options.allowInternalEdges ?? false,
    );
}
