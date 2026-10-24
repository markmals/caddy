import type { Shape as NativeShape } from "@roonieone/occt-native";

import { booleans, primitives } from "@roonieone/occt-native";

import { frameOf } from "../curves/frame.ts";
import { GeometryError } from "../errors.ts";
import { Plane } from "../geometry/index.ts";
import { BasePartObject } from "./base.ts";

/** build123d's `Plane(origin=(0, 0, 0), z_dir=(0, 0, -1))`: X points along -X, so seams face -X. */
const DOWN = new Plane({ origin: [0, 0, 0], zDir: [0, 0, -1] });

function requiredDepth(depth: number | undefined): number {
    if (depth === undefined) throw new GeometryError("No depth provided outside a part builder");
    if (!Number.isFinite(depth) || depth <= 0)
        throw new GeometryError("Hole depth must be positive");
    return depth;
}

function holeCylinder(radius: number, depth: number): NativeShape {
    return primitives.makeCylinder(radius, depth, frameOf(DOWN));
}

export class Hole extends BasePartObject {
    readonly radius: number;
    readonly holeDepth: number;

    constructor(radius: number, depth?: number) {
        let doubledDepth = requiredDepth(depth) * 2;
        super(() => holeCylinder(radius, doubledDepth));
        this.radius = radius;
        this.holeDepth = doubledDepth;
    }
}

export class CounterBoreHole extends BasePartObject {
    readonly radius: number;
    readonly counterBoreRadius: number;
    readonly counterBoreDepth: number;
    readonly holeDepth: number;

    constructor(
        radius: number,
        counterBoreRadius: number,
        counterBoreDepth: number,
        depth?: number,
    ) {
        let holeDepth = requiredDepth(depth);
        super(
            () => {
                let counterBore = primitives.makeCylinder(
                    counterBoreRadius,
                    counterBoreDepth + holeDepth,
                    frameOf(new Plane({ origin: [0, 0, -counterBoreDepth] })),
                );
                return booleans.fuse([holeCylinder(radius, holeDepth)], [counterBore]);
            },
            { align: null },
        );
        this.radius = radius;
        this.counterBoreRadius = counterBoreRadius;
        this.counterBoreDepth = counterBoreDepth;
        this.holeDepth = holeDepth;
    }
}

export class CounterSinkHole extends BasePartObject {
    readonly radius: number;
    readonly counterSinkRadius: number;
    readonly counterSinkAngle: number;
    readonly holeDepth: number;

    constructor(radius: number, counterSinkRadius: number, depth?: number, counterSinkAngle = 82) {
        let holeDepth = requiredDepth(depth);
        if (
            !Number.isFinite(counterSinkAngle) ||
            counterSinkAngle <= 0 ||
            counterSinkAngle >= 180
        ) {
            throw new GeometryError("Countersink angle must be between 0 and 180 degrees");
        }
        super(
            () => {
                let coneHeight = counterSinkRadius / Math.tan((counterSinkAngle * Math.PI) / 360);
                let cone = primitives.makeCone(counterSinkRadius, 0, coneHeight, frameOf(DOWN));
                let cylinder = primitives.makeCylinder(counterSinkRadius, holeDepth);
                return booleans.fuse([holeCylinder(radius, holeDepth)], [cone, cylinder]);
            },
            { align: null },
        );
        this.radius = radius;
        this.counterSinkRadius = counterSinkRadius;
        this.counterSinkAngle = counterSinkAngle;
        this.holeDepth = holeDepth;
    }
}
