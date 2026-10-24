import type { OracleCases } from "./support.ts";

import { expectClose, expectVectorClose } from "../../../../../reference/build123d/oracle.ts";
import { EXACT_TOLERANCE } from "../../../../../reference/build123d/tolerances.ts";
import { Align, BoundingBox, toAlignOffset } from "../../../src/index.ts";
import { expectBounds, expectFlags } from "./support.ts";

/** `BoundingBox` extents, growth, predicates and alignment offsets. */
export const boundingBoxCases: OracleCases = {
    "bounding-box/basics": expected => {
        let box = new BoundingBox([-1, -2, -3], [4, 5, 6]);
        let flat = new BoundingBox([0, 0, 2], [3, 4, 2]);
        let point = new BoundingBox([1, 1, 1], [1, 1, 1]);
        expectVectorClose(expected, "min", box.min.toTuple(), EXACT_TOLERANCE);
        expectVectorClose(expected, "max", box.max.toTuple(), EXACT_TOLERANCE);
        expectVectorClose(expected, "size", box.size.toTuple(), EXACT_TOLERANCE);
        expectVectorClose(expected, "center", box.center().toTuple(), EXACT_TOLERANCE);
        expectClose(expected, "diagonal", box.diagonal, EXACT_TOLERANCE);
        expectClose(expected, "measure", box.measure, EXACT_TOLERANCE);
        expectClose(expected, "flat_measure", flat.measure, EXACT_TOLERANCE);
        expectClose(expected, "flat_diagonal", flat.diagonal, EXACT_TOLERANCE);
        expectClose(expected, "point_measure", point.measure, EXACT_TOLERANCE);
        expectClose(expected, "point_diagonal", point.diagonal, EXACT_TOLERANCE);
    },

    "bounding-box/add": expected => {
        let box = new BoundingBox([0, 0, 0], [1, 1, 1]);
        expectBounds(expected, "point_outside", box.add([2, -3, 0.5]));
        expectBounds(expected, "point_inside", box.add([0.5, 0.5, 0.5]));
        expectBounds(
            expected,
            "box_overlapping",
            box.add(new BoundingBox([0.5, 0.5, 0.5], [3, 3, 3])),
        );
        expectBounds(
            expected,
            "box_disjoint",
            box.add(new BoundingBox([-5, -5, -5], [-4, -4, -4])),
        );
    },

    "bounding-box/predicates": expected => {
        let outer = new BoundingBox([0, 0, 0], [10, 10, 10]);
        let inner = new BoundingBox([1, 1, 1], [2, 2, 2]);
        let touching = new BoundingBox([10, 0, 0], [12, 10, 10]);
        let straddling = new BoundingBox([5, 5, 5], [15, 15, 15]);
        let separate = new BoundingBox([20, 20, 20], [21, 21, 21]);
        let flush = new BoundingBox([0, 0, 0], [10, 10, 5]);
        expectFlags(expected, {
            covers_inner: outer.covers(inner),
            covers_straddling: outer.covers(straddling),
            covers_flush: outer.covers(flush),
            covered_by: inner.coveredBy(outer),
            contains_inner: outer.contains(inner),
            contains_flush: outer.contains(flush),
            contains_properly_inner: outer.containsProperly(inner),
            contains_properly_flush: outer.containsProperly(flush),
            within: inner.within(outer),
            intersects_touching: outer.intersects(touching),
            intersects_separate: outer.intersects(separate),
            disjoint_separate: outer.disjoint(separate),
            touches_touching: outer.touches(touching),
            touches_straddling: outer.touches(straddling),
            overlaps_straddling: outer.overlaps(straddling),
            overlaps_inner: outer.overlaps(inner),
        });
    },

    "bounding-box/degenerate-predicates": expected => {
        let rectangle = new BoundingBox([0, 0, 0], [10, 10, 0]);
        let coplanarInner = new BoundingBox([1, 1, 0], [2, 2, 0]);
        let parallelPlane = new BoundingBox([1, 1, 1], [2, 2, 1]);
        let segment = new BoundingBox([1, 0, 0], [3, 0, 0]);
        let collinear = new BoundingBox([2, 0, 0], [4, 0, 0]);
        expectFlags(expected, {
            rectangle_contains_coplanar: rectangle.contains(coplanarInner),
            rectangle_contains_properly: rectangle.containsProperly(coplanarInner),
            rectangle_contains_parallel: rectangle.contains(parallelPlane),
            rectangle_covers_parallel: rectangle.covers(parallelPlane),
            segments_overlap: segment.overlaps(collinear),
            segment_touches_rectangle: segment.touches(rectangle),
            rectangle_contains_segment: rectangle.contains(segment),
        });
    },

    "bounding-box/align-offset": expected => {
        let box = new BoundingBox([-1, -2, -3], [4, 5, 6]);
        expectVectorClose(expected, "min", box.toAlignOffset(Align.Min).toTuple(), EXACT_TOLERANCE);
        expectVectorClose(
            expected,
            "center",
            box.toAlignOffset(Align.Center).toTuple(),
            EXACT_TOLERANCE,
        );
        expectVectorClose(expected, "max", box.toAlignOffset(Align.Max).toTuple(), EXACT_TOLERANCE);
        expectVectorClose(
            expected,
            "none",
            box.toAlignOffset(Align.None).toTuple(),
            EXACT_TOLERANCE,
        );
        expectVectorClose(expected, "null", box.toAlignOffset(null).toTuple(), EXACT_TOLERANCE);
        expectVectorClose(
            expected,
            "mixed",
            box.toAlignOffset([Align.Min, Align.Center, Align.Max]).toTuple(),
            EXACT_TOLERANCE,
        );
        expectVectorClose(
            expected,
            "with_null",
            box.toAlignOffset([Align.Min, null, Align.Max]).toTuple(),
            EXACT_TOLERANCE,
        );
        expectVectorClose(
            expected,
            "two_dimensional",
            box.toAlignOffset([Align.Max, Align.Min]).toTuple(),
            EXACT_TOLERANCE,
        );
        expectVectorClose(
            expected,
            "free_function",
            toAlignOffset([0, 0, 0], [2, 4, 6], [Align.Center, Align.Min, null]).toTuple(),
            EXACT_TOLERANCE,
        );
        expectVectorClose(
            expected,
            "free_function_center",
            toAlignOffset([0, 0, 0], [2, 4, 6], Align.Center, [1, 1, 1]).toTuple(),
            EXACT_TOLERANCE,
        );
    },

    "bounding-box/find-outside-2d": expected => {
        let outer = new BoundingBox([0, 0, 0], [10, 10, 10]);
        let inner = new BoundingBox([1, 1, -5], [2, 2, 50]);
        let flush = new BoundingBox([0, 1, 0], [10, 2, 1]);
        let separate = new BoundingBox([20, 20, 0], [21, 21, 1]);
        let firstOutside = BoundingBox.findOutsideBox2D(outer, inner);
        let secondOutside = BoundingBox.findOutsideBox2D(inner, outer);
        if (firstOutside === undefined || secondOutside === undefined) {
            throw new Error("expected the enclosing box of a nested pair in either order");
        }
        expectBounds(expected, "first_encloses", firstOutside);
        expectBounds(expected, "second_encloses", secondOutside);
        expectFlags(expected, {
            touching_edges: BoundingBox.findOutsideBox2D(outer, flush) === undefined,
            disjoint: BoundingBox.findOutsideBox2D(outer, separate) === undefined,
            identical: BoundingBox.findOutsideBox2D(outer, outer) === undefined,
        });
    },

    "bounding-box/is-inside": expected => {
        let outer = new BoundingBox([0, 0, 0], [10, 10, 10]);
        let inner = new BoundingBox([1, 1, 1], [2, 2, 2]);
        let flush = new BoundingBox([0, 0, 0], [10, 10, 5]);
        let straddling = new BoundingBox([5, 5, 5], [15, 15, 15]);
        expectFlags(expected, {
            nested: inner.isInside(outer),
            reversed: outer.isInside(inner),
            flush: flush.isInside(outer),
            straddling: straddling.isInside(outer),
            self: outer.isInside(outer),
            matches_within: inner.isInside(outer) === inner.within(outer),
            loose_tolerance: straddling.isInside(outer, 10),
        });
    },
};
