import { offset2D } from "../curves/offset-2d.ts";
import { GeometryError } from "../errors.ts";
import { Kind } from "../sketch/enums.ts";
import { Face } from "../topology/face.ts";
import { Wire } from "../topology/wire.ts";

export function offsetFace(face: Face, amount: number, kind: Kind): Face {
    let outer = offset2D(face.outerWire(), amount, { kind });
    if (!(outer instanceof Wire))
        throw new GeometryError("Offset outer boundary is not a closed wire");
    let inner = face.innerWires().map(wire => offset2D(wire, -amount, { kind }));
    if (inner.some(wire => !(wire instanceof Wire))) {
        throw new GeometryError("An offset inner boundary is not a closed wire");
    }
    return new Face(outer, inner as Wire[]);
}
