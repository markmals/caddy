//! Port of ocp_gordon `internal/gordon_surface_builder.py` (Apache-2.0,
//! SPDX-FileCopyrightText: 2018 German Aerospace Center (DLR)):
//! `S_Gordon = S_Profiles + S_Guides - S_TensorProduct`.

use crate::error::{OcctError, OcctResult};
use crate::gordon::bspline_algorithms::{
    REL_TOL_CLOSED, is_u_dir_closed, is_v_dir_closed, scale_curves, scale_grid,
};
use crate::gordon::curve::{Curve, distance};
use crate::gordon::curves_to_surface::CurvesToSurface;
use crate::gordon::points_to_bspline::PointsToBSplineInterpolation;
use crate::gordon::surface::{Direction, PointGrid, Surface};

const KNOT_MATCH_TOLERANCE: f64 = 1e-7;
const RANGE_TOLERANCE: f64 = 1e-5;

/// Interpolates a point grid: u-direction curves first, then skinned in v.
fn points_to_surface(
    points: &PointGrid,
    u_params: &[f64],
    v_params: &[f64],
    make_u_closed: bool,
    make_v_closed: bool,
) -> OcctResult<Surface> {
    let mut u_direction_curves = Vec::with_capacity(points.columns());
    for column in 0..points.columns() {
        let interpolator = PointsToBSplineInterpolation::new(
            points.column(column),
            Some(u_params.to_vec()),
            3,
            make_u_closed,
        )?;
        u_direction_curves.push(interpolator.curve()?);
    }
    CurvesToSurface::new(&u_direction_curves, v_params.to_vec(), make_v_closed)?.surface()
}

/// Re-expresses every surface on the union of all three knot vectors, in both directions.
fn create_common_knots_vector_surface(surfaces: Vec<Surface>) -> OcctResult<Vec<Surface>> {
    let mut result = surfaces;
    for direction in [Direction::U, Direction::V] {
        let mut all_knots = Vec::new();
        for surface in &result {
            for index in 1..=surface.nb_knots(direction)? {
                all_knots.push(surface.knot(direction, index)?);
            }
        }
        all_knots.sort_by(|left, right| left.partial_cmp(right).expect("knots are finite"));
        all_knots.dedup();

        let mut multiplicities = Vec::with_capacity(all_knots.len());
        for knot in &all_knots {
            let mut maximum = 0;
            for surface in &result {
                for index in 1..=surface.nb_knots(direction)? {
                    if (surface.knot(direction, index)? - knot).abs() < KNOT_MATCH_TOLERANCE {
                        maximum = maximum.max(surface.multiplicity(direction, index)?);
                        break;
                    }
                }
            }
            multiplicities.push(maximum);
        }

        for surface in &mut result {
            surface.insert_knots(direction, &all_knots, &multiplicities, KNOT_MATCH_TOLERANCE)?;
        }
    }
    Ok(result)
}

fn assert_range(curve: &Curve, umin: f64, umax: f64) -> OcctResult<()> {
    if (curve.first_parameter()? - umin).abs() > RANGE_TOLERANCE
        || (curve.last_parameter()? - umax).abs() > RANGE_TOLERANCE
    {
        return Err(OcctError::failed(format!("curve not in range [{umin}, {umax}]")));
    }
    Ok(())
}

fn check_curve_network_compatibility(
    profiles: &[Curve],
    guides: &[Curve],
    u_params: &[f64],
    v_params: &[f64],
    tolerance: f64,
) -> OcctResult<()> {
    let splines_scale = 0.5 * (scale_curves(profiles)? + scale_curves(guides)?);

    if u_params[0].abs() > splines_scale * tolerance
        || (u_params[u_params.len() - 1] - 1.0).abs() > splines_scale * tolerance
    {
        return Err(OcctError::failed(
            "B-splines in u-direction mustn't stick out, spline network must be closed",
        ));
    }
    if v_params[0].abs() > splines_scale * tolerance
        || (v_params[v_params.len() - 1] - 1.0).abs() > splines_scale * tolerance
    {
        return Err(OcctError::failed(
            "B-splines in v-direction mustn't stick out, spline network must be closed",
        ));
    }

    for (u_index, u_param) in u_params.iter().enumerate() {
        let guide = &guides[u_index];
        for (v_index, v_param) in v_params.iter().enumerate() {
            let profile = &profiles[v_index];
            let on_profile = profile.value(*u_param)?;
            let on_guide = guide.value(*v_param)?;
            if distance(on_profile, on_guide) > splines_scale * tolerance {
                return Err(OcctError::failed(
                    "B-spline network is incompatible (wrong parametrization) or intersection \
                     parameters are in the wrong order",
                ));
            }
        }
    }
    Ok(())
}

/// Builds the Gordon surface of an already compatible curve network.
pub(crate) fn build_gordon_surface(
    profiles: &[Curve],
    guides: &[Curve],
    u_params: &[f64],
    v_params: &[f64],
    tolerance: f64,
) -> OcctResult<Surface> {
    if profiles.len() < 2 {
        return Err(OcctError::invalid("there must be at least two profiles for a Gordon surface"));
    }
    if guides.len() < 2 {
        return Err(OcctError::invalid("there must be at least two guides for a Gordon surface"));
    }

    let (umin, umax) = (profiles[0].first_parameter()?, profiles[0].last_parameter()?);
    for profile in profiles {
        assert_range(profile, umin, umax)?;
    }
    let (vmin, vmax) = (guides[0].first_parameter()?, guides[0].last_parameter()?);
    for guide in guides {
        assert_range(guide, vmin, vmax)?;
    }

    check_curve_network_compatibility(profiles, guides, u_params, v_params, tolerance)?;

    let mut intersection_points = PointGrid::new(u_params.len(), v_params.len());
    for (profile_index, profile) in profiles.iter().enumerate() {
        for (parameter_index, parameter) in u_params.iter().enumerate() {
            intersection_points.set(parameter_index, profile_index, profile.value(*parameter)?);
        }
    }

    let curve_u_tolerance = REL_TOL_CLOSED * scale_curves(guides)?;
    let curve_v_tolerance = REL_TOL_CLOSED * scale_curves(profiles)?;
    let tensor_tolerance = REL_TOL_CLOSED * scale_grid(&intersection_points);

    let make_u_closed = is_u_dir_closed(&intersection_points, tensor_tolerance)
        && guides[0].is_equal(&guides[guides.len() - 1], curve_u_tolerance)?;
    let make_v_closed = is_v_dir_closed(&intersection_points, tensor_tolerance)
        && profiles[0].is_equal(&profiles[profiles.len() - 1], curve_v_tolerance)?;

    let surface_profiles =
        CurvesToSurface::new(profiles, v_params.to_vec(), make_v_closed)?.surface()?;
    let mut surface_guides =
        CurvesToSurface::new(guides, u_params.to_vec(), make_u_closed)?.surface()?;
    surface_guides.exchange_uv()?;

    let tensor_product =
        points_to_surface(&intersection_points, u_params, v_params, make_u_closed, make_v_closed)?;

    let degree_u = surface_guides
        .degree(Direction::U)?
        .max(surface_profiles.degree(Direction::U)?)
        .max(tensor_product.degree(Direction::U)?);
    let degree_v = surface_guides
        .degree(Direction::V)?
        .max(surface_profiles.degree(Direction::V)?)
        .max(tensor_product.degree(Direction::V)?);

    let mut surfaces = vec![surface_guides, surface_profiles, tensor_product];
    for surface in &mut surfaces {
        surface.increase_degree(degree_u, degree_v)?;
    }
    let surfaces = create_common_knots_vector_surface(surfaces)?;

    let [guides_surface, profiles_surface, tensor_surface] = surfaces
        .try_into()
        .map_err(|_| OcctError::failed("expected three Gordon component surfaces"))?;

    let poles_match = guides_surface.nb_u_poles()? == profiles_surface.nb_u_poles()?
        && profiles_surface.nb_u_poles()? == tensor_surface.nb_u_poles()?
        && guides_surface.nb_v_poles()? == profiles_surface.nb_v_poles()?
        && profiles_surface.nb_v_poles()? == tensor_surface.nb_v_poles()?;
    if !poles_match {
        return Err(OcctError::failed("Gordon component surfaces have different pole counts"));
    }

    let mut gordon = profiles_surface.copied()?;
    for u_index in 1..=gordon.nb_u_poles()? {
        for v_index in 1..=gordon.nb_v_poles()? {
            let from_profiles = profiles_surface.pole(u_index, v_index)?;
            let from_guides = guides_surface.pole(u_index, v_index)?;
            let from_tensor = tensor_surface.pole(u_index, v_index)?;
            gordon.set_pole(
                u_index,
                v_index,
                [
                    from_profiles[0] + from_guides[0] - from_tensor[0],
                    from_profiles[1] + from_guides[1] - from_tensor[1],
                    from_profiles[2] + from_guides[2] - from_tensor[2],
                ],
            )?;
        }
    }

    Ok(gordon)
}
