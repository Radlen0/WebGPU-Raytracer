import { type Vec3 } from "wgpu-matrix";

export interface Camera {
  screenWidth: number;
  screenHeight: number;
  focalLength: number;
  FOV: number; // Vertical camera FOV
  origin: Vec3;
  lookat: Vec3;
}

export interface Sphere {
  center: Vec3,
  radius: number,
  material: Material
}

export interface Material {
  color: Vec3;
}