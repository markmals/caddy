import { features } from "@roonieone/occt-native";

import type { Vector } from "../geometry/index.ts";

import { makeLine } from "../curves/edge-makers.ts";
import { offset2D } from "../curves/offset-2d.ts";
import { GeometryError, InvalidShapeError, NativeKernelError } from "../errors.ts";
import { Kind, Side } from "../sketch/enums.ts";
import { Part } from "../topology/composite.ts";
import { Edge } from "../topology/edge.ts";
import { Face } from "../topology/face.ts";
import { ShapeList } from "../topology/shape-list.ts";
import { Shape } from "../topology/shape.ts";
import { Wire } from "../topology/wire.ts";
import { sweep } from "./sweep.ts";

export interface BrakeFormedOptions {
    /** Which side of the line the material sits on; defaults to `Side.Left` as in build123d. */
    readonly side?: Side;
    /** Corner treatment of the thickness offset; defaults to `Kind.Arc`. */
    readonly kind?: Kind;
    /** Merge coincident faces of the finished part; defaults to true. */
    readonly clean?: boolean;
}

/**
 * build123d `make_brake_formed`: bends sheet metal of the given thickness along `line`. One
 * width makes a constant-width part; a width per vertex tapers it from station to station.
 */
export function makeBrakeFormed(
    thickness: number,
    stationWidths: number | Iterable<number>,
    line: Edge | Wire | Shape,
    options: BrakeFormedOptions = {},
): Part {
    let outline = lineOf(line);
    let offsetLine = offset2D(outline, thickness, {
        kind: options.kind ?? Kind.Arc,
        side: options.side ?? Side.Left,
        closed: true,
    });
    let plane = new Face(offsetLine instanceof Wire ? offsetLine : new Wire([offsetLine])).isPlanar;
    if (plane === undefined) throw new GeometryError("line not suitable - probably straight");

    let corners = outline.vertices();
    let widths =
        typeof stationWidths === "number" ? corners.map(() => stationWidths) : [...stationWidths];
    if (widths.length !== corners.length) {
        throw new GeometryError(
            `widths must either be a single number or have one value per vertex in line (${corners.length})`,
        );
    }

    let profiles = stationEdges(outline, offsetLine, thickness).map((edge, index) =>
        stationFace(edge, plane.zDir, widths[index]!),
    );
    let path = outline.edges().sortBy(outline);
    let sections = profiles
        .slice(0, -1)
        .map((profile, index) =>
            sweep([profile, profiles[index + 1]!], path[index]!, { multisection: true }),
        );
    let first = sections[0];
    if (first === undefined) throw new GeometryError("line must have at least two vertices");
    let fused = sections.slice(1).reduce<Shape>((total, section) => total.fuse(section), first);
    let part = new Part([fused]);
    return options.clean === false ? part : new Part(part.clean().wrapped);
}

function lineOf(line: Edge | Wire | Shape): Edge | Wire {
    if (line instanceof Edge || line instanceof Wire) return line;
    let wires = line.wires();
    let only = wires[0];
    if (only === undefined || wires.length !== 1) {
        throw new InvalidShapeError("line must be either a curve, edge or wire");
    }
    return only;
}

/**
 * Each station edge spans the sheet thickness: it joins a vertex of the line to the nearest
 * vertex of the offset line exactly `thickness` away.
 */
function stationEdges(line: Edge | Wire, offsetLine: Edge | Wire, thickness: number): Edge[] {
    let offsetVertices = offsetLine.vertices();
    let edges = new ShapeList<Edge>();
    for (let corner of line.vertices()) {
        let position = corner.center();
        let partner = offsetVertices
            .sortByDistance(position)
            .slice(1)
            .find(other => Math.abs(other.center().sub(position).length - thickness) < 1e-2);
        if (partner === undefined) {
            throw new GeometryError("line not suitable - no matching offset vertex");
        }
        edges.push(makeLine(position, partner.center()));
    }
    return [...edges.sortBy(line)];
}

function stationFace(edge: Edge, normal: Vector, width: number): Face {
    try {
        return Shape.cast(features.extrude(edge.wrapped, normal.multiply(width).toTuple())) as Face;
    } catch (cause) {
        throw new NativeKernelError("Could not raise a brake-formed station", { cause });
    }
}
