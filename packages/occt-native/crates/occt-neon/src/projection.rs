use neon::prelude::*;
use opencascade_sys::{
    b_rep_proj::{BRepProj_Projection_Shape, BRepProj_Projection_new_shape2_dir},
    topo_ds::TopoDS_Compound_to_TopoDS_Shape,
};

use crate::{
    convert::dir,
    error::{OcctError, OrThrow, attempt},
    shape::{ShapeCell, ShapeResult, boxed, get},
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
