//! Shells and solids assembled from faces: sewing, infinite planar faces and solid closure.

use neon::prelude::*;
use opencascade_sys::{
    b_rep_builder_api::{
        BRepBuilderAPI_MakeFace_as_BRepBuilderAPI_MakeShape_mut, BRepBuilderAPI_MakeFace_new_pln,
        BRepBuilderAPI_Sewing_new_real_bool4, Handle_BRepBuilderAPI_Sewing_get,
        Handle_BRepBuilderAPI_Sewing_get_mut,
    },
    gp::gp_Pln_new_ax3,
    shape_fix::{Handle_ShapeFix_Solid_get_mut, ShapeFix_Solid_SolidFromShell, ShapeFix_Solid_new},
    top_abs::TopAbs_ShapeEnum,
    topo_ds::{
        TopoDS_Builder_new, TopoDS_Shell_as_TopoDS_Shape_mut, TopoDS_Shell_new, TopoDS_Shell_shape,
        TopoDS_Shell_to_TopoDS_Shape, TopoDS_Solid_to_TopoDS_Shape,
    },
};

use crate::{
    builder::progress,
    construct::{TOLERANCE, build},
    convert::ax3,
    error::{OcctError, OrThrow, attempt},
    shape::{ShapeCell, ShapeResult, boxed, get, owned, shapes_from_js},
};

/// The unbounded face of the plane given as a frame `[origin, zDir, xDir]`
/// (build123d `Face(Plane)`).
#[neon::export(name = "makePlaneFace")]
fn make_plane_face<'cx>(cx: &mut Cx<'cx>, frame: Vec<f64>) -> ShapeResult {
    attempt(|| {
        let mut maker = BRepBuilderAPI_MakeFace_new_pln(&*gp_Pln_new_ax3(&*ax3(&frame)?)?)?;
        boxed(build(
            BRepBuilderAPI_MakeFace_as_BRepBuilderAPI_MakeShape_mut(maker.pin_mut()),
            "BRepBuilderAPI_MakeFace",
        )?)
    })
    .or_raise(cx)
}

/// Faces joined along their shared edges (build123d `_sew_topods_faces`); a single face, which
/// sewing passes through unchanged, is wrapped in a shell of its own as build123d does.
#[neon::export(name = "sewFaces")]
fn sew_faces<'cx>(cx: &mut Cx<'cx>, faces: Handle<'cx, JsArray>) -> ShapeResult {
    let faces = shapes_from_js(cx, faces)?;
    attempt(|| {
        if faces.is_empty() {
            return Err(OcctError::invalid("sewing needs at least one face"));
        }
        let mut sewing = BRepBuilderAPI_Sewing_new_real_bool4(TOLERANCE, true, true, true, false)?;
        for face in &faces {
            Handle_BRepBuilderAPI_Sewing_get_mut(sewing.pin_mut())?.Add(face)?;
        }
        Handle_BRepBuilderAPI_Sewing_get_mut(sewing.pin_mut())?.Perform(&*progress()?)?;
        let sewn = owned(Handle_BRepBuilderAPI_Sewing_get(&sewing)?.SewedShape()?);
        if sewn.ShapeType()? != TopAbs_ShapeEnum::TopAbs_FACE {
            return boxed(sewn);
        }
        let builder = TopoDS_Builder_new()?;
        let mut shell = TopoDS_Shell_new()?;
        builder.MakeShell(shell.pin_mut())?;
        builder.Add(TopoDS_Shell_as_TopoDS_Shape_mut(shell.pin_mut()), &sewn)?;
        boxed(TopoDS_Shell_to_TopoDS_Shape(&shell))
    })
    .or_raise(cx)
}

/// The solid bounded by `shell`, with the shell's faces oriented outwards
/// (build123d `Solid._make_solid`, ShapeFix_Solid::SolidFromShell).
#[neon::export(name = "makeSolidFromShell")]
fn make_solid_from_shell<'cx>(cx: &mut Cx<'cx>, shell: &ShapeCell) -> ShapeResult {
    let shell = get(shell).or_raise(cx)?;
    attempt(|| {
        let mut fixer = ShapeFix_Solid_new()?;
        let solid = ShapeFix_Solid_SolidFromShell(
            Handle_ShapeFix_Solid_get_mut(fixer.pin_mut())?,
            TopoDS_Shell_shape(&shell)?,
        )?;
        boxed(TopoDS_Solid_to_TopoDS_Shape(&solid))
    })
    .or_raise(cx)
}
