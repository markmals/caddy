use neon::prelude::*;
use opencascade_sys::{
    b_rep_int_curve_surface::BRepIntCurveSurface_Inter_new,
    b_rep_proj::{
        BRepProj_Projection_Shape, BRepProj_Projection_new_shape2_dir,
        BRepProj_Projection_new_shape2_pnt,
    },
    gp::gp_Lin_new_ax1,
    topo_ds::{TopoDS_Compound_to_TopoDS_Shape, TopoDS_Face_to_TopoDS_Shape},
};

use crate::{
    convert::{ax1, dir, pnt, xyz},
    error::{OcctError, OrThrow, attempt},
    shape::{ShapeCell, ShapeResult, boxed, get, shapes_to_js},
};

#[neon::export(name = "featureProject")]
fn feature_project<'cx>(
    cx: &mut Cx<'cx>,
    profile: &ShapeCell,
    target: &ShapeCell,
    direction: Vec<f64>,
) -> ShapeResult {
    attempt(|| {
        let profile = get(profile)?;
        let target = get(target)?;
        let projection = BRepProj_Projection_new_shape2_dir(&profile, &target, &*dir(&direction)?)?;
        if !projection.IsDone()? || !projection.More()? {
            return Err(OcctError::failed("BRepProj_Projection found no projected wires"));
        }
        let projected = BRepProj_Projection_Shape(&projection)?;
        boxed(TopoDS_Compound_to_TopoDS_Shape(&projected))
    })
    .or_raise(cx)
}

/// Conical projection of a wire onto a shape: every ray passes through `center`
/// (build123d `Wire.project_to_shape(..., center=...)`).
#[neon::export(name = "featureProjectFrom")]
fn feature_project_from<'cx>(
    cx: &mut Cx<'cx>,
    profile: &ShapeCell,
    target: &ShapeCell,
    center: Vec<f64>,
) -> ShapeResult {
    attempt(|| {
        let profile = get(profile)?;
        let target = get(target)?;
        let projection = BRepProj_Projection_new_shape2_pnt(&profile, &target, &*pnt(&center)?)?;
        if !projection.IsDone()? || !projection.More()? {
            return Err(OcctError::failed("BRepProj_Projection found no projected wires"));
        }
        let projected = BRepProj_Projection_Shape(&projection)?;
        boxed(TopoDS_Compound_to_TopoDS_Shape(&projected))
    })
    .or_raise(cx)
}

/// Where an infinite axis pierces a shape's surfaces: `points` holds the hit coordinates as
/// `[x, y, z]` triples and `faces` the surface hit at each one, both ordered along the axis.
#[neon::export(name = "projectionAxisHits")]
fn projection_axis_hits<'cx>(
    cx: &mut Cx<'cx>,
    shape: &ShapeCell,
    axis: Vec<f64>,
    tolerance: f64,
) -> JsResult<'cx, JsObject> {
    let hits = {
        let shape = get(shape).or_raise(cx)?;
        attempt(|| {
            let line = gp_Lin_new_ax1(&*ax1(&axis)?)?;
            let mut intersection = BRepIntCurveSurface_Inter_new()?;
            intersection.pin_mut().Init_shape_lin_real(&shape, &line, tolerance)?;
            let mut hits = Vec::new();
            while intersection.More()? {
                let [x, y, z] = xyz(intersection.Pnt()?)?;
                let along =
                    (x - axis[0]) * axis[3] + (y - axis[1]) * axis[4] + (z - axis[2]) * axis[5];
                hits.push((along, [x, y, z], TopoDS_Face_to_TopoDS_Shape(intersection.Face()?)));
                intersection.pin_mut().Next()?;
            }
            hits.sort_by(|first, second| first.0.total_cmp(&second.0));
            Ok(hits)
        })
        .or_raise(cx)?
    };

    let points = cx.empty_array();
    for (index, coordinate) in hits.iter().flat_map(|hit| hit.1).enumerate() {
        let value = cx.number(coordinate);
        points.prop(cx, index as u32).set(value)?;
    }
    let faces = shapes_to_js(cx, hits.into_iter().map(|hit| hit.2).collect())?;
    let object = cx.empty_object();
    object.prop(cx, "points").set(points)?;
    object.prop(cx, "faces").set(faces)?;
    Ok(object)
}
