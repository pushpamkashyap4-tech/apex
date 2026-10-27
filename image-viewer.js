import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const CACHE_DB = "apex-local-image-cache-v1";
const CACHE_STORE = "images";
let databasePromise;
function openCache() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!databasePromise) databasePromise = new Promise((resolve) => {
    const request = indexedDB.open(CACHE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(CACHE_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
  return databasePromise;
}
async function readCachedImage(url) {
  const db = await openCache();
  if (!db) return null;
  return new Promise((resolve) => {
    const request = db.transaction(CACHE_STORE, "readonly").objectStore(CACHE_STORE).get(url);
    request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : request.result || null);
    request.onerror = () => resolve(null);
  });
}
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not cache image."));
    reader.readAsDataURL(blob);
  });
}
async function cacheRemoteImage(url) {
  if (!/^https?:\/\//i.test(url)) return;
  try {
    const db = await openCache();
    if (!db || await readCachedImage(url)) return;
    const response = await fetch(url, { mode: "cors", credentials: "omit", referrerPolicy: "no-referrer" });
    const blob = await response.blob();
    if (!response.ok || !blob.type.startsWith("image/") || blob.size > 8 * 1024 * 1024) return;
    const dataUrl = await blobToDataUrl(blob);
    await storeCachedImage(db, url, dataUrl);
  } catch { /* Remote hosts may not permit browser-side caching. */ }
}
function storeCachedImage(db, url, dataUrl) {
  return new Promise((resolve) => {
    const request = db.transaction(CACHE_STORE, "readwrite").objectStore(CACHE_STORE).put(dataUrl, url);
    request.onsuccess = request.onerror = () => resolve();
  });
}
export async function readImageDataUrl(file, maxEdge = 1400, quality = 0.78) {
  if (!file?.type?.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 15 * 1024 * 1024) throw new Error(`${file.name} is larger than 15 MB.`);
  const source = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });
  const image = await new Promise((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("Could not decode that image."));
    element.src = source;
  });
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare that image.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}
export function ImageFullView({ src, alt = "Image", className = "", ...props }) {
  const [open, setOpen] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [gestureActive, setGestureActive] = useState(false);
  const stageRef = useRef(null);
  const viewRef = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
  const gestureRef = useRef({ points: new Map(), pinch: null, drag: null });
  const lastTapRef = useRef(null);
  const lastTouchZoomAt = useRef(0);
  viewRef.current = { zoom, pan };
  const [cachedSrc, setCachedSrc] = useState("");
  useEffect(() => {
    let active = true;
    setLoadError(false);
    setCachedSrc("");
    if (!/^https?:\/\//i.test(String(src || ""))) {
      return undefined;
    }
    readCachedImage(src).then(async (cachedImage) => {
      if (!active) return;
      if (cachedImage instanceof Blob) {
        const dataUrl = await blobToDataUrl(cachedImage).catch(() => "");
        if (!active) return;
        if (dataUrl) {
          setCachedSrc(dataUrl);
          const db = await openCache();
          if (db) await storeCachedImage(db, src, dataUrl);
        }
      } else if (cachedImage) {
        setCachedSrc(cachedImage);
      }
    });
    return () => {
      active = false;
    };
  }, [src]);
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "+" || event.key === "=") zoomAtCenter(0.25);
      if (event.key === "-") zoomAtCenter(-0.25);
      if (event.key === "0") zoomAtCenter(1 - viewRef.current.zoom);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);
  const displaySrc = cachedSrc || (typeof src === "string" ? src.trim() : "");
  const handleImageError = (event) => {
    props.onError?.(event);
    if (cachedSrc && cachedSrc !== src) {
      setCachedSrc("");
      return;
    }
    setLoadError(true);
  };
  const limitZoom = (value) => Math.max(0.5, Math.min(4, Math.round(value * 100) / 100));
  const constrainPan = (nextZoom, nextPan) => {
    const stage = stageRef.current;
    const image = stage?.querySelector("img");
    if (!stage || !image) return nextPan;
    const maxX = Math.max(0, (image.clientWidth * nextZoom - stage.clientWidth) / 2);
    const maxY = Math.max(0, (image.clientHeight * nextZoom - stage.clientHeight) / 2);
    return { x: Math.max(-maxX, Math.min(maxX, nextPan.x)), y: Math.max(-maxY, Math.min(maxY, nextPan.y)) };
  };
  const setView = (nextZoom, nextPan) => {
    const safeZoom = limitZoom(nextZoom);
    const safePan = safeZoom <= 1 ? { x: 0, y: 0 } : constrainPan(safeZoom, nextPan);
    viewRef.current = { zoom: safeZoom, pan: safePan };
    setZoom(safeZoom);
    setPan(safePan);
  };
  const zoomAt = (nextZoom, clientX, clientY, baseline = viewRef.current) => {
    const stage = stageRef.current;
    const safeZoom = limitZoom(nextZoom);
    if (!stage || !baseline.zoom) return setView(safeZoom, baseline.pan);
    const rect = stage.getBoundingClientRect();
    const pointX = clientX - rect.left - stage.clientWidth / 2;
    const pointY = clientY - rect.top - stage.clientHeight / 2;
    const ratio = safeZoom / baseline.zoom;
    setView(safeZoom, { x: pointX - (pointX - baseline.pan.x) * ratio, y: pointY - (pointY - baseline.pan.y) * ratio });
  };
  const zoomAtCenter = (delta) => {
    const stage = stageRef.current;
    const rect = stage?.getBoundingClientRect();
    if (!rect) return;
    zoomAt(viewRef.current.zoom + delta, rect.left + rect.width / 2, rect.top + rect.height / 2);
  };
  const openModal = () => { setView(1, { x: 0, y: 0 }); setOpen(true); };
  const onPointerDown = (event) => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.setPointerCapture?.(event.pointerId);
    setGestureActive(true);
    const gesture = gestureRef.current;
    gesture.points.set(event.pointerId, { x: event.clientX, y: event.clientY, type: event.pointerType, time: Date.now() });
    if (gesture.points.size >= 2) {
      const [first, second] = [...gesture.points.values()];
      const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      gesture.pinch = { distance: Math.hypot(first.x - second.x, first.y - second.y), midpoint, view: viewRef.current };
      gesture.drag = null;
    } else {
      gesture.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, pan: viewRef.current.pan, moved: false };
    }
  };
  const onPointerMove = (event) => {
    const gesture = gestureRef.current;
    if (!gesture.points.has(event.pointerId)) return;
    gesture.points.set(event.pointerId, { ...gesture.points.get(event.pointerId), x: event.clientX, y: event.clientY });
    if (gesture.points.size >= 2 && gesture.pinch) {
      event.preventDefault();
      const [first, second] = [...gesture.points.values()];
      const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const distance = Math.hypot(first.x - second.x, first.y - second.y);
      const nextZoom = limitZoom(gesture.pinch.view.zoom * distance / Math.max(1, gesture.pinch.distance));
      const rect = stageRef.current.getBoundingClientRect();
      const initialPoint = { x: gesture.pinch.midpoint.x - rect.left - stageRef.current.clientWidth / 2, y: gesture.pinch.midpoint.y - rect.top - stageRef.current.clientHeight / 2 };
      const currentPoint = { x: midpoint.x - rect.left - stageRef.current.clientWidth / 2, y: midpoint.y - rect.top - stageRef.current.clientHeight / 2 };
      const ratio = nextZoom / gesture.pinch.view.zoom;
      setView(nextZoom, {
        x: currentPoint.x - (initialPoint.x - gesture.pinch.view.pan.x) * ratio,
        y: currentPoint.y - (initialPoint.y - gesture.pinch.view.pan.y) * ratio
      });
      return;
    }
    if (gesture.drag && gesture.drag.id === event.pointerId) {
      const dx = event.clientX - gesture.drag.x;
      const dy = event.clientY - gesture.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) gesture.drag.moved = true;
      if (viewRef.current.zoom > 1) setView(viewRef.current.zoom, { x: gesture.drag.pan.x + dx, y: gesture.drag.pan.y + dy });
    }
  };
  const onPointerUp = (event) => {
    const gesture = gestureRef.current;
    const point = gesture.points.get(event.pointerId);
    const wasPinching = gesture.points.size >= 2;
    const wasMoved = gesture.drag?.moved;
    gesture.points.delete(event.pointerId);
    gesture.pinch = null;
    if (gesture.points.size === 1) {
      const [id, remaining] = [...gesture.points.entries()][0];
      gesture.drag = { id, x: remaining.x, y: remaining.y, pan: viewRef.current.pan, moved: true };
      setGestureActive(true);
      return;
    }
    if (!gesture.points.size) gesture.drag = null;
    setGestureActive(false);
    if (event.type === "pointercancel" || !point || wasPinching || point.type !== "touch" || wasMoved || Date.now() - point.time > 280) return;
    const previousTap = lastTapRef.current;
    if (previousTap && Date.now() - previousTap.time < 330 && Math.hypot(event.clientX - previousTap.x, event.clientY - previousTap.y) < 34) {
      const nextZoom = viewRef.current.zoom > 1 ? 1 : 2;
      zoomAt(nextZoom, event.clientX, event.clientY);
      lastTouchZoomAt.current = Date.now();
      lastTapRef.current = null;
    } else lastTapRef.current = { time: Date.now(), x: event.clientX, y: event.clientY };
  };
  return React.createElement(React.Fragment, null,
    loadError || !displaySrc
      ? React.createElement("span", { className: `image-load-fallback ${className}`.trim(), role: "img", "aria-label": alt, style: props.style }, "Image unavailable")
      : React.createElement("img", {
      ...props,
      src: displaySrc,
      alt,
      loading: props.loading || "lazy",
      decoding: "async",
      className,
      onLoad: (event) => {
        props.onLoad?.(event);
        if (!cachedSrc) cacheRemoteImage(src);
      },
      onError: handleImageError,
      onClick: openModal,
      onKeyDown: (event) => {
        props.onKeyDown?.(event);
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openModal(); }
      },
      role: "button",
      tabIndex: 0,
      "aria-label": `Open ${alt} in full view`
    }),
    open && !loadError && displaySrc && createPortal(React.createElement("div", { className: "image-full-view", role: "dialog", "aria-modal": "true", "aria-label": `Full view: ${alt}`, onMouseDown: (event) => { if (event.target === event.currentTarget) setOpen(false); } },
      React.createElement("button", { type: "button", className: "image-full-view-close", onClick: () => setOpen(false), "aria-label": "Close full view" }, "×"),
      React.createElement("div", { ref: stageRef, className: "image-full-view-stage", onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onDoubleClick: (event) => {
        if (Date.now() - lastTouchZoomAt.current < 500) return;
        zoomAt(viewRef.current.zoom > 1 ? 1 : 2, event.clientX, event.clientY);
      }, onWheel: (event) => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        zoomAt(viewRef.current.zoom + (event.deltaY < 0 ? 0.1 : -0.1), event.clientX, event.clientY);
      } }, React.createElement("img", { src: displaySrc, alt, draggable: false, onError: handleImageError, style: { transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transition: gestureActive ? "none" : "transform 260ms cubic-bezier(.2,.8,.2,1)" } })),
      React.createElement("div", { className: "image-full-view-zoom", "aria-label": "Image zoom controls" },
        React.createElement("button", { type: "button", onClick: () => zoomAtCenter(-0.25), disabled: zoom <= 0.5, "aria-label": "Zoom out" }, "−"),
        React.createElement("button", { type: "button", className: "image-full-view-zoom-reset", onClick: () => zoomAtCenter(1 - zoom), "aria-label": "Reset zoom" }, `${Math.round(zoom * 100)}%`),
        React.createElement("button", { type: "button", onClick: () => zoomAtCenter(0.25), disabled: zoom >= 4, "aria-label": "Zoom in" }, "+")
      )
    ), document.body)
  );
}
