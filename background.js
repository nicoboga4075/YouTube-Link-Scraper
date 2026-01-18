chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
	if (msg.command === "handcheck") {
		sendResponse({status: "ok", message: "Handcheck done"});
	}
    if (msg.command === "install") {
        chrome.runtime.sendNativeMessage(
            "com.example.ytdlp_installer",
            { command: "install" },
            (response) => {
                if (chrome.runtime.lastError) {
                    sendResponse({ status: "error", message: chrome.runtime.lastError.message });
                } else if (!response) {
                    sendResponse({ status: "error", message: "No response from host" });
                } else {
                    sendResponse({ status: "ok", data: response });
                }
            }
        );
    }
	return true;
});