import { Fragment, jsx } from "react/jsx-runtime";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowLeftRight, Binary, Box, ChevronDown, Gauge, History, Maximize2, MoreVertical, Ruler, Scale, Square, Thermometer, Timer, Trash2, Zap, Delete } from "lucide-react";
const CATEGORIES = [
  ["Length", React.createElement(Ruler, { size: 36, strokeWidth: 2.2 })],
  ["Area", React.createElement(Square, { size: 36, strokeWidth: 2.2 })],
  ["Volume", React.createElement(Box, { size: 36, strokeWidth: 2.2 })],
  ["Weight", React.createElement(Scale, { size: 36, strokeWidth: 2.2 })],
  ["Temperature", React.createElement(Thermometer, { size: 36, strokeWidth: 2.2 })],
  ["Speed", React.createElement(Gauge, { size: 36, strokeWidth: 2.2 })],
  ["Pressure", React.createElement(Timer, { size: 36, strokeWidth: 2.2 })],
  ["Power", React.createElement(Zap, { size: 36, strokeWidth: 2.2 })],
  ["Number system", React.createElement(Binary, { size: 36, strokeWidth: 2.2 })]
];
const UNITS = {
  Length: { "Metre (m)": 1, "Kilometre (km)": 1e3, "Centimetre (cm)": 0.01, "Millimetre (mm)": 1e-3, "Mile (mi)": 1609.344, "Yard (yd)": 0.9144, "Foot (ft)": 0.3048, "Inch (in)": 0.0254 },
  Area: { "Square metre (m\xB2)": 1, "Square kilometre (km\xB2)": 1e6, "Square centimetre (cm\xB2)": 1e-4, "Hectare (ha)": 1e4, "Acre (ac)": 4046.8564224, "Square foot (ft\xB2)": 0.09290304 },
  Volume: { "Cubic metre (m\xB3)": 1, "Litre (L)": 1e-3, "Millilitre (mL)": 1e-6, "Cubic centimetre (cm\xB3)": 1e-6, "US gallon (gal)": 0.003785411784, "Cubic foot (ft\xB3)": 0.028316846592 },
  Weight: { "Kilogram (kg)": 1, "Gram (g)": 1e-3, "Milligram (mg)": 1e-6, "Tonne (t)": 1e3, "Pound (lb)": 0.45359237, "Ounce (oz)": 0.028349523125 },
  Temperature: { "Degree Celsius (\xB0C)": 1, "Degree Fahrenheit (\xB0F)": 1, "Kelvin (K)": 1 },
  Speed: { "Metre/second (m/s)": 1, "Kilometre/hour (km/h)": 1 / 3.6, "Mile/hour (mph)": 0.44704, "Foot/second (ft/s)": 0.3048 },
  Pressure: { "Pascal (Pa)": 1, "Kilopascal (kPa)": 1e3, "Bar (bar)": 1e5, "Standard atmosphere (atm)": 101325, "Millimetre of mercury (mmHg)": 133.322387415, "Pound/square inch (psi)": 6894.757293 },
  Power: { "Watt (W)": 1, "Kilowatt (kW)": 1e3, "Megawatt (MW)": 1e6, "Metric horsepower (PS)": 735.49875, "Imperial horsepower (hp)": 745.699872 },
  "Number system": { "Decimal (DEC)": 10, "Binary (BIN)": 2, "Octal (OCT)": 8, "Hexadecimal (HEX)": 16 }
};
const unitNames = (category) => Object.keys(UNITS[category] || {});
const fmt = (n) => Number.isFinite(n) ? Number(n.toPrecision(11)).toString() : "Error";
function factorial(n) {
  if (!Number.isInteger(n) || n < 0 || n > 170) throw new Error("Factorial needs an integer from 0 to 170");
  let v = 1;
  for (let i = 2; i <= n; i++) v *= i;
  return v;
}
function evaluate(source, angle) {
  const tokens = String(source).match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[A-Za-z]+|[()+\-*/^%!]/gi) || [];
  const compact = String(source).replace(/\s/g, "");
  if (tokens.join("").toLowerCase() !== compact.toLowerCase()) throw new Error("Check the expression");
  let i = 0;
  const peek = () => tokens[i];
  const take = () => tokens[i++];
  const primary = () => {
    const t = take();
    if (t === void 0) throw new Error("Incomplete expression");
    let v;
    if (t === "+") return unary();
    if (t === "-") return -unary();
    if (t === "(") {
      v = add();
      if (take() !== ")") throw new Error("Missing )");
    } else if (/^\d|^\./.test(t)) v = Number(t);
    else if (t.toLowerCase() === "pi") v = Math.PI;
    else if (t.toLowerCase() === "e") v = Math.E;
    else if (["sin", "cos", "tan", "asin", "acos", "atan", "sqrt", "ln", "log", "abs", "exp"].includes(t.toLowerCase())) {
      const fn = t.toLowerCase();
      if (take() !== "(") throw new Error(`${fn} needs parentheses`);
      const x = add();
      if (take() !== ")") throw new Error("Missing )");
      const a = angle === "DEG" ? Math.PI / 180 : 1;
      const functions = { sin: (x2) => Math.sin(x2 * a), cos: (x2) => Math.cos(x2 * a), tan: (x2) => Math.tan(x2 * a), asin: (x2) => Math.asin(x2) / a, acos: (x2) => Math.acos(x2) / a, atan: (x2) => Math.atan(x2) / a, sqrt: Math.sqrt, ln: Math.log, log: Math.log10, abs: Math.abs, exp: Math.exp };
      v = functions[fn](x);
    } else throw new Error(`Unknown value: ${t}`);
    while (peek() === "!" || peek() === "%") {
      const op = take();
      v = op === "!" ? factorial(v) : v / 100;
    }
    return v;
  };
  const power = () => {
    let a = primary();
    if (peek() === "^") {
      take();
      a = a ** unary();
    }
    return a;
  };
  const unary = () => power();
  const multiply = () => {
    let a = unary();
    while (peek() === "*" || peek() === "/") {
      const op = take(), b = unary();
      a = op === "*" ? a * b : a / b;
    }
    return a;
  };
  const add = () => {
    let a = multiply();
    while (peek() === "+" || peek() === "-") {
      const op = take(), b = multiply();
      a = op === "+" ? a + b : a - b;
    }
    return a;
  };
  const result = add();
  if (i < tokens.length) throw new Error("Check the expression");
  return result;
}
function applyTrigFunction(source, name, replaceWhole) {
  if (replaceWhole || !source) return `${name}(`;
  const text = source.trimEnd();
  let start = text.length;
  if (text.endsWith(")")) {
    let depth = 0;
    for (let index = text.length - 1; index >= 0; index--) {
      if (text[index] === ")") depth++;
      else if (text[index] === "(" && --depth === 0) {
        start = index;
        break;
      }
    }
  } else {
    const match = text.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$|(?:pi|e)$/i);
    if (match) start = text.length - match[0].length;
  }
  if (start === text.length) return `${text}${name}(`;
  const operand = text.slice(start);
  return `${text.slice(0, start)}${name}(${operand})`;
}
function convert(value, category, from, to) {
  if (category === "Number system") {
    const n = parseInt(value, UNITS[category][from]);
    return Number.isNaN(n) ? "" : n.toString(UNITS[category][to]).toUpperCase();
  }
  const x = Number(value);
  if (!Number.isFinite(x)) return "";
  if (category === "Temperature") {
    const c = from.includes("Fahrenheit") ? (x - 32) * 5 / 9 : from.includes("Kelvin") ? x - 273.15 : x;
    return fmt(to.includes("Fahrenheit") ? c * 9 / 5 + 32 : to.includes("Kelvin") ? c + 273.15 : c);
  }
  return fmt(x * UNITS[category][from] / UNITS[category][to]);
}
function DeviceCalculator({ onClose }) {
  const [screen, setScreen] = useState("calc");
  const [expression, setExpression] = useState("");
  const [result, setResult] = useState("0");
  const [angle, setAngle] = useState("DEG");
  const [justSolved, setJustSolved] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);
  const optionsButtonRef = useRef(null);
  const [inverse, setInverse] = useState(false);
  const [compactKeys, setCompactKeys] = useState(false);
  const [keypadTurning, setKeypadTurning] = useState(false);
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("apexjee-calculator-history") || "[]");
    } catch {
      return [];
    }
  });
  const keypadFlipTimer = useRef(null);
  const [category, setCategory] = useState("Length");
  const [from, setFrom] = useState("Metre (m)");
  const [to, setTo] = useState("Mile (mi)");
  const [input, setInput] = useState("1");
  const [unitPicker, setUnitPicker] = useState(null);
  const converted = useMemo(() => convert(input, category, from, to), [input, category, from, to]);
  useEffect(() => {
    if (!menu) return;
    const dismissOnOutsideTap = (event) => {
      if (menuRef.current?.contains(event.target) || optionsButtonRef.current?.contains(event.target)) return;
      setMenu(false);
    };
    document.addEventListener("pointerdown", dismissOnOutsideTap);
    return () => document.removeEventListener("pointerdown", dismissOnOutsideTap);
  }, [menu]);
  const edit = (key) => {
    setJustSolved(false);
    setResult("");
    if (key === "AC") {
      setExpression("");
      setResult("0");
      return;
    }
    if (key === "\u232B") {
      setExpression((x) => x.slice(0, -1));
      return;
    }
    if (key === "\xB1") {
      setExpression((x) => {
        const m = x.match(/^(.*?)([+*/(]|-)?((?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)$/i);
        if (!m) return x ? `${x}-` : "-";
        const [, prefix, operator = "", number] = m;
        if (operator === "-") return `${prefix}+${number}`;
        if (operator === "+") return `${prefix}-${number}`;
        return `${prefix}${operator}-${number}`;
      });
      return;
    }
    if (key === "=") {
      try {
        const opens = (expression.match(/\(/g) || []).length, closes = (expression.match(/\)/g) || []).length;
        const value = evaluate(expression + ")".repeat(Math.max(0, opens - closes)), angle);
        const answer = fmt(value);
        setResult(answer);
        setHistory((items) => {
          const next = [{ expression, result: answer, at: Date.now() }, ...items].slice(0, 100);
          localStorage.setItem("apexjee-calculator-history", JSON.stringify(next));
          return next;
        });
        setJustSolved(true);
      } catch (e) {
        setResult(e.message || "Error");
        setJustSolved(true);
      }
      return;
    }
    if (["sin", "cos", "tan"].includes(key)) {
      const functionName = inverse ? `a${key}` : key;
      setExpression((x) => applyTrigFunction(x, functionName, justSolved));
      return;
    }
    if (key === "x\xB2" || key === "x2") {
      setExpression((x) => x + "^2");
      return;
    }
    const insertion = { "10\u02E3": "10^", "e\u02E3": "exp(", "x\xB2": "^2", "inv": "", "log": "log(", "ln": "ln(", "\u221A": "sqrt(", "\u03C0": "pi", "e": "e", "00": "00", "\xD7": "*", "\xF7": "/", "\u2212": "-", "+": "+", "%": "%", "!": "!" }[key] || key;
    setExpression((x) => justSolved && !/[+*/^%-]$/.test(insertion) ? insertion : x + insertion);
  };
  const selectCategory = (name) => {
    setCategory(name);
    const units = unitNames(name);
    setFrom(units[0]);
    setTo(units[1] || units[0]);
    setInput(name === "Number system" ? "10" : "1");
    setScreen("convert");
  };
  const convertKey = (key) => {
    if (key === "AC") setInput("");
    else if (key === "\u232B") setInput((x) => x.slice(0, -1));
    else if (key === "\xB1") setInput((x) => x.startsWith("-") ? x.slice(1) : `-${x}`);
    else if (key === ".") setInput((x) => x.includes(".") ? x : x + ".");
    else setInput((x) => x === "0" ? key : x + key);
  };
  const unitButton = (side) => {
    const val = side === "from" ? from : to;
    return /* @__PURE__ */ jsx("button", { className: "device-unit-choice", onClick: () => setUnitPicker(side), children: [
      /* @__PURE__ */ jsx("span", { children: val }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 84,
        columnNumber: 141
      }, this),
      /* @__PURE__ */ jsx(ChevronDown, { size: 14 }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 84,
        columnNumber: 159
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 84,
      columnNumber: 68
    }, this);
  };
  const keypad = ["sin", "cos", "tan", "rad", "deg", "log", "ln", "(", ")", "inv", "!", "AC", "%", "\u232B", "\xF7", "^", "7", "8", "9", "\xD7", inverse ? "x\u00B2" : "\u221A", "4", "5", "6", "\u2212", "\u03C0", "1", "2", "3", "+", "e", "00", "0", ".", "="];
  const compactKeypad = ["AC", "%", "\u232B", "\xF7", "7", "8", "9", "\xD7", "4", "5", "6", "\u2212", "1", "2", "3", "+", "00", "0", ".", "="];
  const visibleKeypad = compactKeys ? compactKeypad : keypad;
  const toggleKeypad = () => {
    if (keypadFlipTimer.current) window.clearTimeout(keypadFlipTimer.current);
    setKeypadTurning(true);
    setCompactKeys((value) => !value);
    keypadFlipTimer.current = window.setTimeout(() => {
      keypadFlipTimer.current = null;
      setKeypadTurning(false);
    }, 420);
  };
  return /* @__PURE__ */ jsx("div", { className: `device-calculator ${compactKeys ? "compact-mode" : ""}`, "aria-label": "Scientific calculator", children: [
    screen === "calc" ? /* @__PURE__ */ jsx(Fragment, { children: [
      /* @__PURE__ */ jsx("header", { className: "device-calc-header", children: [
        /* @__PURE__ */ jsx("button", { "aria-label": "Exit calculator", onClick: onClose, children: /* @__PURE__ */ jsx(Maximize2, { size: 17 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 88,
          columnNumber: 101
        }, this) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 88,
          columnNumber: 46
        }, this),
        /* @__PURE__ */ jsx("div", { className: "device-header-spacer" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 88,
          columnNumber: 132
        }, this),
        /* @__PURE__ */ jsx("button", { className: `device-key-mode-toggle ${compactKeys ? "active" : ""}`, "aria-label": compactKeys ? "Show scientific buttons" : "Hide scientific buttons", "aria-pressed": compactKeys, onClick: toggleKeypad, children: React.createElement("span", { className: "device-key-mode-glyph", "aria-hidden": "true", children: (compactKeys ? ["+", "−", "×", "="] : ["√", "π", "e", "="]).map((symbol, index) => React.createElement("span", { key: index, children: symbol })) }) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 88,
          columnNumber: 248
        }, this),
        /* @__PURE__ */ jsx("button", { "aria-label": "Converters", onClick: () => setScreen("menu"), children: React.createElement("svg", { width: 19, height: 19, viewBox: "0 0 18 18", fill: "currentColor", "aria-hidden": "true" }, React.createElement("circle", { cx: 4, cy: 4, r: 2.5 }), React.createElement("circle", { cx: 14, cy: 4, r: 2.5 }), React.createElement("circle", { cx: 4, cy: 14, r: 2.5 }), React.createElement("circle", { cx: 14, cy: 14, r: 2.5 })) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 88,
          columnNumber: 171
        }, this),
        /* @__PURE__ */ jsx("button", { ref: optionsButtonRef, "aria-label": "Calculator options", onClick: () => setMenu((x) => !x), children: /* @__PURE__ */ jsx(MoreVertical, { size: 19 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 88,
          columnNumber: 333
        }, this) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 88,
          columnNumber: 264
        }, this),
        menu && /* @__PURE__ */ jsx("div", { ref: menuRef, className: "device-overflow", children: [
          /* @__PURE__ */ jsx("div", { className: "device-overflow-history", children: [
            /* @__PURE__ */ jsx("button", { onClick: () => {
              setScreen("history");
              setMenu(false);
            }, children: [/* @__PURE__ */ jsx(History, { size: 15 }), "History"] }, void 0, true, { fileName: "<stdin>", lineNumber: 88, columnNumber: 560 }, this),
            /* @__PURE__ */ jsx("button", { className: "device-history-clear", "aria-label": "Clear calculator history", onClick: () => {
              setHistory([]);
              localStorage.removeItem("apexjee-calculator-history");
            }, children: /* @__PURE__ */ jsx(Trash2, { size: 15 }) }, void 0, false, { fileName: "<stdin>", lineNumber: 88, columnNumber: 650 }, this)
          ] }, void 0, true, { fileName: "<stdin>", lineNumber: 88, columnNumber: 553 }, this),
          /* @__PURE__ */ jsx("button", { onClick: () => {
            setExpression("");
            setResult("");
            setMenu(false);
          }, children: "Clear calculation" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 88,
            columnNumber: 505
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 88,
          columnNumber: 374
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 88,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx("div", { className: "device-calc-display", children: [
        /* @__PURE__ */ jsx("div", { className: "device-expression", children: expression.replaceAll("asin(", "sin\u207B\xB9(").replaceAll("acos(", "cos\u207B\xB9(").replaceAll("atan(", "tan\u207B\xB9(").replaceAll("sqrt(", "\u221A(").replaceAll("exp(", "e^").replaceAll("*", "\xD7").replaceAll("/", "\xF7").replaceAll("-", "\u2212").replace(/\^(\d+)/g, (_, power) => ["\u2070", "\xB9", "\xB2", "\xB3", "\u2074", "\u2075", "\u2076", "\u2077", "\u2078", "\u2079"][Number(power)] ?? `^${power}`) || " " }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 89,
          columnNumber: 44
        }, this),
        /* @__PURE__ */ jsx("div", { className: "device-result", children: result }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 89,
          columnNumber: 399
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 89,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx("div", { className: `device-keypad ${compactKeys ? "compact" : ""} ${keypadTurning ? "keypad-turning" : ""}`, children: visibleKeypad.map((key, index) => /* @__PURE__ */ jsx("button", { className: `device-key ${["\xF7", "\xD7", "\u2212", "+", "="].includes(key) ? "operator" : ""} ${key === "=" ? "equals" : ""} ${["AC", "\u232B"].includes(key) ? "utility" : ""} ${key === angle.toLowerCase() ? "active-angle" : ""}`, onClick: () => key === "rad" ? setAngle("RAD") : key === "deg" ? setAngle("DEG") : key === "inv" ? setInverse((value) => !value) : edit(key), children: key === "\u232B" ? /* @__PURE__ */ jsx(Delete, { className: "device-delete-icon", size: 18 }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 90,
        columnNumber: 415
      }, this) : key === "inv" ? /* @__PURE__ */ jsx("span", { className: inverse ? "inverse-on" : "", children: "inv" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 90,
        columnNumber: 478
      }, this) : inverse && ["sin", "cos", "tan"].includes(key) ? `${key}\u207B\xB9` : key }, `${key}-${index}`, false, {
        fileName: "<stdin>",
        lineNumber: 90,
        columnNumber: 63
      }, this)) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 90,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 87,
      columnNumber: 22
    }, this) : screen === "history" ? /* @__PURE__ */ jsx(Fragment, { children: [
      /* @__PURE__ */ jsx("header", { className: "device-calc-subheader", children: [
        /* @__PURE__ */ jsx("button", { onClick: () => setScreen("calc"), "aria-label": "Back to calculator", children: /* @__PURE__ */ jsx(ArrowLeft, { size: 19 }) }, void 0, false, { fileName: "<stdin>", lineNumber: 91, columnNumber: 49 }, this),
        /* @__PURE__ */ jsx("strong", { children: "History" }, void 0, false, { fileName: "<stdin>", lineNumber: 91, columnNumber: 138 }, this),
        /* @__PURE__ */ jsx("button", { className: "device-history-trash", onClick: () => {
          setHistory([]);
          localStorage.removeItem("apexjee-calculator-history");
        }, "aria-label": "Clear calculator history", children: /* @__PURE__ */ jsx(Trash2, { size: 16 }) }, void 0, false, { fileName: "<stdin>", lineNumber: 91, columnNumber: 176 }, this)
      ] }, void 0, true, { fileName: "<stdin>", lineNumber: 91, columnNumber: 7 }, this),
      /* @__PURE__ */ jsx("div", { className: "device-history-list", children: history.length ? history.map((item, index) => /* @__PURE__ */ jsx("button", { onClick: () => {
        setExpression(item.expression);
        setResult(item.result);
        setScreen("calc");
        setJustSolved(true);
      }, children: [/* @__PURE__ */ jsx("span", { children: item.expression }, void 0, false, { fileName: "<stdin>", lineNumber: 92, columnNumber: 90 }, this), /* @__PURE__ */ jsx("strong", { children: item.result }, void 0, false, { fileName: "<stdin>", lineNumber: 92, columnNumber: 122 }, this)] }, `${item.at}-${index}`, true, { fileName: "<stdin>", lineNumber: 92, columnNumber: 65 }, this)) : /* @__PURE__ */ jsx("p", { children: "No calculations yet" }, void 0, false, { fileName: "<stdin>", lineNumber: 92, columnNumber: 200 }, this) }, void 0, false, { fileName: "<stdin>", lineNumber: 92, columnNumber: 7 }, this)
    ] }, void 0, true, { fileName: "<stdin>", lineNumber: 91, columnNumber: 25 }, this) : screen === "menu" ? /* @__PURE__ */ jsx(Fragment, { children: [
      /* @__PURE__ */ jsx("header", { className: "device-calc-subheader", children: [
        /* @__PURE__ */ jsx("button", { onClick: () => setScreen("calc"), "aria-label": "Back", children: /* @__PURE__ */ jsx(ArrowLeft, { size: 19 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 92,
          columnNumber: 107
        }, this) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 92,
          columnNumber: 49
        }, this),
        /* @__PURE__ */ jsx("strong", { children: "Unit converter" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 92,
          columnNumber: 138
        }, this),
        /* @__PURE__ */ jsx("span", {}, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 92,
          columnNumber: 169
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 92,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx("div", { className: "device-converter-menu", children: CATEGORIES.map(([name, icon]) => /* @__PURE__ */ jsx("button", { type: "button", "aria-label": `${name} converter`, onClick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        selectCategory(name);
      }, children: [
        /* @__PURE__ */ jsx("span", { children: icon }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 93,
          columnNumber: 131
        }, this),
        /* @__PURE__ */ jsx("small", { children: name }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 93,
          columnNumber: 150
        }, this)
      ] }, name, true, {
        fileName: "<stdin>",
        lineNumber: 93,
        columnNumber: 77
      }, this)) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 93,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 91,
      columnNumber: 25
    }, this) : /* @__PURE__ */ jsx(Fragment, { children: [
      /* @__PURE__ */ jsx("header", { className: "device-calc-subheader", children: [
        /* @__PURE__ */ jsx("button", { onClick: () => setScreen("menu"), "aria-label": "Back", children: /* @__PURE__ */ jsx(ArrowLeft, { size: 19 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 95,
          columnNumber: 107
        }, this) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 95,
          columnNumber: 49
        }, this),
        /* @__PURE__ */ jsx("strong", { children: [
          category,
          " conversion"
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 95,
          columnNumber: 138
        }, this),
        /* @__PURE__ */ jsx("span", {}, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 95,
          columnNumber: 176
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 95,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx("div", { className: "device-converter-cards", children: [
        /* @__PURE__ */ jsx("article", { children: [
          /* @__PURE__ */ jsx("div", { children: unitButton("from") }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 96,
            columnNumber: 56
          }, this),
          /* @__PURE__ */ jsx("input", { inputMode: "decimal", value: input, onChange: (e) => setInput(category === "Number system" ? e.target.value.replace(/[^0-9a-f]/gi, "") : e.target.value.replace(/[^0-9.+-]/g, "")), "aria-label": "Value to convert" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 96,
            columnNumber: 87
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 96,
          columnNumber: 47
        }, this),
        /* @__PURE__ */ jsx("button", { className: "device-swap", "aria-label": "Swap units", onClick: () => {
          setFrom(to);
          setTo(from);
        }, children: /* @__PURE__ */ jsx(ArrowLeftRight, { size: 17 }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 96,
          columnNumber: 398
        }, this) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 96,
          columnNumber: 301
        }, this),
        /* @__PURE__ */ jsx("article", { children: [
          /* @__PURE__ */ jsx("div", { children: unitButton("to") }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 96,
            columnNumber: 443
          }, this),
          /* @__PURE__ */ jsx("output", { children: converted }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 96,
            columnNumber: 472
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 96,
          columnNumber: 434
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 96,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsx("div", { className: "device-convert-keys", children: [
        /* @__PURE__ */ jsx("div", { className: `device-convert-keypad ${category === "Number system" ? "base-keypad" : ""}`, children: (category === "Number system" ? ["7", "8", "9", "4", "5", "6", "1", "2", "3", "A", "B", "C", "0", "D", "E", "F"] : ["7", "8", "9", "4", "5", "6", "1", "2", "3", "00", "0", "."]).map((k, i) => /* @__PURE__ */ jsx("button", { onClick: () => convertKey(k), children: k }, `${k}-${i}`, false, {
          fileName: "<stdin>",
          lineNumber: 97,
          columnNumber: 290
        }, this)) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 97,
          columnNumber: 44
        }, this),
        /* @__PURE__ */ jsx("div", { className: "device-convert-sidekeys", children: ["AC", "\u232B", "\xB1"].map((k) => /* @__PURE__ */ jsx("button", { onClick: () => convertKey(k), children: k }, k, false, {
          fileName: "<stdin>",
          lineNumber: 97,
          columnNumber: 428
        }, this)) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 97,
          columnNumber: 364
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 97,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 94,
      columnNumber: 9
    }, this),
    unitPicker && /* @__PURE__ */ jsx("div", { className: "device-unit-backdrop", onMouseDown: (e) => {
      if (e.target === e.currentTarget) setUnitPicker(null);
    }, children: /* @__PURE__ */ jsx("section", { className: "device-unit-sheet", children: [
      /* @__PURE__ */ jsx("header", { children: [
        /* @__PURE__ */ jsx("button", { onClick: () => setUnitPicker(null), children: "Cancel" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 99,
          columnNumber: 173
        }, this),
        /* @__PURE__ */ jsx("strong", { children: "Select unit" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 99,
          columnNumber: 230
        }, this),
        /* @__PURE__ */ jsx("span", {}, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 99,
          columnNumber: 258
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 99,
        columnNumber: 165
      }, this),
      /* @__PURE__ */ jsx("div", { children: unitNames(category).map((unit) => /* @__PURE__ */ jsx("button", { className: (unitPicker === "from" ? from : to) === unit ? "selected" : "", onClick: () => {
        unitPicker === "from" ? setFrom(unit) : setTo(unit);
        setUnitPicker(null);
      }, children: unit }, unit, false, {
        fileName: "<stdin>",
        lineNumber: 99,
        columnNumber: 310
      }, this)) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 99,
        columnNumber: 274
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 99,
      columnNumber: 126
    }, this) }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 99,
      columnNumber: 18
    }, this)
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 86,
    columnNumber: 10
  }, this);
}
export {
  DeviceCalculator as default
};
