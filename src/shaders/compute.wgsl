// --- RAY ---
struct Ray{
  origin: vec3f,
  direction: vec3f,
}
// Ray functions
fn get_ray_position(ray: Ray, t: vec3f) -> vec3f {
  return ray.origin + ray.direction * t;
}
