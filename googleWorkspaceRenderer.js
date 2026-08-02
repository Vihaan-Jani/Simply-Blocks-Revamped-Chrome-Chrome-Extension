import { getGoogleToken } from "./auth.js";

const MIME = {
    DOC: "application/vnd.google-apps.document",
    SHEET: "application/vnd.google-apps.spreadsheet",
    SLIDES: "application/vnd.google-apps.presentation",
    PDF: "application/pdf"
};

let activePdfBytes = null;
let pdfAnnotations = [];
let pdfTool = "text";
let pdfZoom = 1.25;
let pendingPdfImage = null;
let activeGenericUrl = "";
let activeWorkspaceFile = null;
let activeWorkspaceType = "";
let activeGoogleDocument = null;
let activeDocumentInlineObjects = {};
let activeDocumentPositionedObjects = {};
let activeSpreadsheet = null;
let activePresentation = null;
let sheetChanges = new Map();
let slideTextChanges = new Map();
let slideTextOriginals = new Map();
let slideStructureRequests = [];
let activeSheetSelectedCell = null;
let activeSlidePage = null;
let lastDocumentSelection = null;

async function makePdfImageAsset(blob) {
    let source = blob;
    let mimeType = blob.type;
    if (!/image\/(png|jpeg)/i.test(mimeType)) {
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d").drawImage(bitmap, 0, 0);
        source = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
        mimeType = "image/png";
        bitmap.close();
    }
    return { bytes: new Uint8Array(await source.arrayBuffer()), mimeType, preview: URL.createObjectURL(source) };
}

async function googleFetch(url, token, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            ...(options.headers || {})
        }
    });
    if (!response.ok) {
        let message = "The Google Workspace File Could Not Be Loaded.";
        try {
            const error = await response.json();
            message = error.error?.message || message;
        } catch {}
        throw new Error(message);
    }
    return response;
}

function emitLoaded(file, mode, type, content, editable = true) {
    activeWorkspaceFile = file;
    activeWorkspaceType = type;
    sheetChanges.clear();
    slideTextChanges.clear();
    slideTextOriginals.clear();
    slideStructureRequests = [];
    activeSheetSelectedCell = null;
    activeSlidePage = null;
    document.dispatchEvent(new CustomEvent("simplyBlocksWorkspaceContentLoaded", {
        detail: { name: file.name, mode, type, content, editable, driveFile: file }
    }));
}

function styledTextRun(run) {
    const span = document.createElement("span");
    const style = run.textStyle || {};
    span.textContent = (run.content || "").replace(/\n$/, "");
    if (style.bold) span.style.fontWeight = "700";
    if (style.italic) span.style.fontStyle = "italic";
    if (style.underline) span.style.textDecoration = "underline";
    if (style.strikethrough) span.style.textDecoration = "line-through";
    if (style.fontSize?.magnitude) span.style.fontSize = `${style.fontSize.magnitude}pt`;
    if (style.weightedFontFamily?.fontFamily) span.style.fontFamily = style.weightedFontFamily.fontFamily;
    if (style.foregroundColor?.color?.rgbColor) {
        const color = style.foregroundColor.color.rgbColor;
        span.style.color = `rgb(${Math.round((color.red || 0) * 255)}, ${Math.round((color.green || 0) * 255)}, ${Math.round((color.blue || 0) * 255)})`;
    }
    return span;
}

function createDocumentImage(objectId, objectCollection) {
    const object = objectCollection?.[objectId];
    const properties = object?.inlineObjectProperties?.embeddedObject || object?.positionedObjectProperties?.embeddedObject;
    const imageProperties = properties?.imageProperties;
    if (!imageProperties?.contentUri) return null;
    const image = document.createElement("img");
    image.className = "google-doc-image";
    image.src = imageProperties.contentUri;
    image.alt = imageProperties.sourceUri ? "Document Image" : "Embedded Document Image";
    image.dataset.googleObjectId = objectId;
    image.dataset.docInlineObject = String(objectCollection === activeDocumentInlineObjects);
    const dimensionToPixels = (dimension) => {
        if (!dimension?.magnitude) return null;
        const conversions = {
            PT: 96 / 72,
            IN: 96,
            CM: 96 / 2.54,
            MM: 96 / 25.4,
            PX: 1,
            EMU: 1 / 9525
        };
        return dimension.magnitude * (conversions[dimension.unit] || 1);
    };
    const width = dimensionToPixels(properties?.size?.width);
    const height = dimensionToPixels(properties?.size?.height);
    if (width) {
        image.style.width = `${width}px`;
    }
    if (height) {
        image.style.height = `${height}px`;
    }
    return image;
}

function renderParagraph(paragraph, startIndex = null, endIndex = null) {
    const namedStyle = paragraph.paragraphStyle?.namedStyleType || "NORMAL_TEXT";
    const tags = { TITLE: "h1", HEADING_1: "h1", HEADING_2: "h2", HEADING_3: "h3" };
    const element = document.createElement(tags[namedStyle] || "p");
    let explicitBreak = false;
    let originalText = "";
    (paragraph.elements || []).forEach((item) => {
        if (item.textRun) element.append(styledTextRun(item.textRun));
        if (item.textRun) originalText += (item.textRun.content || "").replace(/\n$/, "");
        if (item.pageBreak) explicitBreak = true;
        if (item.inlineObjectElement) {
            originalText += "\uFFFC";
            const image = createDocumentImage(
                item.inlineObjectElement.inlineObjectId,
                activeDocumentInlineObjects
            );
            if (image) element.append(image);
        }
    });
    (paragraph.positionedObjectIds || []).forEach((objectId) => {
        const image = createDocumentImage(objectId, activeDocumentPositionedObjects);
        if (image) element.append(image);
    });
    if (startIndex != null && endIndex != null) {
        element.dataset.docStartIndex = startIndex;
        element.dataset.docEndIndex = endIndex;
        element._simplyBlocksOriginalText = originalText;
    }
    if (!element.childNodes.length) element.append(document.createElement("br"));
    return { element, explicitBreak };
}

function renderTable(table) {
    const element = document.createElement("table");
    (table.tableRows || []).forEach((row) => {
        const tr = document.createElement("tr");
        (row.tableCells || []).forEach((cell) => {
            const td = document.createElement("td");
            (cell.content || []).forEach((item) => {
                if (item.paragraph) {
                    td.append(renderParagraph(item.paragraph, item.startIndex, item.endIndex).element);
                }
            });
            tr.append(td);
        });
        element.append(tr);
    });
    return element;
}

async function loadDocument(file, token) {
    const response = await googleFetch(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(file.id)}`, token);
    const data = await response.json();
    activeGoogleDocument = data;
    activeDocumentInlineObjects = data.inlineObjects || {};
    activeDocumentPositionedObjects = data.positionedObjects || {};
    const pages = document.createElement("div");
    pages.className = "google-doc-pages";
    let page = document.createElement("section");
    page.className = "google-doc-page";
    let pageWeight = 0;
    pages.append(page);

    (data.body?.content || []).forEach((item) => {
        let node = null;
        let explicitBreak = false;
        if (item.paragraph) {
            ({ element: node, explicitBreak } = renderParagraph(
                item.paragraph,
                item.startIndex,
                item.endIndex
            ));
        }
        if (item.table) node = renderTable(item.table);
        if (!node) return;
        const weight = (node.textContent?.length || 0) + (node.matches?.("h1,h2,h3") ? 180 : 30);
        if ((explicitBreak || pageWeight + weight > 1700) && page.childNodes.length) {
            page = document.createElement("section");
            page.className = "google-doc-page";
            pages.append(page);
            pageWeight = 0;
        }
        page.append(node);
        pageWeight += weight;
    });
    emitLoaded(file, "google-doc-mode", "google-doc", pages, true);
}

function columnName(index) {
    let name = "";
    for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
        name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
    }
    return name;
}

async function loadSheet(file, token) {
    const response = await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(file.id)}?includeGridData=true`, token);
    const data = await response.json();
    activeSpreadsheet = data;
    const shell = document.createElement("div");
    const navigation = document.createElement("div");
    const viewport = document.createElement("div");
    shell.className = "google-sheet-shell";
    navigation.className = "sheet-navigation";
    viewport.className = "sheet-grid-viewport";

    const directionLabel = document.createElement("button");
    const formulaLabel = document.createElement("label");
    const formulaInput = document.createElement("input");
    formulaLabel.className = "sheet-formula-field";
    formulaLabel.append(document.createTextNode("fx"), formulaInput);
    formulaInput.type = "text";
    formulaInput.placeholder = "Select A Cell Or Enter A Formula";
    formulaInput.setAttribute("aria-label", "Selected Cell Formula Or Value");
    directionLabel.type = "button";
    directionLabel.textContent = "Scroll Direction: Vertical";
    let horizontal = false;
    directionLabel.addEventListener("click", () => {
        horizontal = !horizontal;
        directionLabel.textContent = `Scroll Direction: ${horizontal ? "Horizontal" : "Vertical"}`;
        directionLabel.classList.toggle("active", horizontal);
        viewport.focus();
    });
    viewport.tabIndex = 0;
    viewport.addEventListener("wheel", (event) => {
        if (!horizontal) return;
        event.preventDefault();
        viewport.scrollLeft += event.deltaY || event.deltaX;
    }, { passive: false });
    formulaInput.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || !activeSheetSelectedCell) return;
        event.preventDefault();
        activeSheetSelectedCell.textContent = formulaInput.value;
        activeSheetSelectedCell.dispatchEvent(new Event("input", { bubbles: true }));
        activeSheetSelectedCell.focus();
    });
    formulaInput.addEventListener("change", () => {
        if (!activeSheetSelectedCell) return;
        activeSheetSelectedCell.textContent = formulaInput.value;
        activeSheetSelectedCell.dispatchEvent(new Event("input", { bubbles: true }));
    });
    navigation.append(directionLabel, formulaLabel);
    ["SUM", "AVERAGE", "MIN", "MAX", "COUNT", "IF"].forEach((functionName) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "sheet-function-button";
        button.textContent = functionName;
        button.addEventListener("click", () => {
            if (!activeSheetSelectedCell) return;
            formulaInput.value = `=${functionName}()`;
            formulaInput.focus();
            formulaInput.setSelectionRange(formulaInput.value.length - 1, formulaInput.value.length - 1);
        });
        navigation.append(button);
    });

    const runSheetStructureRequest = async (requests) => {
        if (sheetChanges.size) {
            throw new Error("Save Your Cell Changes Before Changing The Sheet Structure.");
        }
        await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(file.id)}:batchUpdate`, token, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requests })
        });
        await loadSheet(file, token);
    };
    const makeSheetAction = (label, action) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "sheet-structure-button";
        button.textContent = label;
        button.addEventListener("click", async () => {
            button.disabled = true;
            try {
                await action();
            } catch (error) {
                console.error(`Sheet action failed: ${label}`, error);
                window.alert(error?.message || `${label} Could Not Be Completed.`);
            } finally {
                button.disabled = false;
            }
        });
        navigation.append(button);
    };
    makeSheetAction("Clear Cell", async () => {
        if (!activeSheetSelectedCell) throw new Error("Select A Cell First.");
        activeSheetSelectedCell.textContent = "";
        activeSheetSelectedCell.dispatchEvent(new Event("input", { bubbles: true }));
    });
    makeSheetAction("Add Row", () => {
        const sheetId = Number(navigation.querySelector("[data-sheet-id].active")?.dataset.sheetId);
        if (!Number.isFinite(sheetId)) throw new Error("Select A Sheet First.");
        return runSheetStructureRequest([{ appendDimension: { sheetId, dimension: "ROWS", length: 1 } }]);
    });
    makeSheetAction("Add Column", () => {
        const sheetId = Number(navigation.querySelector("[data-sheet-id].active")?.dataset.sheetId);
        if (!Number.isFinite(sheetId)) throw new Error("Select A Sheet First.");
        return runSheetStructureRequest([{ appendDimension: { sheetId, dimension: "COLUMNS", length: 1 } }]);
    });
    makeSheetAction("New Sheet", () => runSheetStructureRequest([{ addSheet: {} }]));
    makeSheetAction("Duplicate Sheet", () => {
        const sourceSheetId = Number(navigation.querySelector("[data-sheet-id].active")?.dataset.sheetId);
        if (!Number.isFinite(sourceSheetId)) throw new Error("Select A Sheet First.");
        return runSheetStructureRequest([{ duplicateSheet: { sourceSheetId } }]);
    });

    const renderTab = (sheet, tabButton) => {
        navigation.querySelectorAll("[data-sheet-id]").forEach((button) => button.classList.toggle("active", button === tabButton));
        viewport.replaceChildren();
        const rows = sheet.data?.[0]?.rowData || [];
        const configuredRows = sheet.properties?.gridProperties?.rowCount || 100;
        const configuredColumns = sheet.properties?.gridProperties?.columnCount || 26;
        const rowCount = Math.min(Math.max(rows.length + 20, 50), configuredRows, 300);
        const columnCount = Math.min(Math.max(...rows.map((row) => row.values?.length || 0), 10) + 5, configuredColumns, 80);
        const table = document.createElement("table");
        table.className = "sheet-grid";
        const head = document.createElement("thead");
        const headerRow = document.createElement("tr");
        const corner = document.createElement("th");
        corner.className = "sheet-row-number";
        headerRow.append(corner);
        for (let column = 0; column < columnCount; column += 1) {
            const th = document.createElement("th");
            th.textContent = columnName(column);
            headerRow.append(th);
        }
        head.append(headerRow);
        table.append(head);
        const body = document.createElement("tbody");
        for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
            const tr = document.createElement("tr");
            const number = document.createElement("th");
            number.className = "sheet-row-number";
            number.textContent = rowIndex + 1;
            tr.append(number);
            for (let column = 0; column < columnCount; column += 1) {
                const td = document.createElement("td");
                td.contentEditable = "true";
                td.dataset.row = rowIndex;
                td.dataset.column = column;
                td.dataset.sheetTitle = sheet.properties.title;
                const cell = `${columnName(column)}${rowIndex + 1}`;
                const sheetTitle = sheet.properties.title.replace(/'/g, "''");
                const changeKey = `'${sheetTitle}'!${cell}`;
                const enteredValue = rows[rowIndex]?.values?.[column]?.userEnteredValue;
                const rawValue = enteredValue?.formulaValue ??
                    enteredValue?.stringValue ??
                    enteredValue?.numberValue ??
                    enteredValue?.boolValue ?? "";
                td.textContent = sheetChanges.has(changeKey)
                    ? sheetChanges.get(changeKey)
                    : rows[rowIndex]?.values?.[column]?.formattedValue || "";
                td.dataset.rawValue = String(sheetChanges.has(changeKey) ? sheetChanges.get(changeKey) : rawValue);
                td.addEventListener("focus", () => {
                    activeSheetSelectedCell?.classList.remove("selected-cell");
                    activeSheetSelectedCell = td;
                    activeSheetSelectedCell.classList.add("selected-cell");
                    formulaInput.value = td.dataset.rawValue;
                    formulaInput.placeholder = `${sheet.properties.title}!${cell}`;
                });
                td.addEventListener("input", () => {
                    sheetChanges.set(changeKey, td.textContent);
                    td.dataset.rawValue = td.textContent;
                    if (activeSheetSelectedCell === td) formulaInput.value = td.textContent;
                });
                tr.append(td);
            }
            body.append(tr);
        }
        table.append(body);
        viewport.append(table);
    };

    (data.sheets || []).forEach((sheet, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.sheetId = sheet.properties.sheetId;
        button.textContent = sheet.properties.title;
        button.addEventListener("click", () => renderTab(sheet, button));
        navigation.append(button);
        if (index === 0) queueMicrotask(() => renderTab(sheet, button));
    });
    shell.append(navigation, viewport);
    emitLoaded(file, "google-sheet-mode", "google-sheet", shell, false);
}

async function loadSlides(file, token) {
    const response = await googleFetch(`https://slides.googleapis.com/v1/presentations/${encodeURIComponent(file.id)}`, token);
    const data = await response.json();
    activePresentation = data;
    const shell = document.createElement("div");
    const controls = document.createElement("div");
    const pages = document.createElement("div");
    shell.className = "google-slides-shell";
    controls.className = "slide-navigation";
    pages.className = "google-slide-pages";
    let selectedPage = null;

    const selectPage = (page) => {
        pages.querySelectorAll(".google-slide-page").forEach((candidate) => candidate.classList.toggle("selected", candidate === page));
        selectedPage = page;
        activeSlidePage = page;
    };

    const addButton = document.createElement("button");
    const deleteButton = document.createElement("button");
    const duplicateButton = document.createElement("button");
    const moveEarlierButton = document.createElement("button");
    const moveLaterButton = document.createElement("button");
    addButton.type = "button";
    deleteButton.type = "button";
    duplicateButton.type = "button";
    moveEarlierButton.type = "button";
    moveLaterButton.type = "button";
    addButton.textContent = "Add Slide";
    deleteButton.textContent = "Delete Selected Slide";
    duplicateButton.textContent = "Duplicate Slide";
    moveEarlierButton.textContent = "Move Earlier";
    moveLaterButton.textContent = "Move Later";
    controls.append(
        addButton,
        deleteButton,
        duplicateButton,
        moveEarlierButton,
        moveLaterButton
    );

    const runImmediateSlideRequest = async (requests) => {
        if (slideTextChanges.size) {
            throw new Error("Save Your Slide Text Changes Before Reordering Or Changing Slides.");
        }
        await googleFetch(`https://slides.googleapis.com/v1/presentations/${encodeURIComponent(file.id)}:batchUpdate`, token, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                requests,
                ...(activePresentation?.revisionId
                    ? { writeControl: { requiredRevisionId: activePresentation.revisionId } }
                    : {})
            })
        });
        await loadSlides(file, token);
    };

    duplicateButton.addEventListener("click", async () => {
        if (!selectedPage?.dataset.objectId) return;
        await runImmediateSlideRequest([{
            duplicateObject: { objectId: selectedPage.dataset.objectId }
        }]).catch((error) => window.alert(error?.message || "The Slide Could Not Be Duplicated."));
    });
    moveEarlierButton.addEventListener("click", async () => {
        if (!selectedPage?.dataset.objectId) return;
        const index = [...pages.children].indexOf(selectedPage);
        if (index <= 0) return;
        await runImmediateSlideRequest([{
            updateSlidesPosition: {
                slideObjectIds: [selectedPage.dataset.objectId],
                insertionIndex: index - 1
            }
        }]).catch((error) => window.alert(error?.message || "The Slide Could Not Be Moved."));
    });
    moveLaterButton.addEventListener("click", async () => {
        if (!selectedPage?.dataset.objectId) return;
        const index = [...pages.children].indexOf(selectedPage);
        if (index < 0 || index >= pages.children.length - 1) return;
        await runImmediateSlideRequest([{
            updateSlidesPosition: {
                slideObjectIds: [selectedPage.dataset.objectId],
                insertionIndex: index + 2
            }
        }]).catch((error) => window.alert(error?.message || "The Slide Could Not Be Moved."));
    });

    addButton.addEventListener("click", async () => {
        const objectId = `sb_slide_${crypto.randomUUID().replace(/-/g, "")}`;
        await runImmediateSlideRequest([{
            createSlide: { objectId, insertionIndex: pages.children.length }
        }]).catch((error) => window.alert(error?.message || "The Slide Could Not Be Added."));
    });

    deleteButton.addEventListener("click", async () => {
        if (!selectedPage || pages.children.length <= 1) return;
        await runImmediateSlideRequest([{
            deleteObject: { objectId: selectedPage.dataset.objectId }
        }]).catch((error) => window.alert(error?.message || "The Slide Could Not Be Deleted."));
    });

    await Promise.all((data.slides || []).map(async (slide, index) => {
        const page = document.createElement("section");
        const image = document.createElement("img");
        const number = document.createElement("span");
        page.className = "google-slide-page";
        page.dataset.objectId = slide.objectId;
        image.alt = `Slide ${index + 1}`;
        number.className = "google-slide-number";
        number.textContent = index + 1;
        const textEditor = document.createElement("div");
        textEditor.className = "slide-text-editor";
        (slide.pageElements || []).forEach((pageElement) => {
            const textElements = pageElement.shape?.text?.textElements || [];
            const text = textElements.map((element) => element.textRun?.content || "").join("").trimEnd();
            if (!text) return;
            const field = document.createElement("div");
            field.className = "slide-text-field";
            field.contentEditable = "true";
            field.textContent = text;
            field.dataset.objectId = pageElement.objectId;
            slideTextOriginals.set(pageElement.objectId, text);
            field.addEventListener("input", () => {
                slideTextChanges.set(pageElement.objectId, field.innerText);
            });
            textEditor.append(field);
        });
        page.append(image, number, textEditor);
        page.addEventListener("click", () => selectPage(page));
        pages.append(page);
        if (index === 0) selectPage(page);
        const thumbnailResponse = await googleFetch(`https://slides.googleapis.com/v1/presentations/${encodeURIComponent(file.id)}/pages/${encodeURIComponent(slide.objectId)}/thumbnail?thumbnailProperties.mimeType=PNG&thumbnailProperties.thumbnailSize=LARGE`, token);
        const thumbnail = await thumbnailResponse.json();
        image.src = thumbnail.contentUrl;
    }));
    shell.append(controls, pages);
    emitLoaded(file, "google-slides-mode", "google-slides", shell, false);
    if (pages.firstElementChild) selectPage(pages.firstElementChild);
}

async function loadPdf(file, token) {
    const response = await googleFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`, token);
    activePdfBytes = new Uint8Array(await response.arrayBuffer());
    pdfAnnotations = [];
    await renderPdfEditor(file);
}

function drawPdfAnnotations(canvas, pageIndex) {
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    pdfAnnotations.filter((annotation) => annotation.pageIndex === pageIndex).forEach((annotation) => {
        context.save();
        context.strokeStyle = annotation.color || "#7c3aed";
        context.fillStyle = annotation.color || "#7c3aed";
        context.lineWidth = Math.max(2, canvas.width * 0.003);
        if (annotation.type === "text") {
            const size = Math.max(8, Number(annotation.fontSize) || 14) * (canvas.width / 612);
            context.font = `${annotation.italic ? "italic " : ""}${annotation.bold ? "bold " : ""}${size}px ${annotation.fontFamily || "Arial"}`;
            context.textAlign = annotation.align || "left";
            context.fillText(annotation.text, annotation.x * canvas.width, annotation.y * canvas.height);
            if (annotation.underline) {
                const measured = context.measureText(annotation.text).width;
                const offset = annotation.align === "center" ? measured / 2 : annotation.align === "right" ? measured : 0;
                context.fillRect(annotation.x * canvas.width - offset, annotation.y * canvas.height + 3, measured, Math.max(1, size / 14));
            }
        } else if (annotation.type === "highlight") {
            context.globalAlpha = 0.32;
            context.fillStyle = annotation.color || "#fde047";
            context.fillRect(annotation.x * canvas.width, annotation.y * canvas.height, annotation.width * canvas.width, annotation.height * canvas.height);
        } else if (annotation.type === "rectangle") {
            context.strokeRect(annotation.x * canvas.width, annotation.y * canvas.height, annotation.width * canvas.width, annotation.height * canvas.height);
        } else if (annotation.type === "draw") {
            context.beginPath();
            annotation.points.forEach((point, index) => {
                const x = point.x * canvas.width;
                const y = point.y * canvas.height;
                if (index === 0) context.moveTo(x, y);
                else context.lineTo(x, y);
            });
            context.stroke();
        } else if (annotation.type === "image" && annotation.preview) {
            const image = new Image();
            image.onload = () => context.drawImage(image, annotation.x * canvas.width, annotation.y * canvas.height, annotation.width * canvas.width, annotation.height * canvas.height);
            image.src = annotation.preview;
        }
        context.restore();
    });
}

function connectPdfAnnotationCanvas(canvas, pageIndex, controls) {
    let activeAnnotation = null;
    const markChanged = () => {
        document.querySelector("#documentPage")?.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const pointFromEvent = (event) => {
        const bounds = canvas.getBoundingClientRect();
        return {
            x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
            y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height))
        };
    };
    canvas.addEventListener("pointerdown", (event) => {
        const point = pointFromEvent(event);
        const color = controls.color.value;
        if (pdfTool === "text") {
            const text = controls.text.value.trim();
            if (!text) return;
            pdfAnnotations.push({
                type: "text", pageIndex, ...point, text, color,
                fontSize: Number(controls.fontSize.value) || 14,
                fontFamily: controls.fontFamily.value,
                bold: controls.bold.classList.contains("active"),
                italic: controls.italic.classList.contains("active"),
                underline: controls.underline.classList.contains("active"),
                align: controls.align.value,
                url: controls.link.value.trim()
            });
            drawPdfAnnotations(canvas, pageIndex);
            markChanged();
            return;
        }
        if (pdfTool === "image") {
            if (!pendingPdfImage) return;
            pdfAnnotations.push({
                type: "image",
                pageIndex,
                ...point,
                width: 0.25,
                height: 0.18,
                preview: pendingPdfImage.preview,
                bytes: pendingPdfImage.bytes,
                mimeType: pendingPdfImage.mimeType
            });
            drawPdfAnnotations(canvas, pageIndex);
            markChanged();
            return;
        }
        activeAnnotation = pdfTool === "draw"
            ? { type: "draw", pageIndex, points: [point], color }
            : { type: pdfTool, pageIndex, ...point, width: 0, height: 0, color };
        pdfAnnotations.push(activeAnnotation);
        canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
        if (!activeAnnotation) return;
        const point = pointFromEvent(event);
        if (activeAnnotation.type === "draw") {
            activeAnnotation.points.push(point);
        } else {
            activeAnnotation.width = point.x - activeAnnotation.x;
            activeAnnotation.height = point.y - activeAnnotation.y;
        }
        drawPdfAnnotations(canvas, pageIndex);
    });
    canvas.addEventListener("pointerup", () => {
        if (activeAnnotation) markChanged();
        activeAnnotation = null;
    });
}

async function renderPdfEditor(file) {
    if (!globalThis.pdfjsLib || !activePdfBytes) {
        throw new Error("The PDF Rendering Engine Could Not Be Loaded.");
    }
    globalThis.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdfjs/pdf.worker.min.js");
    const pdf = await globalThis.pdfjsLib.getDocument({ data: new Uint8Array(activePdfBytes) }).promise;
    const shell = document.createElement("div");
    const toolbar = document.createElement("div");
    const pages = document.createElement("div");
    shell.className = "pdf-editor-shell";
    toolbar.className = "pdf-editor-toolbar";
    pages.className = "pdf-editor-pages";
    const textInput = document.createElement("input");
    const colorInput = document.createElement("input");
    textInput.type = "text";
    textInput.placeholder = "Annotation Text";
    colorInput.type = "color";
    colorInput.value = "#7c3aed";
    const fontSize = document.createElement("input");
    fontSize.type = "number";
    fontSize.min = "8";
    fontSize.max = "96";
    fontSize.value = "14";
    fontSize.title = "Font Size";
    const fontFamily = document.createElement("select");
    ["Arial", "Times New Roman", "Courier New"].forEach((name) => fontFamily.add(new Option(name, name)));
    fontFamily.title = "Font Family";
    const align = document.createElement("select");
    [["Left", "left"], ["Center", "center"], ["Right", "right"]].forEach(([label, value]) => align.add(new Option(label, value)));
    align.title = "Text Alignment";
    const linkInput = document.createElement("input");
    linkInput.type = "url";
    linkInput.placeholder = "Optional Link URL";
    const toggle = (label, title) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.title = title;
        button.addEventListener("click", () => button.classList.toggle("active"));
        return button;
    };
    const bold = toggle("B", "Bold");
    const italic = toggle("I", "Italic");
    const underline = toggle("U", "Underline");
    const controls = { text: textInput, color: colorInput, fontSize, fontFamily, align, link: linkInput, bold, italic, underline };
    [
        ["text", "Text"],
        ["highlight", "Highlight"],
        ["draw", "Draw"],
        ["rectangle", "Rectangle"]
    ].forEach(([tool, label]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.classList.toggle("active", pdfTool === tool);
        button.addEventListener("click", () => {
            pdfTool = tool;
            toolbar.querySelectorAll("[data-pdf-tool]").forEach((candidate) => candidate.classList.toggle("active", candidate === button));
        });
        button.dataset.pdfTool = tool;
        toolbar.append(button);
    });
    const imageLabel = document.createElement("label");
    const imageInput = document.createElement("input");
    imageLabel.className = "pdf-image-label";
    imageLabel.textContent = "Image";
    imageInput.type = "file";
    imageInput.accept = "image/png,image/jpeg";
    imageInput.hidden = true;
    imageLabel.append(imageInput);
    imageInput.addEventListener("change", async () => {
        const [imageFile] = imageInput.files;
        if (!imageFile) return;
        pendingPdfImage = await makePdfImageAsset(imageFile);
        pdfTool = "image";
        toolbar.querySelectorAll("[data-pdf-tool]").forEach((candidate) => candidate.classList.remove("active"));
    });
    const undoButton = document.createElement("button");
    undoButton.type = "button";
    undoButton.textContent = "Undo Annotation";
    undoButton.addEventListener("click", () => {
        pdfAnnotations.pop();
        pages.querySelectorAll(".pdf-page-annotations").forEach((canvas, index) => drawPdfAnnotations(canvas, index));
        document.querySelector("#documentPage")?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const zoomOut = document.createElement("button");
    const zoomIn = document.createElement("button");
    zoomOut.type = zoomIn.type = "button";
    zoomOut.textContent = "Zoom Out";
    zoomIn.textContent = "Zoom In";
    zoomOut.addEventListener("click", async () => {
        pdfZoom = Math.max(0.6, pdfZoom - 0.15);
        await renderPdfEditor(file);
    });
    zoomIn.addEventListener("click", async () => {
        pdfZoom = Math.min(2.5, pdfZoom + 0.15);
        await renderPdfEditor(file);
    });
    const emojiGroup = document.createElement("span");
    emojiGroup.className = "pdf-emoji-group";
    ["😀", "❤️", "⭐", "✅", "🚀"].forEach((emoji) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = emoji;
        button.title = `Insert ${emoji}`;
        button.addEventListener("click", async () => {
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 160;
            const context = canvas.getContext("2d");
            context.font = "112px 'Segoe UI Emoji', sans-serif";
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText(emoji, 80, 84);
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
            pendingPdfImage = await makePdfImageAsset(blob);
            pdfTool = "image";
            toolbar.querySelectorAll("[data-pdf-tool]").forEach((candidate) => candidate.classList.remove("active"));
        });
        emojiGroup.append(button);
    });
    toolbar.append(textInput, fontFamily, fontSize, bold, italic, underline, align, colorInput, linkInput, emojiGroup, imageLabel, undoButton, zoomOut, zoomIn);

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: pdfZoom });
        const wrapper = document.createElement("section");
        const renderCanvas = document.createElement("canvas");
        const annotationCanvas = document.createElement("canvas");
        const number = document.createElement("span");
        wrapper.className = "pdf-page-editor";
        renderCanvas.width = annotationCanvas.width = Math.floor(viewport.width);
        renderCanvas.height = annotationCanvas.height = Math.floor(viewport.height);
        annotationCanvas.className = "pdf-page-annotations";
        number.className = "pdf-page-number";
        number.textContent = pageNumber;
        wrapper.append(renderCanvas, annotationCanvas, number);
        pages.append(wrapper);
        await page.render({ canvasContext: renderCanvas.getContext("2d"), viewport }).promise;
        drawPdfAnnotations(annotationCanvas, pageNumber - 1);
        connectPdfAnnotationCanvas(annotationCanvas, pageNumber - 1, controls);
    }
    shell.append(toolbar, pages);
    emitLoaded(file, "google-pdf-mode", "google-pdf", shell, false);
}

async function savePdfToDrive() {
    if (!globalThis.PDFLib || !activePdfBytes) throw new Error("The PDF Writing Engine Could Not Be Loaded.");
    const token = await getGoogleToken(true);
    if (!pdfAnnotations.length) {
        await updateDriveTitle(token);
        return;
    }
    const pdfDocument = await globalThis.PDFLib.PDFDocument.load(activePdfBytes);
    const fonts = new Map();
    const getFont = async (annotation) => {
        const family = annotation.fontFamily || "Arial";
        let name = family === "Times New Roman" ? "TimesRoman" : family === "Courier New" ? "Courier" : "Helvetica";
        if (annotation.bold && annotation.italic) name += family === "Times New Roman" ? "BoldItalic" : "BoldOblique";
        else if (annotation.bold) name += "Bold";
        else if (annotation.italic) name += family === "Times New Roman" ? "Italic" : "Oblique";
        if (!fonts.has(name)) fonts.set(name, await pdfDocument.embedFont(globalThis.PDFLib.StandardFonts[name]));
        return fonts.get(name);
    };
    const pages = pdfDocument.getPages();
    const rgbFromHex = (hex) => globalThis.PDFLib.rgb(
        parseInt(hex.slice(1, 3), 16) / 255,
        parseInt(hex.slice(3, 5), 16) / 255,
        parseInt(hex.slice(5, 7), 16) / 255
    );
    for (const annotation of pdfAnnotations) {
        const page = pages[annotation.pageIndex];
        if (!page) continue;
        const { width, height } = page.getSize();
        const color = rgbFromHex(annotation.color || "#7c3aed");
        if (annotation.type === "text") {
            const font = await getFont(annotation);
            const size = Number(annotation.fontSize) || 14;
            const textWidth = font.widthOfTextAtSize(annotation.text, size);
            let x = annotation.x * width;
            if (annotation.align === "center") x -= textWidth / 2;
            if (annotation.align === "right") x -= textWidth;
            const y = height - annotation.y * height - size;
            page.drawText(annotation.text, { x, y, size, font, color });
            if (annotation.underline) page.drawLine({ start: { x, y: y - 2 }, end: { x: x + textWidth, y: y - 2 }, thickness: Math.max(0.7, size / 16), color });
            if (annotation.url) {
                let url = annotation.url;
                if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
                const link = pdfDocument.context.obj({ Type: "Annot", Subtype: "Link", Rect: [x, y - 2, x + textWidth, y + size], Border: [0, 0, 0], A: { Type: "Action", S: "URI", URI: globalThis.PDFLib.PDFString.of(url) } });
                const linkRef = pdfDocument.context.register(link);
                page.node.addAnnot(linkRef);
            }
        } else if (annotation.type === "highlight" || annotation.type === "rectangle") {
            const x = Math.min(annotation.x, annotation.x + annotation.width) * width;
            const top = Math.min(annotation.y, annotation.y + annotation.height);
            const boxWidth = Math.abs(annotation.width) * width;
            const boxHeight = Math.abs(annotation.height) * height;
            page.drawRectangle({
                x,
                y: height - top * height - boxHeight,
                width: boxWidth,
                height: boxHeight,
                ...(annotation.type === "highlight"
                    ? { color, opacity: 0.3 }
                    : { borderColor: color, borderWidth: 2 })
            });
        } else if (annotation.type === "draw") {
            for (let index = 1; index < annotation.points.length; index += 1) {
                const start = annotation.points[index - 1];
                const end = annotation.points[index];
                page.drawLine({
                    start: { x: start.x * width, y: height - start.y * height },
                    end: { x: end.x * width, y: height - end.y * height },
                    thickness: 2,
                    color
                });
            }
        } else if (annotation.type === "image") {
            const embedded = annotation.mimeType === "image/png"
                ? await pdfDocument.embedPng(annotation.bytes)
                : await pdfDocument.embedJpg(annotation.bytes);
            page.drawImage(embedded, {
                x: annotation.x * width,
                y: height - annotation.y * height - annotation.height * height,
                width: annotation.width * width,
                height: annotation.height * height
            });
        }
    }
    const savedBytes = await pdfDocument.save();
    await googleFetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(activeWorkspaceFile.id)}?uploadType=media`, token, {
        method: "PATCH",
        headers: { "Content-Type": "application/pdf" },
        body: savedBytes
    });
    activePdfBytes = new Uint8Array(savedBytes);
    pdfAnnotations = [];
    await updateDriveTitle(token);
    await renderPdfEditor(activeWorkspaceFile);
}

async function loadGenericFile(file, token) {
    if (file.mimeType?.startsWith("application/vnd.google-apps.")) {
        const notice = document.createElement("section");
        notice.className = "drive-generic-notice";
        const heading = document.createElement("h2");
        const description = document.createElement("p");
        heading.textContent = file.name;
        description.textContent = "This Google Workspace File Type Can Be Selected And Managed, But It Does Not Have A Native Simply Blocks Editor Yet.";
        notice.append(heading, description);
        emitLoaded(file, "drive-generic-mode", "drive-preview", notice, false);
        return;
    }

    const response = await googleFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`, token);
    const blob = await response.blob();
    const shell = document.createElement("div");
    shell.className = "drive-generic-viewer";

    if (file.mimeType?.startsWith("text/") || /\.(md|markdown|csv|json|xml|css|js)$/i.test(file.name)) {
        const editor = document.createElement("pre");
        editor.className = "drive-text-editor";
        editor.contentEditable = "true";
        editor.textContent = await blob.text();
        shell.append(editor);
        emitLoaded(file, "drive-generic-mode", "drive-text", shell, false);
        return;
    }

    if (activeGenericUrl) URL.revokeObjectURL(activeGenericUrl);
    activeGenericUrl = URL.createObjectURL(blob);
    let viewer;
    if (file.mimeType?.startsWith("image/")) {
        viewer = document.createElement("img");
        viewer.alt = file.name;
    } else if (file.mimeType?.startsWith("audio/")) {
        viewer = document.createElement("audio");
        viewer.controls = true;
    } else if (file.mimeType?.startsWith("video/")) {
        viewer = document.createElement("video");
        viewer.controls = true;
    } else {
        viewer = document.createElement("iframe");
        viewer.title = file.name;
    }
    viewer.className = "drive-binary-viewer";
    viewer.src = activeGenericUrl;
    shell.append(viewer);
    emitLoaded(file, "drive-generic-mode", "drive-preview", shell, false);
}

async function updateDriveTitle(token) {
    const title = document.querySelector("#documentTitle")?.value.trim();
    if (!title || title === activeWorkspaceFile.name) return;
    await googleFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(activeWorkspaceFile.id)}`, token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: title })
    });
    activeWorkspaceFile.name = title;
}

async function saveGoogleDocument(token) {
    const extractParagraphText = (element) => {
        const readNode = (node) => {
            if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
            if (node.nodeType !== Node.ELEMENT_NODE) return "";
            if (node.matches("img[data-doc-inline-object='true']")) return "\uFFFC";
            if (node.tagName === "BR") return "\n";
            return [...node.childNodes].map(readNode).join("");
        };
        return [...element.childNodes].map(readNode).join("").replace(/\n+$/, "");
    };
    const requests = [];
    const changedParagraphs = [...document.querySelectorAll("[data-doc-start-index]")]
        .map((element) => ({
            element,
            startIndex: Number(element.dataset.docStartIndex),
            endIndex: Number(element.dataset.docEndIndex),
            originalText: element._simplyBlocksOriginalText || "",
            currentText: extractParagraphText(element)
        }))
        .filter((paragraph) => paragraph.originalText !== paragraph.currentText)
        .sort((first, second) => second.startIndex - first.startIndex);

    changedParagraphs.forEach(({ startIndex, endIndex, originalText, currentText }) => {
        let prefixLength = 0;
        const sharedLength = Math.min(originalText.length, currentText.length);
        while (
            prefixLength < sharedLength &&
            originalText[prefixLength] === currentText[prefixLength]
        ) {
            prefixLength += 1;
        }

        let suffixLength = 0;
        while (
            suffixLength < originalText.length - prefixLength &&
            suffixLength < currentText.length - prefixLength &&
            originalText[originalText.length - 1 - suffixLength] ===
                currentText[currentText.length - 1 - suffixLength]
        ) {
            suffixLength += 1;
        }

        const segmentContentEnd = Math.max(startIndex, endIndex - 1);
        const editIndex = Math.min(startIndex + prefixLength, segmentContentEnd);
        const originalEnd = Math.min(
            startIndex + originalText.length - suffixLength,
            segmentContentEnd
        );
        const insertedText = currentText.slice(
            prefixLength,
            currentText.length - suffixLength
        );
        if (originalEnd > editIndex) {
            requests.push({
                deleteContentRange: {
                    range: { startIndex: editIndex, endIndex: originalEnd }
                }
            });
        }
        if (insertedText) {
            requests.push({
                insertText: {
                    location: { index: editIndex },
                    text: insertedText
                }
            });
        }
    });
    if (requests.length) {
        await googleFetch(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(activeWorkspaceFile.id)}:batchUpdate`, token, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                requests,
                ...(activeGoogleDocument?.revisionId
                    ? { writeControl: { requiredRevisionId: activeGoogleDocument.revisionId } }
                    : {})
            })
        });
    }
    const desiredTitle = document.querySelector("#documentTitle")?.value || activeWorkspaceFile.name;
    await loadDocument(activeWorkspaceFile, token);
    document.querySelector("#documentTitle").value = desiredTitle;
}

async function saveGoogleSheet(token) {
    if (!sheetChanges.size) return;
    const data = [...sheetChanges].map(([range, value]) => ({
        range,
        majorDimension: "ROWS",
        values: [[value]]
    }));
    await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(activeWorkspaceFile.id)}/values:batchUpdate`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valueInputOption: "USER_ENTERED", data })
    });
    sheetChanges.clear();
    const desiredTitle = document.querySelector("#documentTitle")?.value || activeWorkspaceFile.name;
    await loadSheet(activeWorkspaceFile, token);
    document.querySelector("#documentTitle").value = desiredTitle;
}

async function saveGoogleSlides(token) {
    if (!slideTextChanges.size && !slideStructureRequests.length) return;
    const requests = [...slideStructureRequests];
    slideTextChanges.forEach((text, objectId) => {
        const originalText = slideTextOriginals.get(objectId) || "";
        let prefixLength = 0;
        const sharedLength = Math.min(originalText.length, text.length);
        while (
            prefixLength < sharedLength &&
            originalText[prefixLength] === text[prefixLength]
        ) {
            prefixLength += 1;
        }

        let suffixLength = 0;
        while (
            suffixLength < originalText.length - prefixLength &&
            suffixLength < text.length - prefixLength &&
            originalText[originalText.length - 1 - suffixLength] ===
                text[text.length - 1 - suffixLength]
        ) {
            suffixLength += 1;
        }

        const originalEnd = originalText.length - suffixLength;
        const insertedText = text.slice(prefixLength, text.length - suffixLength);
        if (originalEnd > prefixLength) {
            requests.push({
                deleteText: {
                    objectId,
                    textRange: {
                        type: "FIXED_RANGE",
                        startIndex: prefixLength,
                        endIndex: originalEnd
                    }
                }
            });
        }
        if (insertedText) {
            requests.push({
                insertText: {
                    objectId,
                    insertionIndex: prefixLength,
                    text: insertedText
                }
            });
        }
    });
    const response = await googleFetch(`https://slides.googleapis.com/v1/presentations/${encodeURIComponent(activeWorkspaceFile.id)}:batchUpdate`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            requests,
            ...(activePresentation?.revisionId
                ? { writeControl: { requiredRevisionId: activePresentation.revisionId } }
                : {})
        })
    });
    const result = await response.json();
    if (result.writeControl?.requiredRevisionId && activePresentation) {
        activePresentation.revisionId = result.writeControl.requiredRevisionId;
    }
    slideTextChanges.forEach((text, objectId) => {
        slideTextOriginals.set(objectId, text);
    });
    slideTextChanges.clear();
    slideStructureRequests = [];
}

async function saveDriveTextFile(token) {
    const editor = document.querySelector(".drive-text-editor");
    if (!editor) return;
    await googleFetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(activeWorkspaceFile.id)}?uploadType=media`, token, {
        method: "PATCH",
        headers: { "Content-Type": activeWorkspaceFile.mimeType || "text/plain;charset=utf-8" },
        body: editor.innerText
    });
}

function documentTextOffset(fragment) {
    const wrapper = document.createElement("div");
    wrapper.append(fragment);
    return wrapper.textContent.length + wrapper.querySelectorAll("img[data-doc-inline-object='true']").length;
}

async function insertWorkspaceImage(url) {
    const token = await getGoogleToken(true);
    if (activeWorkspaceType === "google-sheet") {
        if (!activeSheetSelectedCell) throw new Error("Select A Sheet Cell Before Inserting An Image.");
        const escapedUrl = url.replace(/"/g, '""');
        activeSheetSelectedCell.textContent = `=IMAGE("${escapedUrl}")`;
        activeSheetSelectedCell.dispatchEvent(new Event("input", { bubbles: true }));
        return;
    }

    if (activeWorkspaceType === "google-doc") {
        const paragraph = lastDocumentSelection?.startContainer
            ? (lastDocumentSelection.startContainer.nodeType === Node.ELEMENT_NODE
                ? lastDocumentSelection.startContainer
                : lastDocumentSelection.startContainer.parentElement
            )?.closest("[data-doc-start-index]")
            : null;
        const fallbackParagraph = [...document.querySelectorAll("[data-doc-start-index]")].at(-1);
        const targetParagraph = paragraph || fallbackParagraph;
        if (!targetParagraph) throw new Error("Select A Position In The Document First.");
        let offset = targetParagraph._simplyBlocksOriginalText?.length || 0;
        if (paragraph && lastDocumentSelection) {
            const before = document.createRange();
            before.selectNodeContents(targetParagraph);
            before.setEnd(lastDocumentSelection.startContainer, lastDocumentSelection.startOffset);
            offset = documentTextOffset(before.cloneContents());
        }
        const index = Math.min(
            Number(targetParagraph.dataset.docStartIndex) + offset,
            Number(targetParagraph.dataset.docEndIndex) - 1
        );
        await googleFetch(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(activeWorkspaceFile.id)}:batchUpdate`, token, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                requests: [{ insertInlineImage: { uri: url, location: { index } } }],
                ...(activeGoogleDocument?.revisionId
                    ? { writeControl: { requiredRevisionId: activeGoogleDocument.revisionId } }
                    : {})
            })
        });
        const desiredTitle = document.querySelector("#documentTitle")?.value || activeWorkspaceFile.name;
        await loadDocument(activeWorkspaceFile, token);
        document.querySelector("#documentTitle").value = desiredTitle;
        return;
    }

    if (activeWorkspaceType === "google-slides") {
        if (!activeSlidePage?.dataset.objectId) throw new Error("Select A Slide Before Inserting An Image.");
        if (slideTextChanges.size) throw new Error("Save Your Slide Text Changes Before Inserting An Image.");
        const objectId = `sb_image_${crypto.randomUUID().replace(/-/g, "")}`;
        await googleFetch(`https://slides.googleapis.com/v1/presentations/${encodeURIComponent(activeWorkspaceFile.id)}:batchUpdate`, token, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                requests: [{
                    createImage: {
                        objectId,
                        url,
                        elementProperties: {
                            pageObjectId: activeSlidePage.dataset.objectId,
                            size: {
                                width: { magnitude: 3000000, unit: "EMU" },
                                height: { magnitude: 2000000, unit: "EMU" }
                            },
                            transform: {
                                scaleX: 1,
                                scaleY: 1,
                                translateX: 1000000,
                                translateY: 1000000,
                                unit: "EMU"
                            }
                        }
                    }
                }],
                ...(activePresentation?.revisionId
                    ? { writeControl: { requiredRevisionId: activePresentation.revisionId } }
                    : {})
            })
        });
        const desiredTitle = document.querySelector("#documentTitle")?.value || activeWorkspaceFile.name;
        await loadSlides(activeWorkspaceFile, token);
        document.querySelector("#documentTitle").value = desiredTitle;
        return;
    }

    throw new Error("Images Can Only Be Inserted Into Google Docs, Sheets, And Slides.");
}

async function insertDocumentPageBreak() {
    if (activeWorkspaceType !== "google-doc") {
        throw new Error("Open A Google Doc Before Inserting A Page Break.");
    }
    const token = await getGoogleToken(true);
    const paragraph = lastDocumentSelection?.startContainer
        ? (lastDocumentSelection.startContainer.nodeType === Node.ELEMENT_NODE
            ? lastDocumentSelection.startContainer
            : lastDocumentSelection.startContainer.parentElement
        )?.closest("[data-doc-start-index]")
        : null;
    const targetParagraph = paragraph || [...document.querySelectorAll("[data-doc-start-index]")].at(-1);
    if (!targetParagraph) throw new Error("Select A Document Position First.");
    let offset = targetParagraph._simplyBlocksOriginalText?.length || 0;
    if (paragraph && lastDocumentSelection) {
        const before = document.createRange();
        before.selectNodeContents(targetParagraph);
        before.setEnd(lastDocumentSelection.startContainer, lastDocumentSelection.startOffset);
        offset = documentTextOffset(before.cloneContents());
    }
    const index = Math.min(
        Number(targetParagraph.dataset.docStartIndex) + offset,
        Number(targetParagraph.dataset.docEndIndex) - 1
    );
    await googleFetch(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(activeWorkspaceFile.id)}:batchUpdate`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            requests: [{ insertPageBreak: { location: { index } } }],
            ...(activeGoogleDocument?.revisionId
                ? { writeControl: { requiredRevisionId: activeGoogleDocument.revisionId } }
                : {})
        })
    });
    await loadDocument(activeWorkspaceFile, token);
}

document.addEventListener("simplyBlocksInsertDocumentPageBreak", () => {
    runSlideAssetAction(insertDocumentPageBreak);
});

async function insertSlideShape(shapeType) {
    if (activeWorkspaceType !== "google-slides" || !activeSlidePage?.dataset.objectId) {
        throw new Error("Open And Select A Google Slide First.");
    }
    if (slideTextChanges.size) throw new Error("Save Your Slide Text Changes Before Inserting A Shape.");
    const token = await getGoogleToken(true);
    const objectId = `sb_shape_${crypto.randomUUID().replace(/-/g, "")}`;
    await googleFetch(`https://slides.googleapis.com/v1/presentations/${encodeURIComponent(activeWorkspaceFile.id)}:batchUpdate`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            requests: [{
                createShape: {
                    objectId,
                    shapeType,
                    elementProperties: {
                        pageObjectId: activeSlidePage.dataset.objectId,
                        size: {
                            width: { magnitude: 2600000, unit: "EMU" },
                            height: { magnitude: 1600000, unit: "EMU" }
                        },
                        transform: {
                            scaleX: 1,
                            scaleY: 1,
                            translateX: 1200000,
                            translateY: 1200000,
                            unit: "EMU"
                        }
                    }
                }
            }],
            ...(activePresentation?.revisionId
                ? { writeControl: { requiredRevisionId: activePresentation.revisionId } }
                : {})
        })
    });
    await loadSlides(activeWorkspaceFile, token);
}

async function insertSlideEmoji(emoji) {
    if (activeWorkspaceType !== "google-slides" || !activeSlidePage?.dataset.objectId) {
        throw new Error("Open And Select A Google Slide First.");
    }
    if (slideTextChanges.size) throw new Error("Save Your Slide Text Changes Before Inserting An Emoji.");
    const token = await getGoogleToken(true);
    const objectId = `sb_emoji_${crypto.randomUUID().replace(/-/g, "")}`;
    await googleFetch(`https://slides.googleapis.com/v1/presentations/${encodeURIComponent(activeWorkspaceFile.id)}:batchUpdate`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            requests: [
                {
                    createShape: {
                        objectId,
                        shapeType: "TEXT_BOX",
                        elementProperties: {
                            pageObjectId: activeSlidePage.dataset.objectId,
                            size: {
                                width: { magnitude: 1500000, unit: "EMU" },
                                height: { magnitude: 1500000, unit: "EMU" }
                            },
                            transform: {
                                scaleX: 1,
                                scaleY: 1,
                                translateX: 1500000,
                                translateY: 1500000,
                                unit: "EMU"
                            }
                        }
                    }
                },
                { insertText: { objectId, insertionIndex: 0, text: emoji } },
                {
                    updateTextStyle: {
                        objectId,
                        textRange: { type: "ALL" },
                        style: { fontSize: { magnitude: 42, unit: "PT" } },
                        fields: "fontSize"
                    }
                }
            ],
            ...(activePresentation?.revisionId
                ? { writeControl: { requiredRevisionId: activePresentation.revisionId } }
                : {})
        })
    });
    await loadSlides(activeWorkspaceFile, token);
}

async function withTemporaryPublicImage(fileId, callback) {
    const token = await getGoogleToken(true);
    const existingResponse = await googleFetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?fields=permissions(id,type,role)`,
        token
    );
    const existingPermissions = await existingResponse.json();
    const existingPublicPermission = existingPermissions.permissions?.find(
        (permission) => permission.type === "anyone" && permission.role === "reader"
    );
    const publicUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
    if (existingPublicPermission) {
        await callback(publicUrl);
        return;
    }
    const permissionResponse = await googleFetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?fields=id`,
        token,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "anyone", role: "reader", allowFileDiscovery: false })
        }
    );
    const permission = await permissionResponse.json();
    try {
        await callback(publicUrl);
    } finally {
        if (permission.id) {
            let revoked = false;
            for (let attempt = 0; attempt < 2 && !revoked; attempt += 1) {
                const response = await fetch(
                    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(permission.id)}`,
                    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
                ).catch(() => null);
                revoked = Boolean(response?.ok);
            }
            if (!revoked) {
                throw new Error("The Image Was Inserted, But Its Temporary Drive Link Permission Could Not Be Revoked. Review The File's Sharing Settings.");
            }
        }
    }
}

async function insertDriveSlideImage(file) {
    if (activeWorkspaceType !== "google-slides") throw new Error("Drive Images Can Be Inserted Into Google Slides Here.");
    await withTemporaryPublicImage(file.id, (url) => insertWorkspaceImage(url));
}

async function insertLocalSlideImage(file) {
    if (activeWorkspaceType !== "google-slides") throw new Error("Device Images Can Be Inserted Into Google Slides Here.");
    const token = await getGoogleToken(true);
    const metadataResponse = await googleFetch("https://www.googleapis.com/drive/v3/files?fields=id", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `Simply Blocks Temporary Image - ${file.name}`, mimeType: file.type })
    });
    const temporaryFile = await metadataResponse.json();
    try {
        await googleFetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(temporaryFile.id)}?uploadType=media`, token, {
            method: "PATCH",
            headers: { "Content-Type": file.type },
            body: file
        });
        await withTemporaryPublicImage(temporaryFile.id, (url) => insertWorkspaceImage(url));
    } finally {
        await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(temporaryFile.id)}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` }
        }).catch(() => null);
    }
}

async function runSlideAssetAction(action) {
    try {
        await action();
    } catch (error) {
        console.error("Slide asset could not be inserted:", error);
        window.alert(error?.message || "The Slide Asset Could Not Be Inserted.");
    }
}

document.addEventListener("simplyBlocksInsertSlideShape", (event) => {
    runSlideAssetAction(() => insertSlideShape(event.detail.shapeType));
});
document.addEventListener("simplyBlocksInsertSlideEmoji", (event) => {
    runSlideAssetAction(() => insertSlideEmoji(event.detail.emoji));
});
document.addEventListener("simplyBlocksDriveImageSelected", (event) => {
    runSlideAssetAction(() => insertDriveSlideImage(event.detail));
});
document.addEventListener("simplyBlocksInsertLocalSlideImage", (event) => {
    runSlideAssetAction(() => insertLocalSlideImage(event.detail.file));
});

document.addEventListener("selectionchange", () => {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (document.querySelector(".google-doc-pages")?.contains(range.startContainer)) {
        lastDocumentSelection = range.cloneRange();
    }
});

document.addEventListener("simplyBlocksInsertWorkspaceImage", async (event) => {
    try {
        if (activeWorkspaceType === "google-pdf") {
            const response = await fetch(event.detail.url);
            if (!response.ok) throw new Error("The Image Link Could Not Be Downloaded.");
            pendingPdfImage = await makePdfImageAsset(await response.blob());
            pdfTool = "image";
            return;
        }
        await insertWorkspaceImage(event.detail.url);
    } catch (error) {
        console.error("Workspace image could not be inserted:", error);
        window.alert(error?.message || "The Image Could Not Be Inserted.");
    }
});

document.addEventListener("simplyBlocksWorkspaceSaveRequested", (event) => {
    if (!activeWorkspaceFile) return;
    event.detail.handled = true;
    if (activeWorkspaceType === "google-pdf") {
        event.detail.successMessage = "PDF Saved To Google Drive";
        event.detail.promise = savePdfToDrive();
        return;
    }
    if (activeWorkspaceType === "drive-preview") {
        event.detail.successMessage = "File Is Currently Preview-Only";
        event.detail.promise = (async () => {
            const token = await getGoogleToken(true);
            await updateDriveTitle(token);
        })();
        return;
    }
    event.detail.promise = (async () => {
        const token = await getGoogleToken(true);
        if (activeWorkspaceType === "google-doc") await saveGoogleDocument(token);
        else if (activeWorkspaceType === "google-sheet") await saveGoogleSheet(token);
        else if (activeWorkspaceType === "google-slides") await saveGoogleSlides(token);
        else if (activeWorkspaceType === "drive-text") await saveDriveTextFile(token);
        await updateDriveTitle(token);
    })();
});

document.addEventListener("simplyBlocksLocalDocumentActivated", () => {
    activeWorkspaceFile = null;
    activeWorkspaceType = "";
    activeGoogleDocument = null;
    activeSpreadsheet = null;
    activePresentation = null;
    activeSheetSelectedCell = null;
    activeSlidePage = null;
    lastDocumentSelection = null;
    sheetChanges.clear();
    slideTextChanges.clear();
    slideTextOriginals.clear();
    slideStructureRequests = [];
});

document.addEventListener("simplyBlocksDriveFileSelected", async (event) => {
    const file = event.detail;
    try {
        const token = await getGoogleToken(true);
        if (file.mimeType === MIME.DOC) await loadDocument(file, token);
        else if (file.mimeType === MIME.SHEET) await loadSheet(file, token);
        else if (file.mimeType === MIME.SLIDES) await loadSlides(file, token);
        else if (file.mimeType === MIME.PDF) await loadPdf(file, token);
        else await loadGenericFile(file, token);
    } catch (error) {
        console.error("The Workspace file could not be rendered:", error);
        window.alert(error?.message || "The Workspace File Could Not Be Loaded.");
    }
});
