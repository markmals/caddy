import { construct, features, shapes } from "@roonieone/occt-native";

import type { VectorLike } from "../geometry/index.ts";
import type { Edge } from "../topology/edge.ts";
import type { Face } from "../topology/face.ts";
import type { Wire } from "../topology/wire.ts";

import { GeometryError, NativeKernelError } from "../errors.ts";
import { Vector } from "../geometry/index.ts";
import { ShapeList } from "../topology/shape-list.ts";
import { Shape } from "../topology/shape.ts";

export interface ProjectToShapeOptions {
    /** Parallel projection direction; mutually exclusive with `center`. */
    readonly direction?: VectorLike;
    /** Apex of a conical projection; mutually exclusive with `direction`. */
    readonly center?: VectorLike;
}

/**
 * build123d `Wire.project_to_shape`: lays the wire onto the surfaces of `target`, either along a
 * direction or along rays through a centre. Several wires come back when the target is hit more
 * than once; they are ordered by distance from the original wire.
 */
export function projectWireToShape(
    wire: Wire,
    target: Shape,
    options: ProjectToShapeOptions,
): ShapeList<Wire> {
    let { direction, center } = castRays(options);
    let projected = run(wire, target, direction, center);
    let orientation = shapes.orientation(wire.wrapped);
    let aligned = projected.wires.map(candidate =>
        shapes.orientation(candidate.wrapped) === orientation
            ? candidate
            : (Shape.cast(shapes.reversed(candidate.wrapped)) as Wire),
    );
    return new ShapeList(sorted(wire, aligned, direction, center).map(found => found.clean()));
}

/** build123d `Edge.project_to_shape`: the edges of the wire projection of this single edge. */
export function projectEdgeToShape(
    edge: Edge,
    target: Shape,
    options: ProjectToShapeOptions,
): ShapeList<Edge> {
    let wire = Shape.cast(construct.makeWire([edge.wrapped])) as Wire;
    let projected = projectWireToShape(wire, target, options);
    return new ShapeList(projected.flatMap(found => [...found.edges]));
}

/**
 * build123d `Mixin1D.project`: drops a line onto a face along `direction`. With `closest` only
 * the nearest of the resulting curves comes back, otherwise all of them.
 */
export function projectLineOntoFace(
    line: Edge | Wire,
    face: Face,
    direction: VectorLike,
    options: { readonly closest?: boolean } = {},
): Edge | Wire | ShapeList<Edge | Wire> {
    let unit = Vector.from(direction);
    let projected = Shape.cast(
        nativeProjection(() => features.project(line.wrapped, face.wrapped, unit.toTuple())),
    );
    let pieces = [...projected.topLevelShapes] as (Edge | Wire)[];
    if (options.closest === false) return new ShapeList<Edge | Wire>(pieces);
    let nearest = pieces[0];
    if (nearest === undefined) throw new GeometryError("Nothing projected onto the face");
    return pieces.reduce((best, piece) =>
        line.distanceTo(piece) < line.distanceTo(best) ? piece : best,
    );
}

function castRays(options: ProjectToShapeOptions): {
    direction: Vector | undefined;
    center: Vector | undefined;
} {
    let hasDirection = options.direction !== undefined;
    let hasCenter = options.center !== undefined;
    if (hasDirection === hasCenter) {
        throw new GeometryError("Provide exactly one of direction or center");
    }
    return {
        direction: hasDirection ? Vector.from(options.direction!).normalized() : undefined,
        center: hasCenter ? Vector.from(options.center!) : undefined,
    };
}

function run(
    wire: Wire,
    target: Shape,
    direction: Vector | undefined,
    center: Vector | undefined,
): Shape {
    return Shape.cast(
        nativeProjection(() =>
            direction === undefined
                ? features.projectFrom(wire.wrapped, target.wrapped, center!.toTuple())
                : features.project(wire.wrapped, target.wrapped, direction.toTuple()),
        ),
    );
}

function nativeProjection<T>(call: () => T): T {
    try {
        return call();
    } catch (cause) {
        throw new NativeKernelError("Projection onto the target shape failed", { cause });
    }
}

/**
 * OCCT returns the projected wires front first or back first depending on the geometry, so they
 * are reordered by distance; a directional projection drops the wires behind the original.
 */
function sorted(
    wire: Wire,
    projected: readonly Wire[],
    direction: Vector | undefined,
    center: Vector | undefined,
): Wire[] {
    if (projected.length <= 1) return [...projected];
    let origin = direction === undefined ? center! : wire.center;
    let measured: { wire: Wire; distance: number }[] = [];
    for (let candidate of projected) {
        let offset = candidate.center.sub(origin);
        if (direction !== undefined && offset.length > 0 && offset.dot(direction) < 0) continue;
        measured.push({ wire: candidate, distance: offset.length });
    }
    measured.sort((first, second) => first.distance - second.distance);
    return measured.map(entry => entry.wire);
}
