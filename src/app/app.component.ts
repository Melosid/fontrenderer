import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { loadFont, makeStrips, Strip } from './shape';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  title = 'font-renderer-app';
  vertices: Float32Array[] = [];
  status = '';

  ngOnInit(): void {
    loadFont().then(font => {
      makeStrips(font);
      this.initWebGPU(makeStrips(font));
    })
  }

  // Main asynchronous function to initialize and render with WebGPU
  async initWebGPU(strips: Strip[]) {
    // Request a GPU adapter (physical GPU)
    const adapter = await navigator.gpu.requestAdapter() as GPUAdapter;

    // Request a GPU device (logical device for rendering)
    const device = await adapter.requestDevice() as GPUDevice;

    const canvas = document.getElementById('webgpu') as HTMLCanvasElement;

    // Get the canvas context for WebGPU
    const context = canvas.getContext('webgpu') as GPUCanvasContext;

    // Determine the preferred canvas format (e.g., bgra8unorm)
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

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
}
