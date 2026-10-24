/** Turning curves into faces by sweeping a line of a given width along them (build123d `trace`). */

import type { Curve } from "../../topology/composite.ts";
import type { Edge } from "../../topology/edge.ts";
import type { Face } from "../../topology/face.ts";

import { makeLine } from "../../curves/index.ts";
import { combineWires } from "../../curves/wire-makers.ts";
import { GeometryError } from "../../errors.ts";
import { Plane } from "../../geometry/plane.ts";
import { Transition, sweep } from "../../operations/sweep.ts";
import { Sketch } from "../../topology/composite.ts";
import { Wire } from "../../topology/wire.ts";

/** Anything whose edges can be traced. */
export type TraceSource = Curve | Edge | Wire;

/**
 * The faces swept out by dragging a line of `lineWidth`, held perpendicular to the path, along
 * every wire the given curves form. Touching faces are fused so the result is one sketch.
 */
export function trace(lines: TraceSource | Iterable<TraceSource>, lineWidth: number): Sketch {
    let sources = isTraceSource(lines) ? [lines] : [...lines];
    let edges = sources.flatMap(source => [...source.edges()]);
    if (edges.length === 0) {
        throw new GeometryError("No objects to trace");
    }

    // Grouping the edges into wires first lets the sweep round the corners between them.
    let faces = combineWires(edges).flatMap(path => {
        let pen = new Wire([perpendicularLine(path, lineWidth)]);
        let swept = sweep(pen, path, { transition: Transition.Right });
        return [...swept.faces()];
    });

    let fused = faces.reduce<Face | Sketch>(
        (combined, face) => (combined === face ? combined : (combined.fuse(face) as Sketch)),
        faces[0]!,
    );
    return new Sketch(fused.wrapped);
}

function isTraceSource(value: TraceSource | Iterable<TraceSource>): value is TraceSource {
    return "edges" in value;
}

/** The line of `width` across the start of `path`, perpendicular to it on the XY plane. */
function perpendicularLine(path: Wire, width: number): Edge {
    let start = path.positionAt(0);
    let frame = new Plane({ origin: start, xDir: path.tangentAt(0), zDir: Plane.XY.zDir });
    return makeLine(
        start.add(frame.yDir.multiply(width / 2)),
        start.sub(frame.yDir.multiply(width / 2)),
    );
}
