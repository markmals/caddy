// SVG export of 2D shapes (build123d `ExportSVG`).
//
// The document is written in model coordinates: one container group flips y, so the view box
// computed from the shapes' bounding box shows them the right way up.

import { export2d } from "@roonieone/occt-native";
import { writeFile } from "node:fs/promises";

import type { BoundingBox } from "../../geometry/bounding-box.ts";
import type { Edge, Face, Shape, Wire } from "../../topology/index.ts";
import type { LineType } from "./line-types.ts";
import type { PathSegment } from "./segments.ts";

import { ExportError } from "../../errors.ts";
import { Color } from "../../geometry/color.ts";
import { GeomType } from "../../topology/index.ts";
import { native } from "../../topology/kernel.ts";
import { Unit } from "../types.ts";
import { DotLength as DotLengths } from "./enums.ts";
import {
    LINETYPE_DEFS,
    LineType as LineTypes,
    LTYPE_SCALE,
    unitConversionScale,
} from "./line-types.ts";
import { edgeSegments, roundTo } from "./segments.ts";
import { Element, pathData } from "./svg-elements.ts";
import { looseEdges, looseWires } from "./traversal.ts";

/** Units that are both model units and valid SVG units. */
const SVG_UNITS: Readonly<Partial<Record<Unit, string>>> = {
    [Unit.Millimeter]: "mm",
    [Unit.Centimeter]: "cm",
    [Unit.Inch]: "in",
};

const DEFAULT_LINE_WEIGHT = 0.09;
const BLACK = new Color(0, 0, 0, 1);

export interface SVGLayerOptions {
    /** Fill colour; `null` paints no fill, omitting it uses the shape's own colour. */
    readonly fillColor?: Color | null;
    /** Stroke colour; `null` paints no stroke, omitting it uses the shape's own colour. */
    readonly lineColor?: Color | null;
    /** Stroke width in millimetres. */
    readonly lineWeight?: number;
    readonly lineType?: LineType;
}

export interface ExportSVGOptions extends SVGLayerOptions {
    /** Document unit; SVG only understands millimetres, centimetres and inches. */
    readonly unit?: Unit;
    readonly scale?: number;
    readonly margin?: number;
    /** Widen the view box by half the widest stroke so strokes are not clipped. */
    readonly fitToStroke?: boolean;
    /** Decimal places coordinates are rounded to. */
    readonly precision?: number;
    /** Rendered width of a dash pattern's dots, in tenths of an inch (see {@link DotLength}). */
    readonly dotLength?: number;
}

export interface AddShapeOptions {
    readonly layer?: string;
    /** Draw each wire backwards, which flips the fill rule for nested wires. */
    readonly reverseWires?: boolean;
}

interface Layer {
    readonly name: string;
    readonly fillColor: Color | undefined;
    readonly lineColor: Color | undefined;
    /** Whether a shape's own colour overrides the layer's. */
    readonly inheritFill: boolean;
    readonly inheritLine: boolean;
    readonly lineWeight: number;
    readonly lineType: LineType;
    readonly elements: Element[];
}

export class ExportSVG {
    readonly unit: Unit;
    readonly scale: number;
    readonly margin: number;
    readonly fitToStroke: boolean;
    readonly precision: number;
    readonly dotLength: number;
    private readonly layers = new Map<string, Layer>();
    private bounds: BoundingBox | undefined;

    constructor(options: ExportSVGOptions = {}) {
        this.unit = options.unit ?? Unit.Millimeter;
        if (SVG_UNITS[this.unit] === undefined) {
            throw new ExportError(
                `Invalid unit ${this.unit}; SVG supports ${Object.values(SVG_UNITS).join(", ")}`,
            );
        }
        this.scale = options.scale ?? 1;
        this.margin = options.margin ?? 0;
        this.fitToStroke = options.fitToStroke ?? true;
        this.precision = options.precision ?? 6;
        this.dotLength = options.dotLength ?? DotLengths.InkscapeCompat;
        this.addLayer("", options);
    }

    /** Add a named layer with its own colours, stroke width and dash pattern. */
    addLayer(name: string, options: SVGLayerOptions = {}): this {
        if (this.layers.has(name)) {
            throw new ExportError(`Duplicate layer name ${JSON.stringify(name)}`);
        }
        let lineType = options.lineType ?? LineTypes.Continuous;
        if (!Object.hasOwn(LINETYPE_DEFS, lineType)) {
            throw new ExportError(`Unknown line type ${JSON.stringify(lineType)}`);
        }
        let inheritLine = options.lineColor === undefined;
        this.layers.set(name, {
            name,
            fillColor: options.fillColor ?? undefined,
            lineColor: inheritLine ? BLACK : (options.lineColor ?? undefined),
            inheritFill: options.fillColor === undefined,
            inheritLine,
            lineWeight: options.lineWeight ?? DEFAULT_LINE_WEIGHT,
            lineType,
            elements: [],
        });
        return this;
    }

    /** Draw a shape (or several) on `layer`. */
    addShape(shape: Shape | Iterable<Shape>, options: AddShapeOptions = {}): this {
        let name = options.layer ?? "";
        let layer = this.layers.get(name);
        if (layer === undefined) throw new ExportError(`Undefined layer: ${JSON.stringify(name)}`);
        let shapes = isShape(shape) ? [shape] : [...shape];
        for (let single of shapes) {
            this.addSingleShape(single, layer, options.reverseWires ?? false);
        }
        return this;
    }

    /** The SVG document. */
    get text(): string {
        let bounds = this.bounds;
        if (bounds === undefined) throw new ExportError("No shapes to export");
        let strokeMargin = this.fitToStroke
            ? Math.max(...[...this.layers.values()].map(layer => layer.lineWeight)) / 2
            : 0;
        let viewMargin = (this.margin + strokeMargin) / this.scale;
        let viewWidth = roundTo(bounds.size.x + 2 * viewMargin, this.precision);
        let viewHeight = roundTo(bounds.size.y + 2 * viewMargin, this.precision);
        let viewBox = [
            roundTo(bounds.min.x - viewMargin, this.precision),
            roundTo(-bounds.max.y - viewMargin, this.precision),
            viewWidth,
            viewHeight,
        ];
        let suffix = SVG_UNITS[this.unit] ?? "";

        let container = new Element("g", { transform: "scale(1,-1)", "stroke-linecap": "round" });
        for (let layer of this.layers.values()) {
            if (layer.elements.length > 0) container.children.push(this.layerGroup(layer));
        }
        let svg = new Element("svg", {
            width: `${roundTo(viewWidth * this.scale, this.precision)}${suffix}`,
            height: `${roundTo(viewHeight * this.scale, this.precision)}${suffix}`,
            viewBox: viewBox.join(" "),
            version: "1.1",
            xmlns: "http://www.w3.org/2000/svg",
        });
        svg.children.push(container);
        return `<?xml version='1.0' encoding='utf-8'?>\n${svg.render(0)}\n`;
    }

    async write(fileName: string): Promise<void> {
        await writeFile(fileName, this.text, "utf8");
    }

    private addSingleShape(shape: Shape, layer: Layer, reverseWires: boolean): void {
        let box = shape.boundingBox;
        this.bounds = this.bounds === undefined ? box : this.bounds.add(box);
        let color = shape.color;

        for (let face of shape.faces) {
            let drawn = this.faceElement(face, reverseWires);
            if (color !== undefined && layer.inheritFill) setColor(drawn, "fill", color);
            layer.elements.push(drawn);
        }
        for (let wire of looseWires(shape)) {
            let drawn = this.wireElement(wire, reverseWires);
            if (color !== undefined && layer.inheritLine) setColor(drawn, "stroke", color);
            layer.elements.push(drawn);
        }
        for (let edge of looseEdges(shape)) {
            let drawn = this.edgeElement(edge);
            if (color !== undefined && layer.inheritLine) setColor(drawn, "stroke", color);
            layer.elements.push(drawn);
        }
    }

    /** A face with holes becomes one path, so the fill rule can cut the holes out. */
    private faceElement(face: Face, reverseWires: boolean): Element {
        let inner = face.innerWires;
        if (inner.length === 0) return this.wireElement(face.outerWire, reverseWires);
        let segments = this.wireSegments(face.outerWire, reverseWires);
        for (let wire of inner) segments.push(...this.wireSegments(wire, reverseWires));
        return new Element("path", { d: pathData(segments) });
    }

    private wireElement(wire: Wire, reverse: boolean): Element {
        let edges = wire.edges;
        let [only] = edges;
        if (edges.length === 1 && only !== undefined) return this.edgeElement(only);
        return new Element("path", { d: pathData(this.wireSegments(wire, reverse)) });
    }

    private wireSegments(wire: Wire, reverse: boolean): PathSegment[] {
        let edges = [...wire.edges];
        if (reverse) edges.reverse();
        return edges.flatMap(edge => edgeSegments(edge, reverse, this.precision));
    }

    private edgeElement(edge: Edge): Element {
        if (edge.geomType === GeomType.Line) {
            let [segment] = edgeSegments(edge, false, this.precision);
            if (segment?.kind === "line") {
                return new Element("line", {
                    x1: String(segment.start[0]),
                    y1: String(segment.start[1]),
                    x2: String(segment.end[0]),
                    y2: String(segment.end[1]),
                });
            }
        }
        if (edge.geomType === GeomType.Circle && edge.isClosed) {
            let conic = native("Conic geometry", () => export2d.edgeConic(edge.wrapped));
            if (conic !== undefined) {
                return new Element("circle", {
                    cx: String(roundTo(conic.center[0], this.precision)),
                    cy: String(roundTo(conic.center[1], this.precision)),
                    r: String(conic.majorRadius),
                });
            }
        }
        return new Element("path", { d: pathData(edgeSegments(edge, false, this.precision)) });
    }

    private layerGroup(layer: Layer): Element {
        let attributes: Record<string, string> = {};
        let [fill, fillOpacity] = colorAttributes(layer.fillColor);
        attributes["fill"] = fill;
        if (fillOpacity !== undefined) attributes["fill-opacity"] = fillOpacity;
        let [stroke, strokeOpacity] = colorAttributes(layer.lineColor);
        attributes["stroke"] = stroke;
        if (strokeOpacity !== undefined) attributes["stroke-opacity"] = strokeOpacity;
        let weightScale = unitConversionScale(Unit.Millimeter, this.unit) / this.scale;
        attributes["stroke-width"] = String(layer.lineWeight * weightScale);
        if (layer.name !== "") attributes["id"] = layer.name;
        if (layer.lineType !== LineTypes.Continuous) {
            attributes["stroke-dasharray"] = this.strokeDashArray(layer).join(" ");
        }
        let group = new Element("g", attributes);
        group.children.push(...layer.elements);
        return group;
    }

    /** The dash pattern in document units, with zero-length dashes widened into dots. */
    private strokeDashArray(layer: Layer): string[] {
        let pattern = [...(LINETYPE_DEFS[layer.lineType]?.pattern ?? [])];
        for (let index = 0; index < pattern.length; index += 1) {
            if (pattern[index] !== 0) continue;
            pattern[index] = this.dotLength;
            let before = (index - 1 + pattern.length) % pattern.length;
            let after = (index + 1) % pattern.length;
            pattern[before] = (pattern[before] as number) - this.dotLength / 2;
            pattern[after] = (pattern[after] as number) - this.dotLength / 2;
        }
        let scale = ((LTYPE_SCALE[this.unit] ?? 1) * layer.lineWeight) / this.scale;
        return pattern.slice(1).map(run => String(roundTo(scale * Math.abs(run), this.precision)));
    }
}

function isShape(value: Shape | Iterable<Shape>): value is Shape {
    return "wrapped" in value;
}

function colorAttributes(color: Color | undefined): [string, string | undefined] {
    if (color === undefined) return ["none", undefined];
    let channel = (value: number): number => Math.trunc(value * 255);
    let rgb = `rgb(${channel(color.red)},${channel(color.green)},${channel(color.blue)})`;
    return [rgb, color.alpha < 1 ? String(roundTo(color.alpha, 3)) : undefined];
}

function setColor(target: Element, attribute: string, color: Color): void {
    let [value, opacity] = colorAttributes(color);
    target.attributes[attribute] = value;
    if (opacity !== undefined) target.attributes[`${attribute}-opacity`] = opacity;
}
