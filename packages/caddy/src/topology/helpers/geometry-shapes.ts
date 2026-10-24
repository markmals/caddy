/**
 * How each geometry class becomes a shape for `Shape.asShape`. Registered from here, rather than
 * from the shape classes, so that `Shape` itself needs no import of its own subclasses.
 */

import { construct } from "@roonieone/occt-native";

import { Axis } from "../../geometry/axis.ts";
import { Location } from "../../geometry/location.ts";
import { Plane } from "../../geometry/plane.ts";
import { Vector } from "../../geometry/vector.ts";
import { toVec3 } from "../conversions.ts";
import { Edge } from "../edge.ts";
import { Face } from "../face.ts";
import { native } from "../kernel.ts";
import { registerGeometryConstructor } from "../registry.ts";
import { Vertex } from "../vertex.ts";

registerGeometryConstructor(Vector, point => new Vertex(point));
registerGeometryConstructor(Location, location => new Vertex(location.position));
registerGeometryConstructor(
    Axis,
    axis =>
        new Edge(
            native("Axis edge", () =>
                construct.makeAxisEdge([...toVec3(axis.position), ...toVec3(axis.direction)]),
            ),
        ),
);
registerGeometryConstructor(Plane, plane => new Face(plane));
