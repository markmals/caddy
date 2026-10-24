/** Sketch object: text (build123d `Text`). */

import type { Align2DLike } from "../geometry/enums.ts";
import type { Edge } from "../topology/edge.ts";
import type { Wire } from "../topology/wire.ts";
import type { FontStyle, TextAlignPair } from "./enums.ts";
import type { ResolveFontOptions } from "./make-text.ts";

import { GeometryError } from "../errors.ts";
import { BaseSketchObject } from "../sketch/base-object.ts";
import { placedFaces } from "../sketch/base.ts";
import { FontStyle as Style, TextAlign } from "./enums.ts";
import { makeText, resolveFont } from "./make-text.ts";

/** Everything a {@link Text} can be asked for beyond the string and its size. */
export interface TextOptions extends ResolveFontOptions {
    /**
     * Where the anchor sits inside the string: horizontal (`Left`, `Center`, `Right`) then
     * vertical (`Bottom`, `Center`, `Top`, `TopFirstLine`). Defaults to centred on both.
     */
    readonly textAlign?: TextAlignPair | undefined;
    /** Where the rendered bounds sit; `null` or absent leaves the text where OCCT put it. */
    readonly align?: Align2DLike | undefined;
    /** A line the glyphs are placed along, one by one. */
    readonly path?: Edge | Wire | undefined;
    /** Where along `path` the text starts, as a fraction of its length. */
    readonly positionOnPath?: number | undefined;
    /** Stroke width a single-stroke font is outlined with. Defaults to 4% of the font size. */
    readonly singleLineWidth?: number | undefined;
    /** Degrees counter-clockwise about the sketch plane's origin. */
    readonly rotation?: number | undefined;
}

/**
 * Text as a sketch: one face per glyph contour, placed as `textAlign` and `align` ask and
 * optionally bent along a path.
 *
 * Fonts installed on the system are addressed by name and {@link FontStyle}; a subfamily no
 * FontStyle describes (Arial Black) is part of the name. A font file can be used directly with
 * `fontPath`, and `font`/`fontPath` report what the request resolved to.
 */
export class Text extends BaseSketchObject {
    readonly txt: string;
    readonly fontSize: number;
    /** The name the request resolved to, which is not always the name asked for. */
    readonly font: string;
    /** The file the resolved font is served from. */
    readonly fontPath: string;
    readonly fontStyle: FontStyle;
    readonly textAlign: TextAlignPair;
    readonly align: Align2DLike | undefined;
    readonly textPath: Edge | Wire | undefined;
    readonly positionOnPath: number;
    readonly singleLineWidth: number;
    readonly rotation: number;

    constructor(txt: string, fontSize: number, options: TextOptions = {}) {
        // A single-stroke font only becomes faces once its strokes are outlined, so unlike
        // `makeText` the sketch object always outlines them.
        let singleLineWidth = options.singleLineWidth ?? 0.04 * fontSize;
        if (singleLineWidth <= 0) {
            throw new GeometryError(`singleLineWidth (${singleLineWidth}) must be greater than 0`);
        }
        let fontStyle = options.fontStyle ?? Style.Regular;
        let textAlign = options.textAlign ?? [TextAlign.Center, TextAlign.Center];
        let positionOnPath = options.positionOnPath ?? 0;
        let rotation = options.rotation ?? 0;
        let rendered = makeText(txt, fontSize, {
            ...options,
            fontStyle,
            textAlign,
            positionOnPath,
            textPath: options.path,
            singleLineWidth,
        });
        super(placedFaces(rendered, { rotation }));

        let resolved = resolveFont({ ...options, fontStyle });
        this.txt = txt;
        this.fontSize = fontSize;
        this.font = resolved.name;
        this.fontPath = resolved.path;
        this.fontStyle = fontStyle;
        this.textAlign = textAlign;
        this.align = options.align;
        this.textPath = options.path;
        this.positionOnPath = positionOnPath;
        this.singleLineWidth = singleLineWidth;
        this.rotation = rotation;
    }
}
