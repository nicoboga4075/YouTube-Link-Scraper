chrome.runtime.sendMessage({ command: "handcheck" }, (response) => {
	if (response) {
		outputTerminal.value = "> Waiting for you.\n" 
		statusTerminal.textContent = `Status: Idle`;
	} else {
		outputTerminal.value = "> Handcheck failed.\n"
		statusTerminal.textContent = `Status: Error`;
	}
});

fetch(chrome.runtime.getURL("host.log"))
  .then(res => res.text())
  .then(text => {
    const lines = text.trim().split("\n");
    const last  = lines[lines.length - 1];
	alert(last);
});

async function runScraper() {
  try {
	  saveBtn.disabled = true;	
	  installBtn.disabled = true;
	  outputTerminal.value = "> Please wait...\n";
	  statusTerminal.textContent = `Status: Scanning`;
	  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	  if (!tab) throw new Error("No active tab found");
	  chrome.runtime.onMessage.addListener(function listener(msg, sender, sendResponse) {
		if (msg.type === "YT_SCRAPER_PROGRESS") {
		  statusTerminal.textContent = `Status: ${msg.count} videos detected...`;
		}
	  });
	  chrome.scripting.executeScript({
		target: { tabId: tab.id },
		func: async () => {
		  function cleanUrl(url) {
			try {
			  const u = new URL(url);
			  if (u.hostname.includes("youtu.be")) return `https://www.youtube.com/watch?v=${u.pathname.slice(1)}`;
			  const v = u.searchParams.get("v");
			  return v ? `https://www.youtube.com/watch?v=${v}` : null;
			} catch {
			  return null;
			}
		  }
		  return new Promise((resolve) => {
			try {
				let lastCount = 0;
				let sameCountTime = 0;
				const checkInterval = 500;
				const maxIdle = 4000;
				const step = () => {
				  try {
					  window.scrollBy(0, 3000);
					  const links = Array.from(document.querySelectorAll("a"))
						.map(a => cleanUrl(a.href))
						.filter(Boolean);
					  const uniqueLinks = [...new Set(links)];
					  chrome.runtime.sendMessage({ type: "YT_SCRAPER_PROGRESS", count: uniqueLinks.length });
					  if (uniqueLinks.length === lastCount) {
						sameCountTime += checkInterval;
					  } else {
						lastCount = uniqueLinks.length;
						sameCountTime = 0;
					  }
					  if (sameCountTime >= maxIdle) {
						resolve(uniqueLinks);
					  } else {
						setTimeout(step, checkInterval);
					  }
				  } catch (err) { reject(err); }
				};
				step();
			} catch (err) { reject(err); }
		  });
		}
	  }, (results) => {
		if (!results || !results[0]) {
			outputTerminal.value = "> " + chrome.runtime.lastError.message + "\n";
			statusTerminal.textContent = `Status: Error`;
			return;
		}
		const urls = results[0].result;
		outputTerminal.value = urls.join("\n");
		statusTerminal.textContent = `Status: ${urls.length} videos found`;
		saveBtn.disabled = urls.length === 0;
		installBtn.disabled = false;
	  });
	} catch (err) { 
		outputTerminal.value += "> " +  err.message + "\n";;
		statusTerminal.textContent = `Status: Error`; 
	}
}

scanBtn.addEventListener("click", runScraper);

saveBtn.addEventListener("click", () => {
  try {
	  const lines = outputTerminal.value.split("\n").filter(Boolean);
	  if (!lines.length || lines.length === 0) return;
	  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
	  const url = URL.createObjectURL(blob);
	  const a = document.createElement("a");
	  a.href = url;
	  a.download = "urls.txt";
	  a.click();
	  URL.revokeObjectURL(url);
  } catch (err){
	outputTerminal.value += "> " + err.message + "\n";
	statusTerminal.textContent = `Status: Error`;  
  }
});

installBtn.addEventListener("click", () => {
  saveBtn.disabled = true;
  outputTerminal.value = "";
  statusTerminal.textContent = `Status: Installation pending...`;
  const port = chrome.runtime.connectNative("com.example.ytdlp_installer");
  port.postMessage({ command: "install" });
  port.onMessage.addListener((msg) => {
    if (msg.message) {
		if (msg.message === "ALL_TOOLS_INSTALLED") {
			statusTerminal.textContent = `Status: Installation finished`;
            port.disconnect();
            return;
        }
        outputTerminal.value += "> " + msg.message + "\n";
        outputTerminal.scrollTop = outputTerminal.scrollHeight;
    }
  });
  port.onDisconnect.addListener(() => {
    if (chrome.runtime.lastError) {
        outputTerminal.value += "> " + chrome.runtime.lastError.message + "\n";
		statusTerminal.textContent = `Status: Error`;
    }
  });
});