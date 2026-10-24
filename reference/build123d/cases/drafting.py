"""Oracle cases for drafting output: hidden-line projection and the 2D vector exporters.

The viewport cases record, for every edge build123d's `project_to_viewport` returns, its geometry
type, length and end points in the projection plane, so the Caddy side has to reproduce the same
hidden-line result edge for edge rather than just the same counts.
"""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any

from build123d import (
    Circle,
    ColorIndex,
    Curve,
    DotLength,
    Edge,
    Export2D,
    ExportDXF,
    ExportSVG,
    LineType,
    Location,
    Plane,
    Rectangle,
    Shape,
    Sketch,
    Solid,
    TechnicalDrawing,
    Unit,
    Vector,
)

from oracle import brep, case, vec
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
