import { jsx } from "react/jsx-runtime";
import { Fragment, jsx as jsx2 } from "react/jsx-runtime";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as pdfjs from "pdfjs-dist/build/pdf.mjs";
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  BookOpen,
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  Compass,
  Database,
  ExternalLink,
  Flame,
  Home,
  ListTodo,
  ListChecks,
  MoreHorizontal,
  Moon,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Bookmark,
  ChevronDown,
  Upload,
  FileText,
  IdCard,
  Paintbrush,
  Settings,
  SlidersHorizontal,
  PencilRuler,
  Sparkles,
  Sun,
  Target,
  Timer,
  Trash2,
  TrendingUp,
  Play,
  ZoomIn,
  ZoomOut,
  Type,
  X,
  Zap
} from "lucide-react";
import { SYLLABUS } from "./syllabus-data.js";
import { NEET_BIOLOGY_CHAPTERS } from "./neet-syllabus-data.js";
import { DEFAULT_MODEL_PREFERENCES } from "./ai.js";
import StudyToolkit from "./toolkit.js";
import MemoryRecall from "./memory-recall.js";
import PracticeDashboard from "./practice-dashboard.js";
import { RevisionPlanner, AstraPlanner, ApiKeySettings } from "./deep-views.js";
import { ImageFullView, readImageDataUrl } from "./image-viewer.js";
import { deleteLocalFile, fileToDataUrl, loadLocalFile, saveLocalFile } from "./local-files.js";
import { JEE_SUBJECTS, NEET_SUBJECTS, SubjectModeContext, useSubjectMode } from "./subject-mode.js";
import { NotesFolderIcon, ReadingListIcon, StudyTableIcon } from "./icon-illustrations.js";
import StudyCopilot from "./study-copilot.js";
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Apex service worker registration failed:", error);
    });
  }, { once: true });
}
const STORAGE_KEY = "apex-jee-state-v1";
const ACTIVE_SYNC_CODE_KEY = "apex-active-sync-code-v1";
const SYNC_DATA_PREFIX = "apex_data_";
function readActiveSyncCode() {
  try {
    const code = localStorage.getItem(ACTIVE_SYNC_CODE_KEY) || "";
    return /^\d{4,6}$/.test(code) ? code : "";
  } catch {
    return "";
  }
}
function syncStorageKey(code) {
  return `${SYNC_DATA_PREFIX}${code}`;
}
const MERGED_CHAPTER_ID_ALIASES = {
  "chemistry-organic-chemistry-purification-characterisation": "chemistry-organic-chemistry-general-organic-chemistry",
  "chemistry-inorganic-chemistry-qualitative-analysis": "chemistry-organic-chemistry-practical-chemistry"
};
function canonicalChapterId(id) {
  return MERGED_CHAPTER_ID_ALIASES[id] || id;
}
function migrateChapterKeyedState(records = {}) {
  const migrated = { ...records };
  for (const [legacyId, activeId] of Object.entries(MERGED_CHAPTER_ID_ALIASES)) {
    if (Object.hasOwn(records, legacyId)) migrated[activeId] = { ...records[legacyId], ...migrated[activeId] || {} };
  }
  return migrated;
}
const DEFAULT_HANDBOOKS = [
  { id: "builtin-handbook-physics", subject: "Physics", name: "Physics.pdf", size: 1168739, url: "/assets/handbooks/physics.pdf", remoteUrl: "", uploadedAt: "2026-09-30", builtin: true },
  { id: "builtin-handbook-chemistry", subject: "Chemistry", name: "Chemistry.pdf", size: 2143520, url: "/assets/handbooks/chemistry.pdf", remoteUrl: "", uploadedAt: "2026-09-30", builtin: true },
  { id: "builtin-handbook-maths", subject: "Maths", name: "Maths.pdf", size: 1256085, url: "/assets/handbooks/maths.pdf", remoteUrl: "", uploadedAt: "2026-09-30", builtin: true }
];
async function fetchHandbookBytes(source) {
  const raw = String(source || "").trim();
  if (!raw) throw new Error("This PDF is no longer available on this device. Upload it again to read it here.");
  const isAbsolute = /^(?:https?:|blob:|data:)/i.test(raw);
  const rootPath = isAbsolute ? raw : `/${raw.replace(/^\/+|^(?:\.\/)+/g, "").replace(/^public\//, "")}`;
  const candidates = isAbsolute ? [raw] : [...new Set([rootPath, `/public${rootPath}`])];
  let lastError;
  for (const url of candidates) {
    try {
      const response = await fetch(url, { cache: "no-cache" });
      if (!response.ok) { lastError = new Error(`PDF request failed (${response.status}).`); continue; }
      const bytes = new Uint8Array(await response.arrayBuffer());
      const header = new TextDecoder().decode(bytes.subarray(0, 5));
      if (header !== "%PDF-") { lastError = new Error(`The file at ${url} is not a readable PDF.`); continue; }
      return bytes;
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error("This PDF could not be loaded.");
}
const AppSettingsContext = React.createContext(null);
const useAppSettings = () => React.useContext(AppSettingsContext);
const NAV_ITEMS = [
  { key: "today", label: "Today", icon: Home },
  { key: "tasks", label: "All Tasks", icon: ListTodo },
  { key: "insights", label: "Insights", icon: TrendingUp },
  { key: "revision", label: "Patch list", icon: ReadingListIcon }
];
const THEMES = [
  { id: "quantum", name: "Quantum Dark", colors: ["#f2f7fb", "#ffffff", "#087ebd"] },
  { id: "forest", name: "Teal Horizon", colors: ["#062b2b", "#0e7774", "#35c5b4"] },
  { id: "sapphire-spotlight", name: "Sapphire Spotlight", colors: ["#071426", "#1454b8", "#60a5fa"] },
  { id: "warm-orange", name: "Warm Orange", colors: ["#fff8f0", "#f57c00", "#30251e"] },
  { id: "stone", name: "Stone", colors: ["#f1f3f5", "#ffffff", "#61798d"] },
  { id: "sand", name: "Sand", colors: ["#fbf5e9", "#ffffff", "#a2763b"] },
  { id: "mesh-gradient", name: "Mesh Gradient", colors: ["#11102b", "#4c1d95", "#312e81"] },
  { id: "neon-grid", name: "Neon Grid", colors: ["#0a0a1a", "#8b5cf6", "#06b6d4"] },
  { id: "milky-way", name: "Milky Way", colors: ["#101b38", "#6d4da8", "#b7a1ff"] },
  { id: "deep-space", name: "Deep Space", colors: ["#080d19", "#243c5c", "#75c9ed"] }
];
const SIDEBAR_LINKS = [
  { key: "today", label: "Home", icon: Home },
  { key: "syllabus", label: "Syllabus Tracker", badge: "CH", icon: ListChecks },
  { key: "planner", label: "Revision Planner", badge: "SPACED", icon: CalendarDays },
  { key: "toolkit", label: "Study Toolkit", badge: "61 TOOLS", icon: PencilRuler },
  { key: "memory", label: "Memory & Recall", badge: "ACTIVE", icon: Sparkles },
  { key: "practice", label: "Question Practice", badge: "TARGET", icon: ClipboardCheck },
  { key: "handbook", label: "Handbook", badge: "PDFs", icon: NotesFolderIcon },
  { key: "exams", label: "Exams / Mock Tests", note: "Simulation hub", icon: Target },
  { key: "assistant", label: "AI Assistant", badge: "ASK", icon: Bot }
];
const ROUTE_COPY = {
  syllabus: "A clear view of your chapters, checkpoints, and what comes next.",
  planner: "Space your reviews across the study days you have planned.",
  toolkit: "Your study utilities, gathered in one place.",
  memory: "Keep recall active with short, regular review sessions.",
  practice: "Build a focused question queue from the topics you are studying.",
  handbook: "Your reference shelf for notes and study PDFs.",
  exams: "Prepare for a full-length simulation at your own pace.",
  assistant: "Ask questions and work through ideas with your AI study assistant."
};
function dateKey(date = /* @__PURE__ */ new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(date, amount) {
  const d = new Date(date);
  d.setDate(d.getDate() + amount);
  return d;
}
function dateLabel(date) {
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(date);
}
function studyDayNumber(date, dayOne) {
  const start = /* @__PURE__ */ new Date(`${dayOne || dateKey()}T12:00:00`);
  const target = /* @__PURE__ */ new Date(`${date}T12:00:00`);
  return Math.floor((target.getTime() - start.getTime()) / 864e5) + 1;
}
function createDaysFrom(startDate, count) {
  return Array.from({ length: count }, (_, index) => {
    const date = dateKey(addDays(/* @__PURE__ */ new Date(`${startDate}T12:00:00`), index));
    return { id: `day-${date}`, date, intention: "" };
  });
}
function canonicalSubject(subject = "") {
  const value = String(subject).toLowerCase();
  if (value.includes("math")) return "Mathematics";
  if (value.includes("chem")) return "Chemistry";
  if (value.includes("botan")) return "Botany";
  if (value.includes("zool")) return "Zoology";
  if (value.includes("bio")) return "Biology";
  if (value.includes("phys")) return "Physics";
  return "Other";
}
function scheduleLabel(task) {
  const taskDate = task.date || dateKey();
  const day = taskDate === dateKey() ? "Today" : dateLabel(/* @__PURE__ */ new Date(`${taskDate}T12:00:00`));
  if (!task.time) return `${day} \xB7 Flexible`;
  const [hours, minutes] = task.time.split(":").map(Number);
  return `${day} \xB7 ${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}
function adjustStudyMetrics(state, day, subjectValue, delta) {
  const dailyMinutes = { ...state.dailyMinutes };
  dailyMinutes[day] = Math.max(0, Number(dailyMinutes[day] || 0) + Number(delta || 0));
  const subject = canonicalSubject(subjectValue);
  const dailySubjectMinutes = { ...state.dailySubjectMinutes || {} };
  if (subject !== "Other") {
    dailySubjectMinutes[day] = { ...dailySubjectMinutes[day] || {} };
    dailySubjectMinutes[day][subject] = Math.max(0, Number(dailySubjectMinutes[day][subject] || 0) + Number(delta || 0));
  }
  return { ...state, dailyMinutes, dailySubjectMinutes };
}
function createInitialDays() {
  const today = /* @__PURE__ */ new Date();
  return Array.from({ length: 8 }, (_, index) => ({
    id: `day-${dateKey(addDays(today, index))}`,
    date: dateKey(addDays(today, index)),
    intention: ""
  }));
}
function getInitialState(storageKey = STORAGE_KEY) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (saved && typeof saved === "object") {
      const tasks = Array.isArray(saved.tasks) ? saved.tasks.map((task) => task.chapterId ? { ...task, chapterId: canonicalChapterId(task.chapterId) } : task) : [];
      const sessions = Array.isArray(saved.sessions) ? saved.sessions : [];
      let dailySubjectMinutes = saved.dailySubjectMinutes || null;
      if (!dailySubjectMinutes) {
        dailySubjectMinutes = {};
        const addSubjectMinutes = (day, subjectValue, minutes) => {
          const subject = canonicalSubject(subjectValue);
          if (subject === "Other") return;
          dailySubjectMinutes[day] = { ...dailySubjectMinutes[day] || {} };
          dailySubjectMinutes[day][subject] = Number(dailySubjectMinutes[day][subject] || 0) + Number(minutes || 0);
        };
        tasks.filter((task) => task.completed).forEach((task) => addSubjectMinutes(task.completedAt || dateKey(), task.subject, task.duration));
        sessions.forEach((session) => {
          const task = tasks.find((item) => item.id === session.taskId);
          addSubjectMinutes(session.date || dateKey(), session.subject || task?.subject, session.minutes);
        });
      }
      const diagnostics = Array.isArray(saved.diagnostics) ? saved.diagnostics : tasks.filter((task) => task.revision || task.isRevision).map((task) => ({
        id: `diagnostic-${task.id}`,
        title: task.title,
        subject: task.subject || "Physics",
        category: "Concept",
        confidence: 1,
        createdAt: task.date || dateKey(),
        sourceTaskId: task.id,
        queuedTaskId: null,
        resolvedAt: task.completedAt || null
      }));
      const { apiKey: _legacyApiKey, groqApiKeys: _legacyGroqKeys, geminiApiKeys: _legacyGeminiKeys, ...savedSettings } = saved.settings || {};
      return {
        profile: { username: "P", classLevel: "Class 12", target: "JEE", ...saved.profile },
        tasks,
        days: Array.isArray(saved.days) && saved.days.length ? saved.days : createInitialDays(),
        deletedDayDates: Array.isArray(saved.deletedDayDates) ? saved.deletedDayDates : [],
        selectedDate: saved.selectedDate || dateKey(),
        dailyMinutes: saved.dailyMinutes || {},
        dailySubjectMinutes,
        sessions,
        diagnostics,
        syllabusMode: saved.syllabusMode === "advanced" ? "advanced" : "mains",
        syllabusProgress: migrateChapterKeyedState(saved.syllabusProgress),
        customChapters: Array.isArray(saved.customChapters) ? saved.customChapters.map((chapter) => ({ ...chapter, exam: chapter.exam || "both" })) : [],
        deletedChapterIds: Array.isArray(saved.deletedChapterIds) ? saved.deletedChapterIds : [],
        handbookDocs: [...DEFAULT_HANDBOOKS, ...Array.isArray(saved.handbookDocs) ? saved.handbookDocs.filter((document2) => !DEFAULT_HANDBOOKS.some((builtin) => builtin.id === document2.id)) : []],
        astraConfig: saved.astraConfig || null,
        examConfig: {
          type: "JEE Main",
          duration: 180,
          subjects: ["Physics", "Chemistry", "Mathematics"],
          targetScore: 80,
          ...saved.examConfig,
          targetDate: !saved.examConfig?.targetDate || saved.examConfig.targetDate === "2027-01-22"
            ? "2027-01-20"
            : saved.examConfig.targetDate
        },
        studyPathProgress: saved.studyPathProgress || {},
        examResponses: Array.isArray(saved.examResponses) ? saved.examResponses : [],
        memorySelection: saved.memorySelection ? { ...saved.memorySelection, chapterId: canonicalChapterId(saved.memorySelection.chapterId) } : { subject: null, classLevel: null, chapterId: null },
        memoryDecks: Object.entries(saved.memoryDecks || {}).reduce((decks, [chapterId, deck]) => {
          const activeChapterId = canonicalChapterId(chapterId);
          decks[activeChapterId] = { ...decks[activeChapterId], ...deck };
          return decks;
        }, {}),
        memoryProgress: migrateChapterKeyedState(saved.memoryProgress),
        revisionReviews: migrateChapterKeyedState(saved.revisionReviews),
        practiceTargets: Array.isArray(saved.practiceTargets) ? saved.practiceTargets.map((target) => target.chapterId ? { ...target, chapterId: canonicalChapterId(target.chapterId) } : target) : [],
        copilotMessages: Array.isArray(saved.copilotMessages) ? saved.copilotMessages : [],
        settings: {
          theme: "forest",
          mode: "light",
          highContrast: false,
          fontSize: "medium",
          planLength: 8,
          dayOne: dateKey(),
          ...savedSettings
        }
      };
    }
  } catch (error) {
    console.warn("Could not read Apex data:", error);
  }
  return {
    profile: { username: "P", classLevel: "Class 12", target: "JEE" },
    tasks: [],
    days: createInitialDays(),
    deletedDayDates: [],
    selectedDate: dateKey(),
    dailyMinutes: {},
    dailySubjectMinutes: {},
    sessions: [],
    diagnostics: [],
    syllabusMode: "mains",
    syllabusProgress: {},
    customChapters: [],
    deletedChapterIds: [],
    handbookDocs: DEFAULT_HANDBOOKS,
    astraConfig: null,
    examConfig: { type: "JEE Main", targetDate: "2027-01-20", duration: 180, subjects: ["Physics", "Chemistry", "Mathematics"], targetScore: 80 },
    studyPathProgress: {},
    examResponses: [],
    memorySelection: { subject: null, classLevel: null, chapterId: null },
    memoryDecks: {},
    memoryProgress: {},
    revisionReviews: {},
    practiceTargets: [],
    copilotMessages: [],
    settings: { theme: "forest", mode: "light", highContrast: false, fontSize: "medium", planLength: 8, dayOne: dateKey() }
  };
}
function humanDuration(minutes) {
  const mins = Number(minutes) || 0;
  return mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ""}` : `${mins}m`;
}
function ModalFrame({ title, subtitle, onClose, children, narrow = false, hideClose = false }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return /* @__PURE__ */ jsx2("div", { className: "overlay", onMouseDown: (event) => {
    if (event.target === event.currentTarget) onClose();
  }, children: /* @__PURE__ */ jsx2("section", { className: `modal ${narrow ? "narrow" : ""}`, role: "dialog", "aria-modal": "true", "aria-label": title, children: [
    /* @__PURE__ */ jsx2("div", { className: "modal-header", children: [
      /* @__PURE__ */ jsx2("div", { children: [
        /* @__PURE__ */ jsx2("h2", { children: title }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 207,
          columnNumber: 14
        }, this),
        subtitle && /* @__PURE__ */ jsx2("p", { children: subtitle }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 207,
          columnNumber: 43
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 207,
        columnNumber: 9
      }, this),
      !hideClose && /* @__PURE__ */ jsx2("button", { className: "close-button", onClick: onClose, "aria-label": "Close", children: /* @__PURE__ */ jsx2(X, { size: 17 }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 208,
        columnNumber: 79
      }, this) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 208,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 206,
      columnNumber: 7
    }, this),
    children
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 205,
    columnNumber: 5
  }, this) }, void 0, false, {
    fileName: "<stdin>",
    lineNumber: 204,
    columnNumber: 10
  }, this);
}
function profileInitial(username) {
  const name = String(username || "P").trim() || "P";
  const first = typeof Intl.Segmenter === "function"
    ? [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(name)][0]?.segment
    : Array.from(name)[0];
  return String(first || "P").toLocaleUpperCase();
}
function ProfileModal({ profile, onClose, onSave }) {
  const [draft, setDraft] = useState(profile);
  const targetOptions = ["JEE Mains", "JEE Advanced", "JEE Mains + Advanced", "NEET", "BOARDS"];
  const targetValue = targetOptions.includes(draft.target) ? draft.target : draft.target === "JEE Advanced" ? "JEE Advanced" : "JEE Mains + Advanced";
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  return /* @__PURE__ */ jsx2(ModalFrame, { title: "Your profile", subtitle: "Make your study space yours.", onClose, children: [
    /* @__PURE__ */ jsx2("div", { className: "field", children: [
      /* @__PURE__ */ jsx2("label", { htmlFor: "profile-name", children: "Your name" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 220,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx2("input", { id: "profile-name", type: "text", inputMode: "text", autoComplete: "nickname", autoCapitalize: "off", spellCheck: false, value: draft.username, onChange: (e) => update("username", e.target.value), placeholder: "Your name" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 221,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 219,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsx2("div", { className: "field", children: [
      /* @__PURE__ */ jsx2("span", { className: "field-label", children: "Class" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 224,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx2("div", { className: "pill-group", children: ["Class 11", "Class 12"].map((level) => /* @__PURE__ */ jsx2("button", { className: `pill-choice ${draft.classLevel === level ? "selected" : ""}`, onClick: () => update("classLevel", level), children: level }, level, false, {
        fileName: "<stdin>",
        lineNumber: 226,
        columnNumber: 9
      }, this)) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 225,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 223,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsx2("div", { className: "field", children: [
      /* @__PURE__ */ jsx2("label", { htmlFor: "target-exam", children: "Target exam" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 229,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx2("select", { id: "target-exam", value: targetValue, onChange: (e) => update("target", e.target.value), children: targetOptions.map((target) => /* @__PURE__ */ jsx2("option", { value: target, children: target }, target, false, {}, this)) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 230,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 228,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsx2("div", { className: "modal-footer", children: [
      /* @__PURE__ */ jsx2("button", { className: "button", onClick: onClose, children: "Cancel" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 240,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx2("button", { className: "button primary", onClick: () => onSave({ ...draft, username: draft.username.trim() || "Student", target: draft.target.trim() || "JEE" }), children: "Save Changes" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 241,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 239,
      columnNumber: 5
    }, this)
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 218,
    columnNumber: 10
  }, this);
}
function TaskModal({ task, onClose, onSave, selectedDate }) {
  const { isNeetMode, subjects: modeSubjects } = useSubjectMode();
  const [draft, setDraft] = useState(task || { title: "", subject: "Physics", customSubject: "", time: "", duration: 45, priority: "Medium", date: selectedDate, revision: false });
  const [custom, setCustom] = useState(Boolean(task?.customSubject || task?.subject && !modeSubjects.includes(task.subject) && !(task.subject === "Maths" && !isNeetMode)));
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const save = (event) => {
    event.preventDefault();
    const subject = custom ? (draft.customSubject || draft.subject || "Other").trim() : draft.subject;
    if (!draft.title.trim()) return;
    onSave({ ...draft, id: draft.id || crypto.randomUUID(), title: draft.title.trim(), subject, customSubject: custom ? subject : "", duration: Math.max(1, Number(draft.duration) || 1), date: draft.date && draft.date !== "custom" ? draft.date : selectedDate });
  };
  return /* @__PURE__ */ jsx2(ModalFrame, { title: task ? "Edit task" : "New task", subtitle: "A small, clear next step.", onClose, children: /* @__PURE__ */ jsx2("form", { onSubmit: save, children: [
    /* @__PURE__ */ jsx2("div", { className: "field", children: [
      /* @__PURE__ */ jsx2("label", { htmlFor: "task-title", children: "Title" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 258,
        columnNumber: 30
      }, this),
      /* @__PURE__ */ jsx2("input", { autoFocus: true, id: "task-title", value: draft.title, onChange: (e) => update("title", e.target.value), placeholder: "e.g. Review rotational motion" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 258,
        columnNumber: 71
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 258,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsx2("div", { className: "field", children: [
      /* @__PURE__ */ jsx2("span", { className: "field-label", children: "Subject" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 260,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsx2("div", { className: "pill-group", children: [
        modeSubjects.map((subject) => /* @__PURE__ */ jsx2("button", { type: "button", className: `pill-choice ${!custom && (draft.subject === subject || !isNeetMode && subject === "Mathematics" && draft.subject === "Maths") ? "selected" : ""}`, onClick: () => {
          setCustom(false);
          update("subject", subject);
        }, children: subject }, subject, false, {
          fileName: "<stdin>",
          lineNumber: 261,
          columnNumber: 64
        }, this)),
        /* @__PURE__ */ jsx2("button", { type: "button", className: `pill-choice ${custom ? "selected" : ""}`, onClick: () => setCustom(true), children: "Custom" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 262,
          columnNumber: 11
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 261,
        columnNumber: 9
      }, this),
      custom && /* @__PURE__ */ jsx2("input", { style: { marginTop: 9 }, value: draft.customSubject || (!modeSubjects.includes(draft.subject) && !(draft.subject === "Maths" && !isNeetMode) ? draft.subject : ""), onChange: (e) => update("customSubject", e.target.value), placeholder: "Your subject" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 264,
        columnNumber: 20
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 259,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsx2("div", { className: "field-row", children: [
      /* @__PURE__ */ jsx2("div", { className: "field", children: [
        /* @__PURE__ */ jsx2("label", { htmlFor: "task-date", children: "When" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 267,
          columnNumber: 32
        }, this),
        /* @__PURE__ */ jsx2("select", { id: "task-date", value: draft.date || selectedDate, onChange: (e) => update("date", e.target.value), children: [
          /* @__PURE__ */ jsx2("option", { value: dateKey(), children: "Today" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 268,
            columnNumber: 11
          }, this),
          /* @__PURE__ */ jsx2("option", { value: dateKey(addDays(/* @__PURE__ */ new Date(), 1)), children: "Tomorrow" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 269,
            columnNumber: 11
          }, this),
          /* @__PURE__ */ jsx2("option", { value: draft.date && ![dateKey(), dateKey(addDays(/* @__PURE__ */ new Date(), 1))].includes(draft.date) ? draft.date : "custom", children: "Custom date" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 270,
            columnNumber: 11
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 267,
          columnNumber: 71
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 267,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsx2("div", { className: "field", children: [
        /* @__PURE__ */ jsx2("label", { htmlFor: "task-time", children: "Time" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 272,
          columnNumber: 32
        }, this),
        /* @__PURE__ */ jsx2("input", { id: "task-time", type: "time", value: draft.time || "", onChange: (e) => update("time", e.target.value) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 272,
          columnNumber: 71
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 272,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 266,
      columnNumber: 7
    }, this),
    draft.date === "custom" && /* @__PURE__ */ jsx2("div", { className: "field", children: [
      /* @__PURE__ */ jsx2("label", { htmlFor: "custom-date", children: "Choose date" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 274,
        columnNumber: 58
      }, this),
      /* @__PURE__ */ jsx2("input", { id: "custom-date", type: "date", onChange: (e) => update("date", e.target.value) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 274,
        columnNumber: 106
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 274,
      columnNumber: 35
    }, this),
    /* @__PURE__ */ jsx2("div", { className: "field-row", children: [
      /* @__PURE__ */ jsx2("div", { className: "field", children: [
        /* @__PURE__ */ jsx2("label", { htmlFor: "task-duration", children: "Duration (minutes)" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 276,
          columnNumber: 32
        }, this),
        /* @__PURE__ */ jsx2("input", { id: "task-duration", type: "number", min: "1", max: "600", value: draft.duration, onChange: (e) => update("duration", e.target.value) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 276,
          columnNumber: 89
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 276,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsx2("div", { className: "field", children: [
        /* @__PURE__ */ jsx2("span", { className: "field-label", children: "Priority" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 277,
          columnNumber: 32
        }, this),
        /* @__PURE__ */ jsx2("div", { className: "pill-group", children: ["Low", "Medium", "High"].map((level) => /* @__PURE__ */ jsx2("button", { type: "button", className: `pill-choice ${draft.priority === level ? "selected" : ""}`, onClick: () => update("priority", level), children: level }, level, false, {
          fileName: "<stdin>",
          lineNumber: 278,
          columnNumber: 11
        }, this)) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 277,
          columnNumber: 77
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 277,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 275,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsx2("div", { className: "modal-footer", children: [
      /* @__PURE__ */ jsx2("button", { type: "button", className: "button", onClick: onClose, children: "Cancel" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 281,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsx2("button", { className: "button primary", type: "submit", children: task ? "Save task" : "Add task" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 282,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 280,
      columnNumber: 7
    }, this)
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 257,
    columnNumber: 5
  }, this) }, void 0, false, {
    fileName: "<stdin>",
    lineNumber: 256,
    columnNumber: 10
  }, this);
}
function FocusModal({ task, onClose, onComplete }) {
  const [minutes, setMinutes] = useState(25);
  const [custom, setCustom] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const totalSeconds = minutes * 60;
  useEffect(() => {
    if (!isRunning) return void 0;
    const timerId = window.setInterval(() => setSecondsLeft((seconds) => {
      if (seconds <= 1) {
        window.clearInterval(timerId);
        setIsRunning(false);
        onComplete(minutes);
        return 0;
      }
      return seconds - 1;
    }), 1e3);
    return () => window.clearInterval(timerId);
  }, [isRunning, minutes, onComplete]);
  const chooseMinutes = (value) => {
    const amount = Math.min(240, Math.max(1, Number(value) || 25));
    setMinutes(amount);
    setSecondsLeft(amount * 60);
    setIsRunning(false);
  };
  const progress = totalSeconds ? (totalSeconds - secondsLeft) / totalSeconds : 0;
  const circumference = 2 * Math.PI * 89;
  const label = `${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(secondsLeft % 60).padStart(2, "0")}`;
  return /* @__PURE__ */ jsx2(ModalFrame, { title: "Focus session", subtitle: task ? React.createElement(React.Fragment, null, "A quiet stretch for ", React.createElement("strong", { className: "timer-topic" }, task.title)) : "Settle into a focused study session.", onClose, narrow: true, children: [
    /* @__PURE__ */ jsx2("div", { className: "timer-topline", children: isRunning ? "You're in the zone" : "Choose a duration" }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 315,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsx2("div", { className: "timer-ring-wrap", children: /* @__PURE__ */ jsx2("div", { className: "timer-ring", children: [
      /* @__PURE__ */ jsx2("svg", { viewBox: "0 0 200 200", "aria-hidden": "true", children: [
        /* @__PURE__ */ jsx2("circle", { className: "track", cx: "100", cy: "100", r: "89" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 317,
          columnNumber: 53
        }, this),
        /* @__PURE__ */ jsx2("circle", { className: "progress", cx: "100", cy: "100", r: "89", strokeDasharray: circumference, strokeDashoffset: circumference * (1 - progress) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 317,
          columnNumber: 106
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 317,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx2("div", { children: [
        /* @__PURE__ */ jsx2("div", { className: "timer-value", children: label }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 318,
          columnNumber: 12
        }, this),
        /* @__PURE__ */ jsx2("div", { className: "timer-state", children: isRunning ? "focus time" : "ready when you are" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 318,
          columnNumber: 54
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 318,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 316,
      columnNumber: 38
    }, this) }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 316,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsx2("div", { className: "preset-row", children: [
      [25, 50, 90, 120].map((preset) => /* @__PURE__ */ jsx2("button", { disabled: isRunning, className: `preset-button ${minutes === preset ? "selected" : ""}`, onClick: () => {
        setCustom("");
        chooseMinutes(preset);
      }, children: [
        preset,
        "m"
      ] }, preset, true, {
        fileName: "<stdin>",
        lineNumber: 320,
        columnNumber: 68
      }, this)),
      /* @__PURE__ */ jsx2("input", { className: "custom-minutes", type: "number", min: "1", max: "240", disabled: isRunning, placeholder: "Custom min", value: custom, onChange: (e) => {
        setCustom(e.target.value);
        if (e.target.value) chooseMinutes(e.target.value);
      }, "aria-label": "Custom minutes" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 321,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 320,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsx2("div", { className: "timer-actions", children: /* @__PURE__ */ jsx2("button", { className: "button primary", style: { minWidth: 145, minHeight: 42 }, onClick: () => {
      if (secondsLeft === 0) chooseMinutes(minutes);
      setIsRunning((running) => !running);
    }, children: isRunning ? "Pause session" : "Start session" }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 323,
      columnNumber: 36
    }, this) }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 323,
      columnNumber: 5
    }, this)
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 314,
    columnNumber: 10
  }, this);
}
function PlannerModal({ onClose, onSave, date }) {
  const [intention, setIntention] = useState("");
  return /* @__PURE__ */ jsx2(ModalFrame, { title: "Plan your day", subtitle: dateLabel(/* @__PURE__ */ new Date(`${date}T12:00:00`)), onClose, narrow: true, children: [
    /* @__PURE__ */ jsx2("div", { className: "field", children: [
      /* @__PURE__ */ jsx2("label", { htmlFor: "intention", children: "Today's intention" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 330,
        columnNumber: 28
      }, this),
      /* @__PURE__ */ jsx2("textarea", { id: "intention", autoFocus: true, value: intention, onChange: (e) => setIntention(e.target.value), placeholder: "What would make today feel meaningful?" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 330,
        columnNumber: 80
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 330,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsx2("div", { className: "modal-footer", children: [
      /* @__PURE__ */ jsx2("button", { className: "button", onClick: onClose, children: "Cancel" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 331,
        columnNumber: 35
      }, this),
      /* @__PURE__ */ jsx2("button", { className: "button primary", onClick: () => onSave(intention), children: "Save intention" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 331,
        columnNumber: 95
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 331,
      columnNumber: 5
    }, this)
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 329,
    columnNumber: 10
  }, this);
}
function ImportModal({ onClose, onImport, startDate = dateKey() }) {
  const [error, setError] = useState("");
  const [filename, setFilename] = useState("");
  const parse = (raw) => {
    const source = String(raw || "").replace(/^\uFEFF/, "");
    const firstLine = source.split(/\r?\n/, 1)[0] || "";
    const delimiter = firstLine.includes("\t") ? "\t" : ",";
    const rows = [];
    let row = [], cell = "", quoted = false;
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (character === '"') {
        if (quoted && source[index + 1] === '"') { cell += '"'; index += 1; }
        else quoted = !quoted;
      } else if (!quoted && character === delimiter) {
        row.push(cell); cell = "";
      } else if (!quoted && (character === "\n" || character === "\r")) {
        if (character === "\r" && source[index + 1] === "\n") index += 1;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += character;
    }
    if (quoted) throw new Error("The CSV has an unclosed quoted field.");
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    const cleanRows = rows.map((cells) => cells.map((value) => String(value).trim())).filter((cells) => cells.some(Boolean));
    if (!cleanRows.length) throw new Error("The selected file has no task rows.");
    const header = cleanRows[0].map((value) => value.toLowerCase());
    const titlePattern = /^(title|task|task name|name)$/;
    const hasHeader = header.some((value) => titlePattern.test(value));
    const dataRows = hasHeader ? cleanRows.slice(1) : cleanRows;
    const titleIndex = hasHeader ? header.findIndex((value) => titlePattern.test(value)) : 0;
    const durationIndex = hasHeader ? header.findIndex((value) => /duration|minutes|min/.test(value)) : 1;
    const subjectIndex = hasHeader ? header.findIndex((value) => /subject/.test(value)) : 2;
    const dayIndex = hasHeader ? header.findIndex((value) => /^day(?: number)?$/.test(value)) : -1;
    const dateIndex = hasHeader ? header.findIndex((value) => /^(date|task date|study date)$/.test(value)) : -1;
    const parsedRows = [];
    let currentDay = null;
    dataRows.forEach((cells, index) => {
      const headingDay = dayIndex < 0 && /^day\s+(\d+)$/i.test(cells[titleIndex] || "") && cells.slice(1).every((value) => !value.trim()) ? Number(cells[titleIndex].match(/\d+/)?.[0]) : null;
      if (headingDay) { currentDay = headingDay; return; }
      const embeddedDay = String(cells[titleIndex] || "").match(/\bday\s+(\d+)\b/i)?.[1];
      const explicitDay = dayIndex >= 0 ? Number(String(cells[dayIndex] || "").match(/\d+/)?.[0]) || Number(embeddedDay || currentDay) : Number(embeddedDay || currentDay);
      const dateValue = dateIndex >= 0 ? String(cells[dateIndex] || "").trim() : "";
      let explicitDate = "";
      const isoDate = dateValue.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      const slashDate = dateValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (isoDate) {
        const [, year, month, day] = isoDate;
        const parsed = new Date(Number(year), Number(month) - 1, Number(day));
        if (parsed.getFullYear() === Number(year) && parsed.getMonth() === Number(month) - 1 && parsed.getDate() === Number(day)) explicitDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      } else if (slashDate) {
        let [, first, second, year] = slashDate;
        let month = Number(first), day = Number(second);
        if (month > 12 && day <= 12) [day, month] = [month, day];
        const parsed = new Date(Number(year), month - 1, day);
        if (parsed.getFullYear() === Number(year) && parsed.getMonth() === month - 1 && parsed.getDate() === day) explicitDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
      const title = String(cells[titleIndex] || "").trim();
      if (title && !/^day\s+\d+$/i.test(title)) parsedRows.push({ cells, index, explicitDay: Number.isFinite(explicitDay) && explicitDay > 0 ? explicitDay : null, explicitDate });
    });
    const explicitDays = parsedRows.map((item) => item.explicitDay).filter(Number.isFinite);
    const explicitDates = [...new Set(parsedRows.map((item) => item.explicitDate).filter(Boolean))].sort();
    const dayCount = explicitDays.length ? Math.max(...explicitDays) : explicitDates.length ? Math.max(1, Math.round((new Date(`${explicitDates.at(-1)}T12:00:00`) - new Date(`${explicitDates[0]}T12:00:00`)) / 864e5) + 1) : Math.max(1, Math.ceil(parsedRows.length / 5));
    const tasks = parsedRows.map(({ cells, index, explicitDay, explicitDate }) => {
      const title = String(cells[titleIndex] || "").trim();
      const durationValue = durationIndex >= 0 ? cells[durationIndex] : "";
      const duration = Number(String(durationValue || "45").replace(/[^0-9.]/g, "")) || 45;
      const subject = canonicalSubject(subjectIndex >= 0 ? cells[subjectIndex] || "Physics" : "Physics");
      const dayOffset = explicitDay ? explicitDay - 1 : Math.min(dayCount - 1, Math.floor(index / 5));
      return { id: crypto.randomUUID(), title, duration, subject: subject === "Other" ? "Physics" : subject, date: explicitDate || dateKey(addDays(new Date(`${startDate}T12:00:00`), dayOffset)), priority: "Medium", completed: false };
    });
    if (!tasks.length) throw new Error("No task titles were found. Use a Title or Task column, or put task names in the first column.");
    onImport(tasks, dayCount);
  };
  const readFile = (file) => {
    if (!file) return;
    setFilename(file.name);
    setError("");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        parse(String(reader.result || ""));
      } catch (e) {
        setError(e.message);
      }
    };
    reader.onerror = () => setError("The file could not be read. Please try another CSV or TXT file.");
    reader.readAsText(file);
  };
  return /* @__PURE__ */ jsx(ModalFrame, { title: "Import tasks", subtitle: "Choose a CSV or TXT file with task names, subjects, and optional dates.", onClose, narrow: true, children: [
    /* @__PURE__ */ jsx("div", { className: "csv-import-drop", children: [
      /* @__PURE__ */ jsx("input", { type: "file", accept: ".csv,.txt,text/csv,text/plain", onChange: (event) => readFile(event.target.files?.[0]) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 804,
        columnNumber: 38
      }, this),
      /* @__PURE__ */ jsx("strong", { children: filename || "Choose a .csv or .txt file" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 804,
        columnNumber: 153
      }, this),
      /* @__PURE__ */ jsx("span", { children: "Rows are assigned to study days in groups of five." }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 804,
        columnNumber: 212
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 804,
      columnNumber: 5
    }, this),
    error && /* @__PURE__ */ jsx("p", { className: "upload-error", role: "alert", children: error }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 805,
      columnNumber: 15
    }, this),
    /* @__PURE__ */ jsx("div", { className: "modal-footer", children: /* @__PURE__ */ jsx("button", { className: "button", onClick: onClose, children: "Close" }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 806,
      columnNumber: 35
    }, this) }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 806,
      columnNumber: 5
    }, this)
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 803,
    columnNumber: 10
  }, this);
}
function TaskRow({ task, onToggle, onFocus, onEdit, onDelete, onAddPatch, showPatchActions = false }) {
  const { isNeetMode } = useSubjectMode();
  const [menuOpen, setMenuOpen] = useState(false);
  return /* @__PURE__ */ jsx2("article", { className: `task-row ${menuOpen ? "menu-open" : ""}`, children: [
    /* @__PURE__ */ jsx2("button", { "aria-label": task.completed ? "Mark incomplete" : "Mark complete", className: `task-check ${task.completed ? "checked" : ""}`, onClick: () => onToggle(task.id), children: task.completed && /* @__PURE__ */ jsx2(Check, { size: 13, strokeWidth: 3 }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 358,
      columnNumber: 192
    }, this) }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 358,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsx2("div", { className: "task-copy", onClick: () => onFocus(task), children: [
      /* @__PURE__ */ jsx2("h3", { className: `task-title ${task.completed ? "done" : ""}`, children: task.title }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 360,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx2("div", { className: "task-meta", children: [
        /* @__PURE__ */ jsx2("span", { className: "subject-pill", children: canonicalSubject(task.subject) === "Mathematics" ? isNeetMode ? "Biology" : "Maths" : task.subject || "Study" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 361,
          columnNumber: 34
        }, this),
        /* @__PURE__ */ jsx2("span", { className: `priority-dot ${(task.priority || "Medium").toLowerCase()}` }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 361,
          columnNumber: 158
        }, this),
        /* @__PURE__ */ jsx2("span", { children: task.priority || "Medium" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 361,
          columnNumber: 238
        }, this),
        /* @__PURE__ */ jsx2("span", { className: "task-time", children: [
          /* @__PURE__ */ jsx2(Clock3, { size: 11 }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 361,
            columnNumber: 306
          }, this),
          scheduleLabel(task)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 361,
          columnNumber: 278
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 361,
        columnNumber: 7
      }, this),
      showPatchActions && /* @__PURE__ */ jsx2("div", { className: "task-patch-actions", children: [
        /* @__PURE__ */ jsx2("button", { onClick: (event) => {
          event.stopPropagation();
          onAddPatch(task, "Concept");
        }, children: [
          /* @__PURE__ */ jsx2(Plus, { size: 11 }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 363,
            columnNumber: 96
          }, this),
          "Weak concept"
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 363,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsx2("button", { onClick: (event) => {
          event.stopPropagation();
          onAddPatch(task, "Formula");
        }, children: [
          /* @__PURE__ */ jsx2(Plus, { size: 11 }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 364,
            columnNumber: 96
          }, this),
          "Formula"
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 364,
          columnNumber: 9
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 362,
        columnNumber: 28
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 359,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsx2("div", { className: "task-menu-wrap", children: [
      /* @__PURE__ */ jsx2("button", { className: "menu-trigger", "aria-label": "Task options", onClick: (e) => {
        e.stopPropagation();
        setMenuOpen((open) => !open);
      }, children: /* @__PURE__ */ jsx2(MoreHorizontal, { size: 19 }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 368,
        columnNumber: 138
      }, this) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 368,
        columnNumber: 7
      }, this),
      menuOpen && /* @__PURE__ */ jsx2("div", { className: "dropdown", children: [
        /* @__PURE__ */ jsx2("button", { onClick: () => {
          setMenuOpen(false);
          onEdit(task);
        }, children: [
          /* @__PURE__ */ jsx2(Pencil, { size: 13 }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 370,
            columnNumber: 71
          }, this),
          "Edit task"
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 370,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsx2("button", { className: "danger", onClick: () => {
          setMenuOpen(false);
          onDelete(task.id);
        }, children: [
          /* @__PURE__ */ jsx2(Trash2, { size: 13 }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 371,
            columnNumber: 95
          }, this),
          "Delete task"
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 371,
          columnNumber: 9
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 369,
        columnNumber: 20
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 367,
      columnNumber: 5
    }, this)
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 357,
    columnNumber: 10
  }, this);
}
function WeeklyChart({ dailyMinutes, large = false }) {
  const today = /* @__PURE__ */ new Date();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const values = days.map((date) => Number(dailyMinutes[dateKey(date)] || 0));
  const maximum = Math.max(60, ...values);
  return /* @__PURE__ */ jsx2("div", { className: "chart", style: large ? { height: 210 } : void 0, children: days.map((date, index) => /* @__PURE__ */ jsx2("div", { className: "chart-column", children: [
    /* @__PURE__ */ jsx2("div", { className: `chart-bar ${index === 6 ? "today" : ""}`, style: { height: `${Math.max(values[index] ? 8 : 4, values[index] / maximum * (large ? 165 : 72))}px` }, title: `${values[index]} study minutes` }, `bar-${dateKey(date)}`, false, {
      fileName: "<stdin>",
      lineNumber: 383,
      columnNumber: 82
    }, this),
    /* @__PURE__ */ jsx2("span", { className: "chart-label", children: new Intl.DateTimeFormat("en", { weekday: "narrow" }).format(date) }, `label-${dateKey(date)}`, false, {
      fileName: "<stdin>",
      lineNumber: 383,
      columnNumber: 289
    }, this)
  ] }, dateKey(date), true, {
    fileName: "<stdin>",
    lineNumber: 383,
    columnNumber: 32
  }, this)) }, void 0, false, {
    fileName: "<stdin>",
    lineNumber: 382,
    columnNumber: 10
  }, this);
}
function DailyCadence({ dailyMinutes }) {
  const today = /* @__PURE__ */ new Date();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const values = days.map((date) => Number(dailyMinutes[dateKey(date)] || 0));
  const max = Math.max(60, ...values);
  const average = Math.round(values.reduce((sum, value) => sum + value, 0) / 7);
  return /* @__PURE__ */ jsx2("div", { className: "cadence-chart-wrap", children: [
    /* @__PURE__ */ jsx2("div", { className: "cadence-summary", children: [
      /* @__PURE__ */ jsx2("span", { children: "Daily focus output" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 394,
        columnNumber: 38
      }, this),
      /* @__PURE__ */ jsx2("strong", { children: [
        average,
        "m ",
        /* @__PURE__ */ jsx2("small", { children: "avg/day" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 394,
          columnNumber: 88
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 394,
        columnNumber: 69
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 394,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsx2("div", { className: "cadence-chart", children: values.map((value, index) => /* @__PURE__ */ jsx2("div", { className: "cadence-column", children: [
      /* @__PURE__ */ jsx2("span", { className: "cadence-value", children: value ? `${(value / 60).toFixed(1)}h` : "\u2014" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 396,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx2("div", { className: `cadence-bar ${index === 6 ? "today" : ""}`, style: { height: `${Math.max(value ? 7 : 4, value / max * 150)}px` }, title: `${(value / 60).toFixed(2)} focus hours` }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 397,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx2("span", { className: "cadence-label", children: [
        "D",
        index + 1
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 398,
        columnNumber: 7
      }, this)
    ] }, dateKey(days[index]), true, {
      fileName: "<stdin>",
      lineNumber: 395,
      columnNumber: 66
    }, this)) }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 395,
      columnNumber: 5
    }, this)
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 393,
    columnNumber: 10
  }, this);
}
function subjectTotals(appState, isNeetMode = false) {
  const totals = Object.fromEntries((isNeetMode ? NEET_SUBJECTS : JEE_SUBJECTS).map((subject) => [subject, 0]));
  for (const bySubject of Object.values(appState.dailySubjectMinutes || {})) {
    for (const [subject, minutes] of Object.entries(bySubject || {})) {
      if (Object.hasOwn(totals, subject)) totals[subject] += Number(minutes) || 0;
    }
  }
  if (Object.values(totals).every((value) => value === 0)) {
    for (const task of appState.tasks || []) {
      if (!task.completed) continue;
      const subject = canonicalSubject(task.subject);
      if (Object.hasOwn(totals, subject)) totals[subject] += Number(task.duration) || 0;
    }
    for (const session of appState.sessions || []) {
      const task = (appState.tasks || []).find((item) => item.id === session.taskId);
      const subject = canonicalSubject(session.subject || task?.subject);
      if (Object.hasOwn(totals, subject)) totals[subject] += Number(session.minutes) || 0;
    }
  }
  return totals;
}
function PatchEntryModal({ initial, onClose, onSave }) {
  const { subjects: modeSubjects } = useSubjectMode();
  const [title, setTitle] = useState(initial?.title || "");
  const [subject, setSubject] = useState(initial?.subject || "Physics");
  const [category, setCategory] = useState(initial?.category || "Concept");
  return /* @__PURE__ */ jsx2(ModalFrame, { title: category === "Formula" ? "Add a formula" : "Log a weak concept", subtitle: "Keep it handy for your next review.", onClose, narrow: true, children: [
    /* @__PURE__ */ jsx2("div", { className: "field", children: [
      /* @__PURE__ */ jsx2("label", { htmlFor: "patch-title", children: category === "Formula" ? "Formula or relation" : "Topic to revisit" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 430,
        columnNumber: 28
      }, this),
      /* @__PURE__ */ jsx2("input", { id: "patch-title", autoFocus: true, value: title, onChange: (event) => setTitle(event.target.value), placeholder: category === "Formula" ? "e.g. v\xB2 = u\xB2 + 2as" : "e.g. Sign convention in optics" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 430,
        columnNumber: 134
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 430,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsx2("div", { className: "field", children: [
      /* @__PURE__ */ jsx2("label", { htmlFor: "patch-subject", children: "Subject" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 431,
        columnNumber: 28
      }, this),
      /* @__PURE__ */ jsx2("select", { id: "patch-subject", value: subject === "Maths" ? "Mathematics" : subject, onChange: (event) => setSubject(event.target.value), children: modeSubjects.map((item) => /* @__PURE__ */ jsx2("option", { value: item, children: item }, item, false, {
        fileName: "<stdin>",
        lineNumber: 431,
        columnNumber: 194
      }, this)) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 431,
        columnNumber: 74
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 431,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsx2("div", { className: "field", children: [
      /* @__PURE__ */ jsx2("span", { className: "field-label", children: "Type" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 432,
        columnNumber: 28
      }, this),
      /* @__PURE__ */ jsx2("div", { className: "pill-group", children: ["Concept", "Formula"].map((item) => /* @__PURE__ */ jsx2("button", { className: `pill-choice ${category === item ? "selected" : ""}`, onClick: () => setCategory(item), children: item }, item, false, {
        fileName: "<stdin>",
        lineNumber: 432,
        columnNumber: 135
      }, this)) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 432,
        columnNumber: 69
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 432,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsx2("div", { className: "modal-footer", children: [
      /* @__PURE__ */ jsx2("button", { className: "button", onClick: onClose, children: "Cancel" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 433,
        columnNumber: 35
      }, this),
      /* @__PURE__ */ jsx2("button", { className: "button primary", disabled: !title.trim(), onClick: () => onSave({ title: title.trim(), subject, category }), children: "Add to Patch list" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 433,
        columnNumber: 95
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 433,
      columnNumber: 5
    }, this)
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 429,
    columnNumber: 10
  }, this);
}
function PatchDetailModal({ item, onClose, onSave }) {
  const { isNeetMode } = useSubjectMode();
  const [notes, setNotes] = useState(item.notes || "");
  const [images, setImages] = useState(Array.isArray(item.images) ? item.images : []);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const addImages = async (event) => {
    const files = [...(event.target.files || [])];
    if (!files.length) return;
    setUploading(true);
    setError("");
    try {
      const additions = [];
      for (const file of files) {
        if (!file.type.startsWith("image/")) continue;
        if (file.size > 15 * 1024 * 1024) throw new Error(`${file.name} is larger than 15 MB.`);
        const url = await readImageDataUrl(file);
        additions.push({ id: crypto.randomUUID(), name: file.name, url });
      }
      setImages((current) => [...current, ...additions]);
    } catch (uploadError) {
      setError(uploadError.message || "Could not upload this image.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };
  return React.createElement(ModalFrame, {
    title: item.title,
    subtitle: `${isNeetMode && ["Maths", "Mathematics"].includes(item.subject) ? "Biology" : item.subject === "Maths" ? "Mathematics" : item.subject} · ${item.category || "Concept"}`,
    onClose
  },
  React.createElement("div", { className: "field patch-detail-notes" },
    React.createElement("label", { htmlFor: "patch-revision-notes" }, "Revision notes"),
    React.createElement("textarea", { id: "patch-revision-notes", autoFocus: true, value: notes, onChange: (event) => setNotes(event.target.value), placeholder: "Write the concepts or formulas you want to revisit…" })
  ),
  React.createElement("section", { className: "patch-attachments" },
    React.createElement("div", { className: "patch-attachments-head" },
      React.createElement("strong", null, "Visual revision"),
      React.createElement("button", { type: "button", className: "button", onClick: () => fileRef.current?.click(), disabled: uploading }, React.createElement(Upload, { size: 14 }), uploading ? "Preparing…" : "Add image"),
      React.createElement("input", { ref: fileRef, className: "sr-only", type: "file", accept: "image/*", multiple: true, onChange: addImages, "aria-label": "Add revision images" })
    ),
    images.length ? React.createElement("div", { className: "patch-attachment-grid" }, images.map((image) => React.createElement("figure", { key: image.id },
      React.createElement(ImageFullView, { src: image.data || image.url, alt: image.name || "Revision attachment" }),
      React.createElement("figcaption", null,
        React.createElement("span", null, image.name || "Image"),
        React.createElement("button", { type: "button", onClick: () => setImages((current) => current.filter((entry) => entry.id !== image.id)), "aria-label": `Remove ${image.name || "image"}` }, "Remove")
      )
    ))) : React.createElement("p", { className: "patch-attachments-empty" }, "Add a reference image, handwritten formula, or diagram.")
  ),
  error && React.createElement("p", { className: "upload-error", role: "alert" }, error),
  React.createElement("div", { className: "modal-footer" },
    React.createElement("button", { className: "button", onClick: onClose }, "Cancel"),
    React.createElement("button", { className: "button primary", onClick: () => onSave({ notes, images }) }, "Save revision")
  ));
}
function DiagnosticCard({ item, onCategory, onConfidence, onResolve, onDelete, onOpen }) {
  const { isNeetMode } = useSubjectMode();
  const [menuOpen, setMenuOpen] = useState(false);
  return /* @__PURE__ */ jsx2("article", { className: `diagnostic-card ${item.resolvedAt ? "resolved" : ""}`, children: [
    /* @__PURE__ */ jsx2("div", { className: "diagnostic-main", children: [
      /* @__PURE__ */ jsx2("div", { className: "diagnostic-title-row diagnostic-open", role: "button", tabIndex: 0, onClick: () => onOpen(item), onKeyDown: (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(item);
        }
      }, "aria-label": `Open revision notes for ${item.title}`, children: [
        /* @__PURE__ */ jsx2("span", { className: "diagnostic-mark", children: /* @__PURE__ */ jsx2(StudyTableIcon, { size: 19 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 440,
          columnNumber: 79
        }, this) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 440,
          columnNumber: 45
        }, this),
        /* @__PURE__ */ jsx2("div", { children: [
          /* @__PURE__ */ jsx2("h3", { title: item.title, children: item.title }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 440,
            columnNumber: 113
          }, this),
          /* @__PURE__ */ jsx2("p", { children: [
            isNeetMode && ["Maths", "Mathematics"].includes(item.subject) ? "Biology" : item.subject === "Maths" ? "Mathematics" : item.subject,
            " \xB7 Added ",
            dateLabel(/* @__PURE__ */ new Date(`${item.createdAt || dateKey()}T12:00:00`))
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 440,
            columnNumber: 134
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 440,
          columnNumber: 108
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 440,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx2("div", { className: "diagnostic-controls", children: [
        /* @__PURE__ */ jsx2("label", { className: "sr-only", htmlFor: `category-${item.id}`, children: "Diagnostic category" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 442,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsx2("select", { id: `category-${item.id}`, className: "diagnostic-select", value: item.category || "Concept", onChange: (event) => onCategory(item.id, event.target.value), children: [
          /* @__PURE__ */ jsx2("option", { children: "Concept" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 443,
            columnNumber: 171
          }, this),
          /* @__PURE__ */ jsx2("option", { children: "Formula" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 443,
            columnNumber: 195
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 443,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsx2("div", { className: "confidence", "aria-label": `Confidence ${item.confidence || 1} of 3`, children: [
          /* @__PURE__ */ jsx2("span", { children: "Confidence" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 445,
            columnNumber: 11
          }, this),
          [1, 2, 3].map((star) => /* @__PURE__ */ jsx2("button", { "aria-label": `${star} of 3 confidence`, className: star <= (item.confidence || 1) ? "lit" : "", onClick: () => onConfidence(item.id, star), children: "\u2605" }, star, false, {
            fileName: "<stdin>",
            lineNumber: 445,
            columnNumber: 59
          }, this))
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 444,
          columnNumber: 9
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 441,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 439,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsx2("div", { className: "diagnostic-action", children: item.queuedTaskId ? /* @__PURE__ */ jsx2("button", { className: "button queued-button", onClick: () => onResolve(item), children: [
      /* @__PURE__ */ jsx2(Check, { size: 13 }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 450,
        columnNumber: 101
      }, this),
      "View queued"
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 450,
      columnNumber: 28
    }, this) : /* @__PURE__ */ jsx2("button", { className: `button ${item.resolvedAt ? "" : "primary"}`, onClick: () => onResolve(item), children: [
      /* @__PURE__ */ jsx2(Timer, { size: 13 }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 451,
        columnNumber: 106
      }, this),
      item.resolvedAt ? "Re-solve again" : "Re-solve"
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 451,
      columnNumber: 9
    }, this) }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 449,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsx2("div", { className: "diagnostic-menu-wrap", children: [
      /* @__PURE__ */ jsx2("button", { className: "menu-trigger", type: "button", "aria-label": `Options for ${item.title}`, "aria-expanded": menuOpen, onClick: () => setMenuOpen((open) => !open), children: /* @__PURE__ */ jsx2(MoreHorizontal, { size: 19 }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 452,
        columnNumber: 132
      }, this) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 452,
        columnNumber: 7
      }, this),
      menuOpen && /* @__PURE__ */ jsx2("div", { className: "dropdown diagnostic-dropdown", children: /* @__PURE__ */ jsx2("button", { className: "danger", type: "button", onClick: () => {
        setMenuOpen(false);
        onDelete(item.id);
      }, children: [
        /* @__PURE__ */ jsx2(Trash2, { size: 13 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 454,
          columnNumber: 72
        }, this),
        "Delete patch"
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 454,
        columnNumber: 59
      }, this) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 454,
        columnNumber: 21
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 452,
      columnNumber: 5
    }, this)
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 438,
    columnNumber: 10
  }, this);
}
function SidebarFutureSlots() {
  return React.createElement("div", { className: "sidebar-future-slots", "aria-hidden": true });
}
function Sidebar({ activeView, onNavigate, onClose, syllabusMode = "mains" }) {
  const { isNeetMode } = useSubjectMode();
  const swipeRef = useRef(null);
  const beginSidebarTouch = (event) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    const now = performance.now();
    swipeRef.current = { startX: touch.clientX, startY: touch.clientY, lastX: touch.clientX, lastTime: now, width: event.currentTarget.clientWidth, active: false };
  };
  const moveSidebarTouch = (event) => {
    const gesture = swipeRef.current;
    if (!gesture || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const dx = touch.clientX - gesture.startX;
    const dy = touch.clientY - gesture.startY;
    if (!gesture.active && Math.abs(dy) > Math.abs(dx)) return;
    if (dx >= 0) return;
    gesture.active = true;
    const moveTime = performance.now();
    gesture.velocity = Math.max(0, gesture.lastX - touch.clientX) / Math.max(1, moveTime - gesture.lastTime);
    gesture.lastX = touch.clientX;
    gesture.lastTime = moveTime;
    const offset = Math.max(-gesture.width, dx);
    const backdrop = event.currentTarget.parentElement;
    backdrop.classList.add("sidebar-swiping");
    event.currentTarget.style.transform = `translate3d(${offset}px, 0, 0)`;
    backdrop.style.opacity = String(1 - Math.min(1, Math.abs(offset) / gesture.width) * 0.68);
    if (event.cancelable) event.preventDefault();
  };
  const finishSidebarTouch = (event, cancelled = false) => {
    const gesture = swipeRef.current;
    swipeRef.current = null;
    if (!gesture?.active) return;
    const touch = event.changedTouches?.[0];
    const endX = touch?.clientX ?? gesture.lastX;
    const distance = gesture.startX - endX;
    const finalDelta = Math.max(0, gesture.lastX - endX);
    const finalVelocity = finalDelta / Math.max(1, performance.now() - gesture.lastTime);
    const velocity = finalDelta ? finalVelocity : gesture.velocity || 0;
    const shouldClose = !cancelled && (distance >= gesture.width * 0.4 || distance >= 28 && velocity >= 0.65);
    const drawer = event.currentTarget;
    const backdrop = drawer.parentElement;
    backdrop.classList.remove("sidebar-swiping");
    if (shouldClose) {
      onClose();
    } else {
      drawer.style.transform = "";
      backdrop.style.opacity = "";
    }
  };
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return /* @__PURE__ */ jsx2("div", { className: "sidebar-backdrop", onClick: (event) => {
    if (event.target === event.currentTarget) onClose();
  }, children: /* @__PURE__ */ jsx2("aside", { className: "sidebar-drawer", "aria-label": "Study navigation", onTouchStart: beginSidebarTouch, onTouchMove: moveSidebarTouch, onTouchEnd: (event) => finishSidebarTouch(event), onTouchCancel: (event) => finishSidebarTouch(event, true), children: [
    /* @__PURE__ */ jsx2("div", { className: "sidebar-header", children: [
      /* @__PURE__ */ jsx2("img", { className: "sidebar-app-icon", src: "/apex-mark.svg", alt: "Apex app icon" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 465,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsx2("div", { className: "sidebar-brand-copy", children: [
      /* @__PURE__ */ jsx2("strong", { children: isNeetMode ? "Apex NEET" : "Apex JEE" }, "sidebar-brand", false, {
          fileName: "<stdin>",
          lineNumber: 466,
          columnNumber: 45
        }, this),
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 466,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsx2("button", { className: "sidebar-brand-mark", onClick: onClose, "aria-label": "Close navigation", children: /* @__PURE__ */ jsx2("svg", { width: 18, height: 18, viewBox: "0 0 32 32", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ jsx2("path", { d: "M4 8h17M4 16h10M4 24h17M28 10l-6 6 6 6", stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }, void 0, false, {}, this) }, void 0, false, {}, this) }, void 0, false, {}, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 464,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsx2("div", { className: "sidebar-group-label", children: "YOUR WORKSPACE" }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 469,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsx2("nav", { className: "sidebar-links", children: SIDEBAR_LINKS.map(({ key, label, badge, note, icon: Icon }) => /* @__PURE__ */ jsx2("button", { className: `sidebar-link ${activeView === key ? "active" : ""}`, onClick: () => onNavigate(key), children: [
      /* @__PURE__ */ jsx2("span", { className: "sidebar-link-icon", children: /* @__PURE__ */ jsx2(Icon, { size: 17 }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 472,
        columnNumber: 47
      }, this) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 472,
        columnNumber: 11
      }, this),
      /* @__PURE__ */ jsx2("span", { className: "sidebar-link-label", children: [
        label,
        note && /* @__PURE__ */ jsx2("small", { children: note }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 473,
          columnNumber: 64
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 473,
        columnNumber: 11
      }, this),
      badge && /* @__PURE__ */ jsx2("span", { className: "sidebar-badge", children: key === "syllabus" ? `${(syllabusMode === "advanced" ? SYLLABUS.advanced : SYLLABUS.mains).length} CH` : badge }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 474,
        columnNumber: 21
      }, this)
    ] }, key, true, {
      fileName: "<stdin>",
      lineNumber: 471,
      columnNumber: 73
    }, this)) }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 470,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsx2(SidebarFutureSlots, {}, void 0, false, { fileName: "<stdin>", lineNumber: 476, columnNumber: 7 }, this),
    /* @__PURE__ */ jsx2("div", { className: "sidebar-bottom", children: [
      /* @__PURE__ */ jsx2("div", { className: "sidebar-bottom-note", children: [
        /* @__PURE__ */ jsx2("span", { className: "sidebar-pulse" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 478,
          columnNumber: 46
        }, this),
        "A calmer way to prepare"
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 478,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsx2("button", { className: `sidebar-link sidebar-settings ${activeView === "settings" ? "active" : ""}`, onClick: () => onNavigate("settings"), children: [
        /* @__PURE__ */ jsx2("span", { className: "sidebar-link-icon", children: /* @__PURE__ */ jsx2(Settings, { size: 17 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 480,
          columnNumber: 47
        }, this) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 480,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsx2("span", { className: "sidebar-link-label", children: "Settings" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 480,
          columnNumber: 76
        }, this),
        /* @__PURE__ */ jsx2(ChevronRight, { size: 15 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 480,
          columnNumber: 128
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 479,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 477,
      columnNumber: 7
    }, this)
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 463,
    columnNumber: 5
  }, this) }, void 0, false, {
    fileName: "<stdin>",
    lineNumber: 462,
    columnNumber: 10
  }, this);
}
function SyncCodeCard({ activeSyncCode, onConnectSync }) {
  const [code, setCode] = useState(activeSyncCode || "");
  const [error, setError] = useState("");
  const submit = (event) => {
    event?.preventDefault();
    if (!/^\d{4,6}$/.test(code)) {
      setError("Enter a code with 4 to 6 digits.");
      return;
    }
    setError("");
    onConnectSync(code);
  };
  return React.createElement("form", { className: "sync-code-card", onSubmit: submit },
    React.createElement("div", { className: "sync-code-copy" },
      React.createElement("strong", null, "Local Profile Code"),
      React.createElement("span", null, "Enter a 4-6 digit code to save and restore a profile in this browser."),
      activeSyncCode ? React.createElement("small", null, `Using local profile ${activeSyncCode}`) : null,
      error ? React.createElement("small", { id: "sync-profile-error", className: "sync-code-error", role: "alert" }, error) : null
    ),
    React.createElement("div", { className: "sync-code-controls" },
      React.createElement("label", { className: "sr-only", htmlFor: "sync-profile-code" }, "4 to 6 digit profile code"),
      React.createElement("input", {
        id: "sync-profile-code",
        type: "text",
        inputMode: "numeric",
        autoComplete: "off",
        pattern: "[0-9]{4,6}",
        maxLength: 6,
        value: code,
        onChange: (event) => { setCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); },
        placeholder: "4-6 digits",
        "aria-describedby": error ? "sync-profile-error" : undefined,
        "aria-invalid": error ? "true" : undefined
      }),
      React.createElement("button", { className: "button primary", type: "submit", disabled: !/^\d{4,6}$/.test(code) }, "Connect / Load")
    )
  );
}
function SettingsPanel({ profile, onProfileChange, settings, onChange, modelPrefs, onModelPrefsChange, onConfirm, onResetDay, activeSyncCode, onConnectSync, onClose }) {
  const set = (key, value) => onChange({ ...settings, [key]: value });
  const updateProfile = (key, value) => onProfileChange({ ...profile, [key]: value });
  const adjustDays = (amount) => set("planLength", Math.min(365, Math.max(1, Number(settings.planLength || 1) + amount)));
  return /* @__PURE__ */ jsx("section", { className: "settings-view profile-settings-view", children: [
    /* @__PURE__ */ jsx("div", { className: "view-heading settings-heading", children: [
      /* @__PURE__ */ jsx("div", { children: [
        /* @__PURE__ */ jsx("p", { className: "eyebrow", children: "YOUR STUDY SPACE" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 1426,
          columnNumber: 57
        }, this),
        /* @__PURE__ */ jsx("h1", { children: "Profile" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 1426,
          columnNumber: 100
        }, this),
        /* @__PURE__ */ jsx("p", { children: "Profile details, appearance, and study plan in one place." }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 1426,
          columnNumber: 116
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 1426,
        columnNumber: 52
      }, this),
      /* @__PURE__ */ jsx("button", { className: "settings-home-button", onClick: onClose, "aria-label": "Close profile", children: /* @__PURE__ */ jsx(X, { size: 18 }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 1426,
        columnNumber: 322
      }, this) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 1426,
        columnNumber: 186
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 1426,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsx("section", { className: "settings-section profile-settings-section", children: [
      /* @__PURE__ */ jsx("div", { className: "settings-section-head", children: [
        /* @__PURE__ */ jsx("div", { children: [
          /* @__PURE__ */ jsx("span", { className: "settings-kicker", children: "Profile" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1429,
            columnNumber: 51
          }, this),
          /* @__PURE__ */ jsx("h2", { children: "Your details" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1429,
            columnNumber: 99
          }, this),
          /* @__PURE__ */ jsx("p", { children: "Personalize your preparation dashboard." }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1429,
            columnNumber: 120
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 1429,
          columnNumber: 46
        }, this),
        /* @__PURE__ */ jsx("div", { className: "settings-section-icon profile-document-icon", children: /* @__PURE__ */ jsx("svg", { viewBox: "0 0 40 40", "aria-hidden": "true", children: [
          /* @__PURE__ */ jsx("rect", { x: "4", y: "4", width: "32", height: "32", rx: "6", fill: "white" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1429,
            columnNumber: 277
          }, this),
          /* @__PURE__ */ jsx("circle", { cx: "14", cy: "15", r: "4", fill: "#8897a6" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1429,
            columnNumber: 339
          }, this),
          /* @__PURE__ */ jsx("path", { d: "M7.5 27c.7-4 2.8-6 6.5-6s5.8 2 6.5 6", fill: "#aab5c0" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1429,
            columnNumber: 385
          }, this),
          /* @__PURE__ */ jsx("path", { d: "M23 13h9M23 18h9M23 24h9M23 28h6", stroke: "#aab5c0", "stroke-width": "1.7", "stroke-linecap": "round" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1429,
            columnNumber: 448
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 1429,
          columnNumber: 233
        }, this) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 1429,
          columnNumber: 172
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 1429,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx("div", { className: "profile-settings-grid", children: [
        /* @__PURE__ */ jsx("label", { className: "field", children: [
          /* @__PURE__ */ jsx("span", { className: "field-label", children: "Name" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1431,
            columnNumber: 34
          }, this),
          /* @__PURE__ */ jsx("input", { type: "text", inputMode: "text", autoComplete: "nickname", autoCapitalize: "off", spellCheck: false, value: profile.username || "", onChange: (event) => updateProfile("username", event.target.value), placeholder: "Your name" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1431,
            columnNumber: 75
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 1431,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsx("div", { className: "field", children: [
          /* @__PURE__ */ jsx("span", { className: "field-label", children: "Class" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1432,
            columnNumber: 32
          }, this),
          /* @__PURE__ */ jsx("div", { className: "pill-group", children: ["Class 11", "Class 12"].map((level) => /* @__PURE__ */ jsx("button", { className: "pill-choice " + (profile.classLevel === level ? "selected" : ""), onClick: () => updateProfile("classLevel", level), children: level }, level, false, {
            fileName: "<stdin>",
            lineNumber: 1432,
            columnNumber: 143
          }, this)) }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1432,
            columnNumber: 74
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 1432,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsx("label", { className: "field", children: [
          /* @__PURE__ */ jsx("span", { className: "field-label", children: "Target exam" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1433,
            columnNumber: 34
          }, this),
          /* @__PURE__ */ jsx("select", { value: profile.target === "JEE" || profile.target === "JEE Main + Advanced" ? "JEE Mains + Advanced" : profile.target === "JEE Main" ? "JEE Mains" : profile.target || "JEE Mains + Advanced", onChange: (event) => updateProfile("target", event.target.value), children: [
            /* @__PURE__ */ jsx("option", { children: "JEE Mains" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1433,
              columnNumber: 347
            }, this),
            /* @__PURE__ */ jsx("option", { children: "JEE Advanced" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1433,
              columnNumber: 373
            }, this),
            /* @__PURE__ */ jsx("option", { children: "JEE Mains + Advanced" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1433,
              columnNumber: 402
            }, this),
            /* @__PURE__ */ jsx("option", { children: "NEET" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1433,
              columnNumber: 432
            }, this),
            /* @__PURE__ */ jsx("option", { children: "BOARDS" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1433,
              columnNumber: 455
            }, this),
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 1433,
            columnNumber: 82
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 1433,
          columnNumber: 9
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 1430,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 1428,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsx("section", { className: "settings-section", children: [
      /* @__PURE__ */ jsx("div", { className: "settings-section-head", children: [
        /* @__PURE__ */ jsx("div", { children: [
          /* @__PURE__ */ jsx("span", { className: "settings-kicker", children: "Appearance" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1439,
            columnNumber: 51
          }, this),
          /* @__PURE__ */ jsx("h2", { children: "Themes & appearance" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1439,
            columnNumber: 102
          }, this),
          /* @__PURE__ */ jsx("p", { children: "Choose a palette and reading style." }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1439,
            columnNumber: 130
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 1439,
          columnNumber: 46
        }, this),
        /* @__PURE__ */ jsx("div", { className: "settings-section-icon", children: /* @__PURE__ */ jsx(Paintbrush, { size: 16 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 1439,
          columnNumber: 217
        }, this) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 1439,
          columnNumber: 178
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 1439,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx("div", { className: "theme-grid", role: "radiogroup", "aria-label": "Theme palettes", children: THEMES.map((theme) => /* @__PURE__ */ jsx("button", { role: "radio", "aria-checked": (settings.theme === theme.id || (["amber", "cosmic"].includes(settings.theme) && theme.id === "warm-orange") || (settings.theme === "galaxy" && theme.id === "mesh-gradient")), className: "theme-card theme-card-" + theme.id + " " + (settings.theme === theme.id || (["amber", "cosmic"].includes(settings.theme) && theme.id === "warm-orange") || (settings.theme === "galaxy" && theme.id === "mesh-gradient") ? "selected" : ""), onClick: () => onChange({ ...settings, theme: theme.id }), children: [
        /* @__PURE__ */ jsx("span", { className: "theme-swatches", children: theme.colors.map((color, index) => /* @__PURE__ */ jsx("i", { style: { background: color } }, index, false, {
          fileName: "<stdin>",
          lineNumber: 1440,
          columnNumber: 387
        }, this)) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 1440,
          columnNumber: 318
        }, this),
        /* @__PURE__ */ jsx("span", { className: "theme-card-name", children: theme.name }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 1440,
          columnNumber: 442
        }, this),
        /* @__PURE__ */ jsx("span", { className: "theme-radio", children: (settings.theme === theme.id || (["amber", "cosmic"].includes(settings.theme) && theme.id === "warm-orange") || (settings.theme === "galaxy" && theme.id === "mesh-gradient")) && /* @__PURE__ */ jsx(Check, { size: 11 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 1440,
          columnNumber: 557
        }, this) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 1440,
          columnNumber: 495
        }, this)
      ] }, theme.id, true, {
        fileName: "<stdin>",
        lineNumber: 1440,
        columnNumber: 104
      }, this)) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 1440,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx("div", { className: "setting-controls", children: [
        /* @__PURE__ */ jsx("div", { className: "setting-row", children: [
          /* @__PURE__ */ jsx("div", { className: "setting-copy", children: [
            /* @__PURE__ */ jsx("strong", { children: "Display mode" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1442,
              columnNumber: 68
            }, this),
            /* @__PURE__ */ jsx("span", { children: "Choose a light or dark interface." }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1442,
              columnNumber: 97
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 1442,
            columnNumber: 38
          }, this),
          /* @__PURE__ */ jsx("div", { className: "mode-control", children: [
            /* @__PURE__ */ jsx("button", { className: settings.mode === "light" ? "selected" : "", onClick: () => set("mode", "light"), children: [
              /* @__PURE__ */ jsx(Sun, { size: 14 }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 1442,
                columnNumber: 280
              }, this),
              "Light"
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 1442,
              columnNumber: 179
            }, this),
            /* @__PURE__ */ jsx("button", { className: settings.mode === "dark" ? "selected" : "", onClick: () => set("mode", "dark"), children: [
              /* @__PURE__ */ jsx(Moon, { size: 14 }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 1442,
                columnNumber: 409
              }, this),
              "Dark"
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 1442,
              columnNumber: 310
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 1442,
            columnNumber: 149
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 1442,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsx("div", { className: "setting-row", children: [
          /* @__PURE__ */ jsx("div", { className: "setting-copy", children: [
            /* @__PURE__ */ jsx("strong", { children: "High Contrast" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1443,
              columnNumber: 68
            }, this),
            /* @__PURE__ */ jsx("span", { children: "Increase text and border contrast." }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1443,
              columnNumber: 98
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 1443,
            columnNumber: 38
          }, this),
          /* @__PURE__ */ jsx("div", { className: "contrast-toggle-wrap", children: [
            /* @__PURE__ */ jsx("button", { role: "switch", "aria-checked": Boolean(settings.highContrast), className: "switch " + (settings.highContrast ? "on" : ""), onClick: () => set("highContrast", !settings.highContrast), children: /* @__PURE__ */ jsx("span", {}, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1443,
              columnNumber: 377
            }, this) }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1443,
              columnNumber: 189
            }, this),
            /* @__PURE__ */ jsx("small", { className: settings.highContrast ? "contrast-status on" : "contrast-status", children: settings.highContrast ? "On" : "Off" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1443,
              columnNumber: 393
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 1443,
            columnNumber: 151
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 1443,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsx("div", { className: "setting-row font-row", children: [
          /* @__PURE__ */ jsx("div", { className: "setting-copy", children: [
            /* @__PURE__ */ jsx("strong", { children: "Font size" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1444,
              columnNumber: 77
            }, this),
            /* @__PURE__ */ jsx("span", { children: "Adjust reading size across the app." }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1444,
              columnNumber: 103
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 1444,
            columnNumber: 47
          }, this),
          /* @__PURE__ */ jsx("div", { className: "font-control", role: "radiogroup", "aria-label": "Font size", children: ["small", "medium", "large"].map((size) => /* @__PURE__ */ jsx("button", { role: "radio", "aria-checked": settings.fontSize === size, className: settings.fontSize === size ? "selected" : "", onClick: () => set("fontSize", size), children: [
            /* @__PURE__ */ jsx(Type, { size: size === "small" ? 13 : size === "large" ? 18 : 15 }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1444,
              columnNumber: 441
            }, this),
            size
          ] }, size, true, {
            fileName: "<stdin>",
            lineNumber: 1444,
            columnNumber: 272
          }, this)) }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1444,
            columnNumber: 157
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 1444,
          columnNumber: 9
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 1441,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 1438,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsx("section", { className: "settings-section", children: [
      /* @__PURE__ */ jsx("div", { className: "settings-section-head", children: [
        /* @__PURE__ */ jsx("div", { children: [
          /* @__PURE__ */ jsx("span", { className: "settings-kicker", children: "Settings" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1449,
            columnNumber: 51
          }, this),
          /* @__PURE__ */ jsx("h2", { children: "AI connection" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1449,
            columnNumber: 100
          }, this),
          /* @__PURE__ */ jsx("p", { children: "Add provider keys for Apex Assistant, Memory Recall, and exam planning." }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1449,
            columnNumber: 122
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 1449,
          columnNumber: 46
        }, this),
        /* @__PURE__ */ jsx("div", { className: "settings-section-icon", children: /* @__PURE__ */ jsx(SlidersHorizontal, { size: 16 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 1449,
          columnNumber: 242
        }, this) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 1449,
          columnNumber: 203
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 1449,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx(ApiKeySettings, { modelPrefs, onModelPrefsChange, embedded: true }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 1450,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 1448,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsx("section", { className: "settings-section", children: [
      /* @__PURE__ */ jsx("div", { className: "settings-section-head", children: [
        /* @__PURE__ */ jsx("div", { children: [
          /* @__PURE__ */ jsx("span", { className: "settings-kicker", children: "Study plan" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1454,
            columnNumber: 51
          }, this),
          /* @__PURE__ */ jsx("h2", { children: "Plan length" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1454,
            columnNumber: 102
          }, this),
          /* @__PURE__ */ jsx("p", { children: "Set the duration and start date for your study days." }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1454,
            columnNumber: 122
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 1454,
          columnNumber: 46
        }, this),
        /* @__PURE__ */ jsx("div", { className: "settings-section-icon", children: /* @__PURE__ */ jsx(CalendarDays, { size: 16 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 1454,
          columnNumber: 226
        }, this) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 1454,
          columnNumber: 187
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 1454,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx("div", { className: "plan-settings-grid", children: [
        /* @__PURE__ */ jsx("div", { className: "plan-setting-card", children: [
          /* @__PURE__ */ jsx("div", { className: "setting-copy", children: [
            /* @__PURE__ */ jsx("strong", { children: "Plan length" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1456,
              columnNumber: 74
            }, this),
            /* @__PURE__ */ jsx("span", { children: "Number of study days in your plan." }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1456,
              columnNumber: 102
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 1456,
            columnNumber: 44
          }, this),
          /* @__PURE__ */ jsx("div", { className: "stepper", children: [
            /* @__PURE__ */ jsx("button", { "aria-label": "Decrease plan length", onClick: () => adjustDays(-1), disabled: Number(settings.planLength) <= 1, children: "\u2212" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1456,
              columnNumber: 180
            }, this),
            /* @__PURE__ */ jsx("label", { className: "sr-only", htmlFor: "plan-length", children: "Plan length in days" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1456,
              columnNumber: 307
            }, this),
            /* @__PURE__ */ jsx("input", { id: "plan-length", type: "number", min: "1", max: "365", value: settings.planLength, onChange: (event) => set("planLength", Math.min(365, Math.max(1, Number(event.target.value) || 1))) }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1456,
              columnNumber: 383
            }, this),
            /* @__PURE__ */ jsx("button", { "aria-label": "Increase plan length", onClick: () => adjustDays(1), disabled: Number(settings.planLength) >= 365, children: "+" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1456,
              columnNumber: 569
            }, this),
            /* @__PURE__ */ jsx("span", { children: "days" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1456,
              columnNumber: 697
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 1456,
            columnNumber: 155
          }, this),
          /* @__PURE__ */ jsx("small", { className: "stepper-hint", children: Number(settings.planLength) > 60 ? "Extended plan" : "1\u201360+ days" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1456,
            columnNumber: 720
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 1456,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsx("div", { className: "plan-setting-card day-one-card", children: [
          /* @__PURE__ */ jsx("div", { className: "setting-copy", children: [
            /* @__PURE__ */ jsx("strong", { children: "Day 1 begins" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1457,
              columnNumber: 87
            }, this),
            /* @__PURE__ */ jsx("span", { children: "Study-day labels count from this date." }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1457,
              columnNumber: 116
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 1457,
            columnNumber: 57
          }, this),
          /* @__PURE__ */ jsx("div", { className: "day-one-controls", children: [
            /* @__PURE__ */ jsx("label", { className: "sr-only", htmlFor: "day-one-date", children: "Day 1 begins date" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1457,
              columnNumber: 207
            }, this),
            /* @__PURE__ */ jsx("input", { id: "day-one-date", type: "date", value: settings.dayOne || dateKey(), onChange: (event) => event.target.value && set("dayOne", event.target.value) }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1457,
              columnNumber: 282
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 1457,
            columnNumber: 173
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 1457,
          columnNumber: 9
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 1455,
        columnNumber: 7
      }, this),
    /* @__PURE__ */ jsx("section", { className: "settings-section reset-day-one-section", children: [
      /* @__PURE__ */ jsx("div", { className: "settings-section-head", children: [
        /* @__PURE__ */ jsx("div", { children: [
          /* @__PURE__ */ jsx("span", { className: "settings-kicker", children: "Start Date" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1466,
            columnNumber: 109
          }, this),
          /* @__PURE__ */ jsx("h2", { children: "Reset Day 1" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1466,
            columnNumber: 160
          }, this),
          /* @__PURE__ */ jsx("p", { children: "Set the first study day to today. Your plan and progress stay saved." }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1466,
            columnNumber: 180
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 1466,
          columnNumber: 104
        }, this),
        /* @__PURE__ */ jsx("div", { className: "settings-section-icon", children: /* @__PURE__ */ jsx(RotateCcw, { size: 16 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 1466,
          columnNumber: 300
        }, this) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 1466,
          columnNumber: 261
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 1466,
        columnNumber: 65
      }, this),
      /* @__PURE__ */ jsx("button", { className: "button", onClick: onResetDay, children: [
        /* @__PURE__ */ jsx(RotateCcw, { size: 13 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 1466,
          columnNumber: 382
        }, this),
        " Reset Day 1 to today"
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 1466,
        columnNumber: 334
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 1466,
      columnNumber: 5
    }, this),
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 1453,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsx("section", { className: "settings-section data-section", children: [
      /* @__PURE__ */ jsx("div", { className: "settings-section-head", children: [
        /* @__PURE__ */ jsx("div", { children: [
          /* @__PURE__ */ jsx("span", { className: "settings-kicker", children: "Data management" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1461,
            columnNumber: 100
          }, this),
          /* @__PURE__ */ jsx("h2", { children: "Your study data" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1461,
            columnNumber: 156
          }, this),
          /* @__PURE__ */ jsx("p", { children: "Clear progress or start your planner over." }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1461,
            columnNumber: 180
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 1461,
          columnNumber: 95
        }, this),
        /* @__PURE__ */ jsx("div", { className: "settings-section-icon", children: /* @__PURE__ */ jsx(Database, { size: 16 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 1461,
          columnNumber: 274
        }, this) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 1461,
          columnNumber: 235
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 1461,
        columnNumber: 56
      }, this),
      /* @__PURE__ */ jsx("div", { className: "data-actions", children: [
        React.createElement(SyncCodeCard, { key: "sync-code-card", activeSyncCode, onConnectSync }),
        /* @__PURE__ */ jsx("div", { className: "data-action-card", children: [
          /* @__PURE__ */ jsx("div", { className: "data-action-icon", children: /* @__PURE__ */ jsx(AlertTriangle, { size: 16 }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1462,
            columnNumber: 75
          }, this) }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1462,
            columnNumber: 41
          }, this),
          /* @__PURE__ */ jsx("div", { className: "setting-copy", children: [
            /* @__PURE__ */ jsx("strong", { children: "Clear Mastery Data" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1462,
              columnNumber: 137
            }, this),
            /* @__PURE__ */ jsx("span", { children: "Remove tasks, totals, sessions, and diagnostic ratings." }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1462,
              columnNumber: 172
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 1462,
            columnNumber: 107
          }, this),
          /* @__PURE__ */ jsx("button", { className: "button danger-button", onClick: () => onConfirm("mastery"), children: "Clear data" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1462,
            columnNumber: 255
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 1462,
          columnNumber: 7
        }, this),
        /* @__PURE__ */ jsx("div", { className: "data-action-card", children: [
          /* @__PURE__ */ jsx("div", { className: "data-action-icon planner", children: /* @__PURE__ */ jsx(CalendarDays, { size: 16 }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1463,
            columnNumber: 83
          }, this) }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1463,
            columnNumber: 41
          }, this),
          /* @__PURE__ */ jsx("div", { className: "setting-copy", children: [
            /* @__PURE__ */ jsx("strong", { children: "Reset Planner" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1463,
              columnNumber: 144
            }, this),
            /* @__PURE__ */ jsx("span", { children: "Remove tasks and daily intentions, then restore the default plan." }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1463,
              columnNumber: 174
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 1463,
            columnNumber: 114
          }, this),
          /* @__PURE__ */ jsx("button", { className: "button danger-button", onClick: () => onConfirm("planner"), children: "Reset planner" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1463,
            columnNumber: 258
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 1463,
          columnNumber: 7
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 1461,
        columnNumber: 307
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 1461,
      columnNumber: 5
    }, this),

  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 1425,
    columnNumber: 10
  }, this);
}
function ConfirmActionModal({ type, onClose, onConfirm }) {
  const isMastery = type === "mastery";
  return /* @__PURE__ */ jsx2(ModalFrame, { title: isMastery ? "Clear mastery data?" : "Reset your planner?", subtitle: "This cannot be undone.", onClose, narrow: true, children: [
    /* @__PURE__ */ jsx2("div", { className: "confirm-panel", children: [
      /* @__PURE__ */ jsx2("span", { className: "confirm-icon", children: /* @__PURE__ */ jsx2(AlertTriangle, { size: 19 }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 559,
        columnNumber: 67
      }, this) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 559,
        columnNumber: 36
      }, this),
      /* @__PURE__ */ jsx2("p", { children: isMastery ? "Tasks, study totals, focus sessions, task completions, diagnostic ratings, syllabus progress, recall progress, and practice scores will be cleared. Your planner and Patch list entries will remain." : "Your offline planner, tasks, day intentions, planner settings, and entire Patch list will be cleared. Study totals, sessions, syllabus progress, and recall progress will remain." }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 559,
        columnNumber: 101
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 559,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsx2("div", { className: "modal-footer", children: [
      /* @__PURE__ */ jsx2("button", { className: "button", onClick: onClose, children: "Keep my data" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 560,
        columnNumber: 35
      }, this),
      /* @__PURE__ */ jsx2("button", { className: "button destructive", onClick: onConfirm, children: isMastery ? "Clear mastery data" : "Reset planner" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 560,
        columnNumber: 101
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 560,
      columnNumber: 5
    }, this)
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 558,
    columnNumber: 10
  }, this);
}
function chapterLectureCount(entry = {}, chapter = null) {
  const savedCount = Number(entry.lectureCount);
  if (Number.isFinite(savedCount)) return Math.max(0, savedCount);
  return Math.max(0, Number(chapter?.lectureCount) || 13);
}
function chapterIsComplete(entry = {}, chapter = null) {
  const count = chapterLectureCount(entry, chapter);
  return Boolean(entry.completedAt) || count > 0 && entry.lectures?.length >= count && entry.lectures.slice(0, count).every(Boolean);
}
function localDateOffset(amount) {
  return dateKey(addDays(/* @__PURE__ */ new Date(), amount));
}
function CalendarPickerModal({ value, onClose, onSelect }) {
  const [selected, setSelected] = useState(value || dateKey());
  const [month, setMonth] = useState(() => {
    const d = /* @__PURE__ */ new Date(`${value || dateKey()}T12:00:00`);
    return new Date(d.getFullYear(), d.getMonth(), 1, 12);
  });
  const firstWeekday = new Date(month.getFullYear(), month.getMonth(), 1, 12).getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0, 12).getDate();
  const monthLabel = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(month);
  return /* @__PURE__ */ jsx2("div", { className: "overlay calendar-overlay", onMouseDown: (event) => {
    if (event.target === event.currentTarget) onClose();
  }, children: /* @__PURE__ */ jsx2("section", { className: "modal calendar-modal", role: "dialog", "aria-modal": "true", "aria-label": "Choose completion date", children: [
    /* @__PURE__ */ jsx2("div", { className: "modal-header", children: [
      /* @__PURE__ */ jsx2("div", { children: [
        /* @__PURE__ */ jsx2("h2", { children: "Choose a date" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 600,
          columnNumber: 42
        }, this),
        /* @__PURE__ */ jsx2("p", { children: "Set when you completed this chapter." }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 600,
          columnNumber: 64
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 600,
        columnNumber: 37
      }, this),
      /* @__PURE__ */ jsx2("button", { className: "close-button", onClick: onClose, "aria-label": "Close calendar", children: /* @__PURE__ */ jsx2(X, { size: 17 }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 600,
        columnNumber: 192
      }, this) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 600,
        columnNumber: 113
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 600,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsx2("div", { className: "calendar-month-head", children: [
      /* @__PURE__ */ jsx2("button", { className: "calendar-arrow", "aria-label": "Previous month", onClick: () => setMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1, 12)), children: "\u2039" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 601,
        columnNumber: 44
      }, this),
      /* @__PURE__ */ jsx2("strong", { children: monthLabel }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 601,
        columnNumber: 201
      }, this),
      /* @__PURE__ */ jsx2("button", { className: "calendar-arrow", "aria-label": "Next month", onClick: () => setMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1, 12)), children: "\u203A" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 601,
        columnNumber: 230
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 601,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsx2("div", { className: "calendar-grid", children: [
      ["S", "M", "T", "W", "T", "F", "S"].map((day, index) => /* @__PURE__ */ jsx2("span", { className: "calendar-weekday", children: day }, `${day}-${index}`, false, {
        fileName: "<stdin>",
        lineNumber: 602,
        columnNumber: 95
      }, this)),
      Array.from({ length: firstWeekday }, (_, index) => /* @__PURE__ */ jsx2("span", {}, `blank-${index}`, false, {
        fileName: "<stdin>",
        lineNumber: 603,
        columnNumber: 61
      }, this)),
      Array.from({ length: daysInMonth }, (_, index) => {
        const day = index + 1;
        const key = dateKey(new Date(month.getFullYear(), month.getMonth(), day, 12));
        return /* @__PURE__ */ jsx2("button", { className: `calendar-day ${selected === key ? "selected" : ""} ${key === dateKey() ? "today" : ""}`, onClick: () => setSelected(key), children: day }, key, false, {
          fileName: "<stdin>",
          lineNumber: 607,
          columnNumber: 18
        }, this);
      })
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 602,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsx2("div", { className: "calendar-footer", children: [
      /* @__PURE__ */ jsx2("button", { className: "button", onClick: onClose, children: "Cancel" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 610,
        columnNumber: 40
      }, this),
      /* @__PURE__ */ jsx2("button", { className: "button primary", onClick: () => onSelect(selected), children: "Use this date" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 610,
        columnNumber: 100
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 610,
      columnNumber: 7
    }, this)
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 599,
    columnNumber: 5
  }, this) }, void 0, false, {
    fileName: "<stdin>",
    lineNumber: 598,
    columnNumber: 10
  }, this);
}
function ChapterDetailModal({ chapter, entry = {}, onClose, onUpdate, onDelete }) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [activeEditId, setActiveEditId] = useState(null);
  const count = chapterLectureCount(entry, chapter);
  const lectures = Array.from({ length: count }, (_, index) => Boolean(entry.lectures?.[index]));
  const doneCount = lectures.filter(Boolean).length;
  const remaining = count - doneCount;
  const completed = chapterIsComplete(entry, chapter);
  const completionDate = entry.completedAt || dateKey();
  const toggleLecture = (index) => {
    const next = [...lectures];
    next[index] = !next[index];
    const allDone = next.every(Boolean);
    onUpdate(chapter.id, { lectures: next, completedAt: allDone ? entry.completedAt || dateKey() : null });
  };
  const handleDeleteLecture = (index) => {
    const nextLectures = lectures.filter((_, lectureIndex) => lectureIndex !== index);
    const nextCount = Math.max(0, count - 1);
    const allDone = nextCount > 0 && nextLectures.length >= nextCount && nextLectures.slice(0, nextCount).every(Boolean);
    onUpdate(chapter.id, {
      lectureCount: nextCount,
      lectures: nextLectures,
      completedAt: allDone ? entry.completedAt || dateKey() : null
    });
    setActiveEditId(null);
  };
  const completeOn = (date) => onUpdate(chapter.id, { completedAt: date, lectures: Array.from({ length: count }, () => true) });
  return /* @__PURE__ */ jsx2(Fragment, { children: [
    /* @__PURE__ */ jsx2(ModalFrame, { title: chapter.name, subtitle: `${chapter.subject} \xB7 ${chapter.classLevel || "Class not set"} \xB7 ${chapter.unit}`, onClose, children: [
      /* @__PURE__ */ jsx2("div", { className: "chapter-detail-stats", children: [
        /* @__PURE__ */ jsx2("div", { className: "lecture-count-box", children: [
          /* @__PURE__ */ jsx2("span", { children: "Completed lectures" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 634,
            columnNumber: 44
          }, this),
          /* @__PURE__ */ jsx2("strong", { children: doneCount }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 634,
            columnNumber: 75
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 634,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsx2("div", { className: "lecture-count-box", children: [
          /* @__PURE__ */ jsx2("span", { children: "Remaining lectures" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 635,
            columnNumber: 44
          }, this),
          /* @__PURE__ */ jsx2("strong", { children: remaining }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 635,
            columnNumber: 75
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 635,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsx2("div", { className: "lecture-count-box chapter-status-count", children: [
          /* @__PURE__ */ jsx2("span", { children: "Chapter status" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 636,
            columnNumber: 65
          }, this),
          /* @__PURE__ */ jsx2("strong", { children: completed ? "Complete" : "In progress" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 636,
            columnNumber: 92
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 636,
          columnNumber: 9
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 633,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx2("div", { className: "chapter-progress-track", children: /* @__PURE__ */ jsx2("span", { style: { width: `${count ? doneCount / count * 100 : 0}%` } }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 638,
        columnNumber: 47
      }, this) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 638,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx2("div", { className: "chapter-detail-section", children: [
        /* @__PURE__ */ jsx2("div", { className: "chapter-section-title", children: [
          /* @__PURE__ */ jsx2("strong", { children: "Lecture checklist" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 640,
            columnNumber: 48
          }, this),
          /* @__PURE__ */ jsx2("span", { children: [
            doneCount,
            " / ",
            count
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 640,
            columnNumber: 82
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 640,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsx2("div", { className: "lecture-pills", children: lectures.map((done, index) => /* @__PURE__ */ jsx2("div", { className: "lecture-pill-wrap", onClick: () => setActiveEditId(index), children: [
          /* @__PURE__ */ jsx2("button", { type: "button", className: `lecture-pill ${done ? "done" : ""}`, onClick: () => toggleLecture(index), children: [
            /* @__PURE__ */ jsx2("span", { children: done && /* @__PURE__ */ jsx2(Check, { size: 11 }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 641,
              columnNumber: 192
            }, this) }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 641,
              columnNumber: 177
            }, this),
            "L",
            index + 1 === 13 ? "13+" : index + 1
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 641,
            columnNumber: 71
          }, this),
          activeEditId === index && /* @__PURE__ */ jsx2("button", { type: "button", onClick: (event) => { event.stopPropagation(); handleDeleteLecture(index); }, className: "absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center shadow-md hover:bg-red-600 transition-transform active:scale-90 z-10", "aria-label": "Delete lecture", children: /* @__PURE__ */ jsx2("svg", { xmlns: "http://www.w3.org/2000/svg", width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx2("path", { d: "M5 12h14" }, void 0, false, {}, this) }, void 0, false, {}, this) }, void 0, false, {}, this)
        ] }, index, true, {
          fileName: "<stdin>",
          lineNumber: 641,
          columnNumber: 71
        }, this)) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 641,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsx2("button", { className: "add-lecture-button", onClick: () => onUpdate(chapter.id, { lectureCount: count + 1, lectures: [...lectures, false] }), children: [
          /* @__PURE__ */ jsx2(Plus, { size: 13 }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 642,
            columnNumber: 146
          }, this),
          "Add another lecture"
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 642,
          columnNumber: 9
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 639,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx2("div", { className: "chapter-detail-section", children: [
        /* @__PURE__ */ jsx2("div", { className: "chapter-section-title", children: [
          /* @__PURE__ */ jsx2("strong", { children: "Repeat cycle" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 645,
            columnNumber: 48
          }, this),
          /* @__PURE__ */ jsx2("span", { children: "Spaced review" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 645,
            columnNumber: 77
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 645,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsx2("div", { className: "repeat-cycle", children: [1, 3, 7, 15, 30].map((day) => /* @__PURE__ */ jsx2("span", { children: [
          /* @__PURE__ */ jsx2("i", {}, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 646,
            columnNumber: 87
          }, this),
          "Day ",
          day
        ] }, day, true, {
          fileName: "<stdin>",
          lineNumber: 646,
          columnNumber: 71
        }, this)) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 646,
          columnNumber: 9
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 644,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx2("div", { className: "chapter-detail-section", children: [
        /* @__PURE__ */ jsx2("div", { className: "chapter-section-title", children: [
          /* @__PURE__ */ jsx2("strong", { children: "Completion date" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 649,
            columnNumber: 48
          }, this),
          completed && /* @__PURE__ */ jsx2("span", { className: "completed-date-label", children: dateLabel(/* @__PURE__ */ new Date(`${completionDate}T12:00:00`)) }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 649,
            columnNumber: 94
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 649,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsx2("div", { className: "completion-date-options", children: [
          [[-1, "Yesterday"], [0, "Today"], [1, "Tomorrow"]].map(([offset, label]) => {
            const key = localDateOffset(offset);
            return /* @__PURE__ */ jsx2("button", { className: `pill-choice ${entry.completedAt === key ? "selected" : ""}`, onClick: () => completeOn(key), children: label }, label, false, {
              fileName: "<stdin>",
              lineNumber: 652,
              columnNumber: 18
            }, this);
          }),
          /* @__PURE__ */ jsx2("button", { className: "pill-choice", onClick: () => setCalendarOpen(true), children: [
            /* @__PURE__ */ jsx2(CalendarDays, { size: 12 }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 653,
              columnNumber: 82
            }, this),
            "Custom date"
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 653,
            columnNumber: 12
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 650,
          columnNumber: 9
        }, this),
        completed && /* @__PURE__ */ jsx2("button", { className: "clear-completion", onClick: () => onUpdate(chapter.id, { completedAt: null, lectures: lectures.map(() => false) }), children: "Clear completion date" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 654,
          columnNumber: 23
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 648,
        columnNumber: 7
      }, this),
      deleteConfirm && chapter.custom ? /* @__PURE__ */ jsx2("div", { className: "chapter-delete-confirm", children: [
        /* @__PURE__ */ jsx2("span", { children: "Delete this chapter and its tracking?" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 656,
          columnNumber: 64
        }, this),
        /* @__PURE__ */ jsx2("div", { children: [
          /* @__PURE__ */ jsx2("button", { className: "button", onClick: () => setDeleteConfirm(false), children: "Keep chapter" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 656,
            columnNumber: 119
          }, this),
          /* @__PURE__ */ jsx2("button", { className: "button destructive", onClick: () => onDelete(chapter), children: "Delete chapter" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 656,
            columnNumber: 207
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 656,
          columnNumber: 114
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 656,
        columnNumber: 24
      }, this) : /* @__PURE__ */ jsx2("div", { className: "chapter-modal-footer", children: [
        chapter.custom && /* @__PURE__ */ jsx2("button", { className: "button chapter-delete", onClick: () => setDeleteConfirm(true), children: [
          /* @__PURE__ */ jsx2(Trash2, { size: 13 }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 657,
            columnNumber: 128
          }, this),
          "Delete chapter"
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 657,
          columnNumber: 47
        }, this),
        /* @__PURE__ */ jsx2("button", { className: "button primary", onClick: onClose, children: "Done" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 657,
          columnNumber: 171
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 657,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 632,
      columnNumber: 5
    }, this),
    calendarOpen && /* @__PURE__ */ jsx2(CalendarPickerModal, { value: entry.completedAt || dateKey(), onClose: () => setCalendarOpen(false), onSelect: (date) => {
      completeOn(date);
      setCalendarOpen(false);
    } }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 659,
      columnNumber: 22
    }, this)
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 631,
    columnNumber: 10
  }, this);
}
function AddChapterModal({ onClose, onAdd }) {
  const { subjects: modeSubjects } = useSubjectMode();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("Physics");
  const [unit, setUnit] = useState("");
  const [classLevel, setClassLevel] = useState("Class 11");
  const [lectures, setLectures] = useState(13);
  return /* @__PURE__ */ jsx2(ModalFrame, { title: "Add a chapter", subtitle: "Add a custom chapter to your syllabus.", onClose, narrow: true, children: /* @__PURE__ */ jsx2("form", { onSubmit: (event) => {
    event.preventDefault();
    if (name.trim()) onAdd({ name: name.trim(), subject, unit: unit.trim() || "Custom topics", classLevel, lectureCount: Math.max(1, Number(lectures) || 1) });
  }, children: [
    /* @__PURE__ */ jsx2("div", { className: "field", children: [
      /* @__PURE__ */ jsx2("label", { htmlFor: "chapter-name", children: "Chapter name" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 670,
        columnNumber: 30
      }, this),
      /* @__PURE__ */ jsx2("input", { id: "chapter-name", autoFocus: true, value: name, onChange: (event) => setName(event.target.value), placeholder: "e.g. Advanced problem solving" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 670,
        columnNumber: 80
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 670,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsx2("div", { className: "field-row", children: [
      /* @__PURE__ */ jsx2("div", { className: "field", children: [
        /* @__PURE__ */ jsx2("label", { htmlFor: "chapter-subject", children: "Subject" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 672,
          columnNumber: 32
        }, this),
        /* @__PURE__ */ jsx2("select", { id: "chapter-subject", value: modeSubjects.includes(subject) ? subject : modeSubjects[0], onChange: (event) => setSubject(event.target.value), children: modeSubjects.map((item) => /* @__PURE__ */ jsx2("option", { value: item, children: item }, item, false, {}, this)) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 672,
          columnNumber: 80
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 672,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsx2("div", { className: "field", children: [
        /* @__PURE__ */ jsx2("label", { htmlFor: "chapter-unit", children: "Unit" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 673,
          columnNumber: 32
        }, this),
        /* @__PURE__ */ jsx2("input", { id: "chapter-unit", value: unit, onChange: (event) => setUnit(event.target.value), placeholder: "Custom topics" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 673,
          columnNumber: 74
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 673,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 671,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsx2("div", { className: "field", children: [
      /* @__PURE__ */ jsx2("label", { htmlFor: "chapter-class", children: "Class" }, void 0, false, { fileName: "<stdin>", lineNumber: 674, columnNumber: 30 }, this),
      /* @__PURE__ */ jsx2("select", { id: "chapter-class", value: classLevel, onChange: (event) => setClassLevel(event.target.value), children: [
        /* @__PURE__ */ jsx2("option", { value: "Class 11", children: "Class 11" }, "Class 11", false, { fileName: "<stdin>", lineNumber: 674, columnNumber: 99 }, this),
        /* @__PURE__ */ jsx2("option", { value: "Class 12", children: "Class 12" }, "Class 12", false, { fileName: "<stdin>", lineNumber: 674, columnNumber: 170 }, this),
        /* @__PURE__ */ jsx2("option", { value: "Class 11 & 12", children: "Class 11 & 12" }, "Class 11 & 12", false, { fileName: "<stdin>", lineNumber: 674, columnNumber: 241 }, this)
      ] }, void 0, true, { fileName: "<stdin>", lineNumber: 674, columnNumber: 69 }, this)
    ] }, void 0, true, { fileName: "<stdin>", lineNumber: 674, columnNumber: 7 }, this),
    /* @__PURE__ */ jsx2("div", { className: "field", children: [
      /* @__PURE__ */ jsx2("label", { htmlFor: "chapter-lectures", children: "Lecture count" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 675,
        columnNumber: 30
      }, this),
      /* @__PURE__ */ jsx2("input", { id: "chapter-lectures", type: "number", min: "1", max: "60", value: lectures, onChange: (event) => setLectures(event.target.value) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 675,
        columnNumber: 85
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 675,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsx2("div", { className: "modal-footer", children: [
      /* @__PURE__ */ jsx2("button", { type: "button", className: "button", onClick: onClose, children: "Cancel" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 676,
        columnNumber: 37
      }, this),
      /* @__PURE__ */ jsx2("button", { className: "button primary", type: "submit", disabled: !name.trim(), children: [
        /* @__PURE__ */ jsx2(Plus, { size: 13 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 676,
          columnNumber: 184
        }, this),
        "Add chapter"
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 676,
        columnNumber: 111
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 676,
      columnNumber: 7
    }, this)
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 669,
    columnNumber: 5
  }, this) }, void 0, false, {
    fileName: "<stdin>",
    lineNumber: 668,
    columnNumber: 10
  }, this);
}
function CountdownRing({ mode }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1e3);
    return () => clearInterval(interval);
  }, []);
  const defaults = { mains: "2027-01-20", advanced: "2027-05-04", neet: "2027-05-02" };
  const storageKey = `apexjee-exam-date-${mode}`;
  const [override, setOverride] = useState(() => {
    const saved = localStorage.getItem(storageKey) || "";
    if (mode === "mains" && saved === "2027-01-22") {
      localStorage.setItem(storageKey, "2027-01-20");
      return "2027-01-20";
    }
    return saved;
  });
  const target = override || defaults[mode];
  const end = (/* @__PURE__ */ new Date(`${target}T23:59:59`)).getTime();
  const remaining = Math.max(0, end - now);
  const values = [Math.floor(remaining / 864e5), Math.floor(remaining % 864e5 / 36e5), Math.floor(remaining % 36e5 / 6e4), Math.floor(remaining % 6e4 / 1e3)];
  const dateLabel2 = new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(/* @__PURE__ */ new Date(`${target}T00:00:00Z`));
  const title = mode === "neet" ? "NEET Exam" : mode === "advanced" ? "JEE Advanced" : "JEE Main";
  return /* @__PURE__ */ jsx("section", { className: `syllabus-countdown countdown-${mode}`, "aria-label": `${title} countdown`, children: [
    /* @__PURE__ */ jsx("div", { className: "syllabus-countdown-head", children: [
      /* @__PURE__ */ jsx("div", { children: [
        /* @__PURE__ */ jsx("span", { className: "syllabus-countdown-label", children: [
          /* @__PURE__ */ jsx(Target, { size: 14 }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 2078,
            columnNumber: 94
          }, this),
          title
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 2078,
          columnNumber: 51
        }, this),
        /* @__PURE__ */ jsx("strong", { children: dateLabel2 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 2078,
          columnNumber: 127
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 2078,
        columnNumber: 46
      }, this),
      /* @__PURE__ */ jsx("label", { className: "syllabus-date-edit", title: `Change ${title} date`, "aria-label": `Change ${title} target date`, children: [
        /* @__PURE__ */ jsx(Pencil, { size: 15 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 2079,
          columnNumber: 119
        }, this),
        /* @__PURE__ */ jsx("input", { type: "date", value: target, onChange: (event) => {
          const value = event.target.value;
          setOverride(value);
          if (value) localStorage.setItem(storageKey, value);
          else localStorage.removeItem(storageKey);
        } }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 2079,
          columnNumber: 138
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 2079,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 2078,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsx("div", { className: "countdown-boxes", children: values.map((value, index) => /* @__PURE__ */ jsx("div", { className: "syllabus-time-box", children: [
      /* @__PURE__ */ jsx("strong", { children: String(value).padStart(index ? 2 : 1, "0") }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 2081,
        columnNumber: 112
      }, this),
      /* @__PURE__ */ jsx("span", { children: (mode === "neet" ? ["DAYS", "HOURS", "MINUTES", "SECONDS"] : ["Days", "Hours", "Minutes", "Seconds"])[index] }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 2081,
        columnNumber: 172
      }, this)
    ] }, index, true, {
      fileName: "<stdin>",
      lineNumber: 2081,
      columnNumber: 65
    }, this)) }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 2081,
      columnNumber: 5
    }, this)
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 2077,
    columnNumber: 10
  }, this);
}
function SyllabusTracker({ state, streak, onMode, onProgress, onAddChapter, onDeleteChapter }) {
  const { isNeetMode, subjects: modeSubjects } = useSubjectMode();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [selectedChapter, setSelectedChapter] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [openSubjects, setOpenSubjects] = useState({ Physics: true, Chemistry: true, Mathematics: true, Botany: true, Zoology: true });
  const [openUnits, setOpenUnits] = useState({ "Physics-Mechanics": true, "Chemistry-Physical Chemistry": true, "Mathematics-Algebra": true });
  const jeeSource = state.syllabusMode === "advanced" ? SYLLABUS.advanced : SYLLABUS.mains;
  const source = isNeetMode ? [
    ...SYLLABUS.mains.filter((chapter) => chapter.subject === "Physics" || chapter.subject === "Chemistry"),
    ...NEET_BIOLOGY_CHAPTERS
  ] : jeeSource;
  const chapters = [
    ...source.filter((chapter) => !state.deletedChapterIds.includes(chapter.id)),
    ...state.customChapters || []
  ].filter((chapter) => !isNeetMode || chapter.subject !== "Mathematics" && chapter.subject !== "Maths");
  const status = (chapter) => state.syllabusProgress[chapter.id] || {};
  const complete = (chapter) => chapterIsComplete(status(chapter), chapter);
  const visible = chapters.filter((chapter) => {
    const matchesText = `${chapter.name} ${chapter.unit} ${chapter.subject}`.toLowerCase().includes(query.toLowerCase());
    const entry = status(chapter);
    const matchesFilter = filter === "All" || (filter === "Completed" ? complete(chapter) : filter === "Pending" ? !complete(chapter) : Boolean(entry.bookmarked));
    return matchesText && matchesFilter;
  });
  const completedCount = chapters.filter(complete).length;
  const bookmarkedCount = chapters.filter((chapter) => status(chapter).bookmarked).length;
  const subjects = modeSubjects;
  const activeSource = source;
  const totalOfficial = activeSource.length;
  const totalCount = totalOfficial - state.deletedChapterIds.filter((id) => activeSource.some((chapter) => chapter.id === id)).length + chapters.filter((chapter) => !(activeSource.some((item) => item.id === chapter.id))).length;
  const toggleSubject = (subject) => setOpenSubjects((current) => ({ ...current, [subject]: !current[subject] }));
  const toggleUnit = (key) => setOpenUnits((current) => ({ ...current, [key]: !current[key] }));
  const openChapter = (chapter) => setSelectedChapter(chapter);
  return /* @__PURE__ */ jsx2("section", { className: "syllabus-view", children: [
    /* @__PURE__ */ jsx2("div", { className: "syllabus-heading", children: [
      /* @__PURE__ */ jsx2("div", { children: [
        /* @__PURE__ */ jsx2("p", { className: "eyebrow", children: "A clear path through the syllabus" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 726,
          columnNumber: 44
        }, this),
        /* @__PURE__ */ jsx2("h1", { children: "Syllabus Tracker" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 726,
          columnNumber: 104
        }, this),
        /* @__PURE__ */ jsx2("p", { children: "Track lectures, milestones, and spaced reviews." }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 726,
          columnNumber: 129
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 726,
        columnNumber: 39
      }, this),
      /* @__PURE__ */ jsx2("button", { className: "button primary", onClick: () => setAddOpen(true), children: [
        /* @__PURE__ */ jsx2(Plus, { size: 14 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 726,
          columnNumber: 257
        }, this),
        "Add Chapter"
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 726,
        columnNumber: 189
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 726,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsx2("div", { className: `syllabus-mode-switch ${isNeetMode ? "neet-syllabus-mode" : ""}`, role: "group", "aria-label": isNeetMode ? "NEET Exam" : "Choose syllabus", children: isNeetMode ? /* @__PURE__ */ jsx2("span", { className: "neet-exam-label", children: "NEET Exam" }, void 0, false, {}, this) : [
      /* @__PURE__ */ jsx2("button", { className: state.syllabusMode === "mains" ? "active" : "", onClick: () => onMode("mains"), children: [
        "JEE Mains ",
        /* @__PURE__ */ jsx2("span", { children: `${SYLLABUS.mains.length} chapters` }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 727,
          columnNumber: 194
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 727,
        columnNumber: 85
      }, this),
      /* @__PURE__ */ jsx2("button", { className: state.syllabusMode === "advanced" ? "active" : "", onClick: () => onMode("advanced"), children: [
        "JEE Advanced ",
        /* @__PURE__ */ jsx2("span", { children: `${SYLLABUS.advanced.length} chapters` }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 727,
          columnNumber: 345
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 727,
        columnNumber: 227
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 727,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsx2("div", { className: `syllabus-countdowns ${isNeetMode ? "neet-syllabus-countdowns" : ""}`, children: jsx2(CountdownRing, { mode: isNeetMode ? "neet" : state.syllabusMode === "advanced" ? "advanced" : "mains" }, isNeetMode ? "neet" : state.syllabusMode, false, { fileName: "<stdin>", lineNumber: 728, columnNumber: 65 }, this) }, void 0, false, { fileName: "<stdin>", lineNumber: 728, columnNumber: 5 }, this),
    /* @__PURE__ */ jsx2("div", { className: `syllabus-stats ${isNeetMode ? "neet-syllabus-stats" : ""}`, children: (isNeetMode ? [["Total Chapters", totalCount, BookOpen, "All"], ["Completed Chapters", completedCount, CheckCircle2, "Completed"], ["Pending Chapters", Math.max(0, totalCount - completedCount), Target, "Pending"], ["Bookmarked Chapters", bookmarkedCount, Bookmark, "Bookmarked"]] : [["Total chapters", totalCount, BookOpen, "All"], ["Completed chapters", completedCount, CheckCircle2, "Completed"], ["Pending chapters", Math.max(0, totalCount - completedCount), Target, "Pending"], ["Bookmarked chapters", bookmarkedCount, Bookmark, "Bookmarked"]]).map(([label, value, Icon, statFilter]) => {
      const StatTag = isNeetMode ? "button" : "div";
      return /* @__PURE__ */ jsx2(StatTag, { type: isNeetMode ? "button" : void 0, className: `syllabus-stat ${isNeetMode ? `neet-syllabus-stat ${filter === statFilter ? "selected" : ""}` : ""}`, onClick: isNeetMode ? () => setFilter(statFilter) : void 0, "aria-pressed": isNeetMode ? filter === statFilter : void 0, children: [
      /* @__PURE__ */ jsx2("span", { className: "syllabus-stat-icon", children: /* @__PURE__ */ jsx2(Icon, { size: 15 }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 730,
        columnNumber: 353
      }, this) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 730,
        columnNumber: 316
      }, this),
      /* @__PURE__ */ jsx2("span", { className: "syllabus-stat-label", children: label }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 730,
        columnNumber: 378
      }, this),
      /* @__PURE__ */ jsx2("strong", { children: value }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 730,
        columnNumber: 430
      }, this)
    ] }, label, true, {
      fileName: "<stdin>",
      lineNumber: 730,
      columnNumber: 273
    }, this);
    }) }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 729,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsx2("div", { className: "syllabus-tools", children: [
      /* @__PURE__ */ jsx2("label", { className: "chapter-search", children: [
        /* @__PURE__ */ jsx2(Search, { size: 16 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 733,
          columnNumber: 41
        }, this),
        /* @__PURE__ */ jsx2("input", { value: query, onChange: (event) => setQuery(event.target.value), placeholder: "Search chapters or topics..." }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 733,
          columnNumber: 61
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 733,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx2("div", { className: "syllabus-filters", children: ["All", "Completed", "Pending", "Bookmarked"].map((option) => /* @__PURE__ */ jsx2("button", { className: `syllabus-filter ${filter === option ? "selected" : ""}`, onClick: () => setFilter(option), children: option }, option, false, {
        fileName: "<stdin>",
        lineNumber: 734,
        columnNumber: 104
      }, this)) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 734,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 732,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsx2("div", { className: "syllabus-tree", children: [
      subjects.map((subject) => {
        const allSubjectChapters = chapters.filter((chapter) => chapter.subject === subject);
        const filteredSubject = visible.filter((chapter) => chapter.subject === subject);
        const subjectDone = allSubjectChapters.filter(complete).length;
        return /* @__PURE__ */ jsx2("section", { className: "subject-accordion", children: [
          /* @__PURE__ */ jsx2("button", { className: "subject-accordion-trigger", onClick: () => toggleSubject(subject), children: [
            /* @__PURE__ */ jsx2("span", { className: "subject-letter", children: subject[0] }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 742,
              columnNumber: 94
            }, this),
            /* @__PURE__ */ jsx2("span", { className: "subject-accordion-title", children: [
              /* @__PURE__ */ jsx2("strong", { children: subject }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 742,
                columnNumber: 188
              }, this),
              /* @__PURE__ */ jsx2("small", { children: [
                subjectDone,
                " / ",
                allSubjectChapters.length,
                " chapters complete"
              ] }, void 0, true, {
                fileName: "<stdin>",
                lineNumber: 742,
                columnNumber: 214
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 742,
              columnNumber: 146
            }, this),
            /* @__PURE__ */ jsx2("div", { className: "subject-mini-track", children: /* @__PURE__ */ jsx2("i", { style: { width: `${allSubjectChapters.length ? subjectDone / allSubjectChapters.length * 100 : 0}%` } }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 742,
              columnNumber: 333
            }, this) }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 742,
              columnNumber: 297
            }, this),
            /* @__PURE__ */ jsx2(ChevronDown, { className: openSubjects[subject] ? "rotated" : "", size: 17 }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 742,
              columnNumber: 415
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 742,
            columnNumber: 9
          }, this),
          openSubjects[subject] !== false && (allSubjectChapters.length ? /* @__PURE__ */ jsx2("div", { className: "unit-list", children: [...new Set(allSubjectChapters.map((chapter) => chapter.unit))].map((unit) => {
            const key = `${subject}-${unit}`;
            const list = filteredSubject.filter((chapter) => chapter.unit === unit);
            if (!list.length) return null;
            const done = list.filter(complete).length;
            return /* @__PURE__ */ jsx2("div", { className: "unit-accordion", children: [
              /* @__PURE__ */ jsx2("button", { className: "unit-trigger", onClick: () => toggleUnit(key), children: [
                /* @__PURE__ */ jsx2(ChevronDown, { className: openUnits[key] ? "rotated" : "", size: 14 }, void 0, false, {
                  fileName: "<stdin>",
                  lineNumber: 749,
                  columnNumber: 78
                }, this),
                /* @__PURE__ */ jsx2("strong", { children: unit }, void 0, false, {
                  fileName: "<stdin>",
                  lineNumber: 749,
                  columnNumber: 147
                }, this),
                /* @__PURE__ */ jsx2("span", { children: [
                  done,
                  "/",
                  list.length
                ] }, void 0, true, {
                  fileName: "<stdin>",
                  lineNumber: 749,
                  columnNumber: 170
                }, this)
              ] }, void 0, true, {
                fileName: "<stdin>",
                lineNumber: 749,
                columnNumber: 13
              }, this),
              openUnits[key] && /* @__PURE__ */ jsx2("div", { className: "chapter-list", children: list.map((chapter) => {
                const entry = status(chapter);
                const isDone = complete(chapter);
                const count = chapterLectureCount(entry, chapter);
                const lectureDone = entry.lectures?.filter(Boolean).length || 0;
                const hasCbseBoardsTag = chapter.cbseBoards ?? chapter.classLevel === "Class 12";
                return /* @__PURE__ */ jsx2("div", { className: `chapter-list-row ${isDone ? "completed" : ""}`, children: [
                  /* @__PURE__ */ jsx2("button", { type: "button", className: `chapter-status-dot ${isDone ? "done" : ""}`, role: "checkbox", "aria-checked": isDone, "aria-label": `${isDone ? "Mark pending" : "Mark complete"}: ${chapter.name}`, title: isDone ? "Mark chapter pending" : "Mark chapter complete", onClick: () => onProgress(chapter.id, isDone ? { completedAt: null, lectures: Array.from({ length: count }, () => false) } : { completedAt: dateKey(), lectures: Array.from({ length: count }, () => true) }), children: isDone && /* @__PURE__ */ jsx2(Check, { size: 12 }, void 0, false, {
                    fileName: "<stdin>",
                    lineNumber: 756,
                    columnNumber: 166
                  }, this) }, void 0, false, {
                    fileName: "<stdin>",
                    lineNumber: 756,
                    columnNumber: 17
                  }, this),
                  /* @__PURE__ */ jsx2("button", { className: "chapter-open", onClick: () => openChapter(chapter), children: [
                    /* @__PURE__ */ jsx2("span", { className: "chapter-list-copy", children: [
                      /* @__PURE__ */ jsx2("span", { className: "chapter-list-title", children: [
                        /* @__PURE__ */ jsx2("strong", { children: chapter.name }, void 0, false, {
                          fileName: "<stdin>",
                          lineNumber: 756,
                          columnNumber: 224
                        }, this),
                        hasCbseBoardsTag && /* @__PURE__ */ jsx2("span", { className: "cbse-boards-badge", children: "CBSE Boards" }, void 0, false, {
                          fileName: "<stdin>",
                          lineNumber: 756,
                          columnNumber: 284
                        }, this)
                      ] }, void 0, true, {
                        fileName: "<stdin>",
                        lineNumber: 756,
                        columnNumber: 188
                      }, this),
                      /* @__PURE__ */ jsx2("small", { children: [
                        `${chapter.classLevel || "Class not set"} \xB7 `,
                        lectureDone,
                        "/",
                        count,
                        " lectures",
                        entry.completedAt ? ` \xB7 Done ${dateLabel(/* @__PURE__ */ new Date(`${entry.completedAt}T12:00:00`))}` : ""
                      ] }, void 0, true, {
                        fileName: "<stdin>",
                        lineNumber: 756,
                        columnNumber: 255
                      }, this)
                    ] }, void 0, true, {
                      fileName: "<stdin>",
                      lineNumber: 756,
                      columnNumber: 188
                    }, this)
                  ] }, void 0, true, {
                    fileName: "<stdin>",
                    lineNumber: 756,
                    columnNumber: 17
                  }, this),
                  /* @__PURE__ */ jsx2("button", { className: `bookmark-button ${entry.bookmarked ? "bookmarked" : ""}`, "aria-label": entry.bookmarked ? "Remove bookmark" : "Bookmark chapter", onClick: () => onProgress(chapter.id, { bookmarked: !entry.bookmarked }), children: /* @__PURE__ */ jsx2(Bookmark, { size: 15, fill: entry.bookmarked ? "currentColor" : "none" }, void 0, false, {
                    fileName: "<stdin>",
                    lineNumber: 757,
                    columnNumber: 240
                  }, this) }, void 0, false, {
                    fileName: "<stdin>",
                    lineNumber: 757,
                    columnNumber: 17
                  }, this)
                ] }, chapter.id, true, {
                  fileName: "<stdin>",
                  lineNumber: 755,
                  columnNumber: 22
                }, this);
              }) }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 750,
                columnNumber: 32
              }, this)
            ] }, key, true, {
              fileName: "<stdin>",
              lineNumber: 748,
              columnNumber: 18
            }, this);
          }) }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 743,
            columnNumber: 35
          }, this) : /* @__PURE__ */ jsx2("div", { className: "unit-list", children: /* @__PURE__ */ jsx2("p", { className: "syllabus-subject-empty", children: "No chapters added yet." }, void 0, false, {}, this) }, void 0, false, {}, this))
        ] }, subject, true, {
          fileName: "<stdin>",
          lineNumber: 741,
          columnNumber: 14
        }, this);
      }),
      !visible.length && /* @__PURE__ */ jsx2("div", { className: "card empty-state syllabus-empty", children: [
        /* @__PURE__ */ jsx2("div", { className: "empty-icon", children: /* @__PURE__ */ jsx2(Search, { size: 22 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 763,
          columnNumber: 105
        }, this) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 763,
          columnNumber: 77
        }, this),
        /* @__PURE__ */ jsx2("h3", { children: "No chapters found." }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 763,
          columnNumber: 131
        }, this),
        /* @__PURE__ */ jsx2("p", { children: "Try another search or filter." }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 763,
          columnNumber: 158
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 763,
        columnNumber: 28
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 736,
      columnNumber: 5
    }, this),
    selectedChapter && /* @__PURE__ */ jsx2(ChapterDetailModal, { chapter: selectedChapter, entry: status(selectedChapter), onClose: () => setSelectedChapter(null), onUpdate: onProgress, onDelete: (chapter) => {
      onDeleteChapter(chapter);
      setSelectedChapter(null);
    } }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 764,
      columnNumber: 25
    }, this),
    addOpen && /* @__PURE__ */ jsx2(AddChapterModal, { onClose: () => setAddOpen(false), onAdd: (details) => {
      onAddChapter(details);
      setAddOpen(false);
    } }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 765,
      columnNumber: 17
    }, this)
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 725,
    columnNumber: 10
  }, this);
}
function formatFileSize(size) {
  const bytes = Number(size || 0);
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
const handbookPdfCanvasQueue = new WeakMap();
function HandbookPdfPage({ page, pageNumber, zoom = 1 }) {
  const hostRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const [rendered, setRendered] = React.useState(false);
  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    let active = true;
    let visible = false;
    let renderTask = null;
    let renderSequence = 0;
    const getPageSize = () => {
      const pageContainer = host.parentElement;
      if (!pageContainer) return null;
      const baseViewport = page.getViewport({ scale: 1 });
      const pageStyles = window.getComputedStyle(pageContainer);
      const horizontalPadding = (parseFloat(pageStyles.paddingLeft) || 0) + (parseFloat(pageStyles.paddingRight) || 0);
      const fitWidth = Math.min(900, pageContainer.clientWidth - horizontalPadding);
      if (!fitWidth || !baseViewport.width) return null;
      const pageWidth = fitWidth * zoom;
      host.style.width = `${pageWidth}px`;
      return { baseViewport, pageWidth, cssScale: pageWidth / baseViewport.width };
    };
    const render = async () => {
      if (!active) return;
      const pageSize = getPageSize();
      if (!visible || !pageSize) return;
      const request = ++renderSequence;
      renderTask?.cancel();
      const previousRender = handbookPdfCanvasQueue.get(canvas) || Promise.resolve();
      const queuedRender = previousRender.catch(() => {}).then(async () => {
        if (!active || !visible || request !== renderSequence) return;
        const { baseViewport, pageWidth, cssScale } = pageSize;
        const cssHeight = baseViewport.height * cssScale;
        const maxCanvasPixels = 4_500_000;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(maxCanvasPixels / Math.max(1, pageWidth * cssHeight)));
        const viewport = page.getViewport({ scale: cssScale * pixelRatio });
        canvas.style.width = "100%";
        canvas.style.height = "auto";
        const renderCanvas = document.createElement("canvas");
        renderCanvas.width = Math.ceil(viewport.width);
        renderCanvas.height = Math.ceil(viewport.height);
        let task = null;
        try {
          task = page.render({ canvas: renderCanvas, canvasContext: renderCanvas.getContext("2d", { alpha: false }), viewport });
          renderTask = task;
          await task.promise;
          if (active && request === renderSequence) {
            canvas.width = renderCanvas.width;
            canvas.height = renderCanvas.height;
            canvas.getContext("2d", { alpha: false }).drawImage(renderCanvas, 0, 0);
            setRendered(true);
          }
        } catch (error) {
          if (error?.name !== "RenderingCancelledException" && active) console.warn(`Could not render PDF page ${pageNumber}:`, error);
        } finally {
          if (task && renderTask === task) renderTask = null;
          renderCanvas.width = 0;
          renderCanvas.height = 0;
        }
      });
      handbookPdfCanvasQueue.set(canvas, queuedRender);
      await queuedRender;
    };
    const observer = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        visible = true;
        render();
      }
    }, { rootMargin: "700px 0px" }) : null;
    getPageSize();
    observer?.observe(host);
    if (!observer) {
      visible = true;
      render();
    }
    const resizeObserver = "ResizeObserver" in window ? new ResizeObserver(() => render()) : null;
    resizeObserver?.observe(host);
    return () => {
      active = false;
      observer?.disconnect();
      resizeObserver?.disconnect();
      renderTask?.cancel();
    };
  }, [page, pageNumber, zoom]);
  const view = page.view || [0, 0, 612, 792];
  return React.createElement(
    "div",
    { ref: hostRef, className: `handbook-pdf-page ${rendered ? "rendered" : ""}`, "aria-label": `Page ${pageNumber}`, "data-page-number": pageNumber, style: { aspectRatio: `${view[2] - view[0]} / ${view[3] - view[1]}` } },
    React.createElement("canvas", { ref: canvasRef, "aria-hidden": true }),
    !rendered && React.createElement("span", { className: "handbook-pdf-page-loading", "aria-hidden": true })
  );
}
function HandbookPdfReader({ document: pdfDocument, onClose }) {
  const [pdf, setPdf] = useState(null);
  const [pdfPages, setPdfPages] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const currentPageRef = useRef(1);
  const [scrubbingPage, setScrubbingPage] = useState(false);
  const [pageCounterVisible, setPageCounterVisible] = useState(false);
  const pageScrubberRef = useRef(null);
  const scrubPointerRef = useRef(null);
  const wheelDeltaRef = useRef(0);
  const pageCounterTimerRef = useRef(0);
  const wheelScrubTimerRef = useRef(0);
  const [pageInput, setPageInput] = useState("1");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const pagesRef = useRef(null);
  const zoomRef = useRef(zoom);
  const gestureRef = useRef({ points: new Map(), pinch: null });
  const lastTapRef = useRef(null);
  const lastTouchZoomAt = useRef(0);
  const zoomFrameRef = useRef(0);
  const zoomPreviewTimeoutRef = useRef(0);
  const zoomPreviewGeometryRef = useRef(null);
  zoomRef.current = zoom;
  const limitZoom = (value) => Math.max(0.5, Math.min(3, Math.round(value * 100) / 100));
  const setZoomAtPoint = (nextValue, clientX, clientY, anchor = null) => {
    const pages = pagesRef.current;
    if (!pages) return;
    const nextZoom = limitZoom(nextValue);
    const currentZoom = anchor?.baseZoom || zoomRef.current;
    const rect = pages.getBoundingClientRect();
    const pointX = clientX - rect.left - pages.clientLeft;
    const pointY = clientY - rect.top - pages.clientTop;
    const contentX = anchor?.x ?? pages.scrollLeft + pointX;
    const contentY = anchor?.y ?? pages.scrollTop + pointY;
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
    cancelAnimationFrame(zoomFrameRef.current);
    zoomFrameRef.current = requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!pagesRef.current) return;
      pages.scrollLeft = contentX * nextZoom / currentZoom - pointX;
      pages.scrollTop = contentY * nextZoom / currentZoom - pointY;
    }));
  };
  const capturePdfPreviewGeometry = (pages, clientX, clientY) => {
    const viewport = pages.getBoundingClientRect();
    const visibleTop = viewport.top + pages.clientTop;
    const visibleBottom = visibleTop + pages.clientHeight;
    const previewBuffer = pages.clientHeight * 2;
    return {
      originX: pages.scrollLeft + clientX - viewport.left - pages.clientLeft,
      originY: pages.scrollTop + clientY - viewport.top - pages.clientTop,
      pageOrigins: [...pages.querySelectorAll(".handbook-pdf-page")].map((page) => {
        const bounds = page.getBoundingClientRect();
        if (bounds.bottom < visibleTop - previewBuffer || bounds.top > visibleBottom + previewBuffer) return null;
        return {
          page,
          x: pages.scrollLeft + bounds.left - viewport.left - pages.clientLeft,
          y: pages.scrollTop + bounds.top - viewport.top - pages.clientTop
        };
      }).filter(Boolean)
    };
  };
  const applyPdfDocumentPreview = (geometry, scale, deltaX = 0, deltaY = 0, previewClass = "is-pinch-preview") => {
    if (!geometry) return;
    geometry.pageOrigins.forEach(({ page, x, y }) => {
      page.style.setProperty("--pdf-live-zoom", String(scale));
      page.style.setProperty("--pdf-translate-x", `${(x - geometry.originX) * (scale - 1) + deltaX}px`);
      page.style.setProperty("--pdf-translate-y", `${(y - geometry.originY) * (scale - 1) + deltaY}px`);
      page.classList.add(previewClass);
    });
  };
  const clearPdfDocumentPreview = (geometry, previewClass) => {
    geometry?.pageOrigins.forEach(({ page }) => {
      page.classList.remove(previewClass);
      page.style.removeProperty("--pdf-live-zoom");
      page.style.removeProperty("--pdf-translate-x");
      page.style.removeProperty("--pdf-translate-y");
    });
  };
  const zoomAtCenter = (delta) => {
    const pages = pagesRef.current;
    if (!pages) return;
    const rect = pages.getBoundingClientRect();
    animatePdfZoomAtPoint(zoomRef.current + delta, rect.left + rect.width / 2, rect.top + rect.height / 2);
  };
  const animatePdfZoomAtPoint = (targetZoom, clientX, clientY) => {
    const pages = pagesRef.current;
    if (!pages) return;
    const nextZoom = limitZoom(targetZoom);
    clearTimeout(zoomPreviewTimeoutRef.current);
    const previousPreview = zoomPreviewGeometryRef.current;
    clearPdfDocumentPreview(previousPreview, "is-zoom-preview");
    const geometry = capturePdfPreviewGeometry(pages, clientX, clientY);
    zoomPreviewGeometryRef.current = geometry;
    applyPdfDocumentPreview(geometry, nextZoom / zoomRef.current, 0, 0, "is-zoom-preview");
    zoomPreviewTimeoutRef.current = setTimeout(() => {
      setZoomAtPoint(nextZoom, clientX, clientY);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        clearPdfDocumentPreview(geometry, "is-zoom-preview");
        if (zoomPreviewGeometryRef.current === geometry) zoomPreviewGeometryRef.current = null;
      }));
    }, 240);
  };
  const onPdfPointerDown = (event) => {
    const pages = pagesRef.current;
    if (!pages || event.target.closest(".handbook-page-scrubber")) return;
    const gesture = gestureRef.current;
    gesture.points.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false, type: event.pointerType, time: Date.now() });
    if (gesture.points.size >= 2) {
      clearTimeout(zoomPreviewTimeoutRef.current);
      clearPdfDocumentPreview(zoomPreviewGeometryRef.current, "is-zoom-preview");
      zoomPreviewGeometryRef.current = null;
      const [first, second] = [...gesture.points.values()];
      const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const rect = pages.getBoundingClientRect();
      gesture.pinch = {
        distance: Math.hypot(first.x - second.x, first.y - second.y), midpoint,
        baseZoom: zoomRef.current,
        x: pages.scrollLeft + midpoint.x - rect.left - pages.clientLeft,
        y: pages.scrollTop + midpoint.y - rect.top - pages.clientTop,
        currentZoom: zoomRef.current,
        currentMidpoint: midpoint,
        previewGeometry: capturePdfPreviewGeometry(pages, midpoint.x, midpoint.y)
      };
    }
  };
  const onPdfPointerMove = (event) => {
    const gesture = gestureRef.current;
    const pages = pagesRef.current;
    if (!pages || !gesture.points.has(event.pointerId)) return;
    const point = gesture.points.get(event.pointerId);
    const moved = point.moved || Math.hypot(event.clientX - point.startX, event.clientY - point.startY) > 8;
    gesture.points.set(event.pointerId, { ...point, x: event.clientX, y: event.clientY, moved });
    if (gesture.points.size >= 2 && gesture.pinch) {
      event.preventDefault();
      const [first, second] = [...gesture.points.values()];
      const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const distance = Math.hypot(first.x - second.x, first.y - second.y);
      const nextZoom = limitZoom(gesture.pinch.baseZoom * distance / Math.max(1, gesture.pinch.distance));
      if (Math.abs(nextZoom - gesture.pinch.currentZoom) < 0.008) return;
      gesture.pinch.currentZoom = nextZoom;
      gesture.pinch.currentMidpoint = midpoint;
      applyPdfDocumentPreview(gesture.pinch.previewGeometry, nextZoom / gesture.pinch.baseZoom, midpoint.x - gesture.pinch.midpoint.x, midpoint.y - gesture.pinch.midpoint.y, "is-pinch-preview");
      return;
    }
  };
  const onPdfPointerUp = (event) => {
    const gesture = gestureRef.current;
    const pages = pagesRef.current;
    const point = gesture.points.get(event.pointerId);
    const wasPinching = gesture.points.size >= 2;
    const wasMoved = point?.moved;
    const pinch = wasPinching ? gesture.pinch : null;
    gesture.points.delete(event.pointerId);
    gesture.pinch = null;
    if (pinch && pages) {
      setZoomAtPoint(pinch.currentZoom, pinch.currentMidpoint.x, pinch.currentMidpoint.y, { baseZoom: pinch.baseZoom, x: pinch.x, y: pinch.y });
      requestAnimationFrame(() => requestAnimationFrame(() => {
        clearPdfDocumentPreview(pinch.previewGeometry, "is-pinch-preview");
      }));
    }
    if (gesture.points.size === 1 && pages) {
      const [remainingId, remaining] = [...gesture.points.entries()][0];
      gesture.points.set(remainingId, { ...remaining, moved: true });
      return;
    }
    if (event.type === "pointercancel" || !point || wasPinching || point.type !== "touch" || wasMoved || Date.now() - point.time > 280) return;
    const previousTap = lastTapRef.current;
    if (previousTap && Date.now() - previousTap.time < 330 && Math.hypot(event.clientX - previousTap.x, event.clientY - previousTap.y) < 34) {
      animatePdfZoomAtPoint(zoomRef.current > 1 ? 1 : 2, event.clientX, event.clientY);
      lastTouchZoomAt.current = Date.now();
      lastTapRef.current = null;
    } else lastTapRef.current = { time: Date.now(), x: event.clientX, y: event.clientY };
  };
  useEffect(() => {
    let active = true;
    let loadedPdf = null;
    (async () => {
      try {
        let source = pdfDocument.remoteUrl || pdfDocument.url;
        if (pdfDocument.localFileId) source = await loadLocalFile(pdfDocument.localFileId);
        if (!source) throw new Error("This PDF is no longer available on this device. Upload it again to read it here.");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("./pdf.worker.min.mjs", import.meta.url).href;
        const task = pdfDocument.remoteUrl
          ? pdfjs.getDocument({ url: source })
          : pdfjs.getDocument({ data: await fetchHandbookBytes(source) });
        loadedPdf = await task.promise;
        const loadedPages = await Promise.all(Array.from({ length: loadedPdf.numPages }, (_, index) => loadedPdf.getPage(index + 1)));
        if (active) {
          setPdf(loadedPdf);
          setPdfPages(loadedPages);
        }
      } catch (loadError) {
        if (active) setError(loadError?.message?.includes("fetch") || loadError?.name === "TypeError"
          ? "This PDF is no longer available on this device. Upload it again to read it here."
          : loadError?.message || "This PDF could not be opened.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      loadedPdf?.destroy();
    };
    }, [pdfDocument]);
  useEffect(() => {
    const pagesElement = pagesRef.current;
    if (!pagesElement || !pdfPages.length || !("IntersectionObserver" in window)) return undefined;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      const pageNumber = Number(visible?.target?.dataset?.pageNumber);
      if (pageNumber && pageNumber !== currentPageRef.current) {
        currentPageRef.current = pageNumber;
        setCurrentPage(pageNumber);
        revealPageCounter();
      }
    }, { root: pagesElement, threshold: [0.25, 0.5, 0.75] });
    pagesElement.querySelectorAll(".handbook-pdf-page").forEach((page) => observer.observe(page));
    return () => observer.disconnect();
  }, [pdfPages]);
  useEffect(() => {
    if (document.activeElement?.id !== "handbook-page-number") setPageInput(String(currentPage));
  }, [currentPage]);
  useEffect(() => () => { window.clearTimeout(pageCounterTimerRef.current); window.clearTimeout(wheelScrubTimerRef.current); }, []);
  const revealPageCounter = () => {
    setPageCounterVisible(true);
    window.clearTimeout(pageCounterTimerRef.current);
    if (!scrubPointerRef.current) pageCounterTimerRef.current = window.setTimeout(() => setPageCounterVisible(false), 950);
  };
  const jumpToPage = (pageNumber, behavior = "smooth") => {
    if (!pdf) return;
    const targetPage = Math.max(1, Math.min(pdf.numPages, Math.round(Number(pageNumber) || 1)));
    if (targetPage === currentPageRef.current) { revealPageCounter(); return; }
    const page = pagesRef.current?.querySelector(`[data-page-number="${targetPage}"]`);
    if (!page) return;
    currentPageRef.current = targetPage;
    setCurrentPage(targetPage);
    revealPageCounter();
    const pages = pagesRef.current;
    const bounds = page.getBoundingClientRect();
    const viewport = pages.getBoundingClientRect();
    pages.scrollTo({ top: pages.scrollTop + bounds.top - viewport.top - pages.clientTop, behavior: behavior === "instant" ? "instant" : behavior });
  };
  const updatePageFromScrubber = (event) => {
    const rail = pageScrubberRef.current;
    if (!rail || !pdf) return;
    const bounds = rail.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (event.clientY - bounds.top) / Math.max(1, bounds.height)));
    jumpToPage(1 + fraction * (pdf.numPages - 1), "instant");
  };
  const onPageScrubberPointerDown = (event) => {
    if (!pdf || event.button > 0) return;
    event.preventDefault();
    scrubPointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setScrubbingPage(true);
    setPageCounterVisible(true);
    updatePageFromScrubber(event);
  };
  const onPageScrubberPointerMove = (event) => {
    if (scrubPointerRef.current !== event.pointerId) return;
    event.preventDefault();
    updatePageFromScrubber(event);
  };
  const onPageScrubberPointerUp = (event) => {
    if (scrubPointerRef.current !== event.pointerId) return;
    scrubPointerRef.current = null;
    setScrubbingPage(false);
    revealPageCounter();
  };
  const onPageScrubberWheel = (event) => {
    if (!pdf) return;
    event.preventDefault();
    setScrubbingPage(true);
    window.clearTimeout(wheelScrubTimerRef.current);
    wheelScrubTimerRef.current = window.setTimeout(() => { if (!scrubPointerRef.current) setScrubbingPage(false); }, 220);
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? pageScrubberRef.current?.clientHeight || 640 : 1;
    wheelDeltaRef.current += event.deltaY * scale;
    const pageSteps = Math.trunc(wheelDeltaRef.current / 54);
    if (!pageSteps) return;
    wheelDeltaRef.current -= pageSteps * 54;
    jumpToPage(currentPageRef.current + pageSteps, "instant");
  };
  const onPageScrubberKeyDown = (event) => {
    if (!pdf) return;
    const step = event.shiftKey ? 10 : 1;
    let target = currentPageRef.current;
    if (event.key === "ArrowUp" || event.key === "ArrowLeft" || event.key === "PageUp") target -= event.key === "PageUp" ? 10 : step;
    else if (event.key === "ArrowDown" || event.key === "ArrowRight" || event.key === "PageDown") target += event.key === "PageDown" ? 10 : step;
    else if (event.key === "Home") target = 1;
    else if (event.key === "End") target = pdf.numPages;
    else return;
    event.preventDefault();
    jumpToPage(target, "instant");
  };
  const pageProgress = pdf?.numPages > 1 ? `${(currentPage - 1) / (pdf.numPages - 1) * 100}%` : "0%";
  const commitPageInput = () => {
    if (!pdf) return;
    const parsedPage = Number.parseInt(pageInput, 10);
    if (!Number.isFinite(parsedPage)) {
      setPageInput(String(currentPage));
      return;
    }
    const targetPage = Math.max(1, Math.min(pdf.numPages, parsedPage));
    setPageInput(String(targetPage));
    jumpToPage(targetPage, "smooth");
  };
  return React.createElement(
    "div",
    { className: "handbook-reader-overlay", role: "dialog", "aria-modal": "true", "aria-label": pdfDocument.name, onMouseDown: (event) => { if (event.target === event.currentTarget) onClose(); } },
    React.createElement(
      "section",
      { className: "handbook-reader" },
      React.createElement(
        "header",
        { className: "handbook-reader-header" },
        React.createElement("div", null, React.createElement("strong", null, pdfDocument.name), React.createElement("span", null, pdf ? `${pdfDocument.subject} handbook · ${pdf.numPages} pages` : `${pdfDocument.subject} handbook`)),
        React.createElement("div", { className: "handbook-reader-actions" },
          React.createElement("button", { className: "handbook-zoom-control", type: "button", onClick: () => zoomAtCenter(-0.25), disabled: zoom <= 0.5, "aria-label": "Zoom out PDF" }, React.createElement(ZoomOut, { size: 16 })),
          React.createElement("button", { className: "handbook-zoom-reset", type: "button", onClick: () => zoomAtCenter(1 - zoom), "aria-label": "Reset PDF zoom" }, `${Math.round(zoom * 100)}%`),
          React.createElement("button", { className: "handbook-zoom-control", type: "button", onClick: () => zoomAtCenter(0.25), disabled: zoom >= 3, "aria-label": "Zoom in PDF" }, React.createElement(ZoomIn, { size: 16 })),
          React.createElement("button", { className: "button soft handbook-open-browser", type: "button", onClick: () => openHandbookDocument(pdfDocument).catch((error) => setError(error.message)) }, React.createElement(ExternalLink, { size: 14 }), "Open in browser"),
          React.createElement("button", { className: "assistant-icon-button", type: "button", onClick: onClose, "aria-label": "Close PDF reader" }, React.createElement(X, { size: 19 }))
        )
      ),
      React.createElement("nav", { className: "handbook-page-navigation", "aria-label": "PDF page controls" },
        React.createElement("label", { htmlFor: "handbook-page-number" }, "Go to page"),
        React.createElement("input", { id: "handbook-page-number", className: "handbook-page-number", type: "number", min: 1, max: pdf?.numPages || 1, step: 1, inputMode: "numeric", value: pageInput, disabled: !pdf, onChange: (event) => setPageInput(event.target.value), onBlur: commitPageInput, onKeyDown: (event) => { if (event.key === "Enter") { commitPageInput(); event.currentTarget.blur(); } }, "aria-label": "Go to PDF page number" }),
        React.createElement("span", null, pdf ? `/ ${pdf.numPages}` : "/ —")
      ),
      React.createElement("div", { className: "handbook-reader-viewport" },
        React.createElement("div", { ref: pagesRef, className: "handbook-reader-pages", onPointerDown: onPdfPointerDown, onPointerMove: onPdfPointerMove, onPointerUp: onPdfPointerUp, onPointerCancel: onPdfPointerUp, onDoubleClick: (event) => {
          if (Date.now() - lastTouchZoomAt.current < 500) return;
          animatePdfZoomAtPoint(zoomRef.current > 1 ? 1 : 2, event.clientX, event.clientY);
        }, onWheel: (event) => {
          if (!event.ctrlKey && !event.metaKey) return;
          event.preventDefault();
          setZoomAtPoint(zoomRef.current + (event.deltaY < 0 ? 0.1 : -0.1), event.clientX, event.clientY);
        }, "aria-busy": loading ? "true" : "false" },
          loading && React.createElement("div", { className: "handbook-pdf-message" }, "Opening PDF…"),
          error && React.createElement("div", { className: "handbook-pdf-message handbook-pdf-error", role: "alert" }, error),
          pdf && pdfPages.map((page, index) => React.createElement(HandbookPdfPage, { key: index + 1, pageNumber: index + 1, page, zoom }))
        ),
        React.createElement("div", {
          ref: pageScrubberRef,
          className: `handbook-page-scrubber ${scrubbingPage ? "is-scrubbing" : ""}`,
          role: "slider",
          tabIndex: pdf ? 0 : -1,
          "aria-label": "PDF page",
          "aria-valuemin": 1,
          "aria-valuemax": pdf?.numPages || 1,
          "aria-valuenow": currentPage,
          "aria-valuetext": `Page ${currentPage} of ${pdf?.numPages || 1}`,
          "aria-disabled": !pdf,
          style: { "--page-progress": pageProgress },
          onPointerDown: onPageScrubberPointerDown,
          onPointerMove: onPageScrubberPointerMove,
          onPointerUp: onPageScrubberPointerUp,
          onPointerCancel: onPageScrubberPointerUp,
          onWheel: onPageScrubberWheel,
          onKeyDown: onPageScrubberKeyDown
        },
          React.createElement("span", { className: "handbook-page-scrubber-track", "aria-hidden": true }),
          React.createElement("span", { className: "handbook-page-scrubber-thumb", "aria-hidden": true }),
          React.createElement("span", { className: `handbook-page-scrubber-label ${pageCounterVisible ? "is-visible" : ""}`, "aria-hidden": true }, currentPage)
        ),
        scrubbingPage && React.createElement("div", { className: "handbook-page-scrub-count", "aria-hidden": true },
          React.createElement("strong", null, currentPage),
          React.createElement("span", null, `of ${pdf?.numPages || 1}`)
        )
      )
    )
  );
}
async function openHandbookDocument(document2) {
  const popup = window.open("about:blank", "_blank");
  if (!popup) throw new Error("Allow pop-ups to open this PDF in a new tab.");
  try {
    let source = document2.remoteUrl || document2.url;
    if (document2.localFileId) source = await loadLocalFile(document2.localFileId);
    if (!source) throw new Error("This PDF is no longer available on this device. Upload it again.");
    const blob = new Blob([await fetchHandbookBytes(source)], { type: "application/pdf" });
    const objectUrl = URL.createObjectURL(blob);
    popup.opener = null;
    popup.location.replace(objectUrl);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  } catch (error) {
    popup.close();
    throw error;
  }
}
function HandbookLibrary({ documents, onUpload, onDelete }) {
  const { isNeetMode, subjects: modeSubjects } = useSubjectMode();
  const [subject, setSubject] = useState("Physics");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [reader, setReader] = useState(null);
  const inputRef = React.useRef(null);
  useEffect(() => {
    if (!modeSubjects.includes(subject === "Maths" ? "Mathematics" : subject)) setSubject(modeSubjects[0]);
  }, [isNeetMode]);
  useEffect(() => {
    if (!reader) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setReader(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [reader]);
  const selectedHandbookSubject = subject === "Maths" ? "Mathematics" : subject;
  const filtered = documents.filter((document2) => {
    const documentSubject = document2.subject === "Maths" ? "Mathematics" : document2.subject;
    return documentSubject === selectedHandbookSubject && (!isNeetMode || documentSubject !== "Mathematics");
  });
  const uploadFile = async (file, targetSubject = subject) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Choose a PDF file to add it to your handbook.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      await onUpload(targetSubject, file);
    } catch (uploadError) {
      setError(uploadError.message || "The PDF could not be uploaded. Try again.");
    } finally {
      setUploading(false);
    }
  };
  const chooseFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    uploadFile(file);
  };
  return /* @__PURE__ */ jsx2("section", { className: "handbook-view", children: [
    /* @__PURE__ */ jsx2("div", { className: "handbook-banner", children: [
      /* @__PURE__ */ jsx2("div", { className: "handbook-banner-copy", children: [
        /* @__PURE__ */ jsx2("span", { className: "handbook-kicker", children: [
          /* @__PURE__ */ jsx2(BookOpen, { size: 13 }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 793,
            columnNumber: 110
          }, this),
          " YOUR REFERENCE LIBRARY"
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 793,
          columnNumber: 76
        }, this),
        /* @__PURE__ */ jsx2("h1", { children: `Apex ${isNeetMode ? "NEET" : "JEE"} Handbooks & PDFs` }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 793,
          columnNumber: 162
        }, this),
        /* @__PURE__ */ jsx2("p", { children: "Access core formula sheets or reference PDFs." }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 793,
          columnNumber: 197
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 793,
        columnNumber: 38
      }, this),
      /* @__PURE__ */ jsx2("div", { className: "handbook-banner-art", children: [
        /* @__PURE__ */ jsx2(BookOpen, { size: 32 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 793,
          columnNumber: 292
        }, this),
        /* @__PURE__ */ jsx2("span", { children: [
          "PDF",
          /* @__PURE__ */ jsx2("br", {}, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 793,
            columnNumber: 323
          }, this),
          "SHELF"
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 793,
          columnNumber: 314
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 793,
        columnNumber: 255
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 793,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsx2("div", { className: "handbook-toolbar", children: [
      /* @__PURE__ */ jsx2("div", { className: "handbook-tabs", role: "tablist", "aria-label": "Handbook subjects", children: modeSubjects.map((item) => /* @__PURE__ */ jsx2("button", { role: "tab", "aria-selected": selectedHandbookSubject === item, className: selectedHandbookSubject === item ? "active" : "", onClick: () => setSubject(item), children: item }, item, false, {
        fileName: "<stdin>",
        lineNumber: 794,
        columnNumber: 165
      }, this)) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 794,
        columnNumber: 39
      }, this),
      /* @__PURE__ */ jsx2("button", { className: "button primary upload-button", onClick: () => inputRef.current?.click(), disabled: uploading, children: uploading ? /* @__PURE__ */ jsx2(Fragment, { children: [
        /* @__PURE__ */ jsx2("span", { className: "upload-spinner" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 795,
          columnNumber: 134
        }, this),
        "Uploading\u2026"
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 795,
        columnNumber: 132
      }, this) : /* @__PURE__ */ jsx2(Fragment, { children: [
        /* @__PURE__ */ jsx2(Upload, { size: 14 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 795,
          columnNumber: 187
        }, this),
        "Upload to ",
        subject
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 795,
        columnNumber: 185
      }, this) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 795,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx2("input", { ref: inputRef, className: "hidden-file-input", type: "file", accept: "application/pdf,.pdf", onChange: chooseFile }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 795,
        columnNumber: 239
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 794,
      columnNumber: 5
    }, this),
    error && /* @__PURE__ */ jsx2("p", { className: "upload-error", role: "alert", children: error }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 797,
      columnNumber: 15
    }, this),
    filtered.length ? /* @__PURE__ */ jsx2("div", { className: "pdf-grid", children: filtered.map((document2) => /* @__PURE__ */ jsx2("article", { className: "pdf-card", children: [
      /* @__PURE__ */ jsx2("div", { className: "pdf-cover", children: [
        /* @__PURE__ */ jsx2("div", { className: "pdf-file-icon", children: /* @__PURE__ */ jsx2(FileText, { size: 23 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 799,
          columnNumber: 65
        }, this) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 799,
          columnNumber: 34
        }, this),
        /* @__PURE__ */ jsx2("span", { children: "PDF" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 799,
          columnNumber: 93
        }, this),
        /* @__PURE__ */ jsx2("div", { className: "pdf-cover-lines", children: [
          /* @__PURE__ */ jsx2("i", {}, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 799,
            columnNumber: 142
          }, this),
          /* @__PURE__ */ jsx2("i", {}, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 799,
            columnNumber: 147
          }, this),
          /* @__PURE__ */ jsx2("i", {}, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 799,
            columnNumber: 152
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 799,
          columnNumber: 109
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 799,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx2("div", { className: "pdf-card-details", children: [
        /* @__PURE__ */ jsx2("div", { className: "pdf-title-row", children: [
          /* @__PURE__ */ jsx2("h2", { title: document2.name, children: document2.name }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 800,
            columnNumber: 72
          }, this),
          !document2.builtin && /* @__PURE__ */ jsx2("button", { className: "pdf-delete", "aria-label": `Remove ${document2.name}`, onClick: () => onDelete(document2.id), children: /* @__PURE__ */ jsx2(Trash2, { size: 14 }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 800,
            columnNumber: 226
          }, this) }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 800,
            columnNumber: 118
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 800,
          columnNumber: 41
        }, this),
        /* @__PURE__ */ jsx2("p", { children: [
          formatFileSize(document2.size),
          " ",
          /* @__PURE__ */ jsx2("span", { children: "\xB7" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 800,
            columnNumber: 296
          }, this),
          " ",
          dateLabel(/* @__PURE__ */ new Date(`${document2.uploadedAt}T12:00:00`))
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 800,
          columnNumber: 261
        }, this),
        /* @__PURE__ */ jsx2("div", { className: "pdf-card-actions", children: [
          /* @__PURE__ */ jsx2("button", { className: "button soft pdf-view-button", type: "button", onClick: () => setReader(document2), children: [
            /* @__PURE__ */ jsx2(BookOpen, { size: 13 }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 800,
              columnNumber: 476
            }, this),
            "Read in app"
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 800,
            columnNumber: 371
          }, this),
          /* @__PURE__ */ jsx2("button", { className: "button soft pdf-view-button", type: "button", onClick: () => openHandbookDocument(document2).catch((error) => setError(error.message)), children: [
            /* @__PURE__ */ jsx2(ExternalLink, { size: 13 }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 800,
              columnNumber: 476
            }, this),
            "Open in browser"
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 800,
            columnNumber: 371
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 800,
          columnNumber: 371
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 800,
        columnNumber: 7
      }, this)
    ] }, document2.id, true, {
      fileName: "<stdin>",
      lineNumber: 798,
      columnNumber: 78
    }, this)) }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 798,
      columnNumber: 24
    }, this) : /* @__PURE__ */ jsx2("div", { className: "card empty-state handbook-empty", children: [
      /* @__PURE__ */ jsx2("div", { className: "empty-icon", children: /* @__PURE__ */ jsx2(FileText, { size: 23 }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 802,
        columnNumber: 72
      }, this) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 802,
        columnNumber: 44
      }, this),
      /* @__PURE__ */ jsx2("h3", { children: [
        "Your ",
        subject,
        " shelf is waiting."
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 802,
        columnNumber: 100
      }, this),
      /* @__PURE__ */ jsx2("p", { children: "Upload a formula sheet or reference PDF to keep it close." }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 802,
        columnNumber: 141
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 802,
      columnNumber: 205
    }, this),
    reader && React.createElement(HandbookPdfReader, { document: reader, onClose: () => setReader(null) })
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 792,
    columnNumber: 10
  }, this);
}
const STUDY_PATH = [
  { id: "intro", label: "Intro lesson", sub: "Orient to the exam plan", icon: Sparkles },
  { id: "smart-text", label: "Smart text", sub: "Read a concise concept note", icon: BookOpen },
  { id: "podcast", label: "Podcast", sub: "Listen to a focused explanation", icon: Activity },
  { id: "video", label: "Video lesson", sub: "See the concept in motion", icon: Play },
  { id: "flashcards", label: "Flashcards", sub: "Strengthen active recall", icon: Zap },
  { id: "knowledge-gaps", label: "Knowledge gaps", sub: "Review weak topics from your Patch list", icon: Search },
  { id: "written-mock", label: "Written mock exam", sub: "Practice a timed paper", icon: Pencil },
  { id: "oral-mock", label: "Oral mock exam", sub: "Explain your reasoning aloud", icon: Target }
];
function ExamHub({ state, chapters, now, onConfig, onPathResponse }) {
  const { isNeetMode, subjects: modeSubjects } = useSubjectMode();
  const config = state.examConfig;
  const today = dateKey();
  const selectedSubjects = modeSubjects.filter((subject) => config.subjects.includes(subject) || subject === "Mathematics" && config.subjects.includes("Maths"));
  const selectedChapters = chapters.filter((chapter) => selectedSubjects.includes(chapter.subject));
  const completedChapters = selectedChapters.filter((chapter) => chapterIsComplete(state.syllabusProgress[chapter.id] || {}, chapter)).length;
  const readiness = selectedChapters.length ? Math.round(completedChapters / selectedChapters.length * Number(config.targetScore || 80)) : 0;
  const daysLeft = Math.max(0, Math.ceil(((/* @__PURE__ */ new Date(`${config.targetDate}T00:00:00`)).getTime() - now) / 864e5));
  const pending = STUDY_PATH.filter((node) => !state.studyPathProgress[node.id]);
  const todayResponses = (state.examResponses || []).filter((response) => response.date === today);
  const latestToday = {};
  todayResponses.forEach((response) => {
    latestToday[response.nodeId] = response;
  });
  const missed = STUDY_PATH.filter((node) => latestToday[node.id]?.completed === false && !state.studyPathProgress[node.id]);
  const focusNode = missed[0] || pending[0];
  const breakDays = Math.max(0, daysLeft - pending.length);
  const activeStudyDays = Math.max(1, daysLeft - breakDays);
  const stepsPerDay = pending.length ? Math.ceil(pending.length / activeStudyDays) : 0;
  const updateConfig = (change) => onConfig({ ...config, ...change });
  const subjectChapterList = (subject) => chapters.filter((chapter) => chapter.subject === subject);
  return /* @__PURE__ */ jsx2("section", { className: "exam-view", children: [
    /* @__PURE__ */ jsx2("div", { className: "exam-heading", children: [
      /* @__PURE__ */ jsx2("div", { children: [
        /* @__PURE__ */ jsx2("p", { className: "eyebrow", children: "EXAM PREPARATION ENGINE" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 837,
          columnNumber: 40
        }, this),
        /* @__PURE__ */ jsx2("h1", { children: "Exams & Mock Tests" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 837,
          columnNumber: 90
        }, this),
        /* @__PURE__ */ jsx2("p", { children: "Shape your readiness around your target date." }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 837,
          columnNumber: 121
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 837,
        columnNumber: 35
      }, this),
      /* @__PURE__ */ jsx2("div", { className: "exam-target-pill", children: [
        /* @__PURE__ */ jsx2(Target, { size: 14 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 837,
          columnNumber: 213
        }, this),
        config.type
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 837,
        columnNumber: 179
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 837,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsx2("div", { className: "exam-layout", children: [
      /* @__PURE__ */ jsx2("div", { className: "exam-main-column", children: [
        /* @__PURE__ */ jsx2("section", { className: "exam-config-card", children: [
          /* @__PURE__ */ jsx2("div", { className: "exam-card-heading", children: [
            /* @__PURE__ */ jsx2("div", { children: [
              /* @__PURE__ */ jsx2("span", { className: "exam-section-index", children: "01" }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 841,
                columnNumber: 51
              }, this),
              /* @__PURE__ */ jsx2("div", { children: [
                /* @__PURE__ */ jsx2("h2", { children: "Exam configuration" }, void 0, false, {
                  fileName: "<stdin>",
                  lineNumber: 841,
                  columnNumber: 102
                }, this),
                /* @__PURE__ */ jsx2("p", { children: "Set the shape of your target." }, void 0, false, {
                  fileName: "<stdin>",
                  lineNumber: 841,
                  columnNumber: 129
                }, this)
              ] }, void 0, true, {
                fileName: "<stdin>",
                lineNumber: 841,
                columnNumber: 97
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 841,
              columnNumber: 46
            }, this),
            /* @__PURE__ */ jsx2(SlidersHorizontal, { size: 17 }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 841,
              columnNumber: 177
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 841,
            columnNumber: 11
          }, this),
          /* @__PURE__ */ jsx2("div", { className: "exam-config-grid", children: [
            /* @__PURE__ */ jsx2("div", { className: "field", children: [
              /* @__PURE__ */ jsx2("label", { htmlFor: "exam-type", children: "Exam type" }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 843,
                columnNumber: 36
              }, this),
              /* @__PURE__ */ jsx2("select", { id: "exam-type", value: config.type, onChange: (event) => updateConfig({ type: event.target.value }), children: [
                /* @__PURE__ */ jsx2("option", { children: "JEE Main" }, void 0, false, {
                  fileName: "<stdin>",
                  lineNumber: 843,
                  columnNumber: 188
                }, this),
                /* @__PURE__ */ jsx2("option", { children: "JEE Advanced" }, void 0, false, {
                  fileName: "<stdin>",
                  lineNumber: 843,
                  columnNumber: 213
                }, this)
              ] }, void 0, true, {
                fileName: "<stdin>",
                lineNumber: 843,
                columnNumber: 80
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 843,
              columnNumber: 13
            }, this),
            /* @__PURE__ */ jsx2("div", { className: "field", children: [
              /* @__PURE__ */ jsx2("label", { htmlFor: "exam-target-date", children: "Target date" }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 844,
                columnNumber: 36
              }, this),
              /* @__PURE__ */ jsx2("input", { id: "exam-target-date", type: "date", value: config.targetDate, onChange: (event) => updateConfig({ targetDate: event.target.value }) }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 844,
                columnNumber: 89
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 844,
              columnNumber: 13
            }, this),
            /* @__PURE__ */ jsx2("div", { className: "field", children: [
              /* @__PURE__ */ jsx2("label", { htmlFor: "exam-duration", children: "Duration (minutes)" }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 845,
                columnNumber: 36
              }, this),
              /* @__PURE__ */ jsx2("input", { id: "exam-duration", type: "number", min: "30", max: "600", step: "15", value: config.duration, onChange: (event) => updateConfig({ duration: Math.min(600, Math.max(30, Number(event.target.value) || 30)) }) }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 845,
                columnNumber: 93
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 845,
              columnNumber: 13
            }, this),
            /* @__PURE__ */ jsx2("div", { className: "field", children: [
              /* @__PURE__ */ jsx2("label", { htmlFor: "target-score", children: "Target score (%)" }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 846,
                columnNumber: 36
              }, this),
              /* @__PURE__ */ jsx2("input", { id: "target-score", type: "number", min: "1", max: "100", value: config.targetScore, onChange: (event) => updateConfig({ targetScore: Math.min(100, Math.max(1, Number(event.target.value) || 1)) }) }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 846,
                columnNumber: 90
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 846,
              columnNumber: 13
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 842,
            columnNumber: 11
          }, this),
          /* @__PURE__ */ jsx2("div", { className: "field exam-subject-field", children: [
            /* @__PURE__ */ jsx2("span", { className: "field-label", children: "Subject filters" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 848,
              columnNumber: 53
            }, this),
            /* @__PURE__ */ jsx2("div", { className: "pill-group", children: modeSubjects.map((subject) => /* @__PURE__ */ jsx2("button", { className: `pill-choice ${selectedSubjects.includes(subject) ? "selected" : ""}`, onClick: () => updateConfig({ subjects: selectedSubjects.includes(subject) ? config.subjects.filter((item) => item !== subject && !(subject === "Mathematics" && item === "Maths")) : [...config.subjects, subject] }), children: subject }, subject, false, {
              fileName: "<stdin>",
              lineNumber: 848,
              columnNumber: 160
            }, this)) }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 848,
              columnNumber: 105
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 848,
            columnNumber: 11
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 840,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsx2("section", { className: "readiness-card", children: [
          /* @__PURE__ */ jsx2("div", { className: "readiness-summary", children: [
            /* @__PURE__ */ jsx2("div", { children: [
              /* @__PURE__ */ jsx2("span", { className: "exam-section-index", children: "02" }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 851,
                columnNumber: 51
              }, this),
              /* @__PURE__ */ jsx2("h2", { children: "Readiness score" }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 851,
                columnNumber: 97
              }, this),
              /* @__PURE__ */ jsx2("p", { children: [
                completedChapters,
                " of ",
                selectedChapters.length,
                " target chapters complete \xB7 ",
                config.targetScore,
                "% goal"
              ] }, void 0, true, {
                fileName: "<stdin>",
                lineNumber: 851,
                columnNumber: 121
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 851,
              columnNumber: 46
            }, this),
            /* @__PURE__ */ jsx2("div", { className: "readiness-score", children: [
              readiness,
              /* @__PURE__ */ jsx2("small", { children: "%" }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 851,
                columnNumber: 280
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 851,
              columnNumber: 236
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 851,
            columnNumber: 11
          }, this),
          /* @__PURE__ */ jsx2("div", { className: "readiness-track", children: /* @__PURE__ */ jsx2("span", { style: { width: `${readiness}%` } }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 852,
            columnNumber: 44
          }, this) }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 852,
            columnNumber: 11
          }, this),
          /* @__PURE__ */ jsx2("div", { className: "skill-tree", children: [
            /* @__PURE__ */ jsx2("div", { className: "skill-tree-head", children: [
              /* @__PURE__ */ jsx2("strong", { children: "Skill tree" }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 853,
                columnNumber: 72
              }, this),
              /* @__PURE__ */ jsx2("span", { children: "Chapter completion by subject" }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 853,
                columnNumber: 99
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 853,
              columnNumber: 39
            }, this),
            /* @__PURE__ */ jsx2("div", { className: "skill-tree-grid", children: subjects.filter((subject) => config.subjects.includes(subject)).map((subject) => {
              const list = subjectChapterList(subject);
              const done = list.filter((chapter) => chapterIsComplete(state.syllabusProgress[chapter.id] || {}, chapter)).length;
              const percent = list.length ? Math.round(done / list.length * 100) : 0;
              return /* @__PURE__ */ jsx2("div", { className: "skill-node", children: [
                /* @__PURE__ */ jsx2("div", { className: "skill-node-head", children: [
                  /* @__PURE__ */ jsx2("span", { className: `skill-node-icon ${subject.toLowerCase()}`, children: subject[0] }, void 0, false, {
                    fileName: "<stdin>",
                    lineNumber: 857,
                    columnNumber: 95
                  }, this),
                  /* @__PURE__ */ jsx2("strong", { children: subject }, void 0, false, {
                    fileName: "<stdin>",
                    lineNumber: 857,
                    columnNumber: 175
                  }, this),
                  /* @__PURE__ */ jsx2("small", { children: [
                    percent,
                    "%"
                  ] }, void 0, true, {
                    fileName: "<stdin>",
                    lineNumber: 857,
                    columnNumber: 201
                  }, this)
                ] }, void 0, true, {
                  fileName: "<stdin>",
                  lineNumber: 857,
                  columnNumber: 62
                }, this),
                /* @__PURE__ */ jsx2("div", { className: "skill-track", children: /* @__PURE__ */ jsx2("i", { style: { width: `${percent}%` } }, void 0, false, {
                  fileName: "<stdin>",
                  lineNumber: 857,
                  columnNumber: 261
                }, this) }, void 0, false, {
                  fileName: "<stdin>",
                  lineNumber: 857,
                  columnNumber: 232
                }, this),
                /* @__PURE__ */ jsx2("span", { className: "skill-node-count", children: [
                  done,
                  " / ",
                  list.length,
                  " chapters"
                ] }, void 0, true, {
                  fileName: "<stdin>",
                  lineNumber: 857,
                  columnNumber: 305
                }, this)
              ] }, subject, true, {
                fileName: "<stdin>",
                lineNumber: 857,
                columnNumber: 20
              }, this);
            }) }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 853,
              columnNumber: 147
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 853,
            columnNumber: 11
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 850,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsx2("section", { className: "study-path-card", children: [
          /* @__PURE__ */ jsx2("div", { className: "exam-card-heading", children: [
            /* @__PURE__ */ jsx2("div", { children: [
              /* @__PURE__ */ jsx2("span", { className: "exam-section-index", children: "03" }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 861,
                columnNumber: 51
              }, this),
              /* @__PURE__ */ jsx2("div", { children: [
                /* @__PURE__ */ jsx2("h2", { children: "Interactive study path" }, void 0, false, {
                  fileName: "<stdin>",
                  lineNumber: 861,
                  columnNumber: 102
                }, this),
                /* @__PURE__ */ jsx2("p", { children: "Log today\u2019s lesson response to keep your plan adaptive." }, void 0, false, {
                  fileName: "<stdin>",
                  lineNumber: 861,
                  columnNumber: 133
                }, this)
              ] }, void 0, true, {
                fileName: "<stdin>",
                lineNumber: 861,
                columnNumber: 97
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 861,
              columnNumber: 46
            }, this),
            /* @__PURE__ */ jsx2("span", { className: "path-completion", children: [
              Object.values(state.studyPathProgress).filter(Boolean).length,
              "/",
              STUDY_PATH.length
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 861,
              columnNumber: 207
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 861,
            columnNumber: 11
          }, this),
          /* @__PURE__ */ jsx2("div", { className: "path-list", children: STUDY_PATH.map((node, index) => {
            const Icon = node.icon;
            const done = Boolean(state.studyPathProgress[node.id]);
            const response = latestToday[node.id];
            return /* @__PURE__ */ jsx2("article", { className: `path-node ${done ? "done" : ""} ${response?.completed === false ? "missed" : ""}`, children: [
              /* @__PURE__ */ jsx2("div", { className: "path-node-rail", children: [
                /* @__PURE__ */ jsx2("span", { className: "path-node-index", children: done ? /* @__PURE__ */ jsx2(Check, { size: 12 }, void 0, false, {
                  fileName: "<stdin>",
                  lineNumber: 867,
                  columnNumber: 89
                }, this) : String(index + 1).padStart(2, "0") }, void 0, false, {
                  fileName: "<stdin>",
                  lineNumber: 867,
                  columnNumber: 47
                }, this),
                index < STUDY_PATH.length - 1 && /* @__PURE__ */ jsx2("i", {}, void 0, false, {
                  fileName: "<stdin>",
                  lineNumber: 867,
                  columnNumber: 187
                }, this)
              ] }, void 0, true, {
                fileName: "<stdin>",
                lineNumber: 867,
                columnNumber: 15
              }, this),
              /* @__PURE__ */ jsx2("div", { className: "path-node-icon", children: /* @__PURE__ */ jsx2(Icon, { size: 15 }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 868,
                columnNumber: 47
              }, this) }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 868,
                columnNumber: 15
              }, this),
              /* @__PURE__ */ jsx2("div", { className: "path-node-copy", children: [
                /* @__PURE__ */ jsx2("strong", { children: node.label }, void 0, false, {
                  fileName: "<stdin>",
                  lineNumber: 869,
                  columnNumber: 47
                }, this),
                /* @__PURE__ */ jsx2("span", { children: [
                  node.sub,
                  response ? ` \xB7 ${response.completed ? "Done today" : "Moved forward"}` : ""
                ] }, void 0, true, {
                  fileName: "<stdin>",
                  lineNumber: 869,
                  columnNumber: 76
                }, this)
              ] }, void 0, true, {
                fileName: "<stdin>",
                lineNumber: 869,
                columnNumber: 15
              }, this),
              /* @__PURE__ */ jsx2("div", { className: "path-node-actions", children: [
                /* @__PURE__ */ jsx2("button", { className: done ? "done-response" : "", onClick: () => onPathResponse(node.id, true), children: done ? "Done" : "Done today" }, void 0, false, {
                  fileName: "<stdin>",
                  lineNumber: 870,
                  columnNumber: 50
                }, this),
                !done && /* @__PURE__ */ jsx2("button", { className: response?.completed === false ? "missed-response" : "", onClick: () => onPathResponse(node.id, false), children: "Not yet" }, void 0, false, {
                  fileName: "<stdin>",
                  lineNumber: 870,
                  columnNumber: 193
                }, this)
              ] }, void 0, true, {
                fileName: "<stdin>",
                lineNumber: 870,
                columnNumber: 15
              }, this)
            ] }, node.id, true, {
              fileName: "<stdin>",
              lineNumber: 866,
              columnNumber: 20
            }, this);
          }) }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 862,
            columnNumber: 11
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 860,
          columnNumber: 9
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 839,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx2("aside", { className: "exam-side-column", children: [
        /* @__PURE__ */ jsx2("section", { className: "reschedule-card", children: [
          /* @__PURE__ */ jsx2("span", { className: "reschedule-kicker", children: [
            /* @__PURE__ */ jsx2(Activity, { size: 13 }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 877,
              columnNumber: 47
            }, this),
            " DYNAMIC PLANNER"
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 877,
            columnNumber: 11
          }, this),
          /* @__PURE__ */ jsx2("h2", { children: "Your plan, in motion." }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 878,
            columnNumber: 11
          }, this),
          /* @__PURE__ */ jsx2("p", { children: "Daily check-ins adjust your next steps and leave room for breaks." }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 879,
            columnNumber: 11
          }, this),
          /* @__PURE__ */ jsx2("div", { className: "reschedule-focus", children: [
            /* @__PURE__ */ jsx2("span", { children: "UP NEXT" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 880,
              columnNumber: 45
            }, this),
            /* @__PURE__ */ jsx2("strong", { children: focusNode?.label || "Review your knowledge gaps" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 880,
              columnNumber: 65
            }, this),
            /* @__PURE__ */ jsx2("small", { children: missed.length ? "Moved forward from today\u2019s check-in" : "Based on your remaining study path" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 880,
              columnNumber: 132
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 880,
            columnNumber: 11
          }, this),
          /* @__PURE__ */ jsx2("div", { className: "reschedule-stats", children: [
            /* @__PURE__ */ jsx2("div", { children: [
              /* @__PURE__ */ jsx2("strong", { children: daysLeft }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 881,
                columnNumber: 50
              }, this),
              /* @__PURE__ */ jsx2("span", { children: "days left" }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 881,
                columnNumber: 77
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 881,
              columnNumber: 45
            }, this),
            /* @__PURE__ */ jsx2("div", { children: [
              /* @__PURE__ */ jsx2("strong", { children: breakDays }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 881,
                columnNumber: 110
              }, this),
              /* @__PURE__ */ jsx2("span", { children: "break days" }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 881,
                columnNumber: 138
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 881,
              columnNumber: 105
            }, this),
            /* @__PURE__ */ jsx2("div", { children: [
              /* @__PURE__ */ jsx2("strong", { children: stepsPerDay }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 881,
                columnNumber: 172
              }, this),
              /* @__PURE__ */ jsx2("span", { children: "steps / day" }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 881,
                columnNumber: 202
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 881,
              columnNumber: 167
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 881,
            columnNumber: 11
          }, this),
          /* @__PURE__ */ jsx2("div", { className: "reschedule-note", children: [
            /* @__PURE__ */ jsx2(CalendarDays, { size: 14 }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 882,
              columnNumber: 44
            }, this),
            /* @__PURE__ */ jsx2("span", { children: pending.length ? `${pending.length} path steps remain. Your focus shifts as you log each day.` : "Your study path is complete. Keep a little space for review." }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 882,
              columnNumber: 70
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 882,
            columnNumber: 11
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 876,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsx2("section", { className: "exam-quick-card", children: [
          /* @__PURE__ */ jsx2("span", { children: "DAILY RESPONSES" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 884,
            columnNumber: 46
          }, this),
          /* @__PURE__ */ jsx2("strong", { children: [
            todayResponses.filter((response) => response.completed).length,
            " done \xB7 ",
            todayResponses.filter((response) => !response.completed).length,
            " moved"
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 884,
            columnNumber: 74
          }, this),
          /* @__PURE__ */ jsx2("small", { children: "Responses are saved for today and shape your next focus." }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 884,
            columnNumber: 234
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 884,
          columnNumber: 9
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 875,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 838,
      columnNumber: 5
    }, this)
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 836,
    columnNumber: 10
  }, this);
}
function DashboardApp() {
  const [activeSyncCode, setActiveSyncCode] = useState(readActiveSyncCode);
  const [appState, setAppState] = useState(() => getInitialState(activeSyncCode ? syncStorageKey(activeSyncCode) : STORAGE_KEY));
  const [view, setView] = useState("today");
  const [activeEditId, setActiveEditId] = useState(null);
  const appTouchStartRef = useRef(null);
  const sidebarCloseTimerRef = useRef(null);
  const previousViewRef = useRef("today");
  const daysScrollRef = useRef(null);
  const [modal, setModal] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => () => window.clearTimeout(sidebarCloseTimerRef.current), []);
  const closeSidebar = () => {
    const backdrop = document.querySelector(".sidebar-backdrop");
    const drawer = backdrop?.querySelector(".sidebar-drawer");
    if (!drawer) { setSidebarOpen(false); return; }
    window.clearTimeout(sidebarCloseTimerRef.current);
    backdrop.classList.remove("sidebar-swiping");
    backdrop.classList.add("sidebar-closing");
    drawer.style.transform = "translate3d(-100%, 0, 0)";
    backdrop.style.opacity = "0";
    sidebarCloseTimerRef.current = window.setTimeout(() => setSidebarOpen(false), 300);
  };
  const [confirmAction, setConfirmAction] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [focusTask, setFocusTask] = useState(null);
  const [patchDraft, setPatchDraft] = useState(null);
  const [patchDetail, setPatchDetail] = useState(null);
  const [patchFilter, setPatchFilter] = useState("All");
  const [toast, setToast] = useState("");
  const latestAppStateRef = useRef(appState);
  const activeSyncCodeRef = useRef(activeSyncCode);
  const persistJobRef = useRef(null);
  latestAppStateRef.current = appState;
  activeSyncCodeRef.current = activeSyncCode;
  const profile = appState.profile;
  const isNeetMode = profile?.target === "NEET";
  const subjectOptions = isNeetMode ? NEET_SUBJECTS : JEE_SUBJECTS;
  useEffect(() => {
    setPatchFilter("All");
  }, [isNeetMode]);
  useEffect(() => {
    const save = () => {
      persistJobRef.current = null;
      try {
        localStorage.setItem(activeSyncCodeRef.current ? syncStorageKey(activeSyncCodeRef.current) : STORAGE_KEY, JSON.stringify(latestAppStateRef.current));
      } catch (error) {
        console.warn("Could not save app state:", error);
      }
    };
    const cancelPendingSave = () => {
      const job = persistJobRef.current;
      if (!job) return;
      clearTimeout(job.timer);
      if (job.idleId !== null && "cancelIdleCallback" in window) window.cancelIdleCallback(job.idleId);
      persistJobRef.current = null;
    };
    cancelPendingSave();
    const job = { timer: null, idleId: null };
    job.timer = window.setTimeout(() => {
      if ("requestIdleCallback" in window) {
        job.idleId = window.requestIdleCallback(save, { timeout: 1200 });
      } else {
        save();
      }
    }, 180);
    persistJobRef.current = job;
    return cancelPendingSave;
  }, [appState, activeSyncCode]);
  useEffect(() => {
    const flush = () => {
      const job = persistJobRef.current;
      if (!job) return;
      clearTimeout(job.timer);
      if (job.idleId !== null && "cancelIdleCallback" in window) window.cancelIdleCallback(job.idleId);
      persistJobRef.current = null;
      try {
        localStorage.setItem(activeSyncCodeRef.current ? syncStorageKey(activeSyncCodeRef.current) : STORAGE_KEY, JSON.stringify(latestAppStateRef.current));
      } catch (error) {
        console.warn("Could not save app state:", error);
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", appState.settings?.mode === "dark");
    root.dataset.theme = ({ amber: "warm-orange", cosmic: "warm-orange", galaxy: "mesh-gradient" })[appState.settings?.theme] || appState.settings?.theme || "forest";
    root.dataset.mode = appState.settings?.mode || "light";
    root.dataset.contrast = appState.settings?.highContrast ? "high" : "normal";
    root.dataset.fontSize = appState.settings?.fontSize || "medium";
  }, [appState.settings]);
  useEffect(() => {
    if (!toast) return void 0;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  const updateState = (updater) => setAppState((current) => typeof updater === "function" ? updater(current) : { ...current, ...updater });
  const connectSyncCode = (code) => {
    if (!/^\d{4,6}$/.test(code)) return;
    const storageKey = syncStorageKey(code);
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    } catch (error) {
      console.warn("Could not read sync profile data:", error);
    }
    const nextState = saved && typeof saved === "object" ? getInitialState(storageKey) : latestAppStateRef.current;
    activeSyncCodeRef.current = code;
    setActiveSyncCode(code);
    try {
      localStorage.setItem(ACTIVE_SYNC_CODE_KEY, code);
      localStorage.setItem(storageKey, JSON.stringify(nextState));
    } catch (error) {
      console.warn("Could not save sync profile data:", error);
    }
    latestAppStateRef.current = nextState;
    setAppState(nextState);
    setToast(`Loaded local profile ${code}`);
  };
  const goToday = () => {
    setView("today");
    updateState((state) => ({ ...state, selectedDate: dateKey() }));
  };
  useEffect(() => {
    const goHome = goToday;
    window.addEventListener("apex-home", goHome);
    return () => window.removeEventListener("apex-home", goHome);
  }, []);
  const settings = { ...appState.settings || { theme: "forest", mode: "light", highContrast: false, fontSize: "medium", planLength: 8, dayOne: dateKey() }, aiModelPrefs: { ...DEFAULT_MODEL_PREFERENCES, ...appState.settings?.aiModelPrefs } };
  const selectedDate = appState.selectedDate || dateKey();
  const tasksForToday = appState.tasks.filter((task) => task.date === selectedDate || !task.date && selectedDate === dateKey());
  const sortedTasks = [...tasksForToday].sort((a, b) => Number(a.completed) - Number(b.completed));
  const completedToday = tasksForToday.filter((task) => task.completed).length;
  const dashboardExamDate = useMemo(() => {
    if (!isNeetMode) return "2027-01-20";
    try { return localStorage.getItem("apexjee-exam-date-neet") || "2027-05-02"; } catch { return "2027-05-02"; }
  }, [isNeetMode]);
  const dashboardExamDaysLeft = Math.max(0, Math.ceil(((/* @__PURE__ */ new Date(`${dashboardExamDate}T23:59:59`)).getTime() - Date.now()) / 864e5));
  const activeDays = useMemo(() => {
    const existing = new Map(appState.days.map((day) => [day.date, day]));
    const firstConfiguredDay = new Date(`${settings.dayOne || dateKey()}T12:00:00`);
    const lastConfiguredDay = addDays(firstConfiguredDay, Math.max(1, Number(settings.planLength) || 8) - 1);
    const dates = [dateKey(), dateKey(firstConfiguredDay), dateKey(lastConfiguredDay), ...appState.tasks.map((task) => task.date).filter(Boolean), ...appState.days.filter((day) => day.intention).map((day) => day.date)].sort();
    const first = new Date(`${dates[0]}T12:00:00`);
    const last = new Date(`${dates.at(-1)}T12:00:00`);
    const length = Math.max(1, Math.round((last - first) / 864e5) + 1);
    return createDaysFrom(dateKey(first), length).map((day) => existing.get(day.date) || day)
      .filter((day) => !(appState.deletedDayDates || []).includes(day.date));
  }, [appState.days, appState.tasks, appState.deletedDayDates, settings.dayOne, settings.planLength]);
  useEffect(() => {
    if (view === "today") {
      const today = dateKey();
      if (appState.selectedDate !== today) updateState((state) => ({ ...state, selectedDate: today }));
    }
  }, [view]);
  useLayoutEffect(() => {
    if (view !== "today") return;
    const scroller = daysScrollRef.current;
    const selected = scroller?.querySelector(".day-chip.selected");
    if (scroller && selected) scroller.scrollTo({ left: selected.offsetLeft - scroller.offsetLeft - (scroller.clientWidth - selected.clientWidth) / 2, behavior: "auto" });
  }, [view, selectedDate, activeDays.length]);
  const closeModal = () => setModal(null);
  const commitStateImmediately = (nextState) => {
    latestAppStateRef.current = nextState;
    setAppState(nextState);
    const storageKey = activeSyncCodeRef.current ? syncStorageKey(activeSyncCodeRef.current) : STORAGE_KEY;
    try {
      localStorage.setItem(storageKey, JSON.stringify(nextState));
    } catch (error) {
      console.warn("Could not immediately save app state:", error);
    }
  };
  const changeSettings = (nextSettings) => {
    const { apiKey: _privateKey, groqApiKeys: _privateGroqKeys, geminiApiKeys: _privateGeminiKeys, ...safeSettings } = nextSettings;
    updateState((state) => ({ ...state, settings: safeSettings, selectedDate: nextSettings.dayOne !== state.settings.dayOne ? nextSettings.dayOne : state.selectedDate }));
  };
  const resetDayOne = () => changeSettings({ ...settings, dayOne: dateKey() });
  const updateModelPrefs = (aiModelPrefs) => changeSettings({ ...settings, aiModelPrefs });
  const runConfirmAction = () => {
    const state = latestAppStateRef.current;
    if (confirmAction === "mastery") {
      const nextState = {
        ...state,
        dailyMinutes: {},
        dailySubjectMinutes: {},
        sessions: [],
        tasks: [],
        syllabusProgress: Object.fromEntries(Object.entries(state.syllabusProgress).map(([id, entry]) => [id, { bookmarked: Boolean(entry.bookmarked) }])),
        memoryProgress: {},
        examResponses: [],
        studyPathProgress: {},
        practiceTargets: state.practiceTargets.map((target) => ({ ...target, correct: 0, incorrect: 0, skipped: 0 })),
        diagnostics: (state.diagnostics || []).map((item) => ({
          ...item,
          confidence: 1,
          resolvedAt: null,
          queuedTaskId: null
        }))
      };
      commitStateImmediately(nextState);
      setToast("Mastery data cleared");
    } else if (confirmAction === "planner") {
      const today = dateKey();
      const nextState = {
        ...state,
        tasks: [],
        days: createDaysFrom(today, 8),
        selectedDate: today,
        settings: { ...state.settings, planLength: 8, dayOne: today },
        examConfig: { type: "JEE Main", targetDate: "2027-01-20", duration: 180, subjects: ["Physics", "Chemistry", "Mathematics"], targetScore: 80 },
        astraConfig: null,
        studyPathProgress: {},
        examResponses: [],
        practiceTargets: [],
        memorySelection: { subject: null, classLevel: null, chapterId: null },
        diagnostics: []
      };
      commitStateImmediately(nextState);
      setToast("Planner reset");
    }
    setConfirmAction(null);
  };
  const addTask = (task) => {
    updateState((state) => {
      const existing = state.tasks.find((item) => item.id === task.id);
      let next = state;
      if (existing?.completed) {
        const loggedDay = existing.completedAt || dateKey();
        next = adjustStudyMetrics(next, loggedDay, existing.subject, -Number(existing.duration || 0));
      }
      const saveTask = existing?.completed ? { ...task, completedAt: existing.completedAt || dateKey() } : task;
      if (saveTask.completed) {
        next = adjustStudyMetrics(next, saveTask.completedAt || dateKey(), saveTask.subject, Number(saveTask.duration || 0));
      }
      return { ...next, tasks: [...next.tasks.filter((item) => item.id !== task.id), saveTask] };
    });
    setModal(null);
    setEditingTask(null);
    setToast(editingTask ? "Task updated" : "Task added");
  };
  const toggleTask = (id) => {
    const currentTask = appState.tasks.find((task) => task.id === id);
    updateState((state) => {
      const oldTask = state.tasks.find((task) => task.id === id);
      if (!oldTask) return state;
      const completed = !oldTask.completed;
      const loggedDay = oldTask.completedAt || dateKey();
      let next = completed ? adjustStudyMetrics(state, dateKey(), oldTask.subject, Number(oldTask.duration || 0)) : adjustStudyMetrics(state, loggedDay, oldTask.subject, -Number(oldTask.duration || 0));
      const tasks = next.tasks.map((task) => task.id === id ? { ...task, completed, completedAt: completed ? dateKey() : null } : task);
      const diagnostics = (next.diagnostics || []).map((item) => item.queuedTaskId === id || oldTask.diagnosticId === item.id ? { ...item, queuedTaskId: completed ? null : id, resolvedAt: completed ? dateKey() : null } : item);
      return { ...next, tasks, diagnostics };
    });
    if (currentTask && !currentTask.completed) setToast("Task complete. Your consistency is building.");
  };
  const deleteTask = (id) => {
    updateState((state) => ({ ...state, tasks: state.tasks.filter((task) => task.id !== id), diagnostics: (state.diagnostics || []).map((item) => item.queuedTaskId === id ? { ...item, queuedTaskId: null } : item) }));
    setToast("Task deleted");
  };
  const updateSyllabusProgress = (id, changes) => updateState((state) => ({
    ...state,
    syllabusProgress: {
      ...state.syllabusProgress,
      [id]: { ...state.syllabusProgress[id] || {}, ...changes }
    }
  }));
  const addCustomChapter = (details) => {
    const id = `custom-${crypto.randomUUID()}`;
    updateState((state) => ({
      ...state,
      customChapters: [...state.customChapters, { ...details, id, exam: "both", custom: true, advancedOnly: false }]
    }));
    setToast("Chapter added to your syllabus");
  };
  const deleteSyllabusChapter = (chapter) => {
    updateState((state) => ({
      ...state,
      customChapters: chapter.custom ? state.customChapters.filter((item) => item.id !== chapter.id) : state.customChapters,
      deletedChapterIds: chapter.custom ? state.deletedChapterIds : [.../* @__PURE__ */ new Set([...state.deletedChapterIds, chapter.id])],
      syllabusProgress: Object.fromEntries(Object.entries(state.syllabusProgress).filter(([id]) => id !== chapter.id)),
      memorySelection: state.memorySelection.chapterId === chapter.id ? { subject: null, classLevel: null, chapterId: null } : state.memorySelection,
      practiceTargets: state.practiceTargets.filter((target) => target.chapterId !== chapter.id)
    }));
    setToast("Chapter deleted");
  };
  const uploadHandbook = async (subject, file) => {
    const id = crypto.randomUUID();
    const dataUrl = await fileToDataUrl(file);
    await saveLocalFile(id, dataUrl);
    const document2 = { id, localFileId: id, subject, name: file.name, size: file.size, url: "", uploadedAt: dateKey() };
    updateState((state) => ({ ...state, handbookDocs: [...state.handbookDocs, document2] }));
    setToast("PDF added to your handbook");
  };
  const deleteHandbook = (id) => {
    const target = appState.handbookDocs.find((document2) => document2.id === id);
    if (target?.localFileId) deleteLocalFile(target.localFileId).catch((error) => console.warn("Could not remove local PDF:", error));
    updateState((state) => ({ ...state, handbookDocs: state.handbookDocs.filter((document2) => document2.id !== id) }));
    setToast("PDF removed from your handbook");
  };
  const recordPathResponse = (nodeId, completed) => {
    const date = dateKey();
    updateState((state) => ({
      ...state,
      studyPathProgress: completed ? { ...state.studyPathProgress, [nodeId]: true } : state.studyPathProgress,
      examResponses: [
        ...state.examResponses.filter((response) => !(response.nodeId === nodeId && response.date === date)),
        { id: crypto.randomUUID(), nodeId, date, completed, recordedAt: (/* @__PURE__ */ new Date()).toISOString() }
      ]
    }));
    setToast(completed ? "Study path updated" : "Plan adjusted for tomorrow");
  };
  const setMemorySelection = (memorySelection) => updateState((state) => ({ ...state, memorySelection }));
  const saveMemoryDeck = (chapterId, deck) => {
    updateState((state) => ({ ...state, memoryDecks: { ...state.memoryDecks, [chapterId]: deck } }));
  };
  const saveMemoryProgress = (chapterId, progress) => updateState((state) => ({ ...state, memoryProgress: { ...state.memoryProgress, [chapterId]: progress } }));
  const markSession = (minutes) => {
    updateState((state) => ({
      ...adjustStudyMetrics(state, dateKey(), focusTask?.subject, Number(minutes)),
      sessions: [...state.sessions, { id: crypto.randomUUID(), date: dateKey(), minutes, taskId: focusTask?.id || null, subject: focusTask?.subject || null }]
    }));
    setToast("Focus session complete. Nice work!");
  };
  const addDiagnostic = (details) => {
    const item = { id: crypto.randomUUID(), ...details, confidence: 1, createdAt: dateKey(), sourceTaskId: details.sourceTaskId || null, queuedTaskId: null, resolvedAt: null };
    updateState((state) => ({ ...state, diagnostics: [...state.diagnostics || [], item] }));
    setModal(null);
    setPatchDraft(null);
    setToast("Added to your Patch list");
  };
  const updateDiagnostic = (id, changes) => updateState((state) => ({
    ...state,
    diagnostics: (state.diagnostics || []).map((item) => item.id === id ? { ...item, ...changes } : item)
  }));
  const deleteDiagnostic = (id) => {
    updateState((state) => ({
      ...state,
      diagnostics: (state.diagnostics || []).filter((item) => item.id !== id),
      tasks: state.tasks.map((task) => task.diagnosticId === id ? (({ diagnosticId, ...rest }) => rest)(task) : task)
    }));
    setToast("Patch entry deleted");
  };
  const startPatch = (task, category) => {
    setPatchDraft({ title: task.title, subject: task.subject || "Physics", category, sourceTaskId: task.id });
    setModal("patch");
  };
  const queueDiagnostic = (item) => {
    const queued = appState.tasks.find((task2) => task2.id === item.queuedTaskId);
    if (queued && !queued.completed) {
      setView("tasks");
      setToast("Targeted practice is in your queue");
      return;
    }
    const task = {
      id: crypto.randomUUID(),
      title: `Re-solve: ${item.title}`,
      subject: item.subject,
      date: dateKey(),
      duration: 30,
      priority: "High",
      completed: false,
      revision: true,
      targetedPractice: true,
      diagnosticId: item.id,
      time: ""
    };
    updateState((state) => ({
      ...state,
      tasks: [...state.tasks, task],
      diagnostics: (state.diagnostics || []).map((entry) => entry.id === item.id ? { ...entry, queuedTaskId: task.id, resolvedAt: null } : entry)
    }));
    setView("tasks");
    setToast("Targeted practice added to your queue");
  };
  const streak = useMemo(() => {
    const studied = new Set(Object.entries(appState.dailyMinutes).filter(([, minutes]) => Number(minutes) > 0).map(([date]) => date));
    let cursor = /* @__PURE__ */ new Date();
    if (!studied.has(dateKey(cursor))) cursor = addDays(cursor, -1);
    let count = 0;
    while (studied.has(dateKey(cursor))) {
      count++;
      cursor = addDays(cursor, -1);
    }
    return count;
  }, [appState.dailyMinutes]);
  const trackedMinutes = Object.values(appState.dailyMinutes || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const sessionMinutes = (appState.sessions || []).reduce((sum, session) => sum + (Number(session.minutes) || 0), 0);
  const practiceShare = trackedMinutes ? Math.round(sessionMinutes / trackedMinutes * 100) : 0;
  const taskCount = appState.tasks.length;
  const completedTaskCount = appState.tasks.filter((task) => task.completed).length;
  const unresolvedDiagnostics = (appState.diagnostics || []).filter((item) => !item.resolvedAt).length;
  const subjectDistribution = subjectTotals(appState, isNeetMode);
  const subjectMinuteTotal = Object.values(subjectDistribution).reduce((sum, value) => sum + value, 0);
  const examBase = isNeetMode ? SYLLABUS.mains : appState.examConfig.type === "JEE Advanced" ? SYLLABUS.advanced : SYLLABUS.mains;
  const activeNeetChapters = isNeetMode ? NEET_BIOLOGY_CHAPTERS.filter((chapter) => !appState.deletedChapterIds.includes(chapter.id)) : [];
  const examChapters = [
    ...examBase.filter((chapter) => !appState.deletedChapterIds.includes(chapter.id)),
    ...appState.customChapters,
    ...activeNeetChapters
  ].filter((chapter) => !isNeetMode || chapter.subject !== "Mathematics" && chapter.subject !== "Maths");
  const syllabusSource = isNeetMode ? SYLLABUS.mains : appState.syllabusMode === "advanced" ? SYLLABUS.advanced : SYLLABUS.mains;
  const syllabusChapters = [
    ...syllabusSource.filter((chapter) => !appState.deletedChapterIds.includes(chapter.id)),
    ...appState.customChapters,
    ...activeNeetChapters
  ].filter((chapter) => !isNeetMode || chapter.subject !== "Mathematics" && chapter.subject !== "Maths");
  const memoryChapters = [
    ...(isNeetMode ? SYLLABUS.mains : SYLLABUS.advanced).filter((chapter) => !appState.deletedChapterIds.includes(chapter.id)),
    ...appState.customChapters,
    ...activeNeetChapters
  ].filter((chapter) => !isNeetMode || chapter.subject !== "Mathematics" && chapter.subject !== "Maths");
  const setDayIntention = (date, intention) => {
    updateState((state) => {
      const found = state.days.some((day) => day.date === date);
      const days = found ? state.days.map((day) => day.date === date ? { ...day, intention } : day) : [...state.days, { id: `day-${date}`, date, intention }];
      return { ...state, days };
    });
    setModal(null);
    setToast("Your intention is saved");
  };
  const addDay = () => updateState((state) => {
    const latest = activeDays[activeDays.length - 1]?.date || state.settings.dayOne || dateKey();
    const next = dateKey(addDays(/* @__PURE__ */ new Date(`${latest}T12:00:00`), 1));
    if (state.days.some((item) => item.date === next)) {
      return { ...state, deletedDayDates: (state.deletedDayDates || []).filter((date) => date !== next), settings: { ...state.settings, planLength: Math.max(Number(state.settings.planLength) || 1, activeDays.length + 1) } };
    }
    return {
      ...state,
      days: [...state.days, { id: `day-${next}`, date: next, intention: "" }],
      deletedDayDates: (state.deletedDayDates || []).filter((date) => date !== next),
      settings: { ...state.settings, planLength: Math.max(Number(state.settings.planLength) || 1, activeDays.length + 1) }
    };
  });
  const handleDeleteDay = (id) => {
    const day = activeDays.find((item) => item.id === id);
    if (!day) return;
    const remainingDays = activeDays.filter((item) => item.id !== id);
    updateState((state) => ({
      ...state,
      days: state.days.filter((item) => item.id !== id && item.date !== day.date),
      deletedDayDates: [...new Set([...(state.deletedDayDates || []), day.date])],
      selectedDate: state.selectedDate === day.date ? remainingDays[0]?.date || dateKey() : state.selectedDate
    }));
    setActiveEditId(null);
  };
  const openEdit = (task) => {
    setEditingTask(task);
    setModal("task");
  };
  const countdownGreeting = (() => {
    const hour = new Date().getHours();
    return hour >= 5 && hour < 12 ? "Good morning" : hour >= 12 && hour < 17 ? "Good afternoon" : "Good evening";
  })();
  const onAppTouchStart = (event) => {
    const touch = event.touches?.[0];
    if (touch) appTouchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };
  const onAppTouchMove = (event) => {
    const start = appTouchStartRef.current;
    const touch = event.touches?.[0];
    if (!start || !touch || sidebarOpen || start.x > 28) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (dx > 10 && Math.abs(dx) > Math.abs(dy) && event.cancelable) event.preventDefault();
  };
  const onAppTouchEnd = (event) => {
    const start = appTouchStartRef.current;
    const touch = event.changedTouches?.[0];
    appTouchStartRef.current = null;
    if (sidebarOpen) return;
    if (!start || !touch || Math.abs(touch.clientY - start.y) > 70) return;
    const deltaX = touch.clientX - start.x;
    if (start.x <= 28 && deltaX > 60) setSidebarOpen(true);
  };
  return React.createElement(SubjectModeContext.Provider, { value: { isNeetMode, subjects: subjectOptions } }, React.createElement(AppSettingsContext.Provider, { value: { profile, settings, updateProfile: (next) => updateState((state) => ({ ...state, profile: next })), updateSettings: changeSettings } }, /* @__PURE__ */ jsx2("div", { className: `app-shell ${view === "assistant" ? "assistant-app-shell" : ""} ${view === "today" ? "home-app-shell" : ""} ${["today", "tasks", "insights", "revision"].includes(view) ? "primary-nav-view" : ""} ${sidebarOpen ? "sidebar-open" : ""}`, onTouchStart: onAppTouchStart, onTouchMove: onAppTouchMove, onTouchEnd: onAppTouchEnd, children: [
    /* @__PURE__ */ jsx2("header", { className: "topbar", children: /* @__PURE__ */ jsx2("div", { className: "topbar-inner", children: [
      /* @__PURE__ */ jsx2("div", { className: "brand-cluster", children: [
        /* @__PURE__ */ jsx2("button", { className: "hamburger-trigger", onClick: () => setSidebarOpen((open) => !open), "aria-label": "Open study navigation", children: React.createElement("svg", { width: 20, height: 20, viewBox: "0 0 20 20", fill: "none", "aria-hidden": "true" }, React.createElement("path", { d: "M3 5h14M6 10h11M3 15h14", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" })) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 1154,
          columnNumber: 38
        }, this),
        /* @__PURE__ */ jsx2("button", { className: "brand", onClick: goToday, "aria-label": "Apex home", children: [
          /* @__PURE__ */ jsx2("span", { children: isNeetMode ? "Apex NEET" : "Apex JEE" }, "brand-label", false, {
            fileName: "<stdin>",
            lineNumber: 1154,
            columnNumber: 319
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 1154,
          columnNumber: 175
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 1154,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx2("button", { className: "profile-trigger", onClick: () => { previousViewRef.current = view === "settings" ? previousViewRef.current : view; setView("settings"); }, "aria-label": "Open profile and settings", children: [
        /* @__PURE__ */ jsx2("span", { className: "profile-initial", children: profileInitial(profile.username) }, "profile-initial", false, {
          fileName: "<stdin>",
          lineNumber: 1155,
          columnNumber: 114
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 1155,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 1153,
      columnNumber: 32
    }, this) }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 1153,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsx2("main", { className: "main", children: [
      view === "assistant" && React.createElement(AssistantRouteBoundary, { onHome: goToday }, React.createElement(StudyCopilot, { userName: profile.username, messages: appState.copilotMessages, modelPrefs: settings.aiModelPrefs, onChange: (copilotMessages) => updateState((state) => ({ ...state, copilotMessages })), onHome: goToday })),
      view === "today" && /* @__PURE__ */ jsx2(Fragment, { children: [
        /* @__PURE__ */ jsx2("section", { className: "greeting-row", children: [
          /* @__PURE__ */ jsx2("div", { children: [
            /* @__PURE__ */ jsx2("p", { className: "eyebrow", children: [
              new Intl.DateTimeFormat(void 0, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(/* @__PURE__ */ new Date()),
              " \xB7 ",
              profile.classLevel,
              " \xB7 ",
              profile.target,
              " preparation"
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 1161,
              columnNumber: 16
            }, this),
            /* @__PURE__ */ jsx2("h1", { className: "greeting-title", children: [
              countdownGreeting,
              ", ",
              /* @__PURE__ */ jsx2("span", { children: profile.username }, "greeting-name", false, {
                fileName: "<stdin>",
                lineNumber: 1162,
                columnNumber: 65
              }, this),
              ". A little progress is enough for today."
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 1162,
              columnNumber: 13
            }, this),
            /* @__PURE__ */ jsx2("p", { className: "greeting-subtitle", children: "Your day, in focus. A little progress is enough for today." }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1163,
              columnNumber: 13
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 1161,
            columnNumber: 11
          }, this),
          /* @__PURE__ */ jsx2("div", { className: "jee-days-card", children: [
            /* @__PURE__ */ jsx2("strong", { children: dashboardExamDaysLeft }, void 0, false, { fileName: "<stdin>", lineNumber: 1166, columnNumber: 13 }, this),
            /* @__PURE__ */ jsx2("span", { children: isNeetMode ? "days left to NEET" : "days left to JEE Main" }, "days-label", false, { fileName: "<stdin>", lineNumber: 1166, columnNumber: 69 }, this)
          ] }, void 0, true, { fileName: "<stdin>", lineNumber: 1165, columnNumber: 11 }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 1160,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsx2("div", { className: "today-grid", children: [
          /* @__PURE__ */ jsx2("section", { className: "card tasks-card", children: [
            /* @__PURE__ */ jsx2("div", { className: "section-heading", children: [
              /* @__PURE__ */ jsx2("h2", { children: "Today's tasks" }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 1173,
                columnNumber: 46
              }, this),
              /* @__PURE__ */ jsx2("div", { className: "heading-actions task-header-actions", children: [
                /* @__PURE__ */ jsx2("button", { className: "button task-header-action-button w-auto flex-shrink-0 whitespace-nowrap", onClick: () => setModal("import"), children: [
                  /* @__PURE__ */ jsx2(ArrowDownToLine, { size: 13 }, void 0, false, {
                    fileName: "<stdin>",
                    lineNumber: 1174,
                    columnNumber: 77
                  }, this),
                  "Import"
                ] }, void 0, true, {
                  fileName: "<stdin>",
                  lineNumber: 1174,
                  columnNumber: 15
                }, this),
                /* @__PURE__ */ jsx2("button", { className: "button primary task-header-action-button w-auto flex-shrink-0 whitespace-nowrap", onClick: () => {
                  setEditingTask(null);
                  setModal("task");
                }, children: [
                  /* @__PURE__ */ jsx2(Plus, { size: 14 }, void 0, false, {
                    fileName: "<stdin>",
                    lineNumber: 1175,
                    columnNumber: 110
                  }, this),
                  "New task"
                ] }, void 0, true, {
                  fileName: "<stdin>",
                  lineNumber: 1175,
                  columnNumber: 15
                }, this)
              ] }, void 0, true, {
                fileName: "<stdin>",
                lineNumber: 1173,
                columnNumber: 68
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 1173,
              columnNumber: 13
            }, this),
            sortedTasks.length ? /* @__PURE__ */ jsx2("div", { className: "task-list", children: sortedTasks.map((task) => /* @__PURE__ */ jsx2(TaskRow, { task, onToggle: toggleTask, onFocus: (item) => {
              setFocusTask(item);
              setModal("focus");
            }, onEdit: openEdit, onDelete: deleteTask }, task.id, false, {
              fileName: "<stdin>",
              lineNumber: 1177,
              columnNumber: 89
            }, this)) }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1177,
              columnNumber: 35
            }, this) : /* @__PURE__ */ jsx2("div", { className: "empty-state", children: [
              /* @__PURE__ */ jsx2("div", { className: "empty-icon", children: /* @__PURE__ */ jsx2(CheckCircle2, { size: 25 }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 1178,
                columnNumber: 74
              }, this) }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 1178,
                columnNumber: 46
              }, this),
              /* @__PURE__ */ jsx2("h3", { children: "Nothing left to do." }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 1178,
                columnNumber: 106
              }, this),
              /* @__PURE__ */ jsx2("p", { children: "You gave today your full attention. Take a breath, and enjoy the space you made." }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 1178,
                columnNumber: 134
              }, this),
              /* @__PURE__ */ jsx2("button", { className: "button soft", onClick: () => {
                setEditingTask(null);
                setModal("task");
              }, children: [
                /* @__PURE__ */ jsx2(Plus, { size: 14 }, void 0, false, {
                  fileName: "<stdin>",
                  lineNumber: 1178,
                  columnNumber: 313
                }, this),
                "Add your first task"
              ] }, void 0, true, {
                fileName: "<stdin>",
                lineNumber: 1178,
                columnNumber: 221
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 1178,
              columnNumber: 17
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 1172,
            columnNumber: 11
          }, this),
          /* @__PURE__ */ jsx2("aside", { className: "side-stack", children: [
            /* @__PURE__ */ jsx2("section", { className: "card planner-card", children: [
              /* @__PURE__ */ jsx2("div", { className: "side-card-heading", children: [
                /* @__PURE__ */ jsx2("h2", { children: "Days box" }, void 0, false, {
                  fileName: "<stdin>",
                  lineNumber: 1182,
                  columnNumber: 50
                }, this),
                /* @__PURE__ */ jsx2("button", { onClick: addDay, children: [
                  /* @__PURE__ */ jsx2(Plus, { size: 12, style: { verticalAlign: "-2px" } }, void 0, false, {
                    fileName: "<stdin>",
                    lineNumber: 1182,
                    columnNumber: 92
                  }, this),
                  " Add day"
                ] }, void 0, true, {
                  fileName: "<stdin>",
                  lineNumber: 1182,
                  columnNumber: 67
                }, this)
              ] }, void 0, true, {
                fileName: "<stdin>",
                lineNumber: 1182,
                columnNumber: 15
              }, this),
              /* @__PURE__ */ jsx2("div", { className: "days-scroll", ref: daysScrollRef, children: [
                activeDays.map((day, index) => {
                  const date = /* @__PURE__ */ new Date(`${day.date}T12:00:00`);
                  const dayNumber = studyDayNumber(day.date, settings.dayOne);
                  return /* @__PURE__ */ jsx2("div", { role: "group", "aria-label": `Day ${dayNumber}`, tabIndex: 0, className: `day-chip ${selectedDate === day.date ? "selected" : ""} ${day.date === settings.dayOne ? "start-day" : ""}`, onClick: () => { setActiveEditId(day.id); updateState((state) => ({ ...state, selectedDate: day.date })); }, onKeyDown: (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActiveEditId(day.id); updateState((state) => ({ ...state, selectedDate: day.date })); } }, children: [
                    /* @__PURE__ */ jsx2("strong", { children: [
                      "Day ",
                      dayNumber
                    ] }, "day-number", true, {
                      fileName: "<stdin>",
                      lineNumber: 1186,
                      columnNumber: 194
                    }, this),
                    /* @__PURE__ */ jsx2("span", { children: dateLabel(date) }, "day-date", false, {
                      fileName: "<stdin>",
                      lineNumber: 1186,
                      columnNumber: 226
                    }, this),
                    activeEditId === day.id && /* @__PURE__ */ jsx2("button", { type: "button", onClick: (event) => { event.stopPropagation(); handleDeleteDay(day.id); }, className: "absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center shadow-md hover:bg-red-600 transition-transform active:scale-90 z-10", "aria-label": "Delete day", children: /* @__PURE__ */ jsx2("svg", { xmlns: "http://www.w3.org/2000/svg", width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx2("path", { d: "M5 12h14" }, void 0, false, {}, this) }, void 0, false, {}, this) }, "delete-day", false, {}, this)
                  ] }, day.id, true, {
                    fileName: "<stdin>",
                    lineNumber: 1186,
                    columnNumber: 24
                  }, this);
                })
              ] }, void 0, true, {
                fileName: "<stdin>",
                lineNumber: 1183,
                columnNumber: 15
              }, this),
              (() => {
                const day = activeDays.find((item) => item.date === selectedDate);
                return /* @__PURE__ */ jsx2("button", { className: `day-intention ${day?.intention ? "has-note" : ""}`, style: { width: "100%", border: 0, textAlign: "left", cursor: "pointer" }, onClick: () => setModal("planner"), children: day?.intention || "\uFF0B Add an intention for this day" }, void 0, false, {
                  fileName: "<stdin>",
                  lineNumber: 1188,
                  columnNumber: 99
                }, this);
              })()
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 1181,
              columnNumber: 13
            }, this),
            /* @__PURE__ */ jsx2("section", { className: "card streak-card", children: [
              /* @__PURE__ */ jsx2("div", { className: "streak-icon", children: /* @__PURE__ */ jsx2(Flame, { size: 22 }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 1190,
                columnNumber: 80
              }, this) }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 1190,
                columnNumber: 51
              }, this),
              /* @__PURE__ */ jsx2("div", { className: "streak-copy", children: [
                /* @__PURE__ */ jsx2("strong", { children: [
                  streak,
                  " ",
                  streak === 1 ? "day" : "days",
                  " streak"
                ] }, void 0, true, {
                  fileName: "<stdin>",
                  lineNumber: 1190,
                  columnNumber: 134
                }, this),
                /* @__PURE__ */ jsx2("span", { children: streak ? "Lovely rhythm. Keep showing up." : "Complete a day to keep it going." }, void 0, false, {
                  fileName: "<stdin>",
                  lineNumber: 1190,
                  columnNumber: 198
                }, this)
              ] }, void 0, true, {
                fileName: "<stdin>",
                lineNumber: 1190,
                columnNumber: 105
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 1190,
              columnNumber: 13
            }, this),
            /* @__PURE__ */ jsx2("section", { className: "card week-card", children: [
              /* @__PURE__ */ jsx2("div", { className: "week-title-row", children: [
                /* @__PURE__ */ jsx2("h2", { children: "This week: Keep the rhythm" }, void 0, false, {
                  fileName: "<stdin>",
                  lineNumber: 1192,
                  columnNumber: 47
                }, this),
                /* @__PURE__ */ jsx2("span", { children: [
                  completedToday,
                  " done today"
                ] }, void 0, true, {
                  fileName: "<stdin>",
                  lineNumber: 1192,
                  columnNumber: 82
                }, this)
              ] }, void 0, true, {
                fileName: "<stdin>",
                lineNumber: 1192,
                columnNumber: 15
              }, this),
              /* @__PURE__ */ jsx2(WeeklyChart, { dailyMinutes: appState.dailyMinutes }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 1193,
                columnNumber: 15
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 1191,
              columnNumber: 13
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 1180,
            columnNumber: 11
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 1171,
          columnNumber: 9
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 1159,
        columnNumber: 28
      }, this),
      view === "tasks" && /* @__PURE__ */ jsx2("section", { children: [
        /* @__PURE__ */ jsx2("div", { className: "view-heading all-tasks-heading", children: [
          /* @__PURE__ */ jsx2("div", { children: [
            /* @__PURE__ */ jsx2("p", { className: "eyebrow", children: "Your study plan" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1200,
              columnNumber: 44
            }, this),
            /* @__PURE__ */ jsx2("h1", { children: "Your queue - All tasks" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1200,
              columnNumber: 86
            }, this),
            /* @__PURE__ */ jsx2("p", { children: "Every task across your study days, all in one place." }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1200,
              columnNumber: 117
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 1200,
            columnNumber: 39
          }, this),
          /* @__PURE__ */ jsx2("div", { className: "heading-actions task-header-actions", children: [
            /* @__PURE__ */ jsx2("button", { className: "button task-header-action-button w-auto flex-shrink-0 whitespace-nowrap", onClick: () => setModal("import"), children: [
              /* @__PURE__ */ jsx2(ArrowDownToLine, { size: 13 }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 1200,
                columnNumber: 277
              }, this),
              "Import"
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 1200,
              columnNumber: 215
            }, this),
            /* @__PURE__ */ jsx2("button", { className: "button primary task-header-action-button w-auto flex-shrink-0 whitespace-nowrap", onClick: () => {
              setEditingTask(null);
              setModal("task");
            }, children: [
              /* @__PURE__ */ jsx2(Plus, { size: 14 }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 1200,
                columnNumber: 416
              }, this),
              "New task"
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 1200,
              columnNumber: 321
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 1200,
            columnNumber: 182
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 1200,
          columnNumber: 9
        }, this),
        appState.tasks.length ? /* @__PURE__ */ jsx2("div", { className: "all-tasks-list", children: [...appState.tasks].sort((a, b) => (a.date || "").localeCompare(b.date || "")).map((task) => /* @__PURE__ */ jsx2(TaskRow, { task, onToggle: toggleTask, onFocus: (item) => {
          setFocusTask(item);
          setModal("focus");
        }, onEdit: openEdit, onDelete: deleteTask, onAddPatch: startPatch, showPatchActions: true }, task.id, false, {
          fileName: "<stdin>",
          lineNumber: 1201,
          columnNumber: 159
        }, this)) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 1201,
          columnNumber: 34
        }, this) : /* @__PURE__ */ jsx2("div", { className: "card empty-state", children: [
          /* @__PURE__ */ jsx2("div", { className: "empty-icon", children: /* @__PURE__ */ jsx2(ListTodo, { size: 24 }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1202,
            columnNumber: 73
          }, this) }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1202,
            columnNumber: 45
          }, this),
          /* @__PURE__ */ jsx2("h3", { children: "Your plan starts here." }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1202,
            columnNumber: 101
          }, this),
          /* @__PURE__ */ jsx2("p", { children: "Add a task and make your next study session feel simple." }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1202,
            columnNumber: 132
          }, this),
          /* @__PURE__ */ jsx2("button", { className: "button primary", onClick: () => setModal("task"), children: [
            /* @__PURE__ */ jsx2(Plus, { size: 14 }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1202,
              columnNumber: 263
            }, this),
            "Create a task"
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 1202,
            columnNumber: 195
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 1202,
          columnNumber: 11
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 1199,
        columnNumber: 28
      }, this),
      view === "insights" && /* @__PURE__ */ jsx2("section", { children: [
        /* @__PURE__ */ jsx2("div", { className: "view-heading", children: /* @__PURE__ */ jsx2("div", { children: [
          /* @__PURE__ */ jsx2("p", { className: "eyebrow", children: "Progress, at your pace" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1206,
            columnNumber: 44
          }, this),
          /* @__PURE__ */ jsx2("h1", { children: "Insights" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1206,
            columnNumber: 93
          }, this),
          /* @__PURE__ */ jsx2("p", { children: "Consistency is built one day at a time." }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1206,
            columnNumber: 110
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 1206,
          columnNumber: 39
        }, this) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 1206,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsx2("div", { className: "insights-grid metrics-banner", children: [
          /* @__PURE__ */ jsx2("div", { className: "card stat-card", children: [
            /* @__PURE__ */ jsx2("span", { children: "Total hours completed" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1208,
              columnNumber: 43
            }, this),
            /* @__PURE__ */ jsx2("strong", { children: [
              (trackedMinutes / 60).toFixed(1),
              " ",
              /* @__PURE__ */ jsx2("small", { children: "hrs" }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 1208,
                columnNumber: 120
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 1208,
              columnNumber: 77
            }, this),
            /* @__PURE__ */ jsx2("em", { children: "Across all study days" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1208,
              columnNumber: 147
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 1208,
            columnNumber: 11
          }, this),
          /* @__PURE__ */ jsx2("div", { className: "card stat-card", children: [
            /* @__PURE__ */ jsx2("span", { children: "Live practice" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1209,
              columnNumber: 43
            }, this),
            /* @__PURE__ */ jsx2("strong", { children: [
              practiceShare,
              /* @__PURE__ */ jsx2("small", { children: "%" }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 1209,
                columnNumber: 92
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 1209,
              columnNumber: 69
            }, this),
            /* @__PURE__ */ jsx2("em", { children: "Time in focus sessions" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1209,
              columnNumber: 117
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 1209,
            columnNumber: 11
          }, this),
          /* @__PURE__ */ jsx2("div", { className: "card stat-card", children: [
            /* @__PURE__ */ jsx2("span", { children: "Box completion" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1210,
              columnNumber: 43
            }, this),
            /* @__PURE__ */ jsx2("strong", { children: [
              completedTaskCount,
              /* @__PURE__ */ jsx2("small", { children: [
                " / ",
                taskCount
              ] }, void 0, true, {
                fileName: "<stdin>",
                lineNumber: 1210,
                columnNumber: 98
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 1210,
              columnNumber: 70
            }, this),
            /* @__PURE__ */ jsx2("em", { children: "Tasks checked off" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1210,
              columnNumber: 136
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 1210,
            columnNumber: 11
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 1207,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsx2("section", { className: "card insights-panel", children: [
          /* @__PURE__ */ jsx2("div", { className: "insight-section-heading", children: [
            /* @__PURE__ */ jsx2("div", { children: [
              /* @__PURE__ */ jsx2("p", { className: "eyebrow", children: "A steady rhythm adds up" }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 1213,
                columnNumber: 57
              }, this),
              /* @__PURE__ */ jsx2("h2", { children: "Activity cadence" }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 1213,
                columnNumber: 107
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 1213,
              columnNumber: 52
            }, this),
            /* @__PURE__ */ jsx2("span", { children: "Last 7 days" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1213,
              columnNumber: 138
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 1213,
            columnNumber: 11
          }, this),
          /* @__PURE__ */ jsx2(DailyCadence, { dailyMinutes: appState.dailyMinutes }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1214,
            columnNumber: 11
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 1212,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsx2("section", { className: "card subject-panel", children: [
          /* @__PURE__ */ jsx2("div", { className: "insight-section-heading", children: [
            /* @__PURE__ */ jsx2("div", { children: [
              /* @__PURE__ */ jsx2("p", { className: "eyebrow", children: "Completion by subject" }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 1217,
                columnNumber: 57
              }, this),
              /* @__PURE__ */ jsx2("h2", { children: "Subject task completion" }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 1217,
                columnNumber: 105
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 1217,
              columnNumber: 52
            }, this),
            /* @__PURE__ */ jsx2("span", { children: [
              completedTaskCount,
              "/",
              taskCount,
              " tasks"
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 1217,
              columnNumber: 143
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 1217,
            columnNumber: 11
          }, this),
          /* @__PURE__ */ jsx2("div", { className: "subject-breakdown", children: Object.keys(subjectDistribution).map((subject) => {
            const subjectTasks = appState.tasks.filter((task) => canonicalSubject(task.subject) === subject);
            const totalTasks = subjectTasks.length;
            const completedTasks = subjectTasks.filter((task) => task.completed).length;
            const percent = totalTasks ? Math.round(completedTasks / totalTasks * 100) : 0;
            return /* @__PURE__ */ jsx2("div", { className: "subject-breakdown-row", children: [
              /* @__PURE__ */ jsx2("div", { className: "subject-breakdown-head", children: [
                /* @__PURE__ */ jsx2("strong", { children: subject }, "subject-name", false, {
                  fileName: "<stdin>",
                  lineNumber: 1221,
                  columnNumber: 55
                }, this),
                /* @__PURE__ */ jsx2("span", { children: [
                  completedTasks,
                  "/",
                  totalTasks,
                  " tasks ",
                /* @__PURE__ */ jsx2("b", { children: [
                    percent,
                    "%"
                  ] }, void 0, true, {
                    fileName: "<stdin>",
                    lineNumber: 1221,
                    columnNumber: 112
                  }, this)
                ] }, "subject-percent", true, {
                  fileName: "<stdin>",
                  lineNumber: 1221,
                  columnNumber: 81
                }, this)
                ] }, "subject-completion", true, {
                fileName: "<stdin>",
                lineNumber: 1221,
                columnNumber: 15
              }, this),
              /* @__PURE__ */ jsx2("div", { className: "subject-track", children: /* @__PURE__ */ jsx2("span", { className: `subject-fill subject-${subject.toLowerCase()}`, style: { width: `${percent}%` } }, "subject-progress", false, {
                fileName: "<stdin>",
                lineNumber: 1222,
                columnNumber: 46
              }, this) }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 1222,
                columnNumber: 15
              }, this)
            ] }, subject, true, {
              fileName: "<stdin>",
              lineNumber: 1220,
              columnNumber: 20
            }, this);
          }) }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1218,
            columnNumber: 11
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 1216,
          columnNumber: 9
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 1205,
        columnNumber: 31
      }, this),
      view === "revision" && /* @__PURE__ */ jsx2("section", { children: [
        /* @__PURE__ */ jsx2("div", { className: "view-heading", children: [
          /* @__PURE__ */ jsx2("div", { children: [
            /* @__PURE__ */ jsx2("p", { className: "eyebrow", children: "Weak topics and key formulas" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1229,
              columnNumber: 44
            }, this),
            /* @__PURE__ */ jsx2("h1", { children: "Error diagnostic log" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1229,
              columnNumber: 99
            }, this),
            /* @__PURE__ */ jsx2("p", { children: "Keep track of what you want to strengthen next." }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1229,
              columnNumber: 128
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 1229,
            columnNumber: 39
          }, this),
          /* @__PURE__ */ jsx2("span", { className: "alert-badge", children: [
            /* @__PURE__ */ jsx2("span", {}, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1229,
              columnNumber: 218
            }, this),
            unresolvedDiagnostics,
            " to patch"
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 1229,
            columnNumber: 188
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 1229,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsx2("div", { className: "patch-filters", role: "group", "aria-label": "Filter diagnostics by subject", children: ["All", ...subjectOptions].map((subject) => /* @__PURE__ */ jsx2("button", { className: `patch-filter ${patchFilter === subject ? "selected" : ""}`, onClick: () => setPatchFilter(subject), children: subject }, subject, false, {
          fileName: "<stdin>",
          lineNumber: 1230,
          columnNumber: 129
        }, this)) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 1230,
          columnNumber: 9
        }, this),
        (() => {
          const filtered = (appState.diagnostics || []).filter((item) => patchFilter === "All" || canonicalSubject(item.subject) === patchFilter || isNeetMode && canonicalSubject(item.subject) === "Biology" && (patchFilter === "Botany" || patchFilter === "Zoology"));
          return filtered.length ? /* @__PURE__ */ jsx2("div", { className: "diagnostic-list", children: filtered.map((item) => /* @__PURE__ */ jsx2(DiagnosticCard, { item, onCategory: (id, category) => updateDiagnostic(id, { category }), onConfidence: (id, confidence) => updateDiagnostic(id, { confidence }), onResolve: queueDiagnostic, onDelete: deleteDiagnostic, onOpen: (entry) => {
            setPatchDetail(entry);
            setModal("patch-detail");
          } }, item.id, false, {
            fileName: "<stdin>",
            lineNumber: 1233,
            columnNumber: 93
          }, this)) }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 1233,
            columnNumber: 36
          }, this) : /* @__PURE__ */ jsx2("div", { className: "card patch-empty", children: [
            /* @__PURE__ */ jsx2("div", { className: "empty-icon", children: /* @__PURE__ */ jsx2(BookOpen, { size: 23 }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1234,
              columnNumber: 77
            }, this) }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1234,
              columnNumber: 49
            }, this),
            /* @__PURE__ */ jsx2("h3", { children: patchFilter === "All" ? "Your diagnostic log is clear." : `No ${patchFilter} entries yet.` }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1234,
              columnNumber: 105
            }, this),
            /* @__PURE__ */ jsx2("p", { children: "From a task, add a weak concept or formula here for focused review." }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 1234,
              columnNumber: 206
            }, this),
            /* @__PURE__ */ jsx2("button", { className: "button soft", onClick: () => {
              setPatchDraft({ title: "", subject: patchFilter === "All" ? "Physics" : patchFilter === "Mathematics" ? "Maths" : patchFilter, category: "Concept" });
              setModal("patch");
            }, children: [
              /* @__PURE__ */ jsx2(Plus, { size: 14 }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 1234,
                columnNumber: 502
              }, this),
              "Add a diagnostic"
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 1234,
              columnNumber: 280
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 1234,
            columnNumber: 15
          }, this);
        })()
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 1228,
        columnNumber: 31
      }, this),
      view === "settings" && /* @__PURE__ */ jsx2(SettingsPanel, { profile, onProfileChange: (next) => updateState((state) => ({ ...state, profile: next })), settings, onChange: changeSettings, modelPrefs: settings.aiModelPrefs, onModelPrefsChange: updateModelPrefs, onConfirm: setConfirmAction, onResetDay: resetDayOne, activeSyncCode, onConnectSync: connectSyncCode, onClose: () => setView(previousViewRef.current || "today") }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 1238,
        columnNumber: 31
      }, this),
      view === "syllabus" && /* @__PURE__ */ jsx2(SyllabusTracker, { state: appState, streak, onMode: (mode) => updateState((state) => ({ ...state, syllabusMode: mode })), onProgress: updateSyllabusProgress, onAddChapter: addCustomChapter, onDeleteChapter: deleteSyllabusChapter }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 1239,
        columnNumber: 31
      }, this),
      view === "toolkit" && /* @__PURE__ */ jsx2(StudyToolkit, {}, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 1240,
        columnNumber: 30
      }, this),
      view === "memory" && /* @__PURE__ */ jsx2(MemoryRecall, { state: appState, chapters: memoryChapters, modelPrefs: settings.aiModelPrefs, onSelection: setMemorySelection, onUpdateSelection: setMemorySelection, onSaveDeck: saveMemoryDeck, onSaveProgress: saveMemoryProgress }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 1241,
        columnNumber: 29
      }, this),
      view === "practice" && /* @__PURE__ */ jsx2(PracticeDashboard, { targets: appState.practiceTargets, chapters: memoryChapters, onChange: (practiceTargets) => updateState((state) => ({ ...state, practiceTargets })) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 1242,
        columnNumber: 31
      }, this),
      view === "handbook" && /* @__PURE__ */ jsx2(HandbookLibrary, { documents: appState.handbookDocs, onUpload: uploadHandbook, onDelete: deleteHandbook }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 1243,
        columnNumber: 31
      }, this),
      view === "exams" && /* @__PURE__ */ jsx2(AstraPlanner, { state: appState, modelPrefs: settings.aiModelPrefs, chapters: syllabusChapters, config: appState.astraConfig || appState.examConfig, onConfig: (astraConfig) => updateState((state) => ({ ...state, astraConfig })), onAddTask: addTask, onOpenChapter: (chapter) => {
        localStorage.setItem("apexjee-recall-quiz", chapter.id);
        setMemorySelection({ subject: chapter.subject, classLevel: String(chapter.classLevel || "Class 11").replace(/^Class\s*/i, ""), chapterId: chapter.id });
        setView("memory");
      }, onOpenCopilot: (chapter, focus) => {
        localStorage.setItem("apex-copilot-prefill", `Help me study ${chapter?.name || focus}. Start with a short explanation, then give me a guided JEE problem to solve.`);
        setView("assistant");
      } }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 1244,
        columnNumber: 28
      }, this),
      view === "planner" && /* @__PURE__ */ jsx2(RevisionPlanner, { state: appState, chapters: syllabusChapters, onChange: (revisionReviews) => updateState((state) => ({ ...state, revisionReviews })), onAddTask: (task) => updateState((state) => ({ ...state, tasks: [...state.tasks, task] })) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 1245,
        columnNumber: 30
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 1158,
      columnNumber: 5
    }, this),
    !sidebarOpen && ["today", "tasks", "insights", "revision"].includes(view) && /* @__PURE__ */ jsx2("div", { className: "nav-dock-wrap", children: /* @__PURE__ */ jsx2("nav", { className: "nav-dock", "aria-label": "Main navigation", children: NAV_ITEMS.map(({ key, label, icon: Icon }) => /* @__PURE__ */ jsx2("button", { className: `nav-item ${view === key ? "active" : ""}`, "aria-current": view === key ? "page" : void 0, onClick: () => setView(key), children: [
      /* @__PURE__ */ jsx2(Icon, { size: key === "revision" ? 24 : 18, strokeWidth: view === key ? 2.25 : 1.8 }, "icon", false, {
        fileName: "<stdin>",
        lineNumber: 1249,
        columnNumber: 158
      }, this),
      /* @__PURE__ */ jsx2("span", { children: label }, "label", false, {
        fileName: "<stdin>",
        lineNumber: 1249,
        columnNumber: 216
      }, this)
    ] }, key, true, {
      fileName: "<stdin>",
      lineNumber: 1249,
      columnNumber: 7
    }, this)) }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 1248,
      columnNumber: 36
    }, this) }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 1248,
      columnNumber: 5
    }, this),
    modal === "profile" && /* @__PURE__ */ jsx2(ProfileModal, { profile, onClose: closeModal, onSave: (next) => {
      updateState((state) => ({ ...state, profile: next }));
      closeModal();
      setToast("Profile updated");
    } }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 1251,
      columnNumber: 29
    }, this),
    modal === "task" && /* @__PURE__ */ jsx2(TaskModal, { task: editingTask, selectedDate, onClose: () => {
      closeModal();
      setEditingTask(null);
    }, onSave: addTask }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 1252,
      columnNumber: 26
    }, this),
    modal === "focus" && /* @__PURE__ */ jsx2(FocusModal, { task: focusTask, onClose: closeModal, onComplete: markSession }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 1253,
      columnNumber: 27
    }, this),
    modal === "patch" && /* @__PURE__ */ jsx2(PatchEntryModal, { initial: patchDraft, onClose: () => {
      closeModal();
      setPatchDraft(null);
    }, onSave: addDiagnostic }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 1254,
      columnNumber: 27
    }, this),
    modal === "patch-detail" && patchDetail && /* @__PURE__ */ jsx2(PatchDetailModal, { item: patchDetail, onClose: () => {
      closeModal();
      setPatchDetail(null);
    }, onSave: (changes) => {
      updateDiagnostic(patchDetail.id, changes);
      closeModal();
      setPatchDetail(null);
      setToast("Revision saved");
    } }, patchDetail.id, false, { fileName: "<stdin>", lineNumber: 1255, columnNumber: 32 }, this),
    modal === "planner" && /* @__PURE__ */ jsx2(PlannerModal, { date: selectedDate, onClose: closeModal, onSave: (text) => setDayIntention(selectedDate, text) }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 1255,
      columnNumber: 29
    }, this),
    modal === "import" && /* @__PURE__ */ jsx2(ImportModal, { startDate: selectedDate, onClose: closeModal, onImport: (tasks, dayCount) => {
      updateState((state) => ({ ...state, tasks: [...state.tasks, ...tasks], settings: { ...state.settings, planLength: dayCount } }));
      closeModal();
      setToast(`${tasks.length} tasks imported`);
    } }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 1256,
      columnNumber: 28
    }, this),
    sidebarOpen && /* @__PURE__ */ jsx2(Sidebar, { activeView: view, syllabusMode: appState.syllabusMode, onClose: closeSidebar, onNavigate: (nextView) => {
      if (nextView === "settings" && view !== "settings") previousViewRef.current = view;
      if (nextView === "today") goToday(); else setView(nextView);
      closeSidebar();
    } }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 1257,
      columnNumber: 21
    }, this),
    confirmAction && /* @__PURE__ */ jsx2(ConfirmActionModal, { type: confirmAction, onClose: () => setConfirmAction(null), onConfirm: runConfirmAction }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 1258,
      columnNumber: 23
    }, this),
    ["today", "tasks", "insights", "revision"].includes(view) && !sidebarOpen && /* @__PURE__ */ jsx2("button", { type: "button", className: "assistant-fab", onClick: () => setView("assistant"), "aria-label": "Open AI Assistant", title: "AI Assistant", children: /* @__PURE__ */ jsx2(Sparkles, { size: 26 }, void 0, false, { fileName: "<stdin>", lineNumber: 1260, columnNumber: 170 }, this) }, void 0, false, { fileName: "<stdin>", lineNumber: 1260, columnNumber: 5 }, this),
    toast && /* @__PURE__ */ jsx2("div", { className: "toast", role: "status", children: toast }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 1260,
      columnNumber: 15
    }, this)
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 1152,
    columnNumber: 10
  }, this)));
}
class AssistantRouteBoundary extends React.Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("Apex assistant failed to load:", error);
  }

  render() {
    if (this.state.failed) {
      return React.createElement("section", { className: "assistant-route-state assistant-route-error", role: "alert" },
        React.createElement("p", null, "The assistant could not open."),
        React.createElement("button", { type: "button", className: "button primary", onClick: this.props.onHome }, "Back to Apex")
      );
    }
    return this.props.children;
  }
}

class AppErrorBoundary extends React.Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("Apex encountered a page error:", error);
  }

  render() {
    if (this.state.failed) {
      return React.createElement("main", { className: "assistant-route-state assistant-route-error", role: "alert" },
        React.createElement("p", null, "Apex hit an unexpected page error."),
        React.createElement("button", { type: "button", className: "button primary", onClick: () => this.setState({ failed: false }) }, "Try again"));
    }
    return this.props.children;
  }
}
function App() {
  return React.createElement(AppErrorBoundary, null, React.createElement(DashboardApp));
}
createRoot(document.getElementById("root")).render(/* @__PURE__ */ jsx2(App, {}, void 0, false, {
  fileName: "<stdin>",
  lineNumber: 1264,
  columnNumber: 52
}));
export {
  AppSettingsContext,
  useAppSettings
};
