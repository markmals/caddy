import { construct } from "@roonieone/occt-native";

import type { Location } from "../geometry/location.ts";
import type { Vector } from "../geometry/vector.ts";
import type { ExtrudeOptions } from "../operations/solids.ts";
import type { LocationAtOptions } from "./mixin1d.ts";
import type { Shape, ShapeOperand, SubShapeOptions } from "./shape.ts";

import { extrude } from "../operations/solids.ts";
import { Compound } from "./compound.ts";
import { PositionMode } from "./enums.ts";
import { native } from "./kernel.ts";
import { unionCurves } from "./mixin1d.ts";
import { registerCompositeFactory } from "./registry.ts";
import { ShapeList } from "./shape-list.ts";
import { Wire } from "./wire.ts";

/** A compound of edges (build123d `Curve`). */
export class Curve extends Compound {
    override get dimension(): number {
        return 1;
    }

    /** build123d's `+` for curves: edges join into a wire where they connect. */
    override union(...others: ShapeOperand[]): Shape {
        return unionCurves(this, others);
    }

    /** Point at `position` along the curve's edges joined into one wire (`@`). */
    positionAt(position: number, mode: PositionMode = PositionMode.Parameter): Vector {
        return new Wire(this.edges()).positionAt(position, mode);
    }

    /** Tangent at `position` along the curve's edges joined into one wire (`%`). */
    tangentAt(position = 0.5, mode: PositionMode = PositionMode.Parameter): Vector {
        return new Wire(this.edges()).tangentAt(position, mode);
    }

    /** Frame at `position` along the curve's edges joined into one wire (`^`). */
    locationAt(
        position: number,
        mode: PositionMode = PositionMode.Parameter,
        options: LocationAtOptions = {},
    ): Location {
        return new Wire(this.edges()).locationAt(position, mode, options);
    }

    /**
     * The wires the curve's edges connect into (build123d `Curve.wires`, which combines the edges
     * the selector keeps).
     */
    override wires(options: SubShapeOptions = {}): ShapeList<Wire> {
        let edges = Array.from(this.edges(options), edge => edge.wrapped);
        let wires = native("Wire assembly", () => construct.connectEdgesToWires(edges));
        return new ShapeList(wires.map(wrapped => new Wire(wrapped)));
    }
}

/** A compound of faces (build123d `Sketch`). */
export class Sketch extends Compound {
    override get dimension(): number {
        return 2;
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
}

registerCompositeFactory(1, pieces => new Curve(pieces));
registerCompositeFactory(2, pieces => new Sketch(pieces));
registerCompositeFactory(3, pieces => new Part(pieces));
