use neon::prelude::*;
use opencascade_sys::{
    b_rep_fillet_api::{
        BRepFilletAPI_MakeChamfer_new_shape, BRepFilletAPI_MakeFillet_new_shape_filletshape,
    },
    ch_fi3d::ChFi3d_FilletShape,
    topo_ds::{TopoDS_Edge_shape, TopoDS_Face_shape},
};

use crate::{
    builder::finish,
    error::{OcctError, OrThrow, attempt},
    shape::{ShapeCell, ShapeResult, get, shapes_from_js},
};

#[neon::export(name = "featureFillet")]
fn feature_fillet<'cx>(
    cx: &mut Cx<'cx>,
    solid: &ShapeCell,
    edges: Handle<'cx, JsArray>,
    radius: f64,
) -> ShapeResult {
    let edges = shapes_from_js(cx, edges)?;
    attempt(|| {
        if !radius.is_finite() || radius <= 0.0 || edges.is_empty() {
            return Err(OcctError::invalid("fillet requires edges and a positive radius"));
        }
        let solid = get(solid)?;
        let mut maker = BRepFilletAPI_MakeFillet_new_shape_filletshape(
            &solid,
            ChFi3d_FilletShape::ChFi3d_Rational,
        )?;
        for edge in &edges {
            maker.pin_mut().Add_real_edge(radius, TopoDS_Edge_shape(edge)?)?;
        }
        finish!(maker, "BRepFilletAPI_MakeFillet")
    })
    .or_raise(cx)
}

#[neon::export(name = "featureChamfer")]
fn feature_chamfer<'cx>(
    cx: &mut Cx<'cx>,
    solid: &ShapeCell,
    edges: Handle<'cx, JsArray>,
    distance: f64,
    second: f64,
    angle: bool,
    references: Handle<'cx, JsArray>,
) -> ShapeResult {
    let edges = shapes_from_js(cx, edges)?;
    let references = shapes_from_js(cx, references)?;
    attempt(|| {
        if !distance.is_finite()
            || distance <= 0.0
            || !second.is_finite()
            || second <= 0.0
            || edges.is_empty()
            || edges.len() != references.len()
        {
            return Err(OcctError::invalid(
                "chamfer requires edges, matching faces and positive dimensions",
            ));
        }
        let solid = get(solid)?;
        let mut maker = BRepFilletAPI_MakeChamfer_new_shape(&solid)?;
        for (edge, reference) in edges.iter().zip(&references) {
            let face = TopoDS_Face_shape(reference)?;
            if angle {
                maker.pin_mut().AddDA(distance, second, TopoDS_Edge_shape(edge)?, face)?;
            } else {
                maker.pin_mut().Add_real2_edge_face(
                    distance,
                    second,
                    TopoDS_Edge_shape(edge)?,
                    face,
                )?;
            }
        }
        finish!(maker, "BRepFilletAPI_MakeChamfer")
    })
    .or_raise(cx)
}
