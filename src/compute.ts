import computeWGSL from "./shaders/compute.wgsl?raw";
import type { Camera, Sphere } from "./types";
import { vec3 } from "wgpu-matrix";

export class Tracer {
  private device: GPUDevice;

  private computePipeline: GPUComputePipeline;
  private PixelBufferBindGroup: GPUBindGroup | null = null;
  private sceneBindGroup: GPUBindGroup | null = null;

  private cachedPixelBuffer: GPUBuffer | null = null;

  private cameraUniform: GPUBuffer;
  private cameraStagingArray = new ArrayBuffer(20 * 4);

  private sphereBuffer: GPUBuffer;
  private sphereStagingArray = new ArrayBuffer(65536);

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

    this.sphereBuffer = this.device.createBuffer({
      label: " Sphere uniform buffer ",
      size: 65536,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.sceneBindGroup = this.device.createBindGroup({
      label: " Tracer Scene Bind Group ",
      layout: this.computePipeline.getBindGroupLayout(1),
      entries: [
        {
          binding: 0,
          resource: { buffer: this.cameraUniform },
        },
        {
          binding: 1,
          resource: { buffer: this.sphereBuffer },
        },
      ],
    });
  }

  /**
   * Refreshes the pixel buffer bind group if the target output canvas buffer changes.
   */
  private updatePixelBufferBindGroup(pixelBuffer: GPUBuffer) {
    this.cachedPixelBuffer = pixelBuffer;
    this.PixelBufferBindGroup = this.device.createBindGroup({
      label: " Tracer Pixel Buffer Bind Group ",
      layout: this.computePipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: { buffer: this.cachedPixelBuffer },
        },
      ],
    });
  }

  /**
   * Executes the ray-tracing compute pass.
   */
  public run(camera: Camera, spheres: Sphere[], pixelBuffer: GPUBuffer) {
    // Rebind only if the canvas/pixel output buffer swapped or was resized
    if (pixelBuffer != this.cachedPixelBuffer || !this.PixelBufferBindGroup) {
      this.updatePixelBufferBindGroup(pixelBuffer);
    }

    // Calculate math and upload uniform block to GPU
    this.updateCameraUniform(camera);
    this.device.queue.writeBuffer(
      this.cameraUniform,
      0,
      this.cameraStagingArray,
    );

    // Populate the sphere and the material uniforms
    this.updateSphereBuffer(spheres);

    // 16x16 workgroup sizes matching the compute shader configuration
    const WORKGROUP_SIZE = 16;
    const dispatchX = Math.ceil(camera.screenWidth / WORKGROUP_SIZE);
    const dispatchY = Math.ceil(camera.screenHeight / WORKGROUP_SIZE);

    const commandEncoder = this.device.createCommandEncoder();
    const computePass = commandEncoder.beginComputePass({
      label: " Tracer Compute Pass ",
    });
    computePass.setPipeline(this.computePipeline);
    computePass.setBindGroup(0, this.PixelBufferBindGroup);
    computePass.setBindGroup(1, this.sceneBindGroup);
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

  private updateSphereBuffer(spheres: Sphere[]) {
    const sphereView = new DataView(this.sphereStagingArray);

    const sphereCount = spheres.length;
    const sphereSizeBytes = /* Sphere Struct */ 16 + /* Material Struct */ 16;

    // Write header: element count
    sphereView.setUint32(0, sphereCount, true);

    // Write array elements
    let offset = 16;
    for (const sphere of spheres) {
      // center (vec3f)
      sphereView.setFloat32(offset + 0, sphere.center[0], true);
      sphereView.setFloat32(offset + 4, sphere.center[1], true);
      sphereView.setFloat32(offset + 8, sphere.center[2], true);
      // radius (f32)
      sphereView.setFloat32(offset + 12, sphere.radius, true);
      // material (Material)
      // * Color (vec4f)
      sphereView.setFloat32(offset + 16, sphere.material.color[0], true);
      sphereView.setFloat32(offset + 20, sphere.material.color[1], true);
      sphereView.setFloat32(offset + 24, sphere.material.color[2], true);
      sphereView.setFloat32(offset + 28, sphere.material.color[3], true);

      offset += sphereSizeBytes;
    }

    this.device.queue.writeBuffer(
      this.sphereBuffer,
      0,
      this.sphereStagingArray,
    );
  }
}
