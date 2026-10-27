const syllabusFiles = [
  "/data/physics-11.json", "/data/physics-12.json",
  "/data/chemistry-11.json", "/data/chemistry-12.json",
  "/data/maths-11.json", "/data/maths-12.json"
];

// Websim serves workspace files directly, so public/ remains part of the URL.
// Vite and Vercel copy public/ to the site root instead.
const publicPrefix = typeof window !== "undefined" && window.websim ? "/public" : "";

const chapters = (await Promise.all(syllabusFiles.map(async (path) => {
  const response = await fetch(new URL(`${publicPrefix}${path}`, import.meta.url));
  if (!response.ok) throw new Error(`Could not load syllabus data: ${path}`);
  return response.json();
}))).flat();

const subjectOrder = new Map([["Physics", 0], ["Chemistry", 1], ["Mathematics", 2]]);
const orderedChapters = chapters
  .sort((a, b) => subjectOrder.get(a.subject) - subjectOrder.get(b.subject) || a._order - b._order)
  .map(({ _order, ...chapter }) => chapter);

export const SYLLABUS = {
  mains: orderedChapters.filter((chapter) => chapter.exam === "both" || chapter.exam === "mains_only"),
  advanced: orderedChapters.filter((chapter) => chapter.exam === "both" || chapter.exam === "advanced_only")
};
