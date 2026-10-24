"""Readers that turn build123d's 2D exports back into comparable geometry.

The exporters are compared on what a consumer of the file sees — element and entity geometry —
not on bytes: Caddy writes its own SVG and DXF text, and only has to agree with build123d on
what that text draws.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

import ezdxf
import svgpathtools as PT

SVG_NAMESPACE = "{http://www.w3.org/2000/svg}"


def _tag(element: ET.Element) -> str:
    return element.tag.removeprefix(SVG_NAMESPACE)


def _numbers(text: str) -> list[float]:
    return [float(part) for part in text.replace(",", " ").split()]


def _point(value: complex) -> list[float]:
    return [value.real, value.imag]


def _path_segments(data: str) -> list[dict[str, Any]]:
    segments: list[dict[str, Any]] = []
    for segment in PT.parse_path(data):
        record: dict[str, Any] = {
            "type": type(segment).__name__,
            "start": _point(segment.start),
            "end": _point(segment.end),
        }
        if isinstance(segment, PT.Arc):
            record["radius"] = _point(segment.radius)
            record["rotation"] = segment.rotation
            record["large_arc"] = bool(segment.large_arc)
            record["sweep"] = bool(segment.sweep)
        elif isinstance(segment, PT.QuadraticBezier):
            record["controls"] = [_point(segment.control)]
        elif isinstance(segment, PT.CubicBezier):
            record["controls"] = [_point(segment.control1), _point(segment.control2)]
        segments.append(record)
    return segments


def _svg_element(element: ET.Element) -> dict[str, Any]:
    tag = _tag(element)
    record: dict[str, Any] = {"tag": tag}
    if tag == "line":
        record["points"] = [float(element.attrib[name]) for name in ("x1", "y1", "x2", "y2")]
    elif tag == "circle":
        record["center"] = [float(element.attrib["cx"]), float(element.attrib["cy"])]
        record["radius"] = float(element.attrib["r"])
    elif tag == "path":
        record["segments"] = _path_segments(element.attrib["d"])
    else:
        raise ValueError(f"unexpected SVG element <{tag}>")
    for name in ("fill", "fill-opacity", "stroke", "stroke-opacity"):
        if name in element.attrib:
            record[name.replace("-", "_")] = element.attrib[name]
    return record


def svg_document(path: Path) -> dict[str, Any]:
    """Document size, view box and every layer group with its drawn elements."""
    root = ET.parse(path).getroot()
    container = list(root)[0]
    groups = [
        {
            "id": group.attrib.get("id", ""),
            "fill": group.attrib.get("fill"),
            "stroke": group.attrib.get("stroke"),
            "fill_opacity": group.attrib.get("fill-opacity"),
            "stroke_opacity": group.attrib.get("stroke-opacity"),
            "stroke_width": float(group.attrib["stroke-width"]),
            "dash_array": (
                None
                if "stroke-dasharray" not in group.attrib
                else _numbers(group.attrib["stroke-dasharray"])
            ),
            "elements": [_svg_element(element) for element in group],
        }
        for group in container
    ]
    return {
        "width": root.attrib["width"],
        "height": root.attrib["height"],
        "view_box": _numbers(root.attrib["viewBox"]),
        "groups": groups,
    }


def _dxf_entity(entity: Any) -> dict[str, Any]:
    kind = entity.dxftype()
    record: dict[str, Any] = {"type": kind, "layer": entity.dxf.layer}
    if kind == "LINE":
        record["start"] = list(entity.dxf.start)[:2]
        record["end"] = list(entity.dxf.end)[:2]
    elif kind == "CIRCLE":
        record["center"] = list(entity.dxf.center)[:2]
        record["radius"] = entity.dxf.radius
    elif kind == "ARC":
        record["center"] = list(entity.dxf.center)[:2]
        record["radius"] = entity.dxf.radius
        record["start_angle"] = entity.dxf.start_angle
        record["end_angle"] = entity.dxf.end_angle
    elif kind == "ELLIPSE":
        record["center"] = list(entity.dxf.center)[:2]
        record["major_axis"] = list(entity.dxf.major_axis)[:2]
        record["ratio"] = entity.dxf.ratio
        record["start_param"] = entity.dxf.start_param
        record["end_param"] = entity.dxf.end_param
    elif kind == "SPLINE":
        record["degree"] = entity.dxf.degree
        record["control_points"] = [list(point)[:2] for point in entity.control_points]
        record["knots"] = list(entity.knots)
        record["weights"] = list(entity.weights) if entity.weights else None
    else:
        raise ValueError(f"unexpected DXF entity {kind}")
    return record


def dxf_document(path: Path) -> dict[str, Any]:
    """Layer table and model space entities of a DXF file."""
    document = ezdxf.readfile(path)
    layers = [
        {
            "name": layer.dxf.name,
            "color": layer.dxf.color,
            "line_type": layer.dxf.linetype,
            "line_weight": layer.dxf.get("lineweight"),
        }
        for layer in document.layers
    ]
    return {
        "layers": sorted(layers, key=lambda layer: layer["name"]),
        "entities": [_dxf_entity(entity) for entity in document.modelspace()],
    }
