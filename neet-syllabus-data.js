const biologyFiles = ["/data/biology-11.json", "/data/biology-12.json"];
async function loadSyllabusFile(path) {
  for (const url of [new URL(path, import.meta.url), new URL(`/public${path}`, import.meta.url)]) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch { /* Try the alternate static asset path. */ }
  }
  throw new Error(`Could not load syllabus data: ${path}`);
}

export const NEET_BIOLOGY_CHAPTERS = (await Promise.all(biologyFiles.map(loadSyllabusFile))).flat();
