//! Hidden-line removal: projects a shape onto a viewport and splits the projection into visible
//! and hidden edges (OCCT `HLRBRep_Algo` / `HLRBRep_HLRToShape`).

use cxx::UniquePtr;
use neon::prelude::*;
use opencascade_sys::{
    b_rep_lib::BRepLib,
    geom_abs::GeomAbs_Shape,
    gp::gp_Ax1_new_pnt_dir,
    gp::gp_Ax2_new,
    hlr_algo::{HLRAlgo_Projector_new_ax2, HLRAlgo_Projector_new_ax2_real},
    hlrb_rep::{
        HLRBRep_Algo_new, HLRBRep_HLRToShape, HLRBRep_HLRToShape_HCompound,
        HLRBRep_HLRToShape_OutLineHCompound, HLRBRep_HLRToShape_OutLineVCompound,
        HLRBRep_HLRToShape_Rg1LineHCompound, HLRBRep_HLRToShape_Rg1LineVCompound,
        HLRBRep_HLRToShape_VCompound, HLRBRep_HLRToShape_new_halgo, Handle_HLRBRep_Algo_get_mut,
    },
    top_abs::TopAbs_ShapeEnum,
    top_exp::TopExp_Explorer_new_shape_shapeenum2,
    topo_ds::TopoDS_Shape,
};
use std::pin::Pin;

use crate::{
    convert::{dir, pnt},
    error::{OcctError, OcctResult, OrThrow, attempt},
    shape::{ShapeCell, get, owned, shapes_to_js},
};

/// build123d's `TOLERANCE`, the slack it passes to `BRepLib::BuildCurves3d`.
const CURVE_TOLERANCE: f64 = 1e-6;

/// One of `HLRBRep_HLRToShape`'s extraction filters, each returning a compound of edges.
type EdgeFilter =
    fn(Pin<&mut HLRBRep_HLRToShape>) -> Result<UniquePtr<TopoDS_Shape>, cxx::Exception>;

/// Sharp (C0), smooth (G1) and silhouette edges that the camera can see.
const VISIBLE_FILTERS: [EdgeFilter; 3] = [
    HLRBRep_HLRToShape_VCompound,
    HLRBRep_HLRToShape_Rg1LineVCompound,
    HLRBRep_HLRToShape_OutLineVCompound,
];

/// The same families of edges, where the shape occludes them.
const HIDDEN_FILTERS: [EdgeFilter; 3] = [
    HLRBRep_HLRToShape_HCompound,
    HLRBRep_HLRToShape_OutLineHCompound,
    HLRBRep_HLRToShape_Rg1LineHCompound,
];

/// Every edge the filters produce, each with its 3d curve rebuilt: the projection only carries
/// 2d curves, and consumers that read the geometry segfault without this.
fn filtered_edges(
    to_shape: &mut UniquePtr<HLRBRep_HLRToShape>,
    filters: &[EdgeFilter],
) -> OcctResult<Vec<UniquePtr<TopoDS_Shape>>> {
    let mut edges: Vec<UniquePtr<TopoDS_Shape>> = Vec::new();
    for filter in filters {
        let compound = filter(to_shape.pin_mut())?;
        if compound.IsNull()? {
            continue;
        }
        let mut explorer = TopExp_Explorer_new_shape_shapeenum2(
            &compound,
            TopAbs_ShapeEnum::TopAbs_EDGE,
            TopAbs_ShapeEnum::TopAbs_SHAPE,
        )?;
        while explorer.More()? {
            let edge = owned(explorer.Current()?);
            BRepLib::BuildCurves3d_shape_real_shape_int2(
                &edge,
                CURVE_TOLERANCE,
                GeomAbs_Shape::GeomAbs_C1,
                14,
                0,
            )?;
            edges.push(edge);
            explorer.pin_mut().Next()?;
        }
    }
    Ok(edges)
}

/// Projects `shape` from a camera given as `[originX, originY, originZ, dirX, dirY, dirZ, upX,
/// upY, upZ]` (projection direction points from the scene towards the camera). `focus` is the
/// focal length of a perspective projection, or `null` for an orthographic one.
#[neon::export(name = "hiddenLineEdges")]
fn hidden_line_edges<'cx>(
    cx: &mut Cx<'cx>,
    shape: &ShapeCell,
    camera: Vec<f64>,
    focus: Option<f64>,
) -> JsResult<'cx, JsObject> {
    let (visible, hidden) = attempt(|| {
        if camera.len() != 9 {
            return Err(OcctError::invalid(format!(
                "camera expects 9 numbers, got {}",
                camera.len()
            )));
        }
        if focus.is_some_and(|focus| !(focus > 0.0)) {
            return Err(OcctError::invalid("focus must be a positive focal length"));
        }
        let origin = pnt(&camera[0..3])?;
        let direction = dir(&camera[3..6])?;
        let up = dir(&camera[6..9])?;

        let mut frame = gp_Ax2_new()?;
        frame.pin_mut().SetAxis(&*gp_Ax1_new_pnt_dir(&origin, &direction)?)?;
        frame.pin_mut().SetYDirection(&up)?;
        let projector = match focus {
            Some(focus) => HLRAlgo_Projector_new_ax2_real(&frame, focus)?,
            None => HLRAlgo_Projector_new_ax2(&frame)?,
        };

        let source = get(shape)?;
        let mut algo = HLRBRep_Algo_new()?;
        Handle_HLRBRep_Algo_get_mut(algo.pin_mut())?.Add_shape_int(&source, 0)?;
        Handle_HLRBRep_Algo_get_mut(algo.pin_mut())?.Projector_projector(&projector)?;
        Handle_HLRBRep_Algo_get_mut(algo.pin_mut())?.Update()?;
        Handle_HLRBRep_Algo_get_mut(algo.pin_mut())?.Hide()?;

        let mut to_shape = HLRBRep_HLRToShape_new_halgo(&algo)?;
        let visible = filtered_edges(&mut to_shape, &VISIBLE_FILTERS)?;
        let hidden = filtered_edges(&mut to_shape, &HIDDEN_FILTERS)?;
        Ok((visible, hidden))
    })
    .or_raise(cx)?;

    let object = cx.empty_object();
    let visible = shapes_to_js(cx, visible)?;
    object.prop(cx, "visible").set(visible)?;
    let hidden = shapes_to_js(cx, hidden)?;
    object.prop(cx, "hidden").set(hidden)?;
    Ok(object)
}
