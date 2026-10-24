//! Faces from wires and from planes: planar faces with holes, bounded plane patches and
//! non-planar filled surfaces.

use cxx::UniquePtr;
use neon::prelude::*;
use opencascade_sys::{
    b_rep::BRep_Tool,
    b_rep_builder_api::{
        BRepBuilderAPI_MakeFace_as_BRepBuilderAPI_MakeShape_mut, BRepBuilderAPI_MakeFace_new_face,
        BRepBuilderAPI_MakeFace_new_pln_real4, BRepBuilderAPI_MakeFace_new_wire_bool,
    },
    b_rep_check::BRepCheck_Analyzer_new_shape_bool3,
    b_rep_lib::BRepLib_FindSurface_new_shape_real_bool2,
    b_rep_offset_api::{
        BRepOffsetAPI_MakeFilling, BRepOffsetAPI_MakeFilling_as_BRepBuilderAPI_MakeShape_mut,
        BRepOffsetAPI_MakeFilling_new_int3_bool_real4_int2,
    },
    geom_abs::GeomAbs_Shape,
    gp::gp_Pln_new_ax3,
    shape_fix::{
        Handle_ShapeFix_Face_get, Handle_ShapeFix_Face_get_mut, Handle_ShapeFix_Shape_get,
        Handle_ShapeFix_Shape_get_mut, ShapeFix_Face_Result, ShapeFix_Face_new_face,
        ShapeFix_Shape_Shape, ShapeFix_Shape_new_shape,
    },
    topo_ds::TopoDS_Shape,
};

use crate::{
    builder::progress,
    construct::{as_edge, as_face, as_wire, build, compound_of, points},
    convert::ax3,
    error::{OcctError, OcctResult, OrThrow, attempt},
    shape::{ShapeCell, ShapeResult, boxed, get, owned, shapes_from_js},
};

fn fixed(shape: &TopoDS_Shape) -> OcctResult<UniquePtr<TopoDS_Shape>> {
    let mut fixer = ShapeFix_Shape_new_shape(shape)?;
    Handle_ShapeFix_Shape_get_mut(fixer.pin_mut())?.Perform(&*progress()?)?;
    Ok(ShapeFix_Shape_Shape(Handle_ShapeFix_Shape_get(&fixer)?)?)
}

fn is_valid(shape: &TopoDS_Shape) -> OcctResult<bool> {
    Ok(BRepCheck_Analyzer_new_shape_bool3(shape, true, true, false)?.IsValid()?)
}

fn require_closed(wire: &TopoDS_Shape, what: &str) -> OcctResult<()> {
    if BRep_Tool::IsClosed_shape(wire)? {
        return Ok(());
    }
    Err(OcctError::invalid(format!("cannot build face: {what} is not closed")))
}

/// Planar face bounded by `outer` with `inner` wires as holes (build123d's
/// `_make_topods_face_from_wires`): the wires must be coplanar and the holes closed.
#[neon::export(name = "makeFace")]
fn make_face<'cx>(cx: &mut Cx<'cx>, outer: &ShapeCell, inner: Handle<'cx, JsArray>) -> ShapeResult {
    let inner = shapes_from_js(cx, inner)?;
    let outer = get(outer).or_raise(cx)?;
    attempt(|| {
        as_wire(&outer)?;
        if !inner.is_empty() {
            require_closed(&outer, "outer wire")?;
        }
        let mut all = vec![owned(&outer)];
        for wire in &inner {
            as_wire(wire)?;
            all.push(owned(wire));
        }
        let planar =
            BRepLib_FindSurface_new_shape_real_bool2(&*compound_of(&all)?, -1.0, true, false)?;
        if !planar.Found()? {
            return Err(OcctError::invalid("cannot build face: wires not planar"));
        }

        let repaired_outer = fixed(&outer)?;
        let mut maker = BRepBuilderAPI_MakeFace_new_wire_bool(as_wire(&repaired_outer)?, true)?;
        for wire in &inner {
            require_closed(wire, "inner wire")?;
            let repaired = fixed(wire)?;
            maker.pin_mut().Add(as_wire(&repaired)?)?;
        }
        let face = build(
            BRepBuilderAPI_MakeFace_as_BRepBuilderAPI_MakeShape_mut(maker.pin_mut()),
            "BRepBuilderAPI_MakeFace",
        )?;

        let mut orienter = ShapeFix_Face_new_face(as_face(&face)?)?;
        Handle_ShapeFix_Face_get_mut(orienter.pin_mut())?.FixOrientation()?;
        Handle_ShapeFix_Face_get_mut(orienter.pin_mut())?.Perform(&*progress()?)?;
        boxed(ShapeFix_Face_Result(Handle_ShapeFix_Face_get(&orienter)?)?)
    })
    .or_raise(cx)
}

/// Rectangular patch of the plane given as a frame `[origin, zDir, xDir]`, centred on its origin
/// and spanning `width` along its X axis and `height` along its Y axis (build123d
/// `Face.make_rect`). Built straight from the plane, so the face carries the plane's normal and
/// its wire starts at the `(-width/2, height/2)` corner.
#[neon::export(name = "makeRectFace")]
fn make_rect_face<'cx>(cx: &mut Cx<'cx>, frame: Vec<f64>, width: f64, height: f64) -> ShapeResult {
    attempt(|| {
        let mut maker = BRepBuilderAPI_MakeFace_new_pln_real4(
            &*gp_Pln_new_ax3(&*ax3(&frame)?)?,
            -width * 0.5,
            width * 0.5,
            -height * 0.5,
            height * 0.5,
        )?;
        boxed(build(
            BRepBuilderAPI_MakeFace_as_BRepBuilderAPI_MakeShape_mut(maker.pin_mut()),
            "BRepBuilderAPI_MakeFace",
        )?)
    })
    .or_raise(cx)
}

/// build123d's `Face.make_surface` filling parameters, chosen there for a good balance of
/// accuracy and speed.
fn filling_builder() -> OcctResult<UniquePtr<BRepOffsetAPI_MakeFilling>> {
    Ok(BRepOffsetAPI_MakeFilling_new_int3_bool_real4_int2(
        3, 15, 2, false, 0.00001, 0.0001, 0.01, 0.1, 8, 9,
    )?)
}

/// Possibly non-planar face bounded by `edges`, pulled towards `surfacePoints` and pierced by
/// `interiorWires` (build123d `Face.make_surface`).
#[neon::export(name = "makeSurfaceFace")]
fn make_surface_face<'cx>(
    cx: &mut Cx<'cx>,
    edges: Handle<'cx, JsArray>,
    surface_points: Vec<f64>,
    interior_wires: Handle<'cx, JsArray>,
) -> ShapeResult {
    let edges = shapes_from_js(cx, edges)?;
    let interior = shapes_from_js(cx, interior_wires)?;
    attempt(|| {
        if edges.is_empty() {
            return Err(OcctError::invalid("a surface needs at least one exterior edge"));
        }
        let mut filling = filling_builder()?;
        for edge in &edges {
            filling.pin_mut().Add_edge_shape_bool(
                as_edge(edge)?,
                GeomAbs_Shape::GeomAbs_C0,
                true,
            )?;
        }
        let mut surface = build(
            BRepOffsetAPI_MakeFilling_as_BRepBuilderAPI_MakeShape_mut(filling.pin_mut()),
            "BRepOffsetAPI_MakeFilling",
        )?;
        if !surface_points.is_empty() {
            for point in points(&surface_points, "surface points")? {
                filling.pin_mut().Add_pnt(&point)?;
            }
            surface = build(
                BRepOffsetAPI_MakeFilling_as_BRepBuilderAPI_MakeShape_mut(filling.pin_mut()),
                "BRepOffsetAPI_MakeFilling",
            )?;
        }

        if !interior.is_empty() {
            let mut maker = BRepBuilderAPI_MakeFace_new_face(as_face(&surface)?)?;
            for wire in &interior {
                maker.pin_mut().Add(as_wire(wire)?)?;
            }
            surface = build(
                BRepBuilderAPI_MakeFace_as_BRepBuilderAPI_MakeShape_mut(maker.pin_mut()),
                "BRepBuilderAPI_MakeFace",
            )?;
        }

        if !is_valid(&surface)? {
            surface = fixed(&surface)?;
            if !is_valid(&surface)? {
                return Err(OcctError::failed("non planar face is invalid"));
            }
        }
        boxed(surface)
    })
    .or_raise(cx)
}
