//! Port of ocp_gordon `internal/curves_to_surface.py` (Apache-2.0,
//! SPDX-FileCopyrightText: 2018 German Aerospace Center (DLR)): skins a set of compatible curves
//! into a B-spline surface.

use crate::error::{OcctError, OcctResult};
use crate::gordon::bspline_algorithms::{
    REL_TOL_CLOSED, compute_params_bspline_surf, create_common_knots_vector_curve, match_degree,
    scale_curves,
};
use crate::gordon::curve::Curve;
use crate::gordon::points_to_bspline::PointsToBSplineInterpolation;
use crate::gordon::surface::{PointGrid, Surface};

const CONSTRUCTION_TOLERANCE: f64 = 1e-14;
const MAX_INTERPOLATION_DEGREE: usize = 3;

/// Drops periodicity from a curve, returning the clamped replacement when there was any.
fn clamp_bspline(curve: &mut Curve) -> OcctResult<Option<Curve>> {
    if !curve.is_periodic()? {
        return Ok(None);
    }
    curve.set_not_periodic()?;
    let first = curve.first_parameter()?;
    let last = curve.last_parameter()?;
    Ok(Some(curve.clamped(first, last)?))
}

pub(crate) struct CurvesToSurface {
    input_curves: Vec<Curve>,
    compatible_splines: Vec<Curve>,
    parameters: Vec<f64>,
    continuous_if_closed: bool,
}

impl CurvesToSurface {
    /// `parameters` empty means "derive them from the control point grid".
    pub(crate) fn new(
        curves: &[Curve],
        parameters: Vec<f64>,
        continuous_if_closed: bool,
    ) -> OcctResult<Self> {
        let mut input_curves = Vec::with_capacity(curves.len());
        for curve in curves {
            input_curves.push(Curve::from_curve(&curve.as_curve())?);
        }
        match_degree(&mut input_curves)?;

        let mut surface =
            Self { input_curves, compatible_splines: Vec::new(), parameters, continuous_if_closed };
        if surface.parameters.is_empty() {
            surface.calculate_parameters()?;
        }
        if surface.compatible_splines.is_empty() {
            surface.compatible_splines =
                create_common_knots_vector_curve(&surface.input_curves, CONSTRUCTION_TOLERANCE)?;
        }
        Ok(surface)
    }

    fn calculate_parameters(&mut self) -> OcctResult<()> {
        if self.input_curves.is_empty() {
            return Ok(());
        }
        if self.compatible_splines.is_empty() {
            self.compatible_splines =
                create_common_knots_vector_curve(&self.input_curves, CONSTRUCTION_TOLERANCE)?;
        }

        let first = &self.compatible_splines[0];
        let poles_per_curve = first.nb_poles()? as usize;
        let mut control_points = PointGrid::new(poles_per_curve, self.compatible_splines.len());
        for (column, spline) in self.compatible_splines.iter().enumerate() {
            for row in 0..poles_per_curve {
                control_points.set(row, column, spline.pole(row as i32 + 1)?);
            }
        }

        let (_, v_params) = compute_params_bspline_surf(&control_points, 0.5);
        self.parameters = v_params;
        Ok(())
    }

    pub(crate) fn surface(&self) -> OcctResult<Surface> {
        if self.input_curves.len() < 2 {
            return Err(OcctError::invalid("skinning needs at least two curves"));
        }
        if self.parameters.len() != self.input_curves.len() {
            return Err(OcctError::invalid(
                "the amount of given parameters has to equal the amount of given B-splines",
            ));
        }

        let closed_tolerance = scale_curves(&self.input_curves)? * REL_TOL_CLOSED;
        let last_curve = &self.input_curves[self.input_curves.len() - 1];
        let make_closed = self.continuous_if_closed
            && self.input_curves[0].is_equal(last_curve, closed_tolerance)?;

        let first = &self.compatible_splines[0];
        let poles_per_curve = first.nb_poles()?;
        let degree_u = first.degree()?;

        let mut degree_v = 0;
        let mut knots_v = Vec::new();
        let mut multiplicities_v = Vec::new();
        let mut surface_poles = PointGrid::new(0, 0);

        for pole_index in 1..=poles_per_curve {
            let mut interpolation_points = Vec::with_capacity(self.compatible_splines.len());
            for spline in &self.compatible_splines {
                interpolation_points.push(spline.pole(pole_index)?);
            }

            let interpolator = PointsToBSplineInterpolation::new(
                interpolation_points,
                Some(self.parameters.clone()),
                MAX_INTERPOLATION_DEGREE,
                make_closed,
            )?;
            let mut interpolated = interpolator.curve()?;
            if make_closed && let Some(clamped) = clamp_bspline(&mut interpolated)? {
                interpolated = clamped;
            }

            if pole_index == 1 {
                degree_v = interpolated.degree()?;
                knots_v = interpolated.knots()?;
                multiplicities_v = interpolated.multiplicities()?;
                surface_poles =
                    PointGrid::new(poles_per_curve as usize, interpolated.nb_poles()? as usize);
            } else if degree_v != interpolated.degree()? {
                return Err(OcctError::failed(format!(
                    "inconsistent v degree at pole {pole_index}: expected {degree_v}, got {}",
                    interpolated.degree()?
                )));
            }

            for column in 1..=interpolated.nb_poles()? {
                surface_poles.set(
                    pole_index as usize - 1,
                    column as usize - 1,
                    interpolated.pole(column)?,
                );
            }
        }

        Surface::from_poles(
            &surface_poles,
            &first.knots()?,
            &knots_v,
            &first.multiplicities()?,
            &multiplicities_v,
            degree_u,
            degree_v,
        )
    }
}
