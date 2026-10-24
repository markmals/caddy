//! 2D modifications of planar shapes: corner fillets and chamfers on a face, and wire offsets.

use cxx::UniquePtr;
use neon::prelude::*;
use opencascade_sys::{
    b_rep_check::BRepCheck_Analyzer_new_shape_bool3,
    b_rep_fillet_api::{
        BRepFilletAPI_MakeFillet2d_AddChamfer_edge2_real2, BRepFilletAPI_MakeFillet2d_AddFillet,
        BRepFilletAPI_MakeFillet2d_as_BRepBuilderAPI_MakeShape_mut,
        BRepFilletAPI_MakeFillet2d_new_face,
    },
    b_rep_offset_api::{
        BRepOffsetAPI_MakeOffset_as_BRepBuilderAPI_MakeShape_mut, BRepOffsetAPI_MakeOffset_new,
    },
    geom_abs::GeomAbs_JoinType,
    shape_fix::{
        Handle_ShapeFix_Shape_get, Handle_ShapeFix_Shape_get_mut, ShapeFix_Shape_Shape,
        ShapeFix_Shape_new_shape,
    },
    topo_ds::TopoDS_Shape,
};

use crate::{
    builder::progress,
    construct::{as_edge, as_face, as_vertex, as_wire, build, positive},
    error::{OcctError, OcctResult, OrThrow, attempt},
    shape::{ShapeCell, ShapeResult, boxed, get, shapes_from_js},
};

fn join_type(kind: &str) -> OcctResult<GeomAbs_JoinType> {
    match kind {
        "arc" => Ok(GeomAbs_JoinType::GeomAbs_Arc),
        "tangent" => Ok(GeomAbs_JoinType::GeomAbs_Tangent),
        "intersection" => Ok(GeomAbs_JoinType::GeomAbs_Intersection),
        other => Err(OcctError::invalid(format!("unknown offset join type `{other}`"))),
    }
}

/// build123d's `Shape.fix`: repair only what OCCT reports as invalid.
fn repaired(shape: UniquePtr<TopoDS_Shape>) -> OcctResult<UniquePtr<TopoDS_Shape>> {
    if BRepCheck_Analyzer_new_shape_bool3(&shape, true, true, false)?.IsValid()? {
        return Ok(shape);
    }
    let mut fixer = ShapeFix_Shape_new_shape(&shape)?;
    Handle_ShapeFix_Shape_get_mut(fixer.pin_mut())?.Perform(&*progress()?)?;
    Ok(ShapeFix_Shape_Shape(Handle_ShapeFix_Shape_get(&fixer)?)?)
}

/// Replaces each listed corner of a planar face with a tangent arc of `radius`.
#[neon::export(name = "filletFace2d")]
fn fillet_face_2d<'cx>(
    cx: &mut Cx<'cx>,
    face: &ShapeCell,
    vertices: Handle<'cx, JsArray>,
    radius: f64,
) -> ShapeResult {
    let vertices = shapes_from_js(cx, vertices)?;
    let face = get(face).or_raise(cx)?;
    attempt(|| {
        positive(radius, "fillet radius")?;
        if vertices.is_empty() {
            return Err(OcctError::invalid("no vertices to fillet"));
        }
        let mut maker = BRepFilletAPI_MakeFillet2d_new_face(as_face(&face)?)?;
        for vertex in &vertices {
            BRepFilletAPI_MakeFillet2d_AddFillet(maker.pin_mut(), as_vertex(vertex)?, radius)?;
        }
        let filleted = build(
            BRepFilletAPI_MakeFillet2d_as_BRepBuilderAPI_MakeShape_mut(maker.pin_mut()),
            "BRepFilletAPI_MakeFillet2d",
        )?;
        boxed(repaired(filleted)?)
    })
    .or_raise(cx)
}

/// Cuts each corner of a planar face between the paired edges, `distance` back along the edge in
/// `firstEdges` and `distance2` along the matching edge in `secondEdges`.
#[neon::export(name = "chamferFace2d")]
fn chamfer_face_2d<'cx>(
    cx: &mut Cx<'cx>,
    face: &ShapeCell,
    first_edges: Handle<'cx, JsArray>,
    second_edges: Handle<'cx, JsArray>,
    distance: f64,
    distance2: f64,
) -> ShapeResult {
    let first_edges = shapes_from_js(cx, first_edges)?;
    let second_edges = shapes_from_js(cx, second_edges)?;
    let face = get(face).or_raise(cx)?;
    attempt(|| {
        positive(distance, "chamfer distance")?;
        positive(distance2, "second chamfer distance")?;
        if first_edges.is_empty() || first_edges.len() != second_edges.len() {
            return Err(OcctError::invalid("each chamfered corner needs a pair of edges"));
        }
        let mut maker = BRepFilletAPI_MakeFillet2d_new_face(as_face(&face)?)?;
        for (first, second) in first_edges.iter().zip(&second_edges) {
            BRepFilletAPI_MakeFillet2d_AddChamfer_edge2_real2(
                maker.pin_mut(),
                as_edge(first)?,
                as_edge(second)?,
                distance,
                distance2,
            )?;
        }
        let chamfered = build(
            BRepFilletAPI_MakeFillet2d_as_BRepBuilderAPI_MakeShape_mut(maker.pin_mut()),
            "BRepFilletAPI_MakeFillet2d",
        )?;
        boxed(repaired(chamfered)?)
    })
    .or_raise(cx)
}

/// Offsets a planar wire by `distance` (BRepOffsetAPI_MakeOffset). The result is a wire, or a
/// compound when the offset falls apart into several.
#[neon::export(name = "offsetWire2d")]
fn offset_wire_2d<'cx>(
    cx: &mut Cx<'cx>,
    wire: &ShapeCell,
    distance: f64,
    kind: String,
    open_result: bool,
) -> ShapeResult {
    let wire = get(wire).or_raise(cx)?;
    attempt(|| {
        let mut maker = BRepOffsetAPI_MakeOffset_new()?;
        maker.pin_mut().Init_jointype_bool(join_type(&kind)?, open_result)?;
        maker.pin_mut().AddWire(as_wire(&wire)?)?;
        maker.pin_mut().Perform(distance, 0.0)?;
        if !maker.IsDone()? {
            return Err(OcctError::failed(format!("2D offset failed with distance {distance}")));
        }
        boxed(build(
            BRepOffsetAPI_MakeOffset_as_BRepBuilderAPI_MakeShape_mut(maker.pin_mut()),
            "BRepOffsetAPI_MakeOffset",
        )?)
    })
    .or_raise(cx)
}
