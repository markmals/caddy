import { features, shapes } from "@roonieone/occt-native";

import { offset2D } from "../curves/offset-2d.ts";
import { GeometryError } from "../errors.ts";
import { Pos, Vector } from "../geometry/index.ts";
import { Kind } from "../sketch/enums.ts";
import { booleanCut } from "../topology/boolean.ts";
import { Face } from "../topology/face.ts";
import { Shape } from "../topology/shape.ts";
import { Wire } from "../topology/wire.ts";

/** Options of {@link extrudeTaper}. */
export interface TaperOptions {
    /**
     * Taper holes the opposite way to the outline so an injection-moulded part can be pulled
     * out; defaults to true.
     */
    readonly flipInner?: boolean;
}

export function extrudeTaper(
    face: Face,
    direction: Vector,
    taper: number,
    options: TaperOptions = {},
): Shape {
    let normal = face.normalAt().normalized();
    let hasHoles = face.innerWires.length > 0;
    if (
        direction.normalized().sub(normal).length <= 1e-7 &&
        normal.z > 0 &&
        taper > 0 &&
        !hasHoles
    ) {
        return Shape.cast(
            features.extrudeTaper(face.wrapped, direction.length, (taper * Math.PI) / 180),
        );
    }
    let offsetAmount = -direction.length * Math.tan((taper * Math.PI) / 180);
    if (!Number.isFinite(offsetAmount))
        throw new GeometryError("Taper angle must produce a finite offset");
    let translation = new Pos(direction).transform.toRows().flat();
    let outlines = [face.outerWire, ...face.innerWires];
    let lofts = outlines.map((wire, index) => {
        let amount = index > 0 && (options.flipInner ?? true) ? -offsetAmount : offsetAmount;
        let offset = offset2D(wire, amount, { kind: Kind.Intersection });
        if (!(offset instanceof Wire))
            throw new GeometryError("Taper offset did not produce a closed wire");
        let top = shapes.moved(offset.wrapped, translation);
        return features.loft([wire.wrapped, top]);
    });
    let [outer, ...holes] = lofts.map(loft => Shape.cast(loft));
    if (outer === undefined) throw new GeometryError("Taper requires a nonempty profile");
    return holes.length === 0 ? outer : booleanCut(outer, holes);
}
