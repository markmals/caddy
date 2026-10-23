//! Conversions between the JavaScript wire formats (Float64Arrays) and OCCT `gp` values.
//!
//! Wire formats:
//!   point / vector / direction: `[x, y, z]`
//!   axis (gp_Ax1):              `[ox, oy, oz, dx, dy, dz]`
//!   frame (gp_Ax2 / gp_Ax3):    `[ox, oy, oz, zx, zy, zz, xx, xy, xz]` (origin, Z dir, X dir)
//!   transform (gp_Trsf):        3x4 row-major matrix `[a11, a12, a13, a14, a21, ..., a34]`

use cxx::UniquePtr;
use opencascade_sys::gp::{
    gp_Ax1, gp_Ax1_new_pnt_dir, gp_Ax2, gp_Ax2_new_pnt_dir2, gp_Ax3, gp_Ax3_new_ax2, gp_Dir,
    gp_Dir_new_real3, gp_GTrsf, gp_GTrsf_new, gp_Pnt, gp_Pnt_new_real3, gp_Trsf, gp_Trsf_new,
    gp_Vec, gp_Vec_new_real3,
};

use crate::error::{OcctError, OcctResult};

fn expect_len(values: &[f64], len: usize, what: &str) -> OcctResult<()> {
    if values.len() != len {
        return Err(OcctError::invalid(format!(
            "{what} expects {len} numbers, got {}",
            values.len()
        )));
    }
    if values.iter().any(|v| !v.is_finite()) {
        return Err(OcctError::invalid(format!("{what} contains a non-finite number")));
    }
    Ok(())
}

pub fn pnt(values: &[f64]) -> OcctResult<UniquePtr<gp_Pnt>> {
    expect_len(values, 3, "point")?;
    Ok(gp_Pnt_new_real3(values[0], values[1], values[2])?)
}

pub fn vector(values: &[f64]) -> OcctResult<UniquePtr<gp_Vec>> {
    expect_len(values, 3, "vector")?;
    Ok(gp_Vec_new_real3(values[0], values[1], values[2])?)
}

fn direction(x: f64, y: f64, z: f64, what: &str) -> OcctResult<UniquePtr<gp_Dir>> {
    if (x * x + y * y + z * z).sqrt() <= 1e-12 {
        return Err(OcctError::invalid(format!("{what} must be non-zero")));
    }
    Ok(gp_Dir_new_real3(x, y, z)?)
}

pub fn dir(values: &[f64]) -> OcctResult<UniquePtr<gp_Dir>> {
    expect_len(values, 3, "direction")?;
    direction(values[0], values[1], values[2], "direction")
}

pub fn ax1(values: &[f64]) -> OcctResult<UniquePtr<gp_Ax1>> {
    expect_len(values, 6, "axis")?;
    let origin = gp_Pnt_new_real3(values[0], values[1], values[2])?;
    let direction = direction(values[3], values[4], values[5], "axis direction")?;
    Ok(gp_Ax1_new_pnt_dir(&origin, &direction)?)
}

pub fn ax2(values: &[f64]) -> OcctResult<UniquePtr<gp_Ax2>> {
    expect_len(values, 9, "frame")?;
    let origin = gp_Pnt_new_real3(values[0], values[1], values[2])?;
    let main = direction(values[3], values[4], values[5], "frame Z direction")?;
    let x = direction(values[6], values[7], values[8], "frame X direction")?;
    Ok(gp_Ax2_new_pnt_dir2(&origin, &main, &x)?)
}

pub fn ax3(values: &[f64]) -> OcctResult<UniquePtr<gp_Ax3>> {
    Ok(gp_Ax3_new_ax2(&*ax2(values)?)?)
}

pub fn trsf_from(matrix: &[f64]) -> OcctResult<UniquePtr<gp_Trsf>> {
    expect_len(matrix, 12, "transform")?;
    let mut trsf = gp_Trsf_new()?;
    let m = matrix;
    trsf.pin_mut()
        .SetValues(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9], m[10], m[11])?;
    Ok(trsf)
}

pub fn gtrsf_from(matrix: &[f64]) -> OcctResult<UniquePtr<gp_GTrsf>> {
    expect_len(matrix, 12, "general transform")?;
    let mut gtrsf = gp_GTrsf_new()?;
    for row in 1..=3 {
        for col in 1..=4 {
            let value = matrix[((row - 1) * 4 + (col - 1)) as usize];
            gtrsf.pin_mut().SetValue(row, col, value)?;
        }
    }
    Ok(gtrsf)
}

pub fn trsf_to_vec(trsf: &gp_Trsf) -> OcctResult<Vec<f64>> {
    let mut matrix = Vec::with_capacity(12);
    for row in 1..=3 {
        for col in 1..=4 {
            matrix.push(trsf.Value(row, col)?);
        }
    }
    Ok(matrix)
}

pub fn xyz(point: &gp_Pnt) -> OcctResult<[f64; 3]> {
    Ok([point.X()?, point.Y()?, point.Z()?])
}

pub fn vec_xyz(vector: &gp_Vec) -> OcctResult<[f64; 3]> {
    Ok([vector.X()?, vector.Y()?, vector.Z()?])
}

pub fn dir_xyz(direction: &gp_Dir) -> OcctResult<[f64; 3]> {
    Ok([direction.X()?, direction.Y()?, direction.Z()?])
}
