import computeWGSL from "./shaders/compute.wgsl?raw";
import type { Camera } from "./types";
import { vec3 } from "wgpu-matrix";

export class Tracer {
  private device: GPUDevice;

  private computeShader: GPUShaderModule;
  private computePipeline: GPUComputePipeline;
  private computeBindGroup: GPUBindGroup | null = null;

  private cameraUniform: GPUBuffer;

  constructor(device: GPUDevice) {
    this.device = device;

    this.computeShader = device.createShaderModule({
      label: " Tracer Compute Shader ",
      code: computeWGSL,
    });

    this.computePipeline = device.createComputePipeline({
      label: " Tracer Compute Pipeline ",
      layout: "auto",
      compute: {
        module: this.computeShader,
      },
    });

    this.cameraUniform = this.device.createBuffer({
      label: " Screen resolution buffer uniform ",
      size: 4 * 20,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  private cachedPixelBuffer: GPUBuffer | null = null;
  private rebindPixelBuffer() {
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

  public run(camera: Camera, pixelBuffer: GPUBuffer) {
    if (pixelBuffer != this.cachedPixelBuffer || !this.computeBindGroup) {
      this.cachedPixelBuffer = pixelBuffer;
      this.rebindPixelBuffer();
    }

    let cameraData = new ArrayBuffer(this.cameraUniform.size);
    let cameraDataView = new DataView(cameraData);
    this.prepare(camera, cameraDataView);
    this.device.queue.writeBuffer(this.cameraUniform, 0, cameraData);

    const workgroupSizeX = 16;
    const workgroupSizeY = 16;

    // Calculate how many 16x16 blocks are needed to cover the canvas
    const dispatchX = Math.ceil(camera.screenWidth / workgroupSizeX);
    const dispatchY = Math.ceil(camera.screenHeight / workgroupSizeY);

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

  private prepare(camera: Camera, view: DataView) {
    // 1. Calculate camera coordinate system vectors
    const lookDir = vec3.normalize(vec3.sub(camera.lookat, camera.origin));
    const cameraRight = vec3.normalize(vec3.cross(lookDir, [0, 1, 0]));
    const cameraUp = vec3.cross(cameraRight, lookDir); // Accurate camera up vector

    // 2. Determine viewport dimensions
    // Note: Assumes camera.FOV is in radians. If it's degrees, use (camera.FOV * Math.PI / 180)
    const aspectRatio = camera.screenWidth / camera.screenHeight;
    const viewportHeight = 2.0 * Math.tan(camera.FOV / 2) * camera.focalLength;
    const viewportWidth = viewportHeight * aspectRatio;

    // 3. Calculate vectors across the viewport edges
    const viewportU = vec3.mulScalar(cameraRight, viewportWidth);
    const viewportV = vec3.mulScalar(cameraUp, -viewportHeight); // Negative to scan top-to-bottom

    // 4. Calculate pixel-to-pixel delta vectors
    const pixelDeltaU = vec3.divScalar(viewportU, camera.screenWidth);
    const pixelDeltaV = vec3.divScalar(viewportV, camera.screenHeight);

    // 5. Find the upper-left corner of the viewport in world space
    const viewportTopLeft = vec3.create();
    vec3.addScaled(camera.origin, lookDir, camera.focalLength, viewportTopLeft);
    vec3.addScaled(viewportTopLeft, viewportU, -0.5, viewportTopLeft);
    vec3.addScaled(viewportTopLeft, viewportV, -0.5, viewportTopLeft);

    // 6. Shift to the center of the first pixel (pixel 0,0) as per your comment
    const pixel00Loc = vec3.create();
    vec3.addScaled(viewportTopLeft, pixelDeltaU, 0.5, pixel00Loc);
    vec3.addScaled(pixel00Loc, pixelDeltaV, 0.5, pixel00Loc);

    // 7. Pack data into the DataView buffer matching WGSL / Uniform layout rules
    let offset = 0;
    const isLittleEndian = true;

    // [Bytes 0-11] Camera Origin (+ 4-byte padding at 12)
    view.setFloat32(offset + 0, camera.origin[0], isLittleEndian);
    view.setFloat32(offset + 4, camera.origin[1], isLittleEndian);
    view.setFloat32(offset + 8, camera.origin[2], isLittleEndian);
    offset += 16;

    // [Bytes 16-27] Pixel 0,0 Location (+ 4-byte padding at 28)
    view.setFloat32(offset + 0, pixel00Loc[0], isLittleEndian);
    view.setFloat32(offset + 4, pixel00Loc[1], isLittleEndian);
    view.setFloat32(offset + 8, pixel00Loc[2], isLittleEndian);
    offset += 16;

    // [Bytes 32-43] Pixel Delta U (+ 4-byte padding at 44)
    view.setFloat32(offset + 0, pixelDeltaU[0], isLittleEndian);
    view.setFloat32(offset + 4, pixelDeltaU[1], isLittleEndian);
    view.setFloat32(offset + 8, pixelDeltaU[2], isLittleEndian);
    offset += 16;

    // [Bytes 48-59] Pixel Delta V (+ 4-byte padding at 60)
    view.setFloat32(offset + 0, pixelDeltaV[0], isLittleEndian);
    view.setFloat32(offset + 4, pixelDeltaV[1], isLittleEndian);
    view.setFloat32(offset + 8, pixelDeltaV[2], isLittleEndian);
    offset += 16;

    // [Bytes 64-71] Screen Dimensions
    view.setUint32(offset + 0, camera.screenWidth, isLittleEndian);
    view.setUint32(offset + 4, camera.screenHeight, isLittleEndian);
  }
}
