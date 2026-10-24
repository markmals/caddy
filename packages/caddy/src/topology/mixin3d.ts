import { measure, query } from "@roonieone/occt-native";

import type { VectorLike } from "../geometry/vector.ts";
import type { DPrismOptions } from "../operations/dprism.ts";
import type { MaxFilletOptions } from "../operations/max-fillet.ts";
import type { Part } from "./composite.ts";
import type { Edge } from "./edge.ts";
import type { Face } from "./face.ts";
import type { ShapeList } from "./shape-list.ts";
import type { IntersectOptions, TouchOptions } from "./shape.ts";
import type { Solid } from "./solid.ts";
import type { Wire } from "./wire.ts";

import { GeometryError, InvalidShapeError } from "../errors.ts";
import { Vector } from "../geometry/vector.ts";
import { dprism } from "../operations/dprism.ts";
import { chamferSolid, filletSolid } from "../operations/fillet-solid.ts";
import { hollowSolid } from "../operations/hollow.ts";
import { maxFillet } from "../operations/max-fillet.ts";
import { offsetSolid } from "../operations/offset-solid.ts";
import { Kind } from "../sketch/enums.ts";
import { booleanPieces, expandShapes } from "./boolean.ts";
import { fromVec3, toVec3 } from "./conversions.ts";
import { CenterOf } from "./enums.ts";
import { native } from "./kernel.ts";
import { Shape } from "./shape.ts";
import { touch3D } from "./touch.ts";

/** Shared behaviour of solids and compounds (build123d `Mixin3D`). */
export abstract class Mixin3D extends Shape {
    get dimension(): number | undefined {
        return 3;
    }

    /** Centre of mass (default) or of the bounding box; `Geometry` is not defined for solids. */
    center(centerOf: CenterOf = CenterOf.Mass): Vector {
        if (centerOf === CenterOf.Geometry) {
            throw new InvalidShapeError("Center of GEOMETRY is not supported for this object");
        }
        if (centerOf === CenterOf.Mass) {
            let properties = native("Center of mass", () =>
                measure.massProperties(this.wrapped, "volume"),
            );
            return fromVec3(properties.centerOfMass);
        }
        return this.boundingBox().center();
    }

    /** Round the selected edges of this solid (build123d `Mixin3D.fillet`). */
    fillet(radius: number, edgeList: Edge | Iterable<Edge>): Solid | Part {
        return filletSolid(edgeList, radius, this).unwrap() as Solid | Part;
    }

    /**
     * Cut the selected edges back (build123d `Mixin3D.chamfer`); `length2` makes the chamfer
     * asymmetric, measured on `face`.
     */
    chamfer(
        length: number,
        edgeList: Edge | Iterable<Edge>,
        options: { readonly length2?: number; readonly face?: Face } = {},
    ): Solid | Part {
        return chamferSolid(edgeList, length, {
            ...(options.length2 === undefined ? {} : { length2: options.length2 }),
            ...(options.face === undefined ? {} : { reference: options.face }),
            target: this,
        }).unwrap() as Solid | Part;
    }

    /** Offset the solid in 3D, optionally removing opening faces (build123d `offset_3d`). */
    offset3D(
        thickness: number,
        options: {
            /** Faces removed to open the solid into a shell. */
            readonly openings?: Iterable<Face>;
            readonly tolerance?: number;
            readonly kind?: Kind;
        } = {},
    ): Solid {
        let { openings, tolerance = 1e-4, kind = Kind.Arc } = options;
        if (!Number.isFinite(thickness) || thickness === 0) {
            throw new GeometryError("Offset thickness must be nonzero and finite");
        }
        if (kind === Kind.Tangent)
            throw new GeometryError("Tangent offset joins are not supported for solids");
        let solids = this.solids();
        if (solids.length !== 1) throw new InvalidShapeError("Offset requires one solid");
        return offsetSolid(solids[0]!, thickness, [...(openings ?? [])], kind, tolerance) as Solid;
    }

    /**
     * Shell the solid to a wall of `thickness` (build123d `Mixin3D.hollow`). Listed faces are
     * removed, opening the shell; with none the result is watertight.
     */
    hollow(
        faces: Iterable<Face> | undefined,
        thickness: number,
        options: { readonly tolerance?: number; readonly kind?: Kind } = {},
    ): Solid {
        if (!Number.isFinite(thickness) || thickness === 0) {
            throw new GeometryError("Hollow thickness must be nonzero and finite");
        }
        return hollowSolid(this, [...(faces ?? [])], thickness, options) as Solid;
    }

    /** The largest fillet radius `edgeList` accepts on this solid (build123d `max_fillet`). */
    maxFillet(edgeList: Edge | Iterable<Edge>, options: MaxFilletOptions = {}): number {
        return maxFillet(this, edgeList, options);
    }

    /** Add or cut a tapered prism bounded by the given profiles (build123d `dprism`). */
    dprism(bounds: Face | Wire | Iterable<Face | Wire>, options: DPrismOptions = {}): Solid | Part {
        return dprism(this, bounds, options) as Solid | Part;
    }

    /** Whether `point` is inside the shape or on its boundary, within `tolerance`. */
    isInside(point: VectorLike, tolerance = 1e-6): boolean {
        let target = toVec3(Vector.from(point));
        let classification = native("Point classification", () =>
            query.classifyPoint(this.wrapped, target, tolerance),
        );
        return classification.state === query.PointState.In || classification.onFace;
    }

    /**
     * build123d `Mixin3D._intersect`: the common part with a solid, face, shell, edge or wire,
     * a vertex inside the shape, or whatever a compound operand yields.
     */
    override intersectWith(other: Shape, options: IntersectOptions = {}): Shape[] | undefined {
        let tolerance = options.tolerance ?? 1e-6;
        let results: Shape[];
        switch (other.shapeType) {
            case "Solid":
            case "Face":
            case "Shell":
            case "Edge":
            case "Wire":
                results = expandShapes(booleanPieces(this, [this], [other], "common"));
                if (options.includeTouched === true) {
                    results.push(...this.touch(other, { tolerance }));
                }
                break;
            case "Vertex":
                results = this.isInside(other.center(), tolerance) ? [other] : [];
                break;
            default:
                results = other.intersectWith(this, options) ?? [];
        }
        return results.length > 0 ? results : undefined;
    }

    /**
     * Boundary contacts with another shape (build123d `Solid.touch`): the faces, edges and
     * vertices where the boundaries meet without their interiors overlapping.
     */
    override touch(other: Shape, options: TouchOptions = {}): ShapeList<Shape> {
        return touch3D(this, other, options.tolerance ?? 1e-6);
    }
}
