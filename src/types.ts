import { type Vec3 } from "wgpu-matrix";

export interface Camera {
  screenWidth: number;
  screenHeight: number;
  focalLength: number;
  FOV: number; // Vertical camera FOV
  origin: Vec3;
  lookat: Vec3;
}
