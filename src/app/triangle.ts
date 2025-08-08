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
            topology: 'triangle-list', // Connects all vertices in order
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
    renderPassEncoder.draw(bezierVertices.length / 2);

    // End the render pass
    renderPassEncoder.end();

    // Finish encoding commands and submit them to the device queue
    device.queue.submit([commandEncoder.finish()]);
}