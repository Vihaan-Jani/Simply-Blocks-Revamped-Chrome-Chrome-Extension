chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({
        windowId: tab.windowId
    }).catch((error) => {
        console.error("Side panel could not be opened:", error);
    });
});

const WORKSPACE_PAGES = new Set([
    chrome.runtime.getURL("blockWorkspace.html"),
    chrome.runtime.getURL("liveEditor.html"),
    chrome.runtime.getURL("blockenvironment.html"),
    chrome.runtime.getURL("editorenvironment.html"),
    chrome.runtime.getURL("howto.html")
]);

const GROUP_TITLE = "Simply Blocks RC";
const BLOCK_ENVIRONMENT_URL = chrome.runtime.getURL("blockenvironment.html");
const groupingQueues = new Map();
const openSimplyBlocksPanels = new Set();
const eligibleShortcutTabs = new Set();
let shortcutGroupId = null;
const blockEnvironmentTabs = new Set();
let shortcutGroupCleanup = null;

async function deleteSimplyBlocksShortcutGroups() {
    if (shortcutGroupCleanup) return shortcutGroupCleanup;
    shortcutGroupCleanup = (async () => {
        const groups = await chrome.tabGroups.query({});
        const shortcutGroups = groups.filter((group) => group.title === "Simply Blocks" && group.color === "blue");
        const groupedTabs = (await Promise.all(shortcutGroups.map((group) => chrome.tabs.query({ groupId: group.id })))).flat();
        const tabIds = [...new Set(groupedTabs.map((tab) => tab.id).filter((id) => id != null))];
        if (tabIds.length) await chrome.tabs.remove(tabIds);
        openSimplyBlocksPanels.clear();
        eligibleShortcutTabs.clear();
        shortcutGroupId = null;
        await chrome.storage.local.remove("simplyBlocksGroup");
    })().finally(() => { shortcutGroupCleanup = null; });
    return shortcutGroupCleanup;
}

chrome.storage.local.get("simplyBlocksGroup").then((data) => {
    shortcutGroupId = data.simplyBlocksGroup ?? null;
});
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.simplyBlocksGroup) {
        shortcutGroupId = changes.simplyBlocksGroup.newValue ?? null;
    }
});

async function tabIsInShortcutGroup(tab) {
    if (!tab || tab.groupId == null || tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE || tab.groupId === -1) {
        return false;
    }
    try {
        const group = await chrome.tabGroups.get(tab.groupId);
        return group.title === "Simply Blocks" && group.color === "blue";
    } catch {
        return false;
    }
}

async function notifyShortcutGroupEligibility(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);
        const eligible = await tabIsInShortcutGroup(tab);
        if (eligible) {
            eligibleShortcutTabs.add(tabId);
            await chrome.sidePanel.setOptions({ tabId, path: "index.html", enabled: true });
        } else {
            eligibleShortcutTabs.delete(tabId);
        }
        await chrome.tabs.sendMessage(tabId, {
            type: "simplyBlocksShortcutGroupEligibility",
            eligible
        });
    } catch {
        // Some browser and extension pages cannot receive content-script messages.
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "simplyBlocksSignedOut") {
        deleteSimplyBlocksShortcutGroups()
            .then(() => sendResponse({ cleaned: true }))
            .catch((error) => sendResponse({ error: error.message }));
        return true;
    }
    if (message?.type === "simplyBlocksCheckShortcutGroup") {
        (async () => {
            const eligible = await tabIsInShortcutGroup(sender.tab);
            if (eligible && sender.tab?.id != null) {
                eligibleShortcutTabs.add(sender.tab.id);
                await chrome.sidePanel.setOptions({ tabId: sender.tab.id, path: "index.html", enabled: true });
            }
            sendResponse({ eligible });
        })().catch((error) => sendResponse({ eligible: false, error: error.message }));
        return true;
    }

    if (message?.type === "simplyBlocksTogglePageSidePanel" && sender.tab?.id != null) {
        const tabId = sender.tab.id;
        const eligible = eligibleShortcutTabs.has(tabId) || (shortcutGroupId != null && sender.tab.groupId === shortcutGroupId);
        if (!eligible) {
            sendResponse({ error: "This tab is not in the Simply Blocks group." });
            return;
        }
        if (openSimplyBlocksPanels.has(tabId)) {
            const closeOperation = chrome.sidePanel.close
                ? chrome.sidePanel.close({ tabId })
                : chrome.sidePanel.setOptions({ tabId, enabled: false });
            closeOperation.then(async () => {
                openSimplyBlocksPanels.delete(tabId);
                await chrome.sidePanel.setOptions({ tabId, path: "index.html", enabled: true });
                sendResponse({ open: false });
            }).catch((error) => sendResponse({ error: error.message }));
            return true;
        }

        // This call must happen synchronously inside the click message handler so
        // Chrome retains the originating user gesture.
        const openOperation = chrome.sidePanel.open({ tabId });
        openOperation.then(() => {
            openSimplyBlocksPanels.add(tabId);
            sendResponse({ open: true });
        }).catch((error) => sendResponse({ error: error.message }));
        return true;
    }
});

if (chrome.sidePanel.onOpened) {
    chrome.sidePanel.onOpened.addListener((info) => {
        if (info.tabId != null) openSimplyBlocksPanels.add(info.tabId);
    });
}
if (chrome.sidePanel.onClosed) {
    chrome.sidePanel.onClosed.addListener((info) => {
        if (info.tabId != null) openSimplyBlocksPanels.delete(info.tabId);
    });
}

function isWorkspacePage(url) {
    return WORKSPACE_PAGES.has(url);
}

async function addTabToWorkspaceGroup(tab) {
    if (
        tab?.id == null ||
        tab.windowId == null ||
        !isWorkspacePage(tab.url)
    ) {
        return;
    }

    const groups = await chrome.tabGroups.query({
        windowId: tab.windowId
    });
    const existingGroup = groups.find((group) => group.title === GROUP_TITLE);

    const groupId = existingGroup
        ? await chrome.tabs.group({
            groupId: existingGroup.id,
            tabIds: tab.id
        })
        : await chrome.tabs.group({
            tabIds: tab.id
        });

    await chrome.tabGroups.update(groupId, {
        title: GROUP_TITLE,
        color: "grey",
        collapsed: false
    });
}

function queueTabGrouping(tab) {
    if (tab?.windowId == null || !isWorkspacePage(tab.url)) {
        return;
    }

    const previous = groupingQueues.get(tab.windowId) || Promise.resolve();
    const next = previous
        .then(() => addTabToWorkspaceGroup(tab))
        .catch((error) => {
            console.error("Simply Blocks tab could not be grouped:", error);
        })
        .finally(() => {
            if (groupingQueues.get(tab.windowId) === next) {
                groupingQueues.delete(tab.windowId);
            }
        });

    groupingQueues.set(tab.windowId, next);
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const wasBlockEnvironment = blockEnvironmentTabs.has(tabId);
    if (tab.url === BLOCK_ENVIRONMENT_URL) blockEnvironmentTabs.add(tabId);
    else if (changeInfo.url && wasBlockEnvironment) {
        blockEnvironmentTabs.delete(tabId);
        deleteSimplyBlocksShortcutGroups().catch(console.error);
    }
    if (changeInfo.url || changeInfo.status === "complete") {
        queueTabGrouping(tab);
    }
    if (changeInfo.groupId !== undefined || changeInfo.status === "complete") {
        notifyShortcutGroupEligibility(tabId);
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    if (blockEnvironmentTabs.delete(tabId)) {
        deleteSimplyBlocksShortcutGroups().catch(console.error);
    }
    openSimplyBlocksPanels.delete(tabId);
    eligibleShortcutTabs.delete(tabId);
});

chrome.tabs.query({}).then((tabs) => {
    tabs.filter((tab) => tab.url === BLOCK_ENVIRONMENT_URL).forEach((tab) => blockEnvironmentTabs.add(tab.id));
});

async function groupOpenWorkspaceTabs() {
    const tabs = await chrome.tabs.query({});
    tabs.forEach(queueTabGrouping);
}

chrome.runtime.onInstalled.addListener(groupOpenWorkspaceTabs);
chrome.runtime.onStartup.addListener(groupOpenWorkspaceTabs);
groupOpenWorkspaceTabs().catch((error) => {
    console.error("Open Simply Blocks tabs could not be grouped:", error);
});
