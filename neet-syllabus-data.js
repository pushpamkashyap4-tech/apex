const biologyFiles = ["/data/biology-11.json", "/data/biology-12.json"];
const publicPrefix = typeof window !== "undefined" && window.websim ? "/public" : "";

export const NEET_BIOLOGY_CHAPTERS = (await Promise.all(biologyFiles.map(async (path) => {
  const response = await fetch(new URL(`${publicPrefix}${path}`, import.meta.url));
  if (!response.ok) throw new Error(`Could not load syllabus data: ${path}`);
  return response.json();
}))).flat();
