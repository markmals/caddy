//! Port of ocp_gordon `internal/intersect_bsplines.py` (Apache-2.0,
//! SPDX-FileCopyrightText: 2018 German Aerospace Center (DLR)): hull subdivision down to nearly
//! straight pieces, then an endpoint check and a 2D minimisation of the squared distance.

use crate::error::OcctResult;
use crate::gordon::bspline_algorithms::trim_curve;
use crate::gordon::curve::{Curve, Point, difference, distance, dot, square_distance};
use crate::gordon::optimize::{GradientObjective, math_bfgs, minimize_scalar_bounded};

/// Above this ratio of control-polygon length to chord length a piece is split again.
const MAX_CURVATURE: f64 = 1.0005;
const INTERVAL_EPSILON: f64 = 1e-15;

pub(crate) struct Intersection {
    pub(crate) parameter_on_first: f64,
    pub(crate) parameter_on_second: f64,
}

#[derive(Clone, Copy)]
struct Interval {
    min: f64,
    max: f64,
}

impl Interval {
    fn same_as(&self, other: &Interval) -> bool {
        (self.min - other.min).abs() < INTERVAL_EPSILON
            && (self.max - other.max).abs() < INTERVAL_EPSILON
    }
}

#[derive(Clone, Copy)]
struct BoundingBox {
    range: Interval,
    low: Point,
    high: Point,
}

fn min_coords(first: Point, second: Point) -> Point {
    [first[0].min(second[0]), first[1].min(second[1]), first[2].min(second[2])]
}

fn max_coords(first: Point, second: Point) -> Point {
    [first[0].max(second[0]), first[1].max(second[1]), first[2].max(second[2])]
}

impl BoundingBox {
    fn of(curve: &Curve) -> OcctResult<Self> {
        let poles = curve.poles()?;
        let mut low = poles[0];
        let mut high = poles[0];
        for pole in &poles {
            low = min_coords(low, *pole);
            high = max_coords(high, *pole);
        }
        Ok(Self {
            range: Interval { min: curve.first_parameter()?, max: curve.last_parameter()? },
            low,
            high,
        })
    }

    fn intersects(&self, other: &BoundingBox, epsilon: f64) -> bool {
        let low = max_coords(self.low, other.low);
        let high = min_coords(self.high, other.high);
        low[0] < high[0] + epsilon && low[1] < high[1] + epsilon && low[2] < high[2] + epsilon
    }

    fn merged(&self, other: &BoundingBox) -> BoundingBox {
        BoundingBox {
            range: Interval { min: self.range.min, max: other.range.max },
            low: min_coords(self.low, other.low),
            high: max_coords(self.high, other.high),
        }
    }
}

/// Control-polygon length over chord length: 1.0 for a straight piece.
fn curvature(curve: &Curve) -> OcctResult<f64> {
    let poles = curve.poles()?;
    let chord = distance(poles[0], poles[poles.len() - 1]);
    let polygon: f64 = poles.windows(2).map(|pair| distance(pair[0], pair[1])).sum();

    if chord.abs() < 1e-15 {
        return Ok(if polygon < 1e-15 { 1.0 } else { 1e9 });
    }
    Ok((polygon / chord).max(1.0))
}

/// Splits at the sharpest inner knot, or at the midpoint when the curve is smooth enough.
fn split_point(curve: &Curve) -> OcctResult<f64> {
    let midpoint = 0.5 * (curve.first_parameter()? + curve.last_parameter()?);
    if curve.is_cn(curve.degree()? - 1)? {
        return Ok(midpoint);
    }

    let mut sharpest = 2;
    for index in 3..curve.nb_knots()? {
        if curve.multiplicity(index)? > curve.multiplicity(sharpest)? {
            sharpest = index;
        }
    }
    if curve.multiplicity(sharpest)? > 1 {
        return curve.knot(sharpest);
    }
    Ok(midpoint)
}

/// Recursively subdivides both curves until their hulls are nearly straight, keeping the pairs
/// whose hulls still overlap.
fn ranges_of_intersection(
    first: &Curve,
    second: &Curve,
    tolerance: f64,
) -> OcctResult<Vec<(BoundingBox, BoundingBox)>> {
    let first_hull = BoundingBox::of(first)?;
    let second_hull = BoundingBox::of(second)?;
    if !first_hull.intersects(&second_hull, tolerance) {
        return Ok(Vec::new());
    }

    let first_curvature = curvature(first)?;
    let second_curvature = curvature(second)?;
    if first_curvature <= MAX_CURVATURE && second_curvature <= MAX_CURVATURE {
        return Ok(vec![(first_hull, second_hull)]);
    }

    let first_middle = split_point(first)?;
    let second_middle = split_point(second)?;
    let mut results = Vec::new();

    if first_curvature > MAX_CURVATURE && second_curvature > MAX_CURVATURE {
        let first_low = trim_curve(first, first.first_parameter()?, first_middle)?;
        let first_high = trim_curve(first, first_middle, first.last_parameter()?)?;
        let second_low = trim_curve(second, second.first_parameter()?, second_middle)?;
        let second_high = trim_curve(second, second_middle, second.last_parameter()?)?;

        results.extend(ranges_of_intersection(&first_low, &second_low, tolerance)?);
        results.extend(ranges_of_intersection(&first_low, &second_high, tolerance)?);
        results.extend(ranges_of_intersection(&first_high, &second_low, tolerance)?);
        results.extend(ranges_of_intersection(&first_high, &second_high, tolerance)?);
    } else if first_curvature <= MAX_CURVATURE {
        let second_low = trim_curve(second, second.first_parameter()?, second_middle)?;
        let second_high = trim_curve(second, second_middle, second.last_parameter()?)?;
        results.extend(ranges_of_intersection(first, &second_low, tolerance)?);
        results.extend(ranges_of_intersection(first, &second_high, tolerance)?);
    } else {
        let first_low = trim_curve(first, first.first_parameter()?, first_middle)?;
        let first_high = trim_curve(first, first_middle, first.last_parameter()?)?;
        results.extend(ranges_of_intersection(&first_low, second, tolerance)?);
        results.extend(ranges_of_intersection(&first_high, second, tolerance)?);
    }

    Ok(results)
}

/// Merges neighbouring hulls in place, except across the parameters that would hide a kink.
fn merge_adjacent(boxes: &mut Vec<BoundingBox>, avoid: &[f64]) {
    let is_adjacent = |first: &BoundingBox, second: &BoundingBox| {
        if !avoid.is_empty() {
            let closest = avoid
                .iter()
                .map(|value| (first.range.max - value).abs().min((second.range.min - value).abs()))
                .fold(f64::INFINITY, f64::min);
            if closest < INTERVAL_EPSILON {
                return false;
            }
        }
        (first.range.max - second.range.min).abs() < INTERVAL_EPSILON
    };

    let mut index = 0;
    while index + 1 < boxes.len() {
        if is_adjacent(&boxes[index], &boxes[index + 1]) {
            let merged = boxes[index].merged(&boxes[index + 1]);
            boxes.remove(index);
            boxes[index] = merged;
        } else {
            index += 1;
        }
    }
}

fn kink_parameters_of(curve: &Curve) -> OcctResult<Vec<f64>> {
    let mut values = Vec::new();
    for index in 2..curve.nb_knots()? {
        if curve.multiplicity(index)? > 1 {
            values.push(curve.knot(index)?);
        }
    }
    Ok(values)
}

/// Half the sagitta budget a chord of the given curvature can hide, with ocp_gordon's 1.2 margin.
fn max_deviation(length: f64, max_curvature: f64) -> f64 {
    1.2 * 0.6123724 * (max_curvature - 1.0).sqrt() * length
}

/// Parameter of the projection of `point` onto the segment, and whether an intersection is
/// plausible at all given how far the curves may bow away from their chords.
fn point_on_line_segment(
    point: Point,
    start: Point,
    end: Point,
    max_curvature: f64,
) -> (f64, bool) {
    let segment = difference(end, start);
    let from_start = difference(point, start);
    let length = dot(segment, segment).sqrt();
    if length < 1e-9 {
        return (0.0, dot(from_start, from_start) < 1e-9);
    }

    let parameter = dot(from_start, segment) / (length * length);
    let budget = max_deviation(length, max_curvature);
    let mut possible = true;
    if parameter * length < -budget || parameter * length > length + budget {
        possible = false;
    }

    let closest = [
        (1.0 - parameter) * start[0] + parameter * end[0],
        (1.0 - parameter) * start[1] + parameter * end[1],
        (1.0 - parameter) * start[2] + parameter * end[2],
    ];
    if distance(point, closest) > budget {
        possible = false;
    }
    (parameter, possible)
}

/// Closest-point parameters of two segments, and whether the curves could still meet.
fn line_line_intersection(
    first_start: Point,
    first_end: Point,
    second_start: Point,
    second_end: Point,
    max_curvature: f64,
) -> (f64, f64, bool) {
    let u = difference(first_end, first_start);
    let v = difference(second_end, second_start);
    let w = difference(second_start, first_start);

    let a = dot(u, u);
    let b = dot(u, v);
    let c = dot(v, v);
    let d = dot(u, w);
    let e = dot(v, w);
    let denominator = a * c - b * b;

    let (first_parameter, second_parameter) = if denominator.abs() < 1e-12 {
        (0.5, 0.5)
    } else {
        ((c * d - b * e) / denominator, (b * d - a * e) / denominator)
    };

    let first_length = a.sqrt();
    let second_length = c.sqrt();
    let budget = max_deviation(first_length + second_length, max_curvature);
    let mut possible = true;
    if first_parameter * first_length < -budget
        || first_parameter * first_length > first_length + budget
    {
        possible = false;
    }
    if second_parameter * second_length < -budget
        || second_parameter * second_length > second_length + budget
    {
        possible = false;
    }

    let closest_first = [
        (1.0 - first_parameter) * first_start[0] + first_parameter * first_end[0],
        (1.0 - first_parameter) * first_start[1] + first_parameter * first_end[1],
        (1.0 - first_parameter) * first_start[2] + first_parameter * first_end[2],
    ];
    let closest_second = [
        (1.0 - second_parameter) * second_start[0] + second_parameter * second_end[0],
        (1.0 - second_parameter) * second_start[1] + second_parameter * second_end[1],
        (1.0 - second_parameter) * second_start[2] + second_parameter * second_end[2],
    ];
    if distance(closest_first, closest_second) > budget {
        possible = false;
    }

    (first_parameter, second_parameter, possible)
}

/// Squared distance between two curves as a function of their normalised parameters.
struct CurveDistance<'a> {
    first: &'a Curve,
    second: &'a Curve,
    first_range: (f64, f64),
    second_range: (f64, f64),
}

impl<'a> CurveDistance<'a> {
    fn new(first: &'a Curve, second: &'a Curve) -> OcctResult<Self> {
        Ok(Self {
            first,
            second,
            first_range: (first.first_parameter()?, first.last_parameter()?),
            second_range: (second.first_parameter()?, second.last_parameter()?),
        })
    }

    fn first_parameter(&self, value: f64) -> f64 {
        value * (self.first_range.1 - self.first_range.0) + self.first_range.0
    }

    fn second_parameter(&self, value: f64) -> f64 {
        value * (self.second_range.1 - self.second_range.0) + self.second_range.0
    }
}

impl GradientObjective for CurveDistance<'_> {
    fn evaluate(&self, x: &[f64]) -> (f64, Vec<f64>) {
        let u = self.first_parameter(x[0]);
        let v = self.second_parameter(x[1]);
        let Ok((first_point, first_tangent)) = self.first.d1(u) else {
            return (f64::INFINITY, vec![0.0, 0.0]);
        };
        let Ok((second_point, second_tangent)) = self.second.d1(v) else {
            return (f64::INFINITY, vec![0.0, 0.0]);
        };

        let difference = difference(first_point, second_point);
        let value = dot(difference, difference);
        let gradient = vec![
            2.0 * dot(difference, first_tangent) * (self.first_range.1 - self.first_range.0),
            -2.0 * dot(difference, second_tangent) * (self.second_range.1 - self.second_range.0),
        ];
        (value, gradient)
    }
}

/// All intersections of two B-splines within `tolerance`.
pub(crate) fn intersect_bsplines(
    first: &Curve,
    second: &Curve,
    tolerance: f64,
) -> OcctResult<Vec<Intersection>> {
    let hulls = ranges_of_intersection(first, second, tolerance)?;

    let mut first_boxes: Vec<BoundingBox> = hulls.iter().map(|(box1, _)| *box1).collect();
    let mut second_boxes: Vec<BoundingBox> = hulls.iter().map(|(_, box2)| *box2).collect();
    sort_and_dedup(&mut first_boxes);
    sort_and_dedup(&mut second_boxes);
    merge_adjacent(&mut first_boxes, &kink_parameters_of(first)?);
    merge_adjacent(&mut second_boxes, &kink_parameters_of(second)?);

    let distance_tolerance = 1e-10f64.max(1e-5f64.min(tolerance));
    let mut results: Vec<Intersection> = Vec::new();

    for first_box in &first_boxes {
        for second_box in &second_boxes {
            if !first_box.intersects(second_box, tolerance) {
                continue;
            }
            let trimmed_first = trim_curve(first, first_box.range.min, first_box.range.max)?;
            let trimmed_second = trim_curve(second, second_box.range.min, second_box.range.max)?;
            if let Some(found) =
                locate_intersection(&trimmed_first, &trimmed_second, tolerance, distance_tolerance)?
            {
                push_unique(&mut results, found, tolerance);
            }
        }
    }

    Ok(results)
}

fn sort_and_dedup(boxes: &mut Vec<BoundingBox>) {
    boxes.sort_by(|left, right| {
        left.range.min.partial_cmp(&right.range.min).expect("parameters are finite")
    });
    let mut unique: Vec<BoundingBox> = Vec::with_capacity(boxes.len());
    for item in boxes.iter() {
        if unique.last().is_none_or(|previous| !previous.range.same_as(&item.range)) {
            unique.push(*item);
        }
    }
    *boxes = unique;
}

fn push_unique(results: &mut Vec<Intersection>, candidate: Intersection, tolerance: f64) {
    let duplicate = results.iter().any(|existing| {
        (existing.parameter_on_first - candidate.parameter_on_first).abs() < tolerance
            && (existing.parameter_on_second - candidate.parameter_on_second).abs() < tolerance
    });
    if !duplicate {
        results.push(candidate);
    }
}

/// Endpoint checks first — they are where the minimiser struggles — then the 2D minimisation.
fn locate_intersection(
    first: &Curve,
    second: &Curve,
    tolerance: f64,
    distance_tolerance: f64,
) -> OcctResult<Option<Intersection>> {
    let first_curvature = curvature(first)?;
    let second_curvature = curvature(second)?;
    let max_curvature = first_curvature.max(second_curvature);

    for (curve, parameter, other, swapped) in [
        (first, first.first_parameter()?, second, false),
        (first, first.last_parameter()?, second, false),
        (second, second.first_parameter()?, first, true),
        (second, second.last_parameter()?, first, true),
    ] {
        let Some(other_parameter) =
            point_on_curve(curve, parameter, other, distance_tolerance, max_curvature)?
        else {
            continue;
        };
        let (on_first, on_second) =
            if swapped { (other_parameter, parameter) } else { (parameter, other_parameter) };
        return Ok(Some(Intersection {
            parameter_on_first: on_first,
            parameter_on_second: on_second,
        }));
    }

    let objective = CurveDistance::new(first, second)?;
    let (start_first, end_first) =
        (first.value(first.first_parameter()?)?, first.value(first.last_parameter()?)?);
    let (start_second, end_second) =
        (second.value(second.first_parameter()?)?, second.value(second.last_parameter()?)?);

    let (guess_first, guess_second, possible) =
        line_line_intersection(start_first, end_first, start_second, end_second, max_curvature);
    if !possible {
        return Ok(None);
    }

    let mut guess = [guess_first, guess_second];
    for _ in 0..2 {
        if math_bfgs(&objective, &mut guess, distance_tolerance * distance_tolerance) {
            break;
        }
    }

    let u = objective.first_parameter(guess[0]);
    let v = objective.second_parameter(guess[1]);
    let (first_low, first_high) = ordered(first.first_parameter()?, first.last_parameter()?);
    let (second_low, second_high) = ordered(second.first_parameter()?, second.last_parameter()?);
    if u < first_low - distance_tolerance || u > first_high + distance_tolerance {
        return Ok(None);
    }
    if v < second_low - distance_tolerance || v > second_high + distance_tolerance {
        return Ok(None);
    }

    if distance(first.value(u)?, second.value(v)?) < tolerance {
        return Ok(Some(Intersection { parameter_on_first: u, parameter_on_second: v }));
    }
    Ok(None)
}

fn ordered(first: f64, second: f64) -> (f64, f64) {
    if first <= second { (first, second) } else { (second, first) }
}

/// Parameter on `other` where `curve`'s point at `parameter` lands, if it lands on it at all.
fn point_on_curve(
    curve: &Curve,
    parameter: f64,
    other: &Curve,
    distance_tolerance: f64,
    max_curvature: f64,
) -> OcctResult<Option<f64>> {
    let point = curve.value(parameter)?;
    let other_first = other.first_parameter()?;
    let other_last = other.last_parameter()?;
    let start = other.value(other_first)?;
    let end = other.value(other_last)?;

    if distance(point, start) < distance_tolerance {
        return Ok(Some(other_first));
    }
    if distance(point, end) < distance_tolerance {
        return Ok(Some(other_last));
    }

    let (_, possible) = point_on_line_segment(point, start, end, max_curvature);
    if !possible {
        return Ok(None);
    }

    let mut failure = None;
    let mut squared = |value: f64| match other.value(value) {
        Ok(other_point) => square_distance(point, other_point),
        Err(error) => {
            failure.get_or_insert(error);
            f64::INFINITY
        }
    };
    let (best, best_value, success) = minimize_scalar_bounded(
        &mut squared,
        (other_first, other_last),
        0.1 * distance_tolerance * distance_tolerance,
    );
    if let Some(error) = failure {
        return Err(error);
    }

    if success && best_value < distance_tolerance * distance_tolerance {
        return Ok(Some(best));
    }
    Ok(None)
}
