import React from "react";

const el = React.createElement;

function Illustration({ size = 20, className, children }) {
  return el("svg", {
    width: size,
    height: size,
    viewBox: "0 0 48 48",
    fill: "none",
    className,
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": "true",
    focusable: "false"
  }, children);
}

export function NotesFolderIcon(props) {
  return el(Illustration, { ...props, children: [
    el("path", { key: "folder", d: "M5.5 12.5h13l4 4h20v22h-37z", fill: "currentColor", fillOpacity: .12, stroke: "currentColor", strokeWidth: 2, strokeLinejoin: "round" }),
    el("path", { key: "back", d: "M7.5 17.5h33v19h-33z", fill: "currentColor", fillOpacity: .08 }),
    el("path", { key: "note", d: "M10 7.5h17l7 7v17H10z", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinejoin: "round" }),
    el("path", { key: "fold", d: "M27 7.5v7h7", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinejoin: "round" }),
    el("path", { key: "lines", d: "M14 19h12M14 23h9", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" }),
    el("circle", { key: "badge", cx: 34.5, cy: 31.5, r: 7.5, fill: "var(--surface-soft, currentColor)", stroke: "currentColor", strokeWidth: 1.5 }),
    el("path", { key: "badge-line", d: "M31.5 31.5h6", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" })
  ] });
}

export function ReadingListIcon(props) {
  return el(Illustration, { ...props, children: [
    el("path", { key: "book", d: "M7 7h21v34H7z", fill: "currentColor", fillOpacity: .08, stroke: "currentColor", strokeWidth: 1.7, strokeLinejoin: "round" }),
    el("path", { key: "spine", d: "M11 7v34", stroke: "currentColor", strokeWidth: 1.4 }),
    el("path", { key: "title", d: "M16 16h8M16 20h7", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round" }),
    el("path", { key: "sheet", d: "M22 22h19v20H22z", fill: "currentColor", fillOpacity: .12, stroke: "currentColor", strokeWidth: 1.7, strokeLinejoin: "round" }),
    el("path", { key: "check", d: "m25 28 1.5 1.5 2.5-3", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" }),
    el("path", { key: "list", d: "M31.5 28h6M25 34h12M25 38h12", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round" })
  ] });
}

export function StudyTableIcon(props) {
  return el(Illustration, { ...props, children: [
    el("path", { key: "top", d: "M6 17h36v5H6z", fill: "currentColor", fillOpacity: .12, stroke: "currentColor", strokeWidth: 1.7, strokeLinejoin: "round" }),
    el("path", { key: "legs", d: "M10 22h4l-2 17H8zM34 22h4l4 17h-4z", fill: "currentColor", fillOpacity: .08, stroke: "currentColor", strokeWidth: 1.5, strokeLinejoin: "round" }),
    el("path", { key: "brace", d: "M14 31h23", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" }),
    el("path", { key: "book", d: "M15 7h9v9h-9z", fill: "currentColor", fillOpacity: .08, stroke: "currentColor", strokeWidth: 1.4 }),
    el("path", { key: "book2", d: "M25 8h8v8h-8z", fill: "none", stroke: "currentColor", strokeWidth: 1.4 }),
    el("path", { key: "book-lines", d: "M17 10h5M17 13h5M27 11h4", stroke: "currentColor", strokeWidth: 1.2, strokeLinecap: "round" }),
    el("path", { key: "lamp", d: "m35 8 5 5h-9zM35.5 13v3", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinejoin: "round" }),
    el("circle", { key: "knob", cx: 29, cy: 19.5, r: 1, fill: "currentColor" })
  ] });
}

export function FlashcardsIcon(props) {
  return el(Illustration, { ...props, children: [
    el("path", { key: "back", d: "M10 8h21v29H10z", fill: "currentColor", fillOpacity: .08, stroke: "currentColor", strokeWidth: 1.5, strokeLinejoin: "round" }),
    el("path", { key: "front", d: "M17 5h23v35H17z", fill: "var(--surface-soft, transparent)", stroke: "currentColor", strokeWidth: 1.7, strokeLinejoin: "round" }),
    el("path", { key: "letter", d: "M24 26 28.5 13 33 26M25.5 22h6", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" }),
    el("path", { key: "lines", d: "M23 31h11M23 35h8", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" })
  ] });
}

export function AiChipIcon(props) {
  return el(Illustration, { ...props, children: [
    el("g", { key: "circuit", stroke: "#E2C65B", strokeWidth: 1.65, strokeLinecap: "round", strokeLinejoin: "round" }, [
      el("rect", { key: "chip", x: 16, y: 13, width: 16, height: 22, rx: 1.5 }),
      el("path", { key: "left-pins", d: "M16 18H11L8 15H5M16 24h-5l-2 2H5M16 30h-5l-2 3H5" }),
      el("path", { key: "right-pins", d: "M32 18h5l3-3h3M32 24h5l2 2h4M32 30h5l2 3h4" }),
      el("path", { key: "top-pins", d: "M21 13V9l-2-2V4M27 13V9l2-2V4" }),
      el("path", { key: "bottom-pins", d: "M21 35v4l-2 2v3M27 35v4l2 2v3" }),
      el("circle", { key: "top-left-node", cx: 19, cy: 4, r: 1.5 }),
      el("circle", { key: "top-right-node", cx: 29, cy: 4, r: 1.5 }),
      el("circle", { key: "left-node-1", cx: 4, cy: 15, r: 1.4 }),
      el("circle", { key: "left-node-2", cx: 4, cy: 26, r: 1.4 }),
      el("circle", { key: "left-node-3", cx: 4, cy: 33, r: 1.4 }),
      el("circle", { key: "right-node-1", cx: 44, cy: 15, r: 1.4 }),
      el("circle", { key: "right-node-2", cx: 44, cy: 26, r: 1.4 }),
      el("circle", { key: "right-node-3", cx: 44, cy: 33, r: 1.4 }),
      el("circle", { key: "bottom-left-node", cx: 19, cy: 44, r: 1.5 }),
      el("circle", { key: "bottom-right-node", cx: 29, cy: 44, r: 1.5 })
    ]),
    el("text", { key: "ai", x: 24, y: 27, fill: "#E2C65B", fontFamily: "Arial, sans-serif", fontSize: 9, fontWeight: 500, textAnchor: "middle", dominantBaseline: "middle" }, "AI")
  ] });
}
