/**
 * Text rendered to geometry (build123d `Compound.make_text` and `Compound.resolve_font`).
 *
 * OCCT lays the string out and turns every glyph into faces; everything after that is
 * build123d's: aligning the result by its bounding box, placing the glyphs one by one along a
 * path, and outlining single-stroke fonts into faces of a given width.
 */

import { text } from "@roonieone/occt-native";

import type { Align2DLike } from "../geometry/enums.ts";
import type { Edge } from "../topology/edge.ts";
import type { Shape } from "../topology/shape.ts";
import type { Wire } from "../topology/wire.ts";
import type { FontStyle, TextAlignPair } from "./enums.ts";
import type { SystemFont } from "./font-manager.ts";

import { GeometryError, InvalidShapeError } from "../errors.ts";
import { Axis } from "../geometry/axis.ts";
import { Vector } from "../geometry/vector.ts";
import { alignPair } from "../sketch/base.ts";
import { Compound } from "../topology/compound.ts";
import { Face } from "../topology/face.ts";
import { native } from "../topology/kernel.ts";
import { Wire as WireClass } from "../topology/wire.ts";
import { FontStyle as Style, TextAlign } from "./enums.ts";
import { FontManager } from "./font-manager.ts";

/** Which font to render with (build123d `Compound.resolve_font`). */
export interface ResolveFontOptions {
    /** Font name, as `availableFonts` reports it. Defaults to `"Arial"`. */
    readonly font?: string | undefined;
    /** Path of a font file to use instead of a registered font. */
    readonly fontPath?: string | undefined;
    /** Which file of the font family to render with. Defaults to {@link FontStyle.Regular}. */
    readonly fontStyle?: FontStyle | undefined;
}

/** Everything `makeText` can be asked for beyond the string and its size. */
export interface MakeTextOptions extends ResolveFontOptions {
    /**
     * Where the anchor sits inside the string: horizontal (`Left`, `Center`, `Right`) then
     * vertical (`Bottom`, `Center`, `Top`, `TopFirstLine`). Defaults to centred on both.
     */
    readonly textAlign?: TextAlignPair | undefined;
    /** Where the rendered bounds sit; `null` or absent leaves the text where OCCT put it. */
    readonly align?: Align2DLike | undefined;
    /** Where along `textPath` the text starts, as a fraction of its length. */
    readonly positionOnPath?: number | undefined;
    /** A line the glyphs are placed along, one by one. */
    readonly textPath?: Edge | Wire | undefined;
    /** Stroke width to outline a single-stroke font with; 0 leaves it as open contours. */
    readonly singleLineWidth?: number | undefined;
}

/** The `Font_FontAspect` each style selects (build123d's `FONT_ASPECT`). */
const ASPECT: Record<FontStyle, text.FontAspect> = {
    [Style.Regular]: text.FontAspect.Regular,
    [Style.Bold]: text.FontAspect.Bold,
    [Style.Italic]: text.FontAspect.Italic,
    [Style.BoldItalic]: text.FontAspect.BoldItalic,
};

const HORIZONTAL: Partial<Record<TextAlign, text.HorizontalTextAlign>> = {
    [TextAlign.Left]: text.HorizontalTextAlign.Left,
    [TextAlign.Center]: text.HorizontalTextAlign.Center,
    [TextAlign.Right]: text.HorizontalTextAlign.Right,
};

const VERTICAL: Partial<Record<TextAlign, text.VerticalTextAlign>> = {
    [TextAlign.Bottom]: text.VerticalTextAlign.Bottom,
    [TextAlign.Center]: text.VerticalTextAlign.Center,
    [TextAlign.Top]: text.VerticalTextAlign.Top,
    [TextAlign.TopFirstLine]: text.VerticalTextAlign.TopFirstLine,
};

/**
 * The registry entry a font request resolves to. A `fontPath` is registered first (overriding
 * any font of the same name), and the requested name is kept only when that file declares it.
 */
export function resolveFont(options: ResolveFontOptions = {}): SystemFont {
    let requested = options.font ?? "Arial";
    let manager = new FontManager();
    let selected = requested;
    if (options.fontPath !== undefined && manager.checkFont(options.fontPath)) {
        let faces = manager.registerFont(options.fontPath, { override: true });
        selected = faces.includes(requested) ? requested : (faces[0] ?? requested);
    }
    return manager.findFont(selected, options.fontStyle ?? Style.Regular);
}

/** `txt` rendered at `fontSize`, as a compound of one shape per glyph. */
export function makeText(txt: string, fontSize: number, options: MakeTextOptions = {}): Compound {
    let [horizontal, vertical] = options.textAlign ?? [TextAlign.Center, TextAlign.Center];
    let horizontalAlign = HORIZONTAL[horizontal];
    let verticalAlign = VERTICAL[vertical];
    if (horizontalAlign === undefined) {
        throw new GeometryError(
            `Horizontal TextAlign must be LEFT, CENTER, or RIGHT. Got ${horizontal}`,
        );
    }
    if (verticalAlign === undefined) {
        throw new GeometryError(
            `Vertical TextAlign must be BOTTOM, CENTER, TOP, or TOPFIRSTLINE. Got ${vertical}`,
        );
    }

    let font = resolveFont(options);
    let rendered = native("Text rendering", () =>
        text.textShape(txt, {
            font: font.name,
            size: fontSize,
            aspect: ASPECT[options.fontStyle ?? Style.Regular],
            horizontalAlign,
            verticalAlign,
            // Single-stroke glyphs are open contours, which OCCT can only emit as separate edges.
            compositeCurveMode: !font.singleStroke,
        }),
    );

    let flat = new Compound(rendered);
    // build123d spreads a single Align over the two axes of the text plane, leaving Z alone —
    // which matters because a rendered glyph is a hair thick.
    flat = flat.translate(flat.boundingBox.toAlignOffset(alignPair(options.align ?? null)));

    let path = options.textPath;
    if (path !== undefined) {
        let placed = flat.topLevelShapes.map(glyph =>
            positionGlyph(glyph, path, options.positionOnPath ?? 0),
        );
        flat = new Compound(placed);
    }

    let singleLineWidth = options.singleLineWidth ?? 0;
    if (font.singleStroke && singleLineWidth > 0) {
        // offset2D takes a radius, while the width is the overall stroke height.
        let outlines = flat.edges.map(edge => outlineFace(edge.offset2D(singleLineWidth / 2)));
        let fused = new Compound([]).union(...outlines);
        flat = fused instanceof Compound ? fused : new Compound([fused]);
        if (flat.topLevelShapes.some(face => !face.isValid)) {
            throw new InvalidShapeError(
                `single_line_width (${singleLineWidth}) is too large for the text and produces ` +
                    "invalid faces. Try a smaller width",
            );
        }
    }
    return flat;
}

/**
 * One glyph moved onto `path`, upright relative to it. The glyph's own bottom centre decides how
 * far along the path it sits, so the string keeps its spacing as it bends.
 */
function positionGlyph(glyph: Shape, path: Edge | Wire, position: number): Shape {
    let bounds = glyph.boundingBox;
    let bottomCenter = new Vector((bounds.min.x + bounds.max.x) / 2, 0, 0);
    let along = position + bottomCenter.x / path.length;
    let angle = new Vector(1, 0, 0).getSignedAngle(path.tangentAt(along));
    let at = path.positionAt(along);
    return glyph.translate(at.sub(bottomCenter)).rotate(new Axis(at, [0, 0, 1]), -angle);
}

/** The face an outlined stroke bounds, normal up (build123d's `_make_face` inside `make_text`). */
function outlineFace(outline: Edge | Wire): Face {
    let [wire] = WireClass.combine(outline.edges);
    if (wire === undefined) {
        throw new InvalidShapeError("An outlined stroke produced no closed wire");
    }
    let face = new Face(wire);
    return face.normalAt().z < 0 ? face.reverseNormal() : face;
}
