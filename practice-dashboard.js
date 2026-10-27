import { jsx } from "react/jsx-runtime";
import React, { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, CircleHelp, Plus, Target, Trash2, Trophy, X, Zap } from "lucide-react";
import { SYLLABUS } from "./syllabus-data.js";
import { useSubjectMode } from "./subject-mode.js";
function targetProgress(target) {
  return Number(target.correct || 0) + Number(target.incorrect || 0) + Number(target.skipped || 0);
}
function NewTargetModal({ chapters, onClose, onAdd }) {
  const { isNeetMode, subjects } = useSubjectMode();
  const [subject, setSubject] = useState("Physics");
  const subjectChapters = useMemo(() => chapters.filter((chapter) => chapter.subject === subject), [chapters, subject]);
  const [chapterId, setChapterId] = useState("");
  const [topic, setTopic] = useState("");
  const [questionTarget, setQuestionTarget] = useState(20);
  useEffect(() => {
    if (!subjects.includes(subject)) {
      setSubject(subjects[0]);
      setChapterId("");
      setTopic("");
    }
  }, [isNeetMode]);
  const currentChapter = subjectChapters.find((chapter) => chapter.id === chapterId);
  return /* @__PURE__ */ jsx("div", { className: "overlay", onMouseDown: (event) => {
    if (event.target === event.currentTarget) onClose();
  }, children: /* @__PURE__ */ jsx("section", { className: "modal narrow", role: "dialog", "aria-modal": "true", "aria-label": "Add a practice target", children: [
    /* @__PURE__ */ jsx("div", { className: "modal-header", children: [
      /* @__PURE__ */ jsx("div", { children: [
        /* @__PURE__ */ jsx("span", { className: "tool-modal-category", children: "QUESTION PRACTICE" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 19,
          columnNumber: 42
        }, this),
        /* @__PURE__ */ jsx("h2", { children: "New target" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 19,
          columnNumber: 104
        }, this),
        /* @__PURE__ */ jsx("p", { children: "Set a small, measurable question goal." }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 19,
          columnNumber: 123
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 19,
        columnNumber: 37
      }, this),
      /* @__PURE__ */ jsx("button", { className: "close-button", onClick: onClose, "aria-label": "Close", children: /* @__PURE__ */ jsx(X, { size: 17 }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 19,
        columnNumber: 244
      }, this) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 19,
        columnNumber: 174
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 19,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsx("form", { onSubmit: (event) => {
      event.preventDefault();
      onAdd({ subject, chapterId: currentChapter?.id || "", chapter: currentChapter?.name || "General practice", topic: topic.trim() || currentChapter?.name || "Mixed practice", questionTarget: Math.max(1, Number(questionTarget) || 1), correct: 0, incorrect: 0, skipped: 0, createdAt: (/* @__PURE__ */ new Date()).toISOString() });
    }, children: [
      /* @__PURE__ */ jsx("div", { className: "field", children: [
        /* @__PURE__ */ jsx("label", { htmlFor: "practice-subject", children: "Subject" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 24,
          columnNumber: 32
        }, this),
        /* @__PURE__ */ jsx("select", { id: "practice-subject", value: subject, onChange: (event) => {
          setSubject(event.target.value);
          setChapterId("");
          setTopic("");
        }, children: subjects.map((item) => /* @__PURE__ */ jsx("option", { children: item }, item, false, {
          fileName: "<stdin>",
          lineNumber: 24,
          columnNumber: 241
        }, this)) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 24,
          columnNumber: 81
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 24,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsx("div", { className: "field", children: [
        /* @__PURE__ */ jsx("label", { htmlFor: "practice-chapter", children: "Chapter" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 25,
          columnNumber: 32
        }, this),
        /* @__PURE__ */ jsx("select", { id: "practice-chapter", value: chapterId, onChange: (event) => {
          setChapterId(event.target.value);
          const found = subjectChapters.find((chapter) => chapter.id === event.target.value);
          if (found && !topic) setTopic(found.name);
        }, children: [
          /* @__PURE__ */ jsx("option", { value: "", children: "Choose a chapter" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 25,
            columnNumber: 316
          }, this),
          subjectChapters.map((chapter) => /* @__PURE__ */ jsx("option", { value: chapter.id, children: chapter.name }, chapter.id, false, {
            fileName: "<stdin>",
            lineNumber: 25,
            columnNumber: 392
          }, this))
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 25,
          columnNumber: 81
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 25,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsx("div", { className: "field", children: [
        /* @__PURE__ */ jsx("label", { htmlFor: "practice-topic", children: "Chapter topic" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 26,
          columnNumber: 32
        }, this),
        /* @__PURE__ */ jsx("input", { id: "practice-topic", value: topic, onChange: (event) => setTopic(event.target.value), placeholder: "e.g. Friction on an inclined plane" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 26,
          columnNumber: 85
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 26,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsx("div", { className: "field", children: [
        /* @__PURE__ */ jsx("label", { htmlFor: "practice-count", children: "Question target" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 27,
          columnNumber: 32
        }, this),
        /* @__PURE__ */ jsx("input", { id: "practice-count", type: "number", min: "1", max: "10000", value: questionTarget, onChange: (event) => setQuestionTarget(event.target.value) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 27,
          columnNumber: 87
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 27,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsx("div", { className: "modal-footer", children: [
        /* @__PURE__ */ jsx("button", { type: "button", className: "button", onClick: onClose, children: "Cancel" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 28,
          columnNumber: 39
        }, this),
        /* @__PURE__ */ jsx("button", { type: "submit", className: "button primary", children: [
          /* @__PURE__ */ jsx(Plus, { size: 13 }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 28,
            columnNumber: 162
          }, this),
          "Create target"
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 28,
          columnNumber: 113
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 28,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 20,
      columnNumber: 7
    }, this)
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 18,
    columnNumber: 5
  }, this) }, void 0, false, {
    fileName: "<stdin>",
    lineNumber: 17,
    columnNumber: 10
  }, this);
}
function PracticeDashboard({ targets, chapters, onChange }) {
  const { isNeetMode } = useSubjectMode();
  const [modalOpen, setModalOpen] = useState(false);
  const totalSolved = targets.reduce((sum, target) => sum + Number(target.correct || 0) + Number(target.incorrect || 0), 0);
  const totalCorrect = targets.reduce((sum, target) => sum + Number(target.correct || 0), 0);
  const totalWrong = targets.reduce((sum, target) => sum + Number(target.incorrect || 0), 0);
  const totalAttempted = totalCorrect + totalWrong;
  const accuracy = totalAttempted ? Math.round(totalCorrect / totalAttempted * 100) : 0;
  const netScore = totalCorrect * 4 - totalWrong;
  const goalsHit = targets.filter((target) => targetProgress(target) >= Number(target.questionTarget || 1)).length;
  const addTarget = (target) => onChange([...targets, { ...target, id: crypto.randomUUID() }]);
  const record = (id, field) => onChange(targets.map((target) => {
    if (target.id !== id || targetProgress(target) >= Number(target.questionTarget || 1)) return target;
    return { ...target, [field]: Number(target[field] || 0) + 1 };
  }));
  const remove = (id) => onChange(targets.filter((target) => target.id !== id));
  return /* @__PURE__ */ jsx("section", { className: "practice-view", children: [
    /* @__PURE__ */ jsx("div", { className: "practice-heading", children: [
      /* @__PURE__ */ jsx("div", { children: [
        /* @__PURE__ */ jsx("p", { className: "eyebrow", children: "QUESTION PRACTICE \xB7 SPEED DRILLS" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 50,
          columnNumber: 44
        }, this),
        /* @__PURE__ */ jsx("h1", { children: "Practice & Speed Drills" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 50,
          columnNumber: 103
        }, this),
        /* @__PURE__ */ jsx("p", { children: "Set a target, then keep a clear score as you go." }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 50,
          columnNumber: 139
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 50,
        columnNumber: 39
      }, this),
      /* @__PURE__ */ jsx("button", { className: "button primary", onClick: () => setModalOpen(true), children: [
        /* @__PURE__ */ jsx(Plus, { size: 14 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 50,
          columnNumber: 270
        }, this),
        "New Target"
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 50,
        columnNumber: 200
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 50,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsx("div", { className: "practice-metrics", children: [
      /* @__PURE__ */ jsx("div", { className: "practice-metric", children: [
        /* @__PURE__ */ jsx("span", { className: "practice-metric-icon", children: /* @__PURE__ */ jsx(Trophy, { size: 15 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 52,
          columnNumber: 79
        }, this) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 52,
          columnNumber: 40
        }, this),
        /* @__PURE__ */ jsx("small", { children: "Goals hit" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 52,
          columnNumber: 106
        }, this),
        /* @__PURE__ */ jsx("strong", { children: [
          goalsHit,
          /* @__PURE__ */ jsx("em", { children: [
            " / ",
            targets.length
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 52,
            columnNumber: 148
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 52,
          columnNumber: 130
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 52,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx("div", { className: "practice-metric", children: [
        /* @__PURE__ */ jsx("span", { className: "practice-metric-icon blue", children: /* @__PURE__ */ jsx(Check, { size: 15 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 53,
          columnNumber: 84
        }, this) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 53,
          columnNumber: 40
        }, this),
        /* @__PURE__ */ jsx("small", { children: "Questions solved" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 53,
          columnNumber: 110
        }, this),
        /* @__PURE__ */ jsx("strong", { children: totalSolved }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 53,
          columnNumber: 141
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 53,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx("div", { className: "practice-metric", children: [
        /* @__PURE__ */ jsx("span", { className: "practice-metric-icon amber", children: /* @__PURE__ */ jsx(Zap, { size: 15 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 54,
          columnNumber: 85
        }, this) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 54,
          columnNumber: 40
        }, this),
        /* @__PURE__ */ jsx("small", { children: "Net score \xB7 +4 / \u22121" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 54,
          columnNumber: 109
        }, this),
        /* @__PURE__ */ jsx("strong", { children: netScore }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 54,
          columnNumber: 143
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 54,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx("div", { className: "practice-metric", children: [
        /* @__PURE__ */ jsx("span", { className: "practice-metric-icon violet", children: /* @__PURE__ */ jsx(Target, { size: 15 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 55,
          columnNumber: 86
        }, this) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 55,
          columnNumber: 40
        }, this),
        /* @__PURE__ */ jsx("small", { children: "Overall accuracy" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 55,
          columnNumber: 113
        }, this),
        /* @__PURE__ */ jsx("strong", { children: [
          accuracy,
          /* @__PURE__ */ jsx("em", { children: "%" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 55,
            columnNumber: 162
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 55,
          columnNumber: 144
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 55,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 51,
      columnNumber: 5
    }, this),
    /* @__PURE__ */ jsx("div", { className: "practice-section-heading", children: [
      /* @__PURE__ */ jsx("div", { children: [
        /* @__PURE__ */ jsx("h2", { children: "Your targets" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 57,
          columnNumber: 52
        }, this),
        /* @__PURE__ */ jsx("p", { children: "Log each answer to update your net score and accuracy." }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 57,
          columnNumber: 73
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 57,
        columnNumber: 47
      }, this),
      /* @__PURE__ */ jsx("span", { children: [
        targets.length,
        " active ",
        targets.length === 1 ? "drill" : "drills"
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 57,
        columnNumber: 140
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 57,
      columnNumber: 5
    }, this),
    targets.length ? /* @__PURE__ */ jsx("div", { className: "practice-target-list", children: targets.map((target) => {
      const attempted = targetProgress(target);
      const goal = Math.max(1, Number(target.questionTarget) || 1);
      const done = attempted >= goal;
      const percent = Math.min(100, attempted / goal * 100);
      return /* @__PURE__ */ jsx("article", { className: `practice-target-card ${done ? "complete" : ""}`, children: [
        /* @__PURE__ */ jsx("div", { className: "practice-target-top", children: [
          /* @__PURE__ */ jsx("div", { className: "practice-target-symbol", children: done ? /* @__PURE__ */ jsx(Check, { size: 17 }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 64,
            columnNumber: 94
          }, this) : /* @__PURE__ */ jsx(CircleHelp, { size: 17 }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 64,
            columnNumber: 116
          }, this) }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 64,
            columnNumber: 46
          }, this),
          /* @__PURE__ */ jsx("div", { className: "practice-target-info", children: [
            /* @__PURE__ */ jsx("div", { className: "practice-target-tags", children: [
              /* @__PURE__ */ jsx("span", { children: isNeetMode && ["Maths", "Mathematics"].includes(target.subject) ? "Biology" : target.subject }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 64,
                columnNumber: 223
              }, this),
              /* @__PURE__ */ jsx("span", { children: target.chapter }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 64,
                columnNumber: 252
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 64,
              columnNumber: 185
            }, this),
            /* @__PURE__ */ jsx("h3", { children: target.topic }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 64,
              columnNumber: 287
            }, this),
            /* @__PURE__ */ jsx("p", { children: [
              target.correct || 0,
              " correct \xB7 ",
              target.incorrect || 0,
              " incorrect \xB7 ",
              target.skipped || 0,
              " skipped"
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 64,
              columnNumber: 310
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 64,
            columnNumber: 147
          }, this),
          /* @__PURE__ */ jsx("button", { className: "practice-delete", "aria-label": "Delete practice target", onClick: () => remove(target.id), children: /* @__PURE__ */ jsx(Trash2, { size: 15 }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 64,
            columnNumber: 526
          }, this) }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 64,
            columnNumber: 420
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 64,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsx("div", { className: "practice-target-progress", children: [
          /* @__PURE__ */ jsx("div", { children: [
            /* @__PURE__ */ jsx("span", { children: done ? "Target reached" : `${attempted} / ${goal} questions` }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 65,
              columnNumber: 56
            }, this),
            /* @__PURE__ */ jsx("b", { children: [
              Math.round(percent),
              "%"
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 65,
              columnNumber: 131
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 65,
            columnNumber: 51
          }, this),
          /* @__PURE__ */ jsx("i", { children: /* @__PURE__ */ jsx("span", { style: { width: `${percent}%` } }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 65,
            columnNumber: 169
          }, this) }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 65,
            columnNumber: 166
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 65,
          columnNumber: 9
        }, this),
        /* @__PURE__ */ jsx("div", { className: "practice-target-actions", children: [
          /* @__PURE__ */ jsx("button", { className: "correct-answer", disabled: done, onClick: () => record(target.id, "correct"), children: [
            /* @__PURE__ */ jsx(Check, { size: 13 }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 66,
              columnNumber: 146
            }, this),
            "Correct ",
            /* @__PURE__ */ jsx("small", { children: "+4" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 66,
              columnNumber: 173
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 66,
            columnNumber: 50
          }, this),
          /* @__PURE__ */ jsx("button", { className: "wrong-answer", disabled: done, onClick: () => record(target.id, "incorrect"), children: [
            /* @__PURE__ */ jsx(X, { size: 13 }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 66,
              columnNumber: 295
            }, this),
            "Incorrect ",
            /* @__PURE__ */ jsx("small", { children: "\u22121" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 66,
              columnNumber: 320
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 66,
            columnNumber: 199
          }, this),
          /* @__PURE__ */ jsx("button", { className: "skip-answer", disabled: done, onClick: () => record(target.id, "skipped"), children: "Skip" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 66,
            columnNumber: 346
          }, this),
          /* @__PURE__ */ jsx("span", { className: "target-net", children: [
            "Net ",
            /* @__PURE__ */ jsx("b", { children: Number(target.correct || 0) * 4 - Number(target.incorrect || 0) }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 66,
              columnNumber: 485
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 66,
            columnNumber: 452
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 66,
          columnNumber: 9
        }, this)
      ] }, target.id, true, {
        fileName: "<stdin>",
        lineNumber: 63,
        columnNumber: 14
      }, this);
    }) }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 58,
      columnNumber: 23
    }, this) : /* @__PURE__ */ jsx("div", { className: "card empty-state practice-empty", children: [
      /* @__PURE__ */ jsx("div", { className: "empty-icon", children: /* @__PURE__ */ jsx(Target, { size: 23 }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 68,
        columnNumber: 94
      }, this) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 68,
        columnNumber: 66
      }, this),
      /* @__PURE__ */ jsx("h3", { children: "No drills in your queue." }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 68,
        columnNumber: 120
      }, this),
      /* @__PURE__ */ jsx("p", { children: "Add a question target for a chapter or topic you want to practice." }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 68,
        columnNumber: 153
      }, this),
      /* @__PURE__ */ jsx("button", { className: "button primary", onClick: () => setModalOpen(true), children: [
        /* @__PURE__ */ jsx(Plus, { size: 13 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 68,
          columnNumber: 296
        }, this),
        "Create your first target"
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 68,
        columnNumber: 226
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 68,
      columnNumber: 17
    }, this),
    /* @__PURE__ */ jsx("div", { className: "practice-marking-note", children: [
      /* @__PURE__ */ jsx("span", { children: "SCORING" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 69,
        columnNumber: 44
      }, this),
      /* @__PURE__ */ jsx("p", { children: "Correct answers add 4 marks, incorrect answers subtract 1, and skipped questions do not affect the score." }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 69,
        columnNumber: 64
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 69,
      columnNumber: 5
    }, this),
    modalOpen && /* @__PURE__ */ jsx(NewTargetModal, { chapters, onClose: () => setModalOpen(false), onAdd: (target) => {
      addTarget(target);
      setModalOpen(false);
    } }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 70,
      columnNumber: 19
    }, this)
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 49,
    columnNumber: 10
  }, this);
}
export {
  PracticeDashboard as default
};
