/*
    1. Find contours and their direction
    2. Set regular triangles and curves in contours
    2. Render regular triangles
    2. Use stencil buffer to tell between fill and no fill zones 
*/

import { Contour, Point2D, Triangle } from "./model";


export const findContours = (font: opentype.Font) => {
    const contours: Contour[] = [];
    console.log('font: ', font);
    const path = font.glyphs.get(72).path;
    console.log('path: ', path);
    const referencePoint = { x: -0.5, y: 0.5 };
    const unitsPerEm = 2048;
    let currentContour!: Contour;
    let tail!: Point2D;
    for (const command of path.commands) {
        if (command.type === 'M') {
            tail = { x: command.x / unitsPerEm, y: command.y / unitsPerEm };
            currentContour = {
                triangles: [],
                curves: [],
                clockwise: true,
            }
        } else if (command.type === 'L') {
            const p = { x: command.x / unitsPerEm, y: command.y / unitsPerEm };
            currentContour.triangles.push([referencePoint, {...tail}, p]);
            tail = p;
        } else if (command.type === 'C') {
            const p1 = { x: command.x1 / unitsPerEm, y: command.y1 / unitsPerEm };
            const p2 = { x: command.x2 / unitsPerEm, y: command.y2 / unitsPerEm };
            const p12 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
            const p = { x: command.x / unitsPerEm, y: command.y / unitsPerEm };
            currentContour.triangles.push([referencePoint, {...tail}, p]);
            currentContour.curves.push([{...tail}, p12, p]);
            tail = p;
        } else if (command.type === 'Q') {
            const p1 = { x: command.x1 / unitsPerEm, y: command.y1 / unitsPerEm };
            const p = { x: command.x / unitsPerEm, y: command.y / unitsPerEm };
            currentContour.triangles.push([referencePoint, {...tail}, p]);
            currentContour.curves.push([{...tail}, p1, p]);
            tail = p;
        } else if (command.type === 'Z') {
            contours.push(currentContour);
        }
    }
    console.log('contours: ', contours);
    return contours;
}

export const stencilMarkPipeline = () => {

}

export const stencilDrawPipeline = () => {

};

export const drawTriangles = () => {

}

export const drawCurves = () => {

}

export const draw = () => {

}