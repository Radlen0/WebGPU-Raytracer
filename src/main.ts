import "./style.css";
import { Screen } from "./screen";
import { Tracer } from "./compute";
import { type Camera, type Sphere } from "./types";
import { CameraController } from "./helper/cameraController";
import { quitIfWebGPUNotAvailable } from "./utils";
import { DebugPannel } from "./debugPanel";

/* === SETUP & INITIALIZATION === */

// --- Setup WebGPU ---
const adapter = await navigator.gpu?.requestAdapter();
const device = await adapter?.requestDevice();
quitIfWebGPUNotAvailable(adapter, device);

// --- Setup The Canvas ---
let canvas = document.querySelector("canvas");
if (!canvas) throw new Error("Unable to find the canvas element in the DOM.");
const canvasCtx = canvas.getContext("webgpu") as GPUCanvasContext;
const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

canvasCtx.configure({
  device: device,
  format: canvasFormat,
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});

// --- INITIALIZATIONS ---
const screen = new Screen(device);
const tracer = new Tracer(device);
let pixelStorageBuffer: GPUBuffer | null = null;

const cameraController = new CameraController(canvas, 4.0);
const debugPannel = new DebugPannel();

const globalCamera: Camera = {
  origin: new Float32Array([0, 0, 4]),
  lookat: new Float32Array([0, 0, 0]), // Pointing at world center
  FOV: 1.0, // Swapped to a standard wide-angle view (~60 deg) for visual context
  focalLength: 1.0,
  screenHeight: canvasCtx.canvas.height,
  screenWidth: canvasCtx.canvas.width,
};

/* === BUFFER MANAGEMENT === */

/*
 * Reallocates and populates the pixel storage buffer with initial gradient data.
 * Properly disposes of old GPU memory allocations to prevent memory leaks.
 */
function reallocatePixelBuffer(
  device: GPUDevice,
  width: number,
  height: number,
): GPUBuffer {
  if (pixelStorageBuffer) pixelStorageBuffer.destroy();

  // Buffer Params
  const bytesPerPixel = 16; // vec4f (4 floats * 4 bytes)
  const bufferSize = bytesPerPixel * width * height;

  const newBuffer = device.createBuffer({
    label: " Pixel Storage Buffer ",
    size: bufferSize,
    usage: GPUBufferUsage.STORAGE,
  });

  return newBuffer;
}
pixelStorageBuffer = reallocatePixelBuffer(device, canvas.width, canvas.height);

/* === MAIN RENDER LOOP === */

const spheres: Sphere[] = [
  {
    center: new Float32Array([0, 0, 0]),
    radius: 0.5,
    material: {
      color: new Float32Array([1.0, 0, 0, 1.0]),
    },
  },
  {
    center: new Float32Array([2.0, 0, 0]),
    radius: 0.25,
    material: {
      color: new Float32Array([0.0, 1.0, 1.0, 1.0]),
    },
  },
];
debugPannel.bindSphereGeometry(spheres);

function computeLoop() {
  debugPannel.updateComputefps();
  let startTime = performance.now();

  globalCamera.screenWidth = canvasCtx.canvas.width;
  globalCamera.screenHeight = canvasCtx.canvas.height;

  if (pixelStorageBuffer) {
    tracer.run(globalCamera, spheres, pixelStorageBuffer);
  }

  debugPannel.updateJSTime(startTime);
  setTimeout(computeLoop, 0);
}

function renderLoop() {
  cameraController.updateCamera(globalCamera);

  if (pixelStorageBuffer) {
    screen.display(canvasCtx, pixelStorageBuffer);
  }

  requestAnimationFrame(renderLoop);
}

computeLoop();
requestAnimationFrame(renderLoop);

// === WINDOW RESIZE HANDLING ===

// Automatically adjust canvas rendering resolution to match the size it is displayed
const observer = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const canvas = entry.target as HTMLCanvasElement;

    const targetWidth = entry.contentBoxSize[0].inlineSize;
    const targetHeight = entry.contentBoxSize[0].blockSize;

    // prettier-ignore
    canvas.width = Math.max(1, Math.min(targetWidth, device.limits.maxTextureDimension2D));
    // prettier-ignore
    canvas.height = Math.max(1,Math.min(targetHeight, device.limits.maxTextureDimension2D));

    pixelStorageBuffer = reallocatePixelBuffer(
      device,
      canvas.width,
      canvas.height,
    );
  }
});
observer.observe(canvas);
