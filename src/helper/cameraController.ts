import { type Camera } from "../types";

export class CameraController {
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;

  // Orbit parameters
  private theta = 0; // Horizontal angle (radians)
  private phi = Math.PI / 2; // Vertical angle (radians)
  private radius = 5.0; // Distance from the lookat point

  // Sensitivity settings
  private lookSensitivity = 0.005;
  private zoomSensitivity = 0.002;

  constructor(canvas: HTMLCanvasElement, initialRadius: number = 3.0) {
    this.radius = initialRadius;
    this.setupInputs(canvas);
  }

  private setupInputs(canvas: HTMLCanvasElement) {
    // Mouse Down - Start dragging
    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0) {
        // Left click only
        this.isDragging = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
      }
    });

    // Mouse Move - Orbit around the center
    window.addEventListener("mousemove", (e) => {
      if (!this.isDragging) return;

      const deltaX = e.clientX - this.lastMouseX;
      const deltaY = e.clientY - this.lastMouseY;

      this.theta -= deltaX * this.lookSensitivity;
      this.phi -= deltaY * this.lookSensitivity;

      // Restrict vertical movement so the camera doesn't flip completely upside down
      const epsilon = 0.1;
      this.phi = Math.max(epsilon, Math.min(Math.PI - epsilon, this.phi));

      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    // Mouse Up - Stop dragging
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.isDragging = false;
    });

    // Wheel - Zoom in and out
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.radius += e.deltaY * this.zoomSensitivity;
        this.radius = Math.max(0.5, this.radius); // Don't zoom inside the lookat target
      },
      { passive: false },
    );
  }

  /**
   * Updates the passed Camera object's origin based on the current orbit angles.
   * Keeps the camera facing towards the defined 'lookat' position.
   */
  public updateCamera(camera: Camera) {
    // Convert spherical coordinates to Cartesian coordinates relative to target
    const x = this.radius * Math.sin(this.phi) * Math.sin(this.theta);
    const y = this.radius * Math.cos(this.phi);
    const z = this.radius * Math.sin(this.phi) * Math.cos(this.theta);

    // Apply relative to the camera's lookat point
    camera.origin[0] = camera.lookat[0] + x;
    camera.origin[1] = camera.lookat[1] + y;
    camera.origin[2] = camera.lookat[2] + z;
  }
}
