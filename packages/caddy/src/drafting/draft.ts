/** Settings shared by the dimension objects, and how they write measurements out (build123d
 * `Draft`). */

import type { VectorLike } from "../geometry/vector.ts";
import type { FontStyle } from "../text/enums.ts";

import { makeLine } from "../curves/edge-makers.ts";
import { makeWirePolygon } from "../curves/wire-makers.ts";
import { GeometryError } from "../errors.ts";
import { Location } from "../geometry/location.ts";
import { formatFixed, roundTo } from "../geometry/rounding.ts";
import { IN, MM } from "../geometry/units.ts";
import { Vector } from "../geometry/vector.ts";
import { Unit } from "../io/types.ts";
import { FontStyle as Style } from "../text/enums.ts";
import { Edge } from "../topology/edge.ts";
import { GeomType } from "../topology/enums.ts";
import { Vertex } from "../topology/vertex.ts";
import { Wire } from "../topology/wire.ts";
import { HeadType, NumberDisplay } from "./enums.ts";

/** A point in 3D space, as the drafting objects accept one. */
export type PointLike = VectorLike | Vertex;

/** Anything the drafting objects read a path from: a curve, or the points of a polyline. */
export type PathDescriptor = Edge | Wire | readonly PointLike[];

/** A single `±` value, or separate `+` and `-` values. */
export type DimensionTolerance = number | readonly [number, number];

/** How the unit is spelled after a measurement, by whether the drawing is metric. */
const UNIT_LABEL = { metric: "mm", imperial: '"' } as const;

/** The units build123d counts as metric; measurements in any other unit print as inches. */
const METRIC_UNITS: readonly Unit[] = [
    Unit.Millimeter,
    Unit.Centimeter,
    Unit.Meter,
    Unit.Micrometer,
];

export interface DraftOptions {
    /** Size of the text in dimension lines and callouts. Defaults to 5. */
    readonly fontSize?: number;
    /** Name of the font the labels are rendered with. Defaults to `"Arial"`. */
    readonly font?: string;
    /**
     * Path of a font file to render the labels with instead of a system font — a Caddy
     * addition, since build123d's `Draft` can only name a font.
     */
    readonly fontPath?: string;
    /** Weight and slant of the label text. Defaults to {@link FontStyle.Regular}. */
    readonly fontStyle?: FontStyle;
    /** Shape of the arrow heads. Defaults to {@link HeadType.Curved}. */
    readonly headType?: HeadType;
    /** Tip to tail length of an arrow head. Defaults to 3. */
    readonly arrowLength?: number;
    /** Thickness of every line drawn. Defaults to 0.5. */
    readonly lineWidth?: number;
    /** Clearance kept between a label and the arrows beside it. Defaults to 2. */
    readonly padAroundText?: number;
    /** Unit measurements are written in. Defaults to {@link Unit.Millimeter}. */
    readonly unit?: Unit;
    /** Decimals or fractions of an inch. Defaults to {@link NumberDisplay.Decimal}. */
    readonly numberDisplay?: NumberDisplay;
    /** Write the unit after the number. Defaults to `true`. */
    readonly displayUnits?: boolean;
    /** Decimal places a number is written with. Defaults to 2. */
    readonly decimalPrecision?: number;
    /** Largest fraction denominator, which must be a power of two. Defaults to 64. */
    readonly fractionalPrecision?: number;
    /** Gap left between the measured object and the start of an extension line. Defaults to 2. */
    readonly extensionGap?: number;
}

/** Options of {@link Draft#numberWithUnits}. */
export interface NumberWithUnitsOptions {
    /** A tolerance written after the measurement; suppresses the unit unless overridden. */
    readonly tolerance?: DimensionTolerance | undefined;
    /** Write the unit after the number, overriding the {@link Draft} setting. */
    readonly displayUnits?: boolean | undefined;
}

/** What {@link Draft#labelFor} writes instead of the measured length. */
export interface LabelOptions {
    /** Text replacing the measurement. */
    readonly label?: string | undefined;
    /** Write the angle the circular path subtends rather than its length. */
    readonly labelAngle?: boolean | undefined;
    /** A tolerance appended to the measurement. */
    readonly tolerance?: DimensionTolerance | undefined;
}

/**
 * The drawing settings {@link DimensionLine}, {@link ExtensionLine} and the arrows they contain
 * share: text, line and arrow sizes, and how a measurement is written out (build123d `Draft`).
 */
export class Draft {
    readonly fontSize: number;
    readonly font: string;
    readonly fontPath: string | undefined;
    readonly fontStyle: FontStyle;
    readonly headType: HeadType;
    readonly arrowLength: number;
    readonly lineWidth: number;
    readonly padAroundText: number;
    readonly unit: Unit;
    readonly numberDisplay: NumberDisplay;
    readonly displayUnits: boolean;
    readonly decimalPrecision: number;
    readonly fractionalPrecision: number;
    readonly extensionGap: number;

    constructor(options: DraftOptions = {}) {
        this.fontSize = options.fontSize ?? 5;
        this.font = options.font ?? "Arial";
        this.fontPath = options.fontPath;
        this.fontStyle = options.fontStyle ?? Style.Regular;
        this.headType = options.headType ?? HeadType.Curved;
        this.arrowLength = options.arrowLength ?? 3;
        this.lineWidth = options.lineWidth ?? 0.5;
        this.padAroundText = options.padAroundText ?? 2;
        this.unit = options.unit ?? Unit.Millimeter;
        this.numberDisplay = options.numberDisplay ?? NumberDisplay.Decimal;
        this.displayUnits = options.displayUnits ?? true;
        this.decimalPrecision = options.decimalPrecision ?? 2;
        this.fractionalPrecision = options.fractionalPrecision ?? 64;
        this.extensionGap = options.extensionGap ?? 2;

        if (!Number.isInteger(Math.log2(this.fractionalPrecision))) {
            throw new GeometryError(
                `fractionalPrecision values must be a factor of 2 not ${this.fractionalPrecision}`,
            );
        }
    }

    /** Whether measurements are written in millimetres rather than inches. */
    get isMetric(): boolean {
        return METRIC_UNITS.includes(this.unit);
    }

    /**
     * `value` — a length in millimetres — written as a measurement: converted to the drawing
     * unit, rounded, and suffixed with the unit and any tolerance (build123d
     * `Draft._number_with_units`).
     *
     * Every metric unit prints as millimetres and in decimal, as build123d does: only the
     * metric/imperial split changes the conversion.
     */
    numberWithUnits(value: number, options: NumberWithUnitsOptions = {}): string {
        let tolerance = options.tolerance;
        let showUnits =
            options.displayUnits ?? (tolerance === undefined ? this.displayUnits : false);
        let unitText = showUnits ? UNIT_LABEL[this.isMetric ? "metric" : "imperial"] : "";
        let toleranceText = "";
        if (typeof tolerance === "number") {
            toleranceText = ` ±${this.numberWithUnits(tolerance)}`;
        } else if (tolerance !== undefined) {
            let plus = this.numberWithUnits(tolerance[0], { displayUnits: false });
            toleranceText = ` +${plus} -${this.numberWithUnits(tolerance[1])}`;
        }

        if (this.isMetric || this.numberDisplay === NumberDisplay.Decimal) {
            let measurement = this.roundToText(value / (this.isMetric ? MM : IN));
            return `${measurement}${unitText}${toleranceText}`;
        }
        let inches = value / IN;
        let whole = Math.floor(inches);
        let [numerator, denominator] = simplifyFraction(
            roundTo((inches - whole) * this.fractionalPrecision, 0),
            this.fractionalPrecision,
        );
        let fraction = `${numerator}/${denominator}`;
        return whole === 0
            ? `${fraction}${unitText}${toleranceText}`
            : `${whole} ${fraction}${unitText}${toleranceText}`;
    }

    /**
     * `value` rounded to {@link Draft#decimalPrecision} places; a precision of zero or less drops
     * the decimal point entirely (build123d `Draft._round_to_str`).
     */
    roundToText(value: number): string {
        let text = formatFixed(value, this.decimalPrecision);
        // Without decimals build123d goes through `int()`, which has no signed zero.
        return this.decimalPrecision > 0 ? text : text.replace(/^-(0*)$/, "$1");
    }

    /**
     * The text written against a dimension: the given `label`, the angle the path subtends, or
     * the measured length (build123d `Draft._label_to_str`).
     */
    labelFor(path: Edge | Wire, options: LabelOptions = {}): string {
        if (options.label !== undefined) {
            return options.label;
        }
        if (options.labelAngle === true) {
            let arc = path.edges().filterBy(GeomType.Circle)[0];
            if (arc === undefined) {
                throw new GeometryError(
                    "labelAngle requested but the path is not part of a circle",
                );
            }
            return `${this.roundToText((360 * path.length) / (2 * Math.PI * arc.radius))}°`;
        }
        return this.numberWithUnits(path.length, { tolerance: options.tolerance });
    }
}

/** The lowest terms of `numerator / denominator`. */
function simplifyFraction(numerator: number, denominator: number): [number, number] {
    let divisor = greatestCommonDivisor(Math.abs(numerator), Math.abs(denominator));
    return [numerator / divisor, denominator / divisor];
}

function greatestCommonDivisor(first: number, second: number): number {
    let [larger, smaller] = [first, second];
    while (smaller !== 0) {
        [larger, smaller] = [smaller, larger % smaller];
    }
    return larger === 0 ? 1 : larger;
}

/** The curve a {@link PathDescriptor} describes (build123d `Draft._process_path`). */
export function processPath(path: PathDescriptor): Edge | Wire {
    if (path instanceof Edge || path instanceof Wire) {
        return path;
    }
    let points = path.map(point => Vector.from(point instanceof Vertex ? point.toArray() : point));
    return points.length === 2
        ? makeLine(points[0]!, points[1]!)
        : makeWirePolygon(points, { close: false });
}

/**
 * Where an object placed along a path on Plane.XY sits: at `uValue`, turned to follow the path
 * and, when `flip` is set, turned to face the other way (build123d `Draft._sketch_location`).
 */
export function sketchLocation(path: Edge | Wire, uValue: number, flip = false): Location {
    let angle = path.tangentAngleAt(uValue) + (flip ? 180 : 0);
    return Location.fromAxisAngle(path.positionAt(uValue), [0, 0, 1], angle);
}
