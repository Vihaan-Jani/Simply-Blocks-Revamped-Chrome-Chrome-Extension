import { getCurrentUser } from "./auth.js";

const BACKGROUND_COLOR_STORAGE_KEY = "middleBackgroundColor";
const LEGACY_BACKGROUND_COLOR_STORAGE_KEY = "websiteMiddleBackgroundColor";
const DEFAULT_BACKGROUND_COLOR = [34, 10, 56];

function normalizeColor(value) {
    if (!Array.isArray(value) || value.length !== 3) {
        return DEFAULT_BACKGROUND_COLOR;
    }

    return value.map((channel) => {
        const number = Number(channel);
        return Math.min(255, Math.max(0, Number.isFinite(number) ? number : 0));
    });
}

function applyBackgroundColor(value) {
    const channels = normalizeColor(value);

    document.body.style.setProperty(
        "--middle-background-color",
        `rgb(${channels.join(", ")})`
    );
}

async function addWorkspacePanel() {
    const panel = document.createElement("aside");
    const panelContent = document.createElement("div");
    const trigger = document.createElement("button");
    const profileCard = document.createElement("button");
    const profileCardImage = document.createElement("img");
    const profileCardText = document.createElement("span");
    const profileCardTitle = document.createElement("span");
    const profileCardDescription = document.createElement("span");
    const driveCard = document.createElement("button");
    const driveIcon = document.createElement("span");
    const driveText = document.createElement("span");
    const driveTitle = document.createElement("span");
    const driveDescription = document.createElement("span");
    const sidebarScroll = document.createElement("div");

    panel.className = "side-panel";
    panel.setAttribute("aria-label", "Workspace panel");

    panelContent.className = "panel-content workspace-panel-content";

    sidebarScroll.className = "workspace-sidebar-scroll";
    sidebarScroll.setAttribute("aria-label", "Editor actions");

    profileCard.className = "workspace-profile-card";
    profileCard.type = "button";
    profileCard.title = "Your Profile";
    profileCard.setAttribute("aria-label", "Your Profile");
    profileCardImage.className = "workspace-profile-card-image";
    profileCardImage.src = "sbrc48.png";
    profileCardImage.alt = "";
    profileCardText.className = "workspace-profile-card-text";
    profileCardTitle.className = "workspace-profile-card-title";
    profileCardTitle.textContent = "Your Profile";
    profileCardDescription.className = "workspace-profile-card-description";
    profileCardDescription.textContent = "View account information and settings";
    profileCardText.append(profileCardTitle, profileCardDescription);
    profileCard.append(profileCardImage, profileCardText);

    driveCard.className = "workspace-action-card workspace-drive-picker-card";
    driveCard.type = "button";
    driveCard.title = "Open From Google Drive";
    driveIcon.className = "workspace-action-icon";
    driveIcon.textContent = "G";
    driveText.className = "workspace-action-text";
    driveTitle.className = "workspace-action-title";
    driveTitle.textContent = "Open From Google Drive";
    driveDescription.className = "workspace-action-description";
    driveDescription.textContent = "Select A Docs, Sheets, Slides, Or PDF File";
    driveText.append(driveTitle, driveDescription);
    driveCard.append(driveIcon, driveText);

    panelContent.append(profileCard);
    panel.append(panelContent);

    trigger.className = "customize workspace-profile-trigger";
    trigger.type = "button";
    trigger.dataset.tooltip = "Workspace panel";
    trigger.setAttribute("aria-label", "Open workspace panel");
    trigger.setAttribute("aria-expanded", "false");

    for (let index = 0; index < 3; index += 1) {
        trigger.append(document.createElement("span"));
    }

    sidebarScroll.append(profileCard, driveCard);
    document.body.append(panel, trigger, sidebarScroll);
    document.dispatchEvent(new CustomEvent("simplyBlocksWorkspacePanelReady"));

    function showPanel(expanded) {
        panel.classList.toggle("expanded", expanded);
        trigger.setAttribute("aria-expanded", String(expanded));
    }

    trigger.addEventListener("click", (event) => {
        event.stopPropagation();
        showPanel(!panel.classList.contains("expanded"));
    });

    document.addEventListener("click", (event) => {
        if (
            panel.classList.contains("expanded") &&
            !panel.contains(event.target)
        ) {
            showPanel(false);
        }
    });

    profileCard.addEventListener("click", async () => {
        profileCard.disabled = true;

        try {
            const [currentTab, currentWindow] = await Promise.all([
                chrome.tabs.getCurrent(),
                chrome.windows.getCurrent()
            ]);

            if (currentTab?.id == null || currentWindow?.id == null) {
                throw new Error(
                    "The current tab or window could not be identified."
                );
            }

            await chrome.runtime.sendMessage({
                type: "simplyBlocksShowProfile"
            }).catch(() => null);

            await chrome.sidePanel.setOptions({
                path: "profile.html",
                enabled: true
            });
            await chrome.sidePanel.open({
                windowId: currentWindow.id
            });
            document.dispatchEvent(
                new CustomEvent("simplyBlocksProfileSidePanelOpened", {
                    detail: {
                        windowId: currentWindow.id
                    }
                })
            );
            showPanel(false);
        } catch (error) {
            console.error("The profile side panel could not be opened:", error);
        } finally {
            profileCard.disabled = false;
        }
    });

    driveCard.addEventListener("click", () => {
        document.dispatchEvent(new CustomEvent("simplyBlocksOpenDrivePicker"));
    });

    try {
        const user = await getCurrentUser();

        if (user?.picture) {
            profileCardImage.src = user.picture;
        }
    } catch (error) {
        console.warn("The workspace profile image could not be loaded:", error);
    }
}

chrome.storage.local
    .get({
        [BACKGROUND_COLOR_STORAGE_KEY]: null,
        [LEGACY_BACKGROUND_COLOR_STORAGE_KEY]: DEFAULT_BACKGROUND_COLOR
    })
    .then((settings) => {
        applyBackgroundColor(
            settings[BACKGROUND_COLOR_STORAGE_KEY] ??
            settings[LEGACY_BACKGROUND_COLOR_STORAGE_KEY]
        );
    })
    .catch((error) => {
        console.warn("The workspace background color could not be loaded:", error);
        applyBackgroundColor(DEFAULT_BACKGROUND_COLOR);
    });

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (
        areaName === "local" &&
        changes[BACKGROUND_COLOR_STORAGE_KEY]
    ) {
        applyBackgroundColor(changes[BACKGROUND_COLOR_STORAGE_KEY].newValue);
    }
});

addWorkspacePanel().catch((error) => {
    console.error("Workspace panel could not be loaded:", error);
});
