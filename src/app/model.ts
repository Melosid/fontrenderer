/*
    In Float32Array Point2D is equal to 8 bytes
*/
export type Point2D = {
    x: number;
    y: number;
}

/* 
    Glyph contours
*/
export type Contour = {
    // multiple of 3 since each triangle is determined by 3 points
    triangles: number[];
    // multiple of 3 since each triangle is determined by 3 points
    // quadratic curves only
    curves: number[];
}