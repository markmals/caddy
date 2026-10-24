/**
 * Boolean operations with build123d's semantics (`Shape._bool_op`, `__add__`, `__sub__`,
 * `__and__`): empty-operand shortcuts, cleaning, compound unwrapping and the choice of result
 * class from the highest-ranked input.
 */

import type * as occt from "@roonieone/occt-native";

import { booleans, history, ShapeType, shapes, topology } from "@roonieone/occt-native";

import type { FuseOptions, IntersectOptions, Shape, ShapeOperand } from "./shape.ts";

import { BooleanOperationError, InvalidShapeError } from "../errors.ts";
import { native } from "./kernel.ts";
import { topLevelNativeShapes, unwrapNativeCompound } from "./native-topology.ts";
import { castShape, makeComposite } from "./registry.ts";
import { madeBy, recordOf, ShapeHistory } from "./shape-history.ts";

/** The rank of Compound and its composites; results of that rank are never re-wrapped. */
const COMPOUND_ORDER = 4;

type BooleanKind = "fuse" | "cut" | "common" | "section";

interface BooleanRequest {
    readonly kind: BooleanKind;
    readonly fuzzyValue?: number;
    readonly glue?: boolean;
}

function orderOf(shape: Shape): number {
    return (shape.constructor as typeof Shape).order;
}

/** The shapes the operands stand for: one shape, or each shape of an iterable. */
function operandShapes(operands: readonly ShapeOperand[]): Shape[] {
    return operands.flatMap(operand => ("wrapped" in operand ? [operand as Shape] : [...operand]));
}

/** Every top-level shape of the operands (build123d's summand/subtrahend lists). */
function topLevelOperands(operands: readonly ShapeOperand[]): Shape[] {
    return operandShapes(operands).flatMap(shape => [...shape.getTopLevelShapes()]);
}

function nativeCompound(members: readonly occt.Shape[]): occt.Shape {
    return topology.makeCompound(members);
}

/** A cleaned shape and the record of what the clean merged, absent when the clean failed. */
interface Cleaned {
    readonly shape: occt.Shape;
    readonly history: occt.History | undefined;
}

/**
 * build123d's `ShapeUpgrade_UnifySameDomain` pass after every boolean. Cleaning is best effort
 * there: a failure keeps the uncleaned result and warns, and so does this.
 */
export function clean(wrapped: occt.Shape): Cleaned {
    try {
        return booleans.unifyWithHistory(wrapped);
    } catch (error) {
        process.emitWarning(`Unable to clean shape: ${String(error)}`);
        return { shape: wrapped, history: undefined };
    }
}

/**
 * The shortcut build123d takes when an operand list is empty, or `undefined` to run OCCT. A
 * section has none.
 */
function emptyOperandResult(
    kind: BooleanKind,
    args: readonly occt.Shape[],
    tools: readonly occt.Shape[],
): occt.Shape | "empty" | undefined {
    let combine = (members: readonly occt.Shape[]): occt.Shape =>
        members.length === 1 && members[0] !== undefined ? members[0] : nativeCompound(members);
    if (kind === "section") {
        return undefined;
    }
    if (kind === "common") {
        return args.length === 0 || tools.length === 0 ? "empty" : undefined;
    }
    if (tools.length === 0) {
        return combine(args);
    }
    if (kind === "fuse" && args.length === 0) {
        return combine(tools);
    }
    return undefined;
}

function runBoolean(
    request: BooleanRequest,
    args: readonly occt.Shape[],
    tools: readonly occt.Shape[],
): occt.Recorded {
    let options: booleans.BooleanOptions = {
        glue: request.glue === true ? "shift" : "off",
        fuzzyValue: request.fuzzyValue ?? 0,
        parallel: true,
    };
    return native(
        `Boolean ${request.kind}`,
        () => booleans.withHistory(request.kind, args, tools, options),
        BooleanOperationError,
    );
}

/**
 * build123d `Shape._bool_op`: `args` op `tools`, cleaned, with a single-shape compound unwrapped.
 * A remaining compound becomes the composite of the highest-ranked input class (Part for solids,
 * Sketch for faces, Curve for edges) unless an input was already a compound.
 *
 * build123d answers a common with an empty operand list with a null shape of the base's class;
 * Caddy has no null shapes, so that case yields an empty Compound.
 */
export function booleanOperation(
    base: Shape,
    args: readonly Shape[],
    tools: readonly Shape[],
    request: BooleanRequest,
): Shape {
    let highestOrder = Math.max(...[base, ...args, ...tools].map(orderOf));
    let argShapes = args.map(shape => shape.wrapped);
    let toolShapes = tools.map(shape => shape.wrapped);

    let shortcut = emptyOperandResult(request.kind, argShapes, toolShapes);
    if (shortcut === "empty") {
        return castShape(nativeCompound([]));
    }
    // The arguments were there before and the tools are brought in. An empty record means every
    // input sub-shape came through untouched, which is what the shortcuts produce.
    let operation =
        shortcut === undefined
            ? runBoolean(request, argShapes, toolShapes)
            : { shape: shortcut, history: history.empty() };
    let cleaned = clean(operation.shape);
    let record = new ShapeHistory(operation.history, argShapes, toolShapes);
    if (cleaned.history !== undefined) {
        record.merge(cleaned.history);
    }

    let result = cleaned.shape;
    if (shapes.shapeType(result) === ShapeType.Compound) {
        result = unwrapNativeCompound(result);
    }
    if (shapes.shapeType(result) === ShapeType.Compound && highestOrder !== COMPOUND_ORDER) {
        let pieces = topLevelNativeShapes(result).map(castShape);
        for (let piece of pieces) {
            madeBy(inheritAttributes(piece, base), record);
        }
        return madeBy(inheritAttributes(makeComposite(pieces, highestOrder), base), record);
    }
    return madeBy(inheritAttributes(castShape(result), base), record);
}

/**
 * build123d's `copy_attributes_to`: `target` takes `source`'s label, colour, material and joints
 * where it has none of its own.
 */
export function inheritAttributes<T extends Shape>(target: T, source: Shape): T {
    target.label ||= source.label;
    target.color ??= source.color;
    target.material ??= source.material;
    if (target.joints.size === 0) {
        for (let joint of source.joints.values()) {
            joint.rebind(target);
        }
    }
    return target;
}

export function booleanFuse(base: Shape, toFuse: readonly Shape[], options: FuseOptions): Shape {
    let request: BooleanRequest = {
        kind: "fuse",
        ...(options.glue === undefined ? {} : { glue: options.glue }),
        ...(options.tol === undefined ? {} : { fuzzyValue: options.tol }),
    };
    return booleanOperation(base, [base], toFuse, request);
}

export function booleanCut(base: Shape, toCut: readonly Shape[]): Shape {
    return booleanOperation(base, [base], toCut, { kind: "cut" });
}

/** build123d `Shape._bool_op_list`: the boolean's pieces, empty for an empty result. */
export function booleanPieces(
    base: Shape,
    args: readonly Shape[],
    tools: readonly Shape[],
    kind: BooleanKind,
): Shape[] {
    let result = booleanOperation(base, args, tools, { kind });
    if (shapes.shapeType(result.wrapped) !== ShapeType.Compound) {
        return [result];
    }
    let pieces = [...result.getTopLevelShapes()];
    let record = recordOf(result);
    if (record !== undefined) {
        for (let piece of pieces) {
            madeBy(piece, record);
        }
    }
    return pieces;
}

/**
 * The top-level shapes build123d's `Shape.__add__` fuses: every shape of the operands, all of
 * this shape's dimension.
 */
export function additionOperands(self: Shape, operands: readonly ShapeOperand[]): Shape[] {
    let summands = topLevelOperands(operands);
    if (summands.length === 0) {
        return summands;
    }
    let dimension = self.dimension;
    if (dimension === undefined) {
        throw new InvalidShapeError("Dimensions of objects to add to are inconsistent");
    }
    if (!summands.every(summand => summand.dimension === dimension)) {
        throw new InvalidShapeError("Only shapes with the same dimension can be added");
    }
    return summands;
}

/**
 * The top-level shapes build123d's `Shape.__sub__` cuts away, each of at least this shape's
 * dimension.
 */
export function subtractionOperands(self: Shape, operands: readonly ShapeOperand[]): Shape[] {
    let subtrahends = topLevelOperands(operands);
    if (subtrahends.length === 0) {
        return subtrahends;
    }
    let minuendDimension = self.dimension;
    let dimensions = subtrahends.map(shape => shape.dimension);
    if (minuendDimension === undefined || dimensions.includes(undefined)) {
        throw new InvalidShapeError("Dimensions of objects to subtract from are inconsistent");
    }
    let smallest = Math.min(...(dimensions as number[]));
    if (smallest < minuendDimension) {
        throw new InvalidShapeError(
            "Only shapes with equal or greater dimension can be subtracted: not " +
                `${self.constructor.name} (${minuendDimension}D) and ${smallest}D`,
        );
    }
    return subtrahends;
}

/**
 * build123d `Shape.__and__` over `Shape.intersect`: each operand narrows the running set of
 * results (AND); the final pieces are combined into one shape and cleaned.
 */
export function intersectShapes(
    self: Shape,
    operands: readonly ShapeOperand[],
    options: IntersectOptions = {},
): Shape | undefined {
    let others = operandShapes(operands);
    if (others.length === 0) {
        return undefined;
    }
    let tolerance = options.tolerance ?? 1e-6;
    let includeTouched = options.includeTouched ?? false;
    let common: Shape[] = [self];
    for (let other of others) {
        let next = uniqueShapes(
            common.flatMap(shape =>
                expandShapes(shape.intersectWith(other, { tolerance, includeTouched }) ?? []),
            ),
        );
        if (next.length === 0) {
            return undefined;
        }
        common = next;
    }
    let [only] = common;
    let combined = common.length === 1 && only !== undefined ? only : makeComposite(common);
    return combined.clean();
}

/**
 * build123d `ShapeList.expand`: compounds dissolve into their (recursively expanded) children,
 * shells into faces and wires into edges.
 */
export function expandShapes(found: Iterable<Shape>): Shape[] {
    let expanded: Shape[] = [];
    for (let shape of found) {
        let type = shapes.shapeType(shape.wrapped);
        if (type === ShapeType.Compound) {
            expanded.push(...expandShapes(topology.childShapes(shape.wrapped).map(castShape)));
        } else if (type === ShapeType.Shell) {
            expanded.push(...shape.faces());
        } else if (type === ShapeType.Wire) {
            expanded.push(...shape.edges());
        } else {
            expanded.push(shape);
        }
    }
    return expanded;
}

/** Drop shapes that are the same (OCCT IsSame) as an earlier one, keeping first occurrences. */
export function uniqueShapes<T extends Shape>(found: Iterable<T>): T[] {
    let buckets = new Map<number, T[]>();
    let unique: T[] = [];
    for (let shape of found) {
        let hash = shape.hashCode();
        let bucket = buckets.get(hash) ?? [];
        if (bucket.some(seen => seen.isSame(shape))) {
            continue;
        }
        bucket.push(shape);
        buckets.set(hash, bucket);
        unique.push(shape);
    }
    return unique;
}
