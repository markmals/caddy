import { construct } from "@roonieone/occt-native";

import type { Axis } from "../geometry/axis.ts";
import type { Plane } from "../geometry/plane.ts";
import type { Vector } from "../geometry/vector.ts";
import type { ExtrudeOptions } from "../operations/solids.ts";
import type { Face } from "./face.ts";
import type { ShapeOperand } from "./shape.ts";
import type { Shape } from "./shape.ts";
import type { Solid } from "./solid.ts";

import { extrude } from "../operations/solids.ts";
import { Compound } from "./compound.ts";
import { PositionMode } from "./enums.ts";
import { native } from "./kernel.ts";
import { unionCurves } from "./mixin1d.ts";
import { registerCompositeFactory } from "./registry.ts";
import { ShapeList } from "./shape-list.ts";
import { Wire } from "./wire.ts";

/**
 * Narrows a boolean result to the composite class it must be. Cutting never raises a shape's
 * dimension, and combining same-dimension composites keeps it, so a mismatch is a bug.
 */
function as<T extends Compound>(result: Shape, type: abstract new (...args: never[]) => T): T {
    if (!(result instanceof type)) {
        throw new TypeError(`expected a ${type.name} result, got ${result.constructor.name}`);
    }
    return result;
}

/** A compound of edges (build123d `Curve`). */
export class Curve extends Compound {
    override get dimension(): number {
        return 1;
    }

    /** build123d's `+` for curves: edges join into a wire where they connect. */
    override union(...others: ShapeOperand[]): Shape {
        return unionCurves(this, others);
    }

    override subtract(...others: ShapeOperand[]): Curve {
        return as(super.subtract(...others), Curve);
    }

    /** Point at `position` along the curve's edges joined into one wire (`@`). */
    positionAt(position: number, mode: PositionMode = PositionMode.Parameter): Vector {
        return new Wire(this.edges()).positionAt(position, mode);
    }

    /** Tangent at `position` along the curve's edges joined into one wire (`%`). */
    tangentAt(position = 0.5, mode: PositionMode = PositionMode.Parameter): Vector {
        return new Wire(this.edges()).tangentAt(position, mode);
    }

    /** The wires the curve's edges connect into (build123d `Wire.combine`). */
    override wires(): ShapeList<Wire> {
        let edges = Array.from(this.edges(), edge => edge.wrapped);
        let wires = native("Wire assembly", () => construct.connectEdgesToWires(edges));
        return new ShapeList(wires.map(wrapped => new Wire(wrapped)));
    }
}

/** A compound of faces (build123d `Sketch`). */
export class Sketch extends Compound {
    override get dimension(): number {
        return 2;
    }

    override union(...others: (Sketch | Face)[]): Sketch;
    override union(...others: ShapeOperand[]): Shape;
    override union(...others: ShapeOperand[]): Shape {
        return super.union(...others);
    }

    override subtract(...others: ShapeOperand[]): Sketch {
        return as(super.subtract(...others), Sketch);
    }

    override intersect(...others: (Sketch | Face)[]): Sketch;
    override intersect(...others: (ShapeOperand | Axis | Plane)[]): Compound;
    override intersect(...others: (ShapeOperand | Axis | Plane)[]): Compound {
        return super.intersect(...others);
    }

    /** Extrude every face in this sketch, combining the results into a Part. */
    extrude(amount?: number, options: ExtrudeOptions = {}): Part {
        return extrude(this, amount, options);
    }
}

/** A compound of solids (build123d `Part`). */
export class Part extends Compound {
    override get dimension(): number {
        return 3;
    }

    /** Fuse with other shapes; 3D is the highest dimension, so the result stays a Part. */
    override union(...others: ShapeOperand[]): Part {
        return as(super.union(...others), Part);
    }

    override subtract(...others: ShapeOperand[]): Part {
        return as(super.subtract(...others), Part);
    }

    override intersect(...others: (Part | Solid)[]): Part;
    override intersect(...others: (ShapeOperand | Axis | Plane)[]): Compound;
    override intersect(...others: (ShapeOperand | Axis | Plane)[]): Compound {
        return super.intersect(...others);
    }
}

registerCompositeFactory(1, pieces => new Curve(pieces));
registerCompositeFactory(2, pieces => new Sketch(pieces));
registerCompositeFactory(3, pieces => new Part(pieces));
