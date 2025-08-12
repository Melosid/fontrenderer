/*
    1. Find contours
    2. Set regular triangles and curves in contours
    3. Render regular triangles using stencil testing since some triangles overlap
    4. Render curves (no need for stencil testing)
*/

import { Path, PathCommand } from "opentype.js";

export type Point2D = {
    x: number;
    y: number;
}

export type Contour = {
    // multiple of 3 since each triangle is determined by 3 points
    triangles: number[];
    // multiple of 3 since each quadratic curve is determined by 3 points
    curves: number[];
}

export const findContours = (font: opentype.Font) => {
    // Get the original path
    const message = "Hello, World!";
    const fontSize = 16;
    const originalPath = font.getPath(message, 0, 0, fontSize);

    // Get the bounding box to find the minimum x and maximun x coordinates
    const { x1, x2 } = originalPath.getBoundingBox();
    const shiftX = (x2 - x1) / 2;

    // Create a new, normalized path
    const normalizedPath = new Path();

    // Iterate through the commands and shift all x coordinates and invert y coordinates
    originalPath.commands.forEach(command => {
        const normalizedCommand = { ...command } as any; // Create a shallow copy

        // Invert y and shift x to the center
        if (normalizedCommand.x !== undefined) {
            normalizedCommand.x -= shiftX;
        }
        if (normalizedCommand.y !== undefined) {
            normalizedCommand.y *= -1;
        }
        if (normalizedCommand.x1 !== undefined) {
            normalizedCommand.x1 -= shiftX;
        }
        if (normalizedCommand.y1 !== undefined) {
            normalizedCommand.y1 *= -1;
        }
        if (normalizedCommand.x2 !== undefined) {
            normalizedCommand.x2 -= shiftX;
        }
        if (normalizedCommand.y2 !== undefined) {
            normalizedCommand.y2 *= -1;
        }

        normalizedPath.commands.push(normalizedCommand);
    });

    const subPaths = normalizedPath.commands.reduce((acc: PathCommand[][], command) => {
        if (command.type === 'M') {
            acc.push([]); // Start a new sub-array when the delimiter is encountered
        }
        acc[acc.length - 1].push(command); // Add the current element to the last sub-array
        return acc;
    }, [])

    const referencePoint = { x: -1, y: 1 };
    const ratio = 75;
    const barycentricBottomLeft = [1.0, 0.0, 0.0];
    const barycentricBottomRight = [0.0, 1.0, 0.0];
    const barycentricTopMiddle = [0.0, 0.0, 1.0];
    const contours: Contour[] = [];

    for (const subPath of subPaths) {
        let currentContour!: Contour;
        let tail!: Point2D;

        for (const command of subPath) {
            if (command.type === 'M') {
                tail = { x: command.x / ratio, y: command.y / ratio };
                currentContour = {
                    triangles: [],
                    curves: [],
                }
            } else if (command.type === 'L') {
                const p = { x: command.x / ratio, y: command.y / ratio };
                currentContour.triangles.push(referencePoint.x, referencePoint.y, tail.x, tail.y, p.x, p.y);
                if (tail.x === p.x && tail.y === p.y) {
                    continue;
                }
                tail = p;
            } else if (command.type === 'C') {
                const p1 = { x: command.x1 / ratio, y: command.y1 / ratio };
                const p2 = { x: command.x2 / ratio, y: command.y2 / ratio };
                const p12 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
                const p = { x: command.x / ratio, y: command.y / ratio };
                currentContour.triangles.push(referencePoint.x, referencePoint.y, tail.x, tail.y, p.x, p.y);
                currentContour.curves.push(tail.x, tail.y, ...barycentricBottomLeft, p12.x, p12.y, ...barycentricTopMiddle, p.x, p.y, ...barycentricBottomRight);
                tail = p;
            } else if (command.type === 'Q') {
                const p1 = { x: command.x1 / ratio, y: command.y1 / ratio };
                const p = { x: command.x / ratio, y: command.y / ratio };
                currentContour.triangles.push(referencePoint.x, referencePoint.y, tail.x, tail.y, p.x, p.y);
                currentContour.curves.push(tail.x, tail.y, ...barycentricBottomLeft, p1.x, p1.y, ...barycentricTopMiddle, p.x, p.y, ...barycentricBottomRight);
                tail = p;
            }
        }

        contours.push(currentContour)
    }
    return contours;
}


export const draw = (
    device: GPUDevice,
    context: GPUCanvasContext,
    presentationFormat: GPUTextureFormat,
    antiAliasing: boolean,
    contours: Contour[]) => {
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

    const curves = contours.reduce((acc: number[], contour) => {
        acc.push(...contour.curves);
        return acc;
    }, [])
    const curvesF32 = new Float32Array(curves);
    // Create a GPU buffer to store the vertex data
    const curvesBuffer = device.createBuffer({
        size: curvesF32.byteLength, // Size in bytes
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, // Mark as vertex buffer and allow copying data to it
        mappedAtCreation: true, // Map the buffer memory for immediate writing
    });
    // Write the vertex data to the buffer
    new Float32Array(curvesBuffer.getMappedRange()).set(curvesF32);
    curvesBuffer.unmap(); // Unmap the buffer to make it accessible by the GPU

    const squareVertices = new Float32Array([
        -1.0, 1.0,
        1.0, 1.0,
        1.0, -1.0,
        -1.0, 1.0,
        1.0, -1.0,
        -1.0, -1.0,
    ]);

    const squareVertexBuffer = device.createBuffer({
        size: squareVertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
    });
    new Float32Array(squareVertexBuffer.getMappedRange()).set(squareVertices);
    squareVertexBuffer.unmap();

    const shaderCode = `
        // Shader code for the triangles
        
        // Vertex Shader for the triangle
        @vertex
        fn vs_triangle(@location(0) pos : vec2<f32>) -> @builtin(position) vec4<f32> {
            return vec4<f32>(pos, 0.0, 1.0);
        }

        // Fragment Shader for the triangle (stencil invert) - its color will be discarded
        @fragment
        fn fs_triangle() -> @location(0) vec4<f32> {
            return vec4<f32>(0.0, 0.0, 0.0, 1.0);
        }

        // Fragment Shader for the square (the final visible object)
        @fragment
        fn fs_square() -> @location(0) vec4<f32> {
            return vec4<f32>(1.0, 0.0, 0.0, 1.0); // Red
        }

        // Shader code for the curves

        struct VertexOutput {
            @builtin(position) position : vec4<f32>,
            @location(0) barycentric : vec3<f32>,
        };

        // Vertex Shader for the curve
        @vertex
        fn vs_curve(@location(0) pos : vec2<f32>, @location(1) barycentric_in : vec3<f32>) -> VertexOutput {
            var output : VertexOutput;
            // The position is already in clip space from the vertex buffer
            output.position = vec4<f32>(pos, 0.0, 1.0);
            // Pass the barycentric coordinates to the fragment shader for interpolation
            output.barycentric = barycentric_in;
            return output;
        }

        // Fragment Shader for the curve
        @fragment
        fn fs_curve(@location(0) barycentric : vec3<f32>, @builtin(front_facing) isFront : bool) -> @location(0) vec4<f32> {
            // Unpack barycentric coordinates
            let u = barycentric.x;
            let v = barycentric.y;
            let w = barycentric.z;

            let clear_color = vec4<f32>(0.9, 0.95, 1.0, 1.0); // clear color
            let fill_color = vec4<f32>(1.0, 0.0, 0.0, 1.0); // fill color

            if (w/2 + v)*(w/2 + v) < v {
                if isFront {
                    return clear_color;
                } else {
                    return fill_color;
                }
            } else {
                if isFront {
                    return fill_color;
                } else {
                    return clear_color;
                }
            };
        }
        `;
    const shaderModule = device.createShaderModule({ code: shaderCode });

    const trianglesStencilInvertPipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module: shaderModule,
            entryPoint: 'vs_triangle', // Entry point function in the vertex shader
            buffers: [
                {
                    arrayStride: 2 * Float32Array.BYTES_PER_ELEMENT,
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
        multisample: antiAliasing ? {
            count: 4,
        } : undefined,
        depthStencil: {
            format: 'depth24plus-stencil8',
            depthWriteEnabled: false,
            depthCompare: 'always',
            stencilFront: {
                compare: 'always',
                failOp: 'keep',
                passOp: 'invert',
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

    const trianglesStencilDrawPipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module: shaderModule,
            entryPoint: 'vs_triangle',
            buffers: [{
                arrayStride: 2 * Float32Array.BYTES_PER_ELEMENT,
                attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
            }],
        },
        primitive: { topology: 'triangle-list' },
        fragment: {
            module: shaderModule,
            entryPoint: 'fs_square',
            targets: [{ format: presentationFormat }],
        },
        multisample: antiAliasing ? {
            count: 4,
        } : undefined,
        depthStencil: {
            format: 'depth24plus-stencil8',
            depthWriteEnabled: false,
            depthCompare: 'always',
            stencilFront: {
                compare: 'equal',
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

    const curvesPipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module: shaderModule,
            entryPoint: 'vs_curve',
            buffers: [
                {
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: 'float32x2' }, // position
                        { shaderLocation: 1, offset: 8, format: 'float32x3' }, // barycentric coordinates
                    ],
                    arrayStride: 5 * Float32Array.BYTES_PER_ELEMENT,
                }
            ],
        },
        fragment: {
            module: shaderModule,
            entryPoint: 'fs_curve',
            targets: [{ format: presentationFormat }],
        },
        primitive: {
            topology: 'triangle-list',
        },
        multisample: antiAliasing ? {
            count: 4,
        } : undefined,
        depthStencil: {
            depthWriteEnabled: false,
            depthCompare: 'less',
            format: 'depth24plus-stencil8',
            // The stencil state is intentionally omitted.
            // The pipeline will still operate within the pass's stencil attachment,
            // but it won't perform any stencil tests or writes.
            // To be explicit, you could set stencilFront/stencilBack to `undefined`.
        },
    });

    // Create a command encoder to record rendering commands
    const commandEncoder = device.createCommandEncoder();

    context.configure({
        device,
        format: presentationFormat,
        alphaMode: 'opaque', // Opaque background
    });

    const depthStencilTexture = device.createTexture({
        size: [context.canvas.width, context.canvas.height],
        sampleCount: antiAliasing ? 4 : 1,
        format: 'depth24plus-stencil8',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const depthStencilView = depthStencilTexture.createView();

    let colorAttachment: GPURenderPassColorAttachment = {
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0.9, g: 0.95, b: 1.0, a: 1.0 },
        loadOp: 'clear', // Clear the texture before drawing
        storeOp: 'store', // Store the result
    };

    if (antiAliasing) {
        // Setup for MSAA
        const msaaTexture = device.createTexture({
            size: [context.canvas.width, context.canvas.height],
            sampleCount: 4,
            format: presentationFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        })
        colorAttachment = {
            view: msaaTexture.createView(), // Render to the multisampled texture
            resolveTarget: context.getCurrentTexture().createView(), // Resolve to the canvas
            clearValue: { r: 0.9, g: 0.95, b: 1.0, a: 1.0 },
            loadOp: 'clear',
            storeOp: 'discard', // Discard the multisample texture after resolving
        }
    }

    const renderPassEncoder = commandEncoder.beginRenderPass({
        colorAttachments: [
            colorAttachment,
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

    // Draw the triangles
    renderPassEncoder.setPipeline(trianglesStencilInvertPipeline);
    renderPassEncoder.setVertexBuffer(0, trianglesBuffer);
    renderPassEncoder.draw(trianglesF32.length / 2);

    // Draw the square, which will be masked by the stencil buffer
    renderPassEncoder.setPipeline(trianglesStencilDrawPipeline);
    renderPassEncoder.setVertexBuffer(0, squareVertexBuffer);
    renderPassEncoder.setStencilReference(1); // Only draw where the stencil value is 1
    renderPassEncoder.draw(6); // Draw 6 vertices for the square

    // Draw the curves
    renderPassEncoder.setPipeline(curvesPipeline);
    renderPassEncoder.setVertexBuffer(0, curvesBuffer);
    renderPassEncoder.setStencilReference(0);
    renderPassEncoder.draw(curvesF32.length / 5);

    // End the render pass
    renderPassEncoder.end();

    // Finish encoding commands and submit them to the device queue
    device.queue.submit([commandEncoder.finish()]);

}