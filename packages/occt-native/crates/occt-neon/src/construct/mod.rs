//! Construction of vertices, edges, wires and faces, and the 2D operations that reshape planar
//! faces. Mirrors build123d's `Edge.make_*` / `Wire.make_*` / `Face` constructors.
//!
//! Angles cross the boundary in radians and points as flat `[x, y, z, ...]` arrays.

mod constrained_arcs;
mod constrained_circles;
mod constrained_lines;
mod edges;
mod faces;
pub mod geom2d;
mod helix;
mod modify2d;
mod solids;
mod splines;
mod wires;

use std::pin::Pin;

use cxx::UniquePtr;
use opencascade_sys::{
    b_rep_builder_api::{
        BRepBuilderAPI_MakeEdge_as_BRepBuilderAPI_MakeShape_mut,
        BRepBuilderAPI_MakeEdge_new_hcurve, BRepBuilderAPI_MakeShape,
    },
    geom::{Handle_Geom_Curve, Handle_Geom_TrimmedCurve, Handle_Geom_TrimmedCurve_to_Geom_Curve},
    gp::gp_Pnt,
    t_col_std::{TColStd_Array1OfReal, TColStd_Array1OfReal_new, TColStd_Array1OfReal_set_value},
    t_colgp::{TColgp_Array1OfPnt, TColgp_Array1OfPnt_new, TColgp_Array1OfPnt_set_value},
    top_abs::TopAbs_ShapeEnum,
    topo_ds::{
        TopoDS_Builder_new, TopoDS_Compound_as_TopoDS_Shape_mut, TopoDS_Compound_new,
        TopoDS_Compound_to_TopoDS_Shape, TopoDS_Edge, TopoDS_Edge_shape, TopoDS_Face,
        TopoDS_Face_shape, TopoDS_Shape, TopoDS_Vertex, TopoDS_Vertex_shape, TopoDS_Wire,
        TopoDS_Wire_shape,
    },
};

use crate::{
    builder::progress,
    convert::pnt,
    error::{OcctError, OcctResult},
    shape::owned,
};

/// build123d's `TOLERANCE`: the distance below which two points are considered coincident.
pub const TOLERANCE: f64 = 1e-6;

pub fn positive(value: f64, name: &str) -> OcctResult<()> {
    if value > 0.0 && value.is_finite() {
        return Ok(());
    }
    Err(OcctError::invalid(format!("{name} must be a positive number")))
}

/// Runs a `BRepBuilderAPI_MakeShape` algorithm and takes an owned copy of its result.
pub fn build(
    mut maker: Pin<&mut BRepBuilderAPI_MakeShape>,
    name: &str,
) -> OcctResult<UniquePtr<TopoDS_Shape>> {
    maker.as_mut().Build(&*progress()?)?;
    if !maker.IsDone()? {
        return Err(OcctError::failed(format!("{name} failed")));
    }
    Ok(owned(maker.as_mut().Shape()?))
}

/// Splits a flat coordinate array into points.
pub fn points(values: &[f64], what: &str) -> OcctResult<Vec<UniquePtr<gp_Pnt>>> {
    if values.is_empty() || !values.len().is_multiple_of(3) {
        return Err(OcctError::invalid(format!(
            "{what} must be a non-empty multiple of three coordinates, got {}",
            values.len()
        )));
    }
    values.as_chunks::<3>().0.iter().map(|point| pnt(point)).collect()
}

pub fn point_array(points: &[UniquePtr<gp_Pnt>]) -> OcctResult<UniquePtr<TColgp_Array1OfPnt>> {
    let mut array = TColgp_Array1OfPnt_new(1, points.len() as i32)?;
    for (index, point) in points.iter().enumerate() {
        TColgp_Array1OfPnt_set_value(array.pin_mut(), index as i32 + 1, point)?;
    }
    Ok(array)
}

pub fn real_array(values: &[f64]) -> OcctResult<UniquePtr<TColStd_Array1OfReal>> {
    let mut array = TColStd_Array1OfReal_new(1, values.len() as i32)?;
    for (index, value) in values.iter().enumerate() {
        TColStd_Array1OfReal_set_value(array.pin_mut(), index as i32 + 1, *value)?;
    }
    Ok(array)
}

/// An edge spanning the whole parameter range of `curve`.
pub fn edge_from_curve(curve: &Handle_Geom_Curve) -> OcctResult<UniquePtr<TopoDS_Shape>> {
    let mut maker = BRepBuilderAPI_MakeEdge_new_hcurve(curve)?;
    build(
        BRepBuilderAPI_MakeEdge_as_BRepBuilderAPI_MakeShape_mut(maker.pin_mut()),
        "BRepBuilderAPI_MakeEdge",
    )
}

pub fn edge_from_trimmed(curve: &Handle_Geom_TrimmedCurve) -> OcctResult<UniquePtr<TopoDS_Shape>> {
    edge_from_curve(&Handle_Geom_TrimmedCurve_to_Geom_Curve(curve))
}

pub fn compound_of(shapes: &[UniquePtr<TopoDS_Shape>]) -> OcctResult<UniquePtr<TopoDS_Shape>> {
    let builder = TopoDS_Builder_new()?;
    let mut compound = TopoDS_Compound_new()?;
    builder.MakeCompound(compound.pin_mut())?;
    for shape in shapes {
        builder.Add(TopoDS_Compound_as_TopoDS_Shape_mut(compound.pin_mut()), shape)?;
    }
    Ok(TopoDS_Compound_to_TopoDS_Shape(&compound))
}

fn require_kind(shape: &TopoDS_Shape, kind: TopAbs_ShapeEnum, what: &str) -> OcctResult<()> {
    if shape.ShapeType()?.repr != kind.repr {
        return Err(OcctError::invalid(format!("expected {what}")));
    }
    Ok(())
}

pub fn as_vertex(shape: &TopoDS_Shape) -> OcctResult<&TopoDS_Vertex> {
    require_kind(shape, TopAbs_ShapeEnum::TopAbs_VERTEX, "a vertex")?;
    Ok(TopoDS_Vertex_shape(shape)?)
}

pub fn as_edge(shape: &TopoDS_Shape) -> OcctResult<&TopoDS_Edge> {
    require_kind(shape, TopAbs_ShapeEnum::TopAbs_EDGE, "an edge")?;
    Ok(TopoDS_Edge_shape(shape)?)
}

pub fn as_wire(shape: &TopoDS_Shape) -> OcctResult<&TopoDS_Wire> {
    require_kind(shape, TopAbs_ShapeEnum::TopAbs_WIRE, "a wire")?;
    Ok(TopoDS_Wire_shape(shape)?)
}

pub fn as_face(shape: &TopoDS_Shape) -> OcctResult<&TopoDS_Face> {
    require_kind(shape, TopAbs_ShapeEnum::TopAbs_FACE, "a face")?;
    Ok(TopoDS_Face_shape(shape)?)
}
