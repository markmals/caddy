// In-memory serialization. File access stays in JavaScript so paths, buffers and streams all
// share one code path. Every call runs on Node's worker pool (see crates/occt-neon/exchange.rs)
// and resolves a promise.

import type { Shape } from "./types.ts";

import { addon } from "./addon.ts";

/** One node of an assembly on the way to or from a STEP file. */
export interface StepNode<T> {
    readonly shape: T;
    /** STEP product name; empty leaves OCCT's generated name. */
    readonly label: string;
    /** `[r, g, b, a]` in 0..1, or null when the shape has no colour. */
    readonly color: Float64Array | null;
    readonly children: readonly StepNode<T>[];
}

/** Which sub-shapes inherit the node's colour (build123d's Part / Sketch / Curve behaviour). */
export type SubShapeColors = "none" | "solids" | "faces" | "edges";

export interface StepWriteNode extends StepNode<Shape> {
    readonly subShapeColors: SubShapeColors;
    readonly children: readonly StepWriteNode[];
}

/** `write.precision.mode`: how OCCT derives the written geometric precision. */
export const StepPrecisionMode = { Least: -1, Average: 0, Greatest: 1, Session: 2 } as const;
export type StepPrecisionMode = (typeof StepPrecisionMode)[keyof typeof StepPrecisionMode];

export interface StepWriteOptions {
    /** Metres per model unit: 0.001 for millimetres, 1 for metres. */
    readonly lengthUnitMeters: number;
    /** `write.surfacecurve.mode`: write parametric curves alongside the 3D geometry. */
    readonly writePCurves: boolean;
    readonly precisionMode: StepPrecisionMode;
    /** STEP header `FILE_NAME` originating system. */
    readonly originatingSystem: string;
    /** STEP header `FILE_NAME` name; empty leaves OCCT's default. */
    readonly name: string;
    /** STEP header `FILE_NAME` timestamp; empty leaves OCCT's default. */
    readonly timestamp: string;
}

interface IoAddon {
    brepWrite(shape: Shape, binary: boolean): Promise<Uint8Array>;
    brepRead(bytes: Uint8Array, binary: boolean): Promise<Shape>;
    stepWrite(root: StepWriteNode, options: StepWriteOptions): Promise<Uint8Array>;
    stepRead(bytes: Uint8Array): Promise<StepNode<Shape>[]>;
    igesWrite(shape: Shape, unit: string, brepMode: number): Promise<Uint8Array>;
    igesRead(path: string): Promise<Shape>;
}

function native(): IoAddon {
    return addon<IoAddon>();
}

/** OCCT's native BREP format: exact and lossless for a single shape. */
export function writeBrep(shape: Shape, binary = false): Promise<Uint8Array> {
    return native().brepWrite(shape, binary);
}

export function readBrep(bytes: Uint8Array, binary = false): Promise<Shape> {
    return native().brepRead(bytes, binary);
}

/** STEP AP214 through XCAF, carrying product names, colours and assembly structure. */
export function writeStep(root: StepWriteNode, options: StepWriteOptions): Promise<Uint8Array> {
    return native().stepWrite(root, options);
}

/** The free shapes of a STEP file with their names, colours and components. */
export function readStep(bytes: Uint8Array): Promise<StepNode<Shape>[]> {
    return native().stepRead(bytes);
}

/**
 * IGES 5.3. `unit` is an IGES unit name (`MM`, `M`, `IN`, ...); `brepMode` 0 writes faces as
 * trimmed surfaces, 1 writes BREP entities.
 */
export function writeIges(shape: Shape, unit = "MM", brepMode = 0): Promise<Uint8Array> {
    return native().igesWrite(shape, unit, brepMode);
}

/**
 * Every root of an IGES file as one shape (a compound when there are several). OCCT 8.0.1's
 * `IGESSelect_WorkLibrary` has no stream reader, so unlike the other formats IGES import takes
 * a real file path.
 */
export function readIges(path: string): Promise<Shape> {
    return native().igesRead(path);
}
