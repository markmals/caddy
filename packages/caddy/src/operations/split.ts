import { booleans } from "@roonieone/occt-native";

import type { TrimmingTool } from "./split-pieces.ts";

import { GeometryError, NativeKernelError } from "../errors.ts";
import { Plane } from "../geometry/index.ts";
import { Sketch } from "../topology/composite.ts";
import { Keep } from "../topology/enums.ts";
import { makeComposite } from "../topology/registry.ts";
import { Shape } from "../topology/shape.ts";
import { cuttingFace, partitioned } from "./split-pieces.ts";

/** Pieces of `shape` cut by `tool`, grouped by which side of `bisectBy` their centre falls on. */
function cutPieces(shape: Shape, tool: Shape, bisectBy: TrimmingTool, keep: Keep): Shape[] {
    let { tops, bottoms, all } = partitioned(shape, tool, bisectBy);
    if (keep === Keep.All) return all;
    if (keep === Keep.Top) return tops;
    return keep === Keep.Bottom ? bottoms : [...tops, ...bottoms];
}

export interface SplitOptions {
    /** Plane, face or shell to cut with; defaults to `Plane.XZ`. */
    readonly bisectBy?: TrimmingTool;
    /** Which side(s) to keep; defaults to `Keep.Top`. */
    readonly keep?: Keep;
}

/**
 * Bisect `shape` and keep the pieces `keep` selects (build123d `split`). As in build123d the
 * result is always a composite of the shape's dimension, empty when nothing is kept, and
 * `Keep.Both` returns one composite holding the top pieces followed by the bottom ones.
 */
export function split(shape: Shape, options: SplitOptions = {}): Shape {
    let { bisectBy = Plane.XZ, keep = Keep.Top } = options;
    if (keep === Keep.Inside || keep === Keep.Outside) {
        throw new GeometryError("Inside and Outside are not valid split selections");
    }
    let tool = bisectBy instanceof Plane ? cuttingFace(shape, bisectBy) : bisectBy;
    try {
        return makeComposite(cutPieces(shape, tool, bisectBy, keep), shape.dimension);
    } catch (cause) {
        throw new NativeKernelError("Split failed", { cause });
    }
}

export interface SectionOptions {
    /** Plane(s) to cut on; defaults to `Plane.XZ`. */
    readonly sectionBy?: Plane | readonly Plane[];
    /** Distance to raise each plane along its normal before cutting. */
    readonly height?: number;
    readonly clean?: boolean;
}

/** The faces where `shape` meets each sectioning plane, raised by `height` (build123d `section`). */
export function section(shape: Shape, options: SectionOptions = {}): Sketch {
    let { sectionBy = Plane.XZ, height = 0, clean = true } = options;
    if (!Number.isFinite(height)) throw new GeometryError("Section height must be finite");
    let planes = sectionBy instanceof Plane ? [sectionBy] : sectionBy;
    let sections: Shape[] = [];
    for (let plane of planes) {
        let raised = new Plane({
            origin: plane.origin.add(plane.zDir.multiply(height)),
            zDir: plane.zDir,
        });
        try {
            let tool = cuttingFace(shape, raised);
            let intersection = Shape.cast(booleans.common([shape.wrapped], [tool.wrapped]));
            sections.push(...intersection.faces());
        } catch (cause) {
            throw new NativeKernelError("Section failed", { cause });
        }
    }
    let sketch = new Sketch(sections);
    return clean ? new Sketch(sketch.clean().wrapped) : sketch;
}
