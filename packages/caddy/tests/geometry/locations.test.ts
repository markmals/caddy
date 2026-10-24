import { describe, expect, it } from "vite-plus/test";

import {
    Axis,
    GeometryError,
    GridLocations,
    HexLocations,
    Location,
    Locations,
    Plane,
    PolarLocations,
    Vector,
} from "../../src/index.ts";

describe("Locations", () => {
    it("reads points, locations, planes and axes", () => {
        let placements = new Locations([1, 2], new Vector(3, 0, 0), Plane.XY, Axis.Z);
        expect(placements.length).toBe(4);
        expect(placements.locations[0]?.position.toTuple()).toEqual([1, 2, 0]);
        expect(placements.locations[1]?.position.toTuple()).toEqual([3, 0, 0]);
    });

    it("keeps a location it was given", () => {
        let source = Location.fromOrientation([1, 2, 3], [0, 0, 45]);
        expect(new Locations(source).locations[0]).toBe(source);
    });

    it("flattens nested groups and places nothing for an empty one", () => {
        expect(
            new Locations(
                [
                    [1, 0],
                    [2, 0],
                ],
                [[3, 0]],
            ).length,
        ).toBe(3);
        expect(new Locations([]).length).toBe(0);
        expect(new Locations().length).toBe(0);
    });

    it("rejects sources that name no placement", () => {
        expect(() => new Locations(5 as unknown as Vector)).toThrow(GeometryError);
        expect(() => new Locations(["a", "b"] as unknown as Vector)).toThrow(GeometryError);
    });

    it("iterates its locations so a shape can be repeated over them", () => {
        let grid = new GridLocations(10, 10, 2, 1);
        expect([...grid].map(placement => placement.position.x)).toEqual([-5, 5]);
        expect(Array.from(grid, placement => placement.position.y)).toEqual([0, 0]);
    });
});

describe("GridLocations", () => {
    it("spans from min to max about the alignment point", () => {
        let grid = new GridLocations(10, 20, 3, 2);
        expect(grid.size.toTuple()).toEqual([20, 20, 0]);
        expect(grid.min.toTuple()).toEqual([-10, -10, 0]);
        expect(grid.max.toTuple()).toEqual([10, 10, 0]);
    });

    it("requires at least one whole row and column", () => {
        expect(() => new GridLocations(10, 10, 0, 2)).toThrow(GeometryError);
        expect(() => new GridLocations(10, 10, 2, -1)).toThrow(GeometryError);
        expect(() => new GridLocations(10, 10, 1.5, 2)).toThrow(GeometryError);
    });
});

describe("HexLocations", () => {
    it("reads the radius as the apothem unless told otherwise", () => {
        expect(new HexLocations(5, 2, 2).apothem).toBe(5);
        expect(new HexLocations(5, 2, 2).diagonal).toBeCloseTo(11.547005383792516, 12);
        expect(new HexLocations(5, 2, 2, { majorRadius: true }).diagonal).toBe(10);
        expect(new HexLocations(5, 2, 2, { majorRadius: true }).apothem).toBeCloseTo(
            4.330127018922194,
            12,
        );
    });

    it("rejects a radius that leaves no spacing", () => {
        expect(() => new HexLocations(0, 2, 2)).toThrow(GeometryError);
        expect(() => new HexLocations(-1, 2, 2)).toThrow(GeometryError);
    });

    it("requires at least one whole row and column", () => {
        expect(() => new HexLocations(5, 0, 2)).toThrow(GeometryError);
        expect(() => new HexLocations(5, 2, 0)).toThrow(GeometryError);
    });
});

describe("PolarLocations", () => {
    it("turns each placement to follow the arc unless told otherwise", () => {
        let turned = new PolarLocations(10, 4);
        expect(turned.locations[1]?.orientation.z).toBeCloseTo(90, 12);
        let upright = new PolarLocations(10, 4, { rotate: false });
        expect(upright.locations[1]?.orientation.z).toBeCloseTo(0, 12);
    });

    it("includes the end of the range only on request", () => {
        let open = new PolarLocations(10, 3, { angularRange: 90 });
        let closed = new PolarLocations(10, 3, { angularRange: 90, endpoint: true });
        expect(open.locations.at(-1)?.position.y).toBeCloseTo(10 * Math.sin(Math.PI / 3), 12);
        expect(closed.locations.at(-1)?.position.y).toBeCloseTo(10, 12);
    });

    it("requires at least one point", () => {
        expect(() => new PolarLocations(10, 0)).toThrow(GeometryError);
        expect(() => new PolarLocations(10, 2.5)).toThrow(GeometryError);
    });
});
