import { getCurrentUser, signOut } from "./auth.js";

const COLOR_PREFERENCES = [
    ["middleBackgroundColor", [34, 10, 56], "backgroundColorSwatch", "backgroundColorValue"],
    ["glowStartColor", [115, 0, 255], "glowStartSwatch", "glowStartValue"],
    ["glowEndColor", [255, 0, 255], "glowEndSwatch", "glowEndValue"],
    ["textGradientColor", [129, 140, 248], "textColorSwatch", "textColorValue"]
];

const SCOPE_NAMES = {
    openid: "Confirms your Google identity",
    email: "Views your Email Address",
    profile: "Views your basic Profile Information (Profile Image Specifically)",
    "https://www.googleapis.com/auth/drive.file":
        "Can Access Google Drive Files created or opened through Simply Blocks"
};

const WEBSITE_STYLES_STORAGE_KEY = "websiteStylesEnabled";
const WEBSITE_BACKGROUND_STORAGE_KEY = "websiteMiddleBackgroundColor";
const WORKSPACE_GROUP_TITLE = "Simply Blocks RC";

function readColor(storageKey, defaultValue) {
    try {
        const savedValue = JSON.parse(localStorage.getItem(storageKey));

        if (!Array.isArray(savedValue) || savedValue.length !== 3) {
            return defaultValue;
        }

        return savedValue.map((channel) => {
            const number = Number(channel);
            return Math.min(
                255,
                Math.max(0, Number.isFinite(number) ? number : 0)
            );
        });
    } catch {
        return defaultValue;
    }
}

function showColorPreferences() {
    COLOR_PREFERENCES.forEach(
        ([storageKey, defaultValue, swatchId, valueId]) => {
            const channels = readColor(storageKey, defaultValue);
            const color = `rgb(${channels.join(", ")})`;

            document.getElementById(swatchId).style.background = color;
            document.getElementById(valueId).textContent = color;

            if (storageKey === "middleBackgroundColor") {
                chrome.storage.local
                    .set({
                        middleBackgroundColor: channels,
                        [WEBSITE_BACKGROUND_STORAGE_KEY]: channels
                    })
                    .catch((error) => {
                        console.error(
                            "Website background color could not be synced:",
                            error
                        );
                    });
            }
        }
    );
}

async function showUserProfile() {
    const user = await getCurrentUser();

    if (!user) {
        return;
    }

    document.getElementById("profileName").textContent =
        user.name || user.firstName || "Simply Blocks User";
    document.getElementById("profileEmail").textContent =
        user.email || "No email available";

    const image = document.getElementById("profileImage");

    if (user.picture) {
        image.src = user.picture;
        image.alt = `${user.name || "User"} profile picture`;
    }
}

showColorPreferences();

const websiteStylesToggle = document.getElementById("websiteStylesToggle");
const websiteStylesStatus = document.getElementById("websiteStylesStatus");

function showWebsiteStylesStatus(enabled) {
    websiteStylesToggle.checked = enabled;
    websiteStylesStatus.textContent = enabled
        ? "Custom Styling Enabled"
        : "Disabled - Using Website's Own Style";
}

chrome.storage.local
    .get({
        [WEBSITE_STYLES_STORAGE_KEY]: true
    })
    .then((settings) => {
        showWebsiteStylesStatus(settings[WEBSITE_STYLES_STORAGE_KEY] !== false);
    })
    .catch((error) => {
        console.error("Website style preference could not be loaded:", error);
        showWebsiteStylesStatus(true);
    });

websiteStylesToggle.addEventListener("change", async () => {
    const enabled = websiteStylesToggle.checked;
    showWebsiteStylesStatus(enabled);

    try {
        await chrome.storage.local.set({
            [WEBSITE_STYLES_STORAGE_KEY]: enabled
        });
    } catch (error) {
        console.error("Website style preference could not be saved:", error);
        showWebsiteStylesStatus(!enabled);
    }
});

const accountAccessCard = document.getElementById("accountAccessCard");
const accountAccessDetails = document.getElementById("accountAccessDetails");
const scopeList = document.getElementById("scopeList");
const scopes = chrome.runtime.getManifest().oauth2?.scopes || [];

scopes.forEach((scope) => {
    const item = document.createElement("li");
    const name = document.createElement("span");
    const value = document.createElement("span");

    item.className = "scope-item";
    name.className = "scope-name";
    value.className = "scope-value";
    name.textContent = SCOPE_NAMES[scope] || "Google account permission";
    value.textContent = scope;
    item.append(name, value);
    scopeList.append(item);
});

accountAccessCard.addEventListener("click", () => {
    const expanded = accountAccessCard.getAttribute("aria-expanded") === "true";

    accountAccessCard.setAttribute("aria-expanded", String(!expanded));
    accountAccessDetails.hidden = expanded;
});

document.getElementById("backToMainMenu").addEventListener("click", () => {
    window.location.replace("index.html");
});

const signOutButton = document.getElementById("signOutButton");
const signOutStatus = document.getElementById("signOutStatus");

async function removeWorkspaceTabGroups() {
    const groups = await chrome.tabGroups.query({});
    const workspaceGroups = groups.filter(
        (group) => group.title === WORKSPACE_GROUP_TITLE
    );

    await Promise.all(
        workspaceGroups.map(async (group) => {
            const tabs = await chrome.tabs.query({ groupId: group.id });
            const tabIds = tabs
                .map((tab) => tab.id)
                .filter((tabId) => tabId != null);

            if (tabIds.length > 0) {
                await chrome.tabs.remove(tabIds);
            }
        })
    );
}

signOutButton.addEventListener("click", async () => {
    signOutButton.disabled = true;
    signOutStatus.textContent = "Signing out...";

    try {
        await signOut();

        try {
            await removeWorkspaceTabGroups();
        } catch (error) {
            console.error("Workspace tab groups could not be removed:", error);
        }

        window.location.replace("notSignedIn.html");
    } catch (error) {
        console.error("Sign-out failed:", error);
        signOutStatus.textContent = "Sign-out failed. Click to try again.";
        signOutButton.disabled = false;
    }
});

showUserProfile().catch((error) => {
    console.error("Profile information could not be loaded:", error);
    document.getElementById("profileEmail").textContent =
        "Account information unavailable";
});
