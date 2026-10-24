//! Dense row-major `f64` matrices covering the slice of numpy the Gordon surface port uses:
//! `solve`, `inv`, `eigh` and `cholesky`.

use std::fmt;

/// Jacobi sweeps are quadratically convergent; this cap is never reached in practice.
const MAX_JACOBI_SWEEPS: usize = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct LinAlgError {
    message: &'static str,
}

impl LinAlgError {
    fn new(message: &'static str) -> Self {
        Self { message }
    }
}

impl fmt::Display for LinAlgError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.message)
    }
}

impl std::error::Error for LinAlgError {}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Matrix {
    rows: usize,
    cols: usize,
    data: Vec<f64>,
}

impl Matrix {
    pub(crate) fn zeros(rows: usize, cols: usize) -> Self {
        Self { rows, cols, data: vec![0.0; rows * cols] }
    }

    pub(crate) fn identity(n: usize) -> Self {
        let mut matrix = Self::zeros(n, n);
        for index in 0..n {
            matrix.set(index, index, 1.0);
        }
        matrix
    }

    pub(crate) fn rows(&self) -> usize {
        self.rows
    }

    pub(crate) fn cols(&self) -> usize {
        self.cols
    }

    pub(crate) fn at(&self, row: usize, col: usize) -> f64 {
        self.data[row * self.cols + col]
    }

    pub(crate) fn set(&mut self, row: usize, col: usize, value: f64) {
        self.data[row * self.cols + col] = value;
    }

    pub(crate) fn add_at(&mut self, row: usize, col: usize, value: f64) {
        self.data[row * self.cols + col] += value;
    }

    pub(crate) fn row_slice(&self, row: usize) -> &[f64] {
        &self.data[row * self.cols..(row + 1) * self.cols]
    }

    pub(crate) fn transposed(&self) -> Self {
        let mut transposed = Self::zeros(self.cols, self.rows);
        for row in 0..self.rows {
            for col in 0..self.cols {
                transposed.set(col, row, self.at(row, col));
            }
        }
        transposed
    }

    pub(crate) fn multiplied(&self, other: &Self) -> Self {
        assert_eq!(self.cols, other.rows, "matrix product dimension mismatch");
        let mut product = Self::zeros(self.rows, other.cols);
        for row in 0..self.rows {
            for inner in 0..self.cols {
                let left = self.at(row, inner);
                for col in 0..other.cols {
                    product.add_at(row, col, left * other.at(inner, col));
                }
            }
        }
        product
    }

    /// Copies `block` in with its top-left corner at `(row0, col0)`.
    pub(crate) fn set_block(&mut self, row0: usize, col0: usize, block: &Self) {
        for row in 0..block.rows {
            for col in 0..block.cols {
                self.set(row0 + row, col0 + col, block.at(row, col));
            }
        }
    }

    /// `np.linalg.solve`: LU with partial pivoting (LAPACK `dgesv`), one column per
    /// right-hand side.
    pub(crate) fn solve(&self, rhs: &Self) -> Result<Self, LinAlgError> {
        assert_eq!(rhs.rows, self.rows, "right-hand side row count must match the matrix");
        let (lu, pivots) = self.lu_decomposed()?;
        let n = self.rows;
        let mut solution = rhs.clone();
        for (step, &pivot) in pivots.iter().enumerate() {
            if pivot != step {
                solution.swap_rows(step, pivot);
            }
        }
        for col in 0..solution.cols {
            for row in 1..n {
                let mut sum = solution.at(row, col);
                for inner in 0..row {
                    sum -= lu.at(row, inner) * solution.at(inner, col);
                }
                solution.set(row, col, sum);
            }
            for row in (0..n).rev() {
                let mut sum = solution.at(row, col);
                for inner in row + 1..n {
                    sum -= lu.at(row, inner) * solution.at(inner, col);
                }
                solution.set(row, col, sum / lu.at(row, row));
            }
        }
        Ok(solution)
    }

    /// `np.linalg.inv`, which is `solve` against the identity.
    pub(crate) fn inverse(&self) -> Result<Self, LinAlgError> {
        self.solve(&Self::identity(self.rows))
    }

    /// `np.linalg.eigh`: eigenvalues ascending, matching eigenvectors as columns. Only the
    /// lower triangle would differ from the upper for a non-symmetric input; callers pass
    /// symmetric matrices.
    pub(crate) fn symmetric_eigen(&self) -> (Vec<f64>, Self) {
        assert_eq!(self.rows, self.cols, "eigendecomposition requires a square matrix");
        let mut work = self.clone();
        let mut vectors = Self::identity(self.rows);
        for _ in 0..MAX_JACOBI_SWEEPS {
            if work.off_diagonal_magnitude() == 0.0 {
                break;
            }
            for p in 0..self.rows.saturating_sub(1) {
                for q in p + 1..self.rows {
                    jacobi_rotate(&mut work, &mut vectors, p, q);
                }
            }
        }
        sorted_eigenpairs(&work, &vectors)
    }

    /// `np.linalg.cholesky`: lower triangular factor, `Err` when a leading minor is not
    /// positive definite (LAPACK `dpotrf`).
    pub(crate) fn cholesky(&self) -> Result<Self, LinAlgError> {
        assert_eq!(self.rows, self.cols, "cholesky requires a square matrix");
        let mut lower = Self::zeros(self.rows, self.cols);
        for row in 0..self.rows {
            for col in 0..=row {
                let mut sum = self.at(row, col);
                for inner in 0..col {
                    sum -= lower.at(row, inner) * lower.at(col, inner);
                }
                if row != col {
                    lower.set(row, col, sum / lower.at(col, col));
                    continue;
                }
                if sum <= 0.0 || sum.is_nan() {
                    return Err(LinAlgError::new("matrix is not positive definite"));
                }
                lower.set(row, col, sum.sqrt());
            }
        }
        Ok(lower)
    }

    /// Combined `L` (unit diagonal, below) and `U` (on and above), plus the row swapped in at
    /// each elimination step.
    fn lu_decomposed(&self) -> Result<(Self, Vec<usize>), LinAlgError> {
        assert_eq!(self.rows, self.cols, "LU decomposition requires a square matrix");
        let n = self.rows;
        let mut lu = self.clone();
        let mut pivots = Vec::with_capacity(n);
        for step in 0..n {
            let mut pivot = step;
            for row in step + 1..n {
                if lu.at(row, step).abs() > lu.at(pivot, step).abs() {
                    pivot = row;
                }
            }
            pivots.push(pivot);
            if lu.at(pivot, step) == 0.0 {
                return Err(LinAlgError::new("singular matrix"));
            }
            lu.swap_rows(step, pivot);
            for row in step + 1..n {
                let factor = lu.at(row, step) / lu.at(step, step);
                lu.set(row, step, factor);
                for col in step + 1..n {
                    lu.add_at(row, col, -factor * lu.at(step, col));
                }
            }
        }
        Ok((lu, pivots))
    }

    pub(crate) fn swap_rows(&mut self, first: usize, second: usize) {
        if first == second {
            return;
        }
        for col in 0..self.cols {
            self.data.swap(first * self.cols + col, second * self.cols + col);
        }
    }

    pub(crate) fn swap_columns(&mut self, first: usize, second: usize) {
        if first == second {
            return;
        }
        for row in 0..self.rows {
            self.data.swap(row * self.cols + first, row * self.cols + second);
        }
    }

    fn off_diagonal_magnitude(&self) -> f64 {
        let mut magnitude = 0.0;
        for row in 0..self.rows {
            for col in row + 1..self.cols {
                magnitude += self.at(row, col).abs();
            }
        }
        magnitude
    }
}

/// One cyclic Jacobi rotation annihilating `(p, q)`, applied to the working matrix and
/// accumulated into the eigenvector columns.
fn jacobi_rotate(work: &mut Matrix, vectors: &mut Matrix, p: usize, q: usize) {
    let off_diagonal = work.at(p, q);
    if off_diagonal == 0.0 {
        return;
    }
    let diagonal_p = work.at(p, p);
    let diagonal_q = work.at(q, q);
    // A rotation too small to move either diagonal entry in double precision would only
    // reintroduce rounding noise, so the entry is simply dropped.
    if diagonal_p.abs() + off_diagonal.abs() == diagonal_p.abs()
        && diagonal_q.abs() + off_diagonal.abs() == diagonal_q.abs()
    {
        work.set(p, q, 0.0);
        work.set(q, p, 0.0);
        return;
    }
    let spread = diagonal_q - diagonal_p;
    let tangent = if spread.abs() + off_diagonal.abs() == spread.abs() {
        off_diagonal / spread
    } else {
        let theta = 0.5 * spread / off_diagonal;
        let magnitude = 1.0 / (theta.abs() + (1.0 + theta * theta).sqrt());
        if theta < 0.0 { -magnitude } else { magnitude }
    };
    let cosine = 1.0 / (1.0 + tangent * tangent).sqrt();
    let sine = tangent * cosine;

    work.set(p, p, diagonal_p - tangent * off_diagonal);
    work.set(q, q, diagonal_q + tangent * off_diagonal);
    work.set(p, q, 0.0);
    work.set(q, p, 0.0);
    for row in 0..work.rows() {
        if row == p || row == q {
            continue;
        }
        let to_p = work.at(row, p);
        let to_q = work.at(row, q);
        work.set(row, p, cosine * to_p - sine * to_q);
        work.set(p, row, cosine * to_p - sine * to_q);
        work.set(row, q, sine * to_p + cosine * to_q);
        work.set(q, row, sine * to_p + cosine * to_q);
    }
    for row in 0..vectors.rows() {
        let in_p = vectors.at(row, p);
        let in_q = vectors.at(row, q);
        vectors.set(row, p, cosine * in_p - sine * in_q);
        vectors.set(row, q, sine * in_p + cosine * in_q);
    }
}

fn sorted_eigenpairs(work: &Matrix, vectors: &Matrix) -> (Vec<f64>, Matrix) {
    let n = work.rows();
    let mut order: Vec<usize> = (0..n).collect();
    order.sort_by(|&left, &right| work.at(left, left).total_cmp(&work.at(right, right)));
    let mut values = Vec::with_capacity(n);
    let mut sorted = Matrix::zeros(n, n);
    for (col, &source) in order.iter().enumerate() {
        values.push(work.at(source, source));
        for row in 0..n {
            sorted.set(row, col, vectors.at(row, source));
        }
    }
    (values, sorted)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn from_rows(rows: &[&[f64]]) -> Matrix {
        let mut matrix = Matrix::zeros(rows.len(), rows[0].len());
        for (row, values) in rows.iter().enumerate() {
            for (col, &value) in values.iter().enumerate() {
                matrix.set(row, col, value);
            }
        }
        matrix
    }

    fn assert_close(actual: f64, expected: f64, tolerance: f64) {
        assert!((actual - expected).abs() <= tolerance, "{actual} != {expected}");
    }

    #[test]
    fn solves_multiple_right_hand_sides() {
        let matrix = from_rows(&[&[2.0, 1.0, -1.0], &[-3.0, -1.0, 2.0], &[-2.0, 1.0, 2.0]]);
        let rhs = from_rows(&[&[8.0, 1.0], &[-11.0, 0.0], &[-3.0, 0.0]]);
        let solution = matrix.solve(&rhs).expect("system is regular");
        assert_close(solution.at(0, 0), 2.0, 1e-12);
        assert_close(solution.at(1, 0), 3.0, 1e-12);
        assert_close(solution.at(2, 0), -1.0, 1e-12);

        let residual = matrix.multiplied(&solution);
        for row in 0..3 {
            for col in 0..2 {
                assert_close(residual.at(row, col), rhs.at(row, col), 1e-12);
            }
        }
    }

    #[test]
    fn reports_singular_systems() {
        let singular = from_rows(&[&[1.0, 2.0], &[2.0, 4.0]]);
        let error = singular.solve(&Matrix::identity(2)).expect_err("matrix is singular");
        assert_eq!(error.to_string(), "singular matrix");
        assert!(singular.inverse().is_err());
    }

    #[test]
    fn inverts_to_the_identity() {
        let matrix = from_rows(&[&[4.0, 7.0, 2.0], &[3.0, 6.0, 1.0], &[2.0, 5.0, 3.0]]);
        let inverse = matrix.inverse().expect("matrix is regular");
        let product = matrix.multiplied(&inverse);
        for row in 0..3 {
            for col in 0..3 {
                assert_close(product.at(row, col), if row == col { 1.0 } else { 0.0 }, 1e-12);
            }
        }
    }

    #[test]
    fn eigen_decomposes_a_two_by_two() {
        let matrix = from_rows(&[&[2.0, 1.0], &[1.0, 2.0]]);
        let (values, vectors) = matrix.symmetric_eigen();
        assert_close(values[0], 1.0, 1e-15);
        assert_close(values[1], 3.0, 1e-15);
        let axis = std::f64::consts::FRAC_1_SQRT_2;
        assert_close(vectors.at(0, 0).abs(), axis, 1e-15);
        assert_close(vectors.at(1, 1).abs(), axis, 1e-15);
        assert_close(vectors.at(0, 0) * vectors.at(1, 0), -0.5, 1e-15);
        assert_close(vectors.at(0, 1) * vectors.at(1, 1), 0.5, 1e-15);
    }

    #[test]
    fn eigen_decomposes_a_three_by_three() {
        let matrix = from_rows(&[&[4.0, 1.0, 0.0], &[1.0, 4.0, 1.0], &[0.0, 1.0, 4.0]]);
        let (values, vectors) = matrix.symmetric_eigen();
        let offset = std::f64::consts::SQRT_2;
        assert_close(values[0], 4.0 - offset, 1e-14);
        assert_close(values[1], 4.0, 1e-14);
        assert_close(values[2], 4.0 + offset, 1e-14);

        let mut spectrum = Matrix::zeros(3, 3);
        for (index, &value) in values.iter().enumerate() {
            spectrum.set(index, index, value);
        }
        let rebuilt = vectors.multiplied(&spectrum).multiplied(&vectors.transposed());
        let orthogonality = vectors.transposed().multiplied(&vectors);
        for row in 0..3 {
            for col in 0..3 {
                assert_close(rebuilt.at(row, col), matrix.at(row, col), 1e-14);
                let expected = if row == col { 1.0 } else { 0.0 };
                assert_close(orthogonality.at(row, col), expected, 1e-14);
            }
        }
    }

    #[test]
    fn factors_positive_definite_matrices() {
        let matrix = from_rows(&[&[4.0, 2.0], &[2.0, 3.0]]);
        let lower = matrix.cholesky().expect("matrix is positive definite");
        assert_close(lower.at(0, 0), 2.0, 1e-15);
        assert_close(lower.at(0, 1), 0.0, 1e-15);
        assert_close(lower.at(1, 0), 1.0, 1e-15);
        assert_close(lower.at(1, 1), std::f64::consts::SQRT_2, 1e-15);

        let rebuilt = lower.multiplied(&lower.transposed());
        for row in 0..2 {
            for col in 0..2 {
                assert_close(rebuilt.at(row, col), matrix.at(row, col), 1e-15);
            }
        }
    }

    #[test]
    fn rejects_non_positive_definite_matrices() {
        let indefinite = from_rows(&[&[1.0, 2.0], &[2.0, 1.0]]);
        let error = indefinite.cholesky().expect_err("matrix is indefinite");
        assert_eq!(error.to_string(), "matrix is not positive definite");
        assert!(from_rows(&[&[0.0, 0.0], &[0.0, 1.0]]).cholesky().is_err());
    }

    #[test]
    fn copies_blocks_and_rows() {
        let mut matrix = Matrix::zeros(3, 3);
        matrix.set_block(1, 1, &from_rows(&[&[5.0, 6.0], &[7.0, 8.0]]));
        matrix.add_at(0, 0, 2.0);
        assert_eq!(matrix.row_slice(0), &[2.0, 0.0, 0.0]);
        assert_eq!(matrix.row_slice(1), &[0.0, 5.0, 6.0]);
        assert_eq!(matrix.row_slice(2), &[0.0, 7.0, 8.0]);
        assert_eq!(matrix.rows(), 3);
        assert_eq!(matrix.cols(), 3);
    }

    #[test]
    fn swaps_rows_and_columns() {
        let mut matrix = from_rows(&[&[1.0, 2.0, 3.0], &[4.0, 5.0, 6.0], &[7.0, 8.0, 9.0]]);
        matrix.swap_rows(0, 2);
        assert_eq!(matrix.row_slice(0), &[7.0, 8.0, 9.0]);
        assert_eq!(matrix.row_slice(2), &[1.0, 2.0, 3.0]);
        matrix.swap_columns(0, 1);
        assert_eq!(matrix.row_slice(0), &[8.0, 7.0, 9.0]);
        assert_eq!(matrix.row_slice(1), &[5.0, 4.0, 6.0]);
        matrix.swap_rows(1, 1);
        matrix.swap_columns(2, 2);
        assert_eq!(matrix.row_slice(1), &[5.0, 4.0, 6.0]);
    }
}
