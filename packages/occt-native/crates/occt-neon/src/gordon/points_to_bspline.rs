//! Port of ocp_gordon `internal/points_to_bspline_interpolation.py` (Apache-2.0,
//! SPDX-FileCopyrightText: 2018 German Aerospace Center (DLR)): B-spline interpolation of a point
//! sequence with Park (2000) node and knot selection.

use opencascade_sys::{
    b_spl_c_lib::BSplCLib,
    t_col_std::{
        TColStd_Array1OfInteger_new, TColStd_Array1OfInteger_value, TColStd_Array1OfReal_new,
        TColStd_Array1OfReal_value,
    },
};

use crate::error::{OcctError, OcctResult};
use crate::gordon::bspline_algorithms::{
    bspline_basis_mat, compute_params_bspline_curve, knots_from_curve_parameters,
    points_form_closed_curve,
};
use crate::gordon::curve::{Curve, Point, real_array};
use crate::gordon::linalg::Matrix;

pub(crate) struct PointsToBSplineInterpolation {
    points: Vec<Point>,
    params: Vec<f64>,
    max_degree: usize,
    c2_continuous: bool,
}

impl PointsToBSplineInterpolation {
    pub(crate) fn new(
        points: Vec<Point>,
        parameters: Option<Vec<f64>>,
        max_degree: usize,
        continuous_if_closed: bool,
    ) -> OcctResult<Self> {
        let params = parameters.unwrap_or_else(|| compute_params_bspline_curve(&points, 0.5));
        if max_degree < 1 {
            return Err(OcctError::invalid("degree must be larger than 1 in interpolation"));
        }
        if points.len() < 2 {
            return Err(OcctError::invalid("too few points to interpolate"));
        }
        if params.len() != points.len() {
            return Err(OcctError::invalid(format!(
                "number of parameters {} and points {} don't match in interpolation",
                params.len(),
                points.len()
            )));
        }
        Ok(Self { points, params, max_degree, c2_continuous: continuous_if_closed })
    }

    fn is_closed(&self) -> bool {
        points_form_closed_curve(&self.points, self.c2_continuous)
    }

    fn degree(&self) -> OcctResult<usize> {
        let mut available = self.points.len() - 1;
        if self.is_closed() {
            available -= 1;
        }
        let degree = available.min(self.max_degree);
        if degree == 0 {
            return Err(OcctError::invalid("invalid degree computed for interpolation"));
        }
        Ok(degree)
    }

    fn needs_shifting(&self) -> OcctResult<bool> {
        Ok(self.degree()? % 2 == 0 && self.is_closed())
    }

    pub(crate) fn curve(&self) -> OcctResult<Curve> {
        let degree = self.degree()?;
        let closed = self.is_closed();
        let mut params = self.params.clone();
        let mut knots = knots_from_curve_parameters(&mut params, degree, closed)?;
        if closed {
            params.pop();
        }

        let basis = bspline_basis_mat(degree as i32, &knots, &params, 0)?;
        let n_params = params.len();
        let mut lhs = Matrix::zeros(n_params, n_params);
        for row in 0..n_params {
            for column in 0..n_params {
                lhs.set(row, column, basis.at(row, column));
            }
        }
        if closed {
            for column in 0..degree {
                for row in 0..n_params {
                    lhs.add_at(row, column, basis.at(row, n_params + column));
                }
            }
        }

        let mut rhs = Matrix::zeros(n_params, 3);
        for row in 0..n_params {
            let point = self.points[row];
            for axis in 0..3 {
                rhs.set(row, axis, point[axis]);
            }
        }

        let solution = lhs.solve(&rhs).map_err(|error| {
            OcctError::failed(format!("singular matrix in interpolation: {error}"))
        })?;

        let mut n_control_points = if closed { self.params.len() + degree - 1 } else { n_params };
        if self.needs_shifting()? {
            n_control_points += 1;
        }

        let mut poles = vec![[0.0; 3]; n_control_points];
        for row in 0..n_params {
            poles[row] = [solution.at(row, 0), solution.at(row, 1), solution.at(row, 2)];
        }
        if closed {
            for index in 0..degree {
                poles[n_params + index] =
                    [solution.at(index, 0), solution.at(index, 1), solution.at(index, 2)];
            }
        }
        if self.needs_shifting()? {
            let last = knots[knots.len() - 1];
            knots.push(last + knots[2 * degree + 1] - knots[2 * degree]);
            poles[n_params + degree] = poles[degree];
            let shift = params[0];
            for knot in &mut knots {
                *knot -= shift;
            }
        }

        let (unique_knots, multiplicities) = unique_knots_from_sequence(&knots)?;
        let result =
            Curve::from_poles(&poles, &unique_knots, &multiplicities, degree as i32, false)?;

        if closed {
            let first = self.params[0];
            let last = self.params[self.params.len() - 1];
            return result.clamped(first, last);
        }
        Ok(result)
    }
}

/// `BSplCLib::Knots`: collapses a flat knot sequence into distinct knots and multiplicities.
fn unique_knots_from_sequence(sequence: &[f64]) -> OcctResult<(Vec<f64>, Vec<i32>)> {
    let flat = real_array(sequence)?;
    let count = BSplCLib::KnotsLength(&flat, false)?;
    let mut knots = TColStd_Array1OfReal_new(1, count)?;
    let mut multiplicities = TColStd_Array1OfInteger_new(1, count)?;
    BSplCLib::Knots(&flat, knots.pin_mut(), multiplicities.pin_mut(), false)?;

    let mut unique = Vec::with_capacity(count as usize);
    let mut mults = Vec::with_capacity(count as usize);
    for index in 1..=count {
        unique.push(TColStd_Array1OfReal_value(&knots, index)?);
        mults.push(TColStd_Array1OfInteger_value(&multiplicities, index)?);
    }
    Ok((unique, mults))
}
