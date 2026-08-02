const Status = document.getElementById("blockWorkspaceStatus")
const blockCard = document.getElementById("BlockCard")
function setConnectivity(connected) {
    if (connected) {
        Status.textContent = "Connected";
        Status.classList.add("active");
    } else {
        Status.textContent = "Disconnected";
        Status.classList.remove("active");
    }
}
async function checkBlockWorkspace() {
    const workspaceURL = chrome.runtime.getURL("blockenvironment.html");
    const launchURL = chrome.runtime.getURL("blockWorkspace.html");

    const tabs = await chrome.tabs.query({});

    const workspace =
        tabs.find((tab) => tab.url === workspaceURL) ??
        tabs.find((tab) => tab.url === launchURL);

    if (workspace) {
        setConnectivity(true);
        return workspace;
    }

    setConnectivity(false);
    return null;
}
blockCard.addEventListener('click', async () => {
    const workspace = await checkBlockWorkspace();

    if (workspace) {

        await chrome.windows.update(workspace.windowId, {
            focused: true
        });

        await chrome.tabs.update(workspace.id, {
            active: true
        });

        return;
    }

    await chrome.tabs.create({
        url: chrome.runtime.getURL("blockWorkspace.html"),
        active: true
    });

    setConnectivity(true);
});

chrome.tabs.onRemoved.addListener(() => {
    checkBlockWorkspace();
});


chrome.tabs.onUpdated.addListener(() => {
    checkBlockWorkspace();
});


chrome.tabs.onCreated.addListener(() => {
    checkBlockWorkspace();
});


checkBlockWorkspace();
