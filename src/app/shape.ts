import opentype from 'opentype.js'

export type Point2D = {
    x: number;
    y: number;
}

export type Strip = Point2D[];

export const loadFont = async (src = 'assets/courier.ttf') => {
    const font = await opentype.load(src);
    return font;
}

/**
 * Calculates a point on a quadratic Bezier curve.
 * B(t) = (1-t)^2 * P0 + 2 * (1-t) * t * P1 + t^2 * P2
 * @param {number} t - The interpolation parameter (0.0 to 1.0).
 * @param {object} p0 - The start point {x, y}.
 * @param {object} p1 - The control point {x, y}.
 * @param {object} p2 - The end point {x, y}.
 * @returns {object} The interpolated point {x, y}.
 */
const calculateQuadraticBezierPoint = (t: number, p0: Point2D, p1: Point2D, p2: Point2D) => {
    const mt = 1 - t; // (1-t)
    const mt2 = mt * mt; // (1-t)^2
    const t2 = t * t;   // t^2

    const x = mt2 * p0.x + 2 * mt * t * p1.x + t2 * p2.x;
    const y = mt2 * p0.y + 2 * mt * t * p1.y + t2 * p2.y;
    return { x, y };
}

/**
* Calculates a point on a cubic Bezier curve.
* B(t) = (1-t)^3 * P0 + 3(1-t)^2 * t * P1 + 3(1-t) * t^2 * P2 + t^3 * P3
* @param {number} t - The interpolation parameter (0.0 to 1.0).
* @param {object} p0 - The start point {x, y}.
* @param {object} p1 - The control point {x, y}.
* @param {object} p2 - The end point {x, y}.
* @param {object} p3 - The end point {x, y}.
* @returns {object} The interpolated point {x, y}.
*/
const calculateCubicBezierPoint = (t: number, p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D) => {
    const mt = 1 - t; // Helper variable for (1-t)
    const mt2 = mt * mt;
    const t2 = t * t;
    const x = mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x;
    const y = mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y;
    return { x, y };
}

/**
 * Generates an array of vertices that approximate a quadratic Bezier curve.
 * @param {object} p0 - The start point {x, y}.
 * @param {object} p1 - The control point {x, y}.
 * @param {object} p2 - The end point {x, y}.
 * @param {number} segments - The number of line segments to use for approximation.
 * @returns {Float32Array} An array of x, y coordinates for the curve.
 */
const generateQuadraticBezierCurveVertices = (p0: Point2D, p1: Point2D, p2: Point2D, segments: number) => {
    const strip: Point2D[] = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const point = calculateQuadraticBezierPoint(t, p0, p1, p2);
        strip.push({ x: point.x, y: point.y });
    }
    return strip;
}

/**
* Generates an array of vertices that approximate a cubic Bezier curve.
* @param {object} p0 - The start point {x, y}.
* @param {object} p1 - The control point {x, y}.
* @param {object} p2 - The end point {x, y}.
* @param {object} p3 - The end point {x, y}.
* @param {number} segments - The number of line segments to use for approximation.
* @returns {Float32Array} An array of x, y coordinates for the curve.
*/
const generateCubicBezierCurveVertices = (p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D, segments: number) => {
    const strip: Point2D[] = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const point = calculateCubicBezierPoint(t, p0, p1, p2, p3);
        strip.push({ x: point.x, y: point.y });
    }
    return strip;
}

export const makeStrips = (font: opentype.Font) => {
    const strips: Strip[] = [];
    console.log('font: ', font);
    const path = font.glyphs.get(36).path;
    console.log('path: ', path);
    const unitsPerEm = 2048;
    let currentStrip: Strip = [];
    for (const command of path.commands) {
        if (command.type === 'M') {
            currentStrip = [];
            currentStrip.push({ x: command.x / unitsPerEm, y: command.y / unitsPerEm })
        } else if (command.type === 'L') {
            currentStrip.push({ x: command.x / unitsPerEm, y: command.y / unitsPerEm });
        } else if (command.type === 'C') {
            const p0 = currentStrip[currentStrip.length - 1];
            const p1 = { x: command.x1 / unitsPerEm, y: command.y1 / unitsPerEm };
            const p2 = { x: command.x2 / unitsPerEm, y: command.y2 / unitsPerEm };
            const p3 = { x: command.x / unitsPerEm, y: command.y / unitsPerEm };
            currentStrip.push(...generateCubicBezierCurveVertices(p0, p1, p2, p3, 10))
        } else if (command.type === 'Q') {
            const p0 = currentStrip[currentStrip.length - 1];
            const p1 = { x: command.x1 / unitsPerEm, y: command.y1 / unitsPerEm };
            const p2 = { x: command.x / unitsPerEm, y: command.y / unitsPerEm };
            currentStrip.push(...generateQuadraticBezierCurveVertices(p0, p1, p2, 10))
        } else if (command.type === 'Z') {
            strips.push(currentStrip);
        }
    }
    console.log('strips: ', strips);


    // // Now let's display it on a canvas with id "font"
    // const ctx = (document.getElementById('font') as HTMLCanvasElement)?.getContext('2d');
    // if (!ctx) {
    //     console.log('Canvas not found');
    //     return;
    // }
    // // If you just want to draw the text you can also use font.draw(ctx, text, x, y, fontSize).
    // path.draw(ctx);

    return strips;

}