import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { TEST_FONT_PATH } from "../../../../reference/build123d/oracle.ts";
import { Compound, FontManager, Text, TextAlign } from "../../src/index.ts";

describe("text rejects invalid input", () => {
    it("needs a horizontal value for the first text alignment", () => {
        expect(() =>
            Compound.makeText("x", 10, {
                fontPath: TEST_FONT_PATH,
                textAlign: [TextAlign.Bottom, TextAlign.Center],
            }),
        ).toThrow(/Horizontal TextAlign must be LEFT, CENTER, or RIGHT/);
    });

    it("needs a vertical value for the second text alignment", () => {
        expect(() =>
            Compound.makeText("x", 10, {
                fontPath: TEST_FONT_PATH,
                textAlign: [TextAlign.Center, TextAlign.Left],
            }),
        ).toThrow(/Vertical TextAlign must be BOTTOM, CENTER, TOP, or TOPFIRSTLINE/);
    });

    it("needs a positive stroke width for a Text object", () => {
        expect(() => new Text("x", 10, { fontPath: TEST_FONT_PATH, singleLineWidth: 0 })).toThrow(
            /must be greater than 0/,
        );
    });

    it("falls back to a registered font for an unknown name, as OCCT does", () => {
        let manager = new FontManager();
        manager.registerFont(TEST_FONT_PATH, { override: true });
        // Font_FontMgr::FindFont returns any available font rather than nothing, which is what
        // build123d hands to StdPrs_BRepFont too.
        expect(manager.findFont("No Such Font At All").path).not.toBe("");
    });

    it("registers nothing from a file that is not a font", () => {
        let notAFont = join(import.meta.dirname, "errors.test.ts");
        expect(new FontManager().registerFont(notAFont)).toEqual([]);
    });

    it("registers nothing from a folder without fonts", () => {
        expect(new FontManager().registerFolder(import.meta.dirname)).toEqual([]);
    });
});
