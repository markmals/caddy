import { shapes } from "@roonieone/occt-native";

import { booleanPieces, expandShapes } from "./boolean.ts";
import { native } from "./kernel.ts";
import { Shape } from "./shape.ts";

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

    /** Coplanar overlaps are faces; Section contributes crossing edges, not boundary vertices. */
    override intersectWith(other: Shape, tolerance = 1e-6): Shape[] | undefined {
        let results: Shape[];
        switch (other.shapeType) {
            case "Face":
            case "Shell": {
                let common = expandShapes(booleanPieces(this, [this], [other], "common"));
                let sections = booleanPieces(this, [this], [other], "section").filter(
                    shape => shape.shapeType === "Edge",
                );
                let commonEdges = common.flatMap(shape => [...shape.edges()]);
                results = [
                    ...common,
                    ...sections.filter(
                        edge =>
                            !commonEdges.some(
                                boundary =>
                                    edge
                                        .boundingBox(undefined, false)
                                        .intersects(
                                            boundary.boundingBox(undefined, false),
                                            tolerance,
                                        ) && edge.distanceTo(boundary) <= tolerance,
                            ),
                    ),
                ];
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
                results = other.intersectWith(this, tolerance) ?? [];
        }
        return results.length > 0 ? results : undefined;
    }
}
