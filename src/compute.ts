import computeWGSL from "./shaders/compute.wgsl?raw";
import type { Camera } from "./types";
import { vec3 } from "wgpu-matrix";

export class Tracer {
  private device: GPUDevice;

  private computePipeline: GPUComputePipeline;
  private computeBindGroup: GPUBindGroup | null = null;

  private cachedPixelBuffer: GPUBuffer | null = null;

  private cameraUniform: GPUBuffer;
  private cameraStagingArray = new ArrayBuffer(20 * 4);

  constructor(device: GPUDevice) {
    this.device = device;

    const computeShader = device.createShaderModule({
      label: " Tracer Compute Shader ",
      code: computeWGSL,
    });

    this.computePipeline = device.createComputePipeline({
      label: " Tracer Compute Pipeline ",
      layout: "auto",
      compute: {
        module: computeShader,
      },
    });

    this.cameraUniform = this.device.createBuffer({
      label: " Camera uniform buffer ",
      size: 4 * 20,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  /**
   * Refreshes the bind group bindings if the target output canvas buffer changes.
   */
  private updateBindGroup(pixelBuffer: GPUBuffer) {
    this.cachedPixelBuffer = pixelBuffer;
    this.computeBindGroup = this.device.createBindGroup({
      label: " Tracer Compute Bind Group ",
      layout: this.computePipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: { buffer: this.cachedPixelBuffer! },
        },
        {
          binding: 1,
          resource: { buffer: this.cameraUniform },
        },
      ],
    });
  }

  /**
   * Executes the ray-tracing compute pass.
   */
  public run(camera: Camera, pixelBuffer: GPUBuffer) {
    // Rebind only if the canvas/pixel output buffer swapped or was resized
    if (pixelBuffer != this.cachedPixelBuffer || !this.computeBindGroup) {
      this.updateBindGroup(pixelBuffer);
    }

    // Calculate math and upload uniform block to GPU
    this.updateCameraUniform(camera);
    this.device.queue.writeBuffer(
      this.cameraUniform,
      0,
      this.cameraStagingArray,
    );

    // 16x16 workgroup sizes matching the compute shader configuration
    const WORKGROUP_SIZE = 16;
    const dispatchX = Math.ceil(camera.screenWidth / WORKGROUP_SIZE);
    const dispatchY = Math.ceil(camera.screenHeight / WORKGROUP_SIZE);

    const commandEncoder = this.device.createCommandEncoder();
    const computePass = commandEncoder.beginComputePass({
      label: " Tracer Compute Pass ",
    });
    computePass.setPipeline(this.computePipeline);
    computePass.setBindGroup(0, this.computeBindGroup);
    computePass.dispatchWorkgroups(dispatchX, dispatchY);
    computePass.end();

    this.device.queue.submit([commandEncoder.finish()]);
  }

  /**
   * Calculates ray generation vectors and maps them into a 16-byte aligned array.
   */
  private updateCameraUniform(camera: Camera) {
    let cameraDataView = new DataView(this.cameraStagingArray);

    // Camera coordinate system vectors
    const lookDir = vec3.normalize(vec3.sub(camera.lookat, camera.origin));
    const cameraRight = vec3.normalize(vec3.cross(lookDir, [0, 1, 0]));
    const cameraUp = vec3.cross(cameraRight, lookDir); // Accurate camera up vector

    // Viewport dimensions
    const aspectRatio = camera.screenWidth / camera.screenHeight;
    const viewportHeight = 2.0 * Math.tan(camera.FOV / 2) * camera.focalLength;
    const viewportWidth = viewportHeight * aspectRatio;

    // Viewport edge-vectors
    const viewportU = vec3.mulScalar(cameraRight, viewportWidth);
    const viewportV = vec3.mulScalar(cameraUp, -viewportHeight); // Negative to scan top-to-bottom

    // Pixel-to-pixel delta vectors
    const pixelDeltaU = vec3.divScalar(viewportU, camera.screenWidth);
    const pixelDeltaV = vec3.divScalar(viewportV, camera.screenHeight);

    // Upper-left corner of Viewport
    const viewportTopLeft = vec3.create();
    vec3.addScaled(camera.origin, lookDir, camera.focalLength, viewportTopLeft);
    vec3.addScaled(viewportTopLeft, viewportU, -0.5, viewportTopLeft);
    vec3.addScaled(viewportTopLeft, viewportV, -0.5, viewportTopLeft);

    // Center of the top-left coordinate pixel (0, 0)
    const pixel00Loc = vec3.create();
    vec3.addScaled(viewportTopLeft, pixelDeltaU, 0.5, pixel00Loc);
    vec3.addScaled(pixel00Loc, pixelDeltaV, 0.5, pixel00Loc);

    // --- Packing data into the DataView ---
    let offset = 0;
    const isLittleEndian = true;

    // [Bytes 0-11] Camera Origin (+ 4-byte padding at 12)
    cameraDataView.setFloat32(offset + 0, camera.origin[0], isLittleEndian);
    cameraDataView.setFloat32(offset + 4, camera.origin[1], isLittleEndian);
    cameraDataView.setFloat32(offset + 8, camera.origin[2], isLittleEndian);
    offset += 16;

    // [Bytes 16-27] Pixel 0,0 Location (+ 4-byte padding at 28)
    cameraDataView.setFloat32(offset + 0, pixel00Loc[0], isLittleEndian);
    cameraDataView.setFloat32(offset + 4, pixel00Loc[1], isLittleEndian);
    cameraDataView.setFloat32(offset + 8, pixel00Loc[2], isLittleEndian);
    offset += 16;

    // [Bytes 32-43] Pixel Delta U (+ 4-byte padding at 44)
    cameraDataView.setFloat32(offset + 0, pixelDeltaU[0], isLittleEndian);
    cameraDataView.setFloat32(offset + 4, pixelDeltaU[1], isLittleEndian);
    cameraDataView.setFloat32(offset + 8, pixelDeltaU[2], isLittleEndian);
    offset += 16;

    // [Bytes 48-59] Pixel Delta V (+ 4-byte padding at 60)
    cameraDataView.setFloat32(offset + 0, pixelDeltaV[0], isLittleEndian);
    cameraDataView.setFloat32(offset + 4, pixelDeltaV[1], isLittleEndian);
    cameraDataView.setFloat32(offset + 8, pixelDeltaV[2], isLittleEndian);
    offset += 16;

    // [Bytes 64-71] Screen Dimensions
    cameraDataView.setUint32(offset + 0, camera.screenWidth, isLittleEndian);
    cameraDataView.setUint32(offset + 4, camera.screenHeight, isLittleEndian);
  }
}
