const BACKEND_API_BASE = "/api";
const TARGET_NETWORK_NAME = "Nile Testnet";
const WATCHED_ADDRESS = "TFP84nTasN6G3M7SxX1XmRUP5wrX2ZeoYt";
const ACCOUNT_REF = "test_account_001";
const NILE_USDT_CONTRACT = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
const NILE_CHAIN_ID_HEX = "";
const TRX_DECIMALS = 6;
const USDT_DECIMALS = 6;

let selectedAddress = null;
let latestBackend = {};
let latestWallet = {};
let lastProviderState = {};

const el = {
  connectButton: document.getElementById("connectButton"),
  refreshButton: document.getElementById("refreshButton"),
  pollButton: document.getElementById("pollButton"),
  creditButton: document.getElementById("creditButton"),
  adminTokenInput: document.getElementById("adminTokenInput"),
  saveTokenButton: document.getElementById("saveTokenButton"),
  switchButton: document.getElementById("switchButton"),
  actionResult: document.getElementById("actionResult"),
  tronLinkStatus: document.getElementById("tronLinkStatus"),
  walletConnectedState: document.getElementById("walletConnectedState"),
  walletAddress: document.getElementById("walletAddress"),
  walletMatchShort: document.getElementById("walletMatchShort"),
  walletMatchNotice: document.getElementById("walletMatchNotice"),
  currentNetwork: document.getElementById("currentNetwork"),
  chainId: document.getElementById("chainId"),
  fullNodeHost: document.getElementById("fullNodeHost"),
  solidityNodeHost: document.getElementById("solidityNodeHost"),
  eventServerHost: document.getElementById("eventServerHost"),
  networkWarning: document.getElementById("networkWarning"),
  backendHealth: document.getElementById("backendHealth"),
  backendGlobalBalance: document.getElementById("backendGlobalBalance"),
  backendAccountBalance: document.getElementById("backendAccountBalance"),
  walletTrx: document.getElementById("walletTrx"),
  walletTrxBase: document.getElementById("walletTrxBase"),
  walletUsdt: document.getElementById("walletUsdt"),
  walletUsdtBase: document.getElementById("walletUsdtBase"),
  usdtContract: document.getElementById("usdtContract"),
  comparisonState: document.getElementById("comparisonState"),
  compareWallet: document.getElementById("compareWallet"),
  compareWatched: document.getElementById("compareWatched"),
  compareWalletUsdt: document.getElementById("compareWalletUsdt"),
  compareAccountUsdt: document.getElementById("compareAccountUsdt"),
  compareGlobalUsdt: document.getElementById("compareGlobalUsdt"),
  depositSummary: document.getElementById("depositSummary"),
  deposits: document.getElementById("deposits"),
  debugOutput: document.getElementById("debugOutput"),
};

function provider() {
  return window.tron || window.tronLink || null;
}

function tronWeb() {
  return window.tronWeb || window.tronLink?.tronWeb || null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatUnits(value, decimals) {
  const raw = BigInt(String(value || "0"));
  const scale = 10n ** BigInt(decimals);
  const whole = raw / scale;
  const fraction = raw % scale;
  if (fraction === 0n) return whole.toString();
  return `${whole}.${fraction.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
}

function shorten(value, left = 6, right = 6) {
  const text = String(value || "");
  if (text.length <= left + right + 3) return text;
  return `${text.slice(0, left)}...${text.slice(-right)}`;
}

function setStatus(node, text, kind) {
  node.textContent = text;
  node.className = `status ${kind}`;
}

async function getJson(path) {
  const response = await fetch(`${BACKEND_API_BASE}${path}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

async function postJson(path, body = undefined) {
  const headers = { "Content-Type": "application/json" };
  const token = sessionStorage.getItem("nileDappAdminToken") || "";
  if (path.startsWith("/internal/") && token) {
    headers["X-DApp-Admin-Token"] = token;
  }
  const response = await fetch(`${BACKEND_API_BASE}${path}`, {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

function readAddress() {
  const tw = tronWeb();
  selectedAddress =
    tw?.defaultAddress?.base58 ||
    window.tron?.selectedAddress ||
    window.tronLink?.tronWeb?.defaultAddress?.base58 ||
    null;
  el.walletAddress.textContent = selectedAddress || "Not connected";
  el.walletConnectedState.textContent = selectedAddress ? "Wallet connected" : "Wallet not connected";
  return selectedAddress;
}

async function requestAccounts() {
  const tron = window.tron;
  try {
    if (tron?.request) {
      await tron.request({
        method: "tron_requestAccounts",
        params: {
          websiteName: "Nile Bridge Test",
          websiteIcon: window.location.origin + "/favicon.ico",
        },
      });
    } else if (window.tronLink?.request) {
      await window.tronLink.request({ method: "tron_requestAccounts" });
    }
    await refreshAll();
  } catch (error) {
    setStatus(el.actionResult, `Connect failed: ${error.message}`, "error");
  }
}

function detectNetwork() {
  const tw = tronWeb();
  const fullNode = tw?.fullNode?.host || "";
  const solidityNode = tw?.solidityNode?.host || "";
  const eventServer = tw?.eventServer?.host || "";
  const chainId =
    window.tron?.chainId ||
    window.tron?.networkVersion ||
    window.tronLink?.chainId ||
    window.tronLink?.networkVersion ||
    "";
  const hostText = [fullNode, solidityNode, eventServer].join(" ").toLowerCase();
  const isNile = hostText.includes("nile");
  const name = isNile ? TARGET_NETWORK_NAME : fullNode || chainId || "Unknown";
  return { name, isNile, fullNode, solidityNode, eventServer, chainId };
}

function snapshotProviderState() {
  const tw = tronWeb();
  const network = detectNetwork();
  lastProviderState = {
    tronDetected: Boolean(window.tron),
    tronLinkDetected: Boolean(window.tronLink),
    tronWebDetected: Boolean(tw),
    selectedAddress,
    defaultAddress: tw?.defaultAddress || null,
    network,
  };
  return lastProviderState;
}

async function requestSwitchToNile() {
  if (!NILE_CHAIN_ID_HEX) {
    setStatus(el.actionResult, "Nile chainId is not configured. Use the manual switch instructions.", "warning");
    return;
  }
  try {
    await window.tron.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: NILE_CHAIN_ID_HEX }],
    });
    await refreshWallet();
    setStatus(el.actionResult, "Switch request sent to TronLink.", "ok");
  } catch (error) {
    setStatus(el.actionResult, `Programmatic switch failed: ${error.message}`, "error");
  }
}

async function refreshBackend() {
  const [health, status, balance, accounts, accountBalance, deposits] = await Promise.all([
    getJson("/health"),
    getJson("/status"),
    getJson("/balance"),
    getJson("/accounts"),
    getJson(`/accounts/${ACCOUNT_REF}/balance`),
    getJson("/deposits"),
  ]);
  latestBackend = { health, status, balance, accounts, accountBalance, deposits };

  const globalUsdt = balance.global?.USDT || balance.indexed_internal_balances?.USDT;
  const accountUsdt = accountBalance.balances?.USDT;
  el.backendHealth.textContent = `Backend: ${health.status}`;
  el.backendGlobalBalance.textContent = `${globalUsdt?.human || "0"} USDT`;
  el.backendAccountBalance.textContent = `${accountUsdt?.human || "0"} USDT`;
  el.usdtContract.textContent = status.nile_usdt_contract_configured ? NILE_USDT_CONTRACT : "Not configured";
  el.compareWatched.textContent = status.watch_address || WATCHED_ADDRESS;
  el.compareAccountUsdt.textContent = `${accountUsdt?.human || "0"} USDT`;
  el.compareGlobalUsdt.textContent = `${globalUsdt?.human || "0"} USDT`;
  renderDeposits(deposits.deposits || []);
}

async function refreshWallet() {
  const hasProvider = Boolean(provider() || tronWeb());
  el.tronLinkStatus.textContent = hasProvider ? "Detected" : "Not detected";
  const address = readAddress();
  const network = detectNetwork();
  latestWallet = { address, network, trx: null, usdt: null, errors: {} };
  snapshotProviderState();

  el.currentNetwork.textContent = network.name;
  el.chainId.textContent = network.chainId ? `chainId ${network.chainId}` : "chainId unavailable";
  el.fullNodeHost.textContent = network.fullNode || "Unavailable";
  el.solidityNodeHost.textContent = network.solidityNode || "Unavailable";
  el.eventServerHost.textContent = network.eventServer || "Unavailable";
  el.networkWarning.classList.toggle("hidden", network.isNile);

  updateWalletMatch(address);

  if (!address || !tronWeb()) {
    el.walletTrx.textContent = "Unavailable";
    el.walletTrxBase.textContent = "base units unavailable";
    el.walletUsdt.textContent = "Unavailable";
    el.walletUsdtBase.textContent = "base units unavailable";
    updateComparison();
    return;
  }

  try {
    const trx = await tronWeb().trx.getBalance(address);
    latestWallet.trx = String(trx);
    el.walletTrx.textContent = `${formatUnits(trx, TRX_DECIMALS)} TRX`;
    el.walletTrxBase.textContent = `${trx} SUN`;
  } catch (error) {
    latestWallet.errors.trx = error.message;
    el.walletTrx.textContent = "Wallet-side TRX read failed";
    el.walletTrxBase.textContent = error.message;
  }

  try {
    const contract = await tronWeb().contract().at(NILE_USDT_CONTRACT);
    const raw = await contract.balanceOf(address).call();
    latestWallet.usdt = raw.toString();
    el.walletUsdt.textContent = `${formatUnits(latestWallet.usdt, USDT_DECIMALS)} USDT`;
    el.walletUsdtBase.textContent = `${latestWallet.usdt} base units`;
  } catch (error) {
    latestWallet.errors.usdt = error.message;
    el.walletUsdt.textContent = "Wallet-side USDT read failed";
    el.walletUsdtBase.textContent = error.message;
  }

  updateComparison();
}

function updateWalletMatch(address) {
  if (!address) {
    el.walletMatchShort.textContent = "Match unknown";
    el.walletMatchNotice.className = "notice muted";
    el.walletMatchNotice.innerHTML =
      "<strong>Wallet match status unavailable.</strong><span>Connect TronLink to compare the selected wallet with the watched backend address.</span>";
    return;
  }
  const matches = address === WATCHED_ADDRESS;
  el.walletMatchShort.textContent = matches ? "Matches watched address" : "Different from watched address";
  el.walletMatchNotice.className = matches ? "notice ok" : "notice warning";
  el.walletMatchNotice.innerHTML = matches
    ? "<strong>Connected wallet matches watched Nile address.</strong>"
    : "<strong>Connected wallet does not match the watched Nile address.</strong><span>Backend balance belongs to test_account_001, not necessarily to the connected wallet.</span>";
}

function updateComparison() {
  const globalUsdt = latestBackend.balance?.global?.USDT;
  const accountUsdt = latestBackend.accountBalance?.balances?.USDT;
  el.compareWallet.textContent = selectedAddress || "Not connected";
  el.compareWalletUsdt.textContent = latestWallet.usdt
    ? `${formatUnits(latestWallet.usdt, USDT_DECIMALS)} USDT`
    : "Unavailable";
  el.compareAccountUsdt.textContent = accountUsdt ? `${accountUsdt.human} USDT` : "Loading...";
  el.compareGlobalUsdt.textContent = globalUsdt ? `${globalUsdt.human} USDT` : "Loading...";

  if (!selectedAddress) {
    setStatus(el.comparisonState, "Waiting for wallet", "muted");
    return;
  }
  if (selectedAddress !== WATCHED_ADDRESS) {
    setStatus(el.comparisonState, "Connected wallet differs from watched address", "warning");
    return;
  }
  if (!latestWallet.usdt || !accountUsdt) {
    setStatus(el.comparisonState, "Wallet or backend balance unavailable", "pending");
    return;
  }
  if (latestWallet.usdt === accountUsdt.amount_base_units) {
    setStatus(el.comparisonState, "Wallet and backend indexed balance appear aligned.", "ok");
  } else {
    setStatus(
      el.comparisonState,
      "Wallet-side balance and backend indexed balance differ. This may mean not all transfers are indexed or backend crediting is pending.",
      "warning",
    );
  }
}

function renderDeposits(deposits) {
  const credited = deposits.filter((item) => item.status === "credited").length;
  setStatus(
    el.depositSummary,
    `${deposits.length} deposits, ${credited} credited`,
    credited === deposits.length ? "ok" : "pending",
  );
  el.deposits.innerHTML = deposits
    .map((item) => {
      const amount = formatUnits(item.amount_base_units, item.decimals || USDT_DECIMALS);
      return `<tr>
        <td>${copyable(shorten(item.tx_hash, 8, 8), item.tx_hash)}</td>
        <td>${escapeHtml(item.asset_symbol)}</td>
        <td>${amount}</td>
        <td>${escapeHtml(item.amount_base_units)}</td>
        <td>${copyable(shorten(item.from_address), item.from_address)}</td>
        <td>${copyable(shorten(item.to_address), item.to_address)}</td>
        <td><span class="status ${item.status === "credited" ? "ok" : "pending"}">${escapeHtml(item.status)}</span></td>
        <td>${escapeHtml(item.account_ref || "")}</td>
        <td>${item.ledger_entry_exists ? "yes" : "no"}</td>
        <td>${escapeHtml(item.detected_at || "")}</td>
        <td>${escapeHtml(item.confirmed_at || "")}</td>
      </tr>`;
    })
    .join("");
}

function copyable(label, value) {
  if (!value) return "";
  return `<button class="copy" data-copy="${escapeHtml(value)}" title="Copy full value">${escapeHtml(label)}</button>`;
}

async function refreshAll() {
  try {
    await refreshBackend();
  } catch (error) {
    latestBackend.error = error.message;
    el.backendHealth.textContent = `Backend: unavailable (${error.message})`;
  }
  await refreshWallet();
  renderDebug();
}

async function pollNileNow() {
  try {
    const result = await postJson("/internal/poll-once");
    setStatus(el.actionResult, `Poll complete: USDT inserted ${result.inserted?.USDT ?? 0}`, "ok");
    await refreshAll();
  } catch (error) {
    setStatus(el.actionResult, `Poll failed: ${error.message}`, "error");
  }
}

async function creditDetectedDeposits() {
  try {
    const result = await postJson("/internal/credit-detected");
    const usdt = result.credited?.USDT;
    const message = usdt
      ? `Credited ${usdt.count} USDT deposits (${usdt.human} USDT). Re-running is idempotent.`
      : "No eligible deposits to credit. Re-running is idempotent and must not double-credit.";
    setStatus(el.actionResult, message, "ok");
    await refreshAll();
  } catch (error) {
    setStatus(el.actionResult, `Credit failed: ${error.message}`, "error");
  }
}

function renderDebug() {
  el.debugOutput.textContent = JSON.stringify(
    {
      status: latestBackend.status || null,
      balance: latestBackend.balance || null,
      accounts: latestBackend.accounts || null,
      accountBalance: latestBackend.accountBalance || null,
      deposits: latestBackend.deposits || null,
      tronLinkProviderState: lastProviderState,
      walletReadErrors: latestWallet.errors || {},
    },
    null,
    2,
  );
}

function attachEvents() {
  el.connectButton.addEventListener("click", requestAccounts);
  el.refreshButton.addEventListener("click", refreshAll);
  el.switchButton.addEventListener("click", requestSwitchToNile);
  el.pollButton.addEventListener("click", pollNileNow);
  el.creditButton.addEventListener("click", creditDetectedDeposits);
  el.saveTokenButton.addEventListener("click", () => {
    sessionStorage.setItem("nileDappAdminToken", el.adminTokenInput.value);
    setStatus(el.actionResult, "Admin token stored for this browser tab.", "ok");
  });

  document.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.dataset.copy) return;
    await navigator.clipboard.writeText(target.dataset.copy);
    setStatus(el.actionResult, "Copied value to clipboard.", "ok");
  });

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

el.usdtContract.textContent = NILE_USDT_CONTRACT;
attachEvents();
refreshAll();
setInterval(refreshAll, 15000);
