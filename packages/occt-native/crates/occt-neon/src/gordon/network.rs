//! Port of ocp_gordon `internal/interpolate_curve_network.py` (Apache-2.0,
//! SPDX-FileCopyrightText: 2018 German Aerospace Center (DLR)): makes a curve network compatible
//! and hands it to the Gordon surface builder.

use opencascade_sys::{
    geom::{
        Geom_Curve_IsKind_str, Handle_Geom_BSplineCurve_from_Geom_Curve, Handle_Geom_Curve,
        Handle_Geom_Curve_get,
    },
    precision::Precision,
};

use crate::error::{OcctError, OcctResult};
use crate::gordon::bspline_algorithms::{PAR_CHECK_TOL, convert_to_bspline, reparametrize_bspline};
use crate::gordon::builder::build_gordon_surface;
use crate::gordon::curve::Curve;
use crate::gordon::intersect::intersect_bsplines;
use crate::gordon::linalg::Matrix;
use crate::gordon::reparametrize::reparametrize_bspline_continuously_approx;
use crate::gordon::sorter::{
    CurveNetworkSorter, first_non_zero_length_index, is_zero_length_curve,
};
use crate::gordon::surface::{Direction, Surface};

const MIN_CONTROL_POINTS: usize = 10;
const MAX_CONTROL_POINTS: usize = 120;

/// `BSplineAlgorithms.to_bsplines`: a B-spline is copied, everything else is converted.
pub(crate) fn to_bspline(curve: &Handle_Geom_Curve) -> OcctResult<Curve> {
    if Geom_Curve_IsKind_str(Handle_Geom_Curve_get(curve)?, "Geom_BSplineCurve")? {
        return Curve::from_handle(Handle_Geom_BSplineCurve_from_Geom_Curve(curve)).copied();
    }
    convert_to_bspline(curve)
}

/// Interpolates a curve network by a Gordon surface.
pub(crate) fn interpolate_curve_network(
    profiles: Vec<Curve>,
    guides: Vec<Curve>,
    spatial_tolerance: f64,
) -> OcctResult<Surface> {
    let mut network = CurveNetwork::new(profiles, guides, spatial_tolerance)?;
    network.make_curves_compatible()?;
    let mut gordon = build_gordon_surface(
        &network.profiles,
        &network.guides,
        &network.intersection_params_u,
        &network.intersection_params_v,
        network.spatial_tolerance,
    )?;
    ensure_c2(&mut gordon, network.spatial_tolerance)?;
    Ok(gordon)
}

struct CurveNetwork {
    profiles: Vec<Curve>,
    guides: Vec<Curve>,
    spatial_tolerance: f64,
    intersection_params_u: Vec<f64>,
    intersection_params_v: Vec<f64>,
}

impl CurveNetwork {
    fn new(profiles: Vec<Curve>, guides: Vec<Curve>, spatial_tolerance: f64) -> OcctResult<Self> {
        if profiles.len() < 2 {
            return Err(OcctError::invalid(
                "there must be at least two profiles for the curve network interpolation",
            ));
        }
        if guides.len() < 2 {
            return Err(OcctError::invalid(
                "there must be at least two guides for the curve network interpolation",
            ));
        }

        let profiles = unique_curves(profiles)?;
        let guides = unique_curves(guides)?;
        if profiles.len() < 2 {
            return Err(OcctError::invalid(
                "there must be at least two unique profiles for the curve network interpolation",
            ));
        }
        if guides.len() < 2 {
            return Err(OcctError::invalid(
                "there must be at least two unique guides for the curve network interpolation",
            ));
        }

        Ok(Self {
            profiles,
            guides,
            spatial_tolerance,
            intersection_params_u: Vec::new(),
            intersection_params_v: Vec::new(),
        })
    }

    fn compute_intersections(&self) -> OcctResult<(Matrix, Matrix)> {
        let mut on_profiles = Matrix::zeros(self.profiles.len(), self.guides.len());
        let mut on_guides = Matrix::zeros(self.profiles.len(), self.guides.len());

        for (profile_index, profile) in self.profiles.iter().enumerate() {
            for (guide_index, guide) in self.guides.iter().enumerate() {
                let found = intersect_bsplines(profile, guide, self.spatial_tolerance)?;
                match found.len() {
                    0 => {
                        return Err(OcctError::invalid(format!(
                            "u-directional B-spline {profile_index} and v-directional B-spline \
                             {guide_index} don't intersect"
                        )));
                    }
                    1 => {
                        on_profiles.set(profile_index, guide_index, found[0].parameter_on_first);
                        on_guides.set(profile_index, guide_index, found[0].parameter_on_second);
                    }
                    2 => {
                        on_profiles.set(
                            profile_index,
                            guide_index,
                            found[0].parameter_on_first.min(found[1].parameter_on_first),
                        );
                        on_guides.set(
                            profile_index,
                            guide_index,
                            found[0].parameter_on_second.min(found[1].parameter_on_second),
                        );
                    }
                    _ => {
                        return Err(OcctError::invalid(format!(
                            "u-directional B-spline {profile_index} and v-directional B-spline \
                             {guide_index} have more than two intersections; surfaces closed in \
                             both directions aren't supported"
                        )));
                    }
                }
            }
        }

        Ok((on_profiles, on_guides))
    }

    fn make_curves_compatible(&mut self) -> OcctResult<()> {
        for profile in &mut self.profiles {
            reparametrize_bspline(profile, 0.0, 1.0)?;
        }
        for guide in &mut self.guides {
            reparametrize_bspline(guide, 0.0, 1.0)?;
        }

        let (on_profiles, on_guides) = self.compute_intersections()?;

        let mut sorter = CurveNetworkSorter::new(
            std::mem::take(&mut self.profiles),
            std::mem::take(&mut self.guides),
            on_profiles,
            on_guides,
        )?;
        sorter.perform()?;

        self.profiles = copy_all(&sorter.profiles)?;
        self.guides = copy_all(&sorter.guides)?;

        for index in 1..self.profiles.len().saturating_sub(1) {
            if is_zero_length_curve(&self.profiles[index])? {
                return Err(OcctError::invalid(format!(
                    "profile #{index} is a point; points are only permitted at the beginning and end"
                )));
            }
        }
        for index in 1..self.guides.len().saturating_sub(1) {
            if is_zero_length_curve(&self.guides[index])? {
                return Err(OcctError::invalid(format!(
                    "guide #{index} is a point; points are only permitted at the beginning and end"
                )));
            }
        }

        let (mut params_u, mut params_v) =
            (sorter.parms_inters_profiles, sorter.parms_inters_guides);

        let Some(first_profile) = first_non_zero_length_index(&self.profiles)? else {
            return Err(OcctError::invalid("no non-zero-length profile found"));
        };
        let Some(first_guide) = first_non_zero_length_index(&self.guides)? else {
            return Err(OcctError::invalid("no non-zero-length guide found"));
        };

        let closed_profile = self.profiles[first_profile].is_closed()?
            || self.profiles[first_profile].is_periodic()?;
        let closed_guides =
            self.guides[first_guide].is_closed()? || self.guides[first_guide].is_periodic()?;
        if closed_profile && closed_guides {
            return Err(OcctError::invalid(
                "both profiles and guides cannot be closed simultaneously",
            ));
        }

        if closed_profile {
            self.guides.push(self.guides[0].copied()?);
            params_u = grow_columns(&params_u, |row| {
                let value = params_u.at(row, 0);
                if value.abs() < PAR_CHECK_TOL { 1.0 } else { value }
            });
            params_v = grow_columns(&params_v, |row| params_v.at(row, 0));
        } else if closed_guides {
            self.profiles.push(self.profiles[0].copied()?);
            params_u = grow_rows(&params_u, |column| params_u.at(0, column));
            params_v = grow_rows(&params_v, |column| {
                let value = params_v.at(0, column);
                if value.abs() < PAR_CHECK_TOL { 1.0 } else { value }
            });
        }

        self.eliminate_inaccuracies(&mut params_u, &mut params_v)?;

        let mut new_params_profiles = Vec::with_capacity(self.guides.len());
        for column in 0..self.guides.len() {
            let mut sum = 0.0;
            let mut count = 0;
            for (row, profile) in self.profiles.iter().enumerate() {
                if is_zero_length_curve(profile)? {
                    continue;
                }
                sum += params_u.at(row, column);
                count += 1;
            }
            new_params_profiles.push(if count > 0 { sum / count as f64 } else { 0.0 });
        }

        let mut new_params_guides = Vec::with_capacity(self.profiles.len());
        for row in 0..self.profiles.len() {
            let mut sum = 0.0;
            let mut count = 0;
            for (column, guide) in self.guides.iter().enumerate() {
                if is_zero_length_curve(guide)? {
                    continue;
                }
                sum += params_v.at(row, column);
                count += 1;
            }
            new_params_guides.push(if count > 0 { sum / count as f64 } else { 0.0 });
        }

        if new_params_profiles[0] > PAR_CHECK_TOL || new_params_guides[0] > PAR_CHECK_TOL {
            return Err(OcctError::invalid(
                "at least one B-spline has no intersection at the beginning",
            ));
        }

        let max_cp_u = self.max_poles(&self.profiles)?;
        let max_cp_v = self.max_poles(&self.guides)?;
        let min_u = (self.guides.len() + 2).max(MIN_CONTROL_POINTS);
        let min_v = (self.profiles.len() + 2).max(MIN_CONTROL_POINTS);
        let final_max_cp_u = clamp(max_cp_u + 10, min_u, min_u.max(MAX_CONTROL_POINTS));
        let final_max_cp_v = clamp(max_cp_v + 10, min_v, min_v.max(MAX_CONTROL_POINTS));

        self.reparametrize_profiles(&params_u, &mut new_params_profiles, final_max_cp_u)?;
        self.reparametrize_guides(&params_v, &mut new_params_guides, final_max_cp_v)?;

        self.intersection_params_u = new_params_profiles;
        self.intersection_params_v = new_params_guides;
        Ok(())
    }

    fn max_poles(&self, curves: &[Curve]) -> OcctResult<usize> {
        let mut maximum = 0usize;
        for curve in curves {
            maximum = maximum.max(curve.nb_poles()? as usize);
        }
        Ok(maximum)
    }

    fn eliminate_inaccuracies(
        &self,
        params_u: &mut Matrix,
        params_v: &mut Matrix,
    ) -> OcctResult<()> {
        let first_profile_knot = self.profiles[0].knot(1)?;
        for row in 0..self.profiles.len() {
            if (params_u.at(row, 0) - first_profile_knot).abs() < 0.001 {
                let value = if first_profile_knot.abs() < 1e-10 { 0.0 } else { first_profile_knot };
                params_u.set(row, 0, value);
            }
        }

        let first_guide_knot = self.guides[0].knot(1)?;
        for column in 0..self.guides.len() {
            if (params_v.at(0, column) - first_guide_knot).abs() < 0.001 {
                let value = if first_guide_knot.abs() < 1e-10 { 0.0 } else { first_guide_knot };
                params_v.set(0, column, value);
            }
        }

        let last_profile_knot = self.profiles[0].knot(self.profiles[0].nb_knots()?)?;
        let last_column = self.guides.len() - 1;
        for row in 0..self.profiles.len() {
            if (params_u.at(row, last_column) - last_profile_knot).abs() < 0.001 {
                params_u.set(row, last_column, last_profile_knot);
            }
        }

        let last_guide_knot = self.guides[0].knot(self.guides[0].nb_knots()?)?;
        let last_row = self.profiles.len() - 1;
        for column in 0..self.guides.len() {
            if (params_v.at(last_row, column) - last_guide_knot).abs() < 0.001 {
                params_v.set(last_row, column, last_guide_knot);
            }
        }

        Ok(())
    }

    fn reparametrize_profiles(
        &mut self,
        params_u: &Matrix,
        new_parameters: &mut [f64],
        max_control_points: usize,
    ) -> OcctResult<()> {
        for index in 0..self.profiles.len() {
            if is_zero_length_curve(&self.profiles[index])? {
                continue;
            }
            let mut old_parameters: Vec<f64> =
                (0..self.guides.len()).map(|column| params_u.at(index, column)).collect();
            if skip_reparametrize(&self.profiles[index], &old_parameters, new_parameters)? {
                continue;
            }
            snap_endpoints(&mut old_parameters, new_parameters);
            let result = reparametrize_bspline_continuously_approx(
                &self.profiles[index],
                &old_parameters,
                new_parameters,
                max_control_points,
            )?;
            self.profiles[index] = result.curve;
        }
        Ok(())
    }

    fn reparametrize_guides(
        &mut self,
        params_v: &Matrix,
        new_parameters: &mut [f64],
        max_control_points: usize,
    ) -> OcctResult<()> {
        for index in 0..self.guides.len() {
            if is_zero_length_curve(&self.guides[index])? {
                continue;
            }
            let mut old_parameters: Vec<f64> =
                (0..self.profiles.len()).map(|row| params_v.at(row, index)).collect();
            if skip_reparametrize(&self.guides[index], &old_parameters, new_parameters)? {
                continue;
            }
            snap_endpoints(&mut old_parameters, new_parameters);
            let result = reparametrize_bspline_continuously_approx(
                &self.guides[index],
                &old_parameters,
                new_parameters,
                max_control_points,
            )?;
            self.guides[index] = result.curve;
        }
        Ok(())
    }
}

/// Rounds the first parameter to 0 and the last to 1 when they are within `PAR_CHECK_TOL`.
fn snap_endpoints(old_parameters: &mut [f64], new_parameters: &mut [f64]) {
    let last = old_parameters.len() - 1;
    if old_parameters[0].abs() < PAR_CHECK_TOL {
        old_parameters[0] = 0.0;
    }
    if new_parameters[0].abs() < PAR_CHECK_TOL {
        new_parameters[0] = 0.0;
    }
    if (old_parameters[last] - 1.0).abs() < PAR_CHECK_TOL {
        old_parameters[last] = 1.0;
    }
    let new_last = new_parameters.len() - 1;
    if (new_parameters[new_last] - 1.0).abs() < PAR_CHECK_TOL {
        new_parameters[new_last] = 1.0;
    }
}

fn skip_reparametrize(
    curve: &Curve,
    old_parameters: &[f64],
    new_parameters: &[f64],
) -> OcctResult<bool> {
    if curve.is_rational()? || curve.is_periodic()? {
        return Ok(false);
    }
    let tolerance = Precision::PConfusion()?;
    Ok(old_parameters.iter().zip(new_parameters).all(|(old, new)| (old - new).abs() < tolerance))
}

fn unique_curves(curves: Vec<Curve>) -> OcctResult<Vec<Curve>> {
    let tolerance = Precision::PConfusion()?;
    let mut unique: Vec<Curve> = Vec::with_capacity(curves.len());
    for curve in curves {
        let mut duplicate = false;
        for existing in &unique {
            if curve.is_equal(existing, tolerance)? {
                duplicate = true;
                break;
            }
        }
        if !duplicate {
            unique.push(curve);
        }
    }
    Ok(unique)
}

fn copy_all(curves: &[Curve]) -> OcctResult<Vec<Curve>> {
    curves.iter().map(|curve| curve.copied()).collect()
}

/// Appends a column computed from each row.
fn grow_columns(source: &Matrix, value_for_row: impl Fn(usize) -> f64) -> Matrix {
    let mut grown = Matrix::zeros(source.rows(), source.cols() + 1);
    grown.set_block(0, 0, source);
    for row in 0..source.rows() {
        grown.set(row, source.cols(), value_for_row(row));
    }
    grown
}

/// Appends a row computed from each column.
fn grow_rows(source: &Matrix, value_for_column: impl Fn(usize) -> f64) -> Matrix {
    let mut grown = Matrix::zeros(source.rows() + 1, source.cols());
    grown.set_block(0, 0, source);
    for column in 0..source.cols() {
        grown.set(source.rows(), column, value_for_column(column));
    }
    grown
}

fn clamp(value: usize, minimum: usize, maximum: usize) -> usize {
    value.max(minimum).min(maximum)
}

/// Removes surplus inner knot multiplicity so the surface is C2 wherever it can be.
fn ensure_c2(surface: &mut Surface, tolerance: f64) -> OcctResult<()> {
    let min_u_multiplicity = 1.max(surface.degree(Direction::U)? - 2);
    let min_v_multiplicity = 1.max(surface.degree(Direction::V)? - 2);

    let u_knots = surface.nb_knots(Direction::U)?;
    for index in 2..u_knots {
        if surface.multiplicity(Direction::U, index)? > min_u_multiplicity {
            surface.remove_knot(Direction::U, index, min_u_multiplicity, tolerance)?;
        }
    }

    let v_knots = surface.nb_knots(Direction::V)?;
    for index in 2..v_knots {
        if surface.multiplicity(Direction::V, index)? > min_v_multiplicity {
            surface.remove_knot(Direction::V, index, min_v_multiplicity, tolerance)?;
        }
    }

    Ok(())
}
