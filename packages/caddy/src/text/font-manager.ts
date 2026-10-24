/**
 * The font registry behind every text operation (build123d `FontManager`).
 *
 * OCCT's `Font_FontMgr` is a process-wide singleton that knows which font files FreeType can
 * open; `StdPrs_BRepFont` only ever resolves fonts by name through it. Fonts therefore have to
 * be registered before they can be rendered, which is what this class does — including the
 * single-stroke font Caddy bundles (as build123d does) so that `font: "singleline"` resolves
 * everywhere.
 *
 * Font files are read here rather than by OCCT because OCCT's own naming rules fold "Book" into
 * "Regular" and otherwise disagree with the family/subfamily names a font declares; build123d
 * reads the `name` table with fontTools for the same reason, and the names a font ends up
 * registered under are part of its behaviour.
 */

import { text } from "@roonieone/occt-native";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import type { FontStyle } from "./enums.ts";

import { FontError } from "../errors.ts";
import { native } from "../topology/kernel.ts";
import { FontStyle as Style } from "./enums.ts";
import { readSfnt, SfntError } from "./sfnt.ts";

/** A registered font: its name, and the styles it has font files for. */
export interface FontInfo {
    readonly name: string;
    readonly styles: readonly FontStyle[];
}

/** Where the registry serves one style of a font from (OCCT `Font_SystemFont`). */
export interface SystemFont {
    readonly name: string;
    readonly path: string;
    /** Face index inside the font file, as OCCT stores it (`index | variation << 16`). */
    readonly faceId: number;
    /** Glyphs are open single-line contours rather than closed outlines. */
    readonly singleStroke: boolean;
}

/** How to add fonts to the registry. */
export interface RegisterFontOptions {
    /** Replace an existing entry for the same name and style. */
    readonly override?: boolean | undefined;
    /** Mark the faces as single-stroke, so text renders as open contours. */
    readonly singleStroke?: boolean | undefined;
}

/** One font face found in a font file: what to register it as. */
interface FontFace {
    readonly name: string;
    readonly style: FontStyle;
    readonly faceId: number;
}

/** build123d's `FONT_ASPECT`: the `Font_FontAspect` each style selects. */
const ASPECT: Record<FontStyle, text.FontAspect> = {
    [Style.Regular]: text.FontAspect.Regular,
    [Style.Bold]: text.FontAspect.Bold,
    [Style.Italic]: text.FontAspect.Italic,
    [Style.BoldItalic]: text.FontAspect.BoldItalic,
};

/**
 * The styles `availableFonts` reports, in build123d's order — which is the order its
 * `font_aspects` dict is written in, not the `Font_FontAspect` order.
 */
const REPORTED_STYLES: readonly FontStyle[] = [
    Style.Regular,
    Style.Bold,
    Style.BoldItalic,
    Style.Italic,
];

/** Subfamily labels that name a style rather than a face: OCCT treats "Oblique" as italic. */
const STYLE_LABELS = ["Regular", "Bold", "Italic", "Oblique"] as const;

/** Font file extensions `registerFolder` picks up. */
const FONT_EXTENSIONS: Record<string, true> = { ".ttf": true, ".otf": true, ".ttc": true };

/** The single-stroke font Caddy bundles, as build123d bundles it. */
const BUNDLED_FONT = "fonts/reliefsingleline/ReliefSingleLineCAD-Regular.ttf";
const BUNDLED_FONT_NAME = "Relief SingleLine CAD";
/** build123d's canary for "the registry is already set up". */
const SINGLE_LINE_ALIAS = "singleline";

/** Absolute path of a bundled data file, from the source tree or from the published bundle. */
function bundledPath(relative: string): string {
    let candidates = [`../../data/${relative}`, `../data/${relative}`].map(candidate =>
        fileURLToPath(new URL(candidate, import.meta.url)),
    );
    let found = candidates.find(candidate => existsSync(candidate));
    if (found === undefined) {
        throw new FontError(
            `@roonieone/caddy is missing its bundled data file ${relative}. Looked in:\n` +
                candidates.map(candidate => `  ${candidate}`).join("\n"),
        );
    }
    return found;
}

/** The font faces `bytes` declares, named as build123d names them. */
function fontFaces(bytes: Uint8Array): FontFace[] {
    return readSfnt(bytes).flatMap(font => {
        let named = (nameId: number) => font.names.find(record => record.nameId === nameId)?.text;
        // Name ID 16 is the typographic family, which splits "Arial Black" style subfamilies off
        // the family name; it wins over name ID 1 where a font declares both.
        let family = named(16) ?? named(1) ?? "";
        let variations = font.variationNameIds;
        let subfamilies =
            variations === undefined
                ? [named(2) ?? ""]
                : font.names
                      .filter(record => variations.includes(record.nameId))
                      .map(record => record.text);
        return subfamilies.map((subfamily, index) => face(family, subfamily, index));
    });
}

/**
 * How one subfamily registers: the style its labels name, and the name left once those labels
 * are removed. "DejaVu Sans" + "Bold Oblique" is bold italic; "Arial" + "Black" is a regular
 * face named "Arial Black", because no FontStyle describes it.
 */
function face(family: string, subfamily: string, index: number): FontFace {
    let labels = subfamily.split(/\s+/).filter(label => label !== "");
    let named = new Set(STYLE_LABELS.filter(label => labels.includes(label)));
    let style: FontStyle;
    if (named.has("Bold")) {
        style = named.has("Italic") || named.has("Oblique") ? Style.BoldItalic : Style.Bold;
        labels = labels.filter(label => !["Bold", "Italic", "Oblique"].includes(label));
    } else if (named.has("Italic") || named.has("Oblique")) {
        style = Style.Italic;
        labels = labels.filter(label => !["Italic", "Oblique"].includes(label));
    } else {
        style = Style.Regular;
        if (named.has("Regular")) labels = [];
    }
    let name = [family, labels.join(" ")]
        .filter(part => part !== "")
        .join(" ")
        .trim();
    // OCCT reads a named instance of a variable font as `faceIndex | instanceIndex << 16`.
    return { name, style, faceId: index << 16 };
}

/** Every font file directly inside `path`. */
function fontFilesIn(path: string): string[] {
    let entries: string[];
    try {
        entries = readdirSync(normalize(path));
    } catch {
        return [];
    }
    return entries
        .filter(entry => FONT_EXTENSIONS[extname(entry).toLowerCase()] === true)
        .map(entry => join(normalize(path), entry));
}

/** `path` and every directory below it. */
function directoriesBelow(path: string): string[] {
    let found: string[] = [];
    let pending = [path];
    while (pending.length > 0) {
        let current = pending.pop();
        if (current === undefined) break;
        found.push(current);
        let entries: string[];
        try {
            entries = readdirSync(current);
        } catch {
            continue;
        }
        for (let entry of entries) {
            let child = join(current, entry);
            try {
                if (statSync(child).isDirectory()) pending.push(child);
            } catch {
                continue;
            }
        }
    }
    return found;
}

/** The folders each platform keeps its fonts in (build123d's `register_system_fonts`). */
function systemFontFolders(): string[] {
    if (process.platform === "win32") {
        let user = process.env["USERNAME"] ?? "";
        return ["C:/Windows/Fonts", `C:/Users/${user}/AppData/Local/Microsoft/Windows/Fonts`];
    }
    if (process.platform === "darwin") {
        return [
            "/System/Library/Fonts",
            "/System/Library/Fonts/Supplemental",
            "/Library/Fonts",
            "/Library/Fonts/Supplemental",
            join(homedir(), "Library/Fonts"),
        ];
    }
    return [
        "/system/fonts",
        "/usr/share/fonts",
        "/usr/local/share/fonts",
        join(homedir(), ".fonts"),
        join(homedir(), ".local/share/fonts"),
    ].flatMap(path => (existsSync(path) ? directoriesBelow(path) : []));
}

/** Wraps OCCT's `Font_FontMgr`: the fonts text can be rendered with. */
export class FontManager {
    /**
     * Sets the process-wide registry up once: the fonts Caddy bundles are registered and the
     * `singleline` alias — build123d's canary for an initialised registry — is added. On Windows
     * OCCT skips the per-user font folder, so the system fonts are re-read there.
     */
    constructor() {
        if (process.platform === "linux") {
            // OCCT finds fonts through fontconfig, which needs its configuration pointed out
            // when the process did not inherit it (containers, minimal images).
            process.env["FONTCONFIG_FILE"] ??= "/etc/fonts/fonts.conf";
            process.env["FONTCONFIG_PATH"] ??= "/etc/fonts/";
        }
        if (native("Font alias lookup", () => text.fontAliases()).includes(SINGLE_LINE_ALIAS)) {
            return;
        }
        if (process.platform === "win32") this.registerSystemFonts();
        this.registerFont(bundledPath(BUNDLED_FONT), { singleStroke: true });
        native("Font alias registration", () =>
            text.addFontAlias(SINGLE_LINE_ALIAS, BUNDLED_FONT_NAME),
        );
    }

    /** Every registered font by name, with the styles it has font files for. */
    availableFonts(): FontInfo[] {
        let fonts = native("Font enumeration", () => text.registeredFonts()).map(font => ({
            name: font.name,
            styles: REPORTED_STYLES.filter(style => font[styleKey(style)]),
        }));
        return fonts.sort((left, right) =>
            left.name < right.name ? -1 : +(left.name > right.name),
        );
    }

    /** Whether FreeType can open `path` as a font file. */
    checkFont(path: string): boolean {
        return native("Font file check", () => text.checkFontFile(path));
    }

    /** The registered font `name` (or alias) resolves to for `style`. */
    findFont(name: string, style: FontStyle = Style.Regular): SystemFont {
        let found = native("Font lookup", () => text.findFont(name, ASPECT[style]));
        if (found === undefined) {
            throw new FontError(`no font is registered for ${JSON.stringify(name)}`);
        }
        return found;
    }

    /**
     * Registers every font face in the file at `path`, returning their names. A file FreeType or
     * the `name` table parser cannot read registers nothing, as build123d skips unreadable fonts.
     */
    registerFont(path: string, options: RegisterFontOptions = {}): string[] {
        let faces: FontFace[];
        try {
            faces = fontFaces(readFileSync(path));
        } catch (error) {
            if (error instanceof SfntError) return [];
            throw error;
        }
        for (let { name, style, faceId } of faces) {
            native("Font registration", () =>
                text.registerFont({
                    name,
                    aspect: ASPECT[style],
                    path,
                    faceId,
                    singleStroke: options.singleStroke ?? false,
                    override: options.override ?? false,
                }),
            );
        }
        return faces.map(({ name }) => name);
    }

    /** Registers every font file directly inside `path`, returning the names registered once. */
    registerFolder(path: string, options: RegisterFontOptions = {}): string[] {
        let names = fontFilesIn(path).flatMap(file => this.registerFont(file, options));
        return Array.from(new Set(names));
    }

    /** Registers the fonts installed on this machine, folder by folder. */
    registerSystemFonts(): void {
        for (let folder of systemFontFolders()) {
            if (existsSync(folder)) this.registerFolder(folder);
        }
    }
}

/** The styles of every registered font (build123d `available_fonts`). */
export function availableFonts(): FontInfo[] {
    return new FontManager().availableFonts();
}

/** Which flag of a registry entry reports `style`. */
function styleKey(style: FontStyle): "regular" | "bold" | "italic" | "boldItalic" {
    switch (style) {
        case Style.Regular:
            return "regular";
        case Style.Bold:
            return "bold";
        case Style.Italic:
            return "italic";
        case Style.BoldItalic:
            return "boldItalic";
    }
}
