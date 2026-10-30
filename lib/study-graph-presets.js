const presets = [
  {
    id: "arrhenius",
    match: /\b(?:arrhenius|ln\s*k\s*vs\.?\s*1\s*\/\s*t|activation energy plot)\b/i,
    title: "Arrhenius plot",
    x: "Inverse temperature, 1/T (scaled)",
    y: "ln(rate constant), ln(k)",
    range: [0, 10],
    yRange: [-6, 4],
    curves: [["ln(k) = intercept − (Ea/R)(1/T)", "2-0.9*x"]],
    note: "The straight-line slope is −Ea/R, so the activation energy is obtained from the negative slope multiplied by the gas constant."
  },
  {
    id: "kinetics-rate",
    match: /\b(?:rate[- ]concentration|rate vs\.? concentration|reaction rate.*concentration|zero[- ]order rate|first[- ]order rate)\b/i,
    title: "Reaction rate versus concentration",
    x: "Reactant concentration",
    y: "Reaction rate",
    range: [0, 10],
    yRange: [0, 10],
    curves: [["zero order", "4"], ["first order", "0.8*x"]],
    note: "A zero-order rate is independent of concentration, so its graph is horizontal. A first-order rate is directly proportional to concentration."
  },
  {
    id: "kinetics-concentration",
    match: /\b(?:concentration[- ]time|concentration vs\.? time|zero[- ]order.*time|first[- ]order.*time)\b/i,
    title: "Reactant concentration versus time",
    x: "Time (s)",
    y: "Reactant concentration (scaled)",
    range: [0, 10],
    yRange: [0, 11],
    curves: [["zero-order reaction", "max(0,10-x)"], ["first-order reaction", "10*exp(-0.3*x)"]],
    note: "Zero-order concentration decreases linearly until the reactant is used up. First-order concentration follows an exponential decay."
  },
  {
    id: "gibbs-extent",
    match: /\b(?:extent of reaction|gibbs free energy.*(?:extent|reaction)|reaction extent.*gibbs)\b/i,
    title: "Gibbs free energy versus reaction extent",
    x: "Reaction extent (scaled)",
    y: "Gibbs free energy (scaled)",
    range: [0, 10],
    yRange: [-5, 10],
    curves: [["reaction profile", "8-1.1*x"]],
    note: "At constant temperature and pressure, a spontaneous change proceeds toward lower Gibbs free energy. The actual profile depends on reaction conditions."
  },
  {
    id: "vapor-pressure-temperature",
    match: /\b(?:vapor pressure|vapour pressure).*(?:temperature|heat)|(?:temperature|heat).*(?:vapor pressure|vapour pressure)\b/i,
    title: "Vapor pressure versus temperature",
    x: "Temperature (scaled)",
    y: "Vapor pressure (scaled)",
    range: [0, 10],
    yRange: [0, 10],
    curves: [["pure liquid", "exp(0.22*(x-1))"], ["solution", "exp(0.22*(x-2))"]],
    note: "Vapor pressure rises rapidly with temperature. At the same temperature a solution with a non-volatile solute has lower vapor pressure than the pure solvent."
  },
  {
    id: "speed-distance",
    match: /\b(?:speed[- ]distance|speed vs\.? distance|v\^?2[- ]x|v²[- ]x|velocity squared.*distance)\b/i,
    title: "Speed and speed-squared versus distance",
    x: "Distance (m)",
    y: "Speed quantity (scaled)",
    range: [0, 10],
    yRange: [0, 10],
    curves: [["speed", "sqrt(1.2*x)"], ["speed squared", "1.2*x"]],
    note: "For constant acceleration, v² changes linearly with displacement. The slope is twice the acceleration."
  },
  {
    id: "projectile-velocity",
    match: /\b(?:projectile.*(?:velocity component|horizontal velocity|vertical velocity)|horizontal and vertical velocity.*time)\b/i,
    title: "Projectile velocity components",
    x: "Time (s)",
    y: "Velocity component (m/s)",
    range: [0, 10],
    yRange: [-10, 10],
    curves: [["horizontal component", "5"], ["vertical component", "8-1.6*x"]],
    note: "Ignoring air resistance, horizontal velocity stays constant while vertical velocity changes at a constant rate under gravity."
  },
  {
    id: "projectile-energy",
    match: /\b(?:projectile.*(?:energy|kinetic|potential)|kinetic and potential energy.*(?:time|displacement)|mechanical energy.*time)\b/i,
    title: "Projectile energy versus time",
    x: "Time (s)",
    y: "Energy (normalized)",
    range: [0, 6.3],
    yRange: [0, 1.1],
    curves: [["kinetic energy", "0.5+0.5*cos(x)"], ["potential energy", "0.5-0.5*cos(x)"], ["total mechanical energy", "1"]],
    note: "As the projectile rises, kinetic energy transfers to gravitational potential energy. Their sum remains constant when air resistance is neglected."
  },
  {
    id: "resonance",
    match: /\b(?:resonance curve|resonant frequency|series rlc|parallel rlc|impedance vs\.? frequency|current vs\.? frequency)\b/i,
    title: "RLC resonance curves",
    x: "Frequency / resonant frequency",
    y: "Normalized current or impedance",
    range: [0, 10],
    yRange: [0, 5],
    curves: [["series RLC current", "1/sqrt(0.25+(x-5)^2)"], ["parallel RLC impedance", "sqrt(0.25+(x-5)^2)"]],
    note: "Series RLC current peaks at resonance; parallel RLC impedance is greatest near resonance. Curves are normalized schematics, not component-specific measurements."
  },
  {
    id: "gas-vt",
    match: /\b(?:v[- ]t|volume[- ]temperature|volume vs\.? temperature|isobaric.*volume|charles'? law)\b/i,
    title: "Volume versus temperature",
    x: "Absolute temperature (K)",
    y: "Volume (scaled)",
    range: [0, 10],
    yRange: [0, 10],
    curves: [["constant pressure", "0.8*x"], ["constant volume", "5"]],
    note: "At constant pressure, an ideal gas’s volume is directly proportional to absolute temperature. At constant volume, the plotted volume stays fixed."
  },
  {
    id: "gas-pt",
    match: /\b(?:p[- ]t|pressure[- ]temperature|pressure vs\.? temperature|isochoric.*pressure|gay.?lussac)\b/i,
    title: "Pressure versus temperature",
    x: "Absolute temperature (K)",
    y: "Pressure (scaled)",
    range: [0, 10],
    yRange: [0, 10],
    curves: [["constant volume", "0.8*x"], ["constant pressure", "5"]],
    note: "At constant volume, ideal-gas pressure is directly proportional to absolute temperature. At constant pressure, the pressure trace is horizontal."
  },
  {
    id: "electrostatic-lines",
    match: /\b(?:infinite line charge|line charges?|charged sheet|infinite sheet|electric field.*sheet)\b/i,
    title: "Electric field of lines and sheets",
    x: "Distance from charge (scaled)",
    y: "Relative field strength",
    range: [0, 10],
    yRange: [0, 2],
    curves: [["infinite line charge", "1/(x+0.5)"], ["infinite sheet", "1"]],
    note: "An ideal infinite line charge has field strength proportional to 1/r. An ideal infinite sheet has uniform field strength independent of distance."
  },
  {
    id: "electrostatic-spheres",
    match: /\b(?:conducting sphere|non.?conducting sphere|spherical shell|solid sphere|electric field.*sphere|potential.*sphere)\b/i,
    title: "Electric field around spherical charge distributions",
    x: "Distance from center (in sphere radii)",
    y: "Relative electric-field magnitude",
    range: [0, 5],
    yRange: [0, 5],
    curves: [["uniform solid sphere, inside", "x/2"], ["outside a spherical charge", "1/(x+0.2)^2"]],
    note: "Inside a uniformly charged non-conducting sphere, field strength increases with radius. Outside a spherically symmetric charge distribution, it falls as 1/r². A conductor has zero field inside its material."
  },
  {
    id: "blackbody",
    match: /\b(?:blackbody|black.?body|wien.?s displacement|emissive power|thermal radiation spectrum)\b/i,
    title: "Blackbody radiation spectra",
    x: "Wavelength (scaled)",
    y: "Spectral intensity (scaled)",
    range: [0, 1.2],
    yRange: [0, 7],
    curves: [["lower temperature peak", "4*exp(-((x-0.65)/0.2)^2)"], ["higher temperature peak", "6*exp(-((x-0.4)/0.16)^2)"]],
    note: "A hotter blackbody emits more strongly and peaks at a shorter wavelength, following Wien’s displacement law. Curves are schematic and normalized for comparison."
  },
  {
    id: "photoelectric-stopping",
    match: /\b(?:stopping potential|threshold frequency|planck'?s constant.*frequency)\b/i,
    title: "Stopping potential versus frequency",
    x: "Light frequency (scaled)",
    y: "Stopping potential (scaled)",
    range: [0, 10],
    yRange: [0, 10],
    curves: [["photoelectric threshold", "max(0,1.2*(x-2))"]],
    note: "Below threshold frequency no photoelectrons are emitted. Above threshold, stopping potential rises linearly; its slope is proportional to Planck’s constant."
  },
  {
    id: "photoelectric-current",
    match: /\b(?:photoelectric current|photocurrent|photoelectric.*potential|potential.*photoelectric)\b/i,
    title: "Photoelectric current versus applied voltage",
    x: "Applied voltage (scaled)",
    y: "Photocurrent (scaled)",
    range: [-4, 8],
    yRange: [0, 10],
    curves: [["lower light intensity", "max(0,min(3,1.4*(x+2)))"], ["higher light intensity", "max(0,min(8,3.2*(x+2)))"], ["higher frequency at same intensity", "max(0,min(3,1.4*(x+1)))"]],
    note: "Greater light intensity produces a larger saturation current. The stopping potential is determined by frequency, not intensity."
  },
  {
    id: "binding-energy",
    match: /\b(?:binding energy per nucleon|mass number|nuclear physics)\b/i,
    title: "Binding energy per nucleon versus mass number",
    x: "Mass number / 56",
    y: "Binding energy per nucleon (scaled)",
    range: [0, 5],
    yRange: [0, 1.2],
    curves: [["binding energy per nucleon", "x*exp(1-x)"]],
    note: "Binding energy per nucleon rises quickly for light nuclei, peaks near iron (A ≈ 56), and declines gradually for heavier nuclei. The peak helps explain why fusion of light nuclei and fission of heavy nuclei can release energy."
  },
  {
    id: "radioactive-decay",
    match: /\b(?:radioactive decay|decay law|number of active nuclei|half.?life|nuclear decay)\b/i,
    title: "Radioactive decay",
    x: "Time / half-life",
    y: "Fraction of nuclei remaining",
    range: [0, 8],
    yRange: [0, 1.1],
    curves: [["remaining nuclei", "exp(-0.693*x)"]],
    note: "The number of undecayed nuclei halves after each half-life and follows an exponential decay."
  },
  {
    id: "identity",
    match: /\b(?:identity function|identity graph|y\s*=\s*x\b)\b/i,
    title: "Identity function",
    x: "x",
    y: "y",
    range: [-5, 5],
    yRange: [-5, 5],
    curves: [["y = x", "x"]],
    note: "The identity function maps every input to itself. Its graph is a straight line through the origin with slope 1."
  },
  {
    id: "radial-wavefunction",
    match: /\b(?:radial wave functions?|wavefunction|ψ\s*\(?r|psi\s*\(?r)\b/i,
    title: "Atomic radial wave functions",
    x: "Radius (scaled)",
    y: "Wave-function amplitude (scaled)",
    range: [0, 12],
    yRange: [-1, 1],
    curves: [["1s", "exp(-x)"], ["2s", "(1-x/2)*exp(-x/2)"], ["2p", "x*exp(-x/2)"]],
    note: "The 2s radial wave function crosses zero at one radial node; the 1s and 2p functions have no radial nodes. Curves are qualitative and scaled."
  },
  {
    id: "inverse-trig",
    match: /\b(?:inverse trig(?:onometric)?|arcsin|arccos|arctan|arccot|arcsec|arccsc)\b/i,
    title: "Inverse trigonometric functions",
    x: "Input value",
    y: "Principal angle (rad)",
    range: [-4, 4],
    yRange: [-2, 4],
    curves: [
      ["arcsin", "asin(x)"],
      ["arccos", "acos(x)"],
      ["arctan", "atan(x)"],
      ["arccot", "pi/2-atan(x)"],
      ["arcsec", "acos(1/x)"],
      ["arccsc", "asin(1/x)"]
    ],
    note: "Sine and cosine inverses use inputs from −1 to 1; secant and cosecant inverses use |x| ≥ 1. Tangent and cotangent inverses accept every real input. All curves use their principal-value branches."
  },
  {
    id: "hyperbola",
    match: /\b(?:hyperbola|rectangular hyperbola|asymptote graph)\b/i,
    title: "Hyperbola and asymptotes",
    x: "x",
    y: "y",
    range: [-5, 5],
    yRange: [-5, 5],
    curves: [["xy = 1", "1/x"], ["x-axis asymptote", "0"]],
    note: "The two branches approach both coordinate axes without touching them. For xy = 1, the axes are asymptotes."
  },
  {
    id: "ellipse",
    match: /\bellipse\b/i,
    title: "Ellipse",
    x: "x / semi-major axis",
    y: "y / semi-minor axis",
    range: [-1.25, 1.25],
    yRange: [-1.25, 1.25],
    curves: [["upper half", "sqrt(1-x^2)"], ["lower half", "-sqrt(1-x^2)"]],
    note: "The normalized ellipse is closed and symmetric about both axes. Change the horizontal and vertical scales to show its orientation and eccentricity."
  },
  {
    id: "circle",
    match: /\b(?:circle|circular graph)\b/i,
    title: "Circle",
    x: "x",
    y: "y",
    range: [-1.25, 1.25],
    yRange: [-1.25, 1.25],
    curves: [["upper semicircle", "sqrt(1-x^2)"], ["lower semicircle", "-sqrt(1-x^2)"]],
    note: "Together the two semicircles form a unit circle centered at the origin. A shifted center or different radius translates or scales the same shape."
  },
  {
    id: "parabola",
    match: /\bparabola\b/i,
    title: "Parabola",
    x: "x",
    y: "y",
    range: [-4, 4],
    yRange: [-1, 10],
    curves: [["y = x²", "x^2"]],
    note: "The vertex is the minimum point. A positive leading coefficient opens upward; changing its sign reflects the curve across the x-axis."
  },
  {
    id: "area-under-curve",
    match: /\b(?:area under (?:a |the )?curve|definite integral|bounded area|intersecting regions)\b/i,
    title: "Area under a curve",
    x: "x",
    y: "y",
    range: [0, 3],
    yRange: [-1, 10],
    curves: [["curve", "x^2"], ["x-axis", "0"]],
    note: "Compare the curve with the x-axis from x = 0 to x = 3. The definite integral over that interval gives the area; signed area changes sign below the axis."
  },
  {
    id: "curve-sketching",
    match: /\b(?:curve sketch(?:ing)?|turning points|maxima and minima|concavity|inflection points|differential calculus profile)\b/i,
    title: "Curve sketch: turning points and inflection",
    x: "x",
    y: "y",
    range: [-3, 3],
    yRange: [-8, 8],
    curves: [["f(x) = x³ − 3x", "x^3-3*x"]],
    note: "The curve has a local maximum at x = −1, a local minimum at x = 1, and an inflection point at the origin. The slope is zero at both turning points."
  },
  {
    id: "fractional-part",
    match: /\b(?:fractional part|fraction part|fracpart|fract(?:ional)? function)\b/i,
    title: "Fractional-part function",
    x: "x",
    y: "Fractional part of x",
    range: [-3, 3],
    yRange: [-0.1, 1.1],
    curves: [["{x}", "x-floor(x)"]],
    note: "The graph repeats every unit interval, rising from zero toward one and resetting at each integer."
  },
  {
    id: "greatest-integer",
    match: /\b(?:greatest integer|floor function|floor\s*\(?x|step function|greatest integral)\b/i,
    title: "Greatest-integer function",
    x: "x",
    y: "⌊x⌋",
    range: [-5, 5],
    yRange: [-6, 6],
    curves: [["floor(x)", "floor(x)"]],
    note: "Each horizontal step is closed at its left endpoint and open at its right endpoint. The function jumps at every integer."
  },
  {
    id: "signum",
    match: /\b(?:signum|sign function|sgn\s*\(?x)\b/i,
    title: "Signum function",
    x: "x",
    y: "sgn(x)",
    range: [-5, 5],
    yRange: [-1.5, 1.5],
    curves: [["sgn(x)", "sign(x)"]],
    note: "The value is −1 for negative inputs, 0 at the origin, and +1 for positive inputs."
  },
  {
    id: "modulus",
    match: /\b(?:modulus function|absolute value|absolute function|y\s*=\s*\|x\|)\b/i,
    title: "Absolute-value function",
    x: "x",
    y: "|x|",
    range: [-5, 5],
    yRange: [-1, 6],
    curves: [["|x|", "abs(x)"]],
    note: "The V-shaped graph has a sharp minimum at the origin and is symmetric about the y-axis."
  },
  {
    id: "cubic",
    match: /\bcubic(?: function| curve| graph| polynomial)?\b/i,
    title: "Cubic function",
    x: "x",
    y: "y",
    range: [-3, 3],
    yRange: [-10, 10],
    curves: [["y = x³", "x^3"]],
    note: "The curve passes through the origin and changes concavity there. Its end behavior is opposite on the two sides."
  },
  {
    id: "quadratic",
    match: /\b(?:quadratic(?: function| curve| graph| polynomial)?|second[- ]degree)\b/i,
    title: "Quadratic function",
    x: "x",
    y: "y",
    range: [-4, 4],
    yRange: [-2, 10],
    curves: [["y = x²", "x^2"]],
    note: "The parabola is symmetric about its vertical axis. Its vertex gives the minimum for a positive leading coefficient."
  },
  {
    id: "linear",
    match: /\b(?:linear function|straight line graph|linear graph|line graph)\b/i,
    title: "Linear function",
    x: "x",
    y: "y",
    range: [-5, 5],
    yRange: [-8, 8],
    curves: [["y = 2x + 1", "2*x+1"]],
    note: "The gradient is 2 and the y-intercept is 1. Every linear function has a constant rate of change."
  },
  {
    id: "reciprocal",
    match: /\b(?:reciprocal function|reciprocal graph|y\s*=\s*1\s*\/\s*x)\b/i,
    title: "Reciprocal function",
    x: "x",
    y: "y",
    range: [-5, 5],
    yRange: [-5, 5],
    curves: [["y = 1/x", "1/x"], ["y = 1/x²", "1/x^2"]],
    note: "The graph has two branches. Both axes are asymptotes, and the function is undefined at x = 0."
  },
  {
    id: "logarithmic",
    match: /\b(?:logarithm(?:ic)?|log(?:\s*base)?\s*a|ln\s*\(?x|logarithmic graph)\b/i,
    title: "Logarithmic functions",
    x: "x",
    y: "y",
    range: [0.08, 8],
    yRange: [-3, 3],
    curves: [["ln(x)", "log(x)"], ["log₁₀(x)", "log(x)/log(10)"]],
    note: "Both curves are defined only for positive x and pass through (1, 0). Larger bases grow more slowly."
  },
  {
    id: "exponential",
    match: /\b(?:exponential function|exponential graph|y\s*=\s*a\s*\^\s*x|exponential growth|exponential decay)\b/i,
    title: "Exponential growth and decay",
    x: "x",
    y: "y",
    range: [-5, 5],
    yRange: [0, 8],
    curves: [["growth: e^(0.5x)", "exp(0.5*x)"], ["decay: e^(−0.5x)", "exp(-0.5*x)"]],
    note: "Both curves pass through (0, 1). Positive exponents grow to the right; negative exponents decay toward zero."
  },
  {
    id: "sine-cosine",
    match: /\b(?:sinusoidal|sine and cosine|sine|cosine|sin\s*\(?x|cos\s*\(?x)\b/i,
    title: "Sine and cosine",
    x: "Angle (rad)",
    y: "Value",
    range: [-6.3, 6.3],
    yRange: [-1.5, 1.5],
    curves: [["sin(x)", "sin(x)"], ["cos(x)", "cos(x)"]],
    note: "Both waves have amplitude 1 and period 2π. Cosine is the sine curve shifted left by π/2."
  },
  {
    id: "trigonometric",
    match: /\b(?:trigonometric functions|trig(?:onometric)? functions|periodic graphs|all trig(?:onometric)? functions?)\b/i,
    title: "Standard trigonometric functions",
    x: "Angle (rad)",
    y: "Value",
    range: [-6.3, 6.3],
    yRange: [-4, 4],
    curves: [["sin(x)", "sin(x)"], ["cos(x)", "cos(x)"], ["tan(x)", "tan(x)"], ["cot(x)", "1/tan(x)"], ["sec(x)", "1/cos(x)"], ["csc(x)", "1/sin(x)"]],
    note: "Sine and cosine have amplitude 1 and period 2π; cosine is shifted left by π/2. Tangent and cotangent repeat every π. Reciprocal functions have vertical asymptotes where their denominator is zero."
  },
  {
    id: "tangent",
    match: /\b(?:tangent function|tan\s*\(?x|tangent graph)\b/i,
    title: "Tangent function",
    x: "Angle (rad)",
    y: "tan(x)",
    range: [-6.3, 6.3],
    yRange: [-4, 4],
    curves: [["tan(x)", "tan(x)"]],
    note: "The curve repeats every π. Vertical asymptotes occur at odd multiples of π/2."
  },
  {
    id: "cotangent",
    match: /\b(?:cotangent|cot\s*\(?x)\b/i,
    title: "Cotangent function",
    x: "Angle (rad)",
    y: "cot(x)",
    range: [-6.3, 6.3],
    yRange: [-4, 4],
    curves: [["cot(x)", "1/tan(x)"]],
    note: "The curve repeats every π, with vertical asymptotes at integer multiples of π."
  },
  {
    id: "secant-cosecant",
    match: /\b(?:secant|cosecant|sec\s*\(?x|csc\s*\(?x)\b/i,
    title: "Secant and cosecant",
    x: "Angle (rad)",
    y: "Value",
    range: [-6.3, 6.3],
    yRange: [-4, 4],
    curves: [["sec(x)", "1/cos(x)"], ["csc(x)", "1/sin(x)"]],
    note: "Each reciprocal trig curve has vertical asymptotes where its denominator is zero."
  },
  {
    id: "conic-lines",
    match: /\b(?:straight lines? and circles|intercepts|radical axes|system of circles)\b/i,
    title: "Lines and circle intersections",
    x: "x",
    y: "y",
    range: [-5, 5],
    yRange: [-5, 5],
    curves: [["line", "0.6*x+1"], ["circle, upper arc", "sqrt(9-x^2)"], ["circle, lower arc", "-sqrt(9-x^2)"]],
    note: "Intersections occur where the line and circle have the same y-value. A radical axis is the common chord line of two intersecting circles."
  },
  {
    id: "radial-probability",
    match: /\b(?:radial probability distribution|radial probability density|radial distribution|radial nodes?|atomic structure.*orbital|1s|2s|2p|3s|3p|3d)\b/i,
    title: "Radial wave functions and probability",
    x: "Radius (scaled)",
    y: "Relative magnitude",
    range: [0, 12],
    yRange: [0, 2.5],
    curves: [
      ["1s radial probability", "10*x^2*exp(-2*x)"],
      ["2s radial probability", "2*x^2*(1-x/2)^2*exp(-x)"],
      ["2p radial probability", "0.2*x^4*exp(-x)"],
      ["3s radial probability", "0.1*x^2*(1-x/3)^2*(1-x/6)^2*exp(-x/3)"],
      ["3p radial probability", "0.004*x^4*(1-x/6)^2*exp(-x/3)"],
      ["3d radial probability", "0.00004*x^6*exp(-x/3)"]
    ],
    note: "Radial probability is non-negative. The 2s profile has one radial node; 3s has two and 3p has one. The 1s, 2p, and 3d profiles have no radial nodes. Curves are qualitative and scaled to compare node patterns."
  },
  {
    id: "compressibility",
    match: /\b(?:compressibility factor|real gases?|z\s*vs\.?\s*pressure|deviations? from ideal)\b/i,
    title: "Compressibility factor versus pressure",
    x: "Pressure (scaled)",
    y: "Compressibility factor, Z",
    range: [0, 10],
    yRange: [0.55, 1.55],
    curves: [["ideal gas", "1"], ["attractive-dominated real gas", "1-0.28*x/(2+x)+0.035*x"], ["repulsive-dominated real gas", "1+0.045*x"]],
    note: "The ideal-gas line remains at Z = 1. Real gases can dip below 1 when attractions dominate and rise above 1 at high pressure."
  },
  {
    id: "chemical-kinetics",
    match: /\b(?:chemical kinetics|zero[- ]order|first[- ]order|concentration[- ]time|rate[- ]concentration|arrhenius|ln\s*k\s*vs|activation energy)\b/i,
    title: "Concentration–time profiles",
    x: "Time (s)",
    y: "Reactant concentration (scaled)",
    range: [0, 10],
    yRange: [0, 11],
    curves: [["zero-order reaction", "max(0,10-x)"], ["first-order reaction", "10*exp(-0.3*x)"]],
    note: "A zero-order concentration falls linearly; a first-order concentration decays exponentially. Separate rate–concentration and Arrhenius plots show reaction order and activation energy."
  },
  {
    id: "thermodynamics",
    match: /\b(?:thermodynamics|extent of reaction|gibbs free energy|vapor pressure|vapour pressure|cla?usius.?clapeyron)\b/i,
    title: "Vapor-pressure curve",
    x: "Temperature (scaled)",
    y: "Vapor pressure (scaled)",
    range: [0, 10],
    yRange: [0, 12],
    curves: [["vapor pressure", "exp(0.22*x)"]],
    note: "Vapor pressure rises rapidly with temperature. The vapor-pressure curve reaches atmospheric pressure at the boiling point."
  },
  {
    id: "raoults-law",
    match: /\b(?:raoult|vapor pressure.*mole fraction|vapour pressure.*mole fraction|ideal and non.?ideal solution|positive and negative deviations)\b/i,
    title: "Vapor pressure versus mole fraction",
    x: "Mole fraction of component A",
    y: "Total vapor pressure (scaled)",
    range: [0, 1],
    yRange: [0, 1.25],
    curves: [["ideal solution", "x"], ["positive deviation", "x+0.3*x*(1-x)"], ["negative deviation", "x-0.28*x*(1-x)"]],
    note: "Raoult’s-law behavior is linear. Positive deviations curve above the ideal line; negative deviations curve below it."
  },
  {
    id: "phase-diagram",
    match: /\b(?:boiling point elevation|freezing point depression|phase diagram|colligative|boiling and freezing|solution vs\.? solvent)\b/i,
    title: "Boiling-point elevation and freezing-point depression",
    x: "Temperature (scaled)",
    y: "Vapor pressure (scaled)",
    range: [0, 10],
    yRange: [0, 10],
    curves: [["pure solvent", "exp(0.22*(x-4))"], ["solution", "exp(0.22*(x-5))"]],
    note: "At the same temperature the solution has lower vapor pressure. It reaches atmospheric pressure at a higher boiling temperature and freezes at a lower temperature."
  },
  {
    id: "molar-conductivity",
    match: /\b(?:molar conductivity|koh?lrausch|strong electrolytes?|weak electrolytes?|sqrt\s*\(?c|square root of concentration)\b/i,
    title: "Molar conductivity versus square root of concentration",
    x: "√Concentration (scaled)",
    y: "Molar conductivity (scaled)",
    range: [0, 5],
    yRange: [0, 11],
    curves: [["strong electrolyte", "10-1.2*x"], ["weak electrolyte", "10-0.18*x"]],
    note: "Strong electrolytes show an approximately straight decrease with √concentration at low concentration. Weak electrolytes curve more strongly because their ionization changes with dilution."
  },
  {
    id: "adsorption",
    match: /\b(?:adsorption isotherm|freundlich|langmuir|log\s*\(?x\/m|log\s*p)\b/i,
    title: "Adsorption isotherms",
    x: "log pressure, log(P)",
    y: "log amount adsorbed, log(x/m)",
    range: [-5, 5],
    yRange: [-6, 2],
    curves: [["Freundlich log–log relation", "0.5*x"], ["Langmuir log–log relation", "log(exp(x)/(1+exp(x)))"]],
    note: "The Freundlich relation is linear on log–log axes. The Langmuir relation bends toward a plateau as adsorption sites fill."
  },
  {
    id: "periodic-trends",
    match: /\b(?:periodic properties|ionization enthalpy|atomic radii|atomic radius|electron gain enthalpy|periodic trends|periods and groups)\b/i,
    title: "Periodic-property trends",
    x: "Position across a period",
    y: "Relative property",
    range: [0, 10],
    yRange: [0, 10],
    curves: [["atomic radius", "8-0.58*x"], ["ionization enthalpy", "2+0.58*x"]],
    note: "Across a period, atomic radius generally decreases while ionization enthalpy generally increases. Real elements show local exceptions."
  },
  {
    id: "ellingham",
    match: /\bellingham\b/i,
    title: "Ellingham diagram",
    x: "Temperature",
    y: "Standard Gibbs-energy change",
    range: [0, 10],
    yRange: [-5, 9],
    curves: [["metal oxidation", "7-1.05*x"], ["carbon to carbon monoxide", "4-0.5*x"], ["carbon to carbon dioxide", "2-0.08*x"]],
    note: "Each line’s slope is related to reaction entropy. A carbon line below a metal-oxide line at a given temperature indicates a thermodynamically favorable reduction by carbon."
  },
  {
    id: "distillation",
    match: /\b(?:fractional distillation|distillation curve|azeotrope|composition[- ]temperature)\b/i,
    title: "Binary-mixture distillation",
    x: "Liquid composition of more volatile component",
    y: "Temperature (scaled)",
    range: [0, 1],
    yRange: [70, 110],
    curves: [["bubble-point curve", "80+20*x-4*(x-0.5)^2"], ["dew-point curve", "80+20*x+2*(x-0.5)^2"]],
    note: "Azeotropes appear where the bubble-point and dew-point curves meet at an interior composition. These curves are schematic; real temperatures depend on the mixture."
  },
  {
    id: "position-time",
    match: /\b(?:position[- ]time|displacement[- ]time|x[- ]t graph|kinematics)\b/i,
    title: "Position–time graph",
    x: "Time (s)",
    y: "Position (m)",
    range: [0, 10],
    yRange: [0, 11],
    curves: [["constant velocity", "x"], ["constant acceleration", "0.12*x^2"]],
    note: "The slope gives velocity. A straight line means constant velocity; a changing slope indicates acceleration."
  },
  {
    id: "velocity-time",
    match: /\b(?:velocity[- ]time|speed[- ]time|v[- ]t graph|projectile.*velocity|velocity components?)\b/i,
    title: "Velocity–time graph",
    x: "Time (s)",
    y: "Velocity (m/s)",
    range: [0, 10],
    yRange: [-6, 12],
    curves: [["constant velocity", "4"], ["uniform acceleration", "1.2*x"], ["projectile vertical velocity", "8-1.6*x"]],
    note: "The slope gives acceleration. Signed area between the curve and the time axis gives displacement."
  },
  {
    id: "acceleration-time",
    match: /\b(?:acceleration[- ]time|a[- ]t graph|acceleration vs\.? time)\b/i,
    title: "Acceleration–time graph",
    x: "Time (s)",
    y: "Acceleration (m/s²)",
    range: [0, 10],
    yRange: [-3, 3],
    curves: [["constant acceleration", "1.5"], ["free-fall acceleration (sign convention)", "-1"]],
    note: "The signed area under an acceleration–time curve gives the change in velocity."
  },
  {
    id: "projectile-energy",
    match: /\b(?:projectile motion|projectile energy|kinetic energy.*potential energy|total mechanical energy|horizontal and vertical velocity)\b/i,
    title: "Projectile velocity components",
    x: "Time (s)",
    y: "Velocity (scaled)",
    range: [0, 10],
    yRange: [-10, 10],
    curves: [["horizontal component", "5"], ["vertical component", "8-1.6*x"]],
    note: "With negligible air resistance, horizontal velocity remains constant and the vertical component changes linearly under gravity. Total mechanical energy is conserved."
  },
  {
    id: "friction",
    match: /\b(?:newton'?s laws?|friction|static and kinetic|frictional force|applied force)\b/i,
    title: "Applied force and friction",
    x: "Applied force (scaled)",
    y: "Friction force (scaled)",
    range: [0, 10],
    yRange: [0, 6],
    curves: [["static friction", "min(x,4)"], ["kinetic friction", "3"]],
    note: "Static friction matches the applied force up to its limiting value. Once sliding begins, kinetic friction is approximately constant and slightly lower."
  },
  {
    id: "potential-energy",
    match: /\b(?:potential energy curve|stable and unstable equilibrium|equilibrium stability|neutral equilibrium)\b/i,
    title: "Potential-energy profiles",
    x: "Displacement from equilibrium",
    y: "Potential energy",
    range: [-3, 3],
    yRange: [-9, 9],
    curves: [["stable equilibrium", "x^2"], ["unstable equilibrium", "-x^2"], ["neutral equilibrium", "0"]],
    note: "Stable equilibrium is a local minimum of potential energy; unstable equilibrium is a local maximum. A flat profile represents neutral equilibrium."
  },
  {
    id: "gravitation",
    match: /\b(?:circular motion and gravitation|gravitational field|gravitational potential|earth and spherical shells)\b/i,
    title: "Gravitational field and potential outside a spherical body",
    x: "Distance from center (in body radii)",
    y: "Relative value",
    range: [1, 10],
    yRange: [-1.2, 1.2],
    curves: [["field magnitude", "1/x^2"], ["potential (negative)", "-1/x"]],
    note: "Outside a spherical body, field magnitude falls as 1/r² while gravitational potential approaches zero as −1/r."
  },
  {
    id: "rotational",
    match: /\b(?:rotational mechanics|angular velocity|angular acceleration|omega|alpha vs\.? time)\b/i,
    title: "Rotational kinematics",
    x: "Time (s)",
    y: "Angular quantity (scaled)",
    range: [0, 10],
    yRange: [-1, 11],
    curves: [["constant angular velocity", "4"], ["constant angular acceleration: ω", "0.8*x"], ["constant angular acceleration: α", "0.8"]],
    note: "The slope of angular velocity versus time is angular acceleration. The slope of angular displacement versus time is angular velocity."
  },
  {
    id: "stress-strain",
    match: /\b(?:stress[- ]strain|elasticity|young'?s modulus|proportional limit|yield point|breaking point|fracture point)\b/i,
    title: "Stress–strain curve",
    x: "Strain",
    y: "Stress",
    range: [0, 10],
    yRange: [0, 10],
    curves: [["ductile material (schematic)", "0.8*x+0.08*x^2"]],
    note: "The initial straight section gives Young’s modulus. Proportional limit, yield, ultimate stress, and fracture are material-dependent landmarks."
  },
  {
    id: "efflux",
    match: /\b(?:efflux|torricelli|exit speed|speed.*height|height.*speed)\b/i,
    title: "Efflux speed versus liquid height",
    x: "Liquid height above the outlet (m)",
    y: "Efflux speed (scaled)",
    range: [0, 10],
    yRange: [0, 4],
    curves: [["efflux speed", "sqrt(x)"]],
    note: "Efflux speed increases with the square root of the liquid height above the opening."
  },
  {
    id: "terminal-velocity",
    match: /\b(?:terminal velocity|velocity[- ]time.*fluid|falling.*viscous fluid)\b/i,
    title: "Approach to terminal velocity",
    x: "Time (s)",
    y: "Velocity (scaled)",
    range: [0, 10],
    yRange: [0, 4],
    curves: [["falling object", "3*(1-exp(-0.55*x))"], ["terminal speed", "3"]],
    note: "The object accelerates at first, then drag balances its weight and the speed approaches a constant terminal value."
  },
  {
    id: "fluid-flow",
    match: /\b(?:fluid mechanics|viscous fluid)\b/i,
    title: "Fluid-flow profile",
    x: "Time (scaled)",
    y: "Speed",
    range: [0, 10],
    yRange: [0, 4],
    curves: [["efflux speed from height", "sqrt(x)"], ["terminal-speed approach", "3*(1-exp(-0.55*x))"]],
    note: "Efflux speed increases with the square root of fluid height. A falling object in a viscous fluid approaches terminal speed asymptotically."
  },
  {
    id: "shm",
    match: /\b(?:simple harmonic motion|shm|displacement[- ]velocity[- ]acceleration|oscillation graphs?)\b/i,
    title: "Simple harmonic motion",
    x: "Phase (rad)",
    y: "Normalized value",
    range: [-6.3, 6.3],
    yRange: [-1.5, 1.5],
    curves: [["displacement", "sin(x)"], ["velocity", "cos(x)"], ["acceleration", "-sin(x)"]],
    note: "Velocity is shifted by a quarter-cycle relative to displacement. Acceleration is opposite to displacement at every instant."
  },
  {
    id: "shm-energy",
    match: /\b(?:shm energy|energy distribution|kinetic energy.*displacement|potential energy.*displacement|x\s*=\s*[±+-]?\s*a\s*\/\s*sqrt)\b/i,
    title: "Energy distribution in simple harmonic motion",
    x: "Displacement / amplitude",
    y: "Fraction of total energy",
    range: [-1, 1],
    yRange: [0, 1.1],
    curves: [["potential energy", "x^2"], ["kinetic energy", "1-x^2"]],
    note: "Kinetic and potential energy are equal at displacement ±A/√2. Their sum stays constant at every displacement."
  },
  {
    id: "drag",
    match: /\b(?:surface tension|viscosity|viscous drag|drag force|velocity gradient)\b/i,
    title: "Viscous drag and speed",
    x: "Speed",
    y: "Drag force",
    range: [0, 10],
    yRange: [0, 11],
    curves: [["laminar: drag proportional to speed", "x"], ["quadratic drag", "0.1*x^2"]],
    note: "At low Reynolds number, viscous drag is proportional to speed. In a regime dominated by inertial effects, drag grows approximately with speed squared."
  },
  {
    id: "gas-laws",
    match: /\b(?:gas laws?|p[- ]v|p[- ]t|v[- ]t|isobaric|isochoric|isothermal|adiabatic)\b/i,
    title: "Ideal-gas process profiles",
    x: "Volume (scaled)",
    y: "Pressure (scaled)",
    range: [0.5, 10],
    yRange: [0, 10],
    curves: [["isobaric", "5"], ["isothermal", "8/x"], ["adiabatic", "10/x^1.4"]],
    note: "An isobaric process is horizontal on a P–V plot. Isothermal and adiabatic curves fall as volume increases; the adiabatic curve is steeper."
  },
  {
    id: "indicator-cycle",
    match: /\b(?:indicator diagram|p[- ]v diagram|carnot cycle|otto cycle|thermodynamic cycle|adiabatic slope|isothermal slope)\b/i,
    title: "P–V indicator curves",
    x: "Volume (scaled)",
    y: "Pressure (scaled)",
    range: [0.6, 5],
    yRange: [0, 10],
    curves: [["isothermal", "6/x"], ["adiabatic", "8/x^1.4"]],
    note: "An adiabatic curve is steeper than an isothermal curve at the same state. In a complete closed P–V cycle, the enclosed area gives the net work."
  },
  {
    id: "maxwell",
    match: /\b(?:maxwell.?boltzmann|molecular speed distribution|molecular speeds?|most probable speed|rms speed)\b/i,
    title: "Maxwell–Boltzmann speed distributions",
    x: "Molecular speed (scaled)",
    y: "Fraction of molecules",
    range: [0, 8],
    yRange: [0, 1.1],
    curves: [["lower temperature", "x^2*exp(-x^2/2)"], ["higher temperature", "0.044*x^2*exp(-x^2/8)"]],
    note: "At higher temperature the distribution broadens and its peak shifts to higher speed. Both curves are scaled to compare their shapes."
  },
  {
    id: "heating-cooling",
    match: /\b(?:heating curve|cooling curve|phase change plateau|latent heat|blackbody radiation|wien.?s displacement|emissive power|wavelength)\b/i,
    title: "Heating and cooling curves",
    x: "Time or heat supplied (scaled)",
    y: "Temperature (scaled)",
    range: [0, 10],
    yRange: [0, 10],
    curves: [["heating curve", "min(x,2)+max(0,x-4)+max(0,x-7)"], ["cooling curve", "8-(min(x,2)+max(0,x-4)+max(0,x-7))"]],
    note: "Flat sections show phase changes: added or removed energy changes the phase while temperature stays nearly constant. The curve is schematic."
  },
  {
    id: "electrostatics",
    match: /\b(?:electrostatics?|electric field|electric potential|point charge|conducting sphere|non.?conducting sphere|spherical shell|infinite line charge)\b/i,
    title: "Electric field and potential with distance",
    x: "Distance from charge (scaled)",
    y: "Relative field or potential",
    range: [0.5, 10],
    yRange: [-2, 5],
    curves: [["point-charge field magnitude", "1/x^2"], ["positive-charge potential", "1/x"]],
    note: "For a point charge, field magnitude falls as 1/r² and potential falls as 1/r. Inside a conducting shell, the electric field is zero while the potential is constant."
  },
  {
    id: "rc-circuit",
    match: /\b(?:capacitance|direct current|dc circuit|rc circuit|charging and discharging|capacitor voltage|capacitor charge)\b/i,
    title: "RC charging and discharging",
    x: "Time / time constant",
    y: "Normalized charge, voltage, or current",
    range: [0, 6],
    yRange: [0, 1.1],
    curves: [["charging voltage or charge", "1-exp(-x)"], ["discharging voltage or charge", "exp(-x)"], ["charging current", "exp(-x)"]],
    note: "A charging capacitor approaches its final value exponentially; a discharging capacitor decays exponentially. The characteristic time is the circuit time constant."
  },
  {
    id: "magnetism",
    match: /\b(?:magnetism|magnetic field.*distance|straight wire|circular loop|solenoid)\b/i,
    title: "Magnetic-field strength with distance",
    x: "Distance from conductor (scaled)",
    y: "Magnetic field (scaled)",
    range: [0.5, 10],
    yRange: [0, 5],
    curves: [["long straight wire", "1/x"], ["circular loop on its axis", "1/(1+x^2)^1.5"], ["finite solenoid interior (idealized)", "max(0,min(1,5-x))"]],
    note: "The field around a long straight wire falls as 1/r. Along a circular loop’s axis it is strongest at the center; an ideal long solenoid has an approximately uniform interior field."
  },
  {
    id: "induction",
    match: /\b(?:electromagnetic induction|emi|alternating current|ac circuit|current in an lr|impedance)\b/i,
    title: "Induction and AC response",
    x: "Time or frequency (scaled)",
    y: "Current or response (scaled)",
    range: [0, 10],
    yRange: [-1.2, 1.2],
    curves: [["inductor current after switch-on", "1-exp(-x)"], ["decaying inductor current", "exp(-x)"]],
    note: "Current in an LR circuit rises toward a steady value after switch-on. In a driven AC circuit, resonance occurs when the response peaks near the natural frequency."
  },
  {
    id: "phasor",
    match: /\bphasor(?: diagram)?s?\b/i,
    kind: "svg",
    title: "Series RLC phasor diagram",
    note: "Resistor voltage is in phase with current. Inductor and capacitor voltages point in opposite directions; their vector difference combines with the resistor voltage to give the supply voltage."
  },
  {
    id: "lens-mirror",
    match: /\b(?:lens formula|mirror formula|1\s*\/\s*v.*1\s*\/\s*u|v[- ]u graph)\b/i,
    title: "Thin-lens and mirror formula",
    x: "Object distance (scaled)",
    y: "Image distance (scaled)",
    range: [1.08, 8],
    yRange: [-5, 10],
    curves: [["dimensionless image distance", "x/(x-1)"]],
    note: "The reciprocal-distance form is linear: 1/v plotted against 1/u has a constant intercept set by focal length. The distance form is hyperbolic, with an asymptote at the focal distance."
  },
  {
    id: "lens-reciprocal",
    match: /\b(?:1\s*\/\s*v\s*(?:vs\.?|against|versus)\s*1\s*\/\s*u|reciprocal lens|reciprocal mirror)\b/i,
    title: "Reciprocal lens and mirror formula",
    x: "1 / object distance (scaled)",
    y: "1 / image distance (scaled)",
    range: [-5, 5],
    yRange: [-5, 5],
    curves: [["thin lens or mirror", "1-x"]],
    note: "The reciprocal-distance graph is a straight line. Its intercept is set by the reciprocal focal length; sign conventions determine the exact signs."
  },
  {
    id: "prism",
    match: /\b(?:prism|angle of deviation|angle of incidence|ray optics)\b/i,
    title: "Prism deviation versus incidence angle",
    x: "Angle of incidence (scaled)",
    y: "Angle of deviation (scaled)",
    range: [0, 10],
    yRange: [0, 10],
    curves: [["deviation", "0.38*(x-5)^2+1"]],
    note: "The deviation reaches a minimum when the ray passes symmetrically through the prism. That minimum condition is used to determine refractive index."
  },
  {
    id: "wave-optics",
    match: /\b(?:wave optics|young'?s? double slit|ydse|single slit|diffraction grating|intensity distribution|fringe)\b/i,
    title: "Wave-optics intensity profiles",
    x: "Position on screen (scaled)",
    y: "Relative intensity",
    range: [-10, 10],
    yRange: [0, 1.1],
    curves: [["double-slit interference", "cos(x)^2"], ["single-slit diffraction envelope", "1/(1+0.1*x^2)"]],
    note: "Double-slit bright fringes are periodically spaced. A single-slit diffraction envelope is strongest at the center and has progressively weaker side maxima."
  },
  {
    id: "photoelectric",
    match: /\b(?:photoelectric|stopping potential|threshold frequency|planck'?s constant|photoelectric current)\b/i,
    title: "Photoelectric effect",
    x: "Frequency or applied voltage (scaled)",
    y: "Stopping potential or photocurrent (scaled)",
    range: [0, 10],
    yRange: [0, 10],
    curves: [["stopping potential above threshold", "max(0,1.2*(x-2))"], ["photocurrent saturation", "min(x,7)"]],
    note: "Stopping potential rises linearly with frequency above the threshold. Photocurrent increases with collecting voltage before reaching saturation."
  },
  {
    id: "binding-energy",
    match: /\b(?:binding energy per nucleon|mass number|nuclear physics|radioactive decay|decay law|number of active nuclei|half.?life)\b/i,
    title: "Nuclear binding and radioactive decay",
    x: "Mass number or time (scaled)",
    y: "Binding energy or fraction remaining",
    range: [0, 10],
    yRange: [0, 1.1],
    curves: [["binding energy per nucleon (scaled)", "x*exp(-x/5)"], ["radioactive nuclei remaining", "exp(-0.32*x)"]],
    note: "Binding energy per nucleon rises rapidly for light nuclei and peaks near iron. Radioactive nuclei decrease exponentially with time, halving once per half-life."
  },
  {
    id: "generic-pv",
    match: /\b(?:p[- ]v graph|pressure[- ]volume|pressure vs\.? volume)\b/i,
    title: "Pressure–volume relationship",
    x: "Volume",
    y: "Pressure",
    range: [0.5, 10],
    yRange: [0, 10],
    curves: [["isothermal process", "8/x"], ["adiabatic process", "10/x^1.4"]],
    note: "For a fixed amount of ideal gas, pressure falls as volume increases. Adiabatic expansion cools the gas, so its curve is steeper than the isothermal curve."
  }
];

const graphIntent = /\b(?:graph|graphs|plot|plots|curve|curves|diagrams?|draw|sketch|visuali[sz]e|show me|generate)\b/i;

function explicitExpressionGraph(text) {
  const normalized = String(text || "").replace(/[−–]/g, "-").replace(/π/g, "pi");
  const hasEquation = /\b(?:y|f\s*\(\s*x\s*\))\s*=/.test(normalized);
  if (!graphIntent.test(normalized) && !hasEquation) return null;

  // Prefer equations the learner actually named. In particular, a request for
  // one trig function must never fall through to the comparison preset.
  const equations = [...normalized.matchAll(/\b(?:y|f\s*\(\s*x\s*\))\s*=\s*([^\n,;]+)/gi)]
    .map((match) => match[1].trim()
      .replace(/\s+(?:graph|plot|curve|only|please|for|where|over|from|with|against)\b[\s\S]*$/i, "")
      .replace(/[?.!]$/, ""));
  let expressions = equations;
  if (!expressions.length) {
    const trig = [...normalized.matchAll(/\b(sin|cos|tan|cot|sec|csc)\s*(?:\(\s*x\s*\)|\s+x\b)/gi)]
      .map((match) => `${match[1].toLowerCase()}(x)`);
    if (trig.length) expressions = [...new Set(trig)];
  }
  if (!expressions.length) {
    const named = normalized.match(/\b(?:graph|plot|curve)\s+(?:only\s+)?(?:the\s+)?(?:of\s+)?(?:the\s+)?(?:function\s+)?([x\d(][\w\s()+*/^.-]*?)(?=\s+(?:for|where|over|from|with|against)\b|[,.;!?]|$)/i);
    if (named) expressions = [named[1].trim()];
  }
  if (!expressions.length) return null;

  const curves = expressions.slice(0, 6).map((source) => {
    let expression = source.replace(/\s+/g, " ").trim()
      .replace(/²/g, "^2").replace(/³/g, "^3").replace(/×/g, "*")
      .replace(/\be\s*\^\s*\(?\s*x\s*\)?/gi, "exp(x)")
      .replace(/\ba\s*\^\s*\(?\s*x\s*\)?/gi, "2^x")
      .replace(/\b(sin|cos|tan|cot|sec|csc)\s+x\b/gi, "$1(x)")
      .replace(/\b(sin|cos|tan|cot|sec|csc)\s*\(\s*x\s*\)/gi, "$1(x)");
    // Reject prose or unsupported symbols; the renderer validates the math
    // grammar too, but filtering here avoids producing a broken plot block.
    if (!/^[\wπ()+*/^.,\s-]+$/.test(expression) || !/\bx\b/i.test(expression)) return null;
    const label = expression.replace(/\s+/g, "");
    return [label, expression];
  }).filter(Boolean);
  if (!curves.length) return null;
  const trigOnly = curves.every(([, expression]) => /^(?:sin|cos|tan|cot|sec|csc)\(x\)$/i.test(expression));
  const oneTrig = curves.length === 1 && trigOnly;
  const x = oneTrig ? "Angle (rad)" : "x";
  const y = oneTrig ? "Value" : "y";
  return {
    id: "explicit-expression",
    title: curves.length === 1 ? `Graph of ${curves[0][1]}` : "Requested functions",
    x, y,
    range: trigOnly ? [-6.3, 6.3] : [-5, 5],
    yRange: trigOnly && curves.every(([, expression]) => /^(?:sin|cos)\(x\)$/i.test(expression)) ? [-1.5, 1.5] : undefined,
    curves,
    note: curves.length === 1 ? `This is the graph of ${curves[0][1]}.` : "Each curve shows one function named in the request."
  };
}

export function findStudyGraphPreset(prompt = "") {
  const text = String(prompt || "");
  if (!graphIntent.test(text) && !/\b(?:y|f\s*\(\s*x\s*\))\s*=/.test(text)) return null;
  const explicit = explicitExpressionGraph(text);
  if (explicit) return explicit;
  const presetById = (id) => presets.find((preset) => preset.id === id) || null;
  if (!/\binverse trig/i.test(text) && /\b(?:all|standard)\s+(?:trig|trigonometric)|\btrigonometric functions\b|\btrig functions\b/i.test(text)) return presetById("trigonometric");
  if (/\b(?:cosec(?:ant)?\s+(?:inverse|reciprocal)|inverse\s+cosec(?:ant)?|arc(?:csc|cosec(?:ant)?)|acosec(?:ant)?)\b/i.test(text)) {
    return {
      id: "inverse-cosecant",
      title: "Inverse cosecant",
      x: "Input value",
      y: "Principal angle (rad)",
      range: [-10, 10],
      yRange: [-2, 2],
      curves: [["arccsc(x)", "asin(1/x)"]],
      note: "The inverse cosecant is defined for |x| ≥ 1. Its principal values lie in [−π/2, 0) ∪ (0, π/2]."
    };
  }
  if (/\bphasor(?: diagram)?s?\b/i.test(text)) return presetById("phasor");
  if (/\b(?:indicator diagram|carnot cycle|otto cycle|thermodynamic cycle|adiabatic slope|isothermal slope)\b/i.test(text)) return presetById("indicator-cycle");
  if (/\b(?:1\s*\/\s*v\s*(?:vs\.?|against|versus)\s*1\s*\/\s*u|reciprocal lens|reciprocal mirror)\b/i.test(text)) return presetById("lens-reciprocal");
  if (/\b(?:shm energy|energy distribution|kinetic energy.*displacement|potential energy.*displacement|simple harmonic motion.*(?:energy|displacement))\b/i.test(text)) return presetById("shm-energy");
  if (/\b(?:radial wave function|ψ\s*\(?r|psi\s*\(?r)\b/i.test(text)) {
    return presetById("radial-wavefunction");
  }
  return presets.find((preset) => preset.match.test(text)) || null;
}

export function buildStudyGraphResponse(preset) {
  if (preset.kind === "svg") {
    return `**${preset.title}**\n\n\`\`\`svg\n<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><title>${preset.title}</title><rect width="600" height="400" fill="white"/><defs><marker id="phasor-arrow" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="none" stroke="#1d3557" stroke-width="1.5"/></marker></defs><text x="300" y="44" text-anchor="middle" font-family="Arial,sans-serif" font-size="25" font-weight="700" fill="#172b4d">Series RLC voltage phasors</text><text x="300" y="72" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" fill="#52657d">Schematic vector addition · current is the reference</text><line x1="95" y1="275" x2="485" y2="275" stroke="#d6dee8" stroke-width="2"/><line x1="110" y1="275" x2="350" y2="275" stroke="#2563eb" stroke-width="5" marker-end="url(#phasor-arrow)"/><line x1="350" y1="275" x2="350" y2="145" stroke="#e34b64" stroke-width="5" marker-end="url(#phasor-arrow)"/><line x1="350" y1="145" x2="350" y2="205" stroke="#8b5cf6" stroke-width="5" marker-end="url(#phasor-arrow)"/><line x1="110" y1="275" x2="350" y2="205" stroke="#138a72" stroke-width="5" marker-end="url(#phasor-arrow)"/><circle cx="110" cy="275" r="5" fill="#172b4d"/><text x="220" y="307" text-anchor="middle" font-family="Arial,sans-serif" font-size="19" font-weight="700" fill="#2563eb">V₍R₎ · resistor</text><text x="375" y="151" font-family="Arial,sans-serif" font-size="19" font-weight="700" fill="#e34b64">Vₗ · inductor</text><text x="375" y="196" font-family="Arial,sans-serif" font-size="19" font-weight="700" fill="#8b5cf6">V꜀ · capacitor</text><text x="226" y="224" text-anchor="middle" font-family="Arial,sans-serif" font-size="19" font-weight="700" fill="#138a72">V₍supply₎</text><text x="110" y="305" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" fill="#52657d">origin</text><text x="300" y="365" text-anchor="middle" font-family="Arial,sans-serif" font-size="15" fill="#52657d">Vₗ − V꜀ is the net reactive voltage.</text></svg>\n\`\`\`\n\n${preset.note}`;
  }
  const lines = [
    `title: ${preset.title}`,
    `x-axis: ${preset.x}`,
    `y-axis: ${preset.y}`,
    `x-range: ${preset.range[0]}, ${preset.range[1]}`,
    ...(preset.yRange ? [`y-range: ${preset.yRange[0]}, ${preset.yRange[1]}`] : []),
    ...preset.curves.map(([label, expression]) => `series: ${label} = ${expression}`),
    `caption: ${preset.note}`
  ];
  return `\`\`\`plot\n${lines.join("\n")}\n\`\`\``;
}
