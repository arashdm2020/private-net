const BACKEND_API_BASE = "/api";
const WATCHED_ADDRESS = "TFP84nTasN6G3M7SxX1XmRUP5wrX2ZeoYt";
const ACCOUNT_REF = "test_account_001";
const TARGET_NETWORK_LABEL = "MyChain Testnet";
const EXPECTED_ENDPOINT = "https://nile.trongrid.io";
const NILE_CHAIN_ID_HEX = "0xcd8690dc";
const MYCHAIN_PARAMS = {
  chainId: NILE_CHAIN_ID_HEX,
  chainName: "MyChain",
  nativeCurrency: {
    name: "TRX",
    symbol: "TRX",
    decimals: 6,
  },
  rpcUrls: [EXPECTED_ENDPOINT],
  blockExplorerUrls: ["https://nile.tronscan.org"],
};

let selectedAddress = null;
let lastProviderState = {};
let lastConnectionError = null;
let latestBackend = {};

const el = {
  connectButton: document.getElementById("connectButton"),
  networkButton: document.getElementById("networkButton"),
  refreshButton: document.getElementById("refreshButton"),
  copyFullNodeButton: document.getElementById("copyFullNodeButton"),
  copyAllConfigButton: document.getElementById("copyAllConfigButton"),
  trySwitchButton: document.getElementById("trySwitchButton"),
  tronLinkStatus: document.getElementById("tronLinkStatus"),
  walletStatus: document.getElementById("walletStatus"),
  networkStatus: document.getElementById("networkStatus"),
  walletAddress: document.getElementById("walletAddress"),
  currentEndpoint: document.getElementById("currentEndpoint"),
  networkDetail: document.getElementById("networkDetail"),
  watchedAddress: document.getElementById("watchedAddress"),
  backendStatus: document.getElementById("backendStatus"),
  backendBalance: document.getElementById("backendBalance"),
  message: document.getElementById("message"),
  manualPanel: document.getElementById("manualPanel"),
  manualCurrentEndpoint: document.getElementById("manualCurrentEndpoint"),
  debugOutput: document.getElementById("debugOutput"),
};

function provider() {
  return window.tron || window.tronLink || null;
}

function getInjectedTronWeb(providerObject = null) {
  if (providerObject && providerObject.tronWeb && typeof providerObject.tronWeb === "object") {
    return providerObject.tronWeb;
  }
  if (window.tron && window.tron.tronWeb && typeof window.tron.tronWeb === "object") {
    return window.tron.tronWeb;
  }
  if (window.tronWeb && typeof window.tronWeb === "object") {
    return window.tronWeb;
  }
  if (window.tronLink && window.tronLink.tronWeb && typeof window.tronLink.tronWeb === "object") {
    return window.tronLink.tronWeb;
  }
  return null;
}

function setMessage(text, kind = "muted") {
  el.message.textContent = text;
  el.message.className = `message ${kind}`;
}

function endpointFromTronWeb(tw) {
  return tw?.fullNode?.host || "";
}

function normalizeChainId(value) {
  if (value === null || value === undefined || value === "") return "";
  const text = String(value).trim().toLowerCase();
  if (text.startsWith("0x")) return text;
  if (/^\d+$/.test(text)) return `0x${BigInt(text).toString(16)}`;
  return text;
}

function readChainId() {
  return (
    window.tron?.chainId ||
    window.tron?.networkVersion ||
    window.tronLink?.chainId ||
    window.tronLink?.networkVersion ||
    null
  );
}

function classifyNetwork(endpoint, chainId = null, networkName = "") {
  const normalizedChainId = normalizeChainId(chainId);
  if (normalizedChainId === NILE_CHAIN_ID_HEX) return "nile";

  const value = [endpoint, networkName].map((item) => String(item || "").toLowerCase()).join(" ");
  if (!value.trim()) return "unknown";
  if (value.includes("nile")) return "nile";
  if (value.includes("shasta")) return "shasta";
  if (value.includes("api.trongrid.io")) return "mainnet";
  return "unknown";
}

function networkLabel(classification) {
  if (classification === "nile") return "MyChain test mode";
  if (classification === "mainnet") return "Mainnet";
  if (classification === "shasta") return "Shasta";
  return "Unknown";
}

function networkDetail(classification) {
  if (classification === "nile") return "Connected to Nile endpoint";
  if (classification === "mainnet") return "Wrong network for this test";
  if (classification === "shasta") return "Wrong test network for this test";
  return "Could not confirm network";
}

function providerDiagnostics(methodAttempted = "") {
  const activeProvider = provider();
  return {
    methodAttempted,
    windowTron: Boolean(window.tron),
    windowTronRequestType: typeof window.tron?.request,
    windowTronTronWebType: typeof window.tron?.tronWeb,
    windowTronLink: Boolean(window.tronLink),
    windowTronLinkType: typeof window.tronLink,
    windowTronWeb: Boolean(window.tronWeb),
    windowTronWebType: typeof window.tronWeb,
    providerTronWebType: typeof activeProvider?.tronWeb,
  };
}

function isTronLinkMobile() {
  const userAgent = navigator.userAgent || "";
  return Boolean(window.tronLink || window.tronWeb) && /mobile|android|iphone|ipad|ipod/i.test(userAgent);
}

function formatConnectionError(error, methodAttempted) {
  lastConnectionError = {
    code: error?.code ?? null,
    message: String(error?.message || error || "Unknown error"),
    ...providerDiagnostics(methodAttempted),
  };
  const code = lastConnectionError.code === null ? "none" : lastConnectionError.code;
  return `Connect failed: ${lastConnectionError.message} | code=${code} | method=${methodAttempted}`;
}

async function getTronProvider() {
  const started = Date.now();
  while (Date.now() - started < 2000) {
    if (window.tron && typeof window.tron.request === "function") {
      return window.tron;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (window.tronLink && typeof window.tronLink.request === "function") {
    return window.tronLink;
  }
  if (window.tronWeb && typeof window.tronWeb.request === "function") {
    return window.tronWeb;
  }
  return null;
}

async function waitForTronWebReady(providerObject, timeoutMs = 3000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const tw = getInjectedTronWeb(providerObject);
    if (tw && tw.defaultAddress && tw.defaultAddress.base58) {
      return tw;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return getInjectedTronWeb(providerObject);
}

async function legacyRequestAccounts(errorFromPrimary) {
  const code = errorFromPrimary?.code;
  const msg = String(errorFromPrimary?.message || errorFromPrimary || "");
  if (code === 4001) {
    throw new Error("User rejected TronLink connection");
  }
  if (!(code === 4200 || /unknown method|unsupported method|method not found/i.test(msg))) {
    throw errorFromPrimary;
  }

  const params = {
    websiteName: "MyChain Bridge dApp",
    websiteIcon: window.location.origin + "/favicon.ico",
  };
  if (window.tronWeb && typeof window.tronWeb.request === "function") {
    return window.tronWeb.request({ method: "tron_requestAccounts", params });
  }
  if (window.tronLink && typeof window.tronLink.request === "function") {
    return window.tronLink.request({ method: "tron_requestAccounts", params });
  }
  throw new Error("TronLink does not support eth_requestAccounts and no legacy fallback is available");
}

function readAddress(providerObject = null) {
  const tw = getInjectedTronWeb(providerObject);
  selectedAddress =
    tw?.defaultAddress?.base58 ||
    window.tron?.selectedAddress ||
    window.tronLink?.tronWeb?.defaultAddress?.base58 ||
    null;
  return selectedAddress;
}

function refreshWalletState() {
  const activeProvider = provider();
  const tw = getInjectedTronWeb(activeProvider);
  const endpoint = endpointFromTronWeb(tw);
  const chainId = readChainId();
  const networkName = window.tron?.networkName || window.tronLink?.networkName || "";
  const classification = classifyNetwork(endpoint, chainId, networkName);
  const address = readAddress(activeProvider);

  el.tronLinkStatus.textContent = activeProvider || tw ? "Detected" : "Not detected";
  el.walletStatus.textContent = address ? "Connected" : "Not connected";
  el.networkStatus.textContent = networkLabel(classification);
  el.walletAddress.textContent = address || "Not connected";
  el.currentEndpoint.textContent = endpoint || "Unknown";
  el.networkDetail.textContent = networkDetail(classification);
  el.manualCurrentEndpoint.textContent = endpoint || "Unknown";
  el.connectButton.textContent = address ? "Wallet Connected" : "Connect TronLink";
  el.connectButton.disabled = Boolean(address);

  if (!address) {
    setMessage(
      isTronLinkMobile()
        ? "TronLink mobile detected. If no popup appears, approve connection from the wallet browser or refresh this page inside TronLink Discover."
        : "Connect TronLink to continue.",
      "muted",
    );
  } else if (classification === "nile") {
    setMessage("Wallet already connected. Network is MyChain test mode using Nile endpoint.", "ok");
  } else if (classification === "mainnet") {
    setMessage("Wallet connected, but network appears to be Mainnet. Please switch to MyChain.", "warning");
  } else {
    setMessage("Network switch must be done manually in TronLink.", "warning");
  }

  lastProviderState = {
    ...providerDiagnostics(),
    selectedAddress: address,
    watchedAddress: WATCHED_ADDRESS,
    addressMatchesWatchedAddress: Boolean(address && address === WATCHED_ADDRESS),
    detectedNetwork: classification,
    displayedNetwork: networkLabel(classification),
    fullNode: endpoint || null,
    expectedEndpoint: EXPECTED_ENDPOINT,
    chainId,
    normalizedChainId: normalizeChainId(chainId),
    networkName: networkName || null,
  };
  renderDebug();
}

function hasConnectedWallet() {
  return Boolean(
    selectedAddress ||
      window.tronWeb?.defaultAddress?.base58 ||
      window.tron?.tronWeb?.defaultAddress?.base58,
  );
}

async function connectWallet() {
  const tronProvider = await getTronProvider();
  if (!tronProvider && hasConnectedWallet()) {
    refreshWalletState();
    return;
  }
  if (!tronProvider || typeof tronProvider.request !== "function") {
    throw new Error("TronLink provider not available");
  }
  try {
    await tronProvider.request({ method: "eth_requestAccounts", params: [] });
  } catch (error) {
    await legacyRequestAccounts(error);
  }
  await waitForTronWebReady(tronProvider);
  refreshWalletState();
}

function isUnsupportedSwitchError(error) {
  const code = error?.code;
  const message = String(error?.message || error || "");
  return code === 4200 || code === -32601 || /unknown method|unsupported method|method not found/i.test(message);
}

function isMissingChainError(error) {
  const code = error?.code;
  const message = String(error?.message || error || "");
  return code === 4902 || /not added|not found|unrecognized chain|chain.*not/i.test(message);
}

function isExistingChainError(error) {
  const message = String(error?.message || error || "");
  return /already|exist|duplicate|same chain|known chain|chain.*added/i.test(message);
}

function showManualInstructions() {
  el.manualPanel.classList.remove("hidden");
}

async function addMyChainNetwork(tronProvider) {
  await tronProvider.request({
    method: "wallet_addEthereumChain",
    params: [MYCHAIN_PARAMS],
  });
}

async function switchMyChain(tronProvider) {
  await tronProvider.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: NILE_CHAIN_ID_HEX }],
  });
}

async function switchToMyChain() {
  const tronProvider = await getTronProvider();
  if (!tronProvider || typeof tronProvider.request !== "function") {
    throw new Error("TronLink provider not available");
  }

  if (!selectedAddress) {
    await connectWallet();
  }

  setMessage("Requesting TronLink to add MyChain...", "muted");
  try {
    await addMyChainNetwork(tronProvider);
    setMessage("MyChain add request sent. Confirm it in TronLink.", "muted");
  } catch (error) {
    if (error?.code === 4001) {
      throw new Error("Switch rejected by user.");
    }
    if (isExistingChainError(error)) {
      setMessage("TronLink already has Nile Testnet for this chainId. Until a real private TRON node is running, MyChain uses Nile under the hood.", "warning");
    } else if (isUnsupportedSwitchError(error)) {
      showManualInstructions();
      throw new Error("TronLink does not support programmatic add. Open the network selector and add MyChain manually.");
    } else {
      lastConnectionError = {
        code: error?.code ?? null,
        message: String(error?.message || error || "Unknown add network error"),
        methodAttempted: "wallet_addEthereumChain",
      };
      setMessage("Could not add MyChain as a custom network. Trying to switch by chainId next.", "warning");
    }
  }

  setMessage("Requesting TronLink network switch...", "muted");
  try {
    await switchMyChain(tronProvider);
    setMessage("Switch request sent. Confirm it in TronLink.", "muted");
  } catch (error) {
    if (error?.code === 4001) {
      throw new Error("Switch rejected by user.");
    }
    if (isMissingChainError(error)) {
      showManualInstructions();
      throw new Error("TronLink could not find this chainId. Add MyChain manually, then switch to it.");
    }
    if (isUnsupportedSwitchError(error)) {
      showManualInstructions();
      throw new Error("TronLink does not support programmatic switch. Open the network selector and choose MyChain or TRON Nile Testnet.");
    }
    throw error;
  }

  await new Promise((resolve) => setTimeout(resolve, 800));
  refreshWalletState();
  if (lastProviderState.detectedNetwork === "nile") {
    setMessage("Switched to MyChain test mode.", "ok");
  } else {
    showManualInstructions();
    setMessage("Switch request sent. If TronLink did not switch, choose MyChain or TRON Nile Testnet manually.", "warning");
  }
}

async function getJson(path) {
  const response = await fetch(`${BACKEND_API_BASE}${path}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

async function refreshBackend() {
  try {
    const [health, balance] = await Promise.all([
      getJson("/health"),
      getJson(`/accounts/${ACCOUNT_REF}/balance`),
    ]);
    latestBackend = { health, balance };
    const usdt = balance.balances?.USDT;
    el.backendStatus.textContent = health.status === "ok" ? "Online" : "Offline";
    el.backendBalance.textContent = `${usdt?.human || "0"} USDT`;
  } catch (error) {
    latestBackend = { error: error.message };
    el.backendStatus.textContent = "Offline";
    el.backendBalance.textContent = "Unavailable";
  }
  renderDebug();
}

async function refreshAll() {
  await refreshBackend();
  refreshWalletState();
}

async function onConnectClick() {
  try {
    if (hasConnectedWallet()) {
      refreshWalletState();
      setMessage("Wallet already connected.", "ok");
      return;
    }
    await connectWallet();
    setMessage("Wallet connected.", "ok");
  } catch (error) {
    setMessage(formatConnectionError(error, "eth_requestAccounts"), "error");
    renderDebug();
  }
}

function onNetworkInfoClick() {
  showManualInstructions();
  refreshWalletState();
  if (lastProviderState.detectedNetwork === "nile") {
    setMessage("You are already on MyChain test mode using Nile endpoint.", "ok");
  } else {
    setMessage("MyChain network details are shown below. Use Try automatic switch only if you want TronLink to attempt it.", "muted");
  }
}

async function onTrySwitchClick() {
  try {
    await switchToMyChain();
  } catch (error) {
    const message = String(error?.message || error || "Network switch failed");
    setMessage(message, message.includes("rejected") ? "warning" : "error");
    renderDebug();
  }
}

function renderDebug() {
  el.debugOutput.textContent = JSON.stringify(
    {
      backend: latestBackend,
      providerState: lastProviderState,
      lastConnectionError,
      chainIdConfiguredForProgrammaticSwitch: Boolean(NILE_CHAIN_ID_HEX),
      myChainNetworkParams: MYCHAIN_PARAMS,
    },
    null,
    2,
  );
}

async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (_error) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  setMessage(`${label} copied.`, "ok");
}

function allConfigText() {
  return [
    "Network name: MyChain",
    `Chain ID: ${NILE_CHAIN_ID_HEX}`,
    `FullNode: ${EXPECTED_ENDPOINT}`,
    `SolidityNode: ${EXPECTED_ENDPOINT}`,
    `EventServer: ${EXPECTED_ENDPOINT}`,
    "Explorer: https://nile.tronscan.org",
  ].join("\n");
}

function attachEvents() {
  el.connectButton.addEventListener("click", onConnectClick);
  el.networkButton.addEventListener("click", onNetworkInfoClick);
  el.refreshButton.addEventListener("click", refreshAll);
  el.copyFullNodeButton.addEventListener("click", () => copyText(EXPECTED_ENDPOINT, "FullNode"));
  el.copyAllConfigButton.addEventListener("click", () => copyText(allConfigText(), "MyChain config"));
  el.trySwitchButton.addEventListener("click", onTrySwitchClick);

  const tron = window.tron;
  if (tron?.on) {
    tron.on("accountsChanged", refreshAll);
    tron.on("chainChanged", refreshAll);
  }

  window.addEventListener("message", (event) => {
    const message = event.data?.message;
    if (message?.action === "accountsChanged" || message?.action === "setNode") {
      refreshAll();
    }
  });
}

el.watchedAddress.textContent = WATCHED_ADDRESS;
attachEvents();
refreshAll();
setInterval(refreshAll, 15000);
