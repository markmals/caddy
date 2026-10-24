import { booleans, features, shapes } from "@roonieone/occt-native";

import type { VectorLike } from "../geometry/index.ts";

import { makeFaceRect } from "../curves/face-makers.ts";
import { GeometryError, NativeKernelError } from "../errors.ts";
import { Plane, Vector } from "../geometry/index.ts";
import { Compound, Edge, Face, Shape, Vertex, Wire } from "../topology/index.ts";
import { makeComposite } from "../topology/registry.ts";

export type Projectable = Edge | Wire | Face | Vertex | VectorLike;

function isPoint(value: unknown): value is VectorLike {
    return (
        value instanceof Vector ||
        (Array.isArray(value) &&
            value.length === 3 &&
            value.every(entry => typeof entry === "number")) ||
        (typeof value === "object" &&
            value !== null &&
            "x" in value &&
            "y" in value &&
            "z" in value)
    );
}

function objectsOf(objects: Projectable | Iterable<Projectable>): Projectable[] {
    if (objects instanceof Shape || isPoint(objects)) return [objects];
    return [...objects];
}

/** Projects points, edges, wires, and faces to a plane in its normal direction (build123d `project`). */
export function project(
    objects: Projectable | Iterable<Projectable>,
    workplane: Plane,
): Shape | Vector[] {
    let selected = objectsOf(objects);
    if (selected.length === 0) throw new GeometryError("No object to project");
    let points = selected.filter(
        (object): object is Vertex | VectorLike => object instanceof Vertex || isPoint(object),
    );
    let lines = selected.filter(
        (object): object is Edge | Wire => object instanceof Edge || object instanceof Wire,
    );
    let faces = selected.filter((object): object is Face => object instanceof Face);
    if (points.length + lines.length + faces.length !== selected.length) {
        throw new GeometryError("Only points, edges, wires and faces can be projected");
    }
    let localPoints = points.map(point => {
        let position = point instanceof Vertex ? point.center() : Vector.from(point);
        let distance = workplane.origin.sub(position).dot(workplane.zDir);
        return workplane.toLocalCoords(position.add(workplane.zDir.multiply(distance)));
    });
    if (lines.length === 0 && faces.length === 0) return localPoints;

    let shapeBounds = new Compound([...lines, ...faces]).boundingBox({ optimal: false });
    let screenSize = 3 * shapeBounds.diagonal;
    if (screenSize === 0) throw new GeometryError("Cannot project a zero-size shape");
    let screen = makeFaceRect(screenSize, screenSize, workplane);
    let projected: Shape[] = [];
    for (let shape of [...faces, ...lines]) {
        let separation = workplane.origin.sub(shape.center()).dot(workplane.zDir);
        let direction = workplane.zDir.multiply(separation >= 0 ? 1 : -1);
        try {
            if (shape instanceof Face) {
                let reach = 4 * (shape.boundingBox().diagonal + Math.abs(separation) + 1);
                let swept = features.extrude(shape.wrapped, direction.multiply(reach).toTuple());
                let intersection = Shape.cast(booleans.common([swept], [screen.wrapped]));
                projected.push(...intersection.faces().map(face => toLocal(face, workplane)));
            } else {
                let profile = shape instanceof Edge ? new Wire([shape]) : shape;
                let image = Shape.cast(
                    features.project(profile.wrapped, screen.wrapped, direction.toTuple()),
                );
                projected.push(...image.wires().map(wire => toLocal(wire, workplane)));
            }
        } catch (cause) {
            throw new NativeKernelError("Projection failed", { cause });
        }
    }
    if (localPoints.length > 0) return localPoints;
    let dimension =
        faces.length === selected.length ? 2 : lines.length === selected.length ? 1 : undefined;
    return makeComposite(projected, dimension);
}

function toLocal(shape: Shape, plane: Plane): Shape {
    let matrix = plane.forwardTransform.toRows().flat();
    return Shape.cast(shapes.transformed(shape.wrapped, matrix, true));
}
