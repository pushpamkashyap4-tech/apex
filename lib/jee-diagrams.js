// Keep diagram tags pointed at the curated assets shipped with this project.
// Keep keys stable: the assistant prompt and custom-tag renderer both use them.
export const JEE_DIAGRAMS = Object.freeze({
  // Physics
  "projectile-motion": "/assets/images/phys_projectile_motion.png.jpg",
  "free-body-diagram": "/assets/images/phys_fbd.png.jpg",
  "inclined-plane": "/assets/images/phys_fbd.png.jpg",
  "electric-field-lines": "/assets/images/phys_electric_field_point_charges.png.jpg",
  "electric-flux": "/assets/images/phys_electric_flux.svg",
  "magnetic-field-wire": "/assets/images/phys_magnetic_field_wire.svg",
  "ray-optics-lens": "/assets/images/phys_optics_ray_diagrams.png.jpg",
  "young-double-slit": "/assets/images/phys_ydse.png.jpg",
  // Chemistry
  "chem-benzene": "/assets/images/chem_benzene.png.jpg",
  "chem-electrolytic-cell": "/assets/images/chem_electrolytic_cell.png.jpg",
  "chem-galvanic-cell": "/assets/images/chem_galvanic_cell.png.jpg",
  "chem-hydrogen-bonding": "/assets/images/chem_hydrogen_bonding.png.jpg",
  "chem-crystal-lattice": "/assets/images/chem_solid_state_types.png.jpg",
  // Mathematics
  "area-under-curve": "/assets/images/area_under_curve.png.jpg",
  "unit-circle": "/assets/images/math_circle.png.jpg",
  "conic-sections": "/assets/images/conic_sections.png.jpg",
  "vector-projection": "/assets/images/vector_geometry.png.jpg",
  "three-dimensional-coordinate-geometry": "/assets/images/vector_geometry.png.jpg"
});

export const JEE_DIAGRAM_KEYS = Object.freeze(Object.keys(JEE_DIAGRAMS));

export function findLocalDiagramKey(request = "") {
  const normalized = String(request).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return JEE_DIAGRAM_KEYS.find((key) => {
    const topic = key.replace(/^chem-/, "").replace(/-/g, " ");
    return normalized === topic || normalized.includes(` ${topic} `) || normalized.startsWith(`${topic} `) || normalized.endsWith(` ${topic}`);
  }) || null;
}
