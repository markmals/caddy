"""Oracle cases for drafting: the dimension objects, hidden-line projection and the 2D exporters.

The viewport cases record, for every edge build123d's `project_to_viewport` returns, its geometry
type, length and end points in the projection plane, so the Caddy side has to reproduce the same
hidden-line result edge for edge rather than just the same counts.

The drafting objects render text, so every case that does passes the repository's test font
rather than a system one. `Draft` names its font, so the file is registered first and named by
the face it declares; `TechnicalDrawing` has no font setting at all, so the file is bound to the
name its labels ask for ("Arial") for the duration of the case.
"""

from __future__ import annotations

import tempfile
from contextlib import contextmanager
from collections.abc import Iterator
from datetime import date
from pathlib import Path
from typing import Any

from OCP.Font import Font_FA_Regular, Font_FontMgr, Font_SystemFont
from OCP.TCollection import TCollection_AsciiString

from build123d import (
    Align,
    Arrow,
    ArrowHead,
    BallJoint,
    Box,
    Circle,
    ColorIndex,
    Compound,
    Curve,
    DimensionLine,
    DotLength,
    Draft,
    Edge,
    Export2D,
    ExportDXF,
    ExportSVG,
    ExtensionLine,
    HeadType,
    LineType,
    Location,
    NumberDisplay,
    PageSize,
    Plane,
    Rectangle,
    RigidJoint,
    Shape,
    Sketch,
    Solid,
    TechnicalDrawing,
    Unit,
    Vector,
    Wire,
)
from build123d.text import FontManager

from oracle import TEST_FONT, TEST_FONT_NAME, brep, case, location, shape_metrics, vec
from oracle.vector_files import dxf_document, svg_document


def box() -> Solid:
    return Solid.make_box(10, 10, 10)


def cylinder() -> Solid:
    return Solid.make_cylinder(2, 10)


def edge_geometry(edges: list[Edge]) -> list[dict[str, Any]]:
    """Per-edge geometry of a projection, in the order the projector produced it."""
    return [
        {
            "geom_type": edge.geom_type.name,
            "length": edge.length,
            "start": vec(edge.start_point()),
            "end": vec(edge.end_point()),
        }
        for edge in edges
    ]


def projection(shape: Solid, viewport_origin: Vector, **kwargs: Any) -> dict[str, Any]:
    visible, hidden = shape.project_to_viewport(viewport_origin, **kwargs)
    return {
        "source": brep(shape),
        "viewport_origin": vec(viewport_origin),
        "visible": edge_geometry(visible),
        "hidden": edge_geometry(hidden),
    }


@case("viewport/box")
def viewport_box() -> dict[str, Any]:
    """A box seen from a corner: nine visible and three hidden sharp edges."""
    return projection(box(), Vector(-20, 20, 20))


@case("viewport/cylinder")
def viewport_cylinder() -> dict[str, Any]:
    """A cylinder, which contributes silhouette edges as well as sharp ones."""
    return projection(cylinder(), Vector(-20, 20, 20))


@case("viewport/box-with-hole")
def viewport_box_with_hole() -> dict[str, Any]:
    """A bored box: the bore's far side lands in the hidden set."""
    return projection(box() - cylinder(), Vector(-20, 20, 20))


@case("viewport/sphere")
def viewport_sphere() -> dict[str, Any]:
    """A sphere projects to its outline alone."""
    return projection(Solid.make_sphere(5), Vector(-20, 20, 20))


@case("viewport/look-at")
def viewport_look_at() -> dict[str, Any]:
    """An explicit target point and viewport up direction instead of the shape's centre."""
    return projection(
        box(),
        Vector(-20, 20, 20),
        look_at=(0, 0, 0),
        viewport_up=(0, 1, 0),
    )


@case("viewport/perspective")
def viewport_perspective() -> dict[str, Any]:
    """A focal length switches HLRAlgo_Projector to a perspective projection."""
    return projection(box(), Vector(-20, 20, 20), focus=50)


# ---- 2D vector export ----


def plate() -> Sketch:
    """A rectangle with a round hole: an outer wire, an inner wire and two geometry types."""
    return Rectangle(10, 6) - Circle(1.5)


def mixed_curve() -> Curve:
    """Loose edges of every kind the exporters special-case."""
    return Curve() + [
        Edge.make_line((-6, 0), (-2, 0)),
        Edge.make_three_point_arc((-1, 0), (0, 1), (1, 0)),
        Edge.make_ellipse(3, 1.5, Plane.XY.offset(0), 0, 120).moved(Location((5, 0))),
        Edge.make_spline([(0, -3), (2, -4), (4, -2), (6, -3)]),
    ]


def svg_case(shape: Shape, exporter: ExportSVG, **attributes: Any) -> dict[str, Any]:
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "drawing.svg"
        exporter.add_shape(shape)
        exporter.write(path)
        document = svg_document(path)
    return {"source": brep(shape), **attributes, "svg": document}


def dxf_case(shape: Shape, exporter: ExportDXF, **attributes: Any) -> dict[str, Any]:
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "drawing.dxf"
        exporter.add_shape(shape)
        exporter.write(path)
        document = dxf_document(path)
    return {"source": brep(shape), **attributes, "dxf": document}


@case("svg/plate")
def svg_plate() -> dict[str, Any]:
    """A face with a hole: one path element holding the outer and the inner wire."""
    return svg_case(plate(), ExportSVG(line_weight=0.5))


@case("svg/loose-edges")
def svg_loose_edges() -> dict[str, Any]:
    """Edges outside any wire: a line element, arcs and a Bézier path."""
    return svg_case(mixed_curve(), ExportSVG())


@case("svg/circle")
def svg_circle() -> dict[str, Any]:
    """A closed circular edge keeps SVG's circle primitive."""
    return svg_case(Circle(2).wire(), ExportSVG())


@case("svg/dashed-layer")
def svg_dashed_layer() -> dict[str, Any]:
    """Scale, margin, colours and a dash pattern, which the layer group carries."""
    exporter = ExportSVG(
        unit=Unit.IN,
        scale=2,
        margin=1,
        fill_color=(0.5, 0.25, 0.125, 0.5),
        line_color=(0, 0, 1),
        line_weight=0.6,
        line_type=LineType.DASHDOT,
        dot_length=DotLength.QCAD_IMPERIAL,
    )
    return svg_case(plate(), exporter)


@case("dxf/plate")
def dxf_plate() -> dict[str, Any]:
    """Lines and a full circle, as DXF LINE and CIRCLE entities."""
    return dxf_case(plate(), ExportDXF(line_weight=0.5))


@case("dxf/loose-edges")
def dxf_loose_edges() -> dict[str, Any]:
    """An arc, an elliptical arc and a spline, each with its own DXF entity type."""
    return dxf_case(mixed_curve(), ExportDXF())


@case("dxf/layers")
def dxf_layers() -> dict[str, Any]:
    """A named layer with its own colour, stroke width and dash pattern."""
    exporter = ExportDXF(unit=Unit.IN)
    exporter.add_layer("outline", color=ColorIndex.RED, line_weight=0.7, line_type=LineType.DASHED)
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "drawing.dxf"
        shape = plate()
        exporter.add_shape(shape, layer="outline")
        exporter.write(path)
        document = dxf_document(path)
    return {"source": brep(shape), "layer": "outline", "dxf": document}


# ---- export tables ----


@case("tables/line-types")
def tables_line_types() -> dict[str, Any]:
    """Every dash pattern the exporters can apply, keyed by its DXF line type name."""
    return {
        "line_types": {
            name: {"description": description, "pattern": list(pattern)}
            for name, (description, pattern) in Export2D.LINETYPE_DEFS.items()
        }
    }


@case("tables/page-sizes")
def tables_page_sizes() -> dict[str, Any]:
    """Page dimensions in millimetres, as `TechnicalDrawing` defines them."""
    return {
        "page_sizes": {
            size.name: list(dimensions)
            for size, dimensions in TechnicalDrawing.page_sizes.items()
        }
    }


# ---- drafting objects ----


def drafting_font() -> str:
    """Register the repository's test font and return the face name it declares."""
    FontManager().register_font(TEST_FONT, override=True)
    return TEST_FONT_NAME


def draft(**settings: Any) -> Draft:
    """A `Draft` whose labels render from the repository's font rather than a system one."""
    return Draft(font=drafting_font(), **settings)


@contextmanager
def font_named(name: str, path: str) -> Iterator[None]:
    """Bind `name` to the font file at `path`, restoring the previous binding afterwards.

    `TechnicalDrawing` has no font setting: its labels always ask `Compound.make_text` for its
    default, "Arial". Rebinding that name is the only way to make the drawing render from a
    known file on every platform.
    """
    manager = Font_FontMgr.GetInstance_s()
    ascii_name = TCollection_AsciiString(name)
    previous = manager.FindFont(ascii_name, Font_FA_Regular)
    replacement = Font_SystemFont(ascii_name)
    replacement.SetFontPath(Font_FA_Regular, TCollection_AsciiString(path))
    manager.RegisterFont(replacement, True)
    try:
        yield
    finally:
        if previous is not None:
            manager.RegisterFont(previous, True)


@case("arrowhead/curved")
def arrowhead_curved() -> dict[str, Any]:
    """The default head: two arcs sweeping back from the tip to a notched tail."""
    return {"shape": shape_metrics(ArrowHead(6))}


@case("arrowhead/straight")
def arrowhead_straight() -> dict[str, Any]:
    """A plain triangle, built from a polygon rather than from arcs."""
    return {"shape": shape_metrics(ArrowHead(6, head_type=HeadType.STRAIGHT))}


@case("arrowhead/filleted")
def arrowhead_filleted() -> dict[str, Any]:
    """The curved head with its two tail corners rounded, leaving the tip sharp."""
    return {"shape": shape_metrics(ArrowHead(6, head_type=HeadType.FILLETED))}


@case("arrowhead/rotated")
def arrowhead_rotated() -> dict[str, Any]:
    """Rotation turns the head about its tip, which stays at the origin."""
    return {"shape": shape_metrics(ArrowHead(4, rotation=30))}


@case("arrow/head-at-start")
def arrow_head_at_start() -> dict[str, Any]:
    """Head at the start of a straight shaft, which is trimmed back to clear the tip."""
    shaft = Edge.make_line((0, 0, 0), (30, 0, 0))
    return {"shape": shape_metrics(Arrow(4, shaft, 0.6))}


@case("arrow/head-at-end")
def arrow_head_at_end() -> dict[str, Any]:
    """Head at the far end, with the straight outline."""
    shaft = Edge.make_line((0, 0, 0), (30, 0, 0))
    return {
        "shape": shape_metrics(
            Arrow(4, shaft, 0.6, head_at_start=False, head_type=HeadType.STRAIGHT)
        )
    }


@case("arrow/curved-shaft")
def arrow_curved_shaft() -> dict[str, Any]:
    """An arrow swept along an arc: the shaft follows the curve and the head meets its tangent."""
    shaft = Edge.make_circle(20, start_angle=0, end_angle=60)
    return {"shape": shape_metrics(Arrow(4, shaft, 0.5))}


@case("draft/numbers")
def draft_numbers() -> dict[str, Any]:
    """How every combination of unit, display and tolerance writes a measurement out."""
    metric = Draft()
    imperial = Draft(unit=Unit.IN)
    fractional = Draft(unit=Unit.IN, number_display=NumberDisplay.FRACTION)
    coarse = Draft(unit=Unit.IN, number_display=NumberDisplay.FRACTION, fractional_precision=8)
    whole = Draft(decimal_precision=0)
    return {
        "metric": {
            "plain": metric._number_with_units(25.4),
            "hidden_units": metric._number_with_units(25.4, display_units=False),
            "symmetric_tolerance": metric._number_with_units(25.4, 0.1),
            "asymmetric_tolerance": metric._number_with_units(25.4, (0.1, 0.25)),
            "forced_units": metric._number_with_units(25.4, 0.1, display_units=True),
            # Every metric unit still prints millimetres: only the metric split is read.
            "centimeters": Draft(unit=Unit.CM)._number_with_units(25.4),
        },
        "imperial": {
            "plain": imperial._number_with_units(25.4),
            "fraction_half": fractional._number_with_units(1.5 * 25.4),
            "fraction_only": fractional._number_with_units(0.25 * 25.4),
            "fraction_sixty_fourth": fractional._number_with_units((1 / 64) * 25.4),
            "fraction_coarse": coarse._number_with_units(0.3 * 25.4),
            "fraction_tolerance": fractional._number_with_units(1.5 * 25.4, 0.01),
        },
        "rounding": {
            "tie_down": whole._round_to_str(2.5),
            "tie_up": whole._round_to_str(3.5),
            "negative_zero": whole._round_to_str(-0.4),
            "signed_zero_decimals": metric._round_to_str(-0.001),
            "binary_tie": metric._round_to_str(0.125),
            "binary_tie_up": metric._round_to_str(0.375),
        },
        "is_metric": {
            unit.name: Draft(unit=unit).is_metric
            for unit in [Unit.MC, Unit.MM, Unit.CM, Unit.M, Unit.IN, Unit.FT]
        },
    }


@case("draft/labels")
def draft_labels() -> dict[str, Any]:
    """What a dimension writes against a path: its length, an angle, or a given string."""
    settings = Draft()
    line = Wire([Edge.make_line((0, 0, 0), (42.5, 0, 0))])
    arc = Wire([Edge.make_circle(20, start_angle=0, end_angle=72)])
    return {
        "length": settings._label_to_str(None, line, False, None),
        "given": settings._label_to_str("WIDTH", line, False, None),
        "angle": settings._label_to_str(None, arc, True, None),
        "tolerance": settings._label_to_str(None, line, False, (0.1, 0.25)),
    }


@case("draft/paths")
def draft_paths() -> dict[str, Any]:
    """How a path descriptor becomes a curve, and where an object placed along it sits."""
    two_points = Draft._process_path([(0, 0, 0), (10, 5, 0)])
    three_points = Draft._process_path([(0, 0, 0), (10, 0, 0), (10, 8, 0)])
    edge = Edge.make_line((0, 0, 0), (3, 4, 0))
    return {
        "two_points": shape_metrics(two_points),
        "three_points": shape_metrics(three_points),
        "passthrough": Draft._process_path(edge) is edge,
        "start": location(Draft._sketch_location(two_points, 0.0)),
        "middle": location(Draft._sketch_location(two_points, 0.5)),
        "flipped_end": location(Draft._sketch_location(two_points, 1.0, flip=True)),
    }


@case("dimension/inside")
def dimension_inside() -> dict[str, Any]:
    """A path long enough for the label and both arrows to sit inside it."""
    line = DimensionLine([(0, 0, 0), (100, 0, 0)], draft())
    return {"shape": shape_metrics(line), "dimension": line.dimension}


@case("dimension/outside")
def dimension_outside() -> dict[str, Any]:
    """A path too short for either the label or the arrows, which go outside it."""
    line = DimensionLine([(0, 0, 0), (6, 0, 0)], draft())
    return {"shape": shape_metrics(line), "dimension": line.dimension}


@case("dimension/one-arrow")
def dimension_one_arrow() -> dict[str, Any]:
    """Only the starting arrow is drawn; the label still counts both when it is placed."""
    line = DimensionLine([(0, 0, 0), (80, 0, 0)], draft(), arrows=(True, False))
    return {"shape": shape_metrics(line), "dimension": line.dimension}


@case("dimension/label-and-tolerance")
def dimension_label_and_tolerance() -> dict[str, Any]:
    """An explicit label beats the measurement; a tolerance drops the unit suffix."""
    labelled = DimensionLine([(0, 0, 0), (90, 0, 0)], draft(), label="WIDTH")
    toleranced = DimensionLine([(0, 0, 0), (90, 0, 0)], draft(), tolerance=(0.1, 0.25))
    return {
        "labelled": shape_metrics(labelled),
        "toleranced": shape_metrics(toleranced),
    }


@case("dimension/angle")
def dimension_angle() -> dict[str, Any]:
    """A circular path labelled with the angle it subtends rather than its arc length."""
    arc = Edge.make_circle(40, start_angle=0, end_angle=72)
    line = DimensionLine(arc, draft(), label_angle=True)
    return {"shape": shape_metrics(line), "dimension": line.dimension}


@case("dimension/avoids-sketch")
def dimension_avoids_sketch() -> dict[str, Any]:
    """Given the drawing so far, the label moves to wherever it overlaps least."""
    obstacle = Rectangle(30, 30)
    line = DimensionLine([(-40, 0, 0), (40, 0, 0)], draft(), sketch=obstacle)
    return {"shape": shape_metrics(line), "dimension": line.dimension}


@case("extension/scalar-offset")
def extension_scalar_offset() -> dict[str, Any]:
    """A signed distance puts the dimension line to one side of the border."""
    line = ExtensionLine([(0, 0, 0), (60, 0, 0)], 20, draft())
    return {"shape": shape_metrics(line), "dimension": line.dimension}


@case("extension/negative-offset")
def extension_negative_offset() -> dict[str, Any]:
    """The opposite sign puts it on the other side, with the extension lines reversed."""
    line = ExtensionLine([(0, 0, 0), (60, 0, 0)], -20, draft())
    return {"shape": shape_metrics(line), "dimension": line.dimension}


@case("extension/vector-offset")
def extension_vector_offset() -> dict[str, Any]:
    """An offset vector carries the distance and the side, and sets the measured direction."""
    line = ExtensionLine([(0, 0, 0), (40, 30, 0)], (0, -25, 0), draft())
    return {"shape": shape_metrics(line), "dimension": line.dimension}


@case("extension/measurement-direction")
def extension_measurement_direction() -> dict[str, Any]:
    """Only the span of the border along the given direction is dimensioned."""
    line = ExtensionLine(
        [(0, 0, 0), (40, 30, 0)], 15, draft(), measurement_direction=(1, 0, 0)
    )
    return {"shape": shape_metrics(line), "dimension": line.dimension}


@case("technical/a4")
def technical_a4() -> dict[str, Any]:
    """A whole sheet: frame, grid ticks, grid labels, title block and its text."""
    with font_named("Arial", TEST_FONT):
        drawing = TechnicalDrawing(
            design_date=date(2024, 5, 17), sheet_number=3, drawing_scale=2.5
        )
    return {"shape": shape_metrics(drawing)}


@case("triad/axes")
def triad_axes() -> dict[str, Any]:
    """The coordinate triad: three axes, three arrow heads and three single-stroke letters."""
    return {"shape": shape_metrics(Compound.make_triad(axes_scale=12))}


@case("symbol/rigid-joint")
def symbol_rigid_joint() -> dict[str, Any]:
    """A rigid joint draws a triad scaled from its part and placed at the joint."""
    part = Box(30, 20, 10)
    joint = RigidJoint("corner", part, Location((5, 4, 3), (0, 0, 30)))
    return {"shape": shape_metrics(joint.symbol), "location": location(joint.location)}


@case("symbol/ball-joint")
def symbol_ball_joint() -> dict[str, Any]:
    """A ball joint draws three labelled circles, one per axis of its gimbal."""
    part = Box(30, 20, 10)
    joint = BallJoint("socket", part, Location((2, 1, 0)), angle_reference=Plane.XZ)
    return {"shape": shape_metrics(joint.symbol), "location": location(joint.location)}
