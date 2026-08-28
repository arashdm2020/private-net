const BACKEND_API_BASE = "/api";
const ACCOUNT_REF = "test_account_001";

const TRON_WATCHER_MODE_NAME = "Backend watcher test mode";
const NILE_EXPECTED_ENDPOINT = "https://nile.trongrid.io";
const MYCHAIN_TRON_CHAIN_ID_HEX = "0xcd8690dc";
const MYCHAIN_TRON_USDT_CONTRACT = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
const MYCHAIN_TRON_WATCHED_ADDRESS = "TFP84nTasN6G3M7SxX1XmRUP5wrX2ZeoYt";
const MYCHAIN_EVM_RPC_HOST = "195.200.14.38:8545";

const MYCHAIN_EVM_ENABLED = true;
const MYCHAIN_EVM_CHAIN_NAME = "MyChain EVM";
const MYCHAIN_EVM_CHAIN_ID_HEX = "0x13527dc";
const MYCHAIN_EVM_RPC_URL = "http://195.200.14.38:8545";
const MYCHAIN_EVM_EXPLORER_URL = "";
const MYCHAIN_EVM_NATIVE_SYMBOL = "TRX";
const MYCHAIN_EVM_NATIVE_DECIMALS = 18;

let activeMode = "tron";
let selectedAddress = null;
let evmProviders = [];
let selectedEvmProviderIndex = 0;
let latestBackend = {};
let latestWalletState = {};
let lastConnectionError = null;

const el = {
  tronModeButton: document.getElementById("tronModeButton"),
  evmModeButton: document.getElementById("evmModeButton"),
  providerLabel: document.getElementById("providerLabel"),
  providerStatus: document.getElementById("providerStatus"),
  walletStatus: document.getElementById("walletStatus"),
  networkStatus: document.getElementById("networkStatus"),
  evmProviderRow: document.getElementById("evmProviderRow"),
  evmProviderSelect: document.getElementById("evmProviderSelect"),
  connectButton: document.getElementById("connectButton"),
  networkButton: document.getElementById("networkButton"),
  refreshButton: document.getElementById("refreshButton"),
  walletAddress: document.getElementById("walletAddress"),
  currentEndpoint: document.getElementById("currentEndpoint"),
  networkMode: document.getElementById("networkMode"),
  networkDetail: document.getElementById("networkDetail"),
  watchedAddress: document.getElementById("watchedAddress"),
  backendStatus: document.getElementById("backendStatus"),
  backendBalance: document.getElementById("backendBalance"),
  message: document.getElementById("message"),
  networkStatusPanel: document.getElementById("networkStatusPanel"),
  tronNetworkPanel: document.getElementById("tronNetworkPanel"),
  evmConfigPanel: document.getElementById("evmConfigPanel"),
  debugOutput: document.getElementById("debugOutput"),
};

function setMessage(text, kind = "muted") {
  el.message.textContent = text;
  el.message.className = `message ${kind}`;
}

function normalizeChainId(value) {
  if (value === null || value === undefined || value === "") return "";
  const text = String(value).trim().toLowerCase();
  if (text.startsWith("0x")) return text;
  if (/^\d+$/.test(text)) return `0x${BigInt(text).toString(16)}`;
  return text;
}

function classifyEndpoint(endpoint, chainId = "", networkName = "") {
  const value = [endpoint, networkName].map((item) => String(item || "").toLowerCase()).join(" ");
  if (value.includes(MYCHAIN_EVM_RPC_HOST)) return "evm-rpc-in-tron";
  if (normalizeChainId(chainId) === MYCHAIN_TRON_CHAIN_ID_HEX) return "nile";
  if (!value.trim()) return "unknown";
  if (value.includes("nile")) return "nile";
  if (value.includes("shasta")) return "shasta";
  if (value.includes("api.trongrid.io")) return "mainnet";
  return "unknown";
}

function networkLabel(classification) {
  if (classification === "nile") return "Nile Testnet";
  if (classification === "evm-rpc-in-tron") return "Invalid TRON network";
  if (classification === "mainnet") return "Mainnet";
  if (classification === "shasta") return "Shasta";
  return "Unknown";
}

function networkDetail(classification) {
  if (classification === "nile") return "Connected to Nile endpoint";
  if (classification === "evm-rpc-in-tron") return "EVM/Anvil RPC is configured inside TronLink";
  if (classification === "mainnet") return "Wrong network for this test";
  if (classification === "shasta") return "Wrong test network for this test";
  return "Could not confirm network";
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

async function getTronProvider() {
  const started = Date.now();
  while (Date.now() - started < 1500) {
    if (window.tron && typeof window.tron.request === "function") return window.tron;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (window.tronLink && typeof window.tronLink.request === "function") return window.tronLink;
  if (window.tronWeb && typeof window.tronWeb.request === "function") return window.tronWeb;
  return null;
}

async function waitForTronWebReady(providerObject, timeoutMs = 3000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const tw = getInjectedTronWeb(providerObject);
    if (tw?.defaultAddress?.base58) return tw;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return getInjectedTronWeb(providerObject);
}

function hasConnectedTronWallet() {
  return Boolean(
    selectedAddress ||
      window.tronWeb?.defaultAddress?.base58 ||
      window.tron?.tronWeb?.defaultAddress?.base58,
  );
}

async function legacyTronRequestAccounts(errorFromPrimary) {
  const code = errorFromPrimary?.code;
  const msg = String(errorFromPrimary?.message || errorFromPrimary || "");
  if (code === 4001) throw new Error("User rejected TronLink connection");
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

async function connectTronLink() {
  const tronProvider = await getTronProvider();
  if (!tronProvider && hasConnectedTronWallet()) {
    return getTronWalletState();
  }
  if (!tronProvider || typeof tronProvider.request !== "function") {
    throw new Error("TronLink provider not available");
  }
  try {
    await tronProvider.request({ method: "eth_requestAccounts", params: [] });
  } catch (error) {
    await legacyTronRequestAccounts(error);
  }
  await waitForTronWebReady(tronProvider);
  return getTronWalletState();
}

function detectTronNetwork(tw) {
  const fullNode = tw?.fullNode?.host || "";
  const chainId =
    window.tron?.chainId ||
    window.tron?.networkVersion ||
    window.tronLink?.chainId ||
    window.tronLink?.networkVersion ||
    "";
  const networkName = window.tron?.networkName || window.tronLink?.networkName || "";
  const classification = classifyEndpoint(fullNode, chainId, networkName);
  return {
    family: "tron",
    classification,
    label: networkLabel(classification),
    detail: networkDetail(classification),
    fullNode,
    chainId,
    normalizedChainId: normalizeChainId(chainId),
    networkName,
  };
}

function getTronWalletState() {
  const tronProvider = window.tron || window.tronLink || null;
  const tw = getInjectedTronWeb(tronProvider);
  selectedAddress =
    tw?.defaultAddress?.base58 ||
    window.tron?.selectedAddress ||
    window.tronLink?.tronWeb?.defaultAddress?.base58 ||
    null;
  const network = detectTronNetwork(tw);
  return {
    mode: "tron",
    providerDetected: Boolean(tronProvider || tw),
    providerName: "TronLink",
    address: selectedAddress,
    connected: Boolean(selectedAddress),
    endpoint: network.fullNode || "Unknown",
    network,
    providerTypes: {
      windowTron: Boolean(window.tron),
      windowTronRequestType: typeof window.tron?.request,
      windowTronTronWebType: typeof window.tron?.tronWeb,
      windowTronLink: Boolean(window.tronLink),
      windowTronWeb: Boolean(window.tronWeb),
      windowTronWebType: typeof window.tronWeb,
    },
  };
}

function isUnsupportedProviderError(error) {
  const code = error?.code;
  const message = String(error?.message || error || "");
  return code === 4200 || code === -32601 || /unknown method|unsupported method|method not found/i.test(message);
}

function isExistingChainError(error) {
  const message = String(error?.message || error || "");
  return /already|exist|duplicate|same chain|known chain|chain.*added/i.test(message);
}

function showTronNetworkInfo() {
  el.tronNetworkPanel.classList.remove("hidden");
  el.networkStatusPanel.classList.add("hidden");
  el.evmConfigPanel.classList.add("hidden");
  const state = getTronWalletState();
  if (state.network.classification === "nile") {
    setMessage("Wallet is on Nile Testnet. Backend watcher test mode is active.", "ok");
  } else if (state.network.classification === "evm-rpc-in-tron") {
    setMessage("You are using an EVM RPC inside TronLink. This is not a valid TRON network. Remove this custom TRON network from TronLink and use Nile for TRON mode, or switch to EVM mode with MetaMask-compatible wallet.", "error");
  } else {
    setMessage("For current watcher testing, switch TronLink to TRON Nile Testnet manually.", "muted");
  }
}

function providerLabel(providerObject) {
  if (!providerObject) return "Unknown";
  if (providerObject.info?.name) return providerObject.info.name;
  if (providerObject.isMetaMask) return "MetaMask";
  if (providerObject.isTrust || providerObject.isTrustWallet) return "Trust Wallet";
  if (providerObject.isRabby) return "Rabby";
  if (providerObject.isCoinbaseWallet) return "Coinbase Wallet";
  return "Unknown EIP-1193 wallet";
}

function rememberEip6963Provider(providerDetail) {
  const providerObject = providerDetail?.provider;
  if (!providerObject || evmProviders.some((item) => item.provider === providerObject)) return;
  evmProviders.push({
    provider: providerObject,
    info: providerDetail.info || null,
    label: providerDetail.info?.name || providerLabel(providerObject),
  });
  renderEvmProviderSelect();
}

function getEvmProviders() {
  const providers = [...evmProviders];
  if (window.ethereum && !providers.some((item) => item.provider === window.ethereum)) {
    providers.unshift({ provider: window.ethereum, info: null, label: providerLabel(window.ethereum) });
  }
  return providers;
}

function selectedEvmProvider() {
  const providers = getEvmProviders();
  return providers[selectedEvmProviderIndex]?.provider || providers[0]?.provider || null;
}

function renderEvmProviderSelect() {
  const providers = getEvmProviders();
  el.evmProviderSelect.innerHTML = providers
    .map((item, index) => `<option value="${index}">${item.label}</option>`)
    .join("");
  el.evmProviderRow.classList.toggle("hidden", activeMode !== "evm" || providers.length <= 1);
}

function detectEvmNetwork(providerObject) {
  const chainId = providerObject?.chainId || "";
  return {
    family: "evm",
    classification: MYCHAIN_EVM_ENABLED && normalizeChainId(chainId) === MYCHAIN_EVM_CHAIN_ID_HEX ? "mychain-evm" : "unknown",
    label: chainId ? `EVM ${normalizeChainId(chainId)}` : "Unknown",
    detail: MYCHAIN_EVM_ENABLED ? "EVM RPC configured" : "MyChain EVM network is not configured yet",
    chainId,
    normalizedChainId: normalizeChainId(chainId),
  };
}

async function getEvmWalletState() {
  const evmProvider = selectedEvmProvider();
  let accounts = [];
  try {
    accounts =
      evmProvider && typeof evmProvider.request === "function"
        ? await evmProvider.request({ method: "eth_accounts" })
        : [];
  } catch (_error) {
    accounts = [];
  }
  let chainId = evmProvider?.chainId || "";
  try {
    chainId =
      evmProvider && typeof evmProvider.request === "function"
        ? await evmProvider.request({ method: "eth_chainId" })
        : chainId;
  } catch (_error) {
    // Keep provider.chainId if request is unavailable.
  }
  if (evmProvider) evmProvider.chainId = chainId;
  const network = detectEvmNetwork(evmProvider);
  return {
    mode: "evm",
    providerDetected: Boolean(evmProvider),
    providerName: providerLabel(evmProvider),
    address: accounts[0] || null,
    connected: Boolean(accounts[0]),
    endpoint: MYCHAIN_EVM_RPC_URL || "No EVM RPC configured",
    network,
    flags: {
      isMetaMask: Boolean(evmProvider?.isMetaMask),
      isTrust: Boolean(evmProvider?.isTrust || evmProvider?.isTrustWallet),
      isRabby: Boolean(evmProvider?.isRabby),
      isCoinbaseWallet: Boolean(evmProvider?.isCoinbaseWallet),
    },
  };
}

async function connectEvmWallet() {
  const evmProvider = selectedEvmProvider();
  if (!evmProvider || typeof evmProvider.request !== "function") {
    throw new Error("No EIP-1193 wallet provider detected");
  }
  await evmProvider.request({ method: "eth_requestAccounts" });
  return getEvmWalletState();
}

async function addOrSwitchEvmNetwork() {
  if (!MYCHAIN_EVM_ENABLED || !MYCHAIN_EVM_CHAIN_ID_HEX || !MYCHAIN_EVM_RPC_URL) {
  el.evmConfigPanel.classList.remove("hidden");
    el.networkStatusPanel.classList.add("hidden");
    el.tronNetworkPanel.classList.add("hidden");
    setMessage("EVM mode is not configured yet. Provide MYCHAIN_EVM_RPC_URL and MYCHAIN_EVM_CHAIN_ID to enable MetaMask/Trust Wallet network switching.", "warning");
    return;
  }

  const evmProvider = selectedEvmProvider();
  if (!evmProvider || typeof evmProvider.request !== "function") {
    throw new Error("No EIP-1193 wallet provider detected");
  }
  const params = {
    chainId: MYCHAIN_EVM_CHAIN_ID_HEX,
    chainName: MYCHAIN_EVM_CHAIN_NAME,
    nativeCurrency: {
      name: MYCHAIN_EVM_NATIVE_SYMBOL,
      symbol: MYCHAIN_EVM_NATIVE_SYMBOL,
      decimals: MYCHAIN_EVM_NATIVE_DECIMALS,
    },
    rpcUrls: [MYCHAIN_EVM_RPC_URL],
  };
  if (MYCHAIN_EVM_EXPLORER_URL) params.blockExplorerUrls = [MYCHAIN_EVM_EXPLORER_URL];
  await evmProvider.request({ method: "wallet_addEthereumChain", params: [params] });
  await evmProvider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: MYCHAIN_EVM_CHAIN_ID_HEX }] });
  await refreshWalletState();
}

async function getJson(path) {
  const response = await fetch(`${BACKEND_API_BASE}${path}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

async function refreshBackend() {
  if (activeMode === "evm") {
    latestBackend = { mode: "evm", configured: true, rpcUrl: MYCHAIN_EVM_RPC_URL };
    el.backendStatus.textContent = "Not configured";
    el.backendBalance.textContent = "No EVM backend balance configured yet.";
    renderDebug();
    return;
  }

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

function renderWalletState(state) {
  latestWalletState = state;
  el.providerLabel.textContent = activeMode === "tron" ? "TronLink" : "EVM wallet";
  el.providerStatus.textContent = state.providerDetected ? state.providerName : "Not detected";
  el.walletStatus.textContent = state.connected ? "Connected" : "Not connected";
  el.networkStatus.textContent = state.network?.label || "Unknown";
  el.walletAddress.textContent = state.address || "Not connected";
  el.currentEndpoint.textContent = state.endpoint || "Unknown";
  el.networkDetail.textContent = state.network?.detail || "Unknown";
  el.watchedAddress.textContent = activeMode === "tron" ? MYCHAIN_TRON_WATCHED_ADDRESS : "No EVM watched address configured";
  el.networkMode.textContent =
    activeMode === "tron"
      ? TRON_WATCHER_MODE_NAME
      : MYCHAIN_EVM_ENABLED
        ? MYCHAIN_EVM_CHAIN_NAME
        : "EVM mode placeholder";
  el.connectButton.textContent =
    activeMode === "tron"
      ? state.connected
        ? "Wallet Connected"
        : "Connect TronLink"
      : state.connected
        ? "EVM Wallet Connected"
        : "Connect EVM Wallet";
  el.connectButton.disabled = Boolean(state.connected);
  el.networkButton.textContent = activeMode === "tron" ? "Network Setup Status" : "Add / Switch EVM Network";
}

async function refreshWalletState() {
  if (activeMode === "tron") {
    const state = getTronWalletState();
    renderWalletState(state);
    if (state.network?.classification === "evm-rpc-in-tron") {
      setMessage("You are using an EVM RPC inside TronLink. This is not a valid TRON network. Remove this custom TRON network from TronLink and use Nile for TRON mode, or switch to EVM mode with MetaMask-compatible wallet.", "error");
    }
  } else {
    renderWalletState(await getEvmWalletState());
  }
}

async function refreshAll() {
  renderMode();
  await refreshBackend();
  await refreshWalletState();
  renderDebug();
}

function renderMode() {
  el.tronModeButton.classList.toggle("active", activeMode === "tron");
  el.evmModeButton.classList.toggle("active", activeMode === "evm");
  renderEvmProviderSelect();
}

async function onConnectClick() {
  try {
    if (activeMode === "tron") {
      if (hasConnectedTronWallet()) {
        await refreshWalletState();
        setMessage("Wallet already connected.", "ok");
        return;
      }
      await connectTronLink();
      await refreshWalletState();
      setMessage("Wallet connected.", "ok");
      return;
    }
    await connectEvmWallet();
    await refreshWalletState();
    setMessage(
      MYCHAIN_EVM_ENABLED
        ? "EVM wallet connected."
        : "EVM wallet connected, but MyChain EVM network is not configured yet.",
      MYCHAIN_EVM_ENABLED ? "ok" : "warning",
    );
  } catch (error) {
    lastConnectionError = { message: String(error?.message || error), mode: activeMode };
    setMessage(String(error?.message || error), "error");
    renderDebug();
  }
}

async function onNetworkClick() {
  try {
    if (activeMode === "tron") {
      el.networkStatusPanel.classList.remove("hidden");
      el.tronNetworkPanel.classList.add("hidden");
      el.evmConfigPanel.classList.add("hidden");
      setMessage("MyChain EVM test RPC is deployed. TRON/private-chain infrastructure is not deployed yet.", "muted");
    } else {
      await addOrSwitchEvmNetwork();
    }
  } catch (error) {
    lastConnectionError = { message: String(error?.message || error), mode: activeMode };
    setMessage(String(error?.message || error), "error");
    renderDebug();
  }
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

function renderDebug() {
  el.debugOutput.textContent = JSON.stringify(
    {
      activeMode,
      tronConfig: {
        modeName: TRON_WATCHER_MODE_NAME,
        expectedNileEndpoint: NILE_EXPECTED_ENDPOINT,
        wrongForTronLink: `http://${MYCHAIN_EVM_RPC_HOST}`,
        chainId: MYCHAIN_TRON_CHAIN_ID_HEX,
        usdtContract: MYCHAIN_TRON_USDT_CONTRACT,
        watchedAddress: MYCHAIN_TRON_WATCHED_ADDRESS,
        myChainDeployed: false,
      },
      evmConfig: {
        enabled: MYCHAIN_EVM_ENABLED,
        chainName: MYCHAIN_EVM_CHAIN_NAME,
        chainId: MYCHAIN_EVM_CHAIN_ID_HEX,
        rpcConfigured: Boolean(MYCHAIN_EVM_RPC_URL),
        explorerConfigured: Boolean(MYCHAIN_EVM_EXPLORER_URL),
      },
      evmProviders: getEvmProviders().map((item) => ({
        label: item.label,
        flags: {
          isMetaMask: Boolean(item.provider?.isMetaMask),
          isTrust: Boolean(item.provider?.isTrust || item.provider?.isTrustWallet),
          isRabby: Boolean(item.provider?.isRabby),
          isCoinbaseWallet: Boolean(item.provider?.isCoinbaseWallet),
        },
      })),
      walletState: latestWalletState,
      backend: latestBackend,
      lastConnectionError,
    },
    null,
    2,
  );
}

function setMode(mode) {
  activeMode = mode;
  el.tronNetworkPanel.classList.add("hidden");
  el.networkStatusPanel.classList.add("hidden");
  el.evmConfigPanel.classList.add("hidden");
  setMessage(
    mode === "tron"
      ? "TRON mode selected. Current wallet testing uses Nile while MyChain is not deployed yet."
      : "EVM mode selected. MyChain EVM RPC is configured for wallet network testing.",
    "muted",
  );
  refreshAll();
}

function attachEvents() {
  el.tronModeButton.addEventListener("click", () => setMode("tron"));
  el.evmModeButton.addEventListener("click", () => setMode("evm"));
  el.connectButton.addEventListener("click", onConnectClick);
  el.networkButton.addEventListener("click", onNetworkClick);
  el.refreshButton.addEventListener("click", refreshAll);
  el.evmProviderSelect.addEventListener("change", (event) => {
    selectedEvmProviderIndex = Number(event.target.value || 0);
    refreshAll();
  });

  const tron = window.tron;
  if (tron?.on) {
    tron.on("accountsChanged", refreshAll);
    tron.on("chainChanged", refreshAll);
  }
  window.addEventListener("message", (event) => {
    const message = event.data?.message;
    if (message?.action === "accountsChanged" || message?.action === "setNode") refreshAll();
  });
  window.addEventListener("eip6963:announceProvider", (event) => {
    rememberEip6963Provider(event.detail);
    if (activeMode === "evm") refreshAll();
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

attachEvents();
refreshAll();
setInterval(refreshAll, 15000);
