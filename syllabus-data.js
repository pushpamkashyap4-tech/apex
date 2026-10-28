const syllabusFiles = [
  "/data/physics-11.json", "/data/physics-12.json",
  "/data/chemistry-11.json", "/data/chemistry-12.json",
  "/data/maths-11.json", "/data/maths-12.json"
];

async function loadSyllabusFile(path) {
  for (const url of [new URL(path, import.meta.url), new URL(`/public${path}`, import.meta.url)]) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch { /* Try the alternate static asset path. */ }
  }
  throw new Error(`Could not load syllabus data: ${path}`);
}

const chapters = (await Promise.all(syllabusFiles.map(loadSyllabusFile))).flat();

const subjectOrder = new Map([["Physics", 0], ["Chemistry", 1], ["Mathematics", 2]]);
const orderedChapters = chapters
  .sort((a, b) => subjectOrder.get(a.subject) - subjectOrder.get(b.subject) || a._order - b._order)
  .map(({ _order, ...chapter }) => chapter);

export const SYLLABUS = {
  mains: orderedChapters.filter((chapter) => chapter.exam === "both" || chapter.exam === "mains_only"),
  advanced: orderedChapters.filter((chapter) => chapter.exam === "both" || chapter.exam === "advanced_only")
};
