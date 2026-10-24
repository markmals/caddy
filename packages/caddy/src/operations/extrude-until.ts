import { ShapeType, booleans, features, topology } from "@roonieone/occt-native";

import type { VectorLike } from "../geometry/index.ts";

import { GeometryError, InvalidShapeError, NativeKernelError } from "../errors.ts";
import { Vector } from "../geometry/index.ts";
import { Face } from "../topology/face.ts";
import { Shape } from "../topology/shape.ts";

export const Until = { Next: "next", Last: "last", Previous: "previous", First: "first" } as const;
export type Until = (typeof Until)[keyof typeof Until];

export function extrudeUntil(
    profile: Face,
    target: Shape,
    direction: VectorLike,
    until: Until = Until.Next,
): Shape {
    let unit = Vector.from(direction).normalized();
    if (until === Until.Previous || until === Until.First) unit = unit.negate();
    let profileBounds = profile.boundingBox();
    let targetBounds = target.boundingBox();
    let reach =
        4 *
        (profileBounds.diagonal +
            targetBounds.diagonal +
            profileBounds.center().sub(targetBounds.center()).length +
            1);
    try {
        let prism = features.extrude(profile.wrapped, unit.multiply(reach).toTuple());
        let contacted = target.faces().flatMap(face => {
            let contact = booleans.common([prism], [face.wrapped]);
            if (topology.subShapes(contact, ShapeType.Face).length === 0) return [];
            let distance = face.center().sub(profile.center()).dot(unit);
            return distance > 1e-7 ? [{ face, distance }] : [];
        });
        if (contacted.length === 0)
            throw new InvalidShapeError("Extrusion does not contact the target");
        contacted.sort((a, b) => a.distance - b.distance);
        let far = until === Until.Last || until === Until.First;
        let limitingFace = (far ? contacted[contacted.length - 1] : contacted[0])!;
        let pieces = Shape.cast(
            booleans.split([prism], [limitingFace.face.wrapped]),
        ).getTopLevelShapes();
        let near = pieces.filter(
            piece => piece.center().sub(profile.center()).dot(unit) < limitingFace.distance,
        );
        if (near.length !== 1) {
            throw new InvalidShapeError("Target face did not bound one extrusion solid");
        }
        return near[0]!;
    } catch (cause) {
        if (cause instanceof InvalidShapeError || cause instanceof GeometryError) throw cause;
        throw new NativeKernelError("Extrude until target failed", { cause });
    }
}
