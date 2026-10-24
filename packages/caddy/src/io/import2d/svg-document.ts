/**
 * Walks an SVG document and yields the shapes build123d would import.
 *
 * Coordinates come out in the viewport frame: the view box transform is folded into every
 * element's matrix, which is also how `svgelements` reports them. Groups and `use` references are
 * transparent, `defs` and friends are not rendered, and anything else is walked through as if it
 * were not there — all of that matching what build123d sees.
 */

import type { SvgColor } from "./svg-color.ts";
import type { LengthContext } from "./svg-length.ts";
import type { SvgGeometry } from "./svg-shapes.ts";
import type { Matrix2D } from "./svg-transform.ts";
import type { SvgValues } from "./svg-values.ts";
import type { XmlElement } from "./xml.ts";

import { ImportError } from "../../errors.ts";
import { parseColor } from "./svg-color.ts";
import { parseLength, parseNumberList } from "./svg-length.ts";
import { SHAPE_TAGS, shapeGeometry } from "./svg-shapes.ts";
import { IDENTITY, multiply, parseTransform } from "./svg-transform.ts";
import { collectStyles, elementValues, INITIAL_VALUES } from "./svg-values.ts";
import { parseXml } from "./xml.ts";

export interface ViewBox {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface SvgShapeElement {
    readonly geometry: SvgGeometry;
    /** Maps the geometry's own coordinates into the viewport. */
    readonly matrix: Matrix2D;
    /** Whether the element has a fill, which decides between a face and a wire. */
    readonly filled: boolean;
    readonly label: string;
    readonly fill: SvgColor | undefined;
    readonly stroke: SvgColor | undefined;
}

export interface SvgDocument {
    /** The document's own box in viewport units, as build123d aligns the import by. */
    readonly viewBox: ViewBox;
    readonly shapes: readonly SvgShapeElement[];
}

export interface SvgParseOptions {
    /** Keep elements hidden by `display` or `visibility`. */
    readonly ignoreVisibility: boolean;
    /** Attribute to read each shape's label from. */
    readonly labelBy: string;
}

/** build123d parses at 25.4 pixels per inch, which makes one millimetre one user unit. */
const PIXELS_PER_INCH = 25.4;

/** Without a view box, `svgelements` falls back to a thousand user units each way. */
const FALLBACK_VIEWPORT = 1000;

/** Containers whose contents are definitions rather than drawing. */
const NOT_RENDERED: Readonly<Record<string, true>> = {
    defs: true,
    clipPath: true,
    pattern: true,
    style: true,
    text: true,
    tspan: true,
    title: true,
    desc: true,
};

export function parseSvgDocument(text: string, options: SvgParseOptions): SvgDocument {
    let root = parseXml(text);
    if (root.name !== "svg") {
        throw new ImportError(`expected an <svg> document, got <${root.name}>`);
    }
    let box = viewBoxOf(root);
    let { width, height } = documentSize(root, box);
    let lengths: LengthContext = {
        ppi: PIXELS_PER_INCH,
        width: box?.width ?? width,
        height: box?.height ?? height,
    };
    let own = parseTransform(root.attributes.get("transform") ?? "", lengths);
    let matrix =
        box === undefined ? own : multiply(own, viewportTransform(root, box, width, height));

    let shapes: SvgShapeElement[] = [];
    let context = { styles: collectStyles(root), lengths, options, elements: elementsById(root) };
    for (let child of root.children) {
        walk(child, { values: rootValues(root, context.styles), matrix }, context, shapes);
    }
    return { viewBox: documentViewBox(box, width, height), shapes };
}

interface WalkContext {
    readonly styles: ReadonlyMap<string, string>;
    readonly lengths: LengthContext;
    readonly options: SvgParseOptions;
    readonly elements: ReadonlyMap<string, XmlElement>;
}

interface Inherited {
    readonly values: SvgValues;
    readonly matrix: Matrix2D;
}

function rootValues(root: XmlElement, styles: ReadonlyMap<string, string>): SvgValues {
    return elementValues(INITIAL_VALUES, root, styles).values;
}

function walk(
    element: XmlElement,
    inherited: Inherited,
    context: WalkContext,
    shapes: SvgShapeElement[],
): void {
    if (NOT_RENDERED[element.name] === true) return;
    let { values, own } = elementValues(inherited.values, element, context.styles);
    if (!context.options.ignoreVisibility && values.get("display")?.toLowerCase() === "none") {
        return;
    }
    let matrix = multiply(
        inherited.matrix,
        parseTransform(own.get("transform") ?? "", context.lengths),
    );
    if (SHAPE_TAGS[element.name] === true) {
        appendShape(element, values, matrix, context, shapes);
        return;
    }
    if (element.name === "use") {
        walkReference(element, values, matrix, context, shapes);
        return;
    }
    for (let child of element.children) {
        walk(child, { values, matrix }, context, shapes);
    }
}

function appendShape(
    element: XmlElement,
    values: SvgValues,
    matrix: Matrix2D,
    context: WalkContext,
    shapes: SvgShapeElement[],
): void {
    if (!context.options.ignoreVisibility && isHidden(values)) return;
    let geometry = shapeGeometry(element.name, values, context.lengths);
    if (geometry === undefined) return;
    let fill = parseColor(values.get("fill"));
    shapes.push({
        geometry,
        matrix,
        filled: fill !== undefined,
        label: values.get(context.options.labelBy) ?? "",
        fill,
        stroke: parseColor(values.get("stroke")),
    });
}

/** A `use` draws the element it points at, shifted by its own `x` and `y`. */
function walkReference(
    element: XmlElement,
    values: SvgValues,
    matrix: Matrix2D,
    context: WalkContext,
    shapes: SvgShapeElement[],
): void {
    let reference =
        element.attributes.get("href") ??
        element.attributes.get("{http://www.w3.org/1999/xlink}href");
    let target =
        reference?.startsWith("#") === true ? context.elements.get(reference.slice(1)) : undefined;
    if (target === undefined) return;
    let shifted = multiply(matrix, {
        ...IDENTITY,
        e: parseLength(element.attributes.get("x"), context.lengths.width, context.lengths) ?? 0,
        f: parseLength(element.attributes.get("y"), context.lengths.height, context.lengths) ?? 0,
    });
    let passed = new Map(values);
    for (let attribute of ["x", "y", "width", "height"]) passed.delete(attribute);
    walk(target, { values: passed, matrix: shifted }, context, shapes);
}

function isHidden(values: SvgValues): boolean {
    let visibility = values.get("visibility");
    return visibility === "hidden" || visibility === "collapse";
}

function elementsById(root: XmlElement): ReadonlyMap<string, XmlElement> {
    let byId = new Map<string, XmlElement>();
    let visit = (element: XmlElement): void => {
        let id = element.attributes.get("id");
        if (id !== undefined && !byId.has(id)) byId.set(id, element);
        for (let child of element.children) visit(child);
    };
    visit(root);
    return byId;
}

function viewBoxOf(root: XmlElement): ViewBox | undefined {
    let attribute = root.attributes.get("viewBox");
    if (attribute === undefined) return undefined;
    let [x, y, width, height] = parseNumberList(attribute);
    if (x === undefined || y === undefined || width === undefined || height === undefined) {
        return undefined;
    }
    return { x, y, width, height };
}

/** `svgelements` derives a missing dimension from the view box's aspect ratio. */
function documentSize(
    root: XmlElement,
    box: ViewBox | undefined,
): { width: number; height: number } {
    let lengths: LengthContext = {
        ppi: PIXELS_PER_INCH,
        width: box?.width ?? FALLBACK_VIEWPORT,
        height: box?.height ?? FALLBACK_VIEWPORT,
    };
    let width = parseLength(root.attributes.get("width"), lengths.width, lengths);
    let height = parseLength(root.attributes.get("height"), lengths.height, lengths);
    if (width !== undefined && height !== undefined) return { width, height };
    if (box === undefined) return { width: width ?? 0, height: height ?? 0 };
    if (width !== undefined) return { width, height: (box.height * width) / box.width };
    if (height !== undefined) return { width: (box.width * height) / box.height, height };
    return { width: box.width, height: box.height };
}

/** The document box build123d aligns by: the view box origin scaled into viewport units. */
function documentViewBox(box: ViewBox | undefined, width: number, height: number): ViewBox {
    if (box === undefined) return { x: 0, y: 0, width, height };
    return {
        x: (box.x * width) / box.width,
        y: (box.y * height) / box.height,
        width,
        height,
    };
}

/** SVG 2 section 8.2: fit the view box into the viewport, honouring `preserveAspectRatio`. */
function viewportTransform(
    root: XmlElement,
    box: ViewBox,
    width: number,
    height: number,
): Matrix2D {
    let aspect = (root.attributes.get("preserveAspectRatio") ?? "xMidYMid meet").split(/\s+/);
    let align = (aspect[0] ?? "xMidYMid").toLowerCase();
    let meetOrSlice = aspect[1] ?? "meet";
    let scaleX = width / box.width;
    let scaleY = height / box.height;
    if (align !== "none") {
        let uniform = meetOrSlice === "slice" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
        scaleX = uniform;
        scaleY = uniform;
    }
    let translateX = -box.x * scaleX;
    let translateY = -box.y * scaleY;
    if (align.includes("xmid")) translateX += (width - box.width * scaleX) / 2;
    if (align.includes("xmax")) translateX += width - box.width * scaleX;
    if (align.includes("ymid")) translateY += (height - box.height * scaleY) / 2;
    if (align.includes("ymax")) translateY += height - box.height * scaleY;
    return { a: scaleX, b: 0, c: 0, d: scaleY, e: translateX, f: translateY };
}
