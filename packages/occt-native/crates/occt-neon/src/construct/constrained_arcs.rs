//! Circular arcs constrained by tangency, radius or a centre locus (`Geom2dGcc`, build123d's
//! `Edge.make_constrained_arcs`).
//!
//! Tangency targets cross the boundary as a list of edges with one qualifier each followed by a
//! flat `[x, y, ...]` list of points, the order build123d's dispatcher produces. Each solution
//! yields a `[minor, major]` arc pair so the caller can pick the sagitta it wants.

use cxx::UniquePtr;
use neon::prelude::*;
use opencascade_sys::{
    geom2d_adaptor::Handle_Geom2dAdaptor_Curve_get,
    geom2d_api::Geom2dAPI_ProjectPointOnCurve_new_pnt2d_hcurve,
    geom2d_gcc::{
        Geom2dGcc_Circ2d2TanOn_ThisSolution, Geom2dGcc_Circ2d2TanOn_new_hpoint2_curve_real,
        Geom2dGcc_Circ2d2TanOn_new_qualifiedcurve_hpoint_curve_real3,
        Geom2dGcc_Circ2d2TanOn_new_qualifiedcurve2_curve_real4,
        Geom2dGcc_Circ2d2TanRad_ThisSolution, Geom2dGcc_Circ2d2TanRad_new_hpoint2_real2,
        Geom2dGcc_Circ2d2TanRad_new_qualifiedcurve_hpoint_real2,
        Geom2dGcc_Circ2d2TanRad_new_qualifiedcurve2_real2, Geom2dGcc_Circ2d3Tan_ThisSolution,
        Geom2dGcc_Circ2d3Tan_new_qualifiedcurve3_real4,
    },
    gp::{gp_Circ2d, gp_Pnt2d_new_real2},
    topo_ds::TopoDS_Shape,
};

use crate::{
    construct::{
        TOLERANCE,
        geom2d::{
            Contact, Tangency, arc_pair, correct_enclosed, distance_to, qualified_edge, qualifier,
            tangencies,
        },
        positive,
    },
    error::{OcctError, OcctResult, OrThrow, attempt},
    shape::{ShapeCell, get, shapes_from_js, shapes_to_js},
};

fn pairs_to_js<'cx>(
    cx: &mut Cx<'cx>,
    solutions: Vec<Vec<UniquePtr<TopoDS_Shape>>>,
) -> JsResult<'cx, JsArray> {
    let outer = cx.empty_array();
    for (index, arcs) in solutions.into_iter().enumerate() {
        let inner = shapes_to_js(cx, arcs)?;
        outer.set(cx, index as u32, inner)?;
    }
    Ok(outer)
}

fn two_targets(targets: &[Tangency]) -> OcctResult<(&Tangency, &Tangency)> {
    match targets {
        [first, second] => Ok((first, second)),
        _ => Err(OcctError::invalid("exactly two tangency targets are required")),
    }
}

/// Discards solutions whose arc pair is degenerate (coincident or antipodal contacts).
fn keep_arcs(solutions: Vec<Vec<UniquePtr<TopoDS_Shape>>>) -> Vec<Vec<UniquePtr<TopoDS_Shape>>> {
    solutions.into_iter().filter(|arcs| !arcs.is_empty()).collect()
}

/// Arcs of `radius` tangent to two targets (`Geom2dGcc_Circ2d2TanRad`).
#[neon::export(name = "constrainedArcs2TanRad")]
fn constrained_arcs_2tan_rad<'cx>(
    cx: &mut Cx<'cx>,
    edges: Handle<'cx, JsArray>,
    qualifiers: Vec<f64>,
    points: Vec<f64>,
    radius: f64,
) -> JsResult<'cx, JsArray> {
    let edges = shapes_from_js(cx, edges)?;
    let solutions = attempt(|| {
        positive(radius, "arc radius")?;
        let targets = tangencies(&edges, &qualifiers, &points)?;
        let (one, two) = two_targets(&targets)?;
        let gcc = match (one, two) {
            (Tangency::Curve(first), Tangency::Curve(second)) => {
                Geom2dGcc_Circ2d2TanRad_new_qualifiedcurve2_real2(
                    &first.qualified,
                    &second.qualified,
                    radius,
                    TOLERANCE,
                )?
            }
            (Tangency::Curve(first), Tangency::Point(_)) => {
                Geom2dGcc_Circ2d2TanRad_new_qualifiedcurve_hpoint_real2(
                    &first.qualified,
                    &*two.as_point()?,
                    radius,
                    TOLERANCE,
                )?
            }
            (Tangency::Point(_), _) => Geom2dGcc_Circ2d2TanRad_new_hpoint2_real2(
                &*one.as_point()?,
                &*two.as_point()?,
                radius,
                TOLERANCE,
            )?,
        };
        if !gcc.IsDone()? || gcc.NbSolutions()? == 0 {
            return Err(OcctError::failed("no arc of that radius is tangent to both targets"));
        }

        let mut solutions = Vec::new();
        for index in 1..=gcc.NbSolutions()? {
            let circle = Geom2dGcc_Circ2d2TanRad_ThisSolution(&gcc, index)?;
            let mut probe = gp_Pnt2d_new_real2(0.0, 0.0)?;
            let mut first = Contact::default();
            gcc.Tangency1(index, &mut first.on_circle, &mut first.on_target, probe.pin_mut())?;
            let mut second = Contact::default();
            gcc.Tangency2(index, &mut second.on_circle, &mut second.on_target, probe.pin_mut())?;

            let Some(mut parameters) = contact_parameters(&targets, &circle, [first, second])?
            else {
                continue;
            };
            correct_enclosed(&targets, &circle, &mut parameters)?;
            solutions.push(arc_pair(&circle, parameters[0], parameters[1])?);
        }
        Ok(keep_arcs(solutions))
    })
    .or_raise(cx)?;
    pairs_to_js(cx, solutions)
}

/// build123d's "verify then correct" step: the radius solver reports unstable parameters on
/// transformed curves, so a contact that is not on the solution circle (or outside the target's
/// trimmed range) is re-derived by projecting the circle's centre onto the target. `None` when a
/// contact cannot be placed on the solution circle at all.
fn contact_parameters(
    targets: &[Tangency],
    circle: &gp_Circ2d,
    contacts: [Contact; 2],
) -> OcctResult<Option<[f64; 2]>> {
    let location = circle.Location()?;
    let center = [location.X()?, location.Y()?];
    let radius = circle.Radius()?;
    let angle_at = |point: [f64; 2]| (point[1] - center[1]).atan2(point[0] - center[0]);

    let mut parameters = [0.0; 2];
    for (index, contact) in contacts.into_iter().enumerate() {
        match &targets[index] {
            Tangency::Point(point) => {
                let point = crate::construct::geom2d::point_coordinates(point)?;
                if (distance_to(point, center) - radius).abs() >= TOLERANCE {
                    return Ok(None);
                }
                parameters[index] = angle_at(point);
            }
            Tangency::Curve(curve) => {
                let solver_point = curve.value_at(contact.on_target)?;
                if (distance_to(solver_point, center) - radius).abs() < TOLERANCE
                    && curve.contains(contact.on_target)?
                {
                    parameters[index] = contact.on_circle;
                    continue;
                }
                let projection = Geom2dAPI_ProjectPointOnCurve_new_pnt2d_hcurve(
                    &*gp_Pnt2d_new_real2(center[0], center[1])?,
                    &curve.curve,
                )?;
                if projection.NbPoints()? == 0 {
                    return Ok(None);
                }
                let on_target = projection.LowerDistanceParameter()?;
                let point = curve.value_at(on_target)?;
                if (distance_to(point, center) - radius).abs() > TOLERANCE
                    || !curve.contains(on_target)?
                {
                    return Ok(None);
                }
                parameters[index] = angle_at(point);
            }
        }
    }
    Ok(Some(parameters))
}

/// Arcs tangent to two targets whose centre lies on `centerOn` (`Geom2dGcc_Circ2d2TanOn`).
#[neon::export(name = "constrainedArcs2TanOn")]
fn constrained_arcs_2tan_on<'cx>(
    cx: &mut Cx<'cx>,
    edges: Handle<'cx, JsArray>,
    qualifiers: Vec<f64>,
    points: Vec<f64>,
    center_on: &ShapeCell,
) -> JsResult<'cx, JsArray> {
    let edges = shapes_from_js(cx, edges)?;
    let solutions = attempt(|| {
        let targets = tangencies(&edges, &qualifiers, &points)?;
        let (one, two) = two_targets(&targets)?;
        let locus_shape = get(center_on)?;
        let locus = qualified_edge(&locus_shape, qualifier(0.0)?)?;
        let adaptor = Handle_Geom2dAdaptor_Curve_get(&locus.adaptor)?;
        let gcc = match (one, two) {
            (Tangency::Curve(first), Tangency::Curve(second)) => {
                Geom2dGcc_Circ2d2TanOn_new_qualifiedcurve2_curve_real4(
                    &first.qualified,
                    &second.qualified,
                    adaptor,
                    TOLERANCE,
                    first.guess(),
                    second.guess(),
                    locus.guess(),
                )?
            }
            (Tangency::Curve(first), Tangency::Point(_)) => {
                Geom2dGcc_Circ2d2TanOn_new_qualifiedcurve_hpoint_curve_real3(
                    &first.qualified,
                    &*two.as_point()?,
                    adaptor,
                    TOLERANCE,
                    first.guess(),
                    locus.guess(),
                )?
            }
            (Tangency::Point(_), _) => Geom2dGcc_Circ2d2TanOn_new_hpoint2_curve_real(
                &*one.as_point()?,
                &*two.as_point()?,
                adaptor,
                TOLERANCE,
            )?,
        };
        if !gcc.IsDone()? || gcc.NbSolutions()? == 0 {
            return Err(OcctError::failed(
                "no arc is tangent to both targets with its center on the given curve",
            ));
        }

        let mut solutions = Vec::new();
        for index in 1..=gcc.NbSolutions()? {
            let circle = Geom2dGcc_Circ2d2TanOn_ThisSolution(&gcc, index)?;
            let mut probe = gp_Pnt2d_new_real2(0.0, 0.0)?;
            let mut first = Contact::default();
            gcc.Tangency1(index, &mut first.on_circle, &mut first.on_target, probe.pin_mut())?;
            let mut second = Contact::default();
            gcc.Tangency2(index, &mut second.on_circle, &mut second.on_target, probe.pin_mut())?;
            if !one.contains(first.on_target)? || !two.contains(second.on_target)? {
                continue;
            }
            let mut parameters = [first.on_circle, second.on_circle];
            correct_enclosed(&targets, &circle, &mut parameters)?;
            solutions.push(arc_pair(&circle, parameters[0], parameters[1])?);
        }
        Ok(keep_arcs(solutions))
    })
    .or_raise(cx)?;
    pairs_to_js(cx, solutions)
}

/// Arcs tangent to three curves (`Geom2dGcc_Circ2d3Tan`). The arcs run between the contacts on the
/// first two curves; the third only selects the circle.
#[neon::export(name = "constrainedArcs3Tan")]
fn constrained_arcs_3tan<'cx>(
    cx: &mut Cx<'cx>,
    edges: Handle<'cx, JsArray>,
    qualifiers: Vec<f64>,
) -> JsResult<'cx, JsArray> {
    let edges = shapes_from_js(cx, edges)?;
    let solutions = attempt(|| {
        let targets = tangencies(&edges, &qualifiers, &[])?;
        if targets.len() != 3 {
            return Err(OcctError::invalid("exactly three tangency curves are required"));
        }
        let curves = [targets[0].curve()?, targets[1].curve()?, targets[2].curve()?];
        let gcc = Geom2dGcc_Circ2d3Tan_new_qualifiedcurve3_real4(
            &curves[0].qualified,
            &curves[1].qualified,
            &curves[2].qualified,
            TOLERANCE,
            curves[0].guess(),
            curves[1].guess(),
            curves[2].guess(),
        )?;
        if !gcc.IsDone()? || gcc.NbSolutions()? == 0 {
            return Err(OcctError::failed("no circle is tangent to all three curves"));
        }

        let mut solutions = Vec::new();
        for index in 1..=gcc.NbSolutions()? {
            let circle = Geom2dGcc_Circ2d3Tan_ThisSolution(&gcc, index)?;
            let mut probe = gp_Pnt2d_new_real2(0.0, 0.0)?;
            let mut contacts = [Contact::default(), Contact::default(), Contact::default()];
            gcc.Tangency1(
                index,
                &mut contacts[0].on_circle,
                &mut contacts[0].on_target,
                probe.pin_mut(),
            )?;
            gcc.Tangency2(
                index,
                &mut contacts[1].on_circle,
                &mut contacts[1].on_target,
                probe.pin_mut(),
            )?;
            gcc.Tangency3(
                index,
                &mut contacts[2].on_circle,
                &mut contacts[2].on_target,
                probe.pin_mut(),
            )?;

            let mut on_curves = true;
            for (contact, curve) in contacts.iter().zip(&curves) {
                on_curves = on_curves && curve.contains(contact.on_target)?;
            }
            if !on_curves {
                continue;
            }

            let mut parameters =
                [contacts[0].on_circle, contacts[1].on_circle, contacts[2].on_circle];
            correct_enclosed(&targets, &circle, &mut parameters)?;
            solutions.push(arc_pair(&circle, parameters[0], parameters[1])?);
        }
        Ok(keep_arcs(solutions))
    })
    .or_raise(cx)?;
    pairs_to_js(cx, solutions)
}
