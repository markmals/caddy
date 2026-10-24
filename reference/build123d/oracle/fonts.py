"""The font every text fixture renders with.

System fonts differ between machines — macOS has Arial, a Linux CI image usually does not — so
fixtures that pinned a system font would record geometry nobody else can reproduce. Every case
therefore passes `TEST_FONT` as `font_path`, a permissively licensed font file checked into the
repository, and the TypeScript side reads the same file through `TEST_FONT_PATH` in `oracle.ts`.

`TEST_FONT_NAME` is the face name build123d registers that file under: fontTools reads the family
("DejaVu Sans") and subfamily ("Book") from the font's `name` table, and build123d keeps "Book"
because no FontStyle describes it.
"""

from __future__ import annotations

from .registry import REFERENCE_ROOT

FONTS_DIR = REFERENCE_ROOT / "fonts"
TEST_FONT = str(FONTS_DIR / "DejaVuSans.ttf")
TEST_FONT_NAME = "DejaVu Sans Book"

#: The single-stroke font build123d bundles, reached through the alias it registers.
SINGLE_LINE_FONT = "singleline"
