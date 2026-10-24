"""Oracle cases for `pack`, build123d's 2D arrangement of shapes in Plane.XY.

The rectangle packer is deterministic, so the cases record where every object landed. The
larger cases ship their input sizes in the fixture: the Caddy side builds the same boxes from
them rather than trying to reproduce Python's random number generator.
"""

from __future__ import annotations

import random
from typing import Any

from build123d import Box, Part, Sketch, SlotOverall, pack
from build123d.pack_utils import _pack2d
from build123d.topology import Shape

from oracle import case, vec


def bounds(shapes: list[Shape]) -> dict[str, dict[str, list[float]]]:
    """Each packed object's bounding box, keyed by its position in the input."""
    return {
        str(index): {
            "min": vec(shape.bounding_box().min),
            "max": vec(shape.bounding_box().max),
        }
        for index, shape in enumerate(shapes)
    }


def random_sizes(count: int, low: int, high: int) -> list[tuple[int, int]]:
    """Reproducible input sizes; the fixture carries them so both sides pack the same boxes."""
    generator = random.Random(123456)
    return [(generator.randint(low, high), generator.randint(low, high)) for _ in range(count)]


@case("rectangles/prefers-horizontal-growth")
def rectangles_prefers_horizontal_growth() -> dict[str, Any]:
    """The packer grows right when that keeps the packed area squarish."""
    sizes = [(2, 10), (3, 2)]
    packed = _pack2d(sizes, width_fn=lambda size: size[0], length_fn=lambda size: size[1])
    return {"sizes": [list(size) for size in sizes], "translations": [list(t) for t in packed]}


@case("rectangles/many")
def rectangles_many() -> dict[str, Any]:
    """Fifty rectangles, exercising every growth and split branch of the packer."""
    sizes = random_sizes(50, 1, 20)
    packed = _pack2d(sizes, width_fn=lambda size: size[0], length_fn=lambda size: size[1])
    return {"sizes": [list(size) for size in sizes], "translations": [list(t) for t in packed]}


@case("pack/simple")
def pack_simple() -> dict[str, Any]:
    """Three boxes with a padding of one, in the order they were given."""
    packed = pack([Box(10, 2, 1), Box(1, 5, 1), Box(1, 5, 1)], padding=1)
    return {"packed": bounds(list(packed))}


@case("pack/align-z")
def pack_align_z() -> dict[str, Any]:
    """`align_z` drops every object onto Plane.XY instead of keeping its Z."""
    objects = [Box(4, 4, 2), Box(2, 6, 3), Box(3, 3, 1)]
    return {
        "packed": bounds(list(pack(objects, padding=0.5))),
        "aligned": bounds(list(pack(objects, padding=0.5, align_z=True))),
    }


@case("pack/boxes")
def pack_boxes() -> dict[str, Any]:
    """Fifty boxes packed with a padding of one, as the build123d test does."""
    sizes = random_sizes(50, 1, 20)
    boxes = [Box(length, width, 1) for length, width in sizes]
    packed = list(pack(boxes, 1))
    overall = (Part() + packed).bounding_box()
    return {
        "sizes": [list(size) for size in sizes],
        "packed": bounds(packed),
        "overall": {"min": vec(overall.min), "max": vec(overall.max)},
    }


@case("pack/slots")
def pack_slots() -> dict[str, Any]:
    """Packing 2D objects: the bounding boxes are flat, so only X and Y are arranged."""
    widths = [12, 7, 20, 5, 9]
    heights = [3, 6, 4, 2, 8]
    slots = [SlotOverall(width, height) for width, height in zip(widths, heights)]
    packed = list(pack(slots, 1))
    overall = (Sketch() + packed).bounding_box()
    return {
        "sizes": [list(size) for size in zip(widths, heights)],
        "packed": bounds(packed),
        "overall": {"min": vec(overall.min), "max": vec(overall.max)},
    }
