import { booleans } from "@roonieone/occt-native";

import { makeFaceRect } from "../curves/face-makers.ts";
import { GeometryError, NativeKernelError } from "../errors.ts";
import { Plane } from "../geometry/index.ts";
import { Sketch } from "../topology/composite.ts";
import { Keep } from "../topology/enums.ts";
import { Face } from "../topology/face.ts";
import { makeComposite } from "../topology/registry.ts";
import { Shape } from "../topology/shape.ts";

/**
 * build123d trims with the plane's unbounded face; a rectangle covering the shape twice over cuts
 * a bounded shape identically and needs no unbounded-surface binding.
 */
function cuttingFace(shape: Shape, plane: Plane): Face {
    let box = shape.boundingBox(undefined, false);
    let reach = Math.max(...box.min.toTuple().map(Math.abs), ...box.max.toTuple().map(Math.abs));
    let size = 2 * (reach + box.diagonal);
    return makeFaceRect(size, size, plane);
}

/** Pieces of `shape` cut by `tool`, grouped by which side of `bisectBy` their centre falls on. */
function cutPieces(shape: Shape, tool: Face, bisectBy: Plane | Face, keep: Keep): Shape[] {
    let cut = Shape.cast(booleans.split([shape.wrapped], [tool.wrapped]));
    let pieces = cut.getTopLevelShapes();
    if (keep === Keep.All) return [...pieces];
    let normal = bisectBy instanceof Plane ? bisectBy.zDir : bisectBy.normalAt();
    let origin = bisectBy instanceof Plane ? bisectBy.origin : bisectBy.center();
    let above = (piece: Shape): boolean => piece.center().sub(origin).dot(normal) >= 0;
    let tops = pieces.filter(above);
    if (keep === Keep.Top) return tops;
    let bottoms = pieces.filter(piece => !above(piece));
    return keep === Keep.Bottom ? bottoms : [...tops, ...bottoms];
}

/**
 * Bisect `shape` and keep the pieces `keep` selects (build123d `split`). As in build123d the
 * result is always a composite of the shape's dimension, empty when nothing is kept, and
 * `Keep.Both` returns one composite holding the top pieces followed by the bottom ones.
 */
export function split(
    shape: Shape,
    bisectBy: Plane | Face = Plane.XZ,
    keep: Keep = Keep.Top,
): Shape {
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

/** The faces where `shape` meets each sectioning plane, raised by `height` (build123d `section`). */
export function section(
    shape: Shape,
    sectionBy: Plane | readonly Plane[] = Plane.XZ,
    height = 0,
    clean = true,
): Sketch {
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
