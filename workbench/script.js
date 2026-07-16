function safeJsonParse(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

const state = {
  plan: window.MVP_PLAN || {
    id: "pilot",
    name: "试点销售版",
    maxGenerations: 50,
    validDays: 14,
    priceText: "企业本地试用授权",
    upgradeText: "当前授权额度已用完，请联系服务方续期或开通新的授权。"
  },
  license: safeJsonParse(localStorage.getItem(`ft_license_${window.MVP_PLAN?.id || "pilot"}`), null),
  planStart: localStorage.getItem(`ft_plan_start_${window.MVP_PLAN?.id || "pilot"}`) || new Date().toISOString(),
  planUsed: Number(localStorage.getItem(`ft_plan_used_${window.MVP_PLAN?.id || "pilot"}`) || 0),
  workspaceId: "guest",
  account: safeJsonParse(localStorage.getItem(`ft_current_account_${window.MVP_PLAN?.id || "pilot"}`), null),
  selectedLoginRole: "主账号",
  todayCount: 0,
  leads: [],
  products: [],
  business: null,
  activeCustomerFilter: "all",
  selectedCustomerId: "c1",
  selectedOrderId: "o1",
  selectedDocId: "d1",
  selectedDocType: "PI",
  templates: defaultTemplates(),
  deletedProducts: [],
  inquiryQueue: [],
  inquiryArchive: [],
  lastInquiryReport: "",
  inquiryArchiveSearch: "",
  productSearch: "",
  customerSearch: "",
  orderSearch: "",
  activeOnboardingStep: 0,
  lastReply: "",
  lastFollowup: "",
  lastInquiryContext: null,
  logs: [],
  sampleIndex: 0
};

function storageAvailable() {
  try {
    const key = "__ft_storage_test__";
    localStorage.setItem(key, "1");
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

const storageOk = storageAvailable();

function setLocal(key, value) {
  if (!storageOk) {
    showToast("本地存储不可用，本次数据仅临时保留。", "warn");
    return;
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    showToast("本地存储空间不足，请导出数据或清理浏览器缓存。", "warn");
  }
}

function getLocal(key, fallback = null) {
  if (!storageOk) return fallback;
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function removeLocal(key) {
  if (!storageOk) return;
  try {
    localStorage.removeItem(key);
  } catch {
    showToast("本地存储暂时不可写，请检查浏览器设置。", "warn");
  }
}

function showToast(text, type = "info", duration = 2200) {
  const toast = document.getElementById("globalToast");
  if (!toast) return;
  toast.textContent = text;
  toast.className = `global-toast show ${type}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.className = "global-toast";
  }, duration);
}

window.addEventListener("error", () => {
  showToast("系统检测到页面脚本异常，请刷新或联系服务方。", "error", 3600);
});

window.addEventListener("unhandledrejection", () => {
  showToast("系统检测到异步操作异常，请稍后重试。", "error", 3600);
});

function setButtonLoading(button, loading, text) {
  if (!button) return;
  button.disabled = !!loading;
  button.classList.toggle("is-loading", !!loading);
  const span = button.querySelector("span");
  if (span && text) span.textContent = text;
}

function debounce(fn, wait = 400) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function logAction(text) {
  state.logs.unshift({ text, time: new Date().toLocaleString("zh-CN") });
  state.logs = state.logs.slice(0, 80);
}

setLocal(`ft_plan_start_${state.plan.id}`, state.planStart);

function safeKey(value) {
  return String(value || "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "unknown";
}

function workspaceIdFromLicense(license) {
  if (!license) return `guest_${state.plan.id}`;
  return `${state.plan.id}_${safeKey(license.customer || license.licenseId)}`;
}

function legacyWorkspaceIdFromLicenseAccount(license, account) {
  if (!license || !account?.account) return "";
  return `${state.plan.id}_${safeKey(license.customer || license.licenseId)}_user_${safeKey(account.account)}`;
}

function companyAccountScopeKey() {
  if (!state.license) return state.plan.id;
  return workspaceIdFromLicense(state.license);
}

function accountListKey() {
  return `ft_accounts_${companyAccountScopeKey()}`;
}

function currentAccountKey() {
  return `ft_current_account_${companyAccountScopeKey()}`;
}

function legacyPlanAccountListKey() {
  return `ft_accounts_${state.plan.id}`;
}

function legacyPlanCurrentAccountKey() {
  return `ft_current_account_${state.plan.id}`;
}

function getAccounts() {
  return normalizeAccounts(safeJsonParse(getLocal(accountListKey(), "[]"), []));
}

function saveAccounts(accounts) {
  setLocal(accountListKey(), JSON.stringify(normalizeAccounts(accounts)));
}

function normalizeAccounts(accounts) {
  const list = Array.isArray(accounts) ? accounts : [];
  let masterSeen = false;
  return list.map((item, index) => {
    let role = item.role || "";
    if (role.includes("管理员") && index === 0 && !masterSeen) role = "主账号";
    if (!role) role = index === 0 && !masterSeen ? "主账号" : "业务员子账号";
    if (role === "普通子账号") role = "业务员子账号";
    if (role === "主账号") masterSeen = true;
    return {
      ...item,
      role,
      parentAccount: item.parentAccount || "",
      recoveryCode: item.recoveryCode || ""
    };
  });
}

function workspaceSnapshot() {
  return {
    app: "曜海 GlobalTrade AI",
    version: "local-commercial-mvp",
    exportedAt: new Date().toISOString(),
    plan: state.plan,
    license: state.license,
    workspaceId: state.workspaceId,
    accountScope: companyAccountScopeKey(),
    accounts: getAccounts().map((item) => ({ ...item, password: item.password ? "***" : "" })),
    data: {
      todayCount: state.todayCount,
      products: state.products,
      leads: state.leads,
      business: state.business,
      templates: state.templates,
      deletedProducts: state.deletedProducts,
      inquiryQueue: state.inquiryQueue,
      inquiryArchive: state.inquiryArchive,
      logs: state.logs
    }
  };
}

function accountSessionValid() {
  if (!state.account) return false;
  return getAccounts().some((item) => item.account === state.account.account && item.password === state.account.password);
}

function currentRole() {
  return state.account?.role || "业务员子账号";
}

function roleRank(role) {
  if (role === "主账号") return 3;
  if (role === "管理员子账号") return 2;
  return 1;
}

function roleLabel(role) {
  return role === "业务员子账号" ? "普通子账号" : role;
}

function accountLimitsForPlan(planId = state.plan.id) {
  const limits = {
    free: { master: 1, admin: 0, user: 0, label: "1 个主账号，不含子账号" },
    pilot: { master: 1, admin: 1, user: 2, label: "1 个主账号 + 1 个管理员子账号 + 2 个普通子账号" },
    monthly: { master: 1, admin: 2, user: 5, label: "1 个主账号 + 2 个管理员子账号 + 5 个普通子账号" },
    permanent_basic: { master: 1, admin: 0, user: 0, label: "1 个主账号，不含子账号" },
    permanent_standard: { master: 1, admin: 2, user: 0, label: "1 个主账号 + 2 个管理员子账号，不含普通子账号" },
    permanent_premium: { master: 1, admin: 5, user: Infinity, label: "1 个主账号 + 5 个管理员子账号 + 不限普通子账号" }
  };
  return limits[planId] || { master: 1, admin: 1, user: 2, label: "1 个主账号 + 1 个管理员子账号 + 2 个普通子账号" };
}

function countAccountsByRole(accounts = getAccounts()) {
  return {
    master: accounts.filter((item) => item.role === "主账号").length,
    admin: accounts.filter((item) => item.role === "管理员子账号").length,
    user: accounts.filter((item) => item.role === "业务员子账号").length
  };
}

function formatLimitValue(value) {
  return value === Infinity ? "不限" : String(value);
}

function accountLimitMessage(role, accounts = getAccounts()) {
  const limits = accountLimitsForPlan();
  const counts = countAccountsByRole(accounts);
  const map = {
    "主账号": ["master", "主账号"],
    "管理员子账号": ["admin", "管理员子账号"],
    "业务员子账号": ["user", "普通子账号"]
  };
  const [key, label] = map[role] || map["业务员子账号"];
  const limit = limits[key];
  if (limit !== Infinity && counts[key] >= limit) {
    return `当前${state.plan.name}账号额度为：${limits.label}。${label}已达上限 ${formatLimitValue(limit)} 个。`;
  }
  return "";
}

function canCreateRole(targetRole, creator = state.account, accounts = getAccounts()) {
  if (accountLimitMessage(targetRole, accounts)) return false;
  if (targetRole === "主账号") return !accounts.some((item) => item.role === "主账号");
  if (!creator) return accounts.length === 0 && targetRole === "主账号";
  if (creator.role === "主账号") return targetRole === "管理员子账号" || targetRole === "业务员子账号";
  if (creator.role === "管理员子账号") return targetRole === "业务员子账号";
  return false;
}

function findAccount(accountName, accounts = getAccounts()) {
  return accounts.find((item) => String(item.account || "").trim().toLowerCase() === String(accountName || "").trim().toLowerCase());
}

function canDeleteData() {
  return currentRole() === "主账号" || currentRole() === "管理员子账号" || currentRole().includes("主管") || currentRole().includes("老板");
}

function saveCurrentAccount(account) {
  state.account = account;
  setLocal(currentAccountKey(), JSON.stringify(account));
  saveState();
}

function clearCurrentAccount() {
  state.account = null;
  removeLocal(currentAccountKey());
}

function storageKey(name) {
  return `ft_workspace_${state.workspaceId}_${name}`;
}

function workspaceStorageKey(workspaceId, name) {
  return `ft_workspace_${workspaceId}_${name}`;
}

function loadWorkspaceData() {
  const legacyAccount = state.account;
  state.workspaceId = workspaceIdFromLicense(state.license);
  migrateLegacyPlanAccounts();
  state.account = state.license ? safeJsonParse(getLocal(currentAccountKey(), "null"), null) : null;
  migrateLegacyAccountWorkspace(legacyAccount);
  state.todayCount = Number(getLocal(storageKey("today_count"), "0") || 0);
  state.leads = safeJsonParse(getLocal(storageKey("leads"), "[]"), []);
  state.products = safeJsonParse(getLocal(storageKey("products"), "null"), null) || defaultProducts();
  state.business = safeJsonParse(getLocal(storageKey("business_data"), "null"), null) || defaultBusinessData();
  normalizeBusinessData();
  state.templates = normalizeTemplates(safeJsonParse(getLocal(storageKey("templates"), "null"), null));
  state.deletedProducts = safeJsonParse(getLocal(storageKey("deleted_products"), "[]"), []);
  state.inquiryQueue = safeJsonParse(getLocal(storageKey("inquiry_queue"), "[]"), []);
  state.inquiryArchive = safeJsonParse(getLocal(storageKey("inquiry_archive"), "[]"), []);
  state.logs = safeJsonParse(getLocal(storageKey("operation_logs"), "[]"), []);
}

function normalizeTemplates(input) {
  return { ...defaultTemplates(), ...(input || {}) };
}

function migrateLegacyPlanAccounts() {
  if (!state.license) return;
  const scopedKey = accountListKey();
  const legacyKey = legacyPlanAccountListKey();
  if (scopedKey === legacyKey) return;
  const scopedAccounts = safeJsonParse(getLocal(scopedKey, "[]"), []);
  const legacyAccounts = safeJsonParse(getLocal(legacyKey, "[]"), []);
  if (!scopedAccounts.length && legacyAccounts.length) {
    const migrated = legacyAccounts.map((item, index) => ({
      ...item,
      role: item.role || (index === 0 ? "主账号" : "业务员子账号"),
      parentAccount: item.parentAccount || "",
      recoveryCode: item.recoveryCode || "",
      workspaceId: state.workspaceId,
      licenseId: state.license.licenseId || ""
    }));
    setLocal(scopedKey, JSON.stringify(migrated));
  }
  const currentKey = currentAccountKey();
  const legacyCurrent = safeJsonParse(getLocal(legacyPlanCurrentAccountKey(), "null"), null);
  if (!getLocal(currentKey, "") && legacyCurrent) {
    setLocal(currentKey, JSON.stringify({
      ...legacyCurrent,
      workspaceId: state.workspaceId,
      licenseId: state.license.licenseId || ""
    }));
  }
}

function migrateLegacyAccountWorkspace(account) {
  const legacyWorkspaceId = legacyWorkspaceIdFromLicenseAccount(state.license, account);
  if (!legacyWorkspaceId || legacyWorkspaceId === state.workspaceId) return;
  const migratedFlag = workspaceStorageKey(state.workspaceId, `migrated_${legacyWorkspaceId}`);
  if (getLocal(migratedFlag, "")) return;
  const names = ["today_count", "products", "leads", "business_data", "templates", "deleted_products", "inquiry_queue", "inquiry_archive", "operation_logs"];
  let moved = false;
  names.forEach((name) => {
    const currentKey = workspaceStorageKey(state.workspaceId, name);
    const legacyKey = workspaceStorageKey(legacyWorkspaceId, name);
    const currentValue = getLocal(currentKey, "");
    const legacyValue = getLocal(legacyKey, "");
    if ((!currentValue || currentValue === "[]" || currentValue === "null") && legacyValue) {
      setLocal(currentKey, legacyValue);
      moved = true;
    }
  });
  if (moved) setLocal(migratedFlag, new Date().toISOString());
}

function rememberWorkspaceIndex() {
  if (!state.license) return;
  const list = safeJsonParse(getLocal("ft_workspace_index", "[]"), []);
  const record = {
    workspaceId: state.workspaceId,
    customer: state.license.customer || "未填写客户",
    planId: state.plan.id,
    planName: state.plan.name,
    updatedAt: Date.now()
  };
  const next = [record, ...list.filter((item) => item.workspaceId !== state.workspaceId)].slice(0, 100);
  setLocal("ft_workspace_index", JSON.stringify(next));
}

function applyWebsiteTrialEntry() {
  const params = new URLSearchParams(window.location.search);
  const publicWorkbench = /(^|\.)haoleyun\.xyz$/i.test(window.location.hostname) || window.location.pathname.includes("/workbench");
  if (params.get("websiteTrial") !== "1" && !publicWorkbench) return;
  const now = Date.now();
  const license = {
    licenseId: "WEB-FREE-TRIAL-HAOLEYUN",
    planId: state.plan.id,
    customer: "haoleyun.xyz 官网免费体验",
    validDays: state.plan.validDays || 3,
    maxGenerations: state.plan.maxGenerations || 5,
    issuedAt: now,
    activatedAt: now,
    expiresAt: now + (state.plan.validDays || 3) * 86400000,
    source: "website"
  };
  state.license = license;
  state.planUsed = Number(getLocal(`ft_plan_used_${state.plan.id}`, "0") || 0);
  if (state.planUsed >= license.maxGenerations || Date.now() > license.expiresAt) {
    state.planUsed = 0;
  }
  setLocal(`ft_license_${state.plan.id}`, JSON.stringify(license));
  setLocal(`ft_plan_used_${state.plan.id}`, String(state.planUsed));
  state.workspaceId = workspaceIdFromLicense(license);
  const account = {
    name: "官网体验账号",
    company: "haoleyun.xyz 官网访客",
    account: "demo",
    password: "demo123",
    role: "主账号",
    parentAccount: "",
    recoveryCode: "haoleyun",
    createdAt: new Date(now).toLocaleString("zh-CN"),
    workspaceId: state.workspaceId,
    licenseId: license.licenseId
  };
  const scopedKey = `ft_accounts_${workspaceIdFromLicense(license)}`;
  const currentKey = `ft_current_account_${workspaceIdFromLicense(license)}`;
  setLocal(scopedKey, JSON.stringify([account]));
  setLocal(currentKey, JSON.stringify(account));
  state.account = account;
}

applyWebsiteTrialEntry();
loadWorkspaceData();

function bootLicenseGate() {
  $("loginPlan").textContent = state.license
    ? `${state.plan.name}｜公司授权：${state.license.customer || state.license.licenseId}｜请登录或注册公司账号`
    : `${state.plan.name}｜${state.plan.priceText}`;
  enforceLicenseExpiry();
  const active = licenseActive();
  const accountActive = active && accountSessionValid();
  document.body.classList.toggle("locked", !accountActive);
  $("loginScreen").classList.toggle("show", !accountActive);
  if (!active) {
    showLicenseStage();
    $("licenseInput").value = "";
  } else if (!accountActive) {
    showAccountStage();
  }
  renderAccountState();
}

function licenseActive() {
  if (!state.license) return false;
  if (state.license.planId !== state.plan.id) return false;
  if (Date.now() > state.license.expiresAt) return false;
  if (!hasUnlimitedQuota() && state.planUsed >= state.license.maxGenerations) return false;
  return true;
}

function hasUnlimitedQuota() {
  return state.plan.id === "monthly" || state.plan.id.startsWith("permanent");
}

function exhaustedLicenses() {
  return safeJsonParse(getLocal(`ft_exhausted_licenses_${state.plan.id}`, "[]"), []);
}

function markLicenseExhausted(reason) {
  if (!state.license?.licenseId) return;
  const list = exhaustedLicenses();
  if (!list.some((item) => item.licenseId === state.license.licenseId)) {
    list.push({
      licenseId: state.license.licenseId,
      customer: state.license.customer,
      reason,
      endedAt: Date.now()
    });
    setLocal(`ft_exhausted_licenses_${state.plan.id}`, JSON.stringify(list));
  }
}

function expireCurrentLicense(reason, message) {
  markLicenseExhausted(reason);
  removeLocal(`ft_license_${state.plan.id}`);
  state.license = null;
  $("licenseError").textContent = message;
  bootLicenseGate();
  renderAll();
}

function enforceLicenseExpiry() {
  if (!state.license) return false;
  if (state.license.planId !== state.plan.id) {
    removeLocal(`ft_license_${state.plan.id}`);
    state.license = null;
    return false;
  }
  if (Date.now() > state.license.expiresAt) {
    markLicenseExhausted("expired");
    removeLocal(`ft_license_${state.plan.id}`);
    state.license = null;
    $("licenseError").textContent = "当前授权已到期，请续费后输入新的授权秘钥。";
    return false;
  }
  return true;
}

function startLicenseWatch() {
  enforceLicenseExpiry();
  bootLicenseGate();
  setInterval(() => {
    updateCountdown();
    if (!enforceLicenseExpiry()) {
      bootLicenseGate();
      renderAll();
    }
  }, 1000);
}

function showSplash(callback) {
  const splash = $("splashScreen");
  if (!splash) {
    callback();
    return;
  }
  splash.classList.add("show");
  const steps = [
    ["正在校验授权与本地资料", 18],
    ["正在加载客户与产品资料库", 46],
    ["正在准备询盘处理引擎", 72],
    ["正在进入业务工作台", 100]
  ];
  let index = 0;
  const renderStep = () => {
    if ($("splashStatus")) $("splashStatus").textContent = steps[index][0];
    if ($("splashProgress")) $("splashProgress").textContent = `${steps[index][1]}%`;
    index += 1;
  };
  renderStep();
  const timer = setInterval(() => {
    if (index >= steps.length) {
      clearInterval(timer);
      return;
    }
    renderStep();
  }, 320);
  setTimeout(() => {
    clearInterval(timer);
    if ($("splashProgress")) $("splashProgress").textContent = "100%";
    splash.classList.remove("show");
    callback();
  }, 1400);
}

function formatRemaining(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days} 天 ${hours} 小时 ${minutes} 分 ${seconds} 秒`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分 ${seconds} 秒`;
  return `${minutes} 分 ${seconds} 秒`;
}

function updateCountdown() {
  if (!$("countdownText")) return;
  if (!state.license) {
    $("countdownText").textContent = "等待激活";
    return;
  }
  const left = state.license.expiresAt - Date.now();
  if (left <= 0) {
    $("countdownText").textContent = "已到期";
    expireCurrentLicense("expired", "当前授权已到期，请续费后输入新的授权秘钥。");
    return;
  }
  $("countdownText").textContent = `倒计时：${formatRemaining(left)}`;
}

function showLicenseStage() {
  $("licenseStage")?.classList.add("active");
  $("accountStage")?.classList.remove("active");
}

function showAccountStage() {
  $("licenseStage")?.classList.remove("active");
  $("accountStage")?.classList.add("active");
  showLoginTab();
}

function showRegisterStage() {
  $("licenseStage")?.classList.remove("active");
  $("accountStage")?.classList.add("active");
  showRegisterTab();
}

function showLoginTab() {
  $("showLoginTab")?.classList.add("active");
  $("showRegisterTab")?.classList.remove("active");
  $("showRecoverTab")?.classList.remove("active");
  $("loginForm")?.classList.add("active");
  $("registerForm")?.classList.remove("active");
  $("recoverForm")?.classList.remove("active");
}

function showRegisterTab() {
  $("showRegisterTab")?.classList.add("active");
  $("showLoginTab")?.classList.remove("active");
  $("showRecoverTab")?.classList.remove("active");
  $("registerForm")?.classList.add("active");
  $("loginForm")?.classList.remove("active");
  $("recoverForm")?.classList.remove("active");
  if ($("registerRole")) $("registerRole").value = state.selectedLoginRole;
  updateRegisterRoleHint();
}

function showRecoverTab() {
  $("showLoginTab")?.classList.remove("active");
  $("showRegisterTab")?.classList.remove("active");
  $("showRecoverTab")?.classList.add("active");
  $("loginForm")?.classList.remove("active");
  $("registerForm")?.classList.remove("active");
  $("recoverForm")?.classList.add("active");
}

function setLoginRole(role) {
  state.selectedLoginRole = role;
  document.querySelectorAll("[data-login-role]").forEach((btn) => btn.classList.toggle("active", btn.dataset.loginRole === role));
  if ($("loginRoleHint")) $("loginRoleHint").textContent = `当前登录方向：${roleLabel(role)}`;
  if ($("registerRole")) $("registerRole").value = role;
  updateRegisterRoleHint();
}

function updateRegisterRoleHint() {
  const role = $("registerRole")?.value || state.selectedLoginRole;
  if (!$("registerParentAccount")) return;
  $("registerParentAccount").style.display = role === "主账号" ? "none" : "block";
  $("registerParentAccount").placeholder = role === "管理员子账号" ? "上级主账号，必填" : "上级管理员子账号，必填";
}

function cleanLicenseInput() {
  const input = $("licenseInput");
  if (!input) return "";
  const cleaned = input.value.replace(/\s+/g, "");
  if (input.value !== cleaned) input.value = cleaned;
  if ($("clearLicense")) $("clearLicense").style.display = cleaned ? "grid" : "none";
  return cleaned;
}

function validateLicenseFormat(value) {
  const cleaned = String(value || "").replace(/\s+/g, "");
  if (!cleaned) return "请输入授权秘钥。";
  if (cleaned.length < 32) return "秘钥格式错误：长度过短，请确认是否完整复制。";
  if (!/^[A-Za-z0-9._~+/=:-]+$/.test(cleaned)) return "秘钥格式错误：包含无法识别的字符。";
  return "";
}

function focusError(id, message) {
  $("licenseError").textContent = message;
  const node = $(id);
  if (node) {
    node.focus();
    node.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  showToast(message, "error");
}

function termsAccepted() {
  return $("termsAgree")?.checked;
}

function requireTerms() {
  if (termsAccepted()) return true;
  focusError("termsAgree", "请先勾选本地部署与AI回复复核说明。");
  return false;
}

function requireDeletePermission(action = "删除数据") {
  if (canDeleteData()) return true;
  showToast(`当前账号为${roleLabel(currentRole())}，无权${action}。请使用主账号或管理员子账号操作。`, "warn", 3200);
  return false;
}

function requireExportPermission(action = "导出企业数据") {
  if (currentRole() === "主账号" || currentRole() === "管理员子账号") return true;
  showToast(`当前账号为${roleLabel(currentRole())}，无权${action}。请使用主账号或管理员子账号操作。`, "warn", 3200);
  return false;
}

function requireAdminPermission(action = "管理企业数据") {
  if (currentRole() === "主账号" || currentRole() === "管理员子账号") return true;
  showToast(`当前账号为${roleLabel(currentRole())}，无权${action}。请使用主账号或管理员子账号操作。`, "warn", 3200);
  return false;
}

function confirmDanger(action, target = "") {
  const expected = "确认";
  const text = prompt(`${action}${target ? `：${target}` : ""}\n这是不可逆或高风险操作。请输入“${expected}”继续。`);
  if (text !== expected) {
    showToast("已取消操作。", "warn");
    return false;
  }
  return true;
}

function togglePasswordById(id, button) {
  const input = $(id);
  if (!input) return;
  input.type = input.type === "password" ? "text" : "password";
  if (button) button.textContent = input.type === "password" ? "◎" : "◉";
}

function accountInitials(account = state.account) {
  const source = account?.name || account?.account || "GT";
  return source
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "GT";
}

function renderAccountState() {
  const account = accountSessionValid() ? state.account : null;
  if ($("sidebarUserName")) $("sidebarUserName").textContent = account?.name || account?.account || "未登录";
  if ($("sidebarCompany")) $("sidebarCompany").textContent = account?.company || "等待账号登录";
  if ($("profileAvatar")) $("profileAvatar").textContent = accountInitials(account);
  if ($("profileName")) $("profileName").textContent = account?.name || "未登录账号";
  if ($("profileCompany")) $("profileCompany").textContent = account?.company || "请先登录账号";
  if ($("profileAccount")) $("profileAccount").textContent = `Account: ${account?.account || "-"}`;
  if ($("profileNameInput")) $("profileNameInput").value = account?.name || "";
  if ($("profileCompanyInput")) $("profileCompanyInput").value = account?.company || "";
  if ($("profileAccountInput")) $("profileAccountInput").value = account?.account || "";
  const branding = state.business?.branding || {};
  if ($("brandCompanyName")) $("brandCompanyName").value = branding.companyName || "";
  if ($("brandLogoRequest")) $("brandLogoRequest").value = branding.logoRequest || "";
  if ($("brandThemeColor")) $("brandThemeColor").value = branding.themeColor || "";
  if ($("brandCopyright")) $("brandCopyright").value = branding.copyright || "";
  if ($("profilePlan")) $("profilePlan").textContent = state.license ? state.plan.name : "-";
  if ($("profileExpire")) {
    const leftDays = state.license ? Math.max(0, Math.ceil((state.license.expiresAt - Date.now()) / 86400000)) : 0;
    const companyScope = state.license ? `公司授权：${state.license.customer || state.license.licenseId}` : "";
    $("profileExpire").textContent = state.license ? `${companyScope}｜剩余 ${leftDays} 天｜${state.plan.priceText}` : "未激活";
  }
  if ($("accountAuditList")) {
    $("accountAuditList").innerHTML = state.logs.length
      ? state.logs.slice(0, 12).map((item) => `<div><strong>${escapeHtml(item.text)}</strong><span>${escapeHtml(item.time)}</span></div>`).join("")
      : `<div><strong>暂无操作记录</strong><span>生成回复、导入资料、保存订单等操作会自动记录在这里。</span></div>`;
  }
  if ($("companyAccountList")) {
    const accounts = getAccounts();
    $("companyAccountList").innerHTML = accounts.length
      ? accounts.map((item) => `<div><strong>${escapeHtml(item.name || item.account)}｜${escapeHtml(roleLabel(item.role || "业务员子账号"))}</strong><span>${escapeHtml(item.company || "-")} · ${escapeHtml(item.account)} · 上级 ${escapeHtml(item.parentAccount || "无")} · 最近登录 ${item.lastLoginAt ? new Date(item.lastLoginAt).toLocaleString("zh-CN") : "-"}</span></div>`).join("")
      : `<div><strong>暂无账号</strong><span>秘钥激活后注册的主账号、管理员子账号和普通子账号会显示在这里，并共享公司工作区资料。</span></div>`;
  }
  renderPermissionGrid();
}

function rolePermissions(role = currentRole()) {
  if (role === "主账号") {
    return [
      ["账号管理", "可创建管理员和业务员子账号"],
      ["数据导出", "可导出客户、订单、财务、日志和完整备份"],
      ["高风险操作", "可删除、恢复备份、重置演示数据"],
      ["日常业务", "可处理询盘、维护产品和客户"]
    ];
  }
  if (role === "管理员子账号") {
    return [
      ["账号管理", "可创建其下业务员子账号"],
      ["数据导出", "可导出客户、订单、财务、日志和完整备份"],
      ["高风险操作", "可删除客户/产品、恢复备份、重置演示数据"],
      ["日常业务", "可处理询盘、维护产品、客户、订单"]
    ];
  }
  return [
    ["账号管理", "不可创建或管理公司账号"],
    ["数据导出", "不可导出企业级数据"],
    ["高风险操作", "不可删除、恢复备份或重置数据"],
    ["日常业务", "可处理询盘、查看资料、维护跟进状态"]
  ];
}

function renderPermissionGrid() {
  if (!$("permissionGrid")) return;
  const limits = accountLimitsForPlan();
  const counts = countAccountsByRole();
  const quotaCard = `<div class="permission-card quota-card">
    <strong>版本账号额度</strong>
    <span>${escapeHtml(limits.label)}</span>
    <em>已用：主账号 ${counts.master}/${formatLimitValue(limits.master)}，管理员 ${counts.admin}/${formatLimitValue(limits.admin)}，普通子账号 ${counts.user}/${formatLimitValue(limits.user)}</em>
  </div>`;
  $("permissionGrid").innerHTML = quotaCard + rolePermissions().map(([title, text]) => `<div class="permission-card">
    <strong>${escapeHtml(title)}</strong>
    <span>${escapeHtml(text)}</span>
  </div>`).join("");
}

function registerAccount() {
  if (!requireTerms()) return;
  setButtonLoading($("registerBtn"), true, "注册中");
  const name = $("registerName").value.trim();
  const company = $("registerCompany").value.trim();
  const account = $("registerAccount").value.trim();
  const password = $("registerPassword").value;
  const role = $("registerRole")?.value || "主账号";
  const parentAccount = $("registerParentAccount")?.value.trim() || "";
  const recoveryCode = $("registerRecoverCode")?.value.trim() || "";
  if (!name || !company || !account || !password) {
    focusError(!name ? "registerName" : !company ? "registerCompany" : !account ? "registerAccount" : "registerPassword", "请完整填写姓名、公司、账号和密码。");
    setButtonLoading($("registerBtn"), false, "注册账号并进入工作区");
    return;
  }
  if (password.length < 6) {
    focusError("registerPassword", "密码至少需要 6 位。");
    setButtonLoading($("registerBtn"), false, "注册账号并进入工作区");
    return;
  }
  const accounts = getAccounts();
  if (accounts.some((item) => item.account === account)) {
    focusError("registerAccount", "该账号已存在，请直接登录或更换账号。");
    setButtonLoading($("registerBtn"), false, "注册账号并进入工作区");
    return;
  }
  if (!recoveryCode || recoveryCode.length < 4) {
    focusError("registerRecoverCode", "请设置至少 4 位找回密码口令。");
    setButtonLoading($("registerBtn"), false, "注册账号并进入工作区");
    return;
  }
  const parent = parentAccount ? findAccount(parentAccount, accounts) : null;
  if (role === "主账号" && accounts.some((item) => item.role === "主账号")) {
    focusError("registerRole", "当前授权下已存在主账号，不能重复注册。");
    setButtonLoading($("registerBtn"), false, "注册账号并进入工作区");
    return;
  }
  if (role === "管理员子账号" && (!parent || parent.role !== "主账号")) {
    focusError("registerParentAccount", "管理员子账号必须填写有效的上级主账号。");
    setButtonLoading($("registerBtn"), false, "注册账号并进入工作区");
    return;
  }
  if (role === "业务员子账号" && (!parent || parent.role !== "管理员子账号")) {
    focusError("registerParentAccount", "普通子账号必须填写有效的上级管理员子账号。");
    setButtonLoading($("registerBtn"), false, "注册账号并进入工作区");
    return;
  }
  const limitMessage = accountLimitMessage(role, accounts);
  if (limitMessage) {
    focusError("registerRole", limitMessage);
    setButtonLoading($("registerBtn"), false, "注册账号并进入工作区");
    return;
  }
  if (!canCreateRole(role, state.account, accounts) && accounts.length > 0) {
    focusError("registerRole", "当前登录账号无权创建该类型账号。主账号可创建管理员/普通子账号，管理员只能创建普通子账号。");
    setButtonLoading($("registerBtn"), false, "注册账号并进入工作区");
    return;
  }
  const nextAccount = {
    name,
    company,
    account,
    password,
    role,
    parentAccount: parent?.account || "",
    recoveryCode,
    workspaceId: state.workspaceId,
    licenseId: state.license?.licenseId || "",
    createdAt: Date.now(),
    lastLoginAt: Date.now()
  };
  saveAccounts([nextAccount, ...accounts].slice(0, 100));
  logAction(`注册${nextAccount.role}：${account}`);
  saveCurrentAccount(nextAccount);
  $("licenseError").textContent = "";
  showSplash(() => {
    bootLicenseGate();
    renderAll();
    showToast(`${roleLabel(nextAccount.role)}注册成功，已进入公司共享工作区。`, "success");
    setButtonLoading($("registerBtn"), false, "注册账号并进入工作区");
  });
}

function loginAccount() {
  if (!requireTerms()) return;
  setButtonLoading($("loginBtn"), true, "登录中");
  const account = $("loginAccount").value.trim();
  const password = $("loginPassword").value;
  if (!account) {
    focusError("loginAccount", "请输入登录账号。");
    setButtonLoading($("loginBtn"), false, "登录并进入公司工作区");
    return;
  }
  if (!password) {
    focusError("loginPassword", "请输入登录密码。");
    setButtonLoading($("loginBtn"), false, "登录并进入公司工作区");
    return;
  }
  const accounts = getAccounts();
  const found = accounts.find((item) => item.account === account && item.password === password);
  if (!found) {
    focusError("loginPassword", "账号密码不匹配，请检查后重试。");
    setButtonLoading($("loginBtn"), false, "登录并进入公司工作区");
    return;
  }
  if (found.role !== state.selectedLoginRole) {
    focusError("loginAccount", `当前选择的是${roleLabel(state.selectedLoginRole)}登录，请切换正确登录方向。`);
    setButtonLoading($("loginBtn"), false, "登录并进入公司工作区");
    return;
  }
  const updated = { ...found, lastLoginAt: Date.now() };
  saveAccounts([updated, ...accounts.filter((item) => item.account !== account)].slice(0, 100));
  logAction(`登录子账号：${account}`);
  saveCurrentAccount(updated);
  $("licenseError").textContent = "";
  showSplash(() => {
    bootLicenseGate();
    renderAll();
    showToast("登录成功，已进入公司共享工作区。", "success");
    setButtonLoading($("loginBtn"), false, "登录并进入公司工作区");
  });
}

function recoverPassword() {
  setButtonLoading($("recoverBtn"), true, "重置中");
  const account = $("recoverAccount")?.value.trim() || "";
  const code = $("recoverCode")?.value.trim() || "";
  const password = $("recoverPassword")?.value || "";
  if (!account || !code || !password) {
    focusError(!account ? "recoverAccount" : !code ? "recoverCode" : "recoverPassword", "请填写账号、找回口令和新密码。");
    setButtonLoading($("recoverBtn"), false, "重置密码");
    return;
  }
  if (password.length < 6) {
    focusError("recoverPassword", "新密码至少需要 6 位。");
    setButtonLoading($("recoverBtn"), false, "重置密码");
    return;
  }
  const accounts = getAccounts();
  const found = findAccount(account, accounts);
  if (!found || String(found.recoveryCode || "").trim() !== code) {
    focusError("recoverCode", "账号或找回口令不匹配，请联系主账号或服务方处理。");
    setButtonLoading($("recoverBtn"), false, "重置密码");
    return;
  }
  const updated = { ...found, password, updatedAt: Date.now() };
  saveAccounts([updated, ...accounts.filter((item) => item.account !== found.account)].slice(0, 100));
  if (state.account?.account === found.account) saveCurrentAccount(updated);
  logAction(`重置密码：${found.account}`);
  setButtonLoading($("recoverBtn"), false, "重置密码");
  showLoginTab();
  showToast("密码已重置，请使用新密码登录。", "success");
}

function logoutAccount() {
  clearCurrentAccount();
  $("licenseError").textContent = "已退出当前账号，请重新登录。";
  bootLicenseGate();
  renderAll();
}

function saveProfile() {
  if (!state.account) return;
  const accounts = getAccounts();
  const password = $("profilePasswordInput")?.value || "";
  state.business.branding = {
    companyName: $("brandCompanyName")?.value.trim() || "",
    logoRequest: $("brandLogoRequest")?.value.trim() || "",
    themeColor: $("brandThemeColor")?.value.trim() || "",
    copyright: $("brandCopyright")?.value.trim() || ""
  };
  const updated = {
    ...state.account,
    name: $("profileNameInput").value.trim() || state.account.name,
    company: $("profileCompanyInput").value.trim() || state.account.company,
    password: password.length >= 6 ? password : state.account.password,
    updatedAt: Date.now()
  };
  saveAccounts([updated, ...accounts.filter((item) => item.account !== updated.account)].slice(0, 100));
  saveCurrentAccount(updated);
  if ($("profilePasswordInput")) $("profilePasswordInput").value = "";
  saveState();
  renderAccountState();
  renderAll();
  showToast("账号与企业品牌设置已保存。", "success");
}

function toggleProfilePassword() {
  const input = $("profilePasswordInput");
  if (!input) return;
  input.type = input.type === "password" ? "text" : "password";
  if ($("toggleProfilePassword")) $("toggleProfilePassword").textContent = input.type === "password" ? "◎" : "◉";
}

function readFields(selector, attr) {
  const data = {};
  document.querySelectorAll(selector).forEach((node) => {
    data[node.dataset[attr]] = node.value.trim();
  });
  return data;
}

function saveCustomerData() {
  const current = customerById(state.selectedCustomerId);
  if (!current) return;
  Object.assign(current, readFields("[data-customer-field]", "customerField"));
  document.querySelectorAll("[data-rule-index]").forEach((node) => {
    const index = Number(node.dataset.ruleIndex);
    if (state.business.crmRules[index]) state.business.crmRules[index].text = node.value.trim();
  });
  logAction(`保存客户资料：${current.name}`);
  saveState();
  renderAll();
  showToast("客户资料已保存。", "success");
}

function addCustomer() {
  const id = `c${Date.now()}`;
  state.business.customers.unshift({ id, name: "新客户", country: "待填写", region: "其他", level: "B", stage: "待报价", category: "待填写", contact: "联系人", email: "email@example.com", need: "客户需求", nextAction: "下一步动作", communication: "沟通记录", deals: "成交记录" });
  state.selectedCustomerId = id;
  logAction("新增客户");
  saveState();
  renderAll();
  showToast("已新增客户，可在详情区编辑。", "success");
}

function showCustomerImportPanel(show = true) {
  const panel = $("customerImportPanel");
  if (!panel) return;
  panel.classList.toggle("show", show);
  if (show) $("customerBulkImport")?.focus();
}

function importCustomers(text) {
  if (!requireAdminPermission("批量导入客户")) return;
  const rows = String(text || "").split("\n").map((line) => line.trim()).filter(Boolean);
  if (!rows.length) {
    showToast("请输入需要导入的客户资料。", "warn");
    $("customerBulkImport")?.focus();
    return;
  }
  const errors = [];
  rows.forEach((row, index) => {
    if (!row.includes("|")) errors.push(`第 ${index + 1} 行缺少分隔符 |`);
    if (row.split("|").length < 9) errors.push(`第 ${index + 1} 行字段不足，应为：客户名 | 国家 | 等级 | 阶段 | 品类 | 联系人 | 邮箱 | 需求 | 下一步`);
  });
  if (errors.length) {
    showToast(errors[0], "error", 3600);
    $("customerBulkImport")?.focus();
    return;
  }
  let imported = 0;
  rows.forEach((row) => {
    const [name, country, level, stage, category, contact, email, need, nextAction] = row.split("|").map((item) => item?.trim());
    if (!name) return;
    const existing = state.business.customers.find((item) => item.name.toLowerCase() === name.toLowerCase());
    const data = {
      name,
      country: country || "待填写",
      region: regionByCountry(country || ""),
      level: ["A", "B", "C"].includes(level) ? level : "B",
      stage: stage || "待报价",
      category: category || "待填写",
      contact: contact || "联系人待填写",
      email: email || "email@example.com",
      need: need || "客户需求待确认",
      nextAction: nextAction || "安排首次跟进",
      communication: "批量导入客户，待补充沟通记录。",
      deals: "暂无成交记录。"
    };
    if (existing) Object.assign(existing, data);
    else state.business.customers.unshift({ id: `c_import_${Date.now()}_${imported}`, ...data });
    imported += 1;
  });
  state.selectedCustomerId = state.business.customers[0]?.id || state.selectedCustomerId;
  $("customerBulkImport").value = "";
  showCustomerImportPanel(false);
  logAction(`批量导入客户：${imported} 个`);
  saveState();
  renderAll();
  showToast(`成功导入/更新 ${imported} 个客户。`, "success");
}

function deleteCustomer(id) {
  if (!requireDeletePermission("删除客户")) return;
  const customer = customerById(id);
  if (!customer) return;
  if (!confirmDanger("删除客户及关联订单/单证", customer.name)) return;
  state.business.customers = state.business.customers.filter((item) => item.id !== id);
  const removedOrders = state.business.orders.filter((item) => item.customerId === id).map((item) => item.id);
  state.business.orders = state.business.orders.filter((item) => item.customerId !== id);
  state.business.docs = state.business.docs.filter((item) => item.customerId !== id && !removedOrders.includes(item.orderId));
  state.selectedCustomerId = state.business.customers[0]?.id || "";
  state.selectedOrderId = state.business.orders[0]?.id || "";
  state.selectedDocId = state.business.docs[0]?.id || "";
  logAction(`删除客户：${customer.name}`);
  saveState();
  renderAll();
  showToast("客户及关联数据已删除。", "success");
}

function deleteCustomerNote(field) {
  if (!requireDeletePermission("删除客户记录")) return;
  const current = customerById(state.selectedCustomerId);
  if (!current) return;
  const label = field === "communication" ? "沟通记录" : "成交记录";
  if (!confirmDanger(`删除当前客户的${label}`, current.name)) return;
  current[field] = "";
  logAction(`删除客户${label}：${current.name}`);
  saveState();
  renderAll();
  showToast(`${label}已删除。`, "success");
}

function saveOrderData() {
  const current = orderById(state.selectedOrderId);
  if (!current) return;
  const data = readFields("[data-order-field]", "orderField");
  Object.assign(current, {
    ...data,
    amount: Number(data.amount || 0),
    paid: Number(data.paid || 0),
    due: Number(data.due || 0),
    progress: Number(data.progress || 0),
    steps: String(data.steps || "").split(/\n|,/).map((x) => x.trim()).filter(Boolean),
    logistics: String(data.logistics || "").split("\n").map((x) => x.trim()).filter(Boolean)
  });
  logAction(`保存订单：${current.orderNo}`);
  saveState();
  renderAll();
  showToast("订单已保存。", "success");
}

function addOrder() {
  const customer = state.business.customers[0] || { id: "c1" };
  const id = `o${Date.now()}`;
  state.business.orders.unshift({ id, orderNo: `SO-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-NEW`, customerId: customer.id, product: "新订单产品", amount: 0, paid: 0, due: 0, dueDate: new Date().toISOString().slice(0, 10), status: "待报价", progress: 0, qualityRisk: "待评估", shipDate: "待定", payNode: "待确认", steps: ["订单确认"], logistics: ["新订单已创建"] });
  state.selectedOrderId = id;
  logAction("新增订单");
  saveState();
  renderAll();
  showToast("已新增订单，可在编辑区完善。", "success");
}

function saveDocData() {
  const current = docById(state.selectedDocId);
  if (!current) return;
  Object.assign(current, readFields("[data-doc-field]", "docField"));
  current.type = String(current.type || state.selectedDocType || "PI").trim().toUpperCase();
  const meta = docTypeMeta(current.type);
  if (!current.title) current.title = meta.title;
  if (!String(current.docNo || "").startsWith(`${meta.prefix}-`)) {
    current.docNo = `${meta.prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-EDIT`;
  }
  state.selectedDocType = current.type;
  logAction(`保存单证：${current.docNo}`);
  saveState();
  renderAll();
  showToast("单证已保存。", "success");
}

function addDoc() {
  const customer = state.business.customers[0] || { id: "c1" };
  const order = state.business.orders[0] || { id: "o1" };
  const id = `d${Date.now()}`;
  const type = state.selectedDocType || docById(state.selectedDocId)?.type || "PI";
  const meta = docTypeMeta(type);
  state.business.docs.unshift({ id, type, title: meta.title, docNo: `${meta.prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-NEW`, customerId: customer.id, orderId: order.id, tradeTerm: type === "PL" ? "Packing Reference" : "FOB Shenzhen", payment: type === "PL" ? "N/A" : "T/T 30% Deposit", leadTime: "30 Days", port: "待填写", items: meta.items });
  state.selectedDocId = id;
  state.selectedDocType = type;
  logAction(`新建${meta.title}`);
  saveState();
  renderAll();
  showToast(`已新建${meta.title}。`, "success");
}

function createQuoteDocFromInquiry() {
  const ctx = state.lastInquiryContext;
  if (!ctx?.info || !ctx?.product) {
    showToast("请先生成询盘分析结果，再创建报价单草稿。", "warn");
    $("inquiry")?.focus();
    return;
  }
  const info = ctx.info;
  const product = ctx.product;
  const customerSync = upsertCustomerFromInquiry(info, product, ctx.decision, ctx.inquiry);
  const customer = customerSync?.customer || customerById(state.selectedCustomerId);
  const qty = info.qty || "Quantity to confirm";
  const spec = info.specs.length ? info.specs.join(", ") : "Specs to confirm";
  const orderId = `q_order_${Date.now()}`;
  const docId = `q_doc_${Date.now()}`;
  const amountHint = "To be confirmed";
  state.business.orders.unshift({
    id: orderId,
    orderNo: `QT-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-DRAFT`,
    customerId: customer.id,
    product: product.name,
    amount: 0,
    paid: 0,
    due: 0,
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    status: "待报价",
    progress: 0,
    qualityRisk: ctx.riskItems?.length ? `需确认 ${ctx.riskItems.length} 项风险` : "低",
    shipDate: product.leadTime || "To confirm",
    payNode: "报价待确认",
    steps: ["订单确认"],
    logistics: ["由询盘处理自动生成报价单草稿，需人工确认价格、交期、认证和付款条款。"]
  });
  state.business.docs.unshift({
    id: docId,
    type: "QT",
    title: "报价单",
    docNo: `QT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-AI`,
    customerId: customer.id,
    orderId,
    tradeTerm: "FOB Shenzhen / To confirm",
    payment: "T/T / To confirm",
    leadTime: product.leadTime || "To confirm",
    port: info.country === "Market to confirm" ? "Destination port to confirm" : `${info.country} destination port to confirm`,
    items: `${product.name} (${spec}) | ${qty} | ${amountHint} | ${amountHint}`
  });
  state.selectedCustomerId = customer.id;
  state.selectedOrderId = orderId;
  state.selectedDocId = docId;
  state.selectedDocType = "QT";
  logAction(`由询盘生成报价单草稿：${product.name}`);
  saveState();
  renderAll();
  document.querySelector('[data-view="docs"]')?.click();
  showToast("已生成报价单草稿，请在单证中心人工确认价格和条款。", "success", 3600);
}

function saveFinanceData() {
  document.querySelectorAll("[data-finance-field]").forEach((node) => {
    state.business.finance[node.dataset.financeField] = Number(node.value || 0);
  });
  logAction("保存财务参数");
  saveState();
  renderAll();
  showToast("财务参数已保存。", "success");
}

function exportBusinessData() {
  const content = JSON.stringify(workspaceSnapshot(), null, 2);
  const blob = new Blob([content], { type: "application/x-yaohai-backup;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = datedFilename("完整备份", "yhbackup");
  a.click();
  URL.revokeObjectURL(url);
  logAction("导出完整业务备份");
  saveState();
  showToast("完整备份已导出为 .yhbackup 专用文件，用于软件内恢复。", "success", 3200);
}

function downloadTextFile(filename, content, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function companyFilePrefix() {
  const source = state.business?.branding?.companyName || state.account?.company || state.license?.customer || state.business?.company || "曜海GlobalTradeAI";
  return safeKey(source).replace(/_/g, "-") || "yaohai-globaltrade-ai";
}

function datedFilename(label, ext) {
  return `${companyFilePrefix()}_${label}_${new Date().toISOString().slice(0, 10)}.${ext}`;
}

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function exportProductsCsv() {
  const rows = [
    ["产品", "关键词", "MOQ", "交期", "卖点", "风险提示", "完整度"],
    ...state.products.map((p) => [
      p.name,
      (p.keywords || []).join(", "),
      p.moq,
      p.leadTime,
      p.sellingPoints,
      p.risk,
      `${productCompleteness(p).score}%`
    ])
  ];
  const csv = `\ufeff${rows.map((row) => row.map(csvEscape).join(",")).join("\n")}`;
  downloadTextFile(datedFilename("产品资料", "csv"), csv, "text/csv;charset=utf-8");
  logAction("导出产品资料CSV");
  saveState();
  showToast("产品资料 CSV 已导出。", "success");
}

function exportRowsCsv(filename, headers, rows) {
  const csv = `\ufeff${[headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n")}`;
  downloadTextFile(filename, csv, "text/csv;charset=utf-8");
}

function exportCustomerData() {
  if (!requireExportPermission("导出客户数据")) return;
  const rows = state.business.customers.map((customer) => {
    const orders = state.business.orders.filter((order) => order.customerId === customer.id);
    return [
      customer.name,
      customer.country,
      customer.region,
      customer.level,
      customer.stage,
      customer.category,
      customer.contact,
      customer.email,
      customer.need,
      customer.nextAction,
      customer.communication,
      customer.deals,
      money(orders.reduce((sum, order) => sum + Number(order.amount || 0), 0))
    ];
  });
  exportRowsCsv(
    datedFilename("客户数据", "csv"),
    ["客户", "国家", "区域", "等级", "阶段", "品类", "联系人", "邮箱", "需求", "下一步", "沟通记录", "成交记录", "订单金额"],
    rows
  );
  logAction("导出客户数据CSV");
  saveState();
  showToast("客户数据已导出。", "success");
}

function backupProductsJson() {
  if (!requireExportPermission("备份产品资料库")) return;
  const payload = {
    app: "曜海 GlobalTrade AI",
    type: "product-library-backup",
    exportedAt: new Date().toISOString(),
    workspaceId: state.workspaceId,
    customer: state.license?.customer || state.business.company || "",
    products: state.products
  };
  downloadTextFile(
    datedFilename("产品库备份", "json"),
    JSON.stringify(payload, null, 2),
    "application/json;charset=utf-8"
  );
  logAction("批量备份产品资料库");
  saveState();
  showToast("产品资料库备份已导出。", "success");
}

function restoreProductsBackup(file) {
  if (!file) return;
  if (!requireAdminPermission("恢复产品资料库")) return;
  if (!confirmDanger("恢复产品资料库", "当前产品资料将被备份文件覆盖")) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(String(reader.result || "{}"));
      const products = Array.isArray(payload.products) ? payload.products : Array.isArray(payload) ? payload : [];
      if (!products.length) throw new Error("产品库备份文件缺少 products 数据");
      state.products = products.map((product) => ({
        name: product.name || "未命名产品",
        keywords: Array.isArray(product.keywords) ? product.keywords : String(product.keywords || "").split(",").map((item) => item.trim()).filter(Boolean),
        moq: product.moq || "To confirm",
        leadTime: product.leadTime || "To confirm",
        sellingPoints: product.sellingPoints || "To confirm",
        risk: product.risk || "Final quotation needs manual confirmation"
      }));
      logAction(`恢复产品库备份：${file.name}`);
      saveState();
      renderAll();
      showToast(`已恢复 ${state.products.length} 个产品资料。`, "success");
    } catch (error) {
      showToast(error.message || "产品库备份文件无法识别。", "error", 3600);
    }
  };
  reader.readAsText(file, "utf-8");
}

function exportOperationLogs() {
  if (!requireExportPermission("导出操作日志")) return;
  const rows = state.logs.map((item) => [item.time, item.text]);
  exportRowsCsv(
    datedFilename("操作日志", "csv"),
    ["时间", "操作内容"],
    rows
  );
  logAction("导出操作日志");
  saveState();
  showToast("操作日志已导出。", "success");
}

function archiveInquiryRecord(inquiry, info, product, riskItems, decision, reply, followup, customerSync) {
  const record = {
    id: `inq_${Date.now()}`,
    time: new Date().toLocaleString("zh-CN"),
    inquiry,
    customer: customerSync?.customer?.name || info.customerName || "未识别客户",
    country: info.country,
    region: info.region,
    product: product.name,
    intent: decision.intentLevel,
    quoteReadiness: decision.readiness,
    missing: decision.missing || [],
    risks: riskItems,
    reply,
    followup
  };
  state.inquiryArchive.unshift(record);
  state.inquiryArchive = state.inquiryArchive.slice(0, 200);
}

function exportInquiryArchive() {
  if (!requireExportPermission("导出询盘归档")) return;
  if (!state.inquiryArchive.length) {
    showToast("暂无询盘归档。请先生成至少一条询盘回复。", "warn");
    return;
  }
  const rows = state.inquiryArchive.map((item) => [
    item.time,
    item.customer,
    item.country,
    item.region,
    item.product,
    item.intent,
    `${item.quoteReadiness}%`,
    (item.missing || []).join("；"),
    (item.risks || []).join("；"),
    item.inquiry,
    item.reply,
    item.followup
  ]);
  exportRowsCsv(
    datedFilename("询盘处理归档", "csv"),
    ["处理时间", "客户", "国家", "区域", "推荐产品", "意向等级", "报价准备度", "缺失资料", "风险事项", "询盘原文", "回复草稿", "跟进邮件"],
    rows
  );
  logAction("导出询盘处理归档");
  saveState();
  showToast("询盘处理归档已导出。", "success");
}

function followReminderRows() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return state.business.customers.map((customer) => {
    const relatedOrders = state.business.orders.filter((order) => order.customerId === customer.id);
    const dueOrders = relatedOrders.filter((order) => Number(order.due || 0) > 0 || ["待定金", "逾期"].includes(order.status));
    let urgency = "正常";
    const lead = state.leads.find((item) => item.customer === customer.name || item.country === customer.country);
    const followTime = lead?.followDate ? new Date(lead.followDate).getTime() : null;
    if (customer.level === "A" || ["待报价", "待回款", "样品中"].includes(customer.stage)) urgency = "今日跟进";
    if (followTime !== null && followTime < today.getTime() && !["已跟进", "已忽略"].includes(lead?.followStatus)) urgency = "跟进逾期";
    if (dueOrders.some((order) => order.status === "逾期")) urgency = "逾期催收";
    const nearest = dueOrders
      .map((order) => order.dueDate || order.shipDate || "")
      .filter(Boolean)
      .sort()[0] || lead?.followDate || customer.nextAction || "待安排";
    const action = dueOrders.some((order) => order.status === "逾期")
      ? "确认尾款与付款日期"
      : customer.stage === "待报价"
        ? "补齐报价关键信息并发送报价"
        : customer.stage === "样品中"
          ? "确认样品费、物流和反馈时间"
          : customer.nextAction || "发送跟进邮件";
    return { customer, urgency, nearest, action, dueOrders, lead };
  });
}

function exportFollowReminders() {
  if (!requireExportPermission("导出跟进提醒")) return;
  const rows = followReminderRows().map(({ customer, urgency, nearest, action, dueOrders }) => [
    customer.name,
    customer.country,
    customer.level,
    customer.stage,
    urgency,
    nearest,
    action,
    dueOrders.map((order) => `${order.orderNo}:${money(order.due || 0)}:${order.status}`).join("；")
  ]);
  exportRowsCsv(
    datedFilename("客户跟进提醒", "csv"),
    ["客户", "国家", "等级", "阶段", "提醒级别", "最近节点", "建议动作", "关联应收订单"],
    rows
  );
  logAction("导出客户跟进提醒");
  saveState();
  showToast("客户跟进提醒已导出。", "success");
}

function exportOrdersCsv() {
  if (!requireExportPermission("导出订单数据")) return;
  const rows = state.business.orders.map((order) => [
    order.orderNo,
    customerById(order.customerId).name,
    order.product,
    money(order.amount),
    money(order.paid),
    money(order.due),
    order.dueDate,
    order.status,
    `${order.progress}%`,
    order.qualityRisk,
    order.shipDate,
    order.payNode,
    (order.steps || []).join(" / "),
    (order.logistics || []).join("；")
  ]);
  exportRowsCsv(
    datedFilename("订单履约", "csv"),
    ["订单号", "客户", "产品", "金额", "已回款", "待回款", "到期日", "状态", "生产完成率", "质检风险", "预计出货", "回款节点", "已完成节点", "物流记录"],
    rows
  );
  logAction("导出订单履约CSV");
  saveState();
  showToast("订单履约数据已导出。", "success");
}

function exportFinanceCsv() {
  if (!requireExportPermission("导出财务数据")) return;
  const stats = calcStats();
  const summary = [
    ["指标", "金额/数值", "说明"],
    ["已回款", money(stats.paid), "来自订单已回款字段"],
    ["待回款", money(stats.due), "来自订单待回款字段"],
    ["逾期款", money(stats.overdue), "状态为逾期的订单待回款"],
    ["目标利润", `${state.business.finance.targetProfit}%`, "来自财务参数"]
  ];
  const schedule = state.business.orders.map((order) => [
    customerById(order.customerId).name,
    order.orderNo,
    order.product,
    money(order.amount),
    money(order.paid),
    money(order.due),
    order.dueDate,
    order.status
  ]);
  const csv = `\ufeff${summary.map((row) => row.map(csvEscape).join(",")).join("\n")}\n\n回款计划\n${[
    ["客户", "订单", "产品", "订单金额", "已回款", "待回款", "到期日", "状态"],
    ...schedule
  ].map((row) => row.map(csvEscape).join(",")).join("\n")}`;
  downloadTextFile(datedFilename("财务结算", "csv"), csv, "text/csv;charset=utf-8");
  logAction("导出财务结算CSV");
  saveState();
  showToast("财务结算数据已导出。", "success");
}

function resetDemoData() {
  if (!requireAdminPermission("重置演示数据")) return;
  if (!confirmDanger("重置为演示数据", "当前客户、订单、产品、询盘归档和操作日志会被演示样例覆盖")) return;
  state.todayCount = 0;
  state.products = defaultProducts();
  state.business = defaultBusinessData();
  normalizeBusinessData();
  state.templates = defaultTemplates();
  state.leads = [];
  state.deletedProducts = [];
  state.inquiryQueue = [];
  state.inquiryArchive = [];
  state.productSearch = "";
  state.lastInquiryReport = "";
  state.lastReply = "";
  state.lastFollowup = "";
  state.logs = [];
  logAction("重置为客户演示数据");
  saveState();
  renderAll();
  showToast("已重置为演示数据，可重新给客户演示完整流程。", "success", 3200);
}

function restoreWorkspaceBackup(file) {
  if (!file) return;
  if (!requireAdminPermission("恢复完整备份")) return;
  if (!confirmDanger("恢复完整备份", "当前工作区数据将被备份文件覆盖")) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(String(reader.result || "{}"));
      const data = payload.data || payload;
      if (!data.business || !Array.isArray(data.products)) {
        throw new Error("备份文件缺少必要业务数据");
      }
      state.todayCount = Number(data.todayCount || 0);
      state.products = data.products || defaultProducts();
      state.leads = data.leads || [];
      state.business = data.business || defaultBusinessData();
      state.templates = data.templates || defaultTemplates();
      state.deletedProducts = data.deletedProducts || [];
      state.inquiryArchive = data.inquiryArchive || [];
      state.logs = data.logs || [];
      normalizeBusinessData();
      logAction(`恢复备份文件：${file.name}`);
      saveState();
      renderAll();
      showToast("备份恢复成功。", "success");
    } catch (error) {
      showToast(error.message || "备份文件无法识别。", "error", 3600);
    }
  };
  reader.readAsText(file, "utf-8");
}

function lockApp() {
  clearCurrentAccount();
  $("licenseError").textContent = "系统已锁定，请使用公司子账号重新登录。";
  bootLicenseGate();
  renderAll();
  showToast("系统已锁定。", "success");
}

const scenarios = {
  drill: "Hello, we are looking for cordless electric drills for our retail stores in Chile. Please send quotation for 500 pcs, including specifications, packaging, delivery time and sample policy. We prefer 18V models with two batteries. Thank you.",
  led: "Dear supplier, we need LED flood lights for outdoor warehouse projects in UAE. Please quote 1000 pcs, 100W, IP65 waterproof, CE certificate, neutral white. What is your best price and delivery time?",
  pet: "Hi, we are a pet products distributor in Germany. We are interested in foldable dog crates, medium and large sizes, private label packaging, first order around 800 pcs. Please share catalogue, MOQ and sample cost.",
  kettle: "Good morning, we want stainless steel electric kettles for supermarket promotion in Mexico, 1.7L capacity, 220V, custom logo, order quantity 3000 units. Please send quotation, packing details and production lead time."
};

const scenarioOrder = Object.keys(scenarios);

function defaultProducts() {
  return [
    {
      name: "18V Cordless Drill",
      keywords: ["cordless drill", "electric drill", "18v", "drill", "two batteries"],
      moq: "300 pcs",
      leadTime: "25-35 days after deposit",
      sellingPoints: "18V, 2 lithium batteries, 45Nm torque, retail color box available",
      risk: "Final price, plug type, packaging and certification need confirmation"
    },
    {
      name: "100W LED Flood Light",
      keywords: ["led flood light", "flood lights", "100w", "ip65", "warehouse"],
      moq: "500 pcs",
      leadTime: "20-30 days after deposit",
      sellingPoints: "100W, IP65 waterproof, die-cast aluminum housing, CE/RoHS optional",
      risk: "Certificate version and target market requirements need confirmation"
    },
    {
      name: "Foldable Dog Crate",
      keywords: ["dog crate", "foldable", "pet", "crate", "private label"],
      moq: "500 pcs",
      leadTime: "30-40 days after artwork approval",
      sellingPoints: "Foldable design, medium and large sizes, private label packaging supported",
      risk: "Size mix, package artwork and sample shipping cost need confirmation"
    },
    {
      name: "1.7L Stainless Steel Electric Kettle",
      keywords: ["electric kettle", "kettle", "stainless steel", "1.7l", "custom logo"],
      moq: "1000 pcs",
      leadTime: "35-45 days after deposit and artwork confirmation",
      sellingPoints: "1.7L capacity, stainless steel body, custom logo, supermarket promotion suitable",
      risk: "Voltage, plug, safety certification and packaging details need confirmation"
    }
  ];
}

function defaultTemplates() {
  return {
    first: "Thank you for your inquiry. Based on your request, we would like to recommend the following suitable product for your market.",
    quote: "We can prepare the detailed quotation after confirming quantity, packaging, logo, certificate and delivery terms.",
    sample: "Samples can be arranged for quality checking before bulk order. Sample cost and freight depend on the model and destination.",
    follow: "Just checking whether you had a chance to review our proposal. If you can confirm the key requirements, we can update the quotation quickly.",
    oem: "For OEM or private label orders, please share your logo file, packaging requirement, target price range and expected order quantity. We can then check the best solution and artwork schedule.",
    certificate: "For certification requirements, please confirm the target market and required standard. We will ask our team to verify the available certificate version before making any formal commitment.",
    urgent: "If your project is urgent, please confirm the required delivery date, destination port and acceptable shipping method. We will check the fastest workable schedule before quoting.",
    catalogue: "We can share product pictures, specifications and catalogue information first. After you confirm the interested models, we can prepare a more accurate quotation."
  };
}

function defaultBusinessData() {
  return {
    company: "YaoHai Trading",
    developerContact: {
      name: "曜海 GlobalTrade AI 服务方",
      phone: "13793338248",
      wechat: "z13793338248 / ch13953053768",
      email: "service@example.com"
    },
    branding: {
      companyName: "",
      logoRequest: "",
      themeColor: "",
      copyright: ""
    },
    crmRules: [
      { level: "A", text: "高意向客户，24 小时内回复，优先报价和样品。" },
      { level: "B", text: "普通意向客户，48 小时内完成二次跟进。" },
      { level: "C", text: "冷启动客户，使用模板进行低频维护。" }
    ],
    customers: [
      { id: "c1", name: "Nordlicht GmbH", country: "Germany", region: "欧洲", level: "A", stage: "待报价", category: "Solar Light", contact: "Anna Weber / Purchasing Manager", email: "purchase@nordlicht.example", need: "太阳能庭院灯、CE、零售彩盒、德国市场", nextAction: "确认样品费和 30 天交期", communication: "2026-07-03 已发送 12W 庭院灯报价草稿，客户关注 CE 和包装。", deals: "历史成交 $42,800.00，当前机会 $29,600.00" },
      { id: "c2", name: "Bahia Import", country: "Brazil", region: "南美", level: "B", stage: "样品中", category: "LED Lighting", contact: "Carlos Silva", email: "buy@bahia.example", need: "LED 投光灯、IP65、葡语包装", nextAction: "跟进样品运费确认", communication: "客户已确认样品型号，等待样品费支付。", deals: "当前样品机会 $18,600.00" },
      { id: "c3", name: "Gulf Retail Co.", country: "UAE", region: "中东", level: "A", stage: "待回款", category: "Outdoor Lamp", contact: "Ahmed Khan", email: "sourcing@gulf.example", need: "户外照明、100W、CE/RoHS", nextAction: "发送 PI 并提醒定金", communication: "客户要求 FOB Shenzhen 和 30% 定金条款。", deals: "当前订单 $66,200.00" },
      { id: "c4", name: "Andes Home", country: "Chile", region: "南美", level: "C", stage: "全部", category: "Small Appliance", contact: "Maria Lopez", email: "import@andes.example", need: "小家电超市促销", nextAction: "冷启动跟进", communication: "客户暂未确认预算。", deals: "逾期款 $9,800.00" }
    ],
    orders: [
      { id: "o1", orderNo: "SO-260703-01", customerId: "c1", product: "Solar Garden Light 12W", amount: 29600, paid: 8880, due: 20720, dueDate: "2026-07-18", status: "生产中", progress: 64, qualityRisk: "低", shipDate: "2026-07-18", payNode: "尾款前置", steps: ["订单确认", "定金到账", "生产中"], logistics: ["2026-07-03 10:20 深圳仓库已收货", "2026-07-03 14:40 等待订舱确认", "预计下周装柜"] },
      { id: "o2", orderNo: "SO-260701-09", customerId: "c3", product: "100W LED Flood Light", amount: 66200, paid: 0, due: 66200, dueDate: "2026-07-10", status: "待定金", progress: 18, qualityRisk: "中", shipDate: "待定", payNode: "等待定金", steps: ["订单确认"], logistics: ["PI 已发送，等待客户定金"] },
      { id: "o3", orderNo: "SO-260626-03", customerId: "c4", product: "Electric Kettle", amount: 9800, paid: 0, due: 9800, dueDate: "2026-07-01", status: "逾期", progress: 100, qualityRisk: "低", shipDate: "已出运", payNode: "催收尾款", steps: ["订单确认", "定金到账", "生产中", "验货", "出运"], logistics: ["货物已出运，尾款逾期需跟进"] }
    ],
    docs: [
      { id: "d1", type: "PI", title: "形式发票", docNo: "PI-20260703-018", customerId: "c1", orderId: "o1", tradeTerm: "FOB Shenzhen", payment: "T/T 30% Deposit", leadTime: "30 Days", port: "Hamburg", items: "Solar Garden Light 12W | 2000 pcs | $8.60 | $17,200.00\nOutdoor Sensor Light | 1000 pcs | $12.40 | $12,400.00" },
      { id: "d2", type: "QT", title: "报价单", docNo: "QT-20260703-006", customerId: "c2", orderId: "o2", tradeTerm: "EXW Shenzhen", payment: "Sample fee before shipping", leadTime: "7 Days for sample", port: "Santos", items: "100W LED Flood Light | 20 pcs sample | $18.60 | $372.00" },
      { id: "d3", type: "CI", title: "商业发票", docNo: "CI-20260626-003", customerId: "c4", orderId: "o3", tradeTerm: "FOB Ningbo", payment: "Balance before shipment", leadTime: "Shipped", port: "Valparaiso", items: "Electric Kettle 1.7L | 1000 pcs | $9.80 | $9,800.00" }
    ],
    finance: {
      productCost: 6.2,
      packageCost: 0.45,
      inlandFreight: 0.18,
      targetProfit: 22
    },
    help: {
      "询盘处理": "粘贴真实客户询盘后，系统会结合产品资料库输出需求分析、推荐产品、风险事项、英文回复草稿和三天跟进邮件。",
      "产品资料库": "客户可维护自己的产品资料，支持导入、生成草稿、查询、编辑、删除和撤回删除。",
      "客户管理": "客户列表、等级、阶段、沟通记录和成交记录都可编辑，首页和数据大屏会读取这些客户数据。",
      "单证中心": "报价单、形式发票、商业发票、装箱单等单证内容可以按客户、订单、条款和产品明细进行编辑。",
      "订单履约": "订单确认、定金到账、生产、验货、出运、物流、风险、出货日期和回款节点均可维护。",
      "财务结算": "已回款、待回款、逾期款、成本核算和回款计划来自客户自己维护的订单和财务数据。",
      "账号系统": "先授权秘钥，再账号登录。不同账号会隔离保存客户资料和业务数据。",
      "数据大屏": "月度询盘、年度成交额、活跃客户、区域占比、准时交付和资料匹配率会按本地业务数据汇总。",
      "本地部署": "部署到客户电脑后可本地打开，不依赖服务器。静态版适合演示、试点和单机交付。"
    }
  };
}

function serviceContactText() {
  return "如需部署、续期、定制 Logo 或服务支持，请联系服务方：电话 13793338248，微信 z13793338248，备用微信 ch13953053768。";
}

function normalizeBusinessData() {
  if (!state.business) state.business = defaultBusinessData();
  state.business.developerContact = {
    ...(state.business.developerContact || {}),
    name: "曜海 GlobalTrade AI 服务方",
    phone: "13793338248",
    wechat: "z13793338248 / ch13953053768",
    email: state.business.developerContact?.email || "service@example.com"
  };
  state.business.help = {
    ...(defaultBusinessData().help),
    ...(state.business.help || {})
  };
  if (!state.business.help["财务核算"]) state.business.help["财务核算"] = state.business.help["财务结算"] || defaultBusinessData().help["财务结算"];
  ["询盘处理", "产品资料库", "客户管理", "账号系统", "财务结算", "财务核算", "订单履约", "本地部署"].forEach((key) => {
    const baseHelp = state.business.help[key] || defaultBusinessData().help[key] || "";
    state.business.help[key] = `${baseHelp.replace(/如需部署[\s\S]*$/, "").trim()} ${serviceContactText()}`.trim();
  });
  if (!state.business.branding) state.business.branding = defaultBusinessData().branding;
}

function docTypeMeta(type) {
  const map = {
    QT: { title: "报价单", prefix: "QT", noName: "QUOTATION", items: "产品名称 | 数量 | 单价 | 报价金额" },
    PI: { title: "形式发票", prefix: "PI", noName: "PROFORMA INVOICE", items: "产品名称 | 数量 | 单价 | 发票金额" },
    CI: { title: "商业发票", prefix: "CI", noName: "COMMERCIAL INVOICE", items: "产品名称 | 数量 | 单价 | 商业发票金额" },
    PL: { title: "装箱单", prefix: "PL", noName: "PACKING LIST", items: "产品名称 | 箱数 | 毛重/净重 | 体积" }
  };
  return map[type] || map.PI;
}

const $ = (id) => document.getElementById(id);

function saveState() {
  setLocal(`ft_plan_used_${state.plan.id}`, String(state.planUsed));
  setLocal(storageKey("today_count"), String(state.todayCount));
  setLocal(storageKey("products"), JSON.stringify(state.products));
  setLocal(storageKey("leads"), JSON.stringify(state.leads));
  setLocal(storageKey("business_data"), JSON.stringify(state.business));
  setLocal(storageKey("templates"), JSON.stringify(state.templates));
  setLocal(storageKey("deleted_products"), JSON.stringify(state.deletedProducts));
  setLocal(storageKey("inquiry_queue"), JSON.stringify(state.inquiryQueue));
  setLocal(storageKey("inquiry_archive"), JSON.stringify(state.inquiryArchive));
  setLocal(storageKey("operation_logs"), JSON.stringify(state.logs));
  rememberWorkspaceIndex();
}

function daysUsed() {
  const start = state.license?.activatedAt || new Date(state.planStart).getTime();
  return Math.floor((Date.now() - start) / 86400000);
}

function planExpired() {
  if (!state.license) return true;
  return Date.now() > state.license.expiresAt;
}

function quotaReached() {
  if (hasUnlimitedQuota()) return false;
  return state.planUsed >= state.plan.maxGenerations;
}

function canGenerate() {
  if (!licenseActive()) {
    if (state.license && Date.now() > state.license.expiresAt) {
      expireCurrentLicense("expired", "当前授权已到期，请输入新的授权秘钥。");
      return false;
    }
    if (!hasUnlimitedQuota() && state.license && state.planUsed >= state.license.maxGenerations) {
      expireCurrentLicense("quota_used", "当前授权次数已用尽，请输入新的授权秘钥。");
      return false;
    }
    bootLicenseGate();
    return false;
  }
  if (planExpired()) {
    expireCurrentLicense("expired", "当前授权已到期，请输入新的授权秘钥。");
    return false;
  }
  if (quotaReached()) {
    expireCurrentLicense("quota_used", "当前授权次数已用尽，请输入新的授权秘钥。");
    return false;
  }
  $("upgradeBox").classList.remove("show");
  return true;
}

function showUpgrade(title, text) {
  $("upgradeTitle").textContent = title;
  $("upgradeText").textContent = text;
  $("upgradeBox").classList.add("show");
  $("status").textContent = "需升级";
}

function normalize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s.]/g, " ");
}

function extract(text) {
  const lower = normalize(text);
  const qty = text.match(/(\d[\d,]*)\s*(pcs|pieces|units|sets|只|件|台)/i)?.[0] || "Quantity to confirm";
  const countries = ["Chile", "UAE", "Germany", "Mexico", "USA", "UK", "Canada", "Australia", "Brazil", "Saudi Arabia", "Spain", "France", "Italy", "Poland", "Netherlands", "India", "Indonesia", "Thailand", "Vietnam", "Malaysia", "Philippines", "South Africa"];
  const country = countries.find((item) => lower.includes(item.toLowerCase())) || "Market to confirm";
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
  const customerName = extractCustomerName(text, email, country);
  const specs = [];
  ["18V", "20V", "100W", "IP65", "CE", "RoHS", "1.7L", "220V", "private label", "custom logo", "two batteries"].forEach((item) => {
    if (lower.includes(item.toLowerCase())) specs.push(item);
  });
  const needs = [];
  if (lower.includes("quotation") || lower.includes("quote") || lower.includes("price")) needs.push("quotation");
  if (lower.includes("sample")) needs.push("sample policy");
  if (lower.includes("delivery") || lower.includes("lead time")) needs.push("delivery time");
  if (lower.includes("packing") || lower.includes("packaging")) needs.push("packaging details");
  if (lower.includes("certificate") || lower.includes("ce") || lower.includes("rohs")) needs.push("certification");
  if (lower.includes("catalogue") || lower.includes("catalog")) needs.push("catalogue");
  return { lower, qty, country, region: regionByCountry(country), customerName, email, specs, needs };
}

function extractCustomerName(text, email, country) {
  const patterns = [
    /(?:from|company|this is|we are)\s+([A-Z][A-Za-z0-9&.,' -]{2,48})(?:,|\n|\.| from| in|$)/i,
    /(?:公司|客户|买家)[:：]\s*([^\n，,。]{2,30})/i,
    /(?:Regards|Best regards|Thanks|Thank you),?\s*\n\s*([A-Z][A-Za-z .'-]{2,32})/i
  ];
  for (const pattern of patterns) {
    const found = text.match(pattern)?.[1]?.trim();
    if (found && !/quote|quotation|price|sample|delivery|inquiry/i.test(found)) return found.replace(/\s+/g, " ");
  }
  if (email) {
    const domain = email.split("@")[1]?.split(".")[0] || "";
    if (domain && !["gmail", "hotmail", "outlook", "yahoo", "qq", "163"].includes(domain.toLowerCase())) {
      return domain.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  return country !== "Market to confirm" ? `${country} Buyer` : `AI识别客户 ${new Date().toLocaleDateString("zh-CN")}`;
}

function regionByCountry(country) {
  const map = {
    Germany: "欧洲", UK: "欧洲", Spain: "欧洲", France: "欧洲", Italy: "欧洲", Poland: "欧洲", Netherlands: "欧洲",
    Chile: "南美", Brazil: "南美", Mexico: "北美", USA: "北美", Canada: "北美",
    UAE: "中东", "Saudi Arabia": "中东",
    India: "亚洲", Indonesia: "亚洲", Thailand: "亚洲", Vietnam: "亚洲", Malaysia: "亚洲", Philippines: "亚洲",
    Australia: "大洋洲", "South Africa": "非洲"
  };
  return map[country] || "其他";
}

function matchProducts(text) {
  const lower = normalize(text);
  return state.products.map((product) => {
    const hits = product.keywords.filter((keyword) => lower.includes(keyword.toLowerCase()));
    return { product, score: hits.length, hits };
  }).sort((a, b) => b.score - a.score);
}

function extractQuantityNumber(qtyText) {
  const raw = String(qtyText || "").match(/\d[\d,]*/)?.[0];
  return raw ? Number(raw.replace(/,/g, "")) : 0;
}

function buildInquiryDecision(info, product, score, riskItems, matchScore) {
  const qtyNumber = extractQuantityNumber(info.qty);
  const wantsQuote = info.needs.includes("quotation");
  const wantsSample = info.needs.includes("sample policy");
  const wantsDelivery = info.needs.includes("delivery time");
  const hasMarket = info.country !== "Market to confirm";
  const hasQty = qtyNumber > 0;
  const hasSpecs = info.specs.length > 0;
  const hasStrongProduct = score > 0;

  let intentScore = 42;
  if (wantsQuote) intentScore += 18;
  if (wantsSample) intentScore += 10;
  if (wantsDelivery) intentScore += 8;
  if (hasQty) intentScore += qtyNumber >= 1000 ? 16 : 9;
  if (hasMarket) intentScore += 7;
  if (hasStrongProduct) intentScore += 12;
  intentScore = Math.min(96, intentScore);

  const intentLevel = intentScore >= 82 ? "A 类高意向" : intentScore >= 66 ? "B 类可跟进" : "C 类待培育";
  const intentReason = [
    wantsQuote ? "主动询价" : "未明确报价",
    hasQty ? `数量 ${info.qty}` : "数量待确认",
    hasStrongProduct ? "产品有匹配" : "产品匹配不足"
  ].join(" / ");

  const missing = [];
  if (!hasQty) missing.push("最终采购数量");
  if (!hasMarket) missing.push("目标国家 / 目的港");
  if (!hasSpecs) missing.push("关键规格参数");
  if (!info.needs.includes("packaging details")) missing.push("包装 / 贴牌要求");
  if (!info.needs.includes("certification")) missing.push("认证要求");
  missing.push("最新报价有效期");

  const quoteReadyScore = Math.max(35, Math.min(96, matchScore - missing.length * 5 + (wantsQuote ? 8 : 0)));
  const quoteReadiness = quoteReadyScore >= 82 ? "可出初步报价" : quoteReadyScore >= 62 ? "需补资料后报价" : "先确认需求";
  const quoteReadinessText = missing.length
    ? `准备度 ${quoteReadyScore}%｜缺：${missing.slice(0, 3).join("、")}${missing.length > 3 ? `等 ${missing.length} 项` : ""}`
    : `准备度 ${quoteReadyScore}%｜关键信息较完整`;
  const quoteMissingSummary = missing.length
    ? `需要补充：${missing.join("、")}。补齐后再确认正式报价、交期和付款条款。`
    : "当前信息较完整，但正式报价仍需人工复核价格、交期和认证。";

  const internalTodos = [
    `业务员：确认 ${missing.slice(0, 3).join("、") || "客户最终需求"}。`,
    `产品负责人：核对 ${product.name} 的库存、MOQ、交期和可替代型号。`,
    "报价负责人：确认价格有效期、付款方式和运费口径。"
  ];
  if (riskItems.length) internalTodos.push("负责人：复核人工确认事项，避免误报价格、认证和交期。");

  const nextActionLevel = intentLevel.startsWith("A") ? "2 小时内回复" : intentLevel.startsWith("B") ? "24 小时内跟进" : "先做需求确认";
  const nextActionText = intentLevel.startsWith("A")
    ? "先发可编辑报价草稿，同时索要规格、包装和目的港。"
    : intentLevel.startsWith("B")
      ? "先补齐数量、规格和市场信息，再发送报价。"
      : "先发送产品目录和关键问题，判断是否真实采购。";
  const nextStep = `建议动作：${nextActionLevel}。${nextActionText}`;

  return {
    intentScore,
    intentLevel,
    intentReason,
    missing,
    internalTodos,
    quoteReadiness,
    quoteReadinessText,
    quoteMissingSummary,
    nextActionLevel,
    nextActionText,
    nextStep
  };
}

function renderInquiryDecision(decision) {
  if (!$("intentLevel")) return;
  $("intentLevel").textContent = decision.intentLevel;
  $("intentReason").textContent = decision.intentReason;
  $("quoteReadiness").textContent = decision.quoteReadiness;
  $("quoteReadinessText").textContent = decision.quoteReadinessText;
  if ($("quoteMissingSummary")) $("quoteMissingSummary").textContent = decision.quoteMissingSummary;
  $("nextActionLevel").textContent = decision.nextActionLevel;
  $("nextActionText").textContent = decision.nextActionText;
  $("missingInfoList").innerHTML = decision.missing.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  $("internalTodoList").innerHTML = decision.internalTodos.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  $("nextStepBox").textContent = decision.nextStep;
}

function buildInquiryReport(inquiry, info, product, backup, riskItems, decision, reply, followup) {
  const type = detectInquiryType(info);
  return `曜海 GlobalTrade AI 询盘处理报告

一、客户询盘原文
${inquiry}

二、系统识别结果
- 询盘类型：${inquiryTypeLabel(type)}
- 客户意向：${decision.intentLevel}（${decision.intentReason}）
- 目标市场：${info.country}
- 采购数量：${info.qty}
- 核心规格：${info.specs.length ? info.specs.join(", ") : "待确认"}
- 客户关注：${info.needs.length ? info.needs.join(", ") : "产品信息和报价"}

三、推荐产品
- 首选产品：${product.name}
- MOQ：${product.moq}
- 交期：${product.leadTime}
- 卖点：${product.sellingPoints}
${backup ? `- 备选产品：${backup.name}` : "- 备选产品：暂无强匹配备选"}

四、报价准备度
- ${decision.quoteReadiness}
- ${decision.quoteReadinessText}
- 缺失资料：${decision.missing.join("、") || "暂无明显缺失"}
- 补充建议：${decision.quoteMissingSummary}

五、人工确认事项
${riskItems.map((item, index) => `${index + 1}. ${item}`).join("\n")}

六、建议下一步
${decision.nextStep}

七、英文回复草稿
${reply}

八、3 天跟进邮件
${followup}

说明：本报告为业务员辅助草稿，报价、交期、认证、付款条款和最终发送内容必须由业务员或负责人确认。`;
}

function buildResult() {
  if (!canGenerate()) return;
  const inquiry = $("inquiry").value.trim();
  if (!inquiry) {
    $("status").textContent = "请输入询盘";
    showToast("请输入 / 选择询盘内容", "warn");
    $("inquiry").focus();
    return;
  }

  setButtonLoading($("generateBtn"), true, "生成中");
  $("status").textContent = "AI 分析中...";
  $("analysisSkeleton")?.classList.add("show");

  try {
    const info = extract(inquiry);
    const matches = matchProducts(inquiry);
    const best = matches[0]?.score > 0 ? matches[0] : { product: state.products[0], score: 0, hits: [] };
    const backup = matches.find((item) => item.product.name !== best.product.name && item.score > 0);
    const matchScore = Math.min(96, 58 + best.score * 12 + info.specs.length * 3);
    const riskItems = buildRisks(info, best.product, best.score);
    const usableScore = Math.max(68, Math.min(94, matchScore - riskItems.length * 3));
    const lead = buildLead(info, best.product);
    const decision = buildInquiryDecision(info, best.product, best.score, riskItems, matchScore);

    $("analysis").innerHTML = [
      `目标市场：${info.country}`,
      `采购数量：${info.qty}`,
      `核心规格：${info.specs.length ? info.specs.join(", ") : "需要进一步确认"}`,
      `客户关注：${info.needs.length ? info.needs.join(", ") : "产品信息和报价"}`,
      `询盘阶段：${info.needs.includes("quotation") ? "高意向报价询盘" : "初步咨询"}`
    ].map((item) => `<li>${item}</li>`).join("");

    $("productMatch").innerHTML = productCard(best.product, backup?.product, best.hits);
    $("riskList").innerHTML = riskItems.map((item) => `<li>${item}</li>`).join("");
    $("matchScore").textContent = `${matchScore}%`;
    $("usableScore").textContent = `${usableScore}%`;
    $("riskCount").textContent = `${riskItems.length} 项`;
    if ($("riskSummary")) $("riskSummary").textContent = summarizeRisks(riskItems);
    state.lastReply = buildReply(info, best.product, backup?.product);
    state.lastFollowup = buildFollowup(info, best.product);
    state.lastInquiryReport = buildInquiryReport(inquiry, info, best.product, backup?.product, riskItems, decision, state.lastReply, state.lastFollowup);
    state.lastInquiryContext = { inquiry, info, product: best.product, backup: backup?.product || null, riskItems, decision };
    renderInquiryDecision(decision);
    $("reply").value = state.lastReply;
    $("followup").value = state.lastFollowup;
    $("status").textContent = "已生成";

    state.todayCount += 1;
    state.planUsed += 1;
    upsertLead(lead);
    const customerSync = upsertCustomerFromInquiry(info, best.product, decision, inquiry);
    archiveInquiryRecord(inquiry, info, best.product, riskItems, decision, state.lastReply, state.lastFollowup, customerSync);
    markCurrentInquiryDone(best.product.name);
    logAction(`生成询盘回复：${best.product.name}`);
    if (customerSync) logAction(`${customerSync.created ? "自动新增" : "自动更新"}客户：${customerSync.customer.name}`);
    saveState();
    renderAll();
    showToast(customerSync ? `回复已生成，${customerSync.created ? "已自动加入客户管理待确认。" : "已更新客户管理记录。"}` : "回复生成成功，可继续人工编辑。", "success");
    if (quotaReached()) {
      expireCurrentLicense("quota_used", "当前授权次数已用尽，请输入新的授权秘钥。");
    }
  } catch (error) {
    $("status").textContent = "生成失败";
    showToast("生成失败，请检查产品资料或刷新后重试。", "error");
  } finally {
    $("analysisSkeleton")?.classList.remove("show");
    setButtonLoading($("generateBtn"), false, "生成回复");
    updateGenerateButtonState();
  }
}

function classifyInquiry(text) {
  const lower = normalize(text);
  const tags = [];
  if (lower.includes("urgent") || lower.includes("asap") || lower.includes("quick")) tags.push("急单");
  if (lower.includes("quote") || lower.includes("quotation") || lower.includes("price")) tags.push("待报价");
  if (lower.includes("sample")) tags.push("样品");
  if (/\b(1000|2000|3000|5000|10000)\b/.test(lower)) tags.push("高数量");
  if (lower.includes("ce") || lower.includes("rohs") || lower.includes("fda")) tags.push("认证");
  return tags.length ? tags : ["普通询盘"];
}

function importBulkInquiryQueue() {
  const input = $("bulkInquiryInput");
  const rows = input.value.split("\n").map((line) => line.trim()).filter(Boolean);
  if (!rows.length) {
    showToast("请先粘贴批量询盘内容。", "warn");
    input.focus();
    return;
  }
  const now = Date.now();
  const next = rows.map((text, index) => ({
    id: `inq_${now}_${index}`,
    text,
    tags: classifyInquiry(text),
    status: "未处理",
    priority: classifyInquiry(text).includes("急单") || classifyInquiry(text).includes("高数量") ? "高" : "普通",
    createdAt: now + index
  }));
  state.inquiryQueue = [...state.inquiryQueue, ...next].slice(-100);
  input.value = "";
  logAction(`导入批量询盘：${next.length} 条`);
  saveState();
  renderInquiryQueue();
  showToast(`已导入 ${next.length} 条询盘队列。`, "success");
}

function processNextInquiry() {
  const next = state.inquiryQueue.find((item) => item.status !== "已处理");
  if (!next) {
    showToast("暂无待处理询盘。", "warn");
    return;
  }
  $("inquiry").value = next.text;
  $("scenarioSelect").value = "custom";
  updateGenerateButtonState();
  renderInquiryQueue(next.id);
  $("inquiry").scrollIntoView({ behavior: "smooth", block: "center" });
  showToast(`已加载${next.priority}优先级询盘，可点击生成回复。`, "success");
}

function markCurrentInquiryDone(productName) {
  const text = $("inquiry")?.value.trim();
  const found = state.inquiryQueue.find((item) => item.status !== "已处理" && item.text === text);
  if (!found) return;
  found.status = "已处理";
  found.product = productName;
  found.doneAt = Date.now();
}

function renderInquiryQueue(activeId = "") {
  if (!$("inquiryQueue")) return;
  const pending = state.inquiryQueue.filter((item) => item.status !== "已处理").length;
  $("inquiryQueue").innerHTML = state.inquiryQueue.length
    ? `<div class="queue-summary">队列 ${state.inquiryQueue.length} 条｜待处理 ${pending} 条</div>` + state.inquiryQueue.slice(-8).reverse().map((item) => `<div class="queue-item ${item.id === activeId ? "active" : ""} ${item.status === "已处理" ? "done" : ""}">
      <strong>${escapeHtml(item.priority)}优先级 · ${escapeHtml(item.status)}</strong>
      <span>${escapeHtml(item.tags.join(" / "))}</span>
      <p>${escapeHtml(item.text.slice(0, 92))}${item.text.length > 92 ? "..." : ""}</p>
    </div>`).join("")
    : `<div class="queue-empty">暂无批量询盘。可粘贴多条客户询盘后导入队列。</div>`;
}

function renderInquiryArchiveList() {
  if (!$("inquiryArchiveList")) return;
  if ($("inquiryArchiveCount")) $("inquiryArchiveCount").textContent = `${state.inquiryArchive.length} 条`;
  const q = (state.inquiryArchiveSearch || "").trim().toLowerCase();
  const filtered = state.inquiryArchive.filter((item) => {
    if (!q) return true;
    return [item.customer, item.country, item.region, item.product, item.intent, item.inquiry, ...(item.risks || []), ...(item.missing || [])]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });
  if ($("inquiryArchiveCount")) $("inquiryArchiveCount").textContent = q ? `${filtered.length} / ${state.inquiryArchive.length} 条` : `${state.inquiryArchive.length} 条`;
  $("inquiryArchiveList").innerHTML = filtered.length
    ? filtered.slice(0, 8).map((item) => `<div class="archive-item" data-load-inquiry-archive="${escapeAttr(item.id)}">
      <strong>${escapeHtml(item.customer)} · ${escapeHtml(item.product)}</strong>
      <span>${escapeHtml(item.time)}｜${escapeHtml(item.intent)}｜报价准备度 ${escapeHtml(item.quoteReadiness)}%</span>
      <p>${escapeHtml((item.inquiry || "").slice(0, 76))}${(item.inquiry || "").length > 76 ? "..." : ""}</p>
    </div>`).join("")
    : `<div class="queue-empty">${state.inquiryArchive.length ? "没有找到匹配的历史询盘。" : "暂无历史处理记录。生成询盘回复后会自动归档到这里。"}</div>`;
}

function loadInquiryArchive(id) {
  const record = state.inquiryArchive.find((item) => item.id === id);
  if (!record) return;
  $("inquiry").value = record.inquiry || "";
  $("reply").value = record.reply || "";
  $("followup").value = record.followup || "";
  $("status").textContent = "已载入历史记录";
  $("riskList").innerHTML = (record.risks || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  $("riskCount").textContent = `${(record.risks || []).length} 项`;
  if ($("riskSummary")) $("riskSummary").textContent = summarizeRisks(record.risks || []);
  $("productMatch").innerHTML = `<div class="product-card"><strong>${escapeHtml(record.product)}</strong><div>历史归档推荐产品</div></div>`;
  $("analysis").innerHTML = [
    `目标市场：${record.country || "待确认"}`,
    `客户：${record.customer || "未识别客户"}`,
    `区域：${record.region || "待确认"}`,
    `报价准备度：${record.quoteReadiness || 0}%`
  ].map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  updateGenerateButtonState();
  showToast("已载入历史询盘记录，可查看或继续编辑。", "success");
}

function buildRisks(info, product, score) {
  const risks = [];
  if (score === 0) risks.push("产品匹配度不足，需要业务员确认是否有对应型号。");
  if (!info.needs.includes("quotation")) risks.push("客户未明确要求报价，可先引导确认数量和规格。");
  risks.push(`价格需根据最新报价表人工确认，不能直接自动承诺。`);
  risks.push(`${product.risk}.`);
  if (info.country === "Market to confirm") risks.push("目标市场未识别，认证和插头标准需要确认。");
  return risks;
}

function summarizeRisks(riskItems) {
  if (!riskItems.length) return "暂无明显风险，仍需人工复核报价和交期";
  return riskItems.slice(0, 2).join("；") + (riskItems.length > 2 ? `；另有 ${riskItems.length - 2} 项需确认` : "");
}

function detectInquiryType(info) {
  const lower = info.lower;
  if (lower.includes("urgent") || lower.includes("asap") || lower.includes("fast delivery") || lower.includes("soonest")) return "urgent";
  if (lower.includes("oem") || lower.includes("private label") || lower.includes("custom logo") || lower.includes("branding")) return "oem";
  if (lower.includes("sample")) return "sample";
  if (lower.includes("certificate") || lower.includes("certification") || lower.includes("ce") || lower.includes("rohs") || lower.includes("fda")) return "certificate";
  if (lower.includes("catalog") || lower.includes("catalogue") || lower.includes("pictures") || lower.includes("specification")) return "catalogue";
  if (lower.includes("quote") || lower.includes("quotation") || lower.includes("price")) return "quotation";
  return "qualification";
}

function inquiryTypeLabel(type) {
  return {
    quotation: "报价询盘",
    sample: "样品询盘",
    oem: "OEM 定制询盘",
    certificate: "认证合规询盘",
    urgent: "紧急交期询盘",
    catalogue: "资料目录询盘",
    qualification: "需求确认询盘"
  }[type] || "普通询盘";
}

function buildReplyOpening(type, info) {
  const map = {
    quotation: `${state.templates.first}\n\nWe understand that you are requesting price, MOQ and lead time information. We will first confirm the key order details so the quotation can be accurate and practical.`,
    sample: `Thank you for your sample inquiry.\n\n${state.templates.sample}\n\nBefore arranging samples, we would like to confirm the exact model, sample quantity, destination and courier account or freight preference.`,
    oem: `Thank you for your OEM/private label inquiry.\n\n${state.templates.oem}\n\nFor customized orders, we usually confirm logo, packaging, artwork, quantity and target market before giving final cost and production schedule.`,
    certificate: `Thank you for checking the certification details with us.\n\n${state.templates.certificate}\n\nCertification should be confirmed according to the target market and product model, so we will mark this part for internal verification before final quotation.`,
    urgent: `Thank you for your urgent inquiry.\n\n${state.templates.urgent}\n\nWe will check the fastest workable production and delivery schedule after confirming the final quantity and shipping destination.`,
    catalogue: `Thank you for your request.\n\n${state.templates.catalogue}\n\nWe can first share suitable product information for your review, and then prepare quotation after you confirm the interested models.`,
    qualification: `Thank you for your inquiry.\n\nTo recommend the most suitable product, we would like to confirm several key requirements before preparing a detailed quotation.`
  };
  return map[type] || map.qualification;
}

function buildQuestionList(type) {
  const common = [
    "Final order quantity and model mix",
    "Destination port or delivery terms",
    "Required certificate or compliance standard"
  ];
  const typeQuestions = {
    quotation: ["Target price range if available", "Packaging requirement", "Expected order timeline"],
    sample: ["Sample quantity", "Courier account or sample shipping destination", "Whether you need standard sample or customized sample"],
    oem: ["Logo file and packaging artwork", "Private label quantity", "Target market and retail channel"],
    certificate: ["Target country or region", "Required certificate name", "Whether the certificate must match a specific importer name"],
    urgent: ["Required delivery date", "Acceptable shipping method", "Whether partial shipment is acceptable"],
    catalogue: ["Preferred model range", "Application scenario", "Expected quantity for quotation"],
    qualification: ["Application scenario", "Required specifications", "Budget or target price range"]
  };
  return [...common, ...(typeQuestions[type] || typeQuestions.qualification)].slice(0, 6);
}

function buildFollowupByType(type, product) {
  const map = {
    quotation: `Just following up on the quotation discussion for ${product.name}. If you can confirm quantity, packaging and destination port, we can update the price details more accurately.`,
    sample: `Just checking whether you would like us to proceed with sample arrangement for ${product.name}. Please confirm sample quantity and shipping destination so we can calculate sample cost and freight.`,
    oem: `Just following up on the OEM/private label request for ${product.name}. If you can share logo, packaging artwork and order quantity, we can check the customization schedule and cost.`,
    certificate: `Just following up on the certificate confirmation for ${product.name}. Please confirm the target market and required standard so we can verify the certificate version before quotation.`,
    urgent: `Just checking the urgent delivery requirement for ${product.name}. If you confirm the required delivery date and destination port, we can check the fastest workable schedule.`,
    catalogue: `Just checking whether you have reviewed the product information for ${product.name}. Please let us know the models you are interested in so we can prepare a quotation.`,
    qualification: `Just following up to confirm your detailed requirements for ${product.name}. Once we have quantity, specifications and target market, we can recommend the most suitable option.`
  };
  return map[type] || map.qualification;
}

function productCard(product, backup, hits) {
  return `<div class="product-card">
    <strong>${product.name}</strong>
    <div><span class="tag">MOQ ${product.moq}</span><span class="tag">${product.leadTime}</span></div>
    <div>${product.sellingPoints}</div>
    <div>命中关键词：${hits.length ? hits.join(", ") : "暂无强命中，按默认资料推荐"}</div>
    ${backup ? `<div>备选产品：${backup.name}</div>` : ""}
  </div>`;
}

function buildReply(info, product, backup) {
  const type = detectInquiryType(info);
  const questions = buildQuestionList(type);
  const specs = info.specs.length ? info.specs.join(", ") : "your required specifications";
  const needs = info.needs.length ? info.needs.join(", ") : "product details and quotation";
  return `Subject: Re: ${inquiryTypeLabel(type)} - ${product.name}

Dear Customer,

${buildReplyOpening(type, info)}

According to your inquiry for ${info.qty} in ${info.country}, we recommend our ${product.name}. This model matches your request for ${specs} and is suitable for your target sales channel or project use.

Main information:
- Recommended model: ${product.name}
- MOQ: ${product.moq}
- Regular lead time: ${product.leadTime}
- Key advantages: ${product.sellingPoints}

You mentioned that you need ${needs}. We can prepare a detailed quotation after confirming the final quantity, packaging requirements, logo or private label needs, certificate requirements and delivery terms.
${backup ? `\nAs an alternative option, we can also share details of ${backup.name} for comparison if you want a different price or specification level.\n` : ""}

Please confirm the following details so we can update the quotation accurately:
${questions.map((item, index) => `${index + 1}. ${item}`).join("\n")}

Best regards,
Sales Team`;
}

function buildFollowup(info, product) {
  const type = detectInquiryType(info);
  return `Dear Customer,

${state.templates.follow}

${buildFollowupByType(type, product)}

Once we receive the missing details, we can move forward with a more accurate proposal and next-step arrangement.

Best regards,
Sales Team`;
}

function buildLead(info, product) {
  const followDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  return {
    id: `${info.country}-${product.name}`,
    customer: info.customerName || `${info.country} buyer`,
    country: info.country,
    need: product.name,
    stage: info.needs.includes("quotation") ? "报价沟通" : "需求确认",
    next: "3 天后",
    followDate,
    action: "发送跟进邮件并确认规格、包装、证书和交期"
  };
}

function upsertLead(lead) {
  const idx = state.leads.findIndex((item) => item.id === lead.id);
  const next = {
    ...lead,
    followStatus: lead.followStatus || "待跟进",
    followDate: lead.followDate || new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    note: lead.note || ""
  };
  if (idx >= 0) state.leads[idx] = { ...state.leads[idx], ...next };
  else state.leads.unshift(next);
  state.leads = state.leads.slice(0, 80);
}

function hasBuyingIntent(info, decision) {
  const qtyNumber = extractQuantityNumber(info.qty);
  return decision.intentScore >= 66
    || qtyNumber > 0
    || info.needs.some((item) => ["quotation", "sample policy", "delivery time"].includes(item));
}

function customerLevelFromDecision(decision) {
  if (decision.intentScore >= 82) return "A";
  if (decision.intentScore >= 66) return "B";
  return "C";
}

function customerStageFromInquiry(info) {
  if (info.needs.includes("quotation")) return "待报价";
  if (info.needs.includes("sample policy")) return "样品中";
  return "AI待确认";
}

function upsertCustomerFromInquiry(info, product, decision, inquiryText) {
  if (!hasBuyingIntent(info, decision)) return null;
  const normalizedName = String(info.customerName || "").trim().toLowerCase();
  const normalizedEmail = String(info.email || "").trim().toLowerCase();
  const existing = state.business.customers.find((customer) => {
    const sameEmail = normalizedEmail && String(customer.email || "").trim().toLowerCase() === normalizedEmail;
    const sameName = normalizedName && String(customer.name || "").trim().toLowerCase() === normalizedName;
    const sameFallback = sameName && customer.country === info.country;
    return sameEmail || sameFallback;
  });
  const nowText = new Date().toLocaleString("zh-CN");
  const communication = `${nowText} AI从询盘自动识别：${inquiryText.slice(0, 180)}${inquiryText.length > 180 ? "..." : ""}`;
  const base = {
    name: info.customerName || "AI识别客户",
    country: info.country,
    region: info.region,
    level: customerLevelFromDecision(decision),
    stage: customerStageFromInquiry(info),
    category: product.name,
    contact: info.customerName || "待人工确认",
    email: info.email || "待人工确认",
    need: `${product.name}｜${info.qty}｜${info.specs.length ? info.specs.join(", ") : "规格待确认"}`,
    nextAction: decision.nextStep,
    communication,
    deals: "AI自动识别线索，待业务员人工筛选确认是否转为正式订单。"
  };
  if (existing) {
    Object.assign(existing, {
      ...existing,
      country: existing.country === "待填写" ? base.country : existing.country,
      region: existing.region === "其他" ? base.region : existing.region,
      level: base.level < existing.level ? base.level : existing.level,
      stage: base.stage,
      category: base.category,
      contact: existing.contact && existing.contact !== "联系人" ? existing.contact : base.contact,
      email: existing.email && existing.email !== "email@example.com" ? existing.email : base.email,
      need: base.need,
      nextAction: base.nextAction,
      communication: `${existing.communication || ""}\n${communication}`.trim(),
      deals: existing.deals || base.deals
    });
    state.selectedCustomerId = existing.id;
    return { customer: existing, created: false };
  }
  const customer = { id: `ai_c_${Date.now()}`, ...base };
  state.business.customers.unshift(customer);
  state.selectedCustomerId = customer.id;
  return { customer, created: true };
}

function renderAll() {
  $("todayCount").textContent = state.todayCount;
  $("savedTime").textContent = state.todayCount ? `预计累计节省 ${state.todayCount * 21} 分钟` : "等待生成第一封回复";
  $("skuCount").textContent = state.products.length;
  $("planName").textContent = `${state.plan.name}：${state.plan.priceText}`;
  $("planUsage").textContent = hasUnlimitedQuota() ? `${state.planUsed} / 不限次` : `${state.planUsed} / ${state.plan.maxGenerations}`;
  const leftDays = state.license ? Math.max(0, Math.ceil((state.license.expiresAt - Date.now()) / 86400000)) : 0;
  $("planExpire").textContent = `剩余 ${leftDays} 天`;
  updateCountdown();
  renderProducts();
  renderInquiryQueue();
  renderInquiryArchiveList();
  renderLeads();
  renderTemplates();
  renderAccountState();
  renderCommercialPages();
}

function renderCommercialPages() {
  renderDashboard();
  renderOnboardingGuide();
  renderTrialBoard();
  renderCustomersPage();
  renderDocsPage();
  renderOrdersPage();
  renderFinancePage();
  renderScreenPage();
  renderHelpPage();
}

function onboardingItems() {
  return [
    { id: "license", label: "激活授权秘钥", done: !!state.license, action: "查看授权", view: "profile" },
    { id: "account", label: "注册并登录主账号", done: !!state.account, action: "查看账号", view: "profile" },
    { id: "products", label: "导入产品资料", done: state.products.length >= 5, action: "导入产品", view: "products" },
    { id: "customers", label: "导入或新增客户", done: state.business.customers.length >= 5, action: "导入客户", view: "customers" },
    { id: "inquiry", label: "测试一条真实询盘", done: state.inquiryArchive.length >= 1 || state.todayCount >= 1, action: "处理询盘", view: "inquiry" },
    { id: "backup", label: "导出一次完整备份", done: state.logs.some((item) => item.text.includes("导出完整业务备份")), action: "去备份", view: "profile" }
  ];
}

function renderOnboardingGuide() {
  if (!$("onboardingSteps")) return;
  const items = onboardingItems();
  const done = items.filter((item) => item.done).length;
  if ($("onboardingProgress")) $("onboardingProgress").textContent = `${done} / ${items.length}`;
  $("onboardingSteps").innerHTML = items.map((item, index) => `<button class="onboarding-step ${item.done ? "done" : ""}" data-onboarding-view="${escapeAttr(item.view)}" data-onboarding-id="${escapeAttr(item.id)}">
    <b>${index + 1}</b>
    <span>${escapeHtml(item.label)}</span>
    <em>${escapeHtml(item.done ? "已完成" : item.action)}</em>
  </button>`).join("");
}

function trialChecklistItems() {
  const templateValues = Object.values(normalizeTemplates(state.templates)).filter((item) => String(item || "").trim().length >= 20);
  return [
    { id: "products", label: "产品资料库已导入 5 个以上主推产品", done: state.products.length >= 5, action: "去导入", view: "products", hint: `${state.products.length} 个产品` },
    { id: "inquiry", label: "已生成或测试至少 3 条询盘回复", done: state.todayCount >= 3, action: "去测试", view: "inquiry", hint: `${state.todayCount} 条询盘` },
    { id: "leads", label: "已沉淀客户跟进记录", done: state.leads.length >= 1 || state.business.customers.length >= 3, action: "看跟进", view: "follow", hint: `${state.leads.length} 条跟进线索` },
    { id: "templates", label: "回复模板已覆盖报价、样品、OEM、认证、交期场景", done: templateValues.length >= 8, action: "补模板", view: "templates", hint: `${templateValues.length} 个模板` },
    { id: "account", label: "已配置公司账号和本地授权", done: !!state.account && !!state.license, action: "看账号", view: "profile", hint: state.account ? state.account.name : "未登录" },
    { id: "boundary", label: "已确认报价、交期、认证需人工复核", done: true, action: "看边界", view: "trial", hint: "已内置边界说明" },
    { id: "backup", label: "已具备完整备份和恢复入口", done: true, action: "去备份", view: "profile", hint: "个人中心可导出完整备份" }
  ];
}

function renderTrialBoard() {
  if (!$("trialChecklist")) return;
  const items = trialChecklistItems();
  const done = items.filter((item) => item.done).length;
  const score = Math.round((done / items.length) * 100);
  $("trialReadyScore").textContent = `${score}%`;
  $("trialReadyText").textContent = score >= 85 ? "已适合对客户演示和试点交付" : score >= 60 ? "可演示，建议补充真实产品和询盘" : "建议先导入资料再演示";
  $("trialUpgradePath").textContent = score >= 85 ? "进入真实业务测试" : "继续补齐资料";
  if ($("trialProductCount")) $("trialProductCount").textContent = String(state.products.length);
  if ($("trialInquiryCount")) $("trialInquiryCount").textContent = String(state.todayCount);
  if ($("trialLeadCount")) $("trialLeadCount").textContent = String(state.leads.length);
  if ($("trialTemplateCount")) $("trialTemplateCount").textContent = String(Object.values(normalizeTemplates(state.templates)).filter((item) => String(item || "").trim().length >= 20).length);
  $("trialChecklist").innerHTML = items.map((item) => `<div class="check-item ${item.done ? "done" : ""}">
    <span>${item.done ? "已完成" : "待补充"}</span>
    <p>${escapeHtml(item.label)}<small>${escapeHtml(item.hint)}</small></p>
    <button data-trial-action="${escapeAttr(item.id)}">${escapeHtml(item.action)}</button>
  </div>`).join("");
  if ($("trialReviewReport")) $("trialReviewReport").value = trialReviewText(score, items);
  renderDataHealth();
}

function renderDataHealth() {
  if (!$("dataHealthGrid")) return;
  const productComplete = state.products.filter((p) => productCompleteness(p).score >= 80).length;
  const missingEmail = state.business.customers.filter((c) => !c.email || c.email === "email@example.com" || !c.email.includes("@")).length;
  const followOpen = state.leads.filter((lead) => !["已跟进", "已忽略"].includes(lead.followStatus)).length;
  const overdue = state.business.orders.filter((order) => order.status === "逾期" || (Number(order.due || 0) > 0 && new Date(order.dueDate) < new Date())).length;
  const noArchive = Math.max(0, state.todayCount - state.inquiryArchive.length);
  const checks = [
    { label: "产品资料完整", value: `${productComplete}/${state.products.length}`, ok: productComplete >= Math.min(state.products.length, 5), note: "完整度 80% 以上的产品数量" },
    { label: "客户邮箱缺失", value: `${missingEmail} 个`, ok: missingEmail === 0, note: "影响真实邮件跟进和客户管理" },
    { label: "待处理跟进", value: `${followOpen} 条`, ok: followOpen <= 3, note: "建议每天清理跟进任务" },
    { label: "逾期回款订单", value: `${overdue} 个`, ok: overdue === 0, note: "老板最关注的现金流风险" },
    { label: "询盘归档缺口", value: `${noArchive} 条`, ok: noArchive === 0, note: "处理记录应沉淀可追溯" },
    { label: "本地备份状态", value: state.logs.some((item) => item.text.includes("备份")) ? "已备份" : "建议备份", ok: state.logs.some((item) => item.text.includes("备份")), note: "交付前建议导出完整备份" }
  ];
  const okCount = checks.filter((item) => item.ok).length;
  const score = Math.round((okCount / checks.length) * 100);
  if ($("dataHealthScore")) $("dataHealthScore").textContent = `健康度 ${score}%`;
  $("dataHealthGrid").innerHTML = checks.map((item) => `<div class="health-card ${item.ok ? "ok" : "warn"}">
    <span>${escapeHtml(item.label)}</span>
    <strong>${escapeHtml(item.value)}</strong>
    <small>${escapeHtml(item.note)}</small>
  </div>`).join("");
}

function trialPlanText() {
  return `曜海 GlobalTrade AI 上线准备说明

准备目标：
1. 导入主推产品资料；
2. 测试历史真实询盘；
3. 检查回复模板覆盖情况；
4. 沉淀客户跟进记录；
5. 导出完整备份。

使用建议：
先导入 5-10 个主推产品，再用 3 条历史询盘测试询盘分析、推荐产品、英文回复、跟进邮件和人工确认事项。

边界说明：
系统辅助生成草稿，不自动成交、不自动报价、不替代业务员；价格、交期、认证、付款条款和最终发送内容必须人工确认。`;
}

function trialReviewText(score, items = trialChecklistItems()) {
  const doneItems = items.filter((item) => item.done).map((item) => `- 已完成：${item.label}（${item.hint}）`).join("\n");
  const pendingItems = items.filter((item) => !item.done).map((item) => `- 待补充：${item.label}（${item.hint}）`).join("\n") || "- 暂无关键待补充项";
  const latestLead = state.leads[0];
  return `曜海 GlobalTrade AI 上线准备报告

一、准备度
- 当前准备度：${score}%
- 产品资料：${state.products.length} 个
- 已处理询盘：${state.todayCount} 条
- 跟进线索：${state.leads.length} 条
- 客户资料：${state.business.customers.length} 个

二、已完成事项
${doneItems}

三、待补充事项
${pendingItems}

四、最近询盘沉淀
${latestLead ? `- 客户：${latestLead.customer}
- 国家：${latestLead.country}
- 需求：${latestLead.need}
- 阶段：${latestLead.stage}
- 下一步：${latestLead.action}` : "- 暂无真实询盘沉淀，建议先处理 1-3 条历史询盘。"}

五、建议下一步
${score >= 85 ? "当前已适合进入真实业务测试。建议安排业务员用历史询盘继续验证回复质量和跟进流程。" : "建议继续补齐产品资料、回复模板和历史询盘测试，再进入真实业务使用。"}

六、边界说明
本系统辅助生成询盘分析、英文回复草稿、跟进邮件和资料库，不自动成交、不自动报价、不替代业务员。价格、交期、认证、付款条款和最终发送内容必须由客户公司人工确认。`;
}

function exportTrialPackage() {
  const items = trialChecklistItems();
  const done = items.filter((item) => item.done).length;
  const score = Math.round((done / items.length) * 100);
  const payload = {
    exportedAt: new Date().toISOString(),
    product: "曜海 GlobalTrade AI",
    version: state.plan.name,
    readinessScore: score,
    checklist: items,
    readinessGuide: trialPlanText(),
    readinessReport: trialReviewText(score, items),
    products: state.products,
    leads: state.leads,
    templates: normalizeTemplates(state.templates),
    business: {
      customers: state.business.customers,
      orders: state.business.orders,
      docs: state.business.docs,
      developerContact: state.business.developerContact
    }
  };
  downloadTextFile(`yaohai-trial-package-${Date.now()}.json`, JSON.stringify(payload, null, 2), "application/json");
  logAction("导出试点资料包");
  showToast("试点资料包已导出。", "success");
}

function createTrialDemoData() {
  if (state.products.length < 5) state.products = defaultProducts();
  const demoInquiry = "Hi, we need 1000 pcs 100W LED flood light for Germany market. Please quote best FOB price, MOQ, CE/RoHS certificate, lead time and sample cost. We may need custom packaging if price is good.";
  $("inquiry").value = demoInquiry;
  $("scenarioSelect").value = "custom";
  updateGenerateButtonState();
  document.querySelector('[data-view="inquiry"]')?.click();
  showToast("已生成试点演示询盘，请点击“生成回复”完成闭环。", "success");
  logAction("生成试点演示数据");
  saveState();
  renderAll();
}

function goTrialView(view) {
  document.querySelector(`[data-view="${view}"]`)?.click();
}

function money(value) {
  return `$ ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function customerById(id) {
  return state.business.customers.find((item) => item.id === id) || state.business.customers[0];
}

function orderById(id) {
  return state.business.orders.find((item) => item.id === id) || state.business.orders[0];
}

function docById(id) {
  return state.business.docs.find((item) => item.id === id) || state.business.docs[0];
}

function docByType(type) {
  return state.business.docs.find((item) => item.type === type) || null;
}

function businessStats() {
  const orders = state.business.orders;
  const customers = state.business.customers;
  const total = orders.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const paid = orders.reduce((sum, item) => sum + Number(item.paid || 0), 0);
  const due = orders.reduce((sum, item) => sum + Number(item.due || 0), 0);
  const overdue = orders.filter((item) => item.status === "逾期" || new Date(item.dueDate).getTime() < Date.now()).reduce((sum, item) => sum + Number(item.due || 0), 0);
  const follow = customers.filter((item) => ["待报价", "样品中", "待回款"].includes(item.stage)).length;
  const onTime = orders.length ? Math.round((orders.filter((item) => item.status !== "逾期").length / orders.length) * 1000) / 10 : 100;
  const matchRate = Math.min(99, Math.round((state.products.length / Math.max(1, state.products.length + 2)) * 100));
  return { total, paid, due, overdue, follow, onTime, matchRate };
}

function renderDashboard() {
  if (!$("dashRevenue")) return;
  const stats = businessStats();
  $("dashRevenue").textContent = money(stats.total);
  $("dashInquiry").textContent = String(Math.max(state.todayCount, state.leads.length, 0));
  $("dashFollow").textContent = String(stats.follow);
  document.querySelectorAll("[data-dynamic-sku]").forEach((item) => item.textContent = String(state.products.length));
  $("dashboardTodos").innerHTML = state.business.orders.slice(0, 4).map((order) => {
    const customer = customerById(order.customerId);
    const important = order.status === "逾期" || order.status === "待定金" ? "important" : "";
    const done = order.status === "已完成" ? "done" : "";
    return `<div class="${important || done}"><i></i><span>${escapeHtml(customer.name)}：${escapeHtml(order.status)} / ${escapeHtml(order.product)}</span><em>${escapeHtml(order.dueDate || order.shipDate || "待定")}</em></div>`;
  }).join("");
  const points = state.business.orders.map((o, i) => [30 + i * 150, Math.max(42, 190 - Number(o.amount || 0) / Math.max(1, stats.total) * 150)]);
  const path = points.length ? `M${points.map((p) => p.join(" ")).join(" L")}` : "M30 170 L490 90";
  $("dashboardTrend").innerHTML = `<svg viewBox="0 0 520 220" role="img" aria-label="业绩趋势"><path class="grid" d="M20 40H500M20 90H500M20 140H500M20 190H500"/><path class="line" d="${path}"/><g class="dots">${points.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="5"/>`).join("")}</g></svg>`;
  const regionMap = {};
  state.business.customers.forEach((c) => { regionMap[c.region || "其他"] = (regionMap[c.region || "其他"] || 0) + 1; });
  const regions = Object.entries(regionMap);
  $("dashboardRegions").innerHTML = `<div class="pie"></div><ul>${regions.map(([name, count]) => `<li><b></b>${escapeHtml(name)} ${Math.round(count / Math.max(1, state.business.customers.length) * 100)}%</li>`).join("")}</ul>`;
  const productTotals = {};
  state.business.orders.forEach((o) => { productTotals[o.product] = (productTotals[o.product] || 0) + Number(o.amount || 0); });
  $("dashboardProducts").innerHTML = Object.entries(productTotals).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, total], i) => `<div><b>${String(i + 1).padStart(2, "0")}</b><span>${escapeHtml(name)}</span><em>${money(total)}</em></div>`).join("");
}

function renderCustomersPage() {
  if (!$("customerTable")) return;
  const filters = [
    ["all", "全部客户"],
    ["A", "A 类重点"],
    ["AI待确认", "AI待确认"],
    ["待报价", "待报价"],
    ["样品中", "样品中"],
    ["待回款", "待回款"]
  ];
  $("customerFilters").innerHTML = filters.map(([value, label]) => `<button data-customer-filter="${escapeAttr(value)}" class="${state.activeCustomerFilter === value ? "active" : ""}">${label}</button>`).join("");
  const q = (state.customerSearch || "").trim().toLowerCase();
  const customers = state.business.customers.filter((c) => {
    const filterMatch = state.activeCustomerFilter === "all" || c.level === state.activeCustomerFilter || c.stage === state.activeCustomerFilter;
    const searchMatch = !q || [c.name, c.country, c.region, c.level, c.stage, c.category, c.contact, c.email, c.need].join(" ").toLowerCase().includes(q);
    return filterMatch && searchMatch;
  });
  if ($("customerSearchStatus")) $("customerSearchStatus").textContent = q ? `找到 ${customers.length} / ${state.business.customers.length} 个客户` : `显示全部 ${state.business.customers.length} 个客户`;
  $("customerTable").innerHTML = customers.map((c) => {
    const amount = state.business.orders.filter((o) => o.customerId === c.id).reduce((sum, o) => sum + Number(o.amount || 0), 0);
    return `<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.country)}</td><td><span class="level ${c.level.toLowerCase()}">${escapeHtml(c.level)}</span></td><td>${escapeHtml(c.stage)}</td><td>${escapeHtml(c.category)}</td><td class="money">${money(amount)}</td><td><button class="link-btn" data-select-customer="${escapeAttr(c.id)}">查看/编辑</button><button class="link-btn danger-link" data-delete-customer="${escapeAttr(c.id)}">删除</button></td></tr>`;
  }).join("");
  const c = customerById(state.selectedCustomerId);
  if (!c) return;
  $("customerDetailName").textContent = c.name;
  $("customerEditor").innerHTML = [
    ["客户名称", "name"], ["国家", "country"], ["区域", "region"], ["等级", "level"], ["阶段", "stage"], ["需求品类", "category"], ["联系人", "contact"], ["邮箱", "email"], ["重点需求", "need"], ["下一步", "nextAction"]
  ].map(([label, key]) => `<label>${label}<textarea class="mini-textarea" data-customer-field="${key}">${escapeHtml(c[key])}</textarea></label>`).join("") + `
    <div class="record-card">
      <div class="record-head"><strong>沟通记录</strong><span><button class="link-btn" data-focus-record="communication">查看/编辑</button><button class="link-btn danger-link" data-delete-record="communication">删除</button></span></div>
      <textarea class="mini-textarea record-textarea" data-customer-field="communication">${escapeHtml(c.communication)}</textarea>
    </div>
    <div class="record-card">
      <div class="record-head"><strong>成交记录</strong><span><button class="link-btn" data-focus-record="deals">查看/编辑</button><button class="link-btn danger-link" data-delete-record="deals">删除</button></span></div>
      <textarea class="mini-textarea record-textarea" data-customer-field="deals">${escapeHtml(c.deals)}</textarea>
    </div>`;
  $("crmRuleList").innerHTML = state.business.crmRules.map((rule, index) => `<div><b>${escapeHtml(rule.level)}</b><textarea class="mini-textarea" data-rule-index="${index}">${escapeHtml(rule.text)}</textarea></div>`).join("");
}

function renderDocsPage() {
  if (!$("docFolders")) return;
  const types = [["QT", "报价单"], ["PI", "形式发票"], ["CI", "商业发票"], ["PL", "装箱单"]];
  if (!state.selectedDocType) state.selectedDocType = docById(state.selectedDocId)?.type || "PI";
  const selectedTypeDoc = docByType(state.selectedDocType);
  if (selectedTypeDoc) state.selectedDocId = selectedTypeDoc.id;
  $("docFolders").innerHTML = types.map(([type, title]) => `<div class="doc-folder ${state.selectedDocType === type ? "active" : ""}" data-select-doc-type="${type}"><b>${type}</b><strong>${title}</strong><span>${state.business.docs.filter((d) => d.type === type).length} 份</span><small>新建${title}</small></div>`).join("");
  if ($("addDocBtn")) $("addDocBtn").textContent = `新建${docTypeMeta(state.selectedDocType || "PI").title}`;
  if ($("saveDocBtn")) $("saveDocBtn").textContent = `保存${docTypeMeta(state.selectedDocType || "PI").title}`;
  const doc = selectedTypeDoc || docById(state.selectedDocId);
  if (!doc) {
    const meta = docTypeMeta(state.selectedDocType || "PI");
    $("docEditor").innerHTML = `<div class="empty-panel"><strong>暂无${escapeHtml(meta.title)}</strong><p>点击右上角“新建${escapeHtml(meta.title)}”即可创建该类型单证。</p></div>`;
    $("docPreview").innerHTML = `<div class="paper-head"><div><strong>${escapeHtml(state.business.company)}</strong><span>Premium Foreign Trade System</span></div><div><b>${escapeHtml(meta.noName)}</b><span>未创建</span></div></div><div class="empty-panel"><strong>暂无预览</strong><p>请先新建${escapeHtml(meta.title)}。</p></div>`;
    return;
  }
  const customer = customerById(doc.customerId);
  const meta = docTypeMeta(doc.type);
  $("docEditor").innerHTML = [
    ["单证类型", "type"], ["单证名称", "title"], ["单证编号", "docNo"], ["客户ID", "customerId"], ["订单ID", "orderId"], ["贸易条款", "tradeTerm"], ["付款方式", "payment"], ["交期", "leadTime"], ["港口", "port"], ["产品明细", "items"]
  ].map(([label, key]) => `<label>${label}<textarea class="mini-textarea" data-doc-field="${key}">${escapeHtml(doc[key])}</textarea></label>`).join("");
  const rows = String(doc.items || "").split("\n").filter(Boolean).map((line, index) => {
    const parts = line.split("|").map((p) => p.trim());
    return `<tr><td>${index + 1}</td><td>${escapeHtml(parts[0] || "")}</td><td>${escapeHtml(parts[1] || "")}</td><td class="money">${escapeHtml(parts[2] || "")}</td><td class="money">${escapeHtml(parts[3] || "")}</td></tr>`;
  }).join("");
  const tableHead = doc.type === "PL"
    ? "<tr><th>Item</th><th>Description</th><th>Cartons</th><th>G.W. / N.W.</th><th>CBM</th></tr>"
    : "<tr><th>Item</th><th>Description</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr>";
  $("docPreview").innerHTML = `<div class="paper-head"><div><strong>${escapeHtml(state.business.company)}</strong><span>Premium Foreign Trade System</span></div><div><b>${escapeHtml(meta.noName)}</b><span>${escapeHtml(doc.docNo)}</span></div></div><div class="party"><div><small>Buyer</small><strong>${escapeHtml(customer.name)}</strong><span>${escapeHtml(customer.country)}</span></div><div><small>Seller</small><strong>${escapeHtml(state.business.company)}</strong><span>Local Deployment</span></div></div><table><thead>${tableHead}</thead><tbody>${rows}</tbody></table><div class="terms"><span>${escapeHtml(doc.tradeTerm)}</span><span>${escapeHtml(doc.payment)}</span><span>${escapeHtml(doc.leadTime)}</span><span>${escapeHtml(doc.port)}</span></div><div class="signature"><span>Company Stamp</span><span>Authorized Signature</span></div>`;
}

function renderOrdersPage() {
  if (!$("orderTable")) return;
  const q = (state.orderSearch || "").trim().toLowerCase();
  const orders = state.business.orders.filter((o) => {
    const customer = customerById(o.customerId);
    return !q || [o.orderNo, customer.name, o.product, o.status, o.qualityRisk, o.shipDate, o.payNode, ...(o.logistics || [])].join(" ").toLowerCase().includes(q);
  });
  if ($("orderSearchStatus")) $("orderSearchStatus").textContent = q ? `找到 ${orders.length} / ${state.business.orders.length} 个订单` : `显示全部 ${state.business.orders.length} 个订单`;
  $("orderTable").innerHTML = orders.length ? orders.map((o) => `<tr><td>${escapeHtml(o.orderNo)}</td><td>${escapeHtml(customerById(o.customerId).name)}</td><td>${escapeHtml(o.product)}</td><td class="money">${money(o.amount)}</td><td><span class="state ${o.status === "逾期" || o.status === "待定金" ? "warn" : ""}">${escapeHtml(o.status)}</span></td><td><button class="link-btn" data-select-order="${escapeAttr(o.id)}">查看/编辑</button></td></tr>`).join("") : `<tr><td colspan="6">没有找到匹配订单。</td></tr>`;
  const order = orderById(state.selectedOrderId);
  const allSteps = ["订单确认", "定金到账", "生产中", "验货", "出运"];
  $("orderProgress").innerHTML = `<div class="progress-track"><i style="width:${Number(order.progress || 0)}%"></i></div><div class="steps">${allSteps.map((step) => `<div class="${order.steps.includes(step) ? "done" : step === order.status ? "active" : ""}"><b></b><span>${step}</span><em>${order.steps.includes(step) ? "已完成" : "待定"}</em></div>`).join("")}</div>`;
  $("orderEditor").innerHTML = [
    ["订单号", "orderNo"], ["客户ID", "customerId"], ["产品", "product"], ["金额", "amount"], ["已回款", "paid"], ["待回款", "due"], ["到期日期", "dueDate"], ["状态", "status"], ["生产完成率", "progress"], ["质检风险", "qualityRisk"], ["预计出货", "shipDate"], ["回款节点", "payNode"], ["已完成节点", "steps"], ["物流跟踪", "logistics"]
  ].map(([label, key]) => `<label>${label}<textarea class="mini-textarea" data-order-field="${key}">${escapeHtml(Array.isArray(order[key]) ? order[key].join("\n") : order[key])}</textarea></label>`).join("");
  $("orderTimeline").innerHTML = order.logistics.map((item) => `<div><b></b><strong>${escapeHtml(item)}</strong><span>${escapeHtml(order.orderNo)}</span></div>`).join("");
  $("fulfillmentBoard").innerHTML = `<div><span>生产完成率</span><strong>${escapeHtml(order.progress)}%</strong></div><div><span>质检风险</span><strong>${escapeHtml(order.qualityRisk)}</strong></div><div><span>预计出货</span><strong>${escapeHtml(order.shipDate)}</strong></div><div><span>回款节点</span><strong>${escapeHtml(order.payNode)}</strong></div>`;
}

function renderFinancePage() {
  if (!$("financeMetrics")) return;
  const stats = businessStats();
  $("financeMetrics").innerHTML = `<div class="lux-card"><span>已回款</span><strong>${money(stats.paid)}</strong><small class="up">按订单已回款汇总</small></div><div class="lux-card"><span>待回款</span><strong>${money(stats.due)}</strong><small>${state.business.orders.length} 个订单</small></div><div class="lux-card"><span>逾期款</span><strong class="danger">${money(stats.overdue)}</strong><small class="down">需跟进</small></div>`;
  const f = state.business.finance;
  $("financeEditor").innerHTML = [["产品成本", "productCost"], ["包装成本", "packageCost"], ["内陆运费", "inlandFreight"], ["目标利润", "targetProfit"]].map(([label, key]) => `<label>${label}<input data-finance-field="${key}" value="${escapeAttr(f[key])}"></label>`).join("");
  $("paymentTable").innerHTML = state.business.orders.map((o) => `<tr><td>${escapeHtml(customerById(o.customerId).name)}</td><td>${escapeHtml(o.orderNo)}</td><td class="money">${money(o.due)}</td><td>${escapeHtml(o.dueDate)}</td><td><span class="state ${o.status === "逾期" ? "warn" : ""}">${escapeHtml(o.status)}</span></td></tr>`).join("");
}

function renderScreenPage() {
  if (!$("screenGrid")) return;
  const stats = businessStats();
  const europe = state.business.customers.length ? Math.round(state.business.customers.filter((c) => c.region === "欧洲").length / state.business.customers.length * 100) : 0;
  $("screenTime").textContent = new Date().toLocaleString("zh-CN");
  $("screenGrid").innerHTML = `<div class="screen-box"><span>月度询盘</span><strong>${Math.max(state.todayCount, state.leads.length)}</strong></div><div class="screen-core"><span>年度成交额</span><strong>${money(stats.total)}</strong><small>${escapeHtml(state.business.company)}</small></div><div class="screen-box"><span>活跃客户</span><strong>${state.business.customers.length}</strong></div><div class="screen-box"><span>欧洲市场</span><strong>${europe}%</strong></div><div class="screen-box"><span>准时交付</span><strong>${stats.onTime}%</strong></div><div class="screen-box"><span>资料匹配率</span><strong>${stats.matchRate}%</strong></div>`;
}

function renderHelpPage() {
  if (!$("helpGrid")) return;
  $("helpGrid").innerHTML = Object.keys(state.business.help).map((key) => `<div class="panel help-item" data-help-key="${escapeAttr(key)}"><h2>${escapeHtml(key)}</h2><p>${escapeHtml(state.business.help[key]).slice(0, 46)}...</p></div>`).join("");
  const c = state.business.developerContact;
  $("serviceContact").innerHTML = `<h3>联系服务方</h3><p>联系人：${escapeHtml(c.name)}</p><p>电话：${escapeHtml(c.phone)}</p><p>微信：${escapeHtml(c.wechat)}</p><p>邮箱：${escapeHtml(c.email)}</p>`;
}

function renderProducts() {
  const q = (state.productSearch || "").trim().toLowerCase();
  const indexed = state.products.map((p, index) => ({ p, index }));
  const filtered = q ? indexed.filter(({ p }) => [
    p.name,
    (p.keywords || []).join(", "),
    p.moq,
    p.leadTime,
    p.sellingPoints,
    p.risk
  ].join(" ").toLowerCase().includes(q)) : indexed;
  $("productTable").innerHTML = filtered.length ? filtered.map(({ p, index }) => productRow(p, index)).join("") : `<tr><td colspan="8">没有找到匹配产品。请换关键词查询。</td></tr>`;
  if ($("productSearchStatus")) {
    $("productSearchStatus").textContent = q ? `找到 ${filtered.length} / ${state.products.length} 个产品` : `显示全部 ${state.products.length} 个产品`;
  }
  const complete = state.products.filter((p) => p.name && p.keywords.length && p.moq && p.leadTime && p.sellingPoints).length;
  const rate = Math.round((complete / Math.max(1, state.products.length)) * 100);
  $("libraryHealth").textContent = `${rate}% 完整`;
  $("healthList").innerHTML = [
    ["产品名称", "已配置"],
    ["关键词匹配", "已配置"],
    ["MOQ / 交期", "已配置"],
    ["风险提示", "已配置"],
    ["报价表接入", "商用版接入"]
  ].map(([k, v]) => `<div class="health-item"><span>${k}</span><strong>${v}</strong></div>`).join("");
}

function productCompleteness(product) {
  const checks = [
    ["产品名", !!product.name],
    ["关键词", Array.isArray(product.keywords) && product.keywords.length >= 2],
    ["MOQ", !!product.moq && !/to confirm|待确认/i.test(product.moq)],
    ["交期", !!product.leadTime && !/to confirm|待确认/i.test(product.leadTime)],
    ["卖点", !!product.sellingPoints && product.sellingPoints.length >= 10],
    ["风险提示", !!product.risk && product.risk.length >= 8]
  ];
  const done = checks.filter(([, ok]) => ok).length;
  const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
  return { score: Math.round(done / checks.length * 100), missing };
}

function productRow(p, index) {
  const completeness = productCompleteness(p);
  if (p.editing) {
    return `<tr>
      <td><input class="editable-cell" id="edit-name-${index}" value="${escapeAttr(p.name)}"></td>
      <td><input class="editable-cell" id="edit-keywords-${index}" value="${escapeAttr((p.keywords || []).join(", "))}"></td>
      <td><input class="editable-cell" id="edit-moq-${index}" value="${escapeAttr(p.moq || "")}"></td>
      <td><input class="editable-cell" id="edit-lead-${index}" value="${escapeAttr(p.leadTime || "")}"></td>
      <td><input class="editable-cell" id="edit-selling-${index}" value="${escapeAttr(p.sellingPoints || "")}"></td>
      <td><input class="editable-cell" id="edit-risk-${index}" value="${escapeAttr(p.risk || "")}"></td>
      <td><span class="quality-pill ${completeness.score < 80 ? "warn" : ""}">${completeness.score}%</span></td>
      <td><div class="row-actions"><button data-action="save-product" data-index="${index}">保存</button><button data-action="cancel-edit-product" data-index="${index}">取消</button></div></td>
    </tr>`;
  }
  return `<tr>
    <td>${escapeHtml(p.name)}</td>
    <td>${escapeHtml((p.keywords || []).join(", "))}</td>
    <td>${escapeHtml(p.moq || "")}</td>
    <td>${escapeHtml(p.leadTime || "")}</td>
    <td>${escapeHtml(p.sellingPoints || "")}</td>
    <td>${escapeHtml(p.risk || "")}</td>
    <td><span class="quality-pill ${completeness.score < 80 ? "warn" : ""}" title="${escapeAttr(completeness.missing.length ? `缺失：${completeness.missing.join("、")}` : "资料完整")}">${completeness.score}%</span></td>
    <td><div class="row-actions"><button data-action="edit-product" data-index="${index}">编辑</button><button data-action="delete-product" data-index="${index}">删除</button></div></td>
  </tr>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function editProduct(index) {
  state.products = state.products.map((p, i) => ({ ...p, editing: i === index }));
  renderProducts();
}

function cancelEditProduct(index) {
  if (state.products[index]) state.products[index].editing = false;
  renderProducts();
}

function saveProduct(index) {
  if (!state.products[index]) return;
  state.products[index] = {
    name: $(`edit-name-${index}`).value.trim() || "Unnamed Product",
    keywords: $(`edit-keywords-${index}`).value.split(",").map((item) => item.trim()).filter(Boolean),
    moq: $(`edit-moq-${index}`).value.trim() || "To confirm",
    leadTime: $(`edit-lead-${index}`).value.trim() || "To confirm",
    sellingPoints: $(`edit-selling-${index}`).value.trim() || "To confirm",
    risk: $(`edit-risk-${index}`).value.trim() || "Final quotation needs manual confirmation",
    editing: false
  };
  saveState();
  renderAll();
}

function deleteProduct(index) {
  if (!requireDeletePermission("删除产品")) return;
  const target = state.products[index];
  if (!target) return;
  if (!confirmDanger("删除产品资料", target.name)) return;
  const removed = state.products.splice(index, 1)[0];
  if (!removed) return;
  delete removed.editing;
  state.deletedProducts.unshift({ product: removed, index, deletedAt: Date.now() });
  state.deletedProducts = state.deletedProducts.slice(0, 10);
  saveState();
  renderAll();
}

function undoDeleteProduct() {
  const item = state.deletedProducts.shift();
  if (!item) {
    showToast("暂无可撤回的删除记录。", "warn");
    return;
  }
  state.products.splice(Math.min(item.index, state.products.length), 0, item.product);
  saveState();
  renderAll();
  showToast("已恢复误删产品。", "success");
}

function renderLeads() {
  $("leadCount").textContent = `${state.leads.length} 个客户`;
  $("leadTable").innerHTML = state.leads.length ? state.leads.map((lead) => `<tr>
    <td>${escapeHtml(lead.customer)}</td>
    <td>${escapeHtml(lead.country)}</td>
    <td>${escapeHtml(lead.need)}</td>
    <td><span class="state ${lead.stage?.includes("高") ? "warn" : ""}">${escapeHtml(lead.stage)}</span></td>
    <td>${escapeHtml(lead.next)}</td>
    <td><input type="date" class="mini-date" data-lead-date="${escapeAttr(lead.id)}" value="${escapeAttr(lead.followDate || "")}"></td>
    <td>
      <div>${escapeHtml(lead.action)}</div>
      <small class="lead-note">${escapeHtml(lead.followStatus || "待跟进")}${lead.note ? `｜${escapeHtml(lead.note)}` : ""}</small>
      <div class="row-actions lead-actions">
        <button data-lead-action="done" data-lead-id="${escapeAttr(lead.id)}">已跟进</button>
        <button data-lead-action="delay" data-lead-id="${escapeAttr(lead.id)}">延期</button>
        <button data-lead-action="note" data-lead-id="${escapeAttr(lead.id)}">备注</button>
        <button data-lead-action="ignore" data-lead-id="${escapeAttr(lead.id)}">忽略</button>
      </div>
    </td>
  </tr>`).join("") : `<tr><td colspan="6">暂无跟进任务。生成询盘回复后会自动创建。</td></tr>`;
  renderFollowReminderGrid();
}

function updateLeadStatus(id, action) {
  const lead = state.leads.find((item) => item.id === id);
  if (!lead) return;
  if (action === "done") {
    lead.followStatus = "已跟进";
    lead.next = "等待客户反馈";
  }
  if (action === "delay") {
    lead.followStatus = "已延期";
    lead.next = "延期 2 天后跟进";
    const base = lead.followDate ? new Date(lead.followDate) : new Date();
    lead.followDate = new Date(base.getTime() + 2 * 86400000).toISOString().slice(0, 10);
  }
  if (action === "ignore") {
    if (!confirm(`确认忽略「${lead.customer}」这条跟进任务吗？`)) return;
    lead.followStatus = "已忽略";
  }
  if (action === "note") {
    const note = prompt("请输入跟进备注：", lead.note || "");
    if (note === null) return;
    lead.note = note.trim();
    lead.followStatus = lead.followStatus || "待跟进";
  }
  logAction(`更新跟进任务：${lead.customer} / ${lead.followStatus}`);
  saveState();
  renderAll();
  showToast("跟进任务已更新。", "success");
}

function renderFollowReminderGrid() {
  if (!$("followReminderGrid")) return;
  const reminders = followReminderRows();
  const urgent = reminders.filter((item) => item.urgency !== "正常").length;
  const overdue = reminders.filter((item) => item.urgency === "逾期催收").length;
  const receivable = state.business.orders.reduce((sum, order) => sum + Number(order.due || 0), 0);
  $("followReminderGrid").innerHTML = [
    ["今日需跟进", `${urgent} 个`, "待报价 / 样品中 / 待回款客户"],
    ["逾期催收", `${overdue} 个`, "优先确认尾款和付款日期"],
    ["待回款金额", money(receivable), "来自订单履约和财务结算"],
    ["已归档询盘", `${state.inquiryArchive.length} 条`, "可导出为 CSV 复盘"]
  ].map(([label, value, note]) => `<div class="reminder-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></div>`).join("");
}

function renderTemplates() {
  $("tplFirst").value = state.templates.first;
  $("tplQuote").value = state.templates.quote;
  $("tplSample").value = state.templates.sample;
  $("tplFollow").value = state.templates.follow;
  if ($("tplOem")) $("tplOem").value = state.templates.oem || defaultTemplates().oem;
  if ($("tplCertificate")) $("tplCertificate").value = state.templates.certificate || defaultTemplates().certificate;
  if ($("tplUrgent")) $("tplUrgent").value = state.templates.urgent || defaultTemplates().urgent;
  if ($("tplCatalogue")) $("tplCatalogue").value = state.templates.catalogue || defaultTemplates().catalogue;
}

function setScenario(name) {
  if (name !== "custom") {
    $("inquiry").value = scenarios[name];
    showToast("已加载示例，可修改后生成回复。", "success");
  }
  updateGenerateButtonState();
}

function updateGenerateButtonState() {
  const empty = !$("inquiry")?.value.trim();
  if ($("generateBtn")) {
    $("generateBtn").disabled = empty;
    $("generateBtn").title = empty ? "请输入 / 选择询盘内容" : "";
  }
}

function resetGeneratedText(type) {
  if (type === "reply" && state.lastReply) {
    $("reply").value = state.lastReply;
    showToast("英文回复已重置为 AI 生成版本。", "success");
  }
  if (type === "follow" && state.lastFollowup) {
    $("followup").value = state.lastFollowup;
    showToast("跟进邮件已重置为 AI 生成版本。", "success");
  }
}

async function copyFieldValue(id, message) {
  const node = $(id);
  const content = node?.value ?? node?.textContent ?? "";
  if (!content.trim()) {
    showToast("暂无可复制内容。", "warn");
    return;
  }
  try {
    await navigator.clipboard.writeText(content);
    showToast(message, "success");
  } catch {
    showToast("复制失败，请手动复制。", "error");
  }
}

async function copyInquiryReport() {
  if (!state.lastInquiryReport) {
    showToast("请先生成询盘处理结果。", "warn");
    return;
  }
  try {
    await navigator.clipboard.writeText(state.lastInquiryReport);
    showToast("询盘处理报告已复制，可发给老板或业务员复核。", "success");
  } catch {
    showToast("复制失败，请手动复制报告内容。", "error");
  }
}

function importLines(text) {
  const rows = text.split("\n").map((line) => line.trim()).filter(Boolean);
  if (!rows.length) {
    showToast("请输入需要导入的产品资料。", "warn");
    $("bulkImport").focus();
    return;
  }
  const errors = [];
  rows.forEach((row, index) => {
    if (!row.includes("|")) errors.push(`第 ${index + 1} 行缺少分隔符 |`);
    if (row.split("|").length < 6) errors.push(`第 ${index + 1} 行字段不足，应为：产品名 | 关键词 | MOQ | 交期 | 卖点 | 风险提示`);
  });
  if (errors.length) {
    showToast(errors[0], "error", 3600);
    $("bulkImport").focus();
    return;
  }
  let imported = 0;
  rows.forEach((row) => {
    const [name, keywords, moq, leadTime, sellingPoints, risk] = row.split("|").map((item) => item?.trim());
    if (!name || !keywords) return;
    state.products.unshift({
      name,
      keywords: keywords.split(",").map((item) => item.trim()).filter(Boolean),
      moq: moq || "To confirm",
      leadTime: leadTime || "To confirm",
      sellingPoints: sellingPoints || "To confirm",
      risk: risk || "Final quotation needs manual confirmation"
    });
    imported += 1;
  });
  logAction(`导入产品资料：${imported} 个`);
  saveState();
  renderAll();
  showToast(`成功导入 ${imported} 个产品。`, "success");
}

function generateProductDraft(name) {
  const raw = name.trim();
  const lower = raw.toLowerCase();
  if (!raw) return "";

  const catalog = [
    {
      test: ["太阳能", "solar", "garden light", "庭院灯", "solar light"],
      keywords: ["solar light", "solar garden light", "garden light", "outdoor light", "waterproof", "太阳能灯", "庭院灯"],
      moq: "500 pcs",
      leadTime: "25-35 days after deposit",
      sellingPoints: "Solar powered, IP65 waterproof design, suitable for garden, patio and outdoor retail channels, customized packaging supported",
      risk: "Battery capacity, solar panel specification, lighting hours, waterproof grade, certificate and final price need manual confirmation"
    },
    {
      test: ["led", "flood", "投光灯", "泛光灯"],
      keywords: ["led flood light", "flood light", "100w", "ip65", "warehouse", "outdoor lighting", "投光灯"],
      moq: "500 pcs",
      leadTime: "20-30 days after deposit",
      sellingPoints: "High brightness LED flood light, IP65 waterproof housing, suitable for warehouse, outdoor project and commercial lighting",
      risk: "Wattage, lumen, color temperature, certificate version, voltage and final quotation need manual confirmation"
    },
    {
      test: ["kettle", "水壶", "电热水壶"],
      keywords: ["electric kettle", "stainless steel kettle", "1.7l", "custom logo", "supermarket", "电热水壶"],
      moq: "1000 pcs",
      leadTime: "35-45 days after deposit and artwork confirmation",
      sellingPoints: "Stainless steel body, custom logo supported, suitable for supermarket promotion and retail channels",
      risk: "Voltage, plug type, safety certification, packaging, logo artwork and final price need manual confirmation"
    },
    {
      test: ["dog", "pet", "crate", "宠物", "狗笼"],
      keywords: ["dog crate", "foldable dog crate", "pet product", "private label", "pet cage", "狗笼"],
      moq: "500 pcs",
      leadTime: "30-40 days after artwork approval",
      sellingPoints: "Foldable design, multiple sizes available, private label packaging supported, suitable for pet distributors",
      risk: "Size mix, material thickness, packaging artwork, sample cost and final quotation need manual confirmation"
    },
    {
      test: ["drill", "电钻", "cordless"],
      keywords: ["cordless drill", "electric drill", "18v", "20v", "two batteries", "power tools", "电钻"],
      moq: "300 pcs",
      leadTime: "25-35 days after deposit",
      sellingPoints: "Cordless design, lithium battery options, retail color box available, suitable for hardware retail channels",
      risk: "Voltage, battery capacity, plug, certification, packaging and final quotation need manual confirmation"
    }
  ];

  const matched = catalog.find((item) => item.test.some((word) => lower.includes(word.toLowerCase())));
  const draft = matched || {
    keywords: [raw, raw.toLowerCase(), "custom product", "oem", "wholesale"],
    moq: "To be confirmed",
    leadTime: "To be confirmed",
    sellingPoints: "Product features, application scenarios, packaging options and customization support need to be completed based on customer materials",
    risk: "MOQ, lead time, specifications, certification, packaging and final price must be confirmed with customer materials"
  };

  return `${raw} | ${draft.keywords.join(",")} | ${draft.moq} | ${draft.leadTime} | ${draft.sellingPoints} | ${draft.risk}`;
}

function translateText(text, mode, tone) {
  const source = text.trim();
  if (!source) return "";
  const lower = source.toLowerCase();
  const phraseMap = [
    ["请确认包装方式、目标港口和是否需要定制 logo。", "Please confirm the packaging method, destination port, and whether a customized logo is required."],
    ["请发送报价", "Please send us your quotation."],
    ["最小起订量", "minimum order quantity"],
    ["交期", "lead time"],
    ["样品费用", "sample cost"],
    ["付款方式", "payment terms"],
    ["包装方式", "packaging method"],
    ["目标港口", "destination port"],
    ["定制 logo", "customized logo"],
    ["报价有效期", "quotation validity"],
    ["请确认", "please confirm"],
    ["我们需要", "we need"],
    ["请尽快回复", "Please reply at your earliest convenience."],
    ["We need", "我们需要"],
    ["Please confirm", "请确认"],
    ["quotation", "报价"],
    ["MOQ", "最小起订量"],
    ["lead time", "交期"],
    ["sample cost", "样品费用"],
    ["payment terms", "付款方式"],
    ["customized logo", "定制 logo"],
    ["destination port", "目标港口"],
    ["packaging", "包装"]
  ];

  if (mode === "zh-en" || (mode === "auto-en" && /[\u4e00-\u9fa5]/.test(source))) {
    let translated = source;
    phraseMap.forEach(([from, to]) => {
      translated = translated.replaceAll(from, to);
    });
    if (/[\u4e00-\u9fa5]/.test(translated)) {
      translated = `Please confirm the product details, quantity, packaging, delivery terms and any customization requirements. Original note: ${source}`;
    }
    return polishTranslation(translated, tone);
  }

  if (mode === "en-zh") {
    let translated = source;
    phraseMap.forEach(([from, to]) => {
      translated = translated.replaceAll(from, to);
    });
    if (!/[\u4e00-\u9fa5]/.test(translated)) {
      translated = `请确认以下外贸沟通内容：${source}`;
    }
    return translated;
  }

  const targetMap = {
    "en-es": {
      label: "Spanish",
      sample: "Por favor confirme los detalles del producto, la cantidad, el embalaje, el puerto de destino y si necesita un logotipo personalizado."
    },
    "en-ar": {
      label: "Arabic",
      sample: "يرجى تأكيد تفاصيل المنتج والكمية والتعبئة وميناء الوصول وما إذا كنتم بحاجة إلى شعار مخصص."
    },
    "en-fr": {
      label: "French",
      sample: "Veuillez confirmer les details du produit, la quantite, l'emballage, le port de destination et si vous avez besoin d'un logo personnalise."
    },
    "en-de": {
      label: "German",
      sample: "Bitte bestaetigen Sie die Produktdetails, Menge, Verpackung, den Zielhafen und ob ein individuelles Logo benoetigt wird."
    },
    "en-pt": {
      label: "Portuguese",
      sample: "Por favor, confirme os detalhes do produto, a quantidade, a embalagem, o porto de destino e se precisa de logotipo personalizado."
    }
  };

  const target = targetMap[mode];
  if (target) {
    return `${target.sample}\n\nReference original:\n${source}`;
  }

  if (lower.includes("quotation") || lower.includes("price")) {
    return polishTranslation("Please confirm the final quantity, packaging requirements, destination port and required certificates. We will update the quotation accordingly.", tone);
  }
  return polishTranslation(source, tone);
}

function polishTranslation(text, tone) {
  if (tone === "friendly") {
    return `${text}\n\nThank you, and we look forward to your reply.`;
  }
  if (tone === "simple") {
    return text.replace("Please confirm", "Please confirm");
  }
  return `${text}\n\nBest regards,\nSales Team`;
}

function enhancedTradeLexicon() {
  return [
    ["请确认包装方式、目标港口和是否需要定制 logo。", "Please confirm the packaging method, destination port, and whether a customized logo is required."],
    ["请发送报价", "please send us your quotation"],
    ["请提供报价", "please provide your quotation"],
    ["最小起订量", "minimum order quantity"],
    ["起订量", "minimum order quantity"],
    ["交期", "lead time"],
    ["生产周期", "production lead time"],
    ["样品费用", "sample cost"],
    ["样品时间", "sample lead time"],
    ["付款方式", "payment terms"],
    ["包装方式", "packaging method"],
    ["目标港口", "destination port"],
    ["定制 logo", "customized logo"],
    ["报价有效期", "quotation validity"],
    ["证书", "certificate"],
    ["认证", "certification"],
    ["规格", "specification"],
    ["型号", "model"],
    ["数量", "quantity"],
    ["单价", "unit price"],
    ["总价", "total amount"],
    ["运费", "shipping cost"],
    ["样品", "sample"],
    ["产品目录", "product catalogue"],
    ["目录", "catalogue"],
    ["请确认", "please confirm"],
    ["我们需要", "we need"],
    ["请尽快回复", "please reply at your earliest convenience"],
    ["期待您的回复", "we look forward to your reply"],
    ["如果价格合适", "if the price is competitive"],
    ["我们会下单", "we will place an order"],
    ["请问有库存吗", "do you have stock available"],
    ["可以安排样品吗", "can you arrange samples"],
    ["请发产品图片", "please send product pictures"],
    ["请发详细规格", "please send detailed specifications"],
    ["能否优惠", "could you offer a better price"],
    ["We need", "我们需要"],
    ["Please confirm", "请确认"],
    ["Please send", "请发送"],
    ["quotation", "报价"],
    ["quote", "报价"],
    ["price", "价格"],
    ["MOQ", "最小起订量"],
    ["minimum order quantity", "最小起订量"],
    ["lead time", "交期"],
    ["delivery time", "交货时间"],
    ["sample cost", "样品费用"],
    ["sample lead time", "样品时间"],
    ["payment terms", "付款方式"],
    ["customized logo", "定制 logo"],
    ["destination port", "目标港口"],
    ["packaging", "包装"],
    ["catalogue", "目录"],
    ["certificate", "证书"],
    ["specification", "规格"],
    ["quantity", "数量"],
    ["unit price", "单价"],
    ["shipping cost", "运费"],
    ["stock", "库存"],
    ["order", "订单"],
    ["invoice", "发票"],
    ["proforma invoice", "形式发票"]
  ];
}

function normalizeTradeEnglish(source) {
  const text = source.trim();
  const lower = text.toLowerCase();
  const hasChinese = /[\u4e00-\u9fa5]/.test(text);

  if (hasChinese) {
    let translated = text;
    enhancedTradeLexicon().forEach(([from, to]) => {
      if (/^[\u4e00-\u9fa5]/.test(from)) translated = translated.replaceAll(from, to);
    });
    if (!/[\u4e00-\u9fa5]/.test(translated)) return translated;

    const parts = [];
    if (text.includes("报价") || text.includes("价格")) parts.push("please provide your quotation");
    if (text.includes("数量")) parts.push("including quantity requirements");
    if (text.includes("包装")) parts.push("packaging details");
    if (text.includes("交期") || text.includes("生产周期")) parts.push("lead time");
    if (text.includes("样品")) parts.push("sample cost and sample lead time");
    if (text.includes("付款")) parts.push("payment terms");
    if (text.includes("证书") || text.includes("认证")) parts.push("required certificates");
    if (text.includes("logo") || text.includes("定制")) parts.push("customization requirements");
    if (!parts.length) parts.push("product details, quantity, packaging, delivery terms and customization requirements");
    return `${parts.join(", ")}. Original note: ${text}`;
  }

  if (lower.includes("quote") || lower.includes("quotation") || lower.includes("price")) {
    return "Please confirm the final quantity, packaging requirements, destination port, required certificates and delivery terms. We will update the quotation accordingly.";
  }
  if (lower.includes("sample")) {
    return "Please confirm the sample model, sample quantity, destination address and courier account. We will check the sample cost and sample lead time for you.";
  }
  if (lower.includes("delivery") || lower.includes("lead time")) {
    return "Please confirm the final order quantity and product specifications. We will confirm the production lead time based on the final order details.";
  }
  return text;
}

function translateEnglishToChinese(source) {
  let translated = source;
  enhancedTradeLexicon().forEach(([from, to]) => {
    if (!/^[\u4e00-\u9fa5]/.test(from)) {
      translated = translated.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), to);
    }
  });
  if (/[\u4e00-\u9fa5]/.test(translated)) return translated;
  return `请确认以下外贸沟通内容：${source}`;
}

function translateToTargetLanguage(english, mode, tone) {
  const data = {
    "en-es": {
      greeting: "Estimado cliente,",
      body: "Por favor confirme los detalles del producto, la cantidad final, el embalaje, el puerto de destino, los certificados requeridos y si necesita un logotipo personalizado. Actualizaremos la cotizacion despues de recibir su confirmacion.",
      sample: "Tambien podemos confirmar el costo de muestra, el tiempo de muestra y el plazo de produccion segun sus requisitos finales.",
      close: "Saludos cordiales,\nEquipo de ventas"
    },
    "en-ar": {
      greeting: "عميلنا العزيز،",
      body: "يرجى تأكيد تفاصيل المنتج والكمية النهائية والتعبئة وميناء الوصول والشهادات المطلوبة وما إذا كنتم بحاجة إلى شعار مخصص. سنقوم بتحديث عرض السعر بعد استلام التأكيد.",
      sample: "يمكننا أيضا تأكيد تكلفة العينة ومدة تجهيز العينة ومدة الإنتاج وفقا للمتطلبات النهائية.",
      close: "مع أطيب التحيات،\nفريق المبيعات"
    },
    "en-fr": {
      greeting: "Cher client,",
      body: "Veuillez confirmer les details du produit, la quantite finale, l'emballage, le port de destination, les certificats requis et si vous avez besoin d'un logo personnalise. Nous mettrons a jour le devis apres votre confirmation.",
      sample: "Nous pouvons egalement confirmer le cout de l'echantillon, le delai d'echantillon et le delai de production selon vos exigences finales.",
      close: "Cordialement,\nEquipe commerciale"
    },
    "en-de": {
      greeting: "Sehr geehrter Kunde,",
      body: "Bitte bestaetigen Sie die Produktdetails, die endgueltige Menge, die Verpackung, den Zielhafen, die erforderlichen Zertifikate und ob ein individuelles Logo benoetigt wird. Wir aktualisieren das Angebot nach Ihrer Bestaetigung.",
      sample: "Wir koennen auch Musterkosten, Musterlieferzeit und Produktionszeit entsprechend Ihren endgueltigen Anforderungen bestaetigen.",
      close: "Mit freundlichen Gruessen,\nVertriebsteam"
    },
    "en-pt": {
      greeting: "Prezado cliente,",
      body: "Por favor, confirme os detalhes do produto, a quantidade final, a embalagem, o porto de destino, os certificados necessarios e se precisa de logotipo personalizado. Atualizaremos a cotacao apos sua confirmacao.",
      sample: "Tambem podemos confirmar o custo da amostra, o prazo da amostra e o prazo de producao de acordo com seus requisitos finais.",
      close: "Atenciosamente,\nEquipe de vendas"
    }
  };
  const target = data[mode];
  if (!target) return english;
  const prefix = tone === "simple" ? "" : `${target.greeting}\n\n`;
  const friendly = tone === "friendly" ? "\n\nWe look forward to your reply so that we can proceed quickly." : "";
  return `${prefix}${target.body}\n\n${target.sample}${friendly}\n\n${target.close}\n\nReference meaning:\n${english}`;
}

function translateText(text, mode, tone) {
  const source = text.trim();
  if (!source) return "";
  const english = normalizeTradeEnglish(source);

  if (mode === "zh-en" || mode === "auto-en") return polishTranslation(english, tone);
  if (mode === "en-zh") return translateEnglishToChinese(source);

  const zhToTarget = {
    "zh-es": "en-es",
    "zh-ar": "en-ar",
    "zh-fr": "en-fr",
    "zh-de": "en-de",
    "zh-pt": "en-pt"
  };
  if (zhToTarget[mode]) return translateToTargetLanguage(english, zhToTarget[mode], tone);
  if (["en-es", "en-ar", "en-fr", "en-de", "en-pt"].includes(mode)) return translateToTargetLanguage(english, mode, tone);
  return polishTranslation(english, tone);
}

function renderPhraseList() {
  const phrases = [
    "请确认包装方式、目标港口和是否需要定制 logo。",
    "Please confirm the packaging method, destination port and customized logo requirement.",
    "Please send us your quotation with MOQ, lead time and sample cost.",
    "Could you confirm the payment terms and quotation validity?",
    "We will update the quotation after confirming final specifications.",
    "请提供样品费用、样品时间、最小起订量和生产周期。",
    "If the price is competitive, we will place a trial order.",
    "Please send product pictures, detailed specifications and certificate information.",
    "请确认是否有库存，以及最快什么时候可以发货。"
  ];
  $("phraseList").innerHTML = phrases.map((item) => `<li>${item}</li>`).join("");
}

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".view").forEach((item) => item.classList.remove("active"));
    btn.classList.add("active");
    const view = $(`view-${btn.dataset.view}`);
    view.classList.add("active");
    view.querySelector("h1,h2")?.focus?.();
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.body.classList.remove("sidebar-open");
  });
});

$("scenarioSelect").addEventListener("change", (event) => setScenario(event.target.value));
$("generateBtn").addEventListener("click", buildResult);
$("inquiry").addEventListener("input", updateGenerateButtonState);
$("inquiryArchiveSearch")?.addEventListener("input", debounce((event) => {
  state.inquiryArchiveSearch = event.target.value;
  renderInquiryArchiveList();
}, 350));
$("importBulkInquiry")?.addEventListener("click", importBulkInquiryQueue);
$("processNextInquiry")?.addEventListener("click", processNextInquiry);
$("clearBtn").addEventListener("click", () => {
  $("inquiry").value = "";
  $("scenarioSelect").value = "custom";
  updateGenerateButtonState();
  showToast("询盘内容已清空。", "success");
});
$("sampleBtn").addEventListener("click", () => {
  state.sampleIndex = (state.sampleIndex + 1) % scenarioOrder.length;
  const key = scenarioOrder[state.sampleIndex];
  $("scenarioSelect").value = key;
  setScenario(key);
});
$("copyReply").addEventListener("click", () => copyFieldValue("reply", "英文回复已复制。"));
$("copyFollow").addEventListener("click", () => copyFieldValue("followup", "跟进邮件已复制。"));
$("copyInquiryReport")?.addEventListener("click", copyInquiryReport);
$("createQuoteDoc")?.addEventListener("click", createQuoteDocFromInquiry);
$("exportInquiryArchive")?.addEventListener("click", exportInquiryArchive);
$("copyTrialPlan")?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(trialPlanText());
    showToast("上线准备说明已复制。", "success");
  } catch {
    showToast("复制失败，请手动复制上线准备说明。", "error");
  }
});
$("copyTrialReview")?.addEventListener("click", () => copyFieldValue("trialReviewReport", "上线准备报告已复制。"));
$("exportTrialPackage")?.addEventListener("click", exportTrialPackage);
$("createTrialDemo")?.addEventListener("click", createTrialDemoData);
$("goInquiryFromTrial")?.addEventListener("click", () => goTrialView("inquiry"));
$("goProductsFromTrial")?.addEventListener("click", () => goTrialView("products"));
$("resetReply")?.addEventListener("click", () => resetGeneratedText("reply"));
$("resetFollow")?.addEventListener("click", () => resetGeneratedText("follow"));
$("importDemo").addEventListener("click", () => {
  state.products = defaultProducts();
  logAction("导入示例产品资料");
  saveState();
  renderAll();
  showToast("示例产品资料已导入。", "success");
});
$("exportProductsCsv")?.addEventListener("click", exportProductsCsv);
$("backupProductsJson")?.addEventListener("click", backupProductsJson);
$("fillImport").addEventListener("click", () => {
  $("bulkImport").value = "Solar Garden Light | solar light,garden light,outdoor,waterproof | 500 pcs | 25-35 days | Solar powered, outdoor waterproof, retail packaging supported | Battery capacity and lighting hours need confirmation";
});
$("runImport").addEventListener("click", () => importLines($("bulkImport").value));
$("productSearch").addEventListener("input", debounce((event) => {
  state.productSearch = event.target.value;
  renderProducts();
}, 450));
$("customerSearch")?.addEventListener("input", debounce((event) => {
  state.customerSearch = event.target.value;
  renderCustomersPage();
}, 350));
$("clearCustomerSearch")?.addEventListener("click", () => {
  state.customerSearch = "";
  $("customerSearch").value = "";
  renderCustomersPage();
  $("customerSearch").focus();
  showToast("客户查询已清空。", "success");
});
$("orderSearch")?.addEventListener("input", debounce((event) => {
  state.orderSearch = event.target.value;
  renderOrdersPage();
}, 350));
$("clearOrderSearch")?.addEventListener("click", () => {
  state.orderSearch = "";
  $("orderSearch").value = "";
  renderOrdersPage();
  $("orderSearch").focus();
  showToast("订单查询已清空。", "success");
});
$("productSearch").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    state.productSearch = event.target.value;
    renderProducts();
    showToast("搜索完成。", "success");
  }
});
$("clearProductSearch").addEventListener("click", () => {
  state.productSearch = "";
  $("productSearch").value = "";
  renderProducts();
  $("productSearch").focus();
  showToast("搜索条件已清空。", "success");
});
$("undoDeleteProduct").addEventListener("click", undoDeleteProduct);
$("productTable").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const index = Number(button.dataset.index);
  if (button.dataset.action === "edit-product") editProduct(index);
  if (button.dataset.action === "save-product") saveProduct(index);
  if (button.dataset.action === "cancel-edit-product") cancelEditProduct(index);
  if (button.dataset.action === "delete-product") deleteProduct(index);
});
$("generateProductDraft").addEventListener("click", () => {
  const draft = generateProductDraft($("productDraftName").value);
  if (!draft) {
    showToast("请输入产品名称。", "warn");
    $("productDraftName").focus();
    return;
  }
  $("productDraftOutput").value = draft;
  $("productDraftOutput").classList.add("highlight-output");
  $("productDraftOutput").scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => $("productDraftOutput").classList.remove("highlight-output"), 1600);
  showToast("产品资料草稿已生成。", "success");
});
$("useProductDraft").addEventListener("click", () => {
  const draft = $("productDraftOutput").value.trim();
  if (!draft) return;
  $("bulkImport").value = $("bulkImport").value.trim()
    ? `${$("bulkImport").value.trim()}\n${draft}`
    : draft;
  showToast("已放入导入框。", "success");
});
$("addProduct").addEventListener("click", () => {
  $("bulkImport").value = "New Product Name | keyword1,keyword2 | MOQ | Lead time | Selling points | Risk notes";
  document.querySelector('[data-view="products"]').click();
  $("bulkImport").focus();
  showToast("已定位到产品导入框。", "success");
});
$("saveTemplates").addEventListener("click", () => {
  state.templates = {
    first: $("tplFirst").value.trim(),
    quote: $("tplQuote").value.trim(),
    sample: $("tplSample").value.trim(),
    follow: $("tplFollow").value.trim(),
    oem: $("tplOem")?.value.trim() || defaultTemplates().oem,
    certificate: $("tplCertificate")?.value.trim() || defaultTemplates().certificate,
    urgent: $("tplUrgent")?.value.trim() || defaultTemplates().urgent,
    catalogue: $("tplCatalogue")?.value.trim() || defaultTemplates().catalogue
  };
  saveState();
  logAction("保存回复模板");
  showToast("模板已保存，会用于下一次询盘回复。", "success");
});
$("runTranslate").addEventListener("click", () => {
  if (!$("translateInput").value.trim()) {
    showToast("请输入需要翻译的内容。", "warn");
    $("translateInput").focus();
    return;
  }
  $("translateOutput").textContent = translateText($("translateInput").value, $("translateMode").value, $("translateTone").value);
  $("translateStatus").textContent = "已生成";
  logAction("生成翻译草稿");
  saveState();
  showToast("译文已生成。", "success");
});
$("fillTranslateSample").addEventListener("click", () => {
  $("translateInput").value = "请确认包装方式、目标港口和是否需要定制 logo。";
  $("translateMode").value = "zh-en";
  showToast("已填充外贸翻译示例。", "success");
});
$("copyTranslate").addEventListener("click", () => copyFieldValue("translateOutput", "译文已复制。"));
$("exportFollowReminders")?.addEventListener("click", exportFollowReminders);
$("importCustomerBtn")?.addEventListener("click", () => showCustomerImportPanel(true));
$("hideCustomerImport")?.addEventListener("click", () => showCustomerImportPanel(false));
$("fillCustomerImport")?.addEventListener("click", () => {
  $("customerBulkImport").value = "Atlas Tools Ltd | Chile | A | 待报价 | 五金工具 | Martin Gomez | sourcing@atlas.example | 18V 电钻零售采购 | 24小时内确认报价资料\nNova Lighting | UAE | B | 样品中 | LED灯具 | Aisha Khan | purchase@nova.example | 100W 投光灯项目 | 跟进样品费和交期";
  showToast("已填充客户导入示例。", "success");
});
$("runCustomerImport")?.addEventListener("click", () => importCustomers($("customerBulkImport")?.value || ""));
$("licenseInput")?.addEventListener("input", () => {
  const value = cleanLicenseInput();
  const error = value ? validateLicenseFormat(value) : "";
  $("licenseError").textContent = error && value.length > 0 ? error : "";
});
$("licenseInput")?.addEventListener("paste", () => setTimeout(cleanLicenseInput, 0));
$("clearLicense")?.addEventListener("click", () => {
  $("licenseInput").value = "";
  $("licenseError").textContent = "";
  $("clearLicense").style.display = "none";
  $("licenseInput").focus();
});
$("sidebarToggle")?.addEventListener("click", () => document.body.classList.toggle("sidebar-open"));
$("contrastToggle")?.addEventListener("click", () => {
  document.body.classList.toggle("high-contrast");
  showToast(document.body.classList.contains("high-contrast") ? "已开启高对比度模式。" : "已关闭高对比度模式。", "success");
});
document.querySelectorAll("[data-toggle-password]").forEach((btn) => {
  btn.addEventListener("click", () => togglePasswordById(btn.dataset.togglePassword, btn));
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") document.body.classList.remove("sidebar-open");
});
document.addEventListener("change", (event) => {
  const leadDate = event.target.closest("[data-lead-date]");
  if (!leadDate) return;
  const lead = state.leads.find((item) => item.id === leadDate.dataset.leadDate);
  if (!lead) return;
  lead.followDate = leadDate.value;
  lead.followStatus = lead.followStatus || "待跟进";
  logAction(`更新跟进日期：${lead.customer} / ${lead.followDate || "未设置"}`);
  saveState();
  renderFollowReminderGrid();
  showToast("跟进日期已保存。", "success");
});
$("showLoginTab")?.addEventListener("click", showLoginTab);
$("showRegisterTab")?.addEventListener("click", showRegisterTab);
$("showRecoverTab")?.addEventListener("click", showRecoverTab);
document.querySelectorAll("[data-login-role]").forEach((btn) => btn.addEventListener("click", () => setLoginRole(btn.dataset.loginRole)));
$("registerRole")?.addEventListener("change", (event) => {
  state.selectedLoginRole = event.target.value;
  setLoginRole(event.target.value);
});
$("registerBtn")?.addEventListener("click", registerAccount);
$("loginBtn")?.addEventListener("click", loginAccount);
$("recoverBtn")?.addEventListener("click", recoverPassword);
$("backToLicense")?.addEventListener("click", () => {
  if (!confirm("确定要更换授权秘钥吗？当前账号登录状态将清空。")) return;
  removeLocal(`ft_license_${state.plan.id}`);
  state.license = null;
  clearCurrentAccount();
  $("licenseError").textContent = "请重新输入授权秘钥。";
  bootLicenseGate();
});
$("switchAccountBtn")?.addEventListener("click", logoutAccount);
$("logoutBtn")?.addEventListener("click", logoutAccount);
$("saveProfileBtn")?.addEventListener("click", saveProfile);
$("toggleProfilePassword")?.addEventListener("click", toggleProfilePassword);
$("exportBusinessData")?.addEventListener("click", exportBusinessData);
$("exportWorkspaceBackup")?.addEventListener("click", exportBusinessData);
$("exportCustomerData")?.addEventListener("click", exportCustomerData);
$("exportOperationLogs")?.addEventListener("click", exportOperationLogs);
$("exportOrdersCsv")?.addEventListener("click", exportOrdersCsv);
$("exportFinanceCsv")?.addEventListener("click", exportFinanceCsv);
$("importWorkspaceBackupBtn")?.addEventListener("click", () => $("importWorkspaceBackup")?.click());
$("importWorkspaceBackup")?.addEventListener("change", (event) => {
  restoreWorkspaceBackup(event.target.files?.[0]);
  event.target.value = "";
});
$("restoreProductsBackupBtn")?.addEventListener("click", () => $("restoreProductsBackup")?.click());
$("restoreProductsBackup")?.addEventListener("change", (event) => {
  restoreProductsBackup(event.target.files?.[0]);
  event.target.value = "";
});
$("lockAppBtn")?.addEventListener("click", lockApp);
$("resetDemoData")?.addEventListener("click", resetDemoData);
$("addCustomerBtn")?.addEventListener("click", addCustomer);
$("addCustomerBtnNew")?.addEventListener("click", addCustomer);
$("saveCustomerBtn")?.addEventListener("click", saveCustomerData);
$("addOrderBtn")?.addEventListener("click", addOrder);
$("saveOrderBtn")?.addEventListener("click", saveOrderData);
$("addDocBtn")?.addEventListener("click", addDoc);
$("saveDocBtn")?.addEventListener("click", saveDocData);
$("saveFinanceBtn")?.addEventListener("click", saveFinanceData);
$("contactServiceBtn")?.addEventListener("click", () => document.querySelector('[data-help-key="本地部署"]')?.click());
document.addEventListener("click", (event) => {
  const onboard = event.target.closest("[data-onboarding-view]");
  if (onboard) {
    goTrialView(onboard.dataset.onboardingView);
    if (onboard.dataset.onboardingId === "customers") setTimeout(() => showCustomerImportPanel(true), 120);
    if (onboard.dataset.onboardingId === "products") setTimeout(() => $("bulkImport")?.focus(), 120);
    if (onboard.dataset.onboardingId === "inquiry") setTimeout(() => $("inquiry")?.focus(), 120);
    return;
  }
  const trialAction = event.target.closest("[data-trial-action]");
  if (trialAction) {
    const item = trialChecklistItems().find((entry) => entry.id === trialAction.dataset.trialAction);
    if (item?.view) goTrialView(item.view);
    if (item?.id === "products") setTimeout(() => $("bulkImport")?.focus(), 120);
    if (item?.id === "inquiry") setTimeout(() => $("inquiry")?.focus(), 120);
    if (item?.id === "templates") setTimeout(() => $("tplFirst")?.focus(), 120);
    return;
  }
  const filter = event.target.closest("[data-customer-filter]");
  if (filter) {
    state.activeCustomerFilter = filter.dataset.customerFilter;
    renderCustomersPage();
    return;
  }
  const customer = event.target.closest("[data-select-customer]");
  if (customer) {
    state.selectedCustomerId = customer.dataset.selectCustomer;
    renderCustomersPage();
    return;
  }
  const deleteCustomerBtn = event.target.closest("[data-delete-customer]");
  if (deleteCustomerBtn) {
    deleteCustomer(deleteCustomerBtn.dataset.deleteCustomer);
    return;
  }
  const leadAction = event.target.closest("[data-lead-action]");
  if (leadAction) {
    updateLeadStatus(leadAction.dataset.leadId, leadAction.dataset.leadAction);
    return;
  }
  const archiveItem = event.target.closest("[data-load-inquiry-archive]");
  if (archiveItem) {
    loadInquiryArchive(archiveItem.dataset.loadInquiryArchive);
    return;
  }
  const recordDelete = event.target.closest("[data-delete-record]");
  if (recordDelete) {
    deleteCustomerNote(recordDelete.dataset.deleteRecord);
    return;
  }
  const recordFocus = event.target.closest("[data-focus-record]");
  if (recordFocus) {
    const node = document.querySelector(`[data-customer-field="${recordFocus.dataset.focusRecord}"]`);
    if (node) {
      node.focus();
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    return;
  }
  const order = event.target.closest("[data-select-order]");
  if (order) {
    state.selectedOrderId = order.dataset.selectOrder;
    renderOrdersPage();
    return;
  }
  const docType = event.target.closest("[data-select-doc-type]");
  if (docType) {
    state.selectedDocType = docType.dataset.selectDocType;
    const found = state.business.docs.find((item) => item.type === state.selectedDocType);
    state.selectedDocId = found ? found.id : "";
    renderDocsPage();
    return;
  }
  const help = event.target.closest("[data-help-key]");
  if (help) {
    const key = help.dataset.helpKey;
    $("helpTitle").textContent = key;
    $("helpDetail").textContent = state.business.help[key] || "";
  }
});
$("activateBtn").addEventListener("click", async () => {
  $("licenseError").textContent = "";
  if (!requireTerms()) return;
  const activateBtn = $("activateBtn");
  const licenseValue = cleanLicenseInput();
  const formatError = validateLicenseFormat(licenseValue);
  if (formatError) {
    focusError("licenseInput", formatError);
    return;
  }
  setButtonLoading(activateBtn, true, "验证中");
  try {
    const payload = await verifyLicenseKey(licenseValue, state.plan.id);
    if (exhaustedLicenses().some((item) => item.licenseId === payload.licenseId)) {
      throw new Error("这个秘钥已在本机用尽或到期，请使用新的授权秘钥");
    }
    const now = Date.now();
    state.license = {
      ...payload,
      activatedAt: now,
      expiresAt: now + payload.validDays * 86400000
    };
    state.plan.maxGenerations = payload.maxGenerations;
    state.plan.validDays = payload.validDays;
    setLocal(`ft_license_${state.plan.id}`, JSON.stringify(state.license));
    setLocal(`ft_plan_used_${state.plan.id}`, "0");
    state.planUsed = 0;
    clearCurrentAccount();
    loadWorkspaceData();
    saveState();
    $("licenseError").textContent = "授权验证成功，请先注册该公司主账号。";
    showToast("秘钥验证成功，请先注册主账号。", "success");
    showRegisterStage();
    bootLicenseGate();
    showRegisterStage();
    renderAll();
  } catch (error) {
    const text = error.message || "激活失败，请确认秘钥是否正确。";
    $("licenseError").textContent = text;
    $("licenseInput").focus();
    showToast(text, "error", 3200);
  } finally {
    setButtonLoading(activateBtn, false, "验证秘钥并进入账号登录");
  }
});

setScenario("drill");
setLoginRole("主账号");
renderAll();
renderPhraseList();
startLicenseWatch();

