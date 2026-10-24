/**
 * The piece-level half of splitting, kept free of topology class imports so that `Shape` can
 * offer `split` as a method without closing an import cycle.
 */

import { booleans, construct } from "@roonieone/occt-native";

import type { Face } from "../topology/face.ts";
import type { Shell } from "../topology/shell.ts";

import { GeometryError, NativeKernelError } from "../errors.ts";
import { Plane } from "../geometry/index.ts";
import { Keep } from "../topology/enums.ts";
import { ShapeList } from "../topology/shape-list.ts";
import { Shape } from "../topology/shape.ts";

/** What a split can cut with (build123d `TrimmingTool`). */
export type TrimmingTool = Plane | Face | Shell;

/**
 * build123d trims with the plane's unbounded face; a rectangle covering the shape twice over cuts
 * a bounded shape identically and needs no unbounded-surface binding.
 */
export function cuttingFace(shape: Shape, plane: Plane): Shape {
    let box = shape.boundingBox(undefined, false);
    let reach = Math.max(...box.min.toTuple().map(Math.abs), ...box.max.toTuple().map(Math.abs));
    let half = reach + box.diagonal;
    let corners = [
        [-half, -half],
        [half, -half],
        [half, half],
        [-half, half],
    ].map(([x, y]) => plane.fromLocalCoords([x!, y!, 0]).toTuple());
    let outline = construct.makePolygonWire(corners, true);
    return Shape.cast(construct.makeFace(outline));
}

export function partitioned(
    shape: Shape,
    tool: Shape,
    bisectBy: TrimmingTool,
): { tops: Shape[]; bottoms: Shape[]; all: Shape[] } {
    let cut = Shape.cast(booleans.split([shape.wrapped], [tool.wrapped]));
    let all = [...cut.getTopLevelShapes()];
    let surface = bisectBy instanceof Plane ? bisectBy : (bisectBy.faces()[0] ?? bisectBy);
    let normal = surface instanceof Plane ? surface.zDir : (surface as Face).normalAt();
    let origin = surface instanceof Plane ? surface.origin : surface.center();
    let tops = all.filter(piece => piece.center().sub(origin).dot(normal) >= 0);
    let bottoms = all.filter(piece => !tops.includes(piece));
    return { tops, bottoms, all };
}

/**
 * build123d `Shape.split`: the loose pieces rather than the composite `split` builds.
 * `Keep.Both` gives `[top, bottom]`; build123d instead returns a bare shape when a side holds
 * only one piece, which TypeScript callers would have to narrow on every call.
 */
export function splitPieces(
    shape: Shape,
    tool: TrimmingTool,
    keep: Keep = Keep.Top,
): ShapeList<Shape> | [ShapeList<Shape>, ShapeList<Shape>] {
    if (keep === Keep.Inside || keep === Keep.Outside) {
        throw new GeometryError("Inside and Outside are not valid split selections");
    }
    let surface = tool instanceof Plane ? cuttingFace(shape, tool) : tool;
    try {
        let { tops, bottoms, all } = partitioned(shape, surface, tool);
        if (keep === Keep.Both) return [new ShapeList(tops), new ShapeList(bottoms)];
        if (keep === Keep.All) return new ShapeList(all);
        return new ShapeList(keep === Keep.Top ? tops : bottoms);
    } catch (cause) {
        throw new NativeKernelError("Split failed", { cause });
    }
}
