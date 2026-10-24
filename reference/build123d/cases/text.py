"""Oracle cases for text: font resolution, glyph rendering, alignment and path placement.

Every rendering case passes `font_path=TEST_FONT`, the font file checked into the repository, so
the recorded geometry does not depend on which fonts a machine happens to have installed. The
only exceptions are the cases that use `font="singleline"`, which resolves through the alias
build123d (and Caddy) registers for the single-stroke font both bundle.

`shape_metrics` pins down the face, wire, edge and vertex counts, the bounding box and the area;
the sorted edge lengths pin down the glyph outlines themselves, which area alone would not.
"""

from __future__ import annotations

import os
from typing import Any

from build123d import (
    Align,
    Compound,
    Edge,
    FontStyle,
    Text,
    TextAlign,
)
from build123d.text import FontManager, available_fonts

from oracle import SINGLE_LINE_FONT, TEST_FONT, case, shape_metrics


def text_shape(value: Any) -> dict[str, Any]:
    """Metrics plus the edge lengths that fix the rendered glyph outlines."""
    return {
        "shape": shape_metrics(value),
        "area": float(value.area),
        "edge_lengths": sorted(float(edge.length) for edge in value.edges()),
    }


def rendered(txt: str, size: float, **kwargs: Any) -> dict[str, Any]:
    """`Compound.make_text` with the repository font, unless a case names another font."""
    if "font" not in kwargs:
        kwargs["font_path"] = TEST_FONT
    return text_shape(Compound.make_text(txt, size, **kwargs))


# ---------------------------------------------------------------------------
# Font resolution
# ---------------------------------------------------------------------------


@case("font/resolve-path")
def font_resolve_path():
    """A font file wins over the requested name: the file's own face name is what resolves."""
    name, path, system_font = Compound.resolve_font("Arial", TEST_FONT)
    return {
        "name": name,
        "file": os.path.basename(path),
        "single_stroke": bool(system_font.IsSingleStrokeFont()),
    }


@case("font/resolve-alias")
def font_resolve_alias():
    """The `singleline` alias resolves to the single-stroke font both libraries bundle."""
    name, path, system_font = Compound.resolve_font(SINGLE_LINE_FONT)
    return {
        "name": name,
        "file": os.path.basename(path),
        "single_stroke": bool(system_font.IsSingleStrokeFont()),
    }


@case("font/register")
def font_register():
    """Registering a font file reports the face names read from the file's `name` table."""
    manager = FontManager()
    return {"faces": manager.register_font(TEST_FONT, True, False)}


@case("font/available")
def font_available():
    """The registered test font and the bundled single-stroke font, with their styles."""
    manager = FontManager()
    registered = manager.register_font(TEST_FONT, True, False)
    wanted = set(registered) | {"Relief SingleLine CAD"}
    fonts = [font for font in available_fonts() if font.name in wanted]
    return {
        "fonts": [
            {"name": font.name, "styles": [style.name for style in font.styles]}
            for font in fonts
        ]
    }


@case("font/check")
def font_check():
    """`check_font` accepts a font file and rejects anything else."""
    manager = FontManager()
    return {
        "font": manager.check_font(TEST_FONT) is not None,
        "not_a_font": manager.check_font(os.path.join(os.path.dirname(TEST_FONT), "missing.ttf"))
        is not None,
    }


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------


@case("make-text/default")
def make_text_default():
    return rendered("Caddy", 10)


@case("make-text/size")
def make_text_size():
    return rendered("Caddy", 25)


@case("make-text/multiline")
def make_text_multiline():
    return rendered("Hi\nthere", 10)


@case("make-text/style-bold")
def make_text_style_bold():
    """No bold file is registered, so OCCT falls back to the regular face."""
    return rendered("Caddy", 10, font_style=FontStyle.BOLD)


@case("make-text/style-italic")
def make_text_style_italic():
    """No italic file is registered, so OCCT synthesises the slant."""
    return rendered("Caddy", 10, font_style=FontStyle.ITALIC)


@case("make-text/style-bold-italic")
def make_text_style_bold_italic():
    return rendered("Caddy", 10, font_style=FontStyle.BOLDITALIC)


# ---------------------------------------------------------------------------
# Alignment
# ---------------------------------------------------------------------------


@case("make-text/text-align-left-bottom")
def make_text_text_align_left_bottom():
    return rendered("Caddy", 10, text_align=(TextAlign.LEFT, TextAlign.BOTTOM))


@case("make-text/text-align-right-top")
def make_text_text_align_right_top():
    return rendered("Caddy", 10, text_align=(TextAlign.RIGHT, TextAlign.TOP))


@case("make-text/text-align-top-first-line")
def make_text_text_align_top_first_line():
    return rendered("Hi\nthere", 10, text_align=(TextAlign.CENTER, TextAlign.TOPFIRSTLINE))


@case("make-text/align-min")
def make_text_align_min():
    return rendered("Caddy", 10, align=(Align.MIN, Align.MIN))


@case("make-text/align-max")
def make_text_align_max():
    return rendered("Caddy", 10, align=(Align.CENTER, Align.MAX))


@case("make-text/align-single")
def make_text_align_single():
    """A single Align applies to both axes, as `tuplify` spreads it."""
    return rendered("Caddy", 10, align=Align.MAX)


@case("make-text/align-and-text-align")
def make_text_align_and_text_align():
    return rendered(
        "Caddy",
        10,
        text_align=(TextAlign.LEFT, TextAlign.BOTTOM),
        align=(Align.MIN, Align.MIN),
    )


# ---------------------------------------------------------------------------
# Text on a path
# ---------------------------------------------------------------------------


@case("make-text/on-line")
def make_text_on_line():
    return rendered("Caddy", 10, text_path=Edge.make_line((-30, 0, 0), (30, 0, 0)))


@case("make-text/on-arc")
def make_text_on_arc():
    arc = Edge.make_circle(30, start_angle=20, end_angle=160)
    return rendered("Caddy", 10, text_path=arc)


@case("make-text/on-arc-shifted")
def make_text_on_arc_shifted():
    arc = Edge.make_circle(30, start_angle=20, end_angle=160)
    return rendered("Caddy", 10, position_on_path=0.25, text_path=arc)


# ---------------------------------------------------------------------------
# Single-stroke fonts
# ---------------------------------------------------------------------------


@case("make-text/single-line")
def make_text_single_line():
    """A single-stroke font renders as open contours: edges, no faces."""
    return rendered("Caddy", 10, font=SINGLE_LINE_FONT)


@case("make-text/single-line-outlined")
def make_text_single_line_outlined():
    """`single_line_width` offsets every stroke into a closed face."""
    return rendered("Caddy", 10, font=SINGLE_LINE_FONT, single_line_width=0.6)


# ---------------------------------------------------------------------------
# The Text sketch object
# ---------------------------------------------------------------------------


@case("text/default")
def text_default():
    value = Text("Caddy", 10, font_path=TEST_FONT)
    return {
        **text_shape(value),
        "font": value.font,
        "file": os.path.basename(str(value.font_path)),
        "single_line_width": float(value.single_line_width),
    }


@case("text/rotated")
def text_rotated():
    return text_shape(Text("Caddy", 10, font_path=TEST_FONT, rotation=30))


@case("text/aligned")
def text_aligned():
    return text_shape(Text("Caddy", 10, font_path=TEST_FONT, align=(Align.MIN, Align.MIN)))


@case("text/on-path")
def text_on_path():
    arc = Edge.make_circle(30, start_angle=20, end_angle=160)
    return text_shape(Text("Caddy", 10, font_path=TEST_FONT, path=arc, position_on_path=0.1))


@case("text/single-line")
def text_single_line():
    """The sketch object always outlines a single-stroke font: 4% of the size by default."""
    value = Text("Caddy", 10, font=SINGLE_LINE_FONT)
    return {**text_shape(value), "single_line_width": float(value.single_line_width)}


@case("text/single-line-width")
def text_single_line_width():
    return text_shape(Text("Caddy", 10, font=SINGLE_LINE_FONT, single_line_width=0.6))
