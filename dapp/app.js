const BACKEND_API_BASE = "/api";
const WATCHED_ADDRESS = "TFP84nTasN6G3M7SxX1XmRUP5wrX2ZeoYt";
const ACCOUNT_REF = "test_account_001";
const TARGET_NETWORK_LABEL = "MyChain Testnet";
const EXPECTED_ENDPOINT = "https://nile.trongrid.io";
const NILE_CHAIN_ID_HEX = "";

let selectedAddress = null;
let lastProviderState = {};
let lastConnectionError = null;
let latestBackend = {};

const el = {
  connectButton: document.getElementById("connectButton"),
  networkButton: document.getElementById("networkButton"),
  tronLinkStatus: document.getElementById("tronLinkStatus"),
  walletStatus: document.getElementById("walletStatus"),
  networkStatus: document.getElementById("networkStatus"),
  walletAddress: document.getElementById("walletAddress"),
  currentEndpoint: document.getElementById("currentEndpoint"),
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

function classifyEndpoint(endpoint) {
  const value = String(endpoint || "").toLowerCase();
  if (!value) return "unknown";
  if (value.includes("nile")) return "nile";
  if (value.includes("shasta")) return "shasta";
  if (value.includes("api.trongrid.io")) return "mainnet";
  return "unknown";
}

function networkLabel(classification) {
  if (classification === "nile") return "MyChain";
  if (classification === "mainnet") return "Mainnet";
  if (classification === "shasta") return "Shasta";
  return "Unknown";
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
  const classification = classifyEndpoint(endpoint);
  const address = readAddress(activeProvider);

  el.tronLinkStatus.textContent = activeProvider || tw ? "Detected" : "Not detected";
  el.walletStatus.textContent = address ? "Connected" : "Not connected";
  el.networkStatus.textContent = networkLabel(classification);
  el.walletAddress.textContent = address || "Not connected";
  el.currentEndpoint.textContent = endpoint || "Unknown";
  el.manualCurrentEndpoint.textContent = endpoint || "Unknown";

  if (!address) {
    setMessage("Connect TronLink to continue.", "muted");
  } else if (classification === "nile") {
    setMessage("Wallet connected on MyChain test network.", "ok");
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
    chainId:
      window.tron?.chainId ||
      window.tron?.networkVersion ||
      window.tronLink?.chainId ||
      window.tronLink?.networkVersion ||
      null,
  };
  renderDebug();
}

async function connectWallet() {
  const tronProvider = await getTronProvider();
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
    await connectWallet();
  } catch (error) {
    setMessage(formatConnectionError(error, "eth_requestAccounts"), "error");
    renderDebug();
  }
}

function showNetworkInstructions() {
  el.manualPanel.classList.toggle("hidden");
  setMessage("Network switch must be done manually in TronLink.", "warning");
}

function renderDebug() {
  el.debugOutput.textContent = JSON.stringify(
    {
      backend: latestBackend,
      providerState: lastProviderState,
      lastConnectionError,
      chainIdConfiguredForProgrammaticSwitch: Boolean(NILE_CHAIN_ID_HEX),
    },
    null,
    2,
  );
}

function attachEvents() {
  el.connectButton.addEventListener("click", onConnectClick);
  el.networkButton.addEventListener("click", showNetworkInstructions);

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
