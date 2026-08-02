const blockLaunchButton = document.getElementById("blockBeginCard");
let blockLaunchInProgress = false;

blockLaunchButton.addEventListener("click", async () => {
    if (blockLaunchInProgress) {
        return;
    }

    blockLaunchInProgress = true;

    try {
        const blockUrl = chrome.runtime.getURL("blockenvironment.html");
        const tabs = await chrome.tabs.query({});
        const existingBlockEnvironment = tabs.find(
            (tab) => tab.url === blockUrl
        );

        if (existingBlockEnvironment) {
            await chrome.windows.update(existingBlockEnvironment.windowId, {
                focused: true
            });
            await chrome.tabs.update(existingBlockEnvironment.id, {
                active: true
            });
            return;
        }

        await chrome.tabs.create({
            url: blockUrl,
            active: true
        });
    } catch (error) {
        console.error("Block environment could not be opened:", error);
    } finally {
        blockLaunchInProgress = false;
    }
});
