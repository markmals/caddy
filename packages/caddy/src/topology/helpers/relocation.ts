import { shapes } from "@roonieone/occt-native";

import type { Shape } from "../shape.ts";

import { Location } from "../../geometry/location.ts";

/**
 * The candidate that is `target`, allowing for a relocation (build123d `find_same_topods`).
 *
 * Moving a shape keeps its geometry and changes only its placement, so a sub-shape taken out of
 * a container and then moved no longer matches the container's own sub-shapes exactly. An exact
 * match wins; failing that, the first shape sharing the geometry at another placement does,
 * because a container may hold the same geometry at several placements.
 */
export function findSameShape<T extends Shape>(
    target: Shape,
    candidates: Iterable<T>,
): T | undefined {
    let all = [...candidates];
    return (
        all.find(candidate => candidate.isSame(target)) ??
        all.find(candidate => shapes.isPartner(candidate.wrapped, target.wrapped))
    );
}

/**
 * The location that carries `source`'s frame onto `target`'s (build123d `relocation_between`):
 * for two shapes sharing geometry at different placements, the move that took one to the other.
 */
export function relocationBetween(source: Shape, target: Shape): Location {
    return target.location.multiply(source.location.inverse());
}
