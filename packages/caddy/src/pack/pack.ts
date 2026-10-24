import type { BoundingBox } from "../geometry/bounding-box.ts";
import type { Shape } from "../topology/shape.ts";
import type { Size } from "./pack2d.ts";

import { GeometryError } from "../errors.ts";
import { Pos } from "../geometry/location.ts";
import { packRectangles } from "./pack2d.ts";

export interface PackOptions {
    /** Lift each object so it sits on `Plane.XY`. Defaults to leaving Z alone. */
    readonly alignZ?: boolean;
}

/**
 * Arrange `objects` into a compact, non-overlapping layout in `Plane.XY` with `padding` between
 * them (build123d `pack`), returning the moved copies in the order they were given.
 */
export function pack<T extends Shape>(
    objects: Iterable<T>,
    padding: number,
    options: PackOptions = {},
): T[] {
    let shapes = [...objects];
    let boxes = shapes.map(shape => shape.boundingBox());
    let sizes: Size[] = boxes.map(box => [box.size.x + padding, box.size.y + padding]);
    let placements = packRectangles(sizes);

    let placed = shapes.map((shape, index) => {
        let box = boxes[index]!;
        let [x, y] = placements[index]!;
        let lift = options.alignZ === true ? -box.min.z : 0;
        return shape.moved(new Pos(x - box.min.x, y - box.min.y, lift));
    });
    assertDisjoint(boxes, placements);
    return placed;
}

/**
 * build123d asserts that the packing produced no overlaps. The packed boxes are the input
 * boxes translated, so the check is pure arithmetic on what the packer returned.
 */
function assertDisjoint(boxes: readonly BoundingBox[], placements: readonly Size[]): void {
    let rectangles = boxes.map((box, index) => {
        let [x, y] = placements[index]!;
        return { minX: x, minY: y, maxX: x + box.size.x, maxY: y + box.size.y };
    });
    for (let [index, rectangle] of rectangles.entries()) {
        for (let other = index + 1; other < rectangles.length; other += 1) {
            let neighbour = rectangles[other]!;
            let overlapX =
                Math.min(rectangle.maxX, neighbour.maxX) > Math.max(rectangle.minX, neighbour.minX);
            let overlapY =
                Math.min(rectangle.maxY, neighbour.maxY) > Math.max(rectangle.minY, neighbour.minY);
            if (overlapX && overlapY) {
                throw new GeometryError(`packed objects at indexes ${index} and ${other} overlap`);
            }
        }
    }
}
