import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import opentype from 'opentype.js';
import { draw, findContours } from './render';

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
    this.init();
  }

  async init() {
    const { device, context, presentationFormat } = await this.initWebGPU();
    const font = await this.loadFont();
    const contours = findContours(font);
    draw(device, context, presentationFormat, contours);
  }

  loadFont = async (src = 'assets/courier.ttf') => {
    const font = await opentype.load(src);
    return font;
  }

  // Main asynchronous function to initialize and render with WebGPU
  async initWebGPU() {
    // Request a GPU adapter (physical GPU)
    const adapter = await navigator.gpu.requestAdapter() as GPUAdapter;

    // Request a GPU device (logical device for rendering)
    const device = await adapter.requestDevice() as GPUDevice;

    const canvas = document.getElementById('webgpu') as HTMLCanvasElement;

    // Get the canvas context for WebGPU
    const context = canvas.getContext('webgpu') as GPUCanvasContext;

    // Determine the preferred canvas format (e.g., bgra8unorm)
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

    return { device, context, presentationFormat };
  }
}
