import { shapes } from "@roonieone/occt-native";

import type { Axis } from "../geometry/axis.ts";
import type { PerimeterSide } from "../operations/split-by-perimeter.ts";
import type { Edge } from "./edge.ts";
import type { Face } from "./face.ts";
import type { AxisIntersection } from "./helpers/axis-intersections.ts";
import type { ShapeList } from "./shape-list.ts";
import type { IntersectOptions, TouchOptions } from "./shape.ts";
import type { Wire } from "./wire.ts";

import { InvalidShapeError } from "../errors.ts";
import { TOLERANCE } from "../geometry/constants.ts";
import { Pos } from "../geometry/location.ts";
import { splitByPerimeter } from "../operations/split-by-perimeter.ts";
import { booleanPieces, expandShapes } from "./boolean.ts";
import { Keep } from "./enums.ts";
import { axisIntersections } from "./helpers/axis-intersections.ts";
import { native } from "./kernel.ts";
import { Shape } from "./shape.ts";
import { touch2D } from "./touch.ts";

/** Options of {@link Mixin2D#findIntersectionPoints} and {@link Mixin3D#findIntersectionPoints}. */
export interface AxisHitOptions {
    /** How close the axis must come to count as a hit; defaults to 1e-6. */
    readonly tolerance?: number;
}

/** Shared behaviour of faces and shells (build123d `Mixin2D`). */
export abstract class Mixin2D extends Shape {
    get dimension(): number {
        return 2;
    }

    /**
     * A copy with its normal flipped (build123d unary `-`). The copy is no longer part of the
     * shape it was extracted from, so its provenance is dropped.
     */
    reverseNormal(): this {
        let flipped = this.withWrapped(native("Reverse", () => shapes.reversed(this.wrapped)));
        flipped.topoPath = [];
        return flipped;
    }

    /**
     * A copy moved along its own normal by `amount` (build123d `Mixin2D.offset`). build123d reads
     * the normal through `normal_at`, which only faces have; a shell needs to hold exactly one.
     */
    offset(amount: number): this {
        let faces = this.faces;
        if (faces.length !== 1) {
            throw new InvalidShapeError("Offsetting along the normal needs a single face");
        }
        return this.moved(new Pos(faces[0]!.normalAt().multiply(amount)));
    }

    /**
     * Where `axis` pierces this surface, with the normal at each point, ordered along the axis
     * (build123d `find_intersection_points`).
     */
    findIntersectionPoints(axis: Axis, options: AxisHitOptions = {}): AxisIntersection[] {
        return axisIntersections(this, axis, options.tolerance ?? TOLERANCE);
    }

    /** Divide this surface along a closed perimeter (build123d `split_by_perimeter`). */
    splitByPerimeter(
        perimeter: Edge | Wire,
        keep: typeof Keep.Both,
    ): [PerimeterSide, PerimeterSide];
    splitByPerimeter(perimeter: Edge | Wire, keep?: Keep): PerimeterSide;
    splitByPerimeter(
        perimeter: Edge | Wire,
        keep: Keep = Keep.Inside,
    ): PerimeterSide | [PerimeterSide, PerimeterSide] {
        return splitByPerimeter(this, perimeter, keep);
    }

    /** Coplanar overlaps are faces; Section contributes crossing edges, not boundary vertices. */
    override intersectWith(other: Shape, options: IntersectOptions = {}): Shape[] | undefined {
        let tolerance = options.tolerance ?? 1e-6;
        let results: Shape[];
        switch (other.shapeType) {
            case "Face":
            case "Shell": {
                let common = expandShapes(booleanPieces(this, [this], [other], "common"));
                let sections = booleanPieces(this, [this], [other], "section").filter(
                    shape => shape.shapeType === "Edge",
                );
                let commonEdges = common.flatMap(shape => [...shape.edges]);
                results = [
                    ...common,
                    ...sections.filter(
                        edge =>
                            !commonEdges.some(
                                boundary =>
                                    edge
                                        .getBoundingBox({ optimal: false })
                                        .intersects(
                                            boundary.getBoundingBox({ optimal: false }),
                                            tolerance,
                                        ) && edge.distanceTo(boundary) <= tolerance,
                            ),
                    ),
                ];
                if (options.includeTouched === true) {
                    results.push(
                        ...touch2D(this, other, tolerance, {
                            faces: results.filter(shape => shape.shapeType === "Face") as Face[],
                            edges: results.filter(shape => shape.shapeType === "Edge") as Edge[],
                        }),
                    );
                }
                break;
            }
            case "Edge":
            case "Wire":
                results = booleanPieces(this, [this], [other], "section");
                break;
            case "Vertex":
                results = this.distanceTo(other) <= tolerance ? [other] : [];
                break;
            default:
                results = other.intersectWith(this, options) ?? [];
        }
        return results.length > 0 ? results : undefined;
    }

    /**
     * Boundary contacts with another shape (build123d `Mixin2D.touch`): the corners and
     * crossings where the two meet without sharing an area or a curve.
     */
    override touch(other: Shape, options: TouchOptions = {}): ShapeList<Shape> {
        return touch2D(this, other, options.tolerance ?? 1e-6);
    }
}
