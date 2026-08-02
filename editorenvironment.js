const editorBeginCard = document.getElementById("editorBeginCard");
let editorLaunchInProgress = false;

editorBeginCard.addEventListener("click", async () => {
    if (editorLaunchInProgress) {
        return;
    }

    editorLaunchInProgress = true;

    try {
        const editorUrl = chrome.runtime.getURL("editorenvironment.html");
        const tabs = await chrome.tabs.query({});
        const existingEditor = tabs.find((tab) => tab.url === editorUrl);

        if (existingEditor) {
            await chrome.windows.update(existingEditor.windowId, {
                focused: true
            });
            await chrome.tabs.update(existingEditor.id, {
                active: true
            });
            return;
        }

        await chrome.tabs.create({
            url: editorUrl,
            active: true
        });
    } catch (error) {
        console.error("Editor environment could not be opened:", error);
    } finally {
        editorLaunchInProgress = false;
    }
});
