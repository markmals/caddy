import { construct } from "@roonieone/occt-native";

import type { Shape } from "./shape.ts";

import { Axis } from "../geometry/axis.ts";
import { Plane } from "../geometry/plane.ts";
import { toVec3 } from "./conversions.ts";
import { native } from "./kernel.ts";
import { castShape } from "./registry.ts";

/** Bound infinite geometry beyond every corner of the shape being intersected. */
export function intersectionOperand(shape: Shape, geometry: Axis | Plane): Shape {
    let box = shape.boundingBox;
    let reach =
        box.diagonal +
        box.center.sub(geometry instanceof Axis ? geometry.position : geometry.origin).length +
        1;
    if (geometry instanceof Axis) {
        let start = geometry.position.sub(geometry.direction.multiply(reach));
        let end = geometry.position.add(geometry.direction.multiply(reach));
        return castShape(
            native("Axis edge", () => construct.makeLineEdge(toVec3(start), toVec3(end))),
        );
    }

    let corner = (x: number, y: number) =>
        geometry.origin.add(geometry.xDir.multiply(x)).add(geometry.yDir.multiply(y));
    let corners = [
        corner(-reach, -reach),
        corner(reach, -reach),
        corner(reach, reach),
        corner(-reach, reach),
    ];
    return castShape(
        native("Plane face", () => {
            let wire = construct.makePolygonWire(corners.map(toVec3), true);
            return construct.makeFace(wire);
        }),
    );
}
