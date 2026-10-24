// Sub-shapes the SVG exporter draws on their own: wires that no face owns, and edges that no
// wire owns (build123d explores these with `TopExp_Explorer`'s "to avoid" filter).

import { export2d, ShapeType } from "@roonieone/occt-native";

import type { Edge, Shape, Wire } from "../../topology/index.ts";

import { Shape as ShapeClass } from "../../topology/index.ts";
import { native } from "../../topology/kernel.ts";

export function looseWires(shape: Shape): Wire[] {
    return native("Wire traversal", () =>
        export2d.subShapesAvoiding(shape.wrapped, ShapeType.Wire, ShapeType.Face),
    ).map(wrapped => ShapeClass.cast(wrapped) as Wire);
}

export function looseEdges(shape: Shape): Edge[] {
    return native("Edge traversal", () =>
        export2d.subShapesAvoiding(shape.wrapped, ShapeType.Edge, ShapeType.Wire),
    ).map(wrapped => ShapeClass.cast(wrapped) as Edge);
}
