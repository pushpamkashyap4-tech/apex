import React, { useMemo, useState } from "react";

export const BIOLOGY_TOOLS = [
  { id: "bio-abbreviations", name: "Biological Abbreviations Dictionary", category: "Biology", description: "Search common NCERT biology abbreviations and their meanings.", tag: "Searchable dictionary", type: "biology" },
  { id: "bio-scientists", name: "Important Scientists & Discoveries", category: "Biology", description: "Browse key biologists, their discoveries, and the ideas they established.", tag: "Scientists · discoveries", type: "biology" },
  { id: "bio-examples", name: "Flora & Fauna Examples Database", category: "Biology", description: "Find familiar plant and animal examples by family or phylum.", tag: "Families · phyla", type: "biology" },
  { id: "bio-punnett", name: "Punnett Square Calculator", category: "Biology", description: "Work out genotype and phenotype ratios for mono- and dihybrid crosses.", tag: "Genetics calculator", type: "biology" },
  { id: "bio-normal-values", name: "Human Body Normal Values", category: "Biology", description: "Review selected textbook physiology values with units and context.", tag: "Reference sheet", type: "biology" }
];

const ABBREVIATIONS = [
  ["RuBisCO", "Ribulose-1,5-bisphosphate carboxylase/oxygenase; the enzyme that fixes CO₂ in the Calvin cycle."],
  ["PEP", "Phosphoenolpyruvate; the three-carbon CO₂ acceptor in C₄ plants."],
  ["PEPcase", "Phosphoenolpyruvate carboxylase; fixes bicarbonate to PEP during initial C₄ carbon fixation."],
  ["RuBP", "Ribulose-1,5-bisphosphate; the five-carbon CO₂ acceptor in the Calvin cycle."],
  ["PGA", "3-phosphoglyceric acid; the first stable product of the Calvin cycle."],
  ["NADP⁺", "Nicotinamide adenine dinucleotide phosphate, the oxidised electron carrier used in photosynthesis."],
  ["ATP", "Adenosine triphosphate; a molecule that transfers usable chemical energy in cells."],
  ["CAM", "Crassulacean acid metabolism; a water-saving pathway with night-time CO₂ fixation."],
  ["IAA", "Indole-3-acetic acid; a naturally occurring auxin involved in plant growth."],
  ["ABA", "Abscisic acid; a plant hormone associated with dormancy and stress responses."],
  ["GPP", "Gross primary productivity; the total rate of organic-matter production by producers."],
  ["NPP", "Net primary productivity; GPP minus the producers’ respiratory losses."],
  ["BOD", "Biochemical oxygen demand; oxygen used by microorganisms to decompose organic matter in water."],
  ["PCR", "Polymerase chain reaction; a method for amplifying a selected DNA sequence."],
  ["ELISA", "Enzyme-linked immunosorbent assay; a test that uses antigen–antibody binding and an enzyme-linked signal."],
  ["ADA", "Adenosine deaminase; an enzyme whose deficiency can cause severe combined immunodeficiency."],
  ["Bt", "Bacillus thuringiensis; a bacterium whose Cry proteins are used in insect-resistant crops."],
  ["RNAi", "RNA interference; sequence-specific gene silencing mediated by double-stranded RNA."],
  ["MHC", "Major histocompatibility complex; a set of cell-surface molecules involved in antigen presentation."],
  ["GFR", "Glomerular filtration rate; the volume of filtrate formed by the kidneys per unit time."]
];

const SCIENTISTS = [
  ["Carolus Linnaeus", "Formalised binomial nomenclature and a hierarchical system of classification."],
  ["R. H. Whittaker", "Proposed the five-kingdom classification system."],
  ["Matthias Schleiden & Theodor Schwann", "Established the foundational cell theory for plants and animals."],
  ["Rudolf Virchow", "Stated that new cells arise from pre-existing cells."],
  ["Charles Darwin", "Explained evolution through natural selection."],
  ["Gregor Mendel", "Established the basic laws of inheritance through pea-plant crosses."],
  ["Hugo de Vries", "Proposed mutation theory based on work with evening primrose."],
  ["T. H. Morgan", "Provided experimental evidence for linkage and recombination using Drosophila."],
  ["Friedrich Miescher", "First isolated a phosphorus-rich substance later known as DNA."],
  ["Avery, MacLeod & McCarty", "Showed that DNA is the transforming principle in bacteria."],
  ["Hershey & Chase", "Used bacteriophages to show that DNA, rather than protein, carries hereditary information."],
  ["Meselson & Stahl", "Demonstrated semiconservative DNA replication in E. coli."],
  ["Watson & Crick", "Proposed the double-helical model of DNA using available structural evidence."],
  ["Alexander Fleming", "Observed the antibacterial effect of penicillin from Penicillium."],
  ["Norman Borlaug", "Led major wheat-breeding work associated with the Green Revolution."],
  ["Ernst Mayr", "Made major contributions to the biological species concept and evolutionary biology."]
];

const EXAMPLES = [
  ["Potato", "Solanaceae", "Angiosperm · dicot"], ["Tomato", "Solanaceae", "Angiosperm · dicot"], ["Brinjal", "Solanaceae", "Angiosperm · dicot"],
  ["Pea", "Fabaceae", "Angiosperm · dicot"], ["Gram", "Fabaceae", "Angiosperm · dicot"], ["Bean", "Fabaceae", "Angiosperm · dicot"],
  ["Mustard", "Brassicaceae", "Angiosperm · dicot"], ["Sunflower", "Asteraceae", "Angiosperm · dicot"], ["Wheat", "Poaceae", "Angiosperm · monocot"], ["Maize", "Poaceae", "Angiosperm · monocot"], ["Lily", "Liliaceae", "Angiosperm · monocot"],
  ["Nereis", "Annelida", "Animal · segmented worm"], ["Ascaris", "Aschelminthes (Nematoda)", "Animal · roundworm"], ["Pila", "Mollusca", "Animal · mollusc"], ["Cockroach", "Arthropoda", "Animal · insect"], ["Honey bee", "Arthropoda", "Animal · insect"],
  ["Asterias (starfish)", "Echinodermata", "Animal · echinoderm"], ["Balanoglossus", "Hemichordata", "Animal · hemichordate"], ["Herdmania", "Urochordata (Tunicata)", "Animal · chordate"], ["Amphioxus", "Cephalochordata", "Animal · chordate"], ["Petromyzon", "Cyclostomata", "Animal · jawless vertebrate"],
  ["Rohu", "Chordata · Osteichthyes", "Animal · bony fish"], ["Shark", "Chordata · Chondrichthyes", "Animal · cartilaginous fish"], ["Frog", "Chordata · Amphibia", "Animal · amphibian"], ["Pigeon", "Chordata · Aves", "Animal · bird"], ["Human", "Chordata · Mammalia", "Animal · mammal"]
];

const NORMAL_VALUES = [
  ["Blood pressure", "For adults, normal is below 120/80 mmHg", "AHA category; clinical interpretation depends on repeated measurements and context."],
  ["Glomerular filtration rate", "About 120–125 mL/min in a healthy young adult", "Approximate physiology reference; commonly indexed to 1.73 m² body surface area. It varies with age and individual factors."],
  ["Resting heart rate", "About 72 beats/min (typical textbook value)", "A representative resting value, not a diagnostic threshold."],
  ["Tidal volume", "About 500 mL per quiet breath (adult textbook value)", "Approximate volume of air inspired or expired in an ordinary breath."],
  ["Cardiac output", "About 5 L/min at rest (textbook value)", "Approximate value; changes with body size, activity, and physiological state."],
  ["Urine output", "About 1–1.5 L/day (typical adult reference)", "Varies substantially with fluid intake, environment, and health."],
  ["Body temperature", "About 37 °C (classic reference value)", "Normal temperature varies by person, time of day, and measurement site."]
];

const h = React.createElement;
function SearchableRows({ rows, headers, renderRow }) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => rows.filter((row) => row.join(" ").toLowerCase().includes(query.trim().toLowerCase())), [rows, query]);
  return h("div", { className: "bio-tool-content" }, [
    h("label", { className: "tool-input bio-tool-search", key: "search" }, [h("span", { key: "label" }, "Search entries"), h("input", { key: "input", type: "search", value: query, onChange: (event) => setQuery(event.target.value), placeholder: "Type a name or term" })]),
    h("p", { className: "bio-tool-count", key: "count" }, `${matches.length} ${matches.length === 1 ? "entry" : "entries"}`),
    h("div", { className: "bio-tool-list", key: "list", role: "list" }, matches.length ? matches.map((row, index) => renderRow(row, index)) : h("p", { className: "bio-tool-empty" }, "No matching entries."))
  ]);
}

function ratio(values) {
  const divisor = values.reduce((a, b) => b ? gcd(a, b) : a, 0) || 1;
  return values.map((value) => value / divisor).join(":");
}
function gcd(a, b) { return b ? gcd(b, a % b) : Math.abs(a); }
function gametes(genotype) {
  const loci = genotype.trim().split(/\s+/);
  if (!loci.length || loci.some((locus) => !/^[A-Za-z]{2}$/.test(locus))) return null;
  return loci.reduce((result, locus) => result.flatMap((prefix) => [...new Set(locus.split(""))].map((allele) => prefix + allele)), [""]);
}
function offspring(a, b) {
  if (!a || !b || a.length !== b.length || a.some((x) => x.length !== b[0].length)) return null;
  const out = [];
  for (const ga of a) for (const gb of b) {
    let genotype = "";
    for (let i = 0; i < ga.length; i++) genotype += [ga[i], gb[i]].sort((x, y) => x.toLowerCase() === y.toLowerCase() ? (x === x.toUpperCase() ? -1 : 1) : x.toLowerCase().localeCompare(y.toLowerCase())).join("");
    out.push(genotype);
  }
  return out;
}
function PunnettTool() {
  const [mode, setMode] = useState("mono");
  const [parentA, setParentA] = useState("Aa");
  const [parentB, setParentB] = useState("Aa");
  const loci = mode === "mono" ? 1 : 2;
  const a = gametes(parentA), b = gametes(parentB);
  const children = a && b && a[0].length === loci && b[0].length === loci ? offspring(a, b) : null;
  const genotypes = children ? [...new Set(children)].sort().map((key) => [key, children.filter((value) => value === key).length]) : [];
  const phenotypes = children ? children.reduce((counts, genotype) => {
    const dominantCount = Array.from({ length: loci }, (_, index) => genotype.slice(index * 2, index * 2 + 2)).filter((pair) => /[A-Z]/.test(pair)).length;
    const phenotype = `${dominantCount} dominant allele${dominantCount === 1 ? "" : "s"}`;
    counts[phenotype] = (counts[phenotype] || 0) + 1;
    return counts;
  }, {}) : {};
  const edit = (setter, value) => setter(value.replace(/[^A-Za-z\s]/g, "").slice(0, 5));
  return h("div", { className: "bio-tool-content" }, [
    h("label", { className: "tool-input", key: "mode" }, [h("span", { key: "label" }, "Cross type"), h("select", { key: "select", value: mode, onChange: (event) => { const next = event.target.value; setMode(next); setParentA(next === "mono" ? "Aa" : "Aa Bb"); setParentB(next === "mono" ? "Aa" : "Aa Bb"); } }, [h("option", { value: "mono", key: "mono" }, "Monohybrid"), h("option", { value: "di", key: "di" }, "Dihybrid · unlinked loci")])]),
    h("div", { className: "tool-form-grid", key: "parents" }, [h("label", { className: "tool-input", key: "a" }, [h("span", { key: "label" }, "Parent 1 genotype"), h("input", { value: parentA, onChange: (event) => edit(setParentA, event.target.value), placeholder: mode === "mono" ? "Aa" : "Aa Bb" })]), h("label", { className: "tool-input", key: "b" }, [h("span", { key: "label" }, "Parent 2 genotype"), h("input", { value: parentB, onChange: (event) => edit(setParentB, event.target.value), placeholder: mode === "mono" ? "Aa" : "Aa Bb" })])]),
    children ? h(React.Fragment, { key: "result" }, [h("div", { className: "tool-result", key: "geno" }, [h("span", { key: "label" }, "Genotype ratio"), h("strong", { key: "value" }, ratio(genotypes.map(([, count]) => count))), h("small", { key: "detail" }, genotypes.map(([genotype, count]) => `${genotype}: ${count}`).join(" · "))]), h("div", { className: "tool-result", key: "pheno" }, [h("span", { key: "label" }, "Phenotype ratio · complete dominance"), h("strong", { key: "value" }, ratio(Object.values(phenotypes))), h("small", { key: "detail" }, `${children.length} equally likely offspring outcomes; assumes complete dominance and independent assortment.`)])]) : h("p", { className: "bio-tool-empty", key: "error" }, `Enter ${loci === 1 ? "one allele pair such as Aa" : "two allele pairs such as Aa Bb"} for each parent.`)
  ]);
}

export function BiologyToolDetail({ tool }) {
  if (tool.id === "bio-punnett") return h(PunnettTool);
  if (tool.id === "bio-abbreviations") return h(SearchableRows, { rows: ABBREVIATIONS, renderRow: ([term, meaning], index) => h("article", { className: "bio-entry", key: `${term}-${index}`, role: "listitem" }, [h("strong", { key: "term" }, term), h("p", { key: "meaning" }, meaning)]) });
  if (tool.id === "bio-scientists") return h(SearchableRows, { rows: SCIENTISTS, renderRow: ([name, discovery], index) => h("article", { className: "bio-entry", key: `${name}-${index}`, role: "listitem" }, [h("span", { className: "bio-timeline-dot", key: "dot" }), h("strong", { key: "name" }, name), h("p", { key: "discovery" }, discovery)]) });
  if (tool.id === "bio-examples") return h(SearchableRows, { rows: EXAMPLES, renderRow: ([example, group, classification], index) => h("article", { className: "bio-entry bio-example-row", key: `${example}-${index}`, role: "listitem" }, [h("strong", { key: "example" }, example), h("span", { className: "bio-entry-tag", key: "group" }, group), h("p", { key: "classification" }, classification)]) });
  if (tool.id === "bio-normal-values") return h("div", { className: "bio-tool-content" }, [h("div", { className: "bio-tool-list", key: "values" }, NORMAL_VALUES.map(([name, value, context]) => h("article", { className: "bio-entry", key: name }, [h("strong", { key: "name" }, name), h("b", { key: "value" }, value), h("p", { key: "context" }, context)]))), h("p", { className: "bio-source-note", key: "sources" }, ["Adult blood-pressure category follows ", h("a", { href: "https://www.heart.org/en/health-topics/high-blood-pressure/blood-pressure-explained", target: "_blank", rel: "noreferrer", key: "aha" }, "American Heart Association"), "; GFR is an approximate reference value from ", h("a", { href: "https://www.ncbi.nlm.nih.gov/books/NBK538339/", target: "_blank", rel: "noreferrer", key: "nih" }, "NCBI Bookshelf renal physiology"), ". Other values are approximate textbook physiology references."])]);
  return null;
}
