const MAX_FILES = 1000;
const MAX_ZIP_BYTES = 2 * 1024 * 1024 * 1024 - 1024;
const INITIAL_RENDER_LIMIT = 80;
const RENDER_STEP = 80;

const IMAGE_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "webp", "gif", "svg", "bmp", "tif", "tiff", "avif", "heic", "heif", "ico"
]);

const VIDEO_EXTENSIONS = new Set([
  "mp4", "mov", "m4v", "avi", "mkv", "webm", "mpg", "mpeg", "3gp", "ogv"
]);

const previewableImages = new Set(["jpg", "jpeg", "png", "webp", "gif", "svg", "bmp", "avif", "ico"]);
const previewableVideos = new Set(["mp4", "mov", "m4v", "webm", "ogv"]);

const prefixInput = document.querySelector("#prefixInput");
const startNumberInput = document.querySelector("#startNumberInput");
const nameExample = document.querySelector("#nameExample");
const dropZone = document.querySelector("#dropZone");
const filesInput = document.querySelector("#filesInput");
const folderInput = document.querySelector("#folderInput");
const selectFilesButton = document.querySelector("#selectFilesButton");
const selectFolderButton = document.querySelector("#selectFolderButton");
const enumerateButton = document.querySelector("#enumerateButton");
const clearButton = document.querySelector("#clearButton");
const fileCount = document.querySelector("#fileCount");
const imageCount = document.querySelector("#imageCount");
const videoCount = document.querySelector("#videoCount");
const totalSize = document.querySelector("#totalSize");
const progressArea = document.querySelector("#progressArea");
const progressText = document.querySelector("#progressText");
const progressPercent = document.querySelector("#progressPercent");
const progressBar = document.querySelector("#progressBar");
const notice = document.querySelector("#notice");
const visibleCounter = document.querySelector("#visibleCounter");
const emptyState = document.querySelector("#emptyState");
const fileGrid = document.querySelector("#fileGrid");
const showMoreButton = document.querySelector("#showMoreButton");
const fileCardTemplate = document.querySelector("#fileCardTemplate");
const toast = document.querySelector("#toast");

let items = [];
let renderLimit = INITIAL_RENDER_LIMIT;
let itemSequence = 0;
let isProcessing = false;
let toastTimer;
const objectUrls = new Map();

function extensionOf(filename) {
  const position = filename.lastIndexOf(".");
  return position > -1 ? filename.slice(position + 1).toLowerCase() : "";
}

function supportedKind(file) {
  const extension = extensionOf(file.name);
  if (IMAGE_EXTENSIONS.has(extension) || file.type.startsWith("image/")) return "image";
  if (VIDEO_EXTENSIONS.has(extension) || file.type.startsWith("video/")) return "video";
  return null;
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 100 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function sanitizePrefix(value) {
  return value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/[. ]+$/g, "").trim();
}

function typeLabel(item) {
  const extension = item.extension.toUpperCase() || "ARCHIVO";
  return `${extension} · ${formatBytes(item.file.size)}`;
}

function newNameFor(item, index) {
  const prefix = sanitizePrefix(prefixInput.value);
  const start = Math.max(0, Number.parseInt(startNumberInput.value, 10) || 0);
  const extension = item.kind === "image" ? "png" : item.extension;
  return `${prefix}${start + index}${extension ? `.${extension}` : ""}`;
}

function updateNames() {
  items.forEach((item, index) => {
    item.newName = newNameFor(item, index);
  });

  const exampleItem = items[0] || { extension: "jpg", kind: "image" };
  nameExample.textContent = newNameFor(exampleItem, 0) || "1.png";

  document.querySelectorAll(".file-card").forEach((card) => {
    const item = items.find((candidate) => candidate.id === Number(card.dataset.id));
    if (item) card.querySelector(".new-name").textContent = item.newName;
  });

  enumerateButton.disabled = !items.length || !sanitizePrefix(prefixInput.value) || isProcessing;
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function showNotice(message = "") {
  notice.hidden = !message;
  notice.textContent = message;
}

function revokeObjectUrl(id) {
  const url = objectUrls.get(id);
  if (url) URL.revokeObjectURL(url);
  objectUrls.delete(id);
}

function createPreview(item, container) {
  if (item.kind === "image" && previewableImages.has(item.extension)) {
    const image = document.createElement("img");
    const url = URL.createObjectURL(item.file);
    objectUrls.set(item.id, url);
    image.src = url;
    image.alt = `Vista previa de ${item.file.name}`;
    image.loading = "lazy";
    image.addEventListener("error", () => showPlaceholder(container, item.extension));
    container.append(image);
    return;
  }

  if (item.kind === "video" && previewableVideos.has(item.extension)) {
    const video = document.createElement("video");
    const url = URL.createObjectURL(item.file);
    objectUrls.set(item.id, url);
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.controls = true;
    video.addEventListener("error", () => showPlaceholder(container, item.extension));
    container.append(video);
    return;
  }

  showPlaceholder(container, item.extension);
}

function showPlaceholder(container, extension) {
  const media = container.querySelector("img, video");
  if (media) media.remove();
  if (!container.querySelector(".preview-placeholder")) {
    const placeholder = document.createElement("span");
    placeholder.className = "preview-placeholder";
    placeholder.textContent = extension.toUpperCase() || "FILE";
    container.append(placeholder);
  }
}

function renderFiles() {
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls.clear();
  fileGrid.replaceChildren();

  const visibleItems = items.slice(0, renderLimit);
  const fragment = document.createDocumentFragment();

  visibleItems.forEach((item) => {
    const card = fileCardTemplate.content.firstElementChild.cloneNode(true);
    card.dataset.id = String(item.id);
    createPreview(item, card.querySelector(".preview-box"));

    const kindBadge = card.querySelector(".kind-badge");
    kindBadge.textContent = item.kind === "image" ? "IMAGEN" : "VIDEO";
    kindBadge.classList.toggle("video", item.kind === "video");
    card.querySelector(".current-name").textContent = item.file.name;
    card.querySelector(".current-name").title = item.file.name;
    card.querySelector(".file-type").textContent = typeLabel(item);
    card.querySelector(".new-name").textContent = item.newName;
    card.querySelector(".new-name").title = item.newName;
    card.querySelector(".remove-button").addEventListener("click", () => removeItem(item.id));
    fragment.append(card);
  });

  fileGrid.append(fragment);
  emptyState.hidden = items.length > 0;
  showMoreButton.hidden = visibleItems.length >= items.length;
  visibleCounter.textContent = items.length
    ? `Mostrando ${visibleItems.length} de ${items.length}`
    : "0 archivos";
}

function updateStats() {
  const images = items.filter((item) => item.kind === "image").length;
  const videos = items.length - images;
  const bytes = items.reduce((sum, item) => sum + item.file.size, 0);

  fileCount.textContent = String(items.length);
  imageCount.textContent = String(images);
  videoCount.textContent = String(videos);
  totalSize.textContent = formatBytes(bytes);
  clearButton.disabled = !items.length || isProcessing;
  updateNames();

  if (bytes > MAX_ZIP_BYTES) {
    showNotice("El contenido supera 2 GB. Para mantener compatibilidad con navegadores, divide los archivos en dos o más ZIP.");
  } else {
    showNotice();
  }
}

function naturalSort(a, b) {
  const pathA = a.file.webkitRelativePath || a.file.name;
  const pathB = b.file.webkitRelativePath || b.file.name;
  return pathA.localeCompare(pathB, "es", { numeric: true, sensitivity: "base" });
}

function addFiles(fileList) {
  if (isProcessing) return;

  const incoming = Array.from(fileList);
  const existingKeys = new Set(items.map((item) => item.key));
  let unsupported = 0;
  let duplicates = 0;
  let limited = 0;

  for (const file of incoming) {
    if (items.length >= MAX_FILES) {
      limited += 1;
      continue;
    }

    const kind = supportedKind(file);
    if (!kind) {
      unsupported += 1;
      continue;
    }

    const key = `${file.webkitRelativePath || file.name}|${file.size}|${file.lastModified}`;
    if (existingKeys.has(key)) {
      duplicates += 1;
      continue;
    }

    existingKeys.add(key);
    items.push({
      id: ++itemSequence,
      key,
      file,
      kind,
      extension: extensionOf(file.name),
      newName: ""
    });
  }

  items.sort(naturalSort);
  renderLimit = Math.max(INITIAL_RENDER_LIMIT, Math.min(renderLimit, items.length));
  updateStats();
  renderFiles();

  const messages = [];
  if (unsupported) messages.push(`${unsupported} formato${unsupported === 1 ? "" : "s"} no compatible${unsupported === 1 ? "" : "s"}`);
  if (duplicates) messages.push(`${duplicates} duplicado${duplicates === 1 ? "" : "s"} omitido${duplicates === 1 ? "" : "s"}`);
  if (limited) messages.push(`se alcanzó el límite de ${MAX_FILES}`);
  showToast(messages.length ? messages.join(" · ") : `${items.length} archivo${items.length === 1 ? " agregado" : "s agregados"}`);
}

function removeItem(id) {
  revokeObjectUrl(id);
  items = items.filter((item) => item.id !== id);
  updateStats();
  renderFiles();
}

function clearAll() {
  if (!items.length || isProcessing) return;
  if (!window.confirm("¿Quieres quitar todos los archivos agregados?")) return;
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls.clear();
  items = [];
  renderLimit = INITIAL_RENDER_LIMIT;
  filesInput.value = "";
  folderInput.value = "";
  showNotice("");
  setProgress(0, "Listo para procesar nuevo contenido");
  updateStats();
  renderFiles();
  showToast("Contenido eliminado");
}

function readDirectoryEntries(reader) {
  return new Promise((resolve, reject) => {
    const entries = [];
    const readBatch = () => {
      reader.readEntries((batch) => {
        if (!batch.length) return resolve(entries);
        entries.push(...batch);
        readBatch();
      }, reject);
    };
    readBatch();
  });
}

function fileFromEntry(entry) {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function filesFromEntry(entry) {
  if (entry.isFile) return [await fileFromEntry(entry)];
  if (!entry.isDirectory) return [];
  const children = await readDirectoryEntries(entry.createReader());
  const nested = await Promise.all(children.map(filesFromEntry));
  return nested.flat();
}

async function filesFromDrop(dataTransfer) {
  const entries = Array.from(dataTransfer.items || [])
    .map((item) => item.webkitGetAsEntry?.())
    .filter(Boolean);

  if (!entries.length) return Array.from(dataTransfer.files || []);
  const groups = await Promise.all(entries.map(filesFromEntry));
  return groups.flat();
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let number = 0; number < 256; number += 1) {
    let value = number;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[number] = value >>> 0;
  }
  return table;
}

const CRC_TABLE = makeCrcTable();

async function crc32File(file, onChunk) {
  const chunkSize = 4 * 1024 * 1024;
  let crc = 0xffffffff;

  for (let offset = 0; offset < file.size; offset += chunkSize) {
    const bytes = new Uint8Array(await file.slice(offset, offset + chunkSize).arrayBuffer());
    for (let index = 0; index < bytes.length; index += 1) {
      crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
    }
    onChunk(bytes.length);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`El navegador no pudo leer ${file.name}`));
    };
    image.src = url;
  });
}

async function imageSource(file) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (error) {
      console.warn("Se usará el decodificador alternativo para", file.name, error);
    }
  }
  return loadImageElement(file);
}

async function convertImageToPng(file) {
  const source = await imageSource(file);
  const sourceWidth = source.naturalWidth || source.width;
  const sourceHeight = source.naturalHeight || source.height;

  if (!sourceWidth || !sourceHeight) {
    if (typeof source.close === "function") source.close();
    throw new Error(`No se pudieron obtener las dimensiones de ${file.name}`);
  }

  const canvas = document.createElement("canvas");
  canvas.width = sourceWidth;
  canvas.height = sourceHeight;
  const context = canvas.getContext("2d");

  if (!context) {
    if (typeof source.close === "function") source.close();
    throw new Error(`No se pudo preparar ${file.name}`);
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, sourceWidth, sourceHeight);
  context.drawImage(source, 0, 0, sourceWidth, sourceHeight);
  if (typeof source.close === "function") source.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error(`No se pudo convertir ${file.name} a PNG`));
    }, "image/png");
  });
}

function dosDateTime(dateValue) {
  const date = new Date(dateValue || Date.now());
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: day };
}

function localHeader(nameBytes, size, crc, modified) {
  const buffer = new ArrayBuffer(30 + nameBytes.length);
  const view = new DataView(buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, modified.time, true);
  view.setUint16(12, modified.date, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, nameBytes.length, true);
  view.setUint16(28, 0, true);
  new Uint8Array(buffer, 30).set(nameBytes);
  return buffer;
}

function centralHeader(nameBytes, size, crc, modified, offset) {
  const buffer = new ArrayBuffer(46 + nameBytes.length);
  const view = new DataView(buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, modified.time, true);
  view.setUint16(14, modified.date, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, nameBytes.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, offset, true);
  new Uint8Array(buffer, 46).set(nameBytes);
  return buffer;
}

function endRecord(count, centralSize, centralOffset) {
  const buffer = new ArrayBuffer(22);
  const view = new DataView(buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, count, true);
  view.setUint16(10, count, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  view.setUint16(20, 0, true);
  return buffer;
}

function setProgress(percent, text) {
  const safePercent = Math.min(100, Math.max(0, Math.round(percent)));
  progressArea.hidden = false;
  progressText.textContent = text;
  progressPercent.textContent = `${safePercent}%`;
  progressBar.style.width = `${safePercent}%`;
}

async function buildZip() {
  const prefix = sanitizePrefix(prefixInput.value);
  if (!items.length || !prefix || isProcessing) return;

  const originalSize = items.reduce((sum, item) => sum + item.file.size, 0);
  if (originalSize > MAX_ZIP_BYTES) {
    showNotice("El contenido supera 2 GB. Divide los archivos en varios grupos para crear ZIP compatibles.");
    return;
  }

  isProcessing = true;
  updateStats();
  const parts = [];
  const centralParts = [];
  const encoder = new TextEncoder();
  let localOffset = 0;
  let outputSize = 0;

  try {
    setProgress(0, "Preparando contenido…");

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (item.kind === "image") {
        setProgress(
          (index / items.length) * 92,
          `Convirtiendo ${index + 1} de ${items.length} a PNG en tamaño original: ${item.file.name}`
        );
      }

      const outputFile = item.kind === "image"
        ? await convertImageToPng(item.file)
        : item.file;
      outputSize += outputFile.size;

      if (outputSize > MAX_ZIP_BYTES) {
        throw new Error("ZIP_TOO_LARGE");
      }

      const nameBytes = encoder.encode(item.newName);
      const modified = dosDateTime(item.file.lastModified);
      let fileBytesProcessed = 0;
      const crc = await crc32File(outputFile, (bytes) => {
        fileBytesProcessed += bytes;
        const itemProgress = outputFile.size ? fileBytesProcessed / outputFile.size : 1;
        const percent = ((index + itemProgress) / items.length) * 92;
        setProgress(percent, `Procesando ${index + 1} de ${items.length}: ${item.file.name}`);
      });

      const local = localHeader(nameBytes, outputFile.size, crc, modified);
      const central = centralHeader(nameBytes, outputFile.size, crc, modified, localOffset);
      parts.push(local, outputFile);
      centralParts.push(central);
      localOffset += local.byteLength + outputFile.size;
    }

    const centralOffset = localOffset;
    const centralSize = centralParts.reduce((sum, part) => sum + part.byteLength, 0);
    parts.push(...centralParts, endRecord(items.length, centralSize, centralOffset));
    setProgress(96, "Creando archivo ZIP…");

    const blob = new Blob(parts, { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${prefix}-numerados.zip`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setProgress(100, `ZIP listo con ${items.length} archivos`);
    showToast("ZIP creado correctamente");
  } catch (error) {
    console.error(error);
    if (error.message === "ZIP_TOO_LARGE") {
      showNotice("El ZIP convertido supera 2 GB. Divide el contenido en varios grupos.");
    } else {
      showNotice(`${error.message}. Prueba con otro formato o con menos archivos.`);
    }
    setProgress(0, "Ocurrió un error al crear el ZIP");
  } finally {
    isProcessing = false;
    updateStats();
  }
}

selectFilesButton.addEventListener("click", (event) => {
  event.stopPropagation();
  filesInput.click();
});

selectFolderButton.addEventListener("click", (event) => {
  event.stopPropagation();
  folderInput.click();
});

dropZone.addEventListener("click", (event) => {
  if (event.target.closest("button")) return;
  filesInput.click();
});

dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    filesInput.click();
  }
});

filesInput.addEventListener("change", () => {
  addFiles(filesInput.files);
  filesInput.value = "";
});

folderInput.addEventListener("change", () => {
  addFiles(folderInput.files);
  folderInput.value = "";
});

["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    if (eventName === "dragleave" && dropZone.contains(event.relatedTarget)) return;
    dropZone.classList.remove("is-dragging");
  });
});

dropZone.addEventListener("drop", async (event) => {
  try {
    const droppedFiles = await filesFromDrop(event.dataTransfer);
    addFiles(droppedFiles);
  } catch (error) {
    console.error(error);
    showNotice("No se pudo leer esa carpeta. Utiliza el botón “Seleccionar carpeta”.");
  }
});

prefixInput.addEventListener("input", updateNames);
startNumberInput.addEventListener("input", updateNames);
enumerateButton.addEventListener("click", buildZip);
clearButton.addEventListener("click", clearAll);

showMoreButton.addEventListener("click", () => {
  renderLimit += RENDER_STEP;
  renderFiles();
});

window.addEventListener("beforeunload", () => {
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
});

updateStats();
renderFiles();
