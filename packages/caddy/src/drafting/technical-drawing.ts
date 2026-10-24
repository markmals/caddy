/** The border, grid and title block of a drawing sheet (build123d `TechnicalDrawing`). */

import type { Align2DLike } from "../geometry/enums.ts";
import type { FontStyle } from "../text/enums.ts";
import type { Edge } from "../topology/edge.ts";
import type { Shape } from "../topology/shape.ts";
import type { Wire } from "../topology/wire.ts";

import { makeLine } from "../curves/edge-makers.ts";
import { makeWirePolygon } from "../curves/wire-makers.ts";
import { GeometryError } from "../errors.ts";
import { Axis } from "../geometry/axis.ts";
import { Align } from "../geometry/enums.ts";
import { Pos } from "../geometry/location.ts";
import { MM } from "../geometry/units.ts";
import { Vector } from "../geometry/vector.ts";
import { PAGE_SIZES, PageSize } from "../io/export2d/enums.ts";
import { BaseSketchObject } from "../sketch/base-object.ts";
import { placedFaces } from "../sketch/base.ts";
import { trace } from "../sketch/operations/trace.ts";
import { makeText } from "../text/make-text.ts";
import { Curve, Sketch } from "../topology/composite.ts";
import { Compound } from "../topology/compound.ts";

/** Clearance between the edge of the page and the drawing frame. */
const MARGIN = 5 * MM;

/** The positions along the frame that are corners, and so carry no grid tick. */
const FRAME_CORNERS: ReadonlySet<number> = new Set([0, 6, 10, 16]);

/** Where the four numbered grid rows sit, as a fraction of the frame height. */
const ROW_CENTERS = [-3 / 8, -1 / 8, 1 / 8, 3 / 8] as const;

/** Where the six lettered grid columns sit, as a fraction of the frame width. */
const COLUMN_CENTERS = [-5 / 12, -3 / 12, -1 / 12, 1 / 12, 3 / 12, 5 / 12] as const;

/** Column letters, running right to left as drawing conventions have them. */
const COLUMN_LABELS = ["F", "E", "D", "C", "B", "A"] as const;

/** Text in the title block hangs from the left of its column and is centred on its line. */
const BLOCK_ALIGN: Align2DLike = [Align.Min, Align.Center];

export interface TechnicalDrawingOptions {
    /** Name in the title block. Defaults to `"build123d"`. */
    readonly designedBy?: string;
    /** Date in the title block as an ISO `YYYY-MM-DD` string. Defaults to today. */
    readonly designDate?: string;
    /** Paper size. Defaults to {@link PageSize.A4}. */
    readonly pageSize?: PageSize;
    readonly title?: string;
    readonly subTitle?: string;
    readonly drawingNumber?: string;
    /** Sheet number; the field is left blank when it is not given. */
    readonly sheetNumber?: number;
    /** Written as `1:value`. Defaults to 1. */
    readonly drawingScale?: number;
    /** Size of the title text; the frame and grid are laid out from it. Defaults to 10. */
    readonly nominalTextSize?: number;
    readonly lineWidth?: number;
    /**
     * Font the labels are rendered with. Defaults to `"Arial"`, the fallback build123d's
     * `Compound.make_text` applies; build123d offers no way to change it.
     */
    readonly font?: string;
    /** Path of a font file to render with instead of a system font — a Caddy addition. */
    readonly fontPath?: string;
    /** Weight and slant of the label text — a Caddy addition. */
    readonly fontStyle?: FontStyle;
}

/**
 * A drawing sheet: a frame with a lettered and numbered grid around it, and a title block in its
 * bottom right corner (build123d `TechnicalDrawing`).
 *
 * The frame is as wide as the page less its margins and grid gutters and always three units wide
 * to two high; the page outline itself is not drawn.
 */
export class TechnicalDrawing extends BaseSketchObject {
    constructor(options: TechnicalDrawingOptions = {}) {
        super(placedFaces(technicalDrawing(options), { align: null }));
    }
}

function technicalDrawing(options: TechnicalDrawingOptions): Compound {
    let textSize = options.nominalTextSize ?? 10;
    let lineWidth = options.lineWidth ?? 0.5;
    let page = PAGE_SIZES[options.pageSize ?? PageSize.A4];
    let write = labelWriter(options);

    let width = page[0] - 2 * MARGIN - 2 * textSize;
    let height = (2 * width) / 3;
    let frameWire = makeWirePolygon([
        [-width / 2, height / 2],
        [width / 2, height / 2],
        [width / 2, -height / 2],
        [-width / 2, -height / 2],
    ]);

    let gridLabels = combine([
        ...ROW_CENTERS.flatMap((center, row) =>
            [-0.5, 0.5].map(side =>
                write(String(row + 1), textSize).moved(
                    new Pos(side * (width + 1.5 * textSize), center * height),
                ),
            ),
        ),
        ...COLUMN_LABELS.flatMap((letter, column) =>
            [-0.5, 0.5].map(side =>
                write(letter, textSize).moved(
                    new Pos(COLUMN_CENTERS[column]! * width, side * (height + 1.5 * textSize)),
                ),
            ),
        ),
    ]);

    let block = titleBlock(frameWire, width);
    let labels = combine(
        blockText(options, textSize, block.columns).map(entry =>
            write(entry.text, entry.size, BLOCK_ALIGN).moved(new Pos(entry.at)),
        ),
    );

    return new Compound([
        trace(frameWire, lineWidth),
        trace(gridTicks(frameWire, textSize), lineWidth),
        gridLabels,
        trace(block.curve.edges, lineWidth),
        labels,
    ]);
}

/** Renders one label as its own sketch, with the drawing's font settings. */
function labelWriter(
    options: TechnicalDrawingOptions,
): (text: string, size: number, align?: Align2DLike) => Sketch {
    let font = {
        font: options.font ?? "Arial",
        ...(options.fontPath === undefined ? {} : { fontPath: options.fontPath }),
        ...(options.fontStyle === undefined ? {} : { fontStyle: options.fontStyle }),
    };
    return (text, size, align) =>
        new Sketch(
            makeText(text, size, { ...font, ...(align === undefined ? {} : { align }) }).wrapped,
        );
}

/** The short strokes marking the grid divisions, pointing out of the frame. */
function gridTicks(frameWire: Wire, textSize: number): Edge[] {
    let ticks: Edge[] = [];
    for (let index = 0; index < 20; index += 1) {
        if (FRAME_CORNERS.has(index)) {
            continue;
        }
        let uValue = index / 20;
        let position = frameWire.positionAt(uValue);
        let outwards = new Vector(textSize, 0).rotate(
            Axis.Z,
            frameWire.tangentAngleAt(uValue) + 90,
        );
        ticks.push(makeLine(position, position.add(outwards)));
    }
    return ticks;
}

/** The lines of the title block, and the three lines its columns of text hang from. */
function titleBlock(frameWire: Wire, width: number): { curve: Shape; columns: [Edge, Edge, Edge] } {
    let origin = frameWire.edges.toSorted(Axis.Y)[0]!.positionAt(0.5);
    let corner = frameWire.edges.toSorted(Axis.X).last!.positionAt(0.75);
    let outline = makeWirePolygon([origin, [origin.x, corner.y], corner], { close: false });

    // Two lines across the block, a third and two thirds of the way up its left side.
    let side = outline.edges.toSorted(Axis.X)[0]!;
    let curve: Shape = new Curve(outline.edges);
    for (let fraction of [1 / 3, 2 / 3]) {
        let from = side.positionAt(fraction);
        curve = curve.union(makeLine(from, [corner.x, from.y]));
    }

    // Two lines down the block, a third and two thirds of the way along its top.
    let top = curve.edges.toSorted(Axis.Y).last!;
    let firstColumn = top.positionAt(1 / 3);
    let secondColumn = top.positionAt(2 / 3);
    curve = curve.union(makeLine(firstColumn, [firstColumn.x, origin.y]));
    let stub = new Vector(secondColumn.x, origin.y);
    curve = curve.union(makeLine(stub, stub.add(new Vector(0, (corner.y - origin.y) / 3))));
    return { curve, columns: textColumns(origin, corner, width) };
}

/** The three lines the title block's text hangs from, a sixth of the frame width apart. */
function textColumns(origin: Vector, corner: Vector, width: number): [Edge, Edge, Edge] {
    let column = (offset: number): Edge =>
        makeLine([origin.x + offset, origin.y], [origin.x + offset, corner.y]);
    return [column(0), column(width / 6), column((2 * width) / 6)];
}

interface BlockLabel {
    readonly text: string;
    readonly size: number;
    readonly at: Vector;
}

/**
 * Every piece of text in the title block: the left column holds who drew it, when and at what
 * scale, the middle the titles and drawing number, and the right the sheet number.
 */
function blockText(
    options: TechnicalDrawingOptions,
    textSize: number,
    columns: readonly [Edge, Edge, Edge],
): BlockLabel[] {
    let [left, middle, right] = columns;
    // The columns are inset from the lines they are measured off.
    let inset = new Vector(textSize / 5, 0);
    let on = (column: Edge, twelfths: number): Vector =>
        column.positionAt(twelfths / 12).add(inset);

    let entries: BlockLabel[] = [
        { text: "DESIGNED BY:", size: textSize / 3, at: on(left, 11) },
        { text: options.designedBy ?? "build123d", size: textSize / 2, at: on(left, 9) },
        { text: "DATE:", size: textSize / 3, at: on(left, 7) },
        { text: options.designDate ?? today(), size: textSize / 2, at: on(left, 5) },
        { text: "SCALE:", size: textSize / 3, at: on(left, 3) },
        { text: `1:${floatText(options.drawingScale ?? 1)}`, size: textSize / 2, at: on(left, 1) },
        { text: options.title ?? "Title", size: textSize, at: on(middle, 10) },
        { text: options.subTitle ?? "Sub Title", size: textSize, at: on(middle, 6) },
        { text: "DRAWING NUMBER:", size: textSize / 3, at: on(middle, 3) },
        { text: options.drawingNumber ?? "B3D-1", size: textSize / 2, at: on(middle, 1) },
        { text: "SHEET:", size: textSize / 3, at: on(right, 3) },
    ];
    if (options.sheetNumber !== undefined) {
        entries.push({ text: String(options.sheetNumber), size: textSize / 2, at: on(right, 1) });
    }
    return entries;
}

/** Today's date as build123d writes it, `YYYY-MM-DD` in local time. */
function today(): string {
    let now = new Date();
    let month = String(now.getMonth() + 1).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${String(now.getDate()).padStart(2, "0")}`;
}

/** The scale as Python's `str(float)` writes it, so a whole number keeps its `.0`. */
function floatText(value: number): string {
    return Number.isInteger(value) ? `${value}.0` : String(value);
}

/** build123d's `Sketch() + ...`: the first shape alone, then fused with each of the rest. */
function combine(pieces: readonly Shape[]): Shape {
    let [first, ...rest] = pieces;
    if (first === undefined) {
        throw new GeometryError("Nothing to combine");
    }
    return rest.reduce<Shape>((combined, piece) => combined.union(piece), first);
}
