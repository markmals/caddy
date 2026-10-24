import { primitives } from "@roonieone/occt-native";

import type { PartPlacement } from "./base.ts";

import { DEG2RAD } from "../geometry/index.ts";
import { BasePartObject } from "./base.ts";

export class Box extends BasePartObject {
    /**
     * build123d's `Box.length`, renamed because every compound already reports its child count as
     * `length` (build123d spells that `len(compound)`, so it has no clash).
     */
    readonly boxLength: number;
    readonly width: number;
    readonly boxHeight: number;

    constructor(length: number, width: number, height: number, options: PartPlacement = {}) {
        super(() => primitives.makeBox(length, width, height), options);
        this.boxLength = length;
        this.width = width;
        this.boxHeight = height;
    }
}

export class Cylinder extends BasePartObject {
    readonly radius: number;
    readonly cylinderHeight: number;
    readonly arcSize: number;

    constructor(
        radius: number,
        height: number,
        options: PartPlacement & { readonly arcSize?: number } = {},
    ) {
        let arcSize = options.arcSize ?? 360;
        super(() => primitives.makeCylinder(radius, height, undefined, arcSize * DEG2RAD), options);
        this.radius = radius;
        this.cylinderHeight = height;
        this.arcSize = arcSize;
    }
}

export class Cone extends BasePartObject {
    readonly bottomRadius: number;
    readonly topRadius: number;
    readonly coneHeight: number;
    readonly arcSize: number;

    constructor(
        bottomRadius: number,
        topRadius: number,
        height: number,
        options: PartPlacement & { readonly arcSize?: number } = {},
    ) {
        let arcSize = options.arcSize ?? 360;
        super(
            () =>
                primitives.makeCone(bottomRadius, topRadius, height, undefined, arcSize * DEG2RAD),
            options,
        );
        this.bottomRadius = bottomRadius;
        this.topRadius = topRadius;
        this.coneHeight = height;
        this.arcSize = arcSize;
    }
}

export class Sphere extends BasePartObject {
    readonly radius: number;
    readonly arcSize1: number;
    readonly arcSize2: number;
    readonly arcSize3: number;

    constructor(
        radius: number,
        options: PartPlacement & {
            /** Lower latitude bound in degrees. */
            readonly arcSize1?: number;
            /** Upper latitude bound in degrees. */
            readonly arcSize2?: number;
            /** Longitude sweep in degrees. */
            readonly arcSize3?: number;
        } = {},
    ) {
        let { arcSize1 = -90, arcSize2 = 90, arcSize3 = 360 } = options;
        super(
            () =>
                primitives.makeSphere(
                    radius,
                    undefined,
                    arcSize1 * DEG2RAD,
                    arcSize2 * DEG2RAD,
                    arcSize3 * DEG2RAD,
                ),
            options,
        );
        this.radius = radius;
        this.arcSize1 = arcSize1;
        this.arcSize2 = arcSize2;
        this.arcSize3 = arcSize3;
    }
}

export class Torus extends BasePartObject {
    readonly majorRadius: number;
    readonly minorRadius: number;
    readonly minorStartAngle: number;
    readonly minorEndAngle: number;
    readonly majorAngle: number;

    constructor(
        majorRadius: number,
        minorRadius: number,
        options: PartPlacement & {
            readonly minorStartAngle?: number;
            readonly minorEndAngle?: number;
            readonly majorAngle?: number;
        } = {},
    ) {
        let { minorStartAngle = 0, minorEndAngle = 360, majorAngle = 360 } = options;
        super(
            () =>
                primitives.makeTorus(
                    majorRadius,
                    minorRadius,
                    undefined,
                    minorStartAngle * DEG2RAD,
                    minorEndAngle * DEG2RAD,
                    majorAngle * DEG2RAD,
                ),
            options,
        );
        this.majorRadius = majorRadius;
        this.minorRadius = minorRadius;
        this.minorStartAngle = minorStartAngle;
        this.minorEndAngle = minorEndAngle;
        this.majorAngle = majorAngle;
    }
}

export class Wedge extends BasePartObject {
    readonly xsize: number;
    readonly ysize: number;
    readonly zsize: number;

    constructor(
        xsize: number,
        ysize: number,
        zsize: number,
        xmin: number,
        zmin: number,
        xmax: number,
        zmax: number,
        options: PartPlacement = {},
    ) {
        super(() => primitives.makeWedge(xsize, ysize, zsize, { xmin, zmin, xmax, zmax }), options);
        this.xsize = xsize;
        this.ysize = ysize;
        this.zsize = zsize;
    }
}
