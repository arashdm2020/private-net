const BACKEND_API_BASE = "/api";
const BACKEND_UPSTREAM = "http://127.0.0.1:8787";
const TARGET_NETWORK_NAME = "Nile Testnet";
const NILE_USDT_CONTRACT = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
const NILE_CHAIN_ID_HEX = "";
const USDT_DECIMALS = 6;

let selectedAddress = null;

const el = {
  connectButton: document.getElementById("connectButton"),
  refreshButton: document.getElementById("refreshButton"),
  switchButton: document.getElementById("switchButton"),
  tronLinkStatus: document.getElementById("tronLinkStatus"),
  walletAddress: document.getElementById("walletAddress"),
  currentNetwork: document.getElementById("currentNetwork"),
  networkWarning: document.getElementById("networkWarning"),
  manualSwitch: document.getElementById("manualSwitch"),
  backendHealth: document.getElementById("backendHealth"),
  backendBalance: document.getElementById("backendBalance"),
  walletTrx: document.getElementById("walletTrx"),
  walletUsdt: document.getElementById("walletUsdt"),
  usdtContract: document.getElementById("usdtContract"),
  deposits: document.getElementById("deposits"),
};

function provider() {
  return window.tron || window.tronLink || null;
}

function tronWeb() {
  return window.tronWeb || null;
}

function formatUnits(value, decimals) {
  const raw = BigInt(String(value || "0"));
  const scale = 10n ** BigInt(decimals);
  const whole = raw / scale;
  const fraction = raw % scale;
  if (fraction === 0n) return whole.toString();
  return `${whole}.${fraction.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
}

async function getJson(path) {
  const response = await fetch(`${BACKEND_API_BASE}${path}`, { cache: "no-store" });
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
  return selectedAddress;
}

async function requestAccounts() {
  const tron = window.tron;
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
  readAddress();
  await refreshWallet();
}

function detectNetwork() {
  const tw = tronWeb();
  const host = [
    tw?.fullNode?.host,
    tw?.solidityNode?.host,
    tw?.eventServer?.host,
  ]
    .filter(Boolean)
    .join(" ");
  const lowerHost = host.toLowerCase();
  if (lowerHost.includes("nile")) {
    return { name: "Nile Testnet", isNile: true, detail: host };
  }
  if (!host) {
    return { name: "Unknown", isNile: false, detail: "" };
  }
  return { name: host, isNile: false, detail: host };
}

async function requestSwitchToNile() {
  el.manualSwitch.classList.add("hidden");
  if (!NILE_CHAIN_ID_HEX) {
    el.manualSwitch.classList.remove("hidden");
    return;
  }
  try {
    await window.tron.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: NILE_CHAIN_ID_HEX }],
    });
    await refreshWallet();
  } catch (error) {
    console.warn("Programmatic Nile switch failed", error);
    el.manualSwitch.classList.remove("hidden");
  }
}

async function refreshBackend() {
  try {
    const [health, status, balance, deposits] = await Promise.all([
      getJson("/health"),
      getJson("/status"),
      getJson("/balance"),
      getJson("/deposits"),
    ]);
    el.backendHealth.textContent = `Backend: ${health.status}`;
    const usdt = balance.global?.USDT || balance.indexed_internal_balances?.USDT;
    el.backendBalance.textContent = `${usdt?.human || "0"} USDT`;
    el.usdtContract.textContent = status.nile_usdt_contract_configured
      ? NILE_USDT_CONTRACT
      : "Not configured";
    el.deposits.innerHTML = deposits.deposits
      .map((item) => {
        const amount = formatUnits(item.amount_base_units, item.decimals || USDT_DECIMALS);
        return `<tr>
          <td>${item.account_ref || ""}</td>
          <td>${item.asset_symbol}</td>
          <td>${amount}</td>
          <td>${item.status}</td>
          <td>${item.tx_hash}</td>
        </tr>`;
      })
      .join("");
  } catch (error) {
    el.backendHealth.textContent = `Backend: unavailable (${error.message})`;
  }
}

async function refreshWallet() {
  const hasProvider = Boolean(provider() || tronWeb());
  el.tronLinkStatus.textContent = hasProvider ? "Available" : "Not detected";
  const address = readAddress();
  const network = detectNetwork();
  el.currentNetwork.textContent = network.name;
  el.networkWarning.classList.toggle("hidden", network.isNile);

  if (!address || !tronWeb()) {
    el.walletTrx.textContent = "Unavailable";
    el.walletUsdt.textContent = "Unavailable";
    return;
  }

  try {
    const trx = await tronWeb().trx.getBalance(address);
    el.walletTrx.textContent = `${formatUnits(trx, 6)} TRX`;
  } catch (error) {
    el.walletTrx.textContent = `Unavailable (${error.message})`;
  }

  try {
    const contract = await tronWeb().contract().at(NILE_USDT_CONTRACT);
    const raw = await contract.balanceOf(address).call();
    el.walletUsdt.textContent = `${formatUnits(raw.toString(), USDT_DECIMALS)} USDT`;
  } catch (error) {
    el.walletUsdt.textContent = `Unavailable (${error.message})`;
  }
}

async function refreshAll() {
  await Promise.all([refreshBackend(), refreshWallet()]);
}

function attachEvents() {
  el.connectButton.addEventListener("click", requestAccounts);
  el.refreshButton.addEventListener("click", refreshAll);
  el.switchButton.addEventListener("click", requestSwitchToNile);

  const tron = window.tron;
  if (tron?.on) {
    tron.on("accountsChanged", refreshWallet);
    tron.on("chainChanged", refreshWallet);
  }

  window.addEventListener("message", (event) => {
    const message = event.data?.message;
    if (message?.action === "accountsChanged" || message?.action === "setNode") {
      refreshWallet();
    }
  });
}

el.usdtContract.textContent = NILE_USDT_CONTRACT;
attachEvents();
refreshAll();
setInterval(refreshAll, 15000);
