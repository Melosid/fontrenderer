/*
    1. Find contours and their direction
    2. Set regular triangles and curves in contours
    2. Render regular triangles
    2. Use stencil buffer to tell between fill and no fill zones 
*/

import { PathCommand } from "opentype.js";
import { Contour, Point2D } from "./model";


export const findContours = (font: opentype.Font) => {
    const contours: Contour[] = [];
    const path = font.glyphs.get(72).path;
    console.log('font: ', font);
    console.log('path: ', path);


    const subPaths = path.commands.reduce((acc: PathCommand[][], command) => {
        if (command.type === 'M') {
            acc.push([]); // Start a new sub-array when the delimiter is encountered
        }
        acc[acc.length - 1].push(command); // Add the current element to the last sub-array
        return acc;
    }, [])

    console.log('subPaths: ', subPaths);
    const referencePoint = { x: -0.5, y: 0.5 };
    const unitsPerEm = 2048;

    for (const subPath of subPaths) {
        // find three points that are not in line and use the crossProduct formula to find the orientation
        const beginning: Point2D[] = []
        for (const command of subPath) {
            if (beginning.length >= 3) {
                break;
            }
            if (command.type === 'Z') {
                continue;
            }
            if (beginning.find(c => (c.x === command.x && c.y === command.y))) {
                continue;
            }
            beginning.push({ x: command.x, y: command.y });
        }

        console.log('beginning: ', beginning);
        const { x: x0, y: y0 } = beginning[0];
        const { x: x1, y: y1 } = beginning[1];
        const { x: x2, y: y2 } = beginning[2];
        const crossProduct = ((x1 - x0) * (y2 - y0)) - ((y1 - y0) * (x2 - x0));
        const clockwise = crossProduct < 0;
        console.log('crossProduct: ', crossProduct);

        let currentContour!: Contour;
        let tail!: Point2D;

        for (const command of subPath) {
            if (command.type === 'M') {
                tail = { x: command.x / unitsPerEm, y: command.y / unitsPerEm };
                currentContour = {
                    triangles: [],
                    curves: [],
                    clockwise,
                }
            } else if (command.type === 'L') {
                const p = { x: command.x / unitsPerEm, y: command.y / unitsPerEm };
                currentContour.triangles.push(referencePoint.x, referencePoint.y, tail.x, tail.y, p.x, p.y);
                tail = p;
            } else if (command.type === 'C') {
                const p1 = { x: command.x1 / unitsPerEm, y: command.y1 / unitsPerEm };
                const p2 = { x: command.x2 / unitsPerEm, y: command.y2 / unitsPerEm };
                const p12 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
                const p = { x: command.x / unitsPerEm, y: command.y / unitsPerEm };
                currentContour.triangles.push(referencePoint.x, referencePoint.y, tail.x, tail.y, p.x, p.y);
                currentContour.curves.push(tail.x, tail.y, p12.x, p12.y, p.x, p.y);
                tail = p;
            } else if (command.type === 'Q') {
                const p1 = { x: command.x1 / unitsPerEm, y: command.y1 / unitsPerEm };
                const p = { x: command.x / unitsPerEm, y: command.y / unitsPerEm };
                currentContour.triangles.push(referencePoint.x, referencePoint.y, tail.x, tail.y, p.x, p.y);
                currentContour.curves.push(tail.x, tail.y, p1.x, p1.y, p.x, p.y);
                tail = p;
            }
        }

        contours.push(currentContour)
    }
    console.log('contours: ', contours);
    return contours;
}


export const draw = (device: GPUDevice, context: GPUCanvasContext, presentationFormat: GPUTextureFormat, contours: Contour[]) => {
    const triangles = contours.reduce((acc: number[], contour) => {
        acc.push(...contour.triangles);
        return acc;
    }, [])
    const trianglesF32 = new Float32Array(triangles);
    // Create a GPU buffer to store the vertex data
    const trianglesBuffer = device.createBuffer({
        size: trianglesF32.byteLength, // Size in bytes
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, // Mark as vertex buffer and allow copying data to it
        mappedAtCreation: true, // Map the buffer memory for immediate writing
    });
    // Write the vertex data to the buffer
    new Float32Array(trianglesBuffer.getMappedRange()).set(trianglesF32);
    trianglesBuffer.unmap(); // Unmap the buffer to make it accessible by the GPU

    const clockwiseCurves = contours.reduce((acc: number[], contour) => {
        if (contour.clockwise) {
            acc.push(...contour.curves);
        }
        return acc;
    }, [])
    const clockwiseCurvesF32 = new Float32Array(clockwiseCurves);
    // Create a GPU buffer to store the vertex data
    const clockwiseCurvesBuffer = device.createBuffer({
        size: clockwiseCurvesF32.byteLength, // Size in bytes
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, // Mark as vertex buffer and allow copying data to it
        mappedAtCreation: true, // Map the buffer memory for immediate writing
    });
    // Write the vertex data to the buffer
    new Float32Array(clockwiseCurvesBuffer.getMappedRange()).set(clockwiseCurvesF32);
    clockwiseCurvesBuffer.unmap(); // Unmap the buffer to make it accessible by the GPU

    const counterClockwiseCurves = contours.reduce((acc: number[], contour) => {
        if (!contour.clockwise) {
            acc.push(...contour.curves);
        }
        return acc;
    }, [])
    const counterClockwiseCurvesF32 = new Float32Array(counterClockwiseCurves);
    // Create a GPU buffer to store the vertex data
    const counterClockwiseCurvesBuffer = device.createBuffer({
        size: counterClockwiseCurvesF32.byteLength, // Size in bytes
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, // Mark as vertex buffer and allow copying data to it
        mappedAtCreation: true, // Map the buffer memory for immediate writing
    });
    // Write the vertex data to the buffer
    new Float32Array(counterClockwiseCurvesBuffer.getMappedRange()).set(counterClockwiseCurvesF32);
    counterClockwiseCurvesBuffer.unmap(); // Unmap the buffer to make it accessible by the GPU

    const squareVertices = new Float32Array([
        -0.9, 0.9,
        0.9, 0.9,
        0.9, -0.9,
        -0.9, 0.9,
        0.9, -0.9,
        -0.9, -0.9,
    ]);

    const squareVertexBuffer = device.createBuffer({
        size: squareVertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
    });
    new Float32Array(squareVertexBuffer.getMappedRange()).set(squareVertices);
    squareVertexBuffer.unmap();



    console.log('triangles: ', trianglesBuffer);
    console.log('clockwiseCurves: ', clockwiseCurves);
    console.log('counterClockwiseCurves: ', counterClockwiseCurves);


    const shaderCode = `
                // Vertex Shader
                @vertex
                fn vs_main(@location(0) pos : vec2<f32>) -> @builtin(position) vec4<f32> {
                    return vec4<f32>(pos, 0.0, 1.0);
                }

                // Fragment Shader for the triangle (stencil invert) - its color will be discarded
                @fragment
                fn fs_triangle() -> @location(0) vec4<f32> {
                    return vec4<f32>(0.0, 1.0, 0.0, 1.0); // Green
                }

                // Fragment Shader for the square (the final visible object)
                @fragment
                fn fs_square() -> @location(0) vec4<f32> {
                    return vec4<f32>(1.0, 0.0, 0.0, 1.0); // Red
                }
            `;
    const shaderModule = device.createShaderModule({ code: shaderCode });


    // Define the render pipeline layout
    const pipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [], // No bind groups needed for this simple example
    });

    // Create the render pipeline
    const renderPipeline = device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: {
            module: shaderModule,
            entryPoint: 'vs_main', // Entry point function in the vertex shader
            buffers: [
                {
                    arrayStride: 2 * 4, // 3 floats * 4 bytes/float = 12 bytes per 
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
            module: shaderModule,
            entryPoint: 'fs_triangle', // Entry point function in the fragment shader
            targets: [
                {
                    format: presentationFormat, // Match the canvas format
                    writeMask: 0,
                },
            ],
        },
        depthStencil: {
            format: 'depth24plus-stencil8',
            depthWriteEnabled: false,
            depthCompare: 'always',
            stencilFront: {
                compare: 'always',
                failOp: 'keep',
                passOp: 'invert', // The key feature: invert the stencil value
                depthFailOp: 'keep',
            },
            stencilBack: {
                compare: 'always',
                failOp: 'keep',
                passOp: 'invert',
                depthFailOp: 'keep',
            },
            stencilWriteMask: 0x01,
            stencilReadMask: 0,
        },
        // Define the primitive topology as 'line-strip' to draw connected lines
        primitive: {
            topology: 'triangle-list', // Connects all vertices in order
        },
    });

    // === 5. Create the second pipeline (for final color drawing) ===
    const colorDrawPipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module: shaderModule,
            entryPoint: 'vs_main',
            buffers: [{
                arrayStride: 2 * 4,
                attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
            }],
        },
        primitive: { topology: 'triangle-list' },
        fragment: {
            module: shaderModule,
            entryPoint: 'fs_square',
            targets: [{ format: presentationFormat }],
        },
        depthStencil: {
            format: 'depth24plus-stencil8',
            depthWriteEnabled: false,
            depthCompare: 'always',
            stencilFront: {
                compare: 'equal', // Only draw where the stencil value is equal to reference
                failOp: 'keep',
                passOp: 'keep',
                depthFailOp: 'keep',
            },
            stencilBack: {
                compare: 'equal',
                failOp: 'keep',
                passOp: 'keep',
                depthFailOp: 'keep',
            },
            stencilWriteMask: 0,
            stencilReadMask: 0xFF,
        },
    });

    // Create a command encoder to record rendering commands
    const commandEncoder = device.createCommandEncoder();

    context.configure({
        device,
        format: presentationFormat,
        alphaMode: 'opaque', // Opaque background
    });

    // Begin a render pass, specifying the render target (canvas)
    const textureView = context.getCurrentTexture().createView();
    const depthStencilTexture = device.createTexture({
        size: [context.canvas.width, context.canvas.height],
        format: 'depth24plus-stencil8',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const depthStencilView = depthStencilTexture.createView();
    const renderPassEncoder = commandEncoder.beginRenderPass({
        colorAttachments: [
            {
                view: textureView,
                clearValue: { r: 0.9, g: 0.95, b: 1.0, a: 1.0 }, // Clear color (light blue)
                loadOp: 'clear', // Clear the texture before drawing
                storeOp: 'store', // Store the result
            },
        ],
        depthStencilAttachment: {
            view: depthStencilView,
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
            stencilClearValue: 0, // Clear stencil buffer to 0
            stencilLoadOp: 'clear',
            stencilStoreOp: 'store',
        },
    });

    // First pass: Draw the triangles
    renderPassEncoder.setPipeline(renderPipeline);
    // Set the vertex buffer at slot 0 (corresponds to index 0 in `buffers` array above)
    renderPassEncoder.setVertexBuffer(0, trianglesBuffer);
    // Draw the vertices. We draw all generated vertices.
    renderPassEncoder.draw(trianglesF32.length / 2);

    // Second pass: Draw the square, which will be masked by the stencil buffer
    renderPassEncoder.setPipeline(colorDrawPipeline);
    renderPassEncoder.setVertexBuffer(0, squareVertexBuffer);
    renderPassEncoder.setStencilReference(1); // Only draw where the stencil value is 1
    renderPassEncoder.draw(6); // Draw 6 vertices for the square

    // End the render pass
    renderPassEncoder.end();

    // Finish encoding commands and submit them to the device queue
    device.queue.submit([commandEncoder.finish()]);

}