/*
    In Float32Array Point2D is equal to 8 bytes
*/
export type Point2D = {
    x: number;
    y: number;
}

/*
    3 points of Point2D with total of 24 bytes
*/
export type Triangle = Point2D[];

/* 
    Glyph contours
*/
export type Contour = {
    triangles: Triangle[];
    curves: Triangle[];
    clockwise: boolean;
}