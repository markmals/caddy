//! Oriented (minimum-volume) bounding boxes.

use neon::prelude::*;
use opencascade_sys::{b_rep_bnd_lib::BRepBndLib, bnd::Bnd_OBB_new, gp::gp_XYZ};

use crate::{
    error::{OcctResult, OrThrow, attempt},
    shape::{ShapeCell, get},
};

fn xyz(coordinates: &gp_XYZ) -> OcctResult<[f64; 3]> {
    Ok([coordinates.X()?, coordinates.Y()?, coordinates.Z()?])
}

/// `[cx, cy, cz, xdx, xdy, xdz, ydx, ydy, ydz, zdx, zdy, zdz, hx, hy, hz]` — the centre, the
/// three principal directions and the half extent along each of them — or empty for a void box.
///
/// Matches build123d's `OrientedBoundBox`: triangulation is used when present, OCCT's slower
/// optimal search is not, and the shape's own tolerance widens the box.
#[neon::export(name = "orientedBoundingBox")]
fn oriented_bounding_box<'cx>(cx: &mut Cx<'cx>, shape: &ShapeCell) -> NeonResult<Vec<f64>> {
    let shape = get(shape).or_raise(cx)?;
    let result = attempt(|| {
        let mut bounds = Bnd_OBB_new()?;
        BRepBndLib::AddOBB(&shape, bounds.pin_mut(), true, false, true)?;
        if bounds.IsVoid()? {
            return Ok(Vec::new());
        }
        let mut values = Vec::with_capacity(15);
        values.extend(xyz(bounds.Center()?)?);
        values.extend(xyz(bounds.XDirection()?)?);
        values.extend(xyz(bounds.YDirection()?)?);
        values.extend(xyz(bounds.ZDirection()?)?);
        values.extend([bounds.XHSize()?, bounds.YHSize()?, bounds.ZHSize()?]);
        Ok(values)
    });
    result.or_raise(cx)
}
