import { describe, expect, it } from "vite-plus/test";

import { Align, BoundingBox, toAlignOffset, Vector } from "../../src/index.ts";

describe("BoundingBox", () => {
    it("derives size, centre and diagonal from its corners", () => {
        let box = new BoundingBox([-1, -2, -3], [4, 5, 6]);
        expect(box.size.toTuple()).toEqual([5, 7, 9]);
        expect(box.center.toTuple()).toEqual([1.5, 1.5, 1.5]);
        expect(box.diagonal).toBeCloseTo(Math.sqrt(25 + 49 + 81), 12);
    });

    it("measures the dimensions that are not degenerate", () => {
        expect(new BoundingBox([0, 0, 0], [2, 3, 4]).measure).toBe(24);
        expect(new BoundingBox([0, 0, 1], [2, 3, 1]).measure).toBe(6);
        expect(new BoundingBox([0, 0, 1], [2, 0, 1]).measure).toBe(2);
        // The empty product: a point has no extent to multiply.
        expect(new BoundingBox([1, 1, 1], [1, 1, 1]).measure).toBe(1);
    });

    it("grows to cover points and other boxes", () => {
        let box = new BoundingBox([0, 0, 0], [1, 1, 1]);
        expect(box.add([2, -3, 0.5]).min.toTuple()).toEqual([0, -3, 0]);
        expect(box.add([2, -3, 0.5]).max.toTuple()).toEqual([2, 1, 1]);
        expect(box.add(new BoundingBox([-1, -1, -1], [0.5, 0.5, 0.5])).min.toTuple()).toEqual([
            -1, -1, -1,
        ]);
        expect(box.add([0.5, 0.5, 0.5]).equals(box)).toBe(true);
    });

    it("builds from a point and from a cloud", () => {
        expect(BoundingBox.fromPoint([1, 2, 3]).size.toTuple()).toEqual([0, 0, 0]);
        let cloud = BoundingBox.fromPoints([new Vector(1, 0, 0), [0, 2, 0], [0, 0, -3]]);
        expect(cloud.min.toTuple()).toEqual([0, 0, -3]);
        expect(cloud.max.toTuple()).toEqual([1, 2, 0]);
        expect(() => BoundingBox.fromPoints([])).toThrow(RangeError);
    });

    it("separates enclosure from proper containment", () => {
        let outer = new BoundingBox([0, 0, 0], [10, 10, 10]);
        let inner = new BoundingBox([1, 1, 1], [2, 2, 2]);
        let flush = new BoundingBox([0, 0, 0], [10, 10, 5]);
        expect(outer.covers(flush)).toBe(true);
        expect(outer.contains(flush)).toBe(true);
        expect(outer.containsProperly(flush)).toBe(false);
        expect(outer.containsProperly(inner)).toBe(true);
        expect(inner.within(outer)).toBe(true);
        expect(inner.coveredBy(outer)).toBe(true);
    });

    it("compares coplanar boxes in the dimensions they share", () => {
        let rectangle = new BoundingBox([0, 0, 0], [10, 10, 0]);
        let coplanar = new BoundingBox([1, 1, 0], [2, 2, 0]);
        let parallel = new BoundingBox([1, 1, 1], [2, 2, 1]);
        expect(rectangle.contains(coplanar)).toBe(true);
        expect(rectangle.contains(parallel)).toBe(false);
        expect(rectangle.covers(parallel)).toBe(false);
    });

    it("tells touching, overlapping and disjoint apart", () => {
        let outer = new BoundingBox([0, 0, 0], [10, 10, 10]);
        let touching = new BoundingBox([10, 0, 0], [12, 10, 10]);
        let straddling = new BoundingBox([5, 5, 5], [15, 15, 15]);
        let separate = new BoundingBox([20, 20, 20], [21, 21, 21]);
        expect(outer.touches(touching)).toBe(true);
        expect(outer.overlaps(touching)).toBe(false);
        expect(outer.overlaps(straddling)).toBe(true);
        expect(outer.disjoint(separate)).toBe(true);
        expect(outer.intersects(separate)).toBe(false);
    });

    it("measures the gap between disjoint boxes", () => {
        let first = new BoundingBox([0, 0, 0], [1, 1, 1]);
        let second = new BoundingBox([4, 0, 0], [5, 1, 1]);
        expect(first.distanceTo(second)).toBeCloseTo(3, 12);
        expect(first.distanceTo(first)).toBe(0);
    });

    it("computes alignment offsets per axis", () => {
        let box = new BoundingBox([-1, -2, -3], [4, 5, 6]);
        expect(box.toAlignOffset(Align.Min).toTuple()).toEqual([1, 2, 3]);
        expect(box.toAlignOffset(Align.Max).toTuple()).toEqual([-4, -5, -6]);
        expect(box.toAlignOffset(Align.None).toTuple()).toEqual([0, 0, 0]);
        expect(box.toAlignOffset(null).toTuple()).toEqual([0, 0, 0]);
        expect(box.toAlignOffset([Align.Min, null, Align.Max]).toTuple()).toEqual([1, 0, -6]);
        expect(box.toAlignOffset([Align.Max, Align.Min]).toTuple()).toEqual([-4, 2, 0]);
    });

    it("accepts an explicit centre in the free alignment helper", () => {
        expect(toAlignOffset([0, 0, 0], [2, 2, 2], Align.Center).toTuple()).toEqual([-1, -1, -1]);
        expect(
            toAlignOffset([0, 0, 0], [2, 2, 2], Align.Center, [0.5, 0.5, 0.5]).toTuple(),
        ).toEqual([-0.5, -0.5, -0.5]);
    });
});
