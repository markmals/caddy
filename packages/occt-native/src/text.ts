// Fonts and text rendered to BREP geometry (OCCT `Font_FontMgr` and `StdPrs_BRepFont`).
//
// The font registry is a process-wide singleton: a font registered here stays registered for
// every later call on the same thread.

import type { Shape } from "./types.ts";

import { addon } from "./addon.ts";

/** OCCT Font_FontAspect: which file of a font family to open. */
export const FontAspect = { Regular: 0, Bold: 1, Italic: 2, BoldItalic: 3 } as const;
export type FontAspect = (typeof FontAspect)[keyof typeof FontAspect];

/** OCCT Graphic3d_HorizontalTextAlignment. */
export const HorizontalTextAlign = { Left: 0, Center: 1, Right: 2 } as const;
export type HorizontalTextAlign = (typeof HorizontalTextAlign)[keyof typeof HorizontalTextAlign];

/** OCCT Graphic3d_VerticalTextAlignment. */
export const VerticalTextAlign = { Bottom: 0, Center: 1, Top: 2, TopFirstLine: 3 } as const;
export type VerticalTextAlign = (typeof VerticalTextAlign)[keyof typeof VerticalTextAlign];

/** A font in the registry and the aspects it has font files for. */
export interface RegisteredFont {
    readonly name: string;
    readonly regular: boolean;
    readonly bold: boolean;
    readonly italic: boolean;
    readonly boldItalic: boolean;
    /** Glyphs are open single-line contours rather than closed outlines. */
    readonly singleStroke: boolean;
}

/** Where the registry serves one aspect of a font from. */
export interface ResolvedFont {
    readonly name: string;
    readonly path: string;
    /** Face index inside the font file, as OCCT stores it (`index | variation << 16`). */
    readonly faceId: number;
    readonly singleStroke: boolean;
}

/** One font face to add to the registry. */
export interface FontRegistration {
    readonly name: string;
    readonly aspect: FontAspect;
    readonly path: string;
    readonly faceId?: number | undefined;
    readonly singleStroke?: boolean | undefined;
    /** Replace an existing entry for the same name and aspect. */
    readonly override?: boolean | undefined;
}

/** How to render a string: the registered font, its size in model units, and the alignment. */
export interface TextOptions {
    readonly font: string;
    readonly size: number;
    readonly aspect?: FontAspect | undefined;
    readonly horizontalAlign?: HorizontalTextAlign | undefined;
    readonly verticalAlign?: VerticalTextAlign | undefined;
    /** False keeps every glyph segment a separate edge, which single-stroke fonts need. */
    readonly compositeCurveMode?: boolean | undefined;
}

interface TextAddon {
    fontRegisteredFonts(): RegisteredFont[];
    fontAliases(): string[];
    fontAddAlias(alias: string, fontName: string): boolean;
    fontCheckFile(path: string): boolean;
    fontRegister(
        name: string,
        aspect: number,
        path: string,
        faceId: number,
        singleStroke: boolean,
        override: boolean,
    ): boolean;
    fontFind(name: string, aspect: number): ResolvedFont | null;
    textShape(
        text: string,
        fontName: string,
        aspect: number,
        size: number,
        horizontalAlign: number,
        verticalAlign: number,
        compositeCurveMode: boolean,
    ): Shape;
}

function native(): TextAddon {
    return addon<TextAddon>();
}

/** Every font the registry knows (`Font_FontMgr::GetAvailableFonts`). */
export function registeredFonts(): RegisteredFont[] {
    return native().fontRegisteredFonts();
}

/** Font names that have an alias registered (`Font_FontMgr::GetAllAliases`). */
export function fontAliases(): string[] {
    return native().fontAliases();
}

/** Registers `alias` as another name for `fontName`; false when the alias already existed. */
export function addFontAlias(alias: string, fontName: string): boolean {
    return native().fontAddAlias(alias, fontName);
}

/** Whether FreeType can open `path` as a font file. */
export function checkFontFile(path: string): boolean {
    return native().fontCheckFile(path);
}

/** Adds one font face to the registry; false when an existing entry kept its own path. */
export function registerFont(font: FontRegistration): boolean {
    return native().fontRegister(
        font.name,
        font.aspect,
        font.path,
        font.faceId ?? 0,
        font.singleStroke ?? false,
        font.override ?? false,
    );
}

/** Resolves a font name or alias plus aspect to a registry entry. */
export function findFont(
    name: string,
    aspect: FontAspect = FontAspect.Regular,
): ResolvedFont | undefined {
    return native().fontFind(name, aspect) ?? undefined;
}

/** Renders `text` as a compound of glyph shapes, aligned about the origin. */
export function textShape(text: string, options: TextOptions): Shape {
    return native().textShape(
        text,
        options.font,
        options.aspect ?? FontAspect.Regular,
        options.size,
        options.horizontalAlign ?? HorizontalTextAlign.Left,
        options.verticalAlign ?? VerticalTextAlign.Bottom,
        options.compositeCurveMode ?? true,
    );
}
