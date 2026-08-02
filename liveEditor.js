const Status1 = document.getElementById("liveEditorStatus")
const editorCard = document.getElementById("liveEditorCard")
function setConnected(connected) {
    if (connected) {
        Status1.textContent = "Connected";
        Status1.classList.add("active");
    } else {
        Status1.textContent = "Disconnected";
        Status1.classList.remove("active");
    }
}
async function checkLiveEditor() {
    const workspaceURL = chrome.runtime.getURL("editorenvironment.html");
    const launchURL = chrome.runtime.getURL("liveEditor.html");

    const tabs1 = await chrome.tabs.query({});

    const workspace0 =
        tabs1.find((tab) => tab.url === workspaceURL) ??
        tabs1.find((tab) => tab.url === launchURL);

    if (workspace0) {
        setConnected(true);
        return workspace0;
    }

    setConnected(false);
    return null;
}
editorCard.addEventListener('click', async () => {
    const workspace1 = await checkLiveEditor();

    if (workspace1) {

        await chrome.windows.update(workspace1.windowId, {
            focused: true
        });

        await chrome.tabs.update(workspace1.id, {
            active: true
        });

        return;
    }

    await chrome.tabs.create({
        url: chrome.runtime.getURL("liveEditor.html"),
        active: true
    });

    setConnected(true);
});

chrome.tabs.onRemoved.addListener(() => {
    checkLiveEditor();
});


chrome.tabs.onUpdated.addListener(() => {
    checkLiveEditor();
});


chrome.tabs.onCreated.addListener(() => {
    checkLiveEditor();
});


checkLiveEditor();
