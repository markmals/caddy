/** Offsetting a planar edge or wire sideways (build123d `Mixin1D.offset_2d`). */

import type { JoinType } from "@roonieone/occt-native";

import { ShapeType, construct, shapes, topology } from "@roonieone/occt-native";

import type { Edge } from "../topology/edge.ts";
import type { Wire } from "../topology/wire.ts";

import { GeometryError } from "../errors.ts";
import { TOLERANCE } from "../geometry/constants.ts";
import { Kind, Side } from "../sketch/enums.ts";
import { GeomType } from "../topology/enums.ts";
import { native } from "../topology/kernel.ts";
import { Shape } from "../topology/shape.ts";
import { makeLine } from "./edge-makers.ts";
import { trimEdge } from "./edge-trim.ts";
import { combineWires, makeWire } from "./wire-makers.ts";

export interface Offset2DOptions {
    readonly kind?: Kind;
    readonly side?: Side;
    /** Join a one-sided offset back to the original line. */
    readonly closed?: boolean;
}

const JOIN_TYPES: Record<Kind, JoinType> = {
    [Kind.Arc]: "arc",
    [Kind.Intersection]: "intersection",
    [Kind.Tangent]: "tangent",
};

/** Unwraps a compound that exists only to hold a single shape. */
function unwrapped(shape: Shape): Shape {
    let current = shape;
    while (shapes.shapeType(current.wrapped) === ShapeType.Compound) {
        let children = topology.childShapes(current.wrapped);
        if (children.length !== 1) break;
        current = Shape.cast(children[0]!);
    }
    return current;
}

/**
 * OCCT mis-offsets a wire holding a single edge, so the edge is split in half first
 * (build123d does the same).
 */
function offsetSpine(line: Wire): Wire {
    let edges = line.edges();
    if (edges.length !== 1) return line;
    let only = edges[0]!;
    return makeWire([trimEdge(only, 0, 0.5), trimEdge(only, 0.5, 1)]);
}

/** The two halves an offset of an open line splits into once its end caps are removed. */
function offsetSides(line: Wire, offsetWire: Wire): Wire[] {
    let endpoints = [line.positionAt(0), line.positionAt(1)];
    let sides = offsetWire
        .edges()
        .filter(
            edge =>
                !(
                    edge.geomType === GeomType.Circle &&
                    endpoints.some(point => edge.arcCenter.sub(point).length < TOLERANCE)
                ),
        );
    return combineWires(sides);
}

function closeOffset(line: Wire, offsetWire: Wire, distance: number): Wire {
    let lineStart = line.positionAt(0);
    let lineEnd = line.positionAt(1);
    let offsetStart = offsetWire.positionAt(0);
    let offsetEnd = offsetWire.positionAt(1);
    let aligned = lineStart.sub(offsetStart).length - Math.abs(distance) <= TOLERANCE;
    let first = makeLine(lineStart, aligned ? offsetStart : offsetEnd);
    let second = makeLine(lineEnd, aligned ? offsetEnd : offsetStart);
    return makeWire([...line.edges(), ...offsetWire.edges(), first, second]);
}

/**
 * Offsets a planar line by `distance`. With `Side.Both` the result surrounds the line; with
 * `Side.Left` or `Side.Right` only that side is kept, joined back to the line when `closed`.
 */
export function offset2D(
    line: Edge | Wire,
    distance: number,
    options: Offset2DOptions = {},
): Edge | Wire {
    let kind = options.kind ?? Kind.Arc;
    let side = options.side ?? Side.Both;
    let spine = line.shapeType === "Wire" ? (line as Wire) : makeWire([line as Edge]);
    let raw = native("Offset 2D", () =>
        construct.offsetWire2d(offsetSpine(spine).wrapped, distance, JOIN_TYPES[kind], false),
    );
    let result = unwrapped(Shape.cast(raw));
    if (result.shapeType !== "Wire") {
        throw new GeometryError(`2D offset with distance ${distance} produced several wires`);
    }
    let offsetWire = result as Wire;

    if (side !== Side.Both) {
        let candidates = offsetSides(spine, offsetWire);
        if (candidates.length !== 2) {
            throw new GeometryError("A one-sided 2D offset needs an open line with two sides");
        }
        let tangent = spine.tangentAt(0);
        let start = spine.positionAt(0);
        let angles = candidates.map(wire =>
            tangent.getSignedAngle(wire.positionAt(0.5).sub(start)),
        );
        let leftFirst = (angles[0] ?? 0) > (angles[1] ?? 0);
        offsetWire = candidates[side === Side.Left ? Number(leftFirst) : Number(!leftFirst)]!;
        if (options.closed ?? true) {
            offsetWire = closeOffset(spine, offsetWire, distance);
        }
    }

    let offsetEdges = offsetWire.edges();
    return offsetEdges.length === 1 ? offsetEdges[0]! : offsetWire;
}
