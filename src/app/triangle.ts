import { Point2D } from "./model";


export const makeTriangles = (font: opentype.Font) => {
    const triangles: Point2D[] = [];
    console.log('font: ', font);
    const path = font.glyphs.get(72).path;
    console.log('path: ', path);
    const referencePoint = { x: -0.5, y: 0.5 };
    const unitsPerEm = 2048;
    let currentTriangle: Point2D[] = [];
    for (const command of path.commands) {
        if (command.type === 'M') {
            const currentPoint = { x: command.x / unitsPerEm, y: command.y / unitsPerEm }
            currentTriangle = [referencePoint, currentPoint];
        } else if (command.type === 'L') {
            const currentPoint = { x: command.x / unitsPerEm, y: command.y / unitsPerEm }
            currentTriangle.push(currentPoint);
            triangles.push(...currentTriangle);
            currentTriangle = [referencePoint, currentPoint];
        } else if (command.type === 'C') {
            // const p0 = triangles[triangles.length - 1];
            // const p1 = { x: command.x1 / unitsPerEm, y: command.y1 / unitsPerEm };
            // const p2 = { x: command.x2 / unitsPerEm, y: command.y2 / unitsPerEm };
            // const p3 = { x: command.x / unitsPerEm, y: command.y / unitsPerEm };
            const currentPoint = { x: command.x / unitsPerEm, y: command.y / unitsPerEm };
            currentTriangle.push(currentPoint);
            triangles.push(...currentTriangle);
            currentTriangle = [referencePoint, currentPoint];
        } else if (command.type === 'Q') {
            // const p0 = triangles[triangles.length - 1];
            // const p1 = { x: command.x1 / unitsPerEm, y: command.y1 / unitsPerEm };
            // const p2 = { x: command.x / unitsPerEm, y: command.y / unitsPerEm };
            const currentPoint = { x: command.x / unitsPerEm, y: command.y / unitsPerEm };
            currentTriangle.push(currentPoint);
            triangles.push(...currentTriangle);
            currentTriangle = [referencePoint, currentPoint];
        } else if (command.type === 'Z') {
            currentTriangle = [];
        }
    }
    console.log('triangles: ', triangles);
    return triangles;
}

export const drawTriangles = (device: GPUDevice, context: GPUCanvasContext, presentationFormat: GPUTextureFormat, triangles: Point2D[]) => {
    // Configure the canvas context with the device and format
    context.configure({
        device,
        format: presentationFormat,
        alphaMode: 'opaque', // Opaque background
    });
    const flattenedArray = triangles.flat().reduce((accumulator: number[], currentPoint) => {
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

    const squareVertices = new Float32Array([
        -0.9, 0.9,
        0.9, 0.9,
        0.9, -0.9,
        -0.9, 0.9,
        0.9, -0.9,
        -0.9, -0.9,
    ]);
    // Two overlapping triangles

    const squareVertexBuffer = device.createBuffer({
        size: squareVertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
    });
    new Float32Array(squareVertexBuffer.getMappedRange()).set(squareVertices);
    squareVertexBuffer.unmap();

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

    // Begin a render pass, specifying the render target (canvas)
    const textureView = context.getCurrentTexture().createView();
    const depthStencilTexture = device.createTexture({
        size: [800, 600],
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
            stencilClearValue: 1, // Clear stencil buffer to 1
            stencilLoadOp: 'clear',
            stencilStoreOp: 'store',
        },
    });

    // Set the render pipeline
    renderPassEncoder.setPipeline(renderPipeline);

    // Set the vertex buffer at slot 0 (corresponds to index 0 in `buffers` array above)
    renderPassEncoder.setVertexBuffer(0, vertexBuffer);

    // Draw the vertices. We draw all generated vertices.
    renderPassEncoder.draw(bezierVertices.length / 2);

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