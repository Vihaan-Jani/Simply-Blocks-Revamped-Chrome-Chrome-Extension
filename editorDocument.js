import { getGoogleToken } from "./auth.js";

const DOCUMENT_STORAGE_KEY = "simplyBlocksEditorDocument";

const documentTitle = document.getElementById("documentTitle");
const editorApp = document.querySelector(".editor-app");
const editorHeader = document.querySelector(".editor-header");
const editorToolbar = document.querySelector(".editor-toolbar");
const editorFooter = document.querySelector(".editor-footer");
const documentPage = document.getElementById("documentPage");
const saveStatus = document.getElementById("saveStatus");
const documentCount = document.getElementById("documentCount");
const noDocumentState = document.getElementById("noDocumentState");
const importInput = document.getElementById("documentImportInput");
const fontSizeInput = document.getElementById("fontSize");
const fontNameInput = document.getElementById("fontName");
const fontMenu = document.getElementById("fontMenu");
const linkButton = document.getElementById("linkButton");
const toolbarButtons = [...document.querySelectorAll("[data-command]")];
const startOverlay = document.getElementById("documentStartOverlay");
const newDocumentOptions = document.getElementById("newDocumentOptions");
const newDocumentName = document.getElementById("newDocumentName");
const newDocumentType = document.getElementById("newDocumentType");
const startError = document.getElementById("documentStartError");
const exportOverlay = document.getElementById("exportOverlay");
const closeDocumentOverlay = document.getElementById("closeDocumentOverlay");
const linkPreviewOverlay = document.getElementById("linkPreviewOverlay");
const linkPreviewFrame = document.getElementById("linkPreviewFrame");
const linkPreviewUrl = document.getElementById("linkPreviewUrl");
const openPreviewedLink = document.getElementById("openPreviewedLink");
const customFontOverlay = document.getElementById("customFontOverlay");
const customFontForm = document.getElementById("customFontForm");
const customFontNameInput = document.getElementById("customFontName");
const customFontFileInput = document.getElementById("customFontFile");
const customFontFeedback = document.getElementById("customFontFeedback");
const loadCustomFontButton = document.getElementById("loadCustomFont");
const createDocumentButton = newDocumentOptions.querySelector(
    'button[type="submit"]'
);
const closeContinueDrive = document.getElementById("closeContinueDrive");
const workspaceImageButton = document.getElementById("workspaceImageButton");
const workspaceImageOverlay = document.getElementById("workspaceImageOverlay");
const workspaceImageForm = document.getElementById("workspaceImageForm");
const workspaceImageUrl = document.getElementById("workspaceImageUrl");
const workspaceImageError = document.getElementById("workspaceImageError");
const workspacePageBreakButton = document.getElementById("workspacePageBreakButton");
const markdownFlowConflictOverlay = document.getElementById("markdownFlowConflictOverlay");
const markdownFlowDiscard = document.getElementById("markdownFlowDiscard");
const markdownFlowSaveCancel = document.getElementById("markdownFlowSaveCancel");
const markdownFlowConflictStatus = document.getElementById("markdownFlowConflictStatus");
const markdownImportTargetOverlay = document.getElementById("markdownImportTargetOverlay");
const markdownImportTargets = document.getElementById("markdownImportTargets");
const markdownImportTargetStatus = document.getElementById("markdownImportTargetStatus");
const cancelMarkdownImportTarget = document.getElementById("cancelMarkdownImportTarget");

let savedSelection = null;
let activeDocumentType = "txt";
let documentIsOpen = false;
let hasUnsavedChanges = false;
let lastSavedDocument = null;
let allowTabClose = false;
let closeAfterExport = false;
let closeRequestSource = "tab";
let previewedLinkUrl = "";
let currentFontName = "Arial";
let sidePanelIsOpen = false;
let sidePanelWindowId = null;
let openedSidePanelWindowId = null;
let sidePanelTabId = null;
let sidePanelConfigurationReady = false;
let activeMarkdownFlowRequestId = null;
const DRIVE_CONTINUE_TYPES = new Set([
    "google-pdf",
    "google-doc",
    "google-slides",
    "google-sheet"
]);

function updateDriveContinueButton() {
    closeContinueDrive.disabled = !DRIVE_CONTINUE_TYPES.has(activeDocumentType);
}
const fontSuggestions = [
    "Aptos",
    "Arial",
    "Arial Black",
    "Bahnschrift",
    "Book Antiqua",
    "Calibri",
    "Cambria",
    "Candara",
    "Century Gothic",
    "Comic Sans MS",
    "Consolas",
    "Courier New",
    "Franklin Gothic Medium",
    "Garamond",
    "Georgia",
    "Helvetica",
    "Impact",
    "Lucida Console",
    "Palatino Linotype",
    "Segoe UI",
    "Tahoma",
    "Times New Roman",
    "Trebuchet MS",
    "Verdana"
];
const CUSTOM_FONT_DATABASE = "simplyBlocksCustomFonts";
const CUSTOM_FONT_STORE = "fonts";

if (chrome.sidePanel.onOpened) {
    chrome.sidePanel.onOpened.addListener((info) => {
        sidePanelIsOpen = true;
        openedSidePanelWindowId = info.windowId;
        document
            .querySelector(".workspace-editor-fullscreen-panel-card")
            ?.setAttribute("aria-pressed", "true");
    });
}

if (chrome.sidePanel.onClosed) {
    chrome.sidePanel.onClosed.addListener((info) => {
        if (openedSidePanelWindowId === info.windowId) {
            sidePanelIsOpen = false;
            openedSidePanelWindowId = null;
            document
                .querySelector(".workspace-editor-fullscreen-panel-card")
                ?.setAttribute("aria-pressed", "false");
        }
    });
}

document.addEventListener("simplyBlocksProfileSidePanelOpened", (event) => {
    sidePanelIsOpen = true;
    openedSidePanelWindowId = event.detail?.windowId ?? sidePanelWindowId;
    document
        .querySelector(".workspace-editor-fullscreen-panel-card")
        ?.setAttribute("aria-pressed", "true");
});

async function closeSidePanelIfOpen(options) {
    try {
        await chrome.sidePanel.close(options);
    } catch (error) {
        const noActivePanel =
            error?.message?.includes("No active") ||
            error?.message?.includes("not open");

        if (!noActivePanel) {
            throw error;
        }
    }
}

async function prepareFullScreenSidePanel() {
    const [currentTab, currentWindow] = await Promise.all([
        chrome.tabs.getCurrent(),
        chrome.windows.getCurrent()
    ]);

    if (currentTab?.id == null || currentWindow?.id == null) {
        throw new Error("The current editor tab could not be identified.");
    }

    await closeSidePanelIfOpen({
        windowId: currentWindow.id
    });
    sidePanelIsOpen = false;
    openedSidePanelWindowId = null;

    await chrome.sidePanel.setOptions({
        path: "index.html",
        enabled: true
    });

    sidePanelTabId = currentTab.id;
    sidePanelWindowId = currentWindow.id;
    sidePanelConfigurationReady = true;
    document.dispatchEvent(
        new CustomEvent("simplyBlocksFullScreenSidePanelReady")
    );
}

function openCustomFontDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(CUSTOM_FONT_DATABASE, 1);

        request.addEventListener("upgradeneeded", () => {
            if (!request.result.objectStoreNames.contains(CUSTOM_FONT_STORE)) {
                request.result.createObjectStore(CUSTOM_FONT_STORE, {
                    keyPath: "name"
                });
            }
        });
        request.addEventListener("success", () => resolve(request.result));
        request.addEventListener("error", () => reject(request.error));
    });
}

async function saveCustomFont(name, file) {
    const database = await openCustomFontDatabase();

    await new Promise((resolve, reject) => {
        const transaction = database.transaction(CUSTOM_FONT_STORE, "readwrite");
        transaction.objectStore(CUSTOM_FONT_STORE).put({ name, file });
        transaction.addEventListener("complete", resolve);
        transaction.addEventListener("error", () => reject(transaction.error));
    });
    database.close();
}

async function registerCustomFont(name, file) {
    const font = new FontFace(name, await file.arrayBuffer());

    await font.load();
    document.fonts.add(font);

    if (!fontSuggestions.includes(name)) {
        fontSuggestions.push(name);
        fontSuggestions.sort((first, second) => first.localeCompare(second));
    }
}

async function loadSavedCustomFonts() {
    const database = await openCustomFontDatabase();
    const records = await new Promise((resolve, reject) => {
        const transaction = database.transaction(CUSTOM_FONT_STORE, "readonly");
        const request = transaction.objectStore(CUSTOM_FONT_STORE).getAll();
        request.addEventListener("success", () => resolve(request.result));
        request.addEventListener("error", () => reject(request.error));
    });

    database.close();

    await Promise.allSettled(
        records.map((record) => registerCustomFont(record.name, record.file))
    );
}

function setDocumentOpen(open) {
    documentIsOpen = open;
    documentPage.hidden = !open;
    noDocumentState.hidden = open;
    documentTitle.disabled = !open;
    documentTitle.value = open
        ? documentTitle.value
        : "";
    saveStatus.textContent = open
        ? ""
        : "No Document Currently Opened";
    saveStatus.classList.toggle("no-document", !open);

    document
        .querySelectorAll(".workspace-document-action")
        .forEach((control) => {
            control.disabled = !open;
        });
}

document.addEventListener("simplyBlocksWorkspaceContentLoaded", (event) => {
    const detail = event.detail || {};
    const modeClasses = [
        "google-doc-mode",
        "google-sheet-mode",
        "google-slides-mode",
        "google-pdf-mode",
        "drive-generic-mode"
    ];

    documentPage.classList.remove(...modeClasses);
    if (detail.mode) documentPage.classList.add(detail.mode);
    documentPage.replaceChildren();
    if (detail.content) documentPage.append(detail.content);
    documentPage.contentEditable = detail.editable === false ? "false" : "true";
    documentTitle.value = detail.name || "Untitled Workspace File";
    activeDocumentType = detail.type || "google-doc";
    updateDriveContinueButton();
    hasUnsavedChanges = false;
    setDocumentOpen(true);
    updateDocumentCount();
    saveStatus.textContent = "Loaded From Google Drive";
});

function safeFileName(value, extension) {
    const baseName = value
        .trim()
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
        .replace(/\s+/g, " ")
        .slice(0, 100) || "Untitled document";

    return `${baseName}.${extension}`;
}

function updateDocumentCount() {
    const text = documentPage.innerText.replace(/\u00a0/g, " ").trim();
    const words = text ? text.split(/\s+/).length : 0;
    const characters = text.length;

    documentCount.textContent =
        `${words} ${words === 1 ? "word" : "words"} · ` +
        `${characters} ${characters === 1 ? "character" : "characters"}`;
}

async function saveDocument() {
    if (!documentIsOpen) {
        saveStatus.textContent = "No document";
        return false;
    }

    const workspaceSave = { handled: false, promise: null };
    document.dispatchEvent(new CustomEvent("simplyBlocksWorkspaceSaveRequested", {
        detail: workspaceSave
    }));
    if (workspaceSave.handled) {
        saveStatus.textContent = "Saving To Google Drive...";
        saveStatus.classList.add("saving");
        try {
            await workspaceSave.promise;
            hasUnsavedChanges = false;
            saveStatus.textContent = workspaceSave.successMessage || "Saved To Google Drive";
            return true;
        } catch (error) {
            console.error("Workspace file could not be saved:", error);
            saveStatus.textContent = error?.message || "Google Drive Save Failed";
            return false;
        } finally {
            saveStatus.classList.remove("saving");
        }
    }

    if (!documentPage.innerText.trim()) {
        try {
            await chrome.storage.local.remove(DOCUMENT_STORAGE_KEY);
            hasUnsavedChanges = false;
            lastSavedDocument = null;
            saveStatus.textContent = "Blank document not saved";
            saveStatus.classList.remove("saving");
        } catch (error) {
            console.error("Blank document could not be removed:", error);
            saveStatus.textContent = "Save failed";
        }

        saveStatus.classList.remove("saving");
        return true;
    }

    saveStatus.textContent = "Saving...";
    saveStatus.classList.add("saving");

    try {
        const documentData = {
            title: documentTitle.value.trim() || "Untitled document",
            content: documentPage.innerHTML,
            type: activeDocumentType,
            updatedAt: Date.now()
        };

        await chrome.storage.local.set({
            [DOCUMENT_STORAGE_KEY]: documentData
        });
        lastSavedDocument = documentData;
        hasUnsavedChanges = false;
        saveStatus.textContent = "";
        if (activeDocumentType === "md" && activeMarkdownFlowRequestId) {
            await offerMarkdownImportTarget();
        }
        return true;
    } catch (error) {
        console.error("Document could not be saved:", error);
        saveStatus.textContent = "Save failed";
        return false;
    } finally {
        saveStatus.classList.remove("saving");
    }
}

function scheduleSave() {
    hasUnsavedChanges = true;
    saveStatus.textContent = "Unsaved Changes";
    saveStatus.classList.add("saving");
}

async function loadDocument() {
    try {
        const stored = await chrome.storage.local.get(DOCUMENT_STORAGE_KEY);
        const documentData = stored[DOCUMENT_STORAGE_KEY];
        lastSavedDocument = documentData || null;

        if (!documentData) {
            setDocumentOpen(false);
            updateDocumentCount();
            return;
        }

        activeDocumentType =
            documentData.type === "html"
                ? "txt"
                : documentData.type || "txt";
        documentTitle.value = documentData.title || "Untitled document";
        documentPage.innerHTML = documentData.content || "<p><br></p>";
        setDocumentOpen(true);
        hasUnsavedChanges = false;
        updateDocumentCount();
        saveStatus.textContent = "";
    } catch (error) {
        console.error("Document could not be loaded:", error);
        saveStatus.textContent = "Load failed";
    }
}

async function offerMarkdownImportTarget() {
    const stored = await chrome.storage.local.get(["simplyBlocks", "simplyBlocksMarkdownEditorRequest"]);
    const request = stored.simplyBlocksMarkdownEditorRequest;
    if (!request || request.id !== activeMarkdownFlowRequestId) return;
    const blocks = Array.isArray(stored.simplyBlocks) ? stored.simplyBlocks : [];
    const imports = blocks.filter((block) => block.type === "file" && block.name === "Import");
    markdownImportTargets.replaceChildren();
    markdownImportTargetStatus.textContent = imports.length ? "" : "Create an Import File-Block in the block workspace first.";

    const contents = documentPage.innerText.replace(/\u00a0/g, " ");
    const fileName = safeFileName(documentTitle.value.replace(/\.md$/i, ""), "md");
    const file = {
        name: fileName,
        type: "text/markdown",
        size: new Blob([contents]).size,
        lastModified: Date.now(),
        contents
    };

    imports.forEach((block, index) => {
        const button = document.createElement("button");
        const icon = document.createElement("span");
        const text = document.createElement("span");
        const title = document.createElement("strong");
        const detail = document.createElement("small");
        button.type = "button";
        button.className = "start-action-card";
        icon.className = "start-action-icon";
        icon.textContent = "MD";
        title.textContent = `Import block ${index + 1}`;
        detail.textContent = block.file?.name ? `Replace ${block.file.name}` : "Empty Import block";
        text.append(title, detail);
        button.append(icon, text);
        button.addEventListener("click", async () => {
            button.disabled = true;
            const latest = await chrome.storage.local.get("simplyBlocks");
            const latestBlocks = Array.isArray(latest.simplyBlocks) ? latest.simplyBlocks : [];
            const target = latestBlocks.find((item) => item.id === block.id);
            if (!target) {
                markdownImportTargetStatus.textContent = "That Import block no longer exists.";
                button.disabled = false;
                return;
            }
            target.file = file;
            target.fileReceivedAt = Date.now();
            delete target.lastFileAction;
            delete target.fileError;
            await chrome.storage.local.set({ simplyBlocks: latestBlocks });
            await chrome.storage.local.remove("simplyBlocksMarkdownEditorRequest");
            activeMarkdownFlowRequestId = null;
            markdownImportTargetOverlay.hidden = true;
            saveStatus.textContent = `Added To Import Block ${index + 1}`;
        });
        markdownImportTargets.append(button);
    });
    markdownImportTargetOverlay.hidden = false;
}

async function handleMarkdownEditorRequest() {
    const { simplyBlocksMarkdownEditorRequest: request } = await chrome.storage.local.get("simplyBlocksMarkdownEditorRequest");
    if (!request || request.id === activeMarkdownFlowRequestId) return;
    activeMarkdownFlowRequestId = request.id;
    markdownFlowConflictStatus.textContent = "";
    if (documentIsOpen || lastSavedDocument) {
        markdownFlowConflictOverlay.hidden = false;
        return;
    }
    createBlankDocument("Untitled Markdown", "md");
}

async function handleOpenMarkdownInEditorRequest() {
    const { simplyBlocksOpenMarkdownInEditor: request } = await chrome.storage.local.get("simplyBlocksOpenMarkdownInEditor");
    if (!request?.file || typeof request.file.contents !== "string") return;
    const file = request.file;
    const documentData = {
        title: String(file.name || "Untitled Markdown").replace(/\.md$/i, ""),
        content: escapeHtml(file.contents).replace(/\r?\n/g, "<br>"),
        type: "md",
        updatedAt: Date.now()
    };
    await chrome.storage.local.set({ [DOCUMENT_STORAGE_KEY]: documentData });
    await chrome.storage.local.remove(["simplyBlocksOpenMarkdownInEditor", "simplyBlocksMarkdownEditorRequest"]);
    activeMarkdownFlowRequestId = null;
    markdownFlowConflictOverlay.hidden = true;
    lastSavedDocument = documentData;
    activeDocumentType = "md";
    documentTitle.value = documentData.title;
    documentPage.innerHTML = documentData.content || "<p><br></p>";
    hasUnsavedChanges = false;
    savedSelection = null;
    setDocumentOpen(true);
    updateDocumentCount();
    saveStatus.textContent = "Opened Markdown From File Flow";
}

async function closeEditorTab() {
    allowTabClose = true;
    const currentTab = await chrome.tabs.getCurrent();

    if (currentTab?.id != null) {
        await chrome.tabs.remove(currentTab.id);
    } else {
        window.close();
    }
}

function closeCurrentDocument() {
    documentPage.innerHTML = "<p><br></p>";
    documentTitle.value = "";
    activeDocumentType = "txt";
    hasUnsavedChanges = false;
    savedSelection = null;
    setDocumentOpen(false);
    updateDocumentCount();
}

async function restoreSavedDocumentAfterCanceledClose() {
    if (lastSavedDocument) {
        await chrome.storage.local.set({
            [DOCUMENT_STORAGE_KEY]: lastSavedDocument
        });
    }
}

function runCommand(command, value = null) {
    if (!documentIsOpen) {
        return;
    }

    if (savedSelection) {
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(savedSelection);
    }

    documentPage.focus();
    document.execCommand(command, false, value);
    updateToolbarState();
    updateDocumentCount();
    scheduleSave();
}

function applyFontSize(value) {
    if (!documentIsOpen) {
        return;
    }

    const size = Math.min(500, Math.max(1, Number(value)));

    if (!Number.isFinite(size)) {
        return;
    }

    if (savedSelection) {
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(savedSelection);
    }

    documentPage.focus();
    document.execCommand("fontSize", false, "7");

    const selection = window.getSelection();
    const appliedRange = selection.rangeCount > 0
        ? selection.getRangeAt(0)
        : null;

    documentPage.querySelectorAll('font[size="7"]').forEach((font) => {
        if (appliedRange && !appliedRange.intersectsNode(font)) {
            return;
        }

        font.removeAttribute("size");
        font.style.fontSize = `${size}pt`;
    });

    fontSizeInput.value = String(size);
    rememberSelection();
    updateToolbarState();
    updateDocumentCount();
    scheduleSave();
}

function rememberSelection() {
    const selection = window.getSelection();

    if (
        selection.rangeCount > 0 &&
        documentPage.contains(selection.anchorNode)
    ) {
        savedSelection = selection.getRangeAt(0).cloneRange();
    }
}

function updateToolbarState() {
    toolbarButtons.forEach((button) => {
        const command = button.dataset.command;
        const stateCommands = new Set([
            "bold",
            "italic",
            "underline",
            "strikeThrough",
            "justifyLeft",
            "justifyCenter",
            "justifyRight",
            "insertUnorderedList",
            "insertOrderedList"
        ]);

        if (stateCommands.has(command)) {
            button.classList.toggle(
                "active",
                document.queryCommandState(command)
            );
        }
    });
}

function escapeHtml(text) {
    const element = document.createElement("div");
    element.textContent = text;
    return element.innerHTML;
}

function importDocument(file) {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
        const contents = String(reader.result || "");
        const extension = file.name.split(".").pop()?.toLowerCase() || "";
        const supportedTextFile =
            [
                "txt",
                "md",
                "markdown",
                "csv",
                "json",
                "xml",
                "css",
                "js"
            ].includes(extension);

        if (!supportedTextFile) {
            saveStatus.textContent = "Unsupported file";
            console.warn(
                "That file cannot be edited as text yet. Choose a text, Markdown, CSV, JSON, XML, CSS, or JavaScript file."
            );
            return;
        }

        let importedContent;

        importedContent = escapeHtml(contents).replace(/\r?\n/g, "<br>");

        documentTitle.value = file.name.replace(/\.[^.]+$/, "") || "Imported document";
        activeDocumentType =
            ["md", "markdown"].includes(extension) ? "md" : "txt";
        updateDriveContinueButton();
        document.dispatchEvent(new CustomEvent("simplyBlocksLocalDocumentActivated"));
        documentPage.innerHTML = importedContent || "<p><br></p>";
        setDocumentOpen(true);
        updateDocumentCount();
        scheduleSave();
        documentPage.focus();
        startOverlay.hidden = true;
    });

    reader.addEventListener("error", () => {
        saveStatus.textContent = "Import failed";
    });

    reader.readAsText(file);
}

function createBlankDocument(name, type = "txt") {
    documentTitle.value = name.trim() || "Untitled document";
    activeDocumentType = type;
    updateDriveContinueButton();
    document.dispatchEvent(new CustomEvent("simplyBlocksLocalDocumentActivated"));
    documentPage.innerHTML = "<p><br></p>";
    setDocumentOpen(true);
    updateDocumentCount();
    scheduleSave();
    startOverlay.hidden = true;
    documentPage.focus();
}

const GOOGLE_FILE_TYPES = {
    "google-doc": {
        mimeType: "application/vnd.google-apps.document"
    },
    "google-sheet": {
        mimeType: "application/vnd.google-apps.spreadsheet"
    },
    "google-slides": {
        mimeType: "application/vnd.google-apps.presentation"
    },
    "google-pdf": {
        mimeType: "application/pdf"
    }
};

async function createGoogleWorkspaceFile(name, type) {
    const configuration = GOOGLE_FILE_TYPES[type];

    if (!configuration) {
        throw new Error("That Google Workspace file type is not supported.");
    }

    let fileName = name.trim() || "Untitled document";
    if (type === "google-pdf" && !fileName.toLowerCase().endsWith(".pdf")) {
        fileName += ".pdf";
    }

    const token = await getGoogleToken(true);
    const response = await fetch(
        "https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name: fileName,
                mimeType: configuration.mimeType
            })
        }
    );
    const result = await response.json();

    if (!response.ok) {
        throw new Error(
            result.error?.message || "Google Drive could not create the file."
        );
    }

    if (type === "google-pdf") {
        const blankPagePaint = "0.831 0.835 0.839 rg\n0 0 612 792 re f";
        const objects = [
            "<< /Type /Catalog /Pages 2 0 R >>",
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R >>",
            `<< /Length ${blankPagePaint.length} >>\nstream\n${blankPagePaint}\nendstream`
        ];
        let pdf = "%PDF-1.4\n";
        const offsets = [0];
        objects.forEach((object, index) => {
            offsets.push(pdf.length);
            pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
        });
        const xrefOffset = pdf.length;
        pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
        offsets.slice(1).forEach((offset) => {
            pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
        });
        pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
        const upload = await fetch(
            `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(result.id)}?uploadType=media`,
            {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/pdf"
                },
                body: new Blob([pdf], { type: "application/pdf" })
            }
        );
        if (!upload.ok) {
            const uploadError = await upload.json().catch(() => ({}));
            throw new Error(uploadError.error?.message || "The Blank PDF Could Not Be Created.");
        }
    }

    startOverlay.hidden = true;
    document.dispatchEvent(new CustomEvent("simplyBlocksDriveFileSelected", {
        detail: result
    }));
}

function showNewDocumentOptions() {
    startOverlay.hidden = false;
    startError.textContent = "";
    newDocumentName.value = "Untitled document";
    requestAnimationFrame(() => {
        newDocumentName.focus();
        newDocumentName.select();
    });
}

function openFilePicker() {
    importInput.click();
}

function downloadDocument(format) {
    const plainText = documentPage.innerText;
    const blob = new Blob(
        [plainText],
        {
            type: format === "md"
                ? "text/markdown;charset=utf-8"
                : "text/plain;charset=utf-8"
        }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = safeFileName(
        documentTitle.value,
        format === "md" ? "md" : "txt"
    );
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function createSidebarCard(title, description, icon) {
    const button = document.createElement("button");
    const iconElement = document.createElement("span");
    const text = document.createElement("span");
    const titleElement = document.createElement("span");
    const descriptionElement = document.createElement("span");

    button.className =
        "workspace-action-card workspace-editor-sidebar-card";
    button.type = "button";
    button.title = title;
    button.setAttribute("aria-label", title);
    iconElement.className = "workspace-action-icon";
    iconElement.textContent = icon;
    text.className = "workspace-action-text";
    titleElement.className = "workspace-action-title";
    titleElement.textContent = title;
    descriptionElement.className = "workspace-action-description";
    descriptionElement.textContent = description;
    text.append(titleElement, descriptionElement);
    button.append(iconElement, text);

    return button;
}

function addSidebarActions() {
    if (document.querySelector(".workspace-editor-sidebar-card")) {
        return;
    }

    const newCard = createSidebarCard(
        "Create New Document",
        "Start a Simply Blocks or Google file",
        "+"
    );
    const openCard = createSidebarCard(
        "Open Document",
        "Choose an existing file",
        "↥"
    );
    const saveCard = createSidebarCard(
        "Save Document",
        "Save the title, type, and content",
        "✓"
    );
    const exportCard = createSidebarCard(
        "Export Document",
        "Export as TXT or Markdown",
        "↧"
    );
    const closeCard = createSidebarCard(
        "Close Document",
        "Save, export, or discard before closing",
        "×"
    );
    const toolbarCard = createSidebarCard(
        "Toggle Edit Functions",
        "Show or Hide the Toolbar.",
        "T"
    );
    const documentInfoCard = createSidebarCard(
        "Toggle Document Info",
        "Show or Hide the Document's Information.",
        "I"
    );
    const printCard = createSidebarCard(
        "Print Document",
        "Save and print only the document",
        "P"
    );
    const customFontCard = createSidebarCard(
        "Load Custom Font",
        "Name and add a local font file",
        "Aa"
    );
    const newTabCard = createSidebarCard(
        "New Tab",
        "Opens a Brand new Tab (or use Cntrl + T).",
        "+"
    );
    const fullScreenToggleCard = createSidebarCard(
        "Toggle Full-Screen",
        "Enable or Disable Full-Screen Viewing",
        "⛶"
    );
    const fullScreenSidePanelCard = createSidebarCard(
        "Toggle Side Panel",
        "Show or hide the side panel",
        "▣"
    );

    documentInfoCard.classList.add("workspace-editor-info-card");
    toolbarCard.classList.add("workspace-editor-toolbar-card");
    printCard.classList.add("workspace-editor-print-card");
    customFontCard.classList.add("workspace-editor-custom-font-card");
    newTabCard.classList.add("workspace-editor-new-tab-card");
    fullScreenToggleCard.classList.add(
        "workspace-editor-fullscreen-toggle-card"
    );
    fullScreenSidePanelCard.classList.add(
        "workspace-editor-fullscreen-panel-card"
    );
    fullScreenToggleCard.setAttribute("aria-pressed", "false");
    fullScreenSidePanelCard.setAttribute("aria-pressed", "false");
    newCard.classList.add("workspace-editor-new-card");
    openCard.classList.add("workspace-editor-open-card");
    saveCard.classList.add("workspace-editor-save-card");
    exportCard.classList.add("workspace-editor-export-card");
    closeCard.classList.add("workspace-editor-close-card");
    saveCard.classList.add("workspace-document-action");
    exportCard.classList.add("workspace-document-action");
    closeCard.classList.add("workspace-document-action");
    printCard.classList.add("workspace-document-action");

    documentInfoCard.setAttribute("aria-pressed", "false");
    documentInfoCard.addEventListener("click", () => {
        const hidden = !editorHeader.hidden;

        editorHeader.hidden = hidden;
        editorFooter.hidden = hidden;
        editorApp.classList.toggle("document-info-hidden", hidden);
        documentInfoCard.setAttribute("aria-pressed", String(hidden));
    });
    toolbarCard.setAttribute("aria-pressed", "false");
    toolbarCard.addEventListener("click", () => {
        const hidden = !editorToolbar.hidden;

        editorToolbar.hidden = hidden;
        editorApp.classList.toggle("toolbar-hidden", hidden);
        toolbarCard.setAttribute("aria-pressed", String(hidden));
    });
    printCard.addEventListener("click", async () => {
        const saved = await saveDocument();

        if (saved) {
            window.print();
        }
    });
    customFontCard.addEventListener("click", () => {
        customFontForm.reset();
        customFontFeedback.textContent = "";
        customFontFeedback.classList.remove("error");
        customFontOverlay.hidden = false;
        requestAnimationFrame(() => customFontNameInput.focus());
    });
    newTabCard.addEventListener("click", () => {
        chrome.tabs.create({});
    });
    let restoreWindowState = "normal";

    async function updateFullScreenSidePanelState() {
        try {
            const currentWindow = await chrome.windows.getCurrent();
            const isFullscreen =
                currentWindow.state === "fullscreen" ||
                Boolean(document.fullscreenElement);

            fullScreenToggleCard.setAttribute(
                "aria-pressed",
                String(isFullscreen)
            );
            fullScreenSidePanelCard.disabled = !sidePanelConfigurationReady;
            fullScreenSidePanelCard.title = !sidePanelConfigurationReady
                ? "Preparing the side panel"
                : "Toggle the side panel";
        } catch (error) {
            fullScreenSidePanelCard.disabled = true;
            console.warn("Fullscreen state could not be checked:", error);
        }
    }
    fullScreenToggleCard.addEventListener("click", async () => {
        fullScreenToggleCard.disabled = true;

        try {
            const currentWindow = await chrome.windows.getCurrent();

            if (
                currentWindow.state === "fullscreen" ||
                document.fullscreenElement
            ) {
                if (document.fullscreenElement) {
                    await document.exitFullscreen();
                } else {
                    await chrome.windows.update(currentWindow.id, {
                        state: restoreWindowState
                    });
                }
            } else {
                restoreWindowState =
                    currentWindow.state === "maximized"
                        ? "maximized"
                        : "normal";
                await chrome.windows.update(currentWindow.id, {
                    state: "fullscreen"
                });
            }
        } catch (error) {
            console.error("Fullscreen mode could not be toggled:", error);
        } finally {
            fullScreenToggleCard.disabled = false;
            await updateFullScreenSidePanelState();
        }
    });
    fullScreenSidePanelCard.addEventListener("click", async () => {
        fullScreenSidePanelCard.disabled = true;

        try {
            if (
                !sidePanelConfigurationReady ||
                sidePanelTabId == null ||
                sidePanelWindowId == null
            ) {
                await updateFullScreenSidePanelState();
                return;
            }

            const panelAlreadyOpen =
                sidePanelIsOpen &&
                openedSidePanelWindowId === sidePanelWindowId;

            if (panelAlreadyOpen) {
                await closeSidePanelIfOpen({
                    windowId: sidePanelWindowId
                });
                sidePanelIsOpen = false;
                fullScreenSidePanelCard.setAttribute(
                    "aria-pressed",
                    "false"
                );
                return;
            }

            await chrome.sidePanel.setOptions({
                path: "index.html",
                enabled: true
            });
            await chrome.sidePanel.open({
                windowId: sidePanelWindowId
            });
            sidePanelIsOpen = true;
            openedSidePanelWindowId = sidePanelWindowId;
            fullScreenSidePanelCard.setAttribute("aria-pressed", "true");
        } catch (error) {
            console.error("The side panel could not be toggled:", error);
        } finally {
            await updateFullScreenSidePanelState();
        }
    });

    document.addEventListener(
        "fullscreenchange",
        updateFullScreenSidePanelState
    );
    document.addEventListener(
        "simplyBlocksFullScreenSidePanelReady",
        updateFullScreenSidePanelState
    );
    window.addEventListener("resize", updateFullScreenSidePanelState);
    chrome.windows.onBoundsChanged.addListener((changedWindow) => {
        if (changedWindow.id === sidePanelWindowId || sidePanelWindowId == null) {
            updateFullScreenSidePanelState();
        }
    });
    updateFullScreenSidePanelState();
    newCard.addEventListener("click", () => {
        startOverlay.hidden = false;
        showNewDocumentOptions();
    });
    openCard.addEventListener("click", openFilePicker);
    saveCard.addEventListener("click", saveDocument);
    exportCard.addEventListener("click", () => {
        exportOverlay.hidden = false;
    });
    closeCard.addEventListener("click", () => {
        closeRequestSource = "document";
        updateDriveContinueButton();
        closeDocumentOverlay.hidden = false;
    });
    const sidebarScroll = document.querySelector(".workspace-sidebar-scroll");
    (sidebarScroll || document.body).append(
        documentInfoCard,
        toolbarCard,
        printCard,
        customFontCard,
        newTabCard,
        fullScreenToggleCard,
        fullScreenSidePanelCard,
        newCard,
        openCard,
        saveCard,
        exportCard,
        closeCard
    );

    [printCard, saveCard, exportCard, closeCard].forEach((card) => {
        card.disabled = !documentIsOpen;
    });
}

toolbarButtons.forEach((button) => {
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => runCommand(button.dataset.command));
});

document.getElementById("blockFormat").addEventListener("change", (event) => {
    runCommand("formatBlock", event.target.value);
});

fontNameInput.addEventListener("change", (event) => {
    const fontName = event.target.value.trim();

    if (fontName) {
        currentFontName = fontName;
        runCommand("fontName", fontName);
    }
});

function positionFontMenu() {
    const inputBounds = fontNameInput.getBoundingClientRect();
    const menuWidth = 230;
    const left = Math.min(
        inputBounds.left,
        window.innerWidth - menuWidth - 10
    );

    fontMenu.style.left = `${Math.max(10, left)}px`;
    fontMenu.style.top = `${inputBounds.bottom + 7}px`;
}

function renderFontMenu(query = "") {
    const normalizedQuery = query.trim().toLowerCase();
    const matchingFonts = fontSuggestions.filter((fontName) =>
        fontName.toLowerCase().includes(normalizedQuery)
    );

    fontMenu.replaceChildren();

    if (!matchingFonts.length) {
        const emptyMessage = document.createElement("p");
        emptyMessage.className = "font-menu-empty";
        emptyMessage.textContent = "Press Enter to use this font";
        fontMenu.append(emptyMessage);
        return;
    }

    matchingFonts.forEach((fontName) => {
        const option = document.createElement("button");
        option.className = "font-option";
        option.type = "button";
        option.dataset.font = fontName;
        option.setAttribute("role", "option");
        option.setAttribute(
            "aria-selected",
            String(fontName === currentFontName)
        );
        option.textContent = fontName;
        option.style.fontFamily = `"${fontName}", sans-serif`;
        fontMenu.append(option);
    });
}

function openFontMenu() {
    renderFontMenu(fontNameInput.value);
    positionFontMenu();
    fontMenu.hidden = false;
    fontNameInput.setAttribute("aria-expanded", "true");
}

function closeFontMenu() {
    fontMenu.hidden = true;
    fontNameInput.setAttribute("aria-expanded", "false");
}

fontNameInput.addEventListener("focus", () => {
    fontNameInput.value = "";
    fontNameInput.placeholder = currentFontName;
    openFontMenu();
});

fontNameInput.addEventListener("blur", () => {
    if (!fontNameInput.value.trim()) {
        fontNameInput.placeholder = currentFontName;
    }
});

fontNameInput.addEventListener("input", () => {
    openFontMenu();
});

fontNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        const fontName = event.currentTarget.value.trim();

        if (fontName) {
            currentFontName = fontName;
            runCommand("fontName", fontName);
            closeFontMenu();
        }
    }
});

fontMenu.addEventListener("mousedown", (event) => {
    event.preventDefault();
});

fontMenu.addEventListener("click", (event) => {
    const option = event.target.closest(".font-option");

    if (!option) {
        return;
    }

    const fontName = option.dataset.font;
    currentFontName = fontName;
    fontNameInput.value = fontName;
    fontNameInput.placeholder = fontName;
    runCommand("fontName", fontName);
    closeFontMenu();
});

document.addEventListener("mousedown", (event) => {
    if (
        !fontMenu.hidden &&
        event.target !== fontNameInput &&
        !fontMenu.contains(event.target)
    ) {
        closeFontMenu();
    }
});

window.addEventListener("resize", () => {
    if (!fontMenu.hidden) {
        positionFontMenu();
    }
});

function closeCustomFontDialog() {
    customFontOverlay.hidden = true;
    customFontForm.reset();
    customFontFeedback.textContent = "";
    customFontFeedback.classList.remove("error");
}

document.getElementById("cancelCustomFont").addEventListener(
    "click",
    closeCustomFontDialog
);

customFontOverlay.addEventListener("click", (event) => {
    if (event.target === customFontOverlay) {
        closeCustomFontDialog();
    }
});

customFontForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = customFontNameInput.value.trim();
    const [file] = customFontFileInput.files;
    const supportedFile = /\.(woff2?|ttf|otf)$/i.test(file?.name || "");

    if (!name || !file || !supportedFile) {
        customFontFeedback.textContent =
            "Enter a name and choose a WOFF, WOFF2, TTF, or OTF file.";
        customFontFeedback.classList.add("error");
        return;
    }

    loadCustomFontButton.disabled = true;
    customFontFeedback.textContent = "Loading font...";
    customFontFeedback.classList.remove("error");

    try {
        await registerCustomFont(name, file);
        await saveCustomFont(name, file);
        currentFontName = name;
        fontNameInput.value = "";
        fontNameInput.placeholder = name;
        customFontFeedback.textContent = `${name} is ready to use.`;
        setTimeout(closeCustomFontDialog, 650);
    } catch (error) {
        console.error("The custom font could not be loaded:", error);
        customFontFeedback.textContent =
            "That font file could not be loaded. Try another file.";
        customFontFeedback.classList.add("error");
    } finally {
        loadCustomFontButton.disabled = false;
    }
});

fontSizeInput.addEventListener("change", (event) => {
    applyFontSize(event.target.value);
});

fontSizeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        applyFontSize(event.currentTarget.value);
    }
});

document.getElementById("foreColor").addEventListener("input", (event) => {
    runCommand("foreColor", event.target.value);
});

document.getElementById("hiliteColor").addEventListener("input", (event) => {
    runCommand("hiliteColor", event.target.value);
});

linkButton.addEventListener("mousedown", (event) => {
    event.preventDefault();
});

linkButton.addEventListener("click", () => {
    if (!documentIsOpen) {
        return;
    }

    const urlInput = window.prompt("Enter the link URL:");

    if (!urlInput) {
        return;
    }

    const url = /^[a-z][a-z\d+.-]*:/i.test(urlInput)
        ? urlInput
        : `https://${urlInput}`;
    const selection = window.getSelection();

    if (savedSelection) {
        selection.removeAllRanges();
        selection.addRange(savedSelection);
    }

    if (selection.isCollapsed) {
        const label = window.prompt("Enter the link text:", urlInput) || urlInput;
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.textContent = label;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";

        const selectionIsInDocument =
            selection.rangeCount > 0 &&
            documentPage.contains(selection.anchorNode);
        const range = selectionIsInDocument
            ? selection.getRangeAt(0)
            : document.createRange();

        if (!selectionIsInDocument) {
            range.selectNodeContents(documentPage);
            range.collapse(false);
        }

        range.insertNode(anchor);
        range.setStartAfter(anchor);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        savedSelection = range.cloneRange();
        updateDocumentCount();
        scheduleSave();
        return;
    }

    runCommand("createLink", url);

    documentPage.querySelectorAll("a:not([target])").forEach((anchor) => {
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
    });
});

function closeLinkPreview() {
    linkPreviewOverlay.hidden = true;
    linkPreviewFrame.src = "about:blank";
    previewedLinkUrl = "";
}

documentPage.addEventListener("click", (event) => {
    const anchor = event.target.closest("a[href]");

    if (!anchor || !documentPage.contains(anchor)) {
        return;
    }

    event.preventDefault();

    let url;

    try {
        url = new URL(anchor.href);
    } catch {
        return;
    }

    if (!["http:", "https:"].includes(url.protocol)) {
        return;
    }

    previewedLinkUrl = url.href;
    linkPreviewUrl.textContent = url.href;
    linkPreviewFrame.src = url.href;
    linkPreviewOverlay.hidden = false;
    document.getElementById("openPreviewedLink").focus();
});

document.getElementById("closeLinkPreview").addEventListener("click", closeLinkPreview);
document.getElementById("cancelLinkPreview").addEventListener("click", closeLinkPreview);

linkPreviewOverlay.addEventListener("click", (event) => {
    if (event.target === linkPreviewOverlay) {
        closeLinkPreview();
    }
});

openPreviewedLink.addEventListener("click", async () => {
    if (!previewedLinkUrl) {
        return;
    }

    const url = previewedLinkUrl;
    closeLinkPreview();
    await chrome.tabs.create({ url });
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !linkPreviewOverlay.hidden) {
        closeLinkPreview();
    }

    if (event.key === "Escape" && !customFontOverlay.hidden) {
        closeCustomFontDialog();
    }
});

markdownFlowDiscard.addEventListener("click", async () => {
    await chrome.storage.local.remove(DOCUMENT_STORAGE_KEY);
    lastSavedDocument = null;
    closeCurrentDocument();
    markdownFlowConflictOverlay.hidden = true;
    createBlankDocument("Untitled Markdown", "md");
});

markdownFlowSaveCancel.addEventListener("click", async () => {
    markdownFlowSaveCancel.disabled = true;
    markdownFlowConflictStatus.textContent = "Saving current document…";
    try {
        const requestId = activeMarkdownFlowRequestId;
        activeMarkdownFlowRequestId = null;
        await chrome.storage.local.remove("simplyBlocksMarkdownEditorRequest");
        const saved = await saveDocument();
        if (!saved) {
            activeMarkdownFlowRequestId = requestId;
            await chrome.storage.local.set({
                simplyBlocksMarkdownEditorRequest: { id: requestId, requestedAt: Date.now() }
            });
            markdownFlowConflictStatus.textContent = "The document could not be saved.";
            return;
        }
        markdownFlowConflictOverlay.hidden = true;
    } finally {
        markdownFlowSaveCancel.disabled = false;
    }
});

cancelMarkdownImportTarget.addEventListener("click", async () => {
    await chrome.storage.local.remove("simplyBlocksMarkdownEditorRequest");
    activeMarkdownFlowRequestId = null;
    markdownImportTargetOverlay.hidden = true;
    saveStatus.textContent = "Markdown Saved In Live Editor";
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.simplyBlocksOpenMarkdownInEditor?.newValue) {
        handleOpenMarkdownInEditorRequest().catch(console.error);
    }
    if (areaName === "local" && changes.simplyBlocksMarkdownEditorRequest?.newValue) {
        handleMarkdownEditorRequest().catch(console.error);
    }
});

importInput.addEventListener("change", () => {
    const [file] = importInput.files;

    if (file) {
        importDocument(file);
    }

    importInput.value = "";
});

document.getElementById("cancelNewDocument").addEventListener("click", () => {
    startOverlay.hidden = true;
    startError.textContent = "";
});
document.getElementById("cancelExport").addEventListener("click", async () => {
    exportOverlay.hidden = true;

    if (closeAfterExport) {
        closeAfterExport = false;
        await restoreSavedDocumentAfterCanceledClose();
        updateDriveContinueButton();
        closeDocumentOverlay.hidden = false;
    }
});
document.querySelectorAll("[data-export-format]").forEach((button) => {
    button.addEventListener("click", async () => {
        const format = button.dataset.exportFormat;
        exportOverlay.hidden = true;

        downloadDocument(format);

        if (closeAfterExport) {
            closeAfterExport = false;
            await chrome.storage.local.remove(DOCUMENT_STORAGE_KEY);

            if (closeRequestSource === "document") {
                lastSavedDocument = null;
                closeCurrentDocument();
            } else {
                await closeEditorTab();
            }
        }
    });
});
document.getElementById("closeSaveDocument").addEventListener(
    "click",
    async () => {
        const saved = await saveDocument();

        if (saved) {
            closeDocumentOverlay.hidden = true;

            if (closeRequestSource === "document") {
                closeCurrentDocument();
            } else {
                await closeEditorTab();
            }
        }
    }
);
closeContinueDrive.addEventListener("click", async () => {
    if (closeContinueDrive.disabled) return;
    closeContinueDrive.disabled = true;
    const saved = await saveDocument();
    if (!saved) {
        updateDriveContinueButton();
        return;
    }

    closeDocumentOverlay.hidden = true;
    if (closeRequestSource === "document") {
        closeCurrentDocument();
    } else {
        await closeEditorTab();
    }
});
document.getElementById("closeExportDocument").addEventListener(
    "click",
    () => {
        closeDocumentOverlay.hidden = true;
        closeAfterExport = true;
        exportOverlay.hidden = false;
    }
);
document.getElementById("closeDiscardDocument").addEventListener(
    "click",
    async () => {
        await chrome.storage.local.remove(DOCUMENT_STORAGE_KEY);
        lastSavedDocument = null;
        hasUnsavedChanges = false;
        closeDocumentOverlay.hidden = true;

        if (closeRequestSource === "document") {
            closeCurrentDocument();
        } else {
            await closeEditorTab();
        }
    }
);
document.getElementById("returnToEditor").addEventListener(
    "click",
    async () => {
        await restoreSavedDocumentAfterCanceledClose();
        closeAfterExport = false;
        closeDocumentOverlay.hidden = true;
    }
);
newDocumentOptions.addEventListener("submit", async (event) => {
    event.preventDefault();
    const type = newDocumentType.value;

    if (!GOOGLE_FILE_TYPES[type]) {
        createBlankDocument(newDocumentName.value, type);
        return;
    }

    createDocumentButton.disabled = true;
    startError.textContent = "Creating your Google Workspace file...";

    try {
        await createGoogleWorkspaceFile(newDocumentName.value, type);
        startError.textContent = "";
    } catch (error) {
        console.error("Google Workspace file could not be created:", error);
        startError.textContent =
            error?.message || "The Google Workspace file could not be created.";
    } finally {
        createDocumentButton.disabled = false;
    }
});

documentPage.addEventListener("input", () => {
    updateDocumentCount();
    scheduleSave();
});
documentPage.addEventListener("keyup", updateToolbarState);
documentPage.addEventListener("mouseup", updateToolbarState);
documentPage.addEventListener("keyup", rememberSelection);
documentPage.addEventListener("mouseup", rememberSelection);
documentPage.addEventListener("focus", rememberSelection);
documentTitle.addEventListener("input", scheduleSave);

workspaceImageButton.addEventListener("click", () => {
    if (!DRIVE_CONTINUE_TYPES.has(activeDocumentType)) {
        saveStatus.textContent = "Images Can Be Inserted Into Workspace Documents";
        return;
    }
    workspaceImageError.textContent = "";
    workspaceImageForm.reset();
    document.getElementById("slideAssetOptions").hidden = activeDocumentType !== "google-slides";
    document.getElementById("workspaceImageTitle").textContent = activeDocumentType === "google-slides"
        ? "Insert An Image Or Slide Asset"
        : activeDocumentType === "google-pdf"
            ? "Insert An Image Into The PDF"
            : "Add An Image From The Web";
    workspaceImageOverlay.hidden = false;
    requestAnimationFrame(() => workspaceImageUrl.focus());
});
workspacePageBreakButton.addEventListener("click", () => {
    if (activeDocumentType !== "google-doc") {
        saveStatus.textContent = "Page Breaks Are Available For Google Docs";
        return;
    }
    document.dispatchEvent(new CustomEvent("simplyBlocksInsertDocumentPageBreak"));
});
document.getElementById("cancelWorkspaceImage").addEventListener("click", () => {
    workspaceImageOverlay.hidden = true;
});
workspaceImageForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    workspaceImageError.textContent = "";
    try {
        const url = new URL(workspaceImageUrl.value.trim());
        if (!["http:", "https:"].includes(url.protocol)) throw new Error("Use An HTTP Or HTTPS Image Link.");
        document.dispatchEvent(new CustomEvent("simplyBlocksInsertWorkspaceImage", {
            detail: { url: url.href }
        }));
        workspaceImageOverlay.hidden = true;
    } catch (error) {
        workspaceImageError.textContent = error?.message || "The Image Link Is Invalid.";
    }
});

document.querySelectorAll("[data-slide-emoji]").forEach((button) => {
    button.addEventListener("click", () => {
        document.dispatchEvent(new CustomEvent("simplyBlocksInsertSlideEmoji", {
            detail: { emoji: button.dataset.slideEmoji }
        }));
        workspaceImageOverlay.hidden = true;
    });
});
document.querySelectorAll("[data-slide-shape]").forEach((button) => {
    button.addEventListener("click", () => {
        document.dispatchEvent(new CustomEvent("simplyBlocksInsertSlideShape", {
            detail: { shapeType: button.dataset.slideShape }
        }));
        workspaceImageOverlay.hidden = true;
    });
});
document.getElementById("chooseDriveSlideImage").addEventListener("click", () => {
    workspaceImageOverlay.hidden = true;
    document.dispatchEvent(new CustomEvent("simplyBlocksOpenDrivePicker", {
        detail: { mode: "image" }
    }));
});
document.getElementById("localSlideImage").addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (file) {
        document.dispatchEvent(new CustomEvent("simplyBlocksInsertLocalSlideImage", {
            detail: { file }
        }));
    }
    event.target.value = "";
    workspaceImageOverlay.hidden = true;
});

documentPage.addEventListener("paste", (event) => {
    const html = event.clipboardData?.getData("text/html") || "";
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const pastedText = event.clipboardData?.getData("text/plain")?.trim() || "";
    const source = parsed.querySelector("img[src^='http://'], img[src^='https://']")?.src ||
        (/^https?:\/\/\S+$/i.test(pastedText) && /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(pastedText)
            ? pastedText
            : "");
    if (!source || !DRIVE_CONTINUE_TYPES.has(activeDocumentType)) return;
    event.preventDefault();
    document.dispatchEvent(new CustomEvent("simplyBlocksInsertWorkspaceImage", {
        detail: { url: source }
    }));
});

document.addEventListener("keydown", (event) => {
    if (!(event.ctrlKey || event.metaKey)) {
        return;
    }

    if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveDocument();
    }
});

window.addEventListener("beforeunload", (event) => {
    if (allowTabClose || !documentIsOpen) {
        return;
    }

    const discardOnLeave =
        hasUnsavedChanges ||
        !documentPage.innerText.trim();
    const cleanup = discardOnLeave
        ? chrome.storage.local.remove(DOCUMENT_STORAGE_KEY)
        : Promise.resolve();

    event.preventDefault();
    event.returnValue = "";

    setTimeout(async () => {
        await cleanup;

        if (discardOnLeave) {
            await restoreSavedDocumentAfterCanceledClose();
        }

        closeRequestSource = "tab";
        updateDriveContinueButton();
        closeDocumentOverlay.hidden = false;
    }, 0);
});

window.addEventListener("pagehide", () => {
    const discardOnLeave =
        hasUnsavedChanges ||
        !documentPage.innerText.trim();

    if (documentIsOpen && discardOnLeave && !allowTabClose) {
        chrome.storage.local.remove(DOCUMENT_STORAGE_KEY);
    }
});

document.addEventListener(
    "simplyBlocksWorkspacePanelReady",
    addSidebarActions
);
addSidebarActions();
setDocumentOpen(false);
loadDocument()
    .then(handleOpenMarkdownInEditorRequest)
    .then(handleMarkdownEditorRequest)
    .catch((error) => console.error("The Markdown editor handoff could not be started:", error));
loadSavedCustomFonts().catch((error) => {
    console.warn("Saved custom fonts could not be loaded:", error);
});
prepareFullScreenSidePanel().catch((error) => {
    console.error("The fullscreen side panel could not be prepared:", error);
});
