/**
 * SVG import (build123d `import_svg`).
 *
 * Filled shapes come back as faces, unfilled ones as wires, each labelled from an attribute of
 * its source element and coloured from its fill or stroke. SVG's y axis points down, so by
 * default the document is mirrored and its view box is aligned to the origin.
 */

import { shapes } from "@roonieone/occt-native";
import { readFile } from "node:fs/promises";

import type { Align2DLike, Align3DLike } from "../../geometry/enums.ts";
import type { SvgColor } from "./svg-color.ts";
import type { SvgShapeElement, ViewBox } from "./svg-document.ts";

import { toAlignOffset } from "../../geometry/bounding-box.ts";
import { Color } from "../../geometry/color.ts";
import { Align } from "../../geometry/enums.ts";
import { Transform } from "../../geometry/transform.ts";
import { Vector } from "../../geometry/vector.ts";
import { Face, ShapeList, Wire } from "../../topology/index.ts";
import { parseSvgDocument } from "./svg-document.ts";
import { wiresFrom } from "./svg-wires.ts";
import { facesFromWires, UnfillableWires } from "./wire-soup.ts";

export interface ImportSvgOptions {
    /** Mirror the document so that its y axis points up; defaults to true. */
    readonly flipY?: boolean;
    /** Where the view box lands; `null` leaves its origin at the origin. Defaults to `Align.Min`. */
    readonly align?: Align2DLike | Align3DLike | null;
    /** Import elements hidden by `display` or `visibility` too; defaults to false. */
    readonly ignoreVisibility?: boolean;
    /** Attribute each shape's label is read from; defaults to `"id"`. */
    readonly labelBy?: string;
}

const INKSCAPE_NAMESPACE = "{http://www.inkscape.org/namespaces/inkscape}";

/** Reads an SVG file path, or a buffer holding one, as faces and wires. */
export async function importSvg(
    source: string | Uint8Array,
    options: ImportSvgOptions = {},
): Promise<ShapeList<Face | Wire>> {
    let text =
        typeof source === "string"
            ? await readFile(source, "utf-8")
            : new TextDecoder().decode(source);
    return importSvgText(text, options);
}

/** The importer itself, for callers that already hold the document's text. */
export function importSvgText(
    text: string,
    options: ImportSvgOptions = {},
): ShapeList<Face | Wire> {
    let flipY = options.flipY ?? true;
    let document = parseSvgDocument(text, {
        ignoreVisibility: options.ignoreVisibility ?? false,
        labelBy: (options.labelBy ?? "id").replace(/^inkscape:(.+)/, `${INKSCAPE_NAMESPACE}$1`),
    });
    let align = options.align === undefined ? Align.Min : options.align;
    let offset = alignOffset(document.viewBox, flipY, align);

    let imported: (Face | Wire)[] = [];
    for (let element of document.shapes) {
        for (let shape of shapesOf(element)) {
            let placed = place(shape, document.viewBox, flipY, offset);
            placed.label = element.label;
            placed.color = colorOf(element, placed instanceof Face);
            imported.push(placed);
        }
    }
    return new ShapeList(imported);
}

/** Filled elements become faces, unless their wires cannot bound one. */
function shapesOf(element: SvgShapeElement): (Face | Wire)[] {
    let wires = wiresFrom(element.geometry, element.matrix);
    if (!element.filled) return wires;
    try {
        return facesFromWires(wires);
    } catch (cause) {
        if (cause instanceof UnfillableWires) return wires;
        throw cause;
    }
}

/**
 * The document frame: the view box origin is translated onto the shapes, the y axis is mirrored,
 * and the mirrored shape is reversed so that faces still point at the viewer.
 */
function place(shape: Face | Wire, box: ViewBox, flipY: boolean, offset: Vector): Face | Wire {
    let placed: Face | Wire = flipY
        ? reversed(
              shape
                  .transformShape(Transform.fromAxisMirror(new Vector(), new Vector(1, 0, 0)))
                  .translate([box.x, -box.y, 0], { transform: true }),
          )
        : shape.translate([box.x, box.y, 0], { transform: true });
    if (offset.x === 0 && offset.y === 0) return placed;
    return placed.translate(offset);
}

function reversed(shape: Face | Wire): Face | Wire {
    let flipped = shapes.reversed(shape.wrapped);
    return shape instanceof Face ? new Face(flipped) : new Wire(flipped);
}

/** build123d aligns by the view box, which the mirror moves below the axis. */
function alignOffset(
    box: ViewBox,
    flipY: boolean,
    align: Align2DLike | Align3DLike | null,
): Vector {
    let origin = new Vector(box.x, flipY ? -box.y - box.height : box.y, 0);
    return toAlignOffset(origin, origin.add(new Vector(box.width, box.height, 0)), align);
}

/** A face takes its fill colour, a wire its stroke, and a missing colour is opaque black. */
function colorOf(element: SvgShapeElement, filled: boolean): Color {
    let fill = channels(element.fill);
    if (filled && fill !== undefined) return fill;
    return channels(element.stroke) ?? new Color(0, 0, 0, 1);
}

function channels(color: SvgColor | undefined): Color | undefined {
    if (color === undefined || color.value === 0) return undefined;
    return new Color(color.red / 255, color.green / 255, color.blue / 255, color.alpha / 255);
}
