function initializeNewTab() {
  const TEXT_COLOR_STORAGE_KEY = "textGradientColor";
  const BACKGROUND_COLOR_STORAGE_KEY = "middleBackgroundColor";
  const GLOW_START_STORAGE_KEY = "glowStartColor";
  const GLOW_END_STORAGE_KEY = "glowEndColor";
  const SHORTCUTS_STORAGE_KEY = "newTabShortcuts";
  const customize = document.querySelector(".customize");
  const sidePanel = document.querySelector(".side-panel");
  const newTabSidePanelToggle = document.querySelector("#newTabSidePanelToggle");
  const newTabFullscreenToggle = document.querySelector("#newTabFullscreenToggle");
  const redInput = document.querySelector("#red-value");
  const greenInput = document.querySelector("#green-value");
  const blueInput = document.querySelector("#blue-value");
  const redOutput = document.querySelector("#red-output");
  const greenOutput = document.querySelector("#green-output");
  const blueOutput = document.querySelector("#blue-output");
  const middleColorValue = document.querySelector("#middle-color-value");
  const middleColorPreview = document.querySelector("#middle-color-preview");

  const initializeFullscreenToggle = async () => {
    if (!newTabFullscreenToggle) return;
    let restoreWindowState = "normal";
    const updateState = async () => {
      const currentWindow = await chrome.windows.getCurrent();
      const fullscreen = currentWindow.state === "fullscreen" || Boolean(document.fullscreenElement);
      newTabFullscreenToggle.setAttribute("aria-pressed", String(fullscreen));
      newTabFullscreenToggle.title = fullscreen ? "Exit Full-Screen" : "Enter Full-Screen";
    };
    newTabFullscreenToggle.addEventListener("click", async () => {
      newTabFullscreenToggle.disabled = true;
      try {
        const currentWindow = await chrome.windows.getCurrent();
        if (currentWindow.state === "fullscreen") {
          await chrome.windows.update(currentWindow.id, { state: restoreWindowState });
        } else if (document.fullscreenElement) {
          await document.exitFullscreen();
        } else {
          restoreWindowState = currentWindow.state === "maximized" ? "maximized" : "normal";
          await chrome.windows.update(currentWindow.id, { state: "fullscreen" });
        }
      } catch (error) {
        console.error("New Tab fullscreen mode could not be toggled:", error);
      } finally {
        newTabFullscreenToggle.disabled = false;
        await updateState().catch(console.error);
      }
    });
    chrome.windows.onBoundsChanged.addListener(() => updateState().catch(console.error));
    document.addEventListener("fullscreenchange", () => updateState().catch(console.error));
    await updateState();
  };

  initializeFullscreenToggle().catch((error) => {
    console.error("New Tab fullscreen toggle could not be initialized:", error);
  });

  const initializeFullscreenSidePanel = async () => {
    if (!newTabSidePanelToggle || !chrome.sidePanel) return;
    const currentTab = await chrome.tabs.getCurrent();
    const currentWindow = await chrome.windows.getCurrent();
    if (currentTab?.id == null || currentWindow?.id == null) return;
    let panelOpen = false;
    let fullscreenActive = false;

    await chrome.sidePanel.setOptions({ tabId: currentTab.id, path: "index.html", enabled: true });

    const closeSidePanel = async () => {
      if (chrome.sidePanel.close) {
        await Promise.allSettled([
          chrome.sidePanel.close({ tabId: currentTab.id }),
          chrome.sidePanel.close({ windowId: currentWindow.id })
        ]);
      } else {
        await chrome.sidePanel.setOptions({ tabId: currentTab.id, enabled: false });
        await chrome.sidePanel.setOptions({ tabId: currentTab.id, path: "index.html", enabled: true });
      }
      panelOpen = false;
      newTabSidePanelToggle.setAttribute("aria-pressed", "false");
    };

    const updateFullscreenState = async () => {
      const windowState = await chrome.windows.getCurrent();
      const isFullscreen = windowState.state === "fullscreen" || Boolean(document.fullscreenElement);
      const enteringFullscreen = isFullscreen && !fullscreenActive;
      fullscreenActive = isFullscreen;
      if (enteringFullscreen) await closeSidePanel();
      newTabSidePanelToggle.hidden = !isFullscreen;
      newTabSidePanelToggle.disabled = !isFullscreen;
    };

    newTabSidePanelToggle.addEventListener("click", () => {
      if (!fullscreenActive) return;
      newTabSidePanelToggle.disabled = true;
      if (panelOpen) {
        const operation = chrome.sidePanel.close
          ? chrome.sidePanel.close({ tabId: currentTab.id })
          : chrome.sidePanel.setOptions({ tabId: currentTab.id, enabled: false });
        operation.then(async () => {
          panelOpen = false;
          newTabSidePanelToggle.setAttribute("aria-pressed", "false");
          await chrome.sidePanel.setOptions({ tabId: currentTab.id, path: "index.html", enabled: true });
        }).finally(() => { newTabSidePanelToggle.disabled = false; });
        return;
      }
      const operation = chrome.sidePanel.open({ tabId: currentTab.id });
      operation.then(() => {
        panelOpen = true;
        newTabSidePanelToggle.setAttribute("aria-pressed", "true");
      }).catch((error) => console.error("Simply Blocks side panel could not be opened:", error))
        .finally(() => { newTabSidePanelToggle.disabled = false; });
    });

    if (chrome.sidePanel.onOpened) chrome.sidePanel.onOpened.addListener((info) => {
      if (info.tabId === currentTab.id) {
        panelOpen = true;
        newTabSidePanelToggle.setAttribute("aria-pressed", "true");
      }
    });
    if (chrome.sidePanel.onClosed) chrome.sidePanel.onClosed.addListener((info) => {
      if (info.tabId === currentTab.id) {
        panelOpen = false;
        newTabSidePanelToggle.setAttribute("aria-pressed", "false");
      }
    });
    chrome.windows.onBoundsChanged.addListener(() => updateFullscreenState().catch(console.error));
    document.addEventListener("fullscreenchange", () => updateFullscreenState().catch(console.error));
    await updateFullscreenState();
  };

  initializeFullscreenSidePanel().catch((error) => {
    console.error("New Tab fullscreen side panel controls could not be initialized:", error);
  });

  const initializeTabs = () => {
    const tabs = [...document.querySelectorAll(".panel-tab")];
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((candidate) => {
          const selected = candidate === tab;
          candidate.classList.toggle("active", selected);
          candidate.setAttribute("aria-selected", String(selected));
          const panel = document.querySelector(`#${candidate.getAttribute("aria-controls")}`);
          panel.classList.toggle("active", selected);
          panel.hidden = !selected;
        });
      });
    });
  };

  const initializeShortcuts = async () => {
    const grid = document.querySelector("#shortcut-grid");
    const panelList = document.querySelector("#panel-shortcut-list");
    const dialog = document.querySelector("#shortcut-dialog");
    const form = document.querySelector("#shortcut-form");
    const title = document.querySelector("#shortcut-dialog-title");
    const nameInput = document.querySelector("#shortcut-name");
    const urlInput = document.querySelector("#shortcut-url");
    const fields = document.querySelector("#shortcut-fields");
    const pickerWrap = document.querySelector("#shortcut-picker-wrap");
    const picker = document.querySelector("#shortcut-picker");
    const errorOutput = document.querySelector("#shortcut-error");
    const submitButton = document.querySelector("#shortcut-submit");
    const managementButtons = [...document.querySelectorAll('[data-shortcut-action="remove"], [data-shortcut-action="edit"]')];
    let shortcuts = [];
    let mode = "add";

    const readShortcuts = async () => {
      try {
        const stored = await chrome.storage.local.get(SHORTCUTS_STORAGE_KEY);
        return Array.isArray(stored[SHORTCUTS_STORAGE_KEY]) ? stored[SHORTCUTS_STORAGE_KEY] : [];
      } catch (error) {
        console.warn("Shortcuts could not be loaded:", error);
        return [];
      }
    };

    const saveShortcuts = async () => {
      await chrome.storage.local.set({ [SHORTCUTS_STORAGE_KEY]: shortcuts });
    };

    const makeIcon = (shortcut) => {
      const icon = document.createElement("span");
      icon.className = "shortcut-icon";
      const fallback = document.createElement("img");
      fallback.className = "shortcut-icon-fallback";
      fallback.src = "sbrc128.png";
      fallback.alt = "";
      icon.append(fallback);
      const favicon = document.createElement("img");
      favicon.className = "shortcut-site-icon";
      favicon.alt = "";
      favicon.src = chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(shortcut.url)}&size=32`);
      favicon.addEventListener("error", () => favicon.remove(), { once: true });
      icon.append(favicon);
      return icon;
    };

    const render = () => {
      grid.replaceChildren();
      panelList.replaceChildren();

      shortcuts.forEach((shortcut) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "shortcut-item";
        button.title = shortcut.url;
        button.append(makeIcon(shortcut));
        const label = document.createElement("span");
        label.className = "shortcut-name";
        label.textContent = shortcut.name;
        button.append(label);
        button.addEventListener("click", () => window.location.assign(shortcut.url));
        grid.append(button);

        const chip = document.createElement("div");
        chip.className = "panel-shortcut-chip";
        chip.append(makeIcon(shortcut), document.createTextNode(shortcut.name));
        panelList.append(chip);
      });

      if (!shortcuts.length) {
        const empty = document.createElement("p");
        empty.className = "empty-shortcuts";
        empty.textContent = "No shortcuts yet.";
        panelList.append(empty);
      }
      managementButtons.forEach((button) => { button.disabled = !shortcuts.length; });
    };

    const normalizeUrl = (value) => {
      const candidate = value.trim();
      if (!candidate) throw new Error("Enter a link for this shortcut.");
      const hasWebProtocol = /^https?:\/\//i.test(candidate);
      const url = new URL(hasWebProtocol ? candidate : `https://${candidate}`);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Use an http or https link.");
      return url.href;
    };

    const populatePicker = () => {
      picker.replaceChildren();
      shortcuts.forEach((shortcut) => {
        const option = document.createElement("option");
        option.value = shortcut.id;
        option.textContent = `${shortcut.name} - ${shortcut.url}`;
        picker.append(option);
      });
    };

    const loadSelectedShortcut = () => {
      const shortcut = shortcuts.find((item) => item.id === picker.value);
      if (shortcut && mode === "edit") {
        nameInput.value = shortcut.name;
        urlInput.value = shortcut.url;
      }
    };

    const openDialog = (nextMode) => {
      mode = nextMode;
      form.reset();
      errorOutput.textContent = "";
      const isAdd = mode === "add";
      fields.hidden = mode === "remove";
      nameInput.disabled = mode === "remove";
      urlInput.disabled = mode === "remove";
      pickerWrap.hidden = isAdd;
      title.textContent = `${mode.charAt(0).toUpperCase()}${mode.slice(1)} shortcut`;
      submitButton.textContent = title.textContent;
      submitButton.classList.toggle("danger-button", mode === "remove");
      if (!isAdd) {
        populatePicker();
        loadSelectedShortcut();
      }
      dialog.showModal();
      (isAdd ? nameInput : picker).focus();
    };

    document.querySelectorAll("[data-shortcut-action]").forEach((button) => {
      button.addEventListener("click", () => openDialog(button.dataset.shortcutAction));
    });
    picker.addEventListener("change", loadSelectedShortcut);
    document.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
    document.querySelector("[data-dialog-cancel]").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        if (mode === "remove") {
          shortcuts = shortcuts.filter((shortcut) => shortcut.id !== picker.value);
        } else {
          const name = nameInput.value.trim();
          if (!name) throw new Error("Enter a name for this shortcut.");
          const shortcut = { name, url: normalizeUrl(urlInput.value) };
          if (mode === "add") {
            shortcut.id = crypto.randomUUID();
            shortcuts.push(shortcut);
          } else {
            const index = shortcuts.findIndex((item) => item.id === picker.value);
            shortcuts[index] = { ...shortcuts[index], ...shortcut };
          }
        }
        await saveShortcuts();
        render();
        dialog.close();
      } catch (error) {
        errorOutput.textContent = error.message || "The shortcut could not be saved.";
      }
    });

    shortcuts = await readShortcuts();
    render();
  };

  const initializeGoogleHowToButton = async () => {
    const button = document.querySelector("#google-howto-button");
    if (!button) return;

    try {
      const { googleUser } = await chrome.storage.local.get("googleUser");
      let signedIn = false;
      if (googleUser?.signedIn) {
        try {
          const tokenResult = await chrome.identity.getAuthToken({ interactive: false });
          signedIn = Boolean(typeof tokenResult === "string" ? tokenResult : tokenResult?.token);
        } catch {
          signedIn = false;
        }
      }
      button.hidden = signedIn;
    } catch (error) {
      button.hidden = false;
      console.warn("Google sign-in state could not be checked:", error);
    }

    button.addEventListener("click", () => {
      window.location.assign("howto.html");
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local" && changes.googleUser) {
        button.hidden = Boolean(changes.googleUser.newValue?.signedIn);
      }
    });
  };

  if (!customize || !sidePanel) return;

  initializeTabs();
  initializeShortcuts();
  initializeGoogleHowToButton();

  customize.addEventListener("click",  () => {
    sidePanel.classList.toggle("expanded");
  });

  document.addEventListener("click", (event) => {
    const clickedInsidePanel = sidePanel.contains(event.target);
    const clickedCustomizeButton = customize.contains(event.target);
    const clickedInsideDialog = document.querySelector("#shortcut-dialog").contains(event.target);

    if (
      sidePanel.classList.contains("expanded") &&
      !clickedInsidePanel &&
      !clickedCustomizeButton &&
      !clickedInsideDialog
    ) {
      sidePanel.classList.remove("expanded");
    }
  });

  const colorInputs = [redInput, greenInput, blueInput];
  const channelOutputs = [redOutput, greenOutput, blueOutput];

  const applyBackgroundColor = (values, save = false) => {
    const color = `rgb(${values.join(", ")})`;

    document.body.style.setProperty("--middle-background-color", color);
    middleColorPreview.style.background = color;
    middleColorValue.textContent = color;
    channelOutputs.forEach((output, index) => {
      output.textContent = values[index];
    });

    if (save) {
      localStorage.setItem(
        BACKGROUND_COLOR_STORAGE_KEY,
        JSON.stringify(values)
      );
      chrome.storage.local.set({
        middleBackgroundColor: values,
        websiteMiddleBackgroundColor: values
      }).catch((error) => {
        console.warn("Background color could not be synced:", error);
      });
    }
  };

  try {
    const savedBackgroundValues = JSON.parse(
      localStorage.getItem(BACKGROUND_COLOR_STORAGE_KEY)
    );

    if (
      Array.isArray(savedBackgroundValues) &&
      savedBackgroundValues.length === 3
    ) {
      colorInputs.forEach((input, index) => {
        input.value = savedBackgroundValues[index];
      });
      applyBackgroundColor(savedBackgroundValues);
      chrome.storage.local.set({
        middleBackgroundColor: savedBackgroundValues,
        websiteMiddleBackgroundColor: savedBackgroundValues
      }).catch((error) => {
        console.warn("Background color could not be synced:", error);
      });
    }
  } catch (error) {
    console.warn("Saved background color could not be loaded:", error);
  }

  colorInputs.forEach((input) => {
    input?.addEventListener("input", () => {
      const values = colorInputs.map((colorInput) => {
        const value = Number(colorInput.value);
        return Math.min(255, Math.max(0, Number.isFinite(value) ? value : 0));
      });
      applyBackgroundColor(values, true);
    });
  });

  const connectColorControls = (prefix, cssVariable, storageKey) => {
    const inputs = ["red", "green", "blue"].map((channel) =>
      document.querySelector(`#${prefix}-${channel}`)
    );
    const outputs = ["red", "green", "blue"].map((channel) =>
      document.querySelector(`#${prefix}-${channel}-output`)
    );
    const colorOutput = document.querySelector(`#${prefix}-value`);
    const preview = document.querySelector(`#${prefix}-preview`);

    const applyColor = (values, save = false) => {
      const color = `rgb(${values.join(", ")})`;

      document.body.style.setProperty(cssVariable, color);
      preview.style.background = color;
      colorOutput.textContent = color;
      outputs.forEach((output, index) => {
        output.textContent = values[index];
      });

      if (save && storageKey) {
        localStorage.setItem(storageKey, JSON.stringify(values));
      }
    };

    if (storageKey) {
      try {
        const values = JSON.parse(localStorage.getItem(storageKey));

        if (Array.isArray(values) && values.length === 3) {
          inputs.forEach((input, index) => {
            input.value = values[index];
          });
          applyColor(values);
        }
      } catch (error) {
        console.warn("Saved text color could not be loaded:", error);
      }
    }

    inputs.forEach((input) => {
      input?.addEventListener("input", () => {
        const values = inputs.map((channelInput) => Number(channelInput.value));
        applyColor(values, true);
      });
    });
  };

  connectColorControls(
    "glow-start",
    "--glow-start-color",
    GLOW_START_STORAGE_KEY
  );
  connectColorControls(
    "glow-end",
    "--glow-end-color",
    GLOW_END_STORAGE_KEY
  );
  connectColorControls(
    "text-gradient",
    "--text-gradient-color",
    TEXT_COLOR_STORAGE_KEY
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeNewTab, { once: true });
} else {
  initializeNewTab();
}
