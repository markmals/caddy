/** Which file of a font family to render with (build123d `FontStyle`). */
export const FontStyle = {
    Regular: "REGULAR",
    Bold: "BOLD",
    Italic: "ITALIC",
    BoldItalic: "BOLDITALIC",
} as const;

export type FontStyle = (typeof FontStyle)[keyof typeof FontStyle];

/**
 * Where the anchor sits inside a rendered string (build123d `TextAlign`). `Left`, `Center` and
 * `Right` are the horizontal values; `Bottom`, `Center`, `Top` and `TopFirstLine` the vertical
 * ones, where `Top` is the line above the first and `TopFirstLine` the first line itself.
 */
export const TextAlign = {
    Bottom: "BOTTOM",
    Center: "CENTER",
    Left: "LEFT",
    Right: "RIGHT",
    Top: "TOP",
    TopFirstLine: "TOPFIRSTLINE",
} as const;

export type TextAlign = (typeof TextAlign)[keyof typeof TextAlign];

/** Horizontal then vertical alignment of the text inside its bounds. */
export type TextAlignPair = readonly [TextAlign, TextAlign];
