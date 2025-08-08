import opentype from 'opentype.js'
import { Point2D } from './model';

export type Strip = Point2D[];

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
    const path = font.glyphs.get(72).path;
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
    return strips;
}

export const drawLineStrip = (device: GPUDevice, context: GPUCanvasContext, presentationFormat: GPUTextureFormat, strips: Strip[]) => {
    // Configure the canvas context with the device and format
    context.configure({
        device,
        format: presentationFormat,
        alphaMode: 'opaque', // Opaque background
    });
    const flattenedArray = strips.flat().reduce((accumulator: number[], currentPoint) => {
        accumulator.push(currentPoint.x);
        accumulator.push(currentPoint.y);
        return accumulator;
    }, []);
    const bezierVertices = new Float32Array(flattenedArray);

    // Create a GPU buffer to store the vertex data
    const vertexBuffer = device.createBuffer({
        size: bezierVertices.byteLength, // Size in bytes
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, // Mark as vertex buffer and allow copying data to it
        mappedAtCreation: true, // Map the buffer memory for immediate writing
    });

    // Write the vertex data to the buffer
    new Float32Array(vertexBuffer.getMappedRange()).set(bezierVertices);
    vertexBuffer.unmap(); // Unmap the buffer to make it accessible by the GPU

    // Define the WGSL (WebGPU Shading Language) shaders
    // Vertex Shader: Processes each vertex, setting its position
    const vertexShaderWGSL = `
                @vertex
                fn main(@location(0) position : vec2f) -> @builtin(position) vec4f {
                    // Output the position directly (it's already in clip space)
                    return vec4f(position, 0.0, 1.0);
                }
            `;

    // Fragment Shader: Determines the color of each pixel
    const fragmentShaderWGSL = `
                @fragment
                fn main() -> @location(0) vec4f {
                    // Output a blue color for the curve
                    return vec4f(0.0, 0.0, 1.0, 1.0); // RGBA (Red, Green, Blue, Alpha)
                }
            `;

    // Create a shader module for the vertex shader
    const vertexShaderModule = device.createShaderModule({
        code: vertexShaderWGSL,
    });

    // Create a shader module for the fragment shader
    const fragmentShaderModule = device.createShaderModule({
        code: fragmentShaderWGSL,
    });

    // Define the render pipeline layout
    const pipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [], // No bind groups needed for this simple example
    });

    // Create the render pipeline
    const renderPipeline = device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: {
            module: vertexShaderModule,
            entryPoint: 'main', // Entry point function in the vertex shader
            buffers: [
                {
                    arrayStride: 2 * 4, // 2 floats * 4 bytes/float = 8 bytes per vertex
                    attributes: [
                        {
                            shaderLocation: 0, // Corresponds to @location(0) in the shader
                            offset: 0, // Start of the attribute within the vertex
                            format: 'float32x2', // Two 32-bit floats (vec2f)
                        },
                    ],
                },
            ],
        },
        fragment: {
            module: fragmentShaderModule,
            entryPoint: 'main', // Entry point function in the fragment shader
            targets: [
                {
                    format: presentationFormat, // Match the canvas format
                },
            ],
        },
        // Define the primitive topology as 'line-strip' to draw connected lines
        primitive: {
            topology: 'line-strip', // Connects all vertices in order
        },
    });

    // Create a command encoder to record rendering commands
    const commandEncoder = device.createCommandEncoder();

    // Begin a render pass, specifying the render target (canvas)
    const textureView = context.getCurrentTexture().createView();
    const renderPassEncoder = commandEncoder.beginRenderPass({
        colorAttachments: [
            {
                view: textureView,
                clearValue: { r: 0.9, g: 0.95, b: 1.0, a: 1.0 }, // Clear color (light blue)
                loadOp: 'clear', // Clear the texture before drawing
                storeOp: 'store', // Store the result
            },
        ],
    });

    // Set the render pipeline
    renderPassEncoder.setPipeline(renderPipeline);

    // Set the vertex buffer at slot 0 (corresponds to index 0 in `buffers` array above)
    renderPassEncoder.setVertexBuffer(0, vertexBuffer);

    // Draw the vertices. We draw all generated vertices.
    for (let index = 0; index < strips.length; index++) {
        if (index == 0) {
            renderPassEncoder.draw(strips[index].length, 1, 0);
        } else {
            renderPassEncoder.draw(strips[index].length, 1, strips[index - 1].length);
        }

    }

    // End the render pass
    renderPassEncoder.end();

    // Finish encoding commands and submit them to the device queue
    device.queue.submit([commandEncoder.finish()]);
}