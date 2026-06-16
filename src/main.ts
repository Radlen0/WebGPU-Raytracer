import "./style.css";
import computeShaderWGSL from "./compute.wgsl?raw";
import { quitIfWebGPUNotAvailable } from "./utils";

// --- Setup WebGPU ---
const adapter = await navigator.gpu?.requestAdapter();
const device = await adapter?.requestDevice();
quitIfWebGPUNotAvailable(adapter, device);

// --- Setup The Canvas ---
let canvas = document.querySelector("canvas");
if (!canvas) throw new Error("Unable to find the canvas");
const canvasCtx: GPUCanvasContext = canvas.getContext("webgpu")!;
const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

canvasCtx.configure({
  device: device,
  format: canvasFormat,
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});
