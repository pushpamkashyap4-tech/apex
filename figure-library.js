export const STUDY_FIGURES = [
  { id: "physics-exponential", subject: "Physics", title: "Exponential function graphs", src: "/assets/figures/physics-1.webp", pdf: "/assets/figures/physics-figures.pdf", page: 1, keywords: ["exponential graph", "exponential function", "exponential decay", "exponential growth"] },
  { id: "physics-vectors", subject: "Physics", title: "Vector addition diagrams", src: "/assets/figures/physics-2.webp", pdf: "/assets/figures/physics-figures.pdf", page: 2, keywords: ["vector", "vector addition", "triangle law", "parallelogram law", "resultant"] },
  { id: "physics-projectile", subject: "Physics", title: "Projectile motion trajectory", src: "/assets/figures/physics-3.webp", pdf: "/assets/figures/physics-figures.pdf", page: 3, keywords: ["projectile", "projectile motion", "trajectory", "range of projectile", "time of flight"] },
  { id: "physics-electric-field", subject: "Physics", title: "Electric field and charged ring", src: "/assets/figures/physics-4.webp", pdf: "/assets/figures/physics-figures.pdf", page: 4, keywords: ["electric field", "charged ring", "electrostatics", "field due to a ring"] },
  { id: "chemistry-electrolysis", subject: "Chemistry", title: "Electrolysis cell", src: "/assets/figures/chemistry-1.webp", pdf: "/assets/figures/chemistry-figures.pdf", page: 1, keywords: ["electrolysis", "electrolytic cell", "anode", "cathode"] },
  { id: "chemistry-kinetics", subject: "Chemistry", title: "Reaction order graphs", src: "/assets/figures/chemistry-2.webp", pdf: "/assets/figures/chemistry-figures.pdf", page: 2, keywords: ["chemical kinetics", "reaction order", "zero order", "first order", "second order", "rate law", "rate of reaction", "rate vs time", "concentration time graph"] },
  { id: "chemistry-arrhenius", subject: "Chemistry", title: "Arrhenius plot", src: "/assets/figures/chemistry-3.webp", pdf: "/assets/figures/chemistry-figures.pdf", page: 3, keywords: ["arrhenius", "activation energy", "temperature coefficient", "ln k", "rate constant"] },
  { id: "maths-sine-cosine", subject: "Mathematics", title: "Sine and cosine graphs", src: "/assets/figures/maths-4.webp", pdf: "/assets/figures/maths-figures.pdf", page: 4, keywords: ["trigonometric function graph", "trigonometric functions graph", "trigonometric graphs", "sine graph", "sine function graph", "cosine graph", "cosine function graph", "graph of sin", "graph of cos", "sin x graph", "cos x graph", "y = sin x", "y=sin(x)", "sine function", "cosine function", "sin x", "cos x"] },
  { id: "maths-tangent", subject: "Mathematics", title: "Tangent graph", src: "/assets/figures/maths-5.webp", pdf: "/assets/figures/maths-figures.pdf", page: 5, keywords: ["tangent graph", "tangent function graph", "graph of tan", "tan x graph", "y = tan x", "tangent function", "trigonometric function graph", "trigonometric graphs", "tan x"] },
  { id: "maths-inverse-sine-cos-tan", subject: "Mathematics", title: "Graphs of sin⁻¹(sin x), cos⁻¹(cos x), and tan⁻¹(tan x)", src: "/assets/figures/maths-1.webp", pdf: "/assets/figures/maths-figures.pdf", page: 1, keywords: ["inverse trigonometric", "inverse trig", "inverse sine", "inverse cosine", "inverse tangent", "sin⁻¹", "cos⁻¹", "tan⁻¹", "sin^-1", "cos^-1", "tan^-1", "sin inverse", "cos inverse", "tan inverse", "principal value graph"] },
  { id: "maths-inverse-cot-reciprocal", subject: "Mathematics", title: "Inverse cotangent and reciprocal graphs", src: "/assets/figures/maths-2.webp", pdf: "/assets/figures/maths-figures.pdf", page: 2, keywords: ["inverse cotangent", "inverse cosecant", "inverse secant", "cot⁻¹", "cosec⁻¹", "sec⁻¹"] },
  { id: "maths-inverse-cubic", subject: "Mathematics", title: "Inverse trigonometric function graphs", src: "/assets/figures/maths-3.webp", pdf: "/assets/figures/maths-figures.pdf", page: 3, keywords: ["inverse trig composition", "sin⁻¹(3x", "cos⁻¹(4x", "inverse trigonometric graph", "inverse trigonometric function graph"] },
  { id: "maths-conic-sections", subject: "Mathematics", title: "Conic sections overview", src: "/assets/images/conic_sections.png.jpg", keywords: ["conic sections", "conic section", "parabola ellipse hyperbola", "conic overview"] },
  { id: "maths-parabola", subject: "Mathematics", title: "Parabola diagram", src: "/assets/images/math_parabola.png.jpg", keywords: ["parabola", "focus directrix parabola"] },
  { id: "maths-ellipse", subject: "Mathematics", title: "Ellipse diagram", src: "/assets/images/math_ellipse.png.jpg", keywords: ["ellipse", "foci of ellipse", "ellipse axes"] },
  { id: "maths-hyperbola", subject: "Mathematics", title: "Hyperbola diagram", src: "/assets/images/math_hyperbola.png.jpg", keywords: ["hyperbola", "asymptotes hyperbola"] },
  { id: "maths-circle", subject: "Mathematics", title: "Circle diagram", src: "/assets/images/math_circle.png.jpg", keywords: ["circle geometry", "circle diagram", "equation of circle"] },
  { id: "maths-functions", subject: "Mathematics", title: "Function representations", src: "/assets/images/math_functions_representation.png.jpg", keywords: ["function mapping", "function representations", "domain codomain range"] },
  { id: "physics-free-body", subject: "Physics", title: "Free body diagram", src: "/assets/images/phys_fbd.png.jpg", keywords: ["free body diagram", "fbd", "force diagram", "forces on a body"] },
  { id: "physics-ray-diagrams", subject: "Physics", title: "Optics ray diagrams", src: "/assets/images/phys_optics_ray_diagrams.png.jpg", keywords: ["ray diagram", "optics diagram", "lens ray", "mirror ray"] },
  { id: "chemistry-vsepr", subject: "Chemistry", title: "VSEPR shapes", src: "/assets/images/chem_vsepr_all.png.jpg", keywords: ["vsepr", "molecular geometry", "molecular shapes", "molecular structure"] },
  { id: "chemistry-solid-state", subject: "Chemistry", title: "Solid state structures", src: "/assets/images/chem_solid_state_types.png.jpg", keywords: ["solid state structures", "crystal lattice", "unit cell types"] }
];

export function findRelevantStudyFigures(query, limit = 2) {
  const text = String(query || "").toLowerCase();
  if (!text.trim()) return [];
  const graphIntent = /\b(graph|plot|draw|sketch|curve|waveform)\b/.test(text);
  const inverseIntent = /inverse|principal value|sin.?1|cos.?1|tan.?1|cot.?1/.test(text);
  const scored = STUDY_FIGURES.map((figure) => ({
    figure,
    score: figure.keywords.reduce((score, keyword) => {
      if (["sin x", "cos x", "tan x"].includes(keyword) && (!graphIntent || inverseIntent)) return score;
      return score + (text.includes(keyword.toLowerCase()) ? Math.max(1, keyword.split(/\s+/).length) : 0);
    }, 0)
  })).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ figure }) => figure.id);
}
