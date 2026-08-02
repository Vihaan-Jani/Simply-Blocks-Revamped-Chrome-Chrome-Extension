import { getGoogleToken } from "./auth.js";

const MIME_TYPES = {
    "application/vnd.google-apps.document": { label: "Google Docs", icon: "DOC" },
    "application/vnd.google-apps.spreadsheet": { label: "Google Sheets", icon: "SHEET" },
    "application/vnd.google-apps.presentation": { label: "Google Slides", icon: "SLIDE" },
    "application/pdf": { label: "PDF", icon: "PDF" }
};
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

function describeFile(file) {
    if (file.mimeType === FOLDER_MIME_TYPE) return { label: "Google Drive Folder", icon: "DIR" };
    if (MIME_TYPES[file.mimeType]) return MIME_TYPES[file.mimeType];
    if (file.mimeType?.startsWith("text/")) return { label: "Text File", icon: "TXT" };
    if (file.mimeType?.startsWith("image/")) return { label: "Image", icon: "IMG" };
    if (file.mimeType?.startsWith("audio/")) return { label: "Audio", icon: "AUDIO" };
    if (file.mimeType?.startsWith("video/")) return { label: "Video", icon: "VIDEO" };
    if (file.mimeType?.startsWith("application/vnd.google-apps.")) return { label: "Google Workspace File", icon: "G" };
    return { label: file.fileExtension?.toUpperCase() || "Drive File", icon: "FILE" };
}

const overlay = document.querySelector("#drivePickerOverlay");
const fileList = document.querySelector("#driveFileList");
const status = document.querySelector("#drivePickerStatus");
const closeButton = document.querySelector("#closeDrivePicker");
const cancelButton = document.querySelector("#cancelDrivePicker");
const refreshButton = document.querySelector("#refreshDrivePicker");
const backButton = document.querySelector("#driveBackButton");
const breadcrumbs = document.querySelector("#driveBreadcrumbs");
const searchInput = document.querySelector("#driveFileSearch");
let folderPath = [{ id: "root", name: "My Drive" }];
let currentItems = [];
let pickerMode = "file";

function closePicker() {
    overlay.hidden = true;
}

function formatModifiedTime(value) {
    if (!value) return "Modified Date Unavailable";
    return `Modified ${new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(new Date(value))}`;
}

function renderBreadcrumbs() {
    breadcrumbs.replaceChildren();
    folderPath.forEach((folder, index) => {
        if (index > 0) {
            const separator = document.createElement("span");
            separator.className = "drive-breadcrumb-separator";
            separator.textContent = "/";
            breadcrumbs.append(separator);
        }
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = folder.name;
        button.title = folder.name;
        button.addEventListener("click", () => {
            folderPath = folderPath.slice(0, index + 1);
            loadDriveFiles();
        });
        breadcrumbs.append(button);
    });
    backButton.disabled = folderPath.length <= 1;
}

function renderFiles(files = currentItems) {
    fileList.replaceChildren();
    const query = searchInput.value.trim().toLocaleLowerCase();
    const visibleFiles = files.filter((file) => {
        const matchesSearch = file.name.toLocaleLowerCase().includes(query);
        const matchesMode = pickerMode !== "image" ||
            file.mimeType === FOLDER_MIME_TYPE ||
            file.mimeType?.startsWith("image/");
        return matchesSearch && matchesMode;
    });

    if (!visibleFiles.length) {
        status.textContent = query ? "No Matching Items Were Found In This Folder." : "This Folder Is Empty.";
        return;
    }

    const folderCount = visibleFiles.filter((file) => file.mimeType === FOLDER_MIME_TYPE).length;
    const fileCount = visibleFiles.length - folderCount;
    status.textContent = `${folderCount} Folder${folderCount === 1 ? "" : "s"} · ${fileCount} File${fileCount === 1 ? "" : "s"}`;
    visibleFiles.forEach((file) => {
        const type = describeFile(file);
        const button = document.createElement("button");
        const icon = document.createElement("span");
        const meta = document.createElement("span");
        const name = document.createElement("span");
        const details = document.createElement("span");

        button.type = "button";
        button.className = "drive-file-card";
        if (file.mimeType === FOLDER_MIME_TYPE) button.classList.add("drive-folder-card");
        icon.className = "drive-file-icon";
        icon.textContent = type.icon;
        meta.className = "drive-file-meta";
        name.className = "drive-file-name";
        name.textContent = file.name;
        details.className = "drive-file-details";
        details.textContent = `${type.label} · ${formatModifiedTime(file.modifiedTime)}`;
        meta.append(name, details);
        button.append(icon, meta);
        button.addEventListener("click", () => {
            if (file.mimeType === FOLDER_MIME_TYPE) {
                folderPath.push({ id: file.id, name: file.name });
                searchInput.value = "";
                loadDriveFiles();
                return;
            }
            if (pickerMode === "image") {
                document.dispatchEvent(new CustomEvent("simplyBlocksDriveImageSelected", {
                    detail: file
                }));
                closePicker();
                return;
            }
            document.dispatchEvent(new CustomEvent("simplyBlocksDriveFileSelected", {
                detail: file
            }));
            closePicker();
        });
        fileList.append(button);
    });
}

async function loadDriveFiles() {
    refreshButton.disabled = true;
    fileList.replaceChildren();
    status.classList.remove("error");
    status.textContent = "Loading Your Drive Files...";

    try {
        const token = await getGoogleToken(true);
        const currentFolder = folderPath.at(-1);
        const escapedFolderId = currentFolder.id.replace(/'/g, "\\'");
        const params = new URLSearchParams({
            q: `trashed=false and '${escapedFolderId}' in parents`,
            spaces: "drive",
            orderBy: "modifiedTime desc",
            pageSize: "1000",
            fields: "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,iconLink,size,fileExtension,description,parents)"
        });
        const files = [];
        let pageToken = "";
        do {
            if (pageToken) params.set("pageToken", pageToken);
            const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error?.message || "Google Drive Could Not Be Loaded.");
            }
            files.push(...(data.files || []));
            pageToken = data.nextPageToken || "";
            status.textContent = `Loading Your Drive Files... ${files.length} Found`;
        } while (pageToken);

        currentItems = files.sort((first, second) => {
            const firstFolder = first.mimeType === FOLDER_MIME_TYPE;
            const secondFolder = second.mimeType === FOLDER_MIME_TYPE;
            if (firstFolder !== secondFolder) return firstFolder ? -1 : 1;
            return first.name.localeCompare(second.name, undefined, { numeric: true, sensitivity: "base" });
        });
        renderBreadcrumbs();
        renderFiles();
    } catch (error) {
        console.error("Google Drive files could not be loaded:", error);
        status.classList.add("error");
        status.textContent = error?.message || "Google Drive Could Not Be Loaded.";
    } finally {
        refreshButton.disabled = false;
    }
}

document.addEventListener("simplyBlocksOpenDrivePicker", (event) => {
    overlay.hidden = false;
    pickerMode = event.detail?.mode === "image" ? "image" : "file";
    document.querySelector("#drivePickerTitle").textContent = pickerMode === "image"
        ? "Select An Image From Drive"
        : "Select A Drive File";
    folderPath = [{ id: "root", name: "My Drive" }];
    searchInput.value = "";
    renderBreadcrumbs();
    loadDriveFiles();
});
closeButton.addEventListener("click", closePicker);
cancelButton.addEventListener("click", closePicker);
refreshButton.addEventListener("click", loadDriveFiles);
backButton.addEventListener("click", () => {
    if (folderPath.length <= 1) return;
    folderPath.pop();
    searchInput.value = "";
    loadDriveFiles();
});
searchInput.addEventListener("input", () => renderFiles());
overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closePicker();
});
