//! Port of ocp_gordon `internal/bspline_approx_interp.py` (Apache-2.0,
//! SPDX-FileCopyrightText: 2018 German Aerospace Center (DLR)): least-squares approximation of a
//! point sequence with some points pinned down exactly.

use opencascade_sys::{
    b_spl_c_lib::BSplCLib,
    t_col_std::{TColStd_Array1OfReal_new, TColStd_Array1OfReal_value},
};

use crate::error::{OcctError, OcctResult};
use crate::gordon::bspline_algorithms::{bspline_basis_mat, insert_knot_with_multiplicity};
use crate::gordon::curve::{Curve, Point, distance, dot, integer_array, real_array};
use crate::gordon::linalg::Matrix;

pub(crate) struct ApproxResult {
    pub(crate) curve: Curve,
    pub(crate) error: f64,
}

pub(crate) struct BSplineApproxInterp {
    points: Vec<Point>,
    index_of_approximated: Vec<usize>,
    index_of_interpolated: Vec<usize>,
    index_of_kinks: Vec<usize>,
    degree: i32,
    n_control_points: usize,
    c2_continuous: bool,
}

impl BSplineApproxInterp {
    pub(crate) fn new(
        points: Vec<Point>,
        n_control_points: usize,
        degree: i32,
        continuous_if_closed: bool,
    ) -> Self {
        let index_of_approximated = (0..points.len()).collect();
        Self {
            points,
            index_of_approximated,
            index_of_interpolated: Vec::new(),
            index_of_kinks: Vec::new(),
            degree,
            n_control_points,
            c2_continuous: continuous_if_closed,
        }
    }

    /// Moves a point from the approximated set to the interpolated set.
    pub(crate) fn interpolate_point(&mut self, index: usize, with_kink: bool) -> OcctResult<()> {
        let Some(position) = self.index_of_approximated.iter().position(|value| *value == index)
        else {
            return Err(OcctError::invalid("invalid index in B-spline approximation"));
        };
        self.index_of_approximated.remove(position);
        self.index_of_interpolated.push(index);
        if with_kink {
            self.index_of_kinks.push(index);
        }
        Ok(())
    }

    /// Diagonal of the point cloud's bounding box.
    fn bounding_box_diagonal(&self) -> f64 {
        let Some(first) = self.points.first() else {
            return 0.0;
        };
        let mut low = *first;
        let mut high = *first;
        for point in &self.points {
            for axis in 0..3 {
                low[axis] = low[axis].min(point[axis]);
                high[axis] = high[axis].max(point[axis]);
            }
        }
        let delta = [high[0] - low[0], high[1] - low[1], high[2] - low[2]];
        dot(delta, delta).sqrt()
    }

    fn is_closed(&self) -> bool {
        if !self.c2_continuous {
            return false;
        }
        let tolerance = 1e-12 * self.bounding_box_diagonal();
        let (Some(first), Some(last)) = (self.points.first(), self.points.last()) else {
            return false;
        };
        distance(*first, *last) <= tolerance
    }

    fn first_and_last_interpolated(&self) -> bool {
        let last = self.points.len() - 1;
        self.index_of_interpolated.contains(&0) && self.index_of_interpolated.contains(&last)
    }

    fn compute_knots(&self, params: &[f64]) -> OcctResult<(Vec<f64>, Vec<i32>)> {
        let order = self.degree + 1;
        if (self.n_control_points as i32) < order {
            return Err(OcctError::invalid("number of control points too small"));
        }

        let umin = params.iter().copied().fold(f64::INFINITY, f64::min);
        let umax = params.iter().copied().fold(f64::NEG_INFINITY, f64::max);

        let count = self.n_control_points - self.degree as usize + 1;
        let mut knots = vec![0.0; count];
        let mut multiplicities = vec![0; count];

        knots[0] = umin;
        multiplicities[0] = order;

        let inner = self.n_control_points as i32 - order;
        for index in 1..=inner as usize {
            knots[index] = umin + (umax - umin) * index as f64 / (inner + 1) as f64;
            multiplicities[index] = 1;
        }
        knots[inner as usize + 1] = umax;
        multiplicities[inner as usize + 1] = order;

        for kink in &self.index_of_kinks {
            insert_knot_with_multiplicity(
                params[*kink],
                self.degree,
                self.degree,
                &mut knots,
                &mut multiplicities,
                1e-4,
            )?;
        }

        Ok((knots, multiplicities))
    }

    /// Iteratively re-fits while re-projecting the approximated points onto the latest curve.
    pub(crate) fn fit_curve_optimal(&self, params: &[f64]) -> OcctResult<ApproxResult> {
        if params.len() != self.points.len() {
            return Err(OcctError::invalid("number of parameters doesn't match number of points"));
        }

        let mut params = params.to_vec();
        let (knots, multiplicities) = self.compute_knots(&params)?;

        let max_iterations = 10;
        let mut result = self.solve(&params, &knots, &multiplicities)?;
        let mut old_error = result.error * 2.0;
        let mut iteration = 0;

        while result.error > 0.0
            && (old_error - result.error) / result.error.max(1e-6) > 1e-3
            && iteration < max_iterations
        {
            old_error = result.error;
            self.optimize_parameters(&result.curve, &mut params)?;
            result = self.solve(&params, &knots, &multiplicities)?;
            iteration += 1;
        }

        Ok(result)
    }

    fn continuity_matrix(
        &self,
        n_control_points: usize,
        conditions: usize,
        params: &[f64],
        flat_knots: &[f64],
    ) -> OcctResult<Matrix> {
        let mut entries = Matrix::zeros(conditions, n_control_points);
        let start = [params[0]];
        let end = [params[params.len() - 1]];

        let first_start = bspline_basis_mat(self.degree, flat_knots, &start, 1)?;
        let first_end = bspline_basis_mat(self.degree, flat_knots, &end, 1)?;
        let second_start = bspline_basis_mat(self.degree, flat_knots, &start, 2)?;
        let second_end = bspline_basis_mat(self.degree, flat_knots, &end, 2)?;

        for column in 0..n_control_points {
            entries.set(0, column, first_start.at(0, column) - first_end.at(0, column));
            entries.set(1, column, second_start.at(0, column) - second_end.at(0, column));
        }

        if !self.first_and_last_interpolated() {
            let value_start = bspline_basis_mat(self.degree, flat_knots, &start, 0)?;
            let value_end = bspline_basis_mat(self.degree, flat_knots, &end, 0)?;
            for column in 0..n_control_points {
                entries.set(2, column, value_start.at(0, column) - value_end.at(0, column));
            }
        }

        Ok(entries)
    }

    fn solve(
        &self,
        params: &[f64],
        knots: &[f64],
        multiplicities: &[i32],
    ) -> OcctResult<ApproxResult> {
        let flat_knots = flat_knot_sequence(knots, multiplicities, self.degree)?;

        let n_approximated = self.index_of_approximated.len();
        let n_interpolated = self.index_of_interpolated.len();
        let make_closed = self.is_closed();
        let n_continuity =
            if make_closed { if self.first_and_last_interpolated() { 2 } else { 3 } } else { 0 };

        let n_control_points = flat_knots.len() - self.degree as usize - 1;
        if n_control_points < n_interpolated + n_continuity
            || n_control_points < self.degree as usize + 1 + n_continuity
        {
            return Err(OcctError::invalid("too few control points for curve interpolation"));
        }
        if n_approximated == 0 && n_control_points != n_interpolated + n_continuity {
            return Err(OcctError::invalid("wrong number of control points for interpolation"));
        }

        let n_variables = n_control_points + n_interpolated + n_continuity;
        let mut lhs = Matrix::zeros(n_variables, n_variables);
        let mut rhs = Matrix::zeros(n_variables, 3);

        if n_approximated > 0 {
            let approximated_params: Vec<f64> =
                self.index_of_approximated.iter().map(|index| params[*index]).collect();
            let mut targets = Matrix::zeros(n_approximated, 3);
            for (row, index) in self.index_of_approximated.iter().enumerate() {
                let point = self.points[*index];
                for axis in 0..3 {
                    targets.set(row, axis, point[axis]);
                }
            }
            let basis = bspline_basis_mat(self.degree, &flat_knots, &approximated_params, 0)?;
            let transposed = basis.transposed();
            lhs.set_block(0, 0, &transposed.multiplied(&basis));
            rhs.set_block(0, 0, &transposed.multiplied(&targets));
        }

        if n_interpolated + n_continuity > 0 {
            let mut pinned = Matrix::zeros(n_interpolated + n_continuity, 3);
            if n_interpolated > 0 {
                let interpolated_params: Vec<f64> =
                    self.index_of_interpolated.iter().map(|index| params[*index]).collect();
                for (row, index) in self.index_of_interpolated.iter().enumerate() {
                    let point = self.points[*index];
                    for axis in 0..3 {
                        pinned.set(row, axis, point[axis]);
                    }
                }
                let basis = bspline_basis_mat(self.degree, &flat_knots, &interpolated_params, 0)?;
                lhs.set_block(0, n_control_points, &basis.transposed());
                lhs.set_block(n_control_points, 0, &basis);
            }

            if make_closed {
                let entries =
                    self.continuity_matrix(n_control_points, n_continuity, params, &flat_knots)?;
                let start = n_control_points + n_interpolated;
                lhs.set_block(start, 0, &entries);
                lhs.set_block(0, start, &entries.transposed());
            }

            rhs.set_block(n_control_points, 0, &pinned);
        }

        for index in 0..n_variables {
            lhs.add_at(index, index, 1e-15);
        }
        let solution = lhs
            .solve(&rhs)
            .map_err(|error| OcctError::failed(format!("singular matrix: {error}")))?;

        let poles: Vec<Point> = (0..n_control_points)
            .map(|row| [solution.at(row, 0), solution.at(row, 1), solution.at(row, 2)])
            .collect();
        let curve = Curve::from_poles(&poles, knots, multiplicities, self.degree, false)?;

        let mut max_error = 0.0f64;
        for index in &self.index_of_approximated {
            let value = curve.value(params[*index])?;
            max_error = max_error.max(distance(value, self.points[*index]));
        }

        Ok(ApproxResult { curve, error: max_error })
    }

    fn optimize_parameters(&self, curve: &Curve, params: &mut [f64]) -> OcctResult<()> {
        for index in &self.index_of_approximated {
            params[*index] = project_on_curve(self.points[*index], curve, params[*index])?;
        }
        Ok(())
    }
}

/// Newton refinement of the parameter of the closest point on `curve`.
fn project_on_curve(point: Point, curve: &Curve, initial: f64) -> OcctResult<f64> {
    let max_iterations = 10;
    let epsilon = 1.0e-6;
    let first = curve.first_parameter()?;
    let last = curve.last_parameter()?;

    let mut parameter = initial;
    let mut next = initial;
    for _ in 0..max_iterations {
        parameter = next;
        let (position, tangent, curvature) = curve.d2(parameter)?;
        let difference = [position[0] - point[0], position[1] - point[1], position[2] - point[2]];
        let slope = dot(difference, tangent);
        let second = dot(difference, curvature) + dot(tangent, tangent);
        if second.abs() < 1e-12 {
            break;
        }
        let step = -slope / second;
        if step.abs() < epsilon {
            break;
        }
        next = parameter + step;
        if next < first || next > last {
            break;
        }
    }
    Ok(parameter)
}

fn flat_knot_sequence(knots: &[f64], multiplicities: &[i32], degree: i32) -> OcctResult<Vec<f64>> {
    let knot_array = real_array(knots)?;
    let multiplicity_array = integer_array(multiplicities)?;
    let length = BSplCLib::KnotSequenceLength(&multiplicity_array, degree, false)?;
    let mut sequence = TColStd_Array1OfReal_new(1, length)?;
    BSplCLib::KnotSequence_array1ofreal_array1ofinteger_array1ofreal_bool(
        &knot_array,
        &multiplicity_array,
        sequence.pin_mut(),
        false,
    )?;
    (1..=length).map(|index| Ok(TColStd_Array1OfReal_value(&sequence, index)?)).collect()
}
