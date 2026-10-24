/**
 * Constructors registered by the shape subclasses, so that `Shape` can build the right subclass
 * for a native shape without importing the subclass modules (which import `Shape` themselves).
 * Mirrors build123d's `register_shape_constructor`/`register_composite_factory`.
 */

import type * as occt from "@roonieone/occt-native";

import { shapes } from "@roonieone/occt-native";

import type { Shape } from "./shape.ts";

import { InvalidShapeError } from "../errors.ts";

type ShapeConstructor = (native: occt.Shape) => Shape;
type CompositeFactory = (shapes: Shape[]) => Shape;

const SHAPE_CONSTRUCTORS = new Map<occt.ShapeType, ShapeConstructor>();
const COMPOSITE_FACTORIES = new Map<number | undefined, CompositeFactory>();

export function registerShapeConstructor(
    type: occt.ShapeType,
    constructor: ShapeConstructor,
): void {
    SHAPE_CONSTRUCTORS.set(type, constructor);
}

export function registerCompositeFactory(
    dimension: number | undefined,
    factory: CompositeFactory,
): void {
    COMPOSITE_FACTORIES.set(dimension, factory);
}

/** Wrap a native shape in the subclass matching its type (build123d `Shape.cast`). */
export function castShape(native: occt.Shape): Shape {
    let type = shapes.shapeType(native);
    let constructor = SHAPE_CONSTRUCTORS.get(type);
    if (constructor === undefined) {
        throw new InvalidShapeError(
            `No shape class is registered for native shape type ${type}; ` +
                "import shapes through the topology index",
        );
    }
    return constructor(native);
}

/**
 * Wrap `shapes` in the composite registered for `dimension` — Curve, Sketch or Part — or a plain
 * Compound (build123d `Shape.make_composite`). Without a dimension it is inferred from the shapes
 * when they all agree.
 */
export function makeComposite(shapes: Iterable<Shape>, dimension?: number): Shape {
    let pieces = [...shapes];
    let resolved = dimension;
    if (resolved === undefined && pieces.length > 0) {
        let dimensions = new Set(pieces.map(piece => piece.dimension));
        let [only] = dimensions;
        resolved = dimensions.size === 1 ? only : undefined;
    }
    let factory = COMPOSITE_FACTORIES.get(resolved) ?? COMPOSITE_FACTORIES.get(undefined);
    if (factory === undefined) {
        throw new InvalidShapeError("No composite class is registered");
    }
    return factory(pieces);
}
