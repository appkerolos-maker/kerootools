const STORAGE_KEY = "kero-system-v2";
const SESSION_KEY = "kero-session-v1";
const THEME_KEY = "kero-theme-v1";
const SIDEBAR_COLLAPSED_KEY = "kero-sidebar-collapsed-v1";
const IDLE_WARNING_AFTER_MS = 60 * 1000;
const IDLE_COUNTDOWN_SECONDS = 60;
let channel = null;
try {
  if ("BroadcastChannel" in window) {
    channel = new BroadcastChannel("kero-local-sync");
  }
} catch {
  channel = null;
}

const firebaseConfig = {
  apiKey: "AIzaSyCQC2Bf1Kc09zTP6966KwHpvAY7HhdCDh8",
  authDomain: "kerotools-6cae8.firebaseapp.com",
  databaseURL: "https://kerotools-6cae8-default-rtdb.firebaseio.com",
  projectId: "kerotools-6cae8",
  storageBucket: "kerotools-6cae8.firebasestorage.app",
  messagingSenderId: "615188983731",
  appId: "1:615188983731:web:bbaedc80a27cbfa89865c6",
  measurementId: "G-KCKHH0TJKT"
};

let db = null;
try {
  if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
  }
} catch (e) {
  console.error("Firebase Init Error:", e);
}

const app = {
  state: loadState(),
  temp: { sales: [], invoices: [], salesReturns: [], invoiceReturns: [], fawry: [], purchases: [] },
  editingTx: { sales: null, invoices: null, salesReturns: null, invoiceReturns: null, fawry: null, purchases: null },
  txConfigs: {},
  currentUser: null,
  inventoryViewWarehouseId: null,
  chart: null,
  idle: { warn: null, logout: null, tick: null, remaining: IDLE_COUNTDOWN_SECONDS },
  scanner: { stream: null, raf: null, detector: null, sectionId: null, lastScanAt: 0 },
  backupDirHandle: null,
  isSyncing: false
};
const smartSuggestPanels = {};
const ENABLE_SMART_SUGGEST = true;

const navItems = [
  ["dashboard", "لوحة التحكم"],
  ["inventory", "إدارة المخزون"],
  ["sales", "المبيعات اليومية"],
  ["invoices", "الفواتير"],
  ["salesReturns", "مرتجع المبيعات"],
  ["invoiceReturns", "مرتجع الفواتير"],
  ["purchases", "فواتير الشراء"],
  ["fawry", "مبيعات فوري"],
  ["records", "السجلات"],
  ["reports", "التقارير"],
  ["customers", "إدارة العملاء"],
  ["suppliers", "إدارة الموردين"],
  ["warehouses", "إدارة المخازن"],
  ["sync", "ربط الأجهزة"],
  ["settings", "الإعدادات"],
  ["users", "إدارة المستخدمين"],
];

const recordTypes = [
  ["sales", "سجل المبيعات اليومية"],
  ["invoices", "سجل الفواتير"],
  ["archivedInvoices", "أرشيف الفواتير"],
  ["salesReturns", "سجل مرتجع المبيعات"],
  ["invoiceReturns", "سجل مرتجع الفواتير"],
  ["purchases", "سجل فواتير الشراء"],
  ["fawrySales", "سجل مبيعات فوري"],
  ["deferredSales", "سجل المؤجل"],
];

init();

function init() {
  applyTheme(localStorage.getItem(THEME_KEY) || "light");
  applySidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
  bindAuth();
  bindTopbar();
  bindInventory();
  bindCustomers();
  bindSuppliers();
  bindWarehouses();
  bindRecords();
  bindReports();
  bindSettings();
  bindMobileSettingsBackupActions();
  bindUsersManagement();
  bindSync();
  bindSidebarToggle();
  bindDashboardSearch();
  disableNativeProductDatalists();
  bindLogoutOnClose();
  buildNav();
  mountTx("sales", "مبيعات يومية", { effect: -1, target: "sales", archive: false, fawry: false });
  mountTx("invoices", "الفواتير", { effect: -1, target: "invoices", archive: true, fawry: false });
  mountTx("salesReturns", "مرتجع المبيعات", { effect: 1, target: "salesReturns", archive: false, fawry: false });
  mountTx("invoiceReturns", "مرتجع الفواتير", { effect: 1, target: "invoiceReturns", archive: false, fawry: false });
  mountTx("purchases", "فواتير الشراء", { effect: 1, target: "purchases", archive: false, fawry: false, isPurchase: true });
  // Fawry sales are not linked to stock quantities.
  mountTx("fawry", "مبيعات فوري", { effect: 0, target: "fawrySales", archive: false, fawry: true });
  applyFieldLabels();
  setupModals();
  setupIdle();
  renderAll();
  startClock();
  renderBuildStamp();
  autoLogin();
  setDefaultDates();
}

function setDefaultDates() {
  const todayISO = new Date().toISOString().slice(0, 10);
  if ($("reportDate")) $("reportDate").value = todayISO;
  if ($("profitToDate")) $("profitToDate").value = todayISO;
}

function disableNativeProductDatalists() {
  const ids = ["productName", "quickProductName", "inventorySearch", "salesBarcode", "invoicesBarcode", "salesReturnsBarcode", "invoiceReturnsBarcode", "fawryBarcode"];
  ids.forEach((idv) => {
    const el = $(idv);
    if (el && el.hasAttribute("list")) el.removeAttribute("list");
  });
}

function defaults() {
  const w1 = id("wh");
  const w2 = id("wh");
  return {
    users: [
      { id: "u-admin", username: "1234", password: "1234", role: "manager" },
      { id: "u-sales", username: "sales", password: "1234", role: "sales" },
      { id: "u-acc", username: "account", password: "1234", role: "accountant" },
    ],
    settings: {
      orgName: "نظام كيرو للأدوات الصحية",
      orgPhone: "01000000000",
      orgAddress: "",
      logoBase64: "",
      invoiceBgBase64: "",
      defaultInvoiceStyle: "classic",
      backupDirName: "",
    },
    warehouses: [
      { id: w1, name: "المعرض" },
      { id: w2, name: "فرع رئيسي" },
    ],
    products: [
      { id: id("prd"), name: "خلط مياه 1/2", barcode: "1002003001", qty: 40, salePrice: 260, costPrice: 195, warehouseId: w1 },
      { id: id("prd"), name: "صمام مياه", barcode: "1002003002", qty: 80, salePrice: 95, costPrice: 70, warehouseId: w1 },
      { id: id("prd"), name: "صمام مياه 40 مم", barcode: "1002003003", qty: 60, salePrice: 55, costPrice: 38, warehouseId: w2 },
    ],
    customers: [
      { id: id("cus"), name: "أحمد محمد", phone: "01111111111", address: "القاهرة", debt: 0, ledger: [] },
      { id: id("cus"), name: "شركة الديار", phone: "01222222222", address: "الجيزة", debt: 250, ledger: [] },
    ],
    suppliers: [],
    sales: [],
    invoices: [],
    archivedInvoices: [],
    salesReturns: [],
    invoiceReturns: [],
    purchases: [],
    fawrySales: [],
    invoiceCounter: 0,
    salesCounter: 0,
    deferredSales: [],
    transfers: [],
    printLogs: [],
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults();
    const merged = { ...defaults(), ...JSON.parse(raw) };
    if (Array.isArray(merged.warehouses)) {
      merged.warehouses = merged.warehouses.map((w, idx) => {
        if (idx === 0 && w.name === "فرع رئيسي") return { ...w, name: "المعرض" };
        return w;
      });
    }
    merged.users = sanitizeUsers(merged.users);
    if (merged.users.length === 0) merged.users = [defaultAdminUser()];
    if (!merged.users.some((u) => u.role === "manager")) merged.users.unshift(defaultAdminUser());
    const existingMaxInvoice = Math.max(
      0,
      ...[...(merged.invoices || []), ...(merged.archivedInvoices || [])]
        .map((x) => Number(x.invoiceNumber || 0))
        .filter((n) => Number.isFinite(n))
    );
    merged.invoiceCounter = Math.max(Number(merged.invoiceCounter || 0), existingMaxInvoice);
    const existingMaxSales = Math.max(
      0,
      ...(merged.sales || [])
        .map((x) => Number(x.salesNumber || 0))
        .filter((n) => Number.isFinite(n))
    );
    merged.salesCounter = Math.max(Number(merged.salesCounter || 0), existingMaxSales);
    return merged;
  } catch {
    return defaults();
  }
}

function saveState({ broadcast = true, syncToCloud = true } = {}) {
  const updatedAt = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(app.state));
  localStorage.setItem(STORAGE_KEY + "_updated_at", updatedAt.toString());

  if (broadcast && channel) channel.postMessage({ type: "state-updated", at: updatedAt });
  
  if (syncToCloud && db && !app.isSyncing) {
    updateSyncStatus("جاري الرفع إلى السحابة...");
    const syncData = {
      state: app.state,
      updatedAt: updatedAt,
      deviceId: getDeviceId()
    };
    db.ref("kero_sync").set(syncData)
      .then(() => updateSyncStatus("متصل وتمت المزامنة."))
      .catch(e => {
        console.error("Firebase Sync Error:", e);
        updateSyncStatus("خطأ في المزامنة! تأكد من قواعد الحماية.");
      });
  }
  
  renderAll();
}

function updateSyncStatus(msg) {
  const el = $("syncStatus");
  if (el) el.textContent = msg;
}

function getDeviceId() {
  let id = localStorage.getItem("kero_device_id");
  if (!id) {
    id = "dev_" + Math.random().toString(36).substr(2, 9);
    localStorage.setItem("kero_device_id", id);
  }
  return id;
}

function bindAuth() {
  $("loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const u = normalizeDigits($("loginUsername").value.trim());
    const p = normalizeDigits($("loginPassword").value.trim());
    if (!u || !p) return alert("أدخل اسم المستخدم وكلمة المرور");
    let user = app.state.users.find(
      (x) =>
        normalizeDigits(String(x.username || "").trim()) === u &&
        normalizeDigits(String(x.password || "").trim()) === p
    );
    if (!user) return alert("بيانات الدخول غير صحيحة");
    app.currentUser = user;
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, at: Date.now() }));
    openDashboard();
  });
  $("logoutBtn").addEventListener("click", forceLogout);
}

function autoLogin() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (!s) return;
    const user = app.state.users.find((u) => u.id === s.userId);
    if (user) {
      app.currentUser = user;
      openDashboard();
    }
  } catch {}
}

function openDashboard() {
  buildNav();
  renderCurrentUserBadge();
  renderKpis();
  $("loginScreen").classList.add("hidden");
  $("dashboardScreen").classList.remove("hidden");
  if (!canAccessSection(getCurrentRole(), "dashboard")) showSection("sales", "المبيعات اليومية");
  restartIdle();
}

function forceLogout() {
  localStorage.removeItem(SESSION_KEY);
  app.currentUser = null;
  closeScanner();
  if ($("loginUsername")) $("loginUsername").value = "";
  if ($("loginPassword")) $("loginPassword").value = "";
  $("dashboardScreen").classList.add("hidden");
  $("loginScreen").classList.remove("hidden");
  hide("idleModal");
}

function bindTopbar() {
  $("themeToggle").addEventListener("click", () => applyTheme(document.body.classList.contains("dark") ? "light" : "dark"));
  $("exportBtn").addEventListener("click", exportJson);
  $("importInput").addEventListener("change", importJson);
}

function bindLogoutOnClose() {
  const clearSession = () => {
    localStorage.removeItem(SESSION_KEY);
  };

  // Web browsers: close/reload tab or window.
  window.addEventListener("beforeunload", clearSession);
  window.addEventListener("pagehide", clearSession);

  // APK/WebView on phones: treat app background/close as logout trigger.
  const likelyMobileApp =
    /Android|iPhone|iPad|iPod/i.test(String(navigator.userAgent || "")) ||
    String(location.protocol || "").toLowerCase() === "file:";

  if (likelyMobileApp) {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") clearSession();
    });
    document.addEventListener("freeze", clearSession);
    document.addEventListener("pause", clearSession, false);
  }
}

function bindDashboardSearch() {
  if ($("dashboardSearchBtn")) {
    $("dashboardSearchBtn").addEventListener("click", () => {
      renderKpis();
    });
  }
  if ($("dashboardSearchDate")) {
    $("dashboardSearchDate").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        renderKpis();
      }
    });
  }
}

function bindSidebarToggle() {
  if (!$("sidebarToggle")) return;
  $("sidebarToggle").addEventListener("click", () => {
    const collapsed = $("dashboardScreen").classList.contains("sidebar-collapsed");
    applySidebarCollapsed(!collapsed);
  });

  if ($("mobileMenuBtn")) {
    $("mobileMenuBtn").addEventListener("click", () => {
      document.querySelector(".sidebar").classList.toggle("active");
      document.getElementById("sidebarOverlay").classList.toggle("active");
    });
  }

  if ($("sidebarOverlay")) {
    $("sidebarOverlay").addEventListener("click", () => {
      document.querySelector(".sidebar").classList.remove("active");
      document.getElementById("sidebarOverlay").classList.remove("active");
    });
  }
}

function applySidebarCollapsed(collapsed) {
  if (!$("dashboardScreen")) return;
  $("dashboardScreen").classList.toggle("sidebar-collapsed", collapsed);
  if ($("sidebarToggle")) {
    $("sidebarToggle").textContent = collapsed ? "▶" : "◀";
  }
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
}

function applyTheme(mode) {
  document.body.classList.toggle("dark", mode === "dark");
  localStorage.setItem(THEME_KEY, mode);
}

function startClock() {
  const tick = () => ($("liveDate").textContent = new Date().toLocaleString("ar-EG"));
  tick();
  setInterval(tick, 1000);
}

function buildNav() {
  const n = $("navMenu");
  n.innerHTML = "";
  const role = getCurrentRole();
  navItems
    .filter(([id]) => canAccessSection(role, id))
    .forEach(([id, title]) => {
    const b = document.createElement("button");
    b.className = "btn secondary nav-btn";
    b.dataset.section = id;
    b.textContent = title;
    b.addEventListener("click", () => showSection(id, title));
    n.appendChild(b);
  });
}

function showSection(id, title) {
  if (!canAccessSection(getCurrentRole(), id)) return alert("ليس لديك صلاحية لهذا القسم");
  $("sectionTitle").textContent = title;
  document.querySelectorAll(".page-section").forEach((x) => x.classList.add("hidden"));
  $(id).classList.remove("hidden");
  if (id === "reports") renderReports();
  if (id === "records") renderRecords();

  // Close mobile menu on section change
  document.querySelector(".sidebar").classList.remove("active");
  if ($("sidebarOverlay")) $("sidebarOverlay").classList.remove("active");
}

function bindInventory() {
  $("productForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const pid = $("productId").value || id("prd");
    const row = {
      id: pid,
      name: $("productName").value.trim(),
      barcode: $("productBarcode").value.trim() || genBarcode(),
      qty: Number($("productQty").value || 0),
      salePrice: Number($("productSalePrice").value || 0),
      shopPrice: Number($("productShopPrice").value || 0),
      costPrice: Number($("productCostPrice").value || 0),
      warehouseId: $("productWarehouse").value,
    };
    const i = app.state.products.findIndex((x) => x.id === pid);
    if (i >= 0) app.state.products[i] = row;
    else app.state.products.push(row);
    $("productForm").reset();
    $("productId").value = "";
    saveState();
  });
  $("inventorySearch").addEventListener("input", renderInventory);
  if ($("inventoryScanBtn")) {
    $("inventoryScanBtn").addEventListener("click", () => openScanner("inventory"));
  }
  if ($("inventoryFocusBtn")) {
    $("inventoryFocusBtn").addEventListener("click", () => $("inventorySearch").focus());
  }
  $("quickProductForm").addEventListener("submit", (e) => {
    e.preventDefault();
    app.state.products.push({
      id: id("prd"),
      name: $("quickProductName").value.trim(),
      barcode: genBarcode(),
      qty: Number($("quickProductQty").value || 0),
      salePrice: Number($("quickProductSale").value || 0),
      shopPrice: Number($("quickProductShop").value || 0),
      costPrice: Number($("quickProductCost").value || 0),
      warehouseId: $("quickProductWarehouse").value,
    });
    $("quickProductForm").reset();
    hide("quickAddModal");
    saveState();
  });
  if ($("inventoryBackToShowroom")) {
    $("inventoryBackToShowroom").addEventListener("click", () => {
      app.inventoryViewWarehouseId = null;
      renderAll();
    });
  }
}

function renderInventory() {
  const q = $("inventorySearch").value.trim();
  const viewWh = app.inventoryViewWarehouseId || getShowroomWarehouseId();
  const searchAllWarehouses = Boolean(q);
  
  if ($("inventoryScopeLabel")) {
    $("inventoryScopeLabel").textContent = searchAllWarehouses
      ? "عرض المخزن: نتائج البحث في جميع المخازن"
      : `عرض المخزن: ${getWarehouseName(viewWh)}`;
  }
  
  if ($("inventoryBackToShowroom")) $("inventoryBackToShowroom").classList.toggle("hidden", !app.inventoryViewWarehouseId);
  
  let filteredProducts = app.state.products.filter((p) => searchAllWarehouses || p.warehouseId === viewWh);
  
  if (q) {
    filteredProducts = filteredProducts
      .map((p) => ({ p, score: scoreProductForHint(q, p) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || Number(b.p.qty || 0) - Number(a.p.qty || 0))
      .map((item) => item.p);
  }
  
  $("inventoryTable").innerHTML =
    filteredProducts
      .map((p) => {
        const wn = app.state.warehouses.find((w) => w.id === p.warehouseId)?.name || "-";
        return `<tr>
          <td>${p.name}</td><td>${p.barcode}</td><td>${p.qty}</td><td>${money(p.salePrice)}</td><td>${money(p.shopPrice || 0)}</td><td>${money(p.costPrice)}</td><td>${wn}</td>
          <td>
            <button class="btn secondary" onclick="window.kiroEditProduct('${p.id}')">تعديل</button>
            <button class="btn danger" onclick="window.kiroDeleteProduct('${p.id}')">حذف</button>
            <button class="btn primary" onclick="window.kiroPrintBarcode('${p.barcode}')">طباعة باركود</button>
          </td>
        </tr>`;
      })
      .join("") || "<tr><td colspan='8'>لا يوجد نتائج</td></tr>";
}

function mountTx(sectionId, title, cfg) {
  app.txConfigs[sectionId] = cfg;
  const entityLabel = cfg.isPurchase ? "اسم المورد أو رقم الهاتف" : "اسم العميل أو رقم الهاتف";
  $(sectionId).innerHTML = `
    <div class="card">
      <h3>${title}</h3>
      <div class="form-grid">
        <input id="${sectionId}CustomerInput" list="${sectionId}CustomersList" placeholder="${entityLabel}" />
        <datalist id="${sectionId}CustomersList"></datalist>
        ${cfg.fawry ? "" : `<select id="${sectionId}Warehouse"></select>`}
        <input id="${sectionId}Barcode" placeholder="${cfg.isPurchase ? "اسم المنتج الجديد أو الحالي" : "باركود / اسم المنتج"}" />
        <button id="${sectionId}ScanBtn" class="btn secondary scan-btn" type="button" title="فتح الكاميرا" aria-label="فتح الكاميرا">📷</button>
        <button id="${sectionId}FocusBtn" class="btn primary scan-btn" type="button" title="تفعيل القارئ الخارجي" aria-label="تفعيل القارئ الخارجي">🏷️</button>
        <input id="${sectionId}Qty" type="number" min="0.01" step="0.01" value="1" />
        <input id="${sectionId}Price" type="number" min="0" step="0.01" placeholder="${cfg.isPurchase ? "السعر التجاري" : "السعر (اختياري)"}" />
        ${cfg.isPurchase ? `<input id="${sectionId}SalePrice" type="number" min="0" step="0.01" placeholder="سعر البيع" />` : ""}
        ${cfg.fawry ? `<select id="${sectionId}Method"><option>كارت</option><option>تحويل</option><option>نقدا</option><option>أخرى</option></select>` : ""}
        <button id="${sectionId}AddItem" class="btn secondary">إضافة منتج</button>
      </div>
      <div class="form-grid">
        <select id="${sectionId}PaymentStatus"><option>مدفوع بالكامل</option><option>جزئي</option><option>آجل</option></select>
        <input id="${sectionId}PaidAmount" type="number" step="0.01" min="0" placeholder="المدفوع" />
        <select id="${sectionId}DiscountType"><option value="none">بدون خصم</option><option value="percent">خصم نسبة %</option><option value="fixed">خصم مبلغ</option></select>
        <input id="${sectionId}DiscountValue" type="number" step="0.01" min="0" placeholder="قيمة الخصم" />
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>المنتج</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th><th>حذف</th></tr></thead><tbody id="${sectionId}Cart"></tbody></table>
      </div>
      <div class="kpi-grid">
        <div class="kpi-card"><h4>المبلغ الكلي</h4><strong id="${sectionId}SubTotal">${money(0)}</strong></div>
        <div class="kpi-card"><h4>بعد الخصم</h4><strong id="${sectionId}AfterDiscount">${money(0)}</strong></div>
        <div class="kpi-card"><h4>المدفوع</h4><strong id="${sectionId}PaidView">${money(0)}</strong></div>
        <div class="kpi-card"><h4>المتبقي</h4><strong id="${sectionId}Remaining">${money(0)}</strong></div>
      </div>
      <div class="inline-actions">
        <strong id="${sectionId}Total">الإجمالي: ${money(0)}</strong>
        <button id="${sectionId}Save" class="btn primary">حفظ</button>
        <button id="${sectionId}CancelEdit" class="btn secondary hidden">إلغاء التعديل</button>
        ${cfg.archive ? `<button id="${sectionId}Archive" class="btn secondary">أرشيف</button>` : ""}
        <button id="${sectionId}Print" class="btn secondary">طباعة</button>
      </div>
    </div>`;
  $(`${sectionId}AddItem`).addEventListener("click", () => addTemp(sectionId));
  $(`${sectionId}ScanBtn`).addEventListener("click", () => openScanner(sectionId));
  $(`${sectionId}FocusBtn`).addEventListener("click", () => $(`${sectionId}Barcode`).focus());
  $(`${sectionId}Barcode`).addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      addTemp(sectionId);
    }
  });
  $(`${sectionId}Barcode`).addEventListener("input", (e) => {
    updateProductHintsForSection(sectionId, e.target.value || "");
  });
  bindSmartSuggestInput(
    `${sectionId}Barcode`,
    () => {
      const wh = sectionId === "fawry" ? "" : $(`${sectionId}Warehouse`)?.value || app.state.warehouses[0]?.id;
      return app.state.products.filter((p) => !wh || p.warehouseId === wh);
    },
    (p) => {
      $(`${sectionId}Barcode`).value = p.name;
    }
  );
  $(`${sectionId}Save`).addEventListener("click", () => saveTx(sectionId, cfg, false));
  if (cfg.archive) $(`${sectionId}Archive`).addEventListener("click", () => saveTx(sectionId, cfg, true));
  if ($(`${sectionId}CancelEdit`)) $(`${sectionId}CancelEdit`).addEventListener("click", () => cancelTxEdit(sectionId));
  $(`${sectionId}Print`).addEventListener("click", () => printSection(sectionId, title));
  $(`${sectionId}DiscountType`).addEventListener("change", () => renderTemp(sectionId));
  $(`${sectionId}DiscountValue`).addEventListener("input", () => renderTemp(sectionId));
  $(`${sectionId}PaidAmount`).addEventListener("input", () => renderTemp(sectionId));
  $(`${sectionId}PaymentStatus`).addEventListener("change", () => {
    const status = $(`${sectionId}PaymentStatus`).value;
    const paidInput = $(`${sectionId}PaidAmount`);
    if (status === "مدفوع بالكامل") {
      paidInput.style.display = "none";
      renderTemp(sectionId);
    } else {
      paidInput.style.display = "block";
      renderTemp(sectionId);
    }
  });
  updateTxEditUI(sectionId);
}

function addTemp(sectionId) {
  const q = $(`${sectionId}Barcode`).value.trim();
  if (!q) return alert("أدخل اسم المنتج أو الباركود");
  const qty = Number($(`${sectionId}Qty`).value || 1);
  const warehouseSelect = $(`${sectionId}Warehouse`);
  const wh = warehouseSelect ? warehouseSelect.value : (app.state.warehouses[0]?.id || "");
  
  if (!wh && sectionId !== "fawry") return alert("يرجى اختيار المخزن أولاً");

  const isFawry = sectionId === "fawry";
  const cfg = app.txConfigs[sectionId] || {};
  const isPurchase = cfg.isPurchase;
  const cPrice = Number($(`${sectionId}Price`).value || 0);
  const sPrice = isPurchase ? Number($(`${sectionId}SalePrice`)?.value || 0) : 0;

  const pool = app.state.products.filter((x) => isFawry || x.warehouseId === wh);

  // 1. Literal Exact Match (Highest Priority)
  let p = pool.find((x) => 
    (x.barcode && x.barcode.trim() === q) || 
    (x.name && x.name.trim() === q)
  );

  // 2. Normalized Exact Match
  if (!p) {
    const nq = normalizeHintText(q);
    p = pool.find((x) => 
      normalizeHintText(x.barcode || "") === nq || 
      normalizeHintText(x.name || "") === nq
    );
  }

  // 3. Scored Match (Prefix / Contains)
  if (!p) {
    const scored = pool
      .map((x) => ({ x, score: scoreProductForHint(q, x) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || Number(b.x.qty || 0) - Number(a.x.qty || 0));
    
    if (scored.length > 0) {
      p = scored[0].x;
    }
  }

  if (!p) {
    if (isPurchase) {
      // If purchase and product not found, treat as new product
      p = {
        id: `NEW_${id("prd")}`, // Temporary ID to mark it as new
        name: q,
        barcode: genBarcode(),
        qty: 0,
        salePrice: sPrice,
        costPrice: cPrice,
        warehouseId: wh,
        isNew: true
      };
    } else {
      return alert(isFawry ? "المنتج غير موجود" : "المنتج غير موجود في المخزن المحدد");
    }
  }
  
  if (qty <= 0) return alert("الكمية غير صحيحة");

  const row = app.temp[sectionId].find((x) => x.productId === p.id);
  if (row) {
    row.qty += qty;
    if (isPurchase) {
      row.price = cPrice;
      row.salePrice = sPrice;
    }
  } else {
    app.temp[sectionId].push({ 
      productId: p.id, 
      productName: p.name, 
      barcode: p.barcode, 
      qty, 
      price: isPurchase ? cPrice : (cPrice > 0 ? cPrice : p.salePrice), 
      costPrice: isPurchase ? cPrice : p.costPrice, 
      salePrice: isPurchase ? sPrice : p.salePrice,
      warehouseId: wh || p.warehouseId,
      isNew: p.isNew || false
    });
  }

  $(`${sectionId}Barcode`).value = "";
  $(`${sectionId}Price`).value = "";
  if ($(`${sectionId}SalePrice`)) $(`${sectionId}SalePrice`).value = "";
  $(`${sectionId}Qty`).value = "1";
  $(`${sectionId}Barcode`).focus();
  renderTemp(sectionId);
}

function renderTemp(sectionId) {
  const cfg = app.txConfigs[sectionId] || {};
  const isPurchase = cfg.isPurchase;
  
  $(`${sectionId}Cart`).innerHTML =
    app.temp[sectionId]
      .map(
        (i, idx) =>
          `<tr>
            <td>${i.productName}</td>
            ${isPurchase ? `<td>${getWarehouseName(i.warehouseId)}</td>` : ""}
            <td>${i.qty}</td>
            <td>${money(i.price)}</td>
            ${isPurchase ? `<td>${money(i.salePrice || 0)}</td>` : ""}
            <td>${money(i.qty * i.price)}</td>
            <td><button class="btn danger" onclick="window.kiroRemoveTempItem('${sectionId}',${idx})">حذف</button></td>
          </tr>`
      )
      .join("") || `<tr><td colspan="${isPurchase ? 7 : 5}">لا توجد منتجات</td></tr>`;
  
  // Update header if purchase
  const thead = $(`${sectionId}Cart`).parentElement.querySelector("thead tr");
  if (thead) {
    thead.innerHTML = isPurchase 
      ? `<th>المنتج</th><th>المخزن</th><th>الكمية</th><th>السعر التجاري</th><th>سعر البيع</th><th>الإجمالي</th><th>حذف</th>`
      : `<th>المنتج</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th><th>حذف</th>`;
  }

  const sub = app.temp[sectionId].reduce((a, b) => a + b.qty * b.price, 0);
  const dType = $(`${sectionId}DiscountType`)?.value || "none";
  const dVal = Number($(`${sectionId}DiscountValue`)?.value || 0);
  const after = discount(sub, dType, dVal);
  
  const pStatus = $(`${sectionId}PaymentStatus`)?.value || "مدفوع بالكامل";
  let paid = 0;
  if (pStatus === "مدفوع بالكامل") {
    paid = after;
    if ($(`${sectionId}PaidAmount`)) $(`${sectionId}PaidAmount`).value = paid;
  } else {
    paid = Number($(`${sectionId}PaidAmount`)?.value || 0);
  }

  const remaining = Math.max(0, after - paid);
  $(`${sectionId}SubTotal`).textContent = money(sub);
  $(`${sectionId}AfterDiscount`).textContent = money(after);
  $(`${sectionId}PaidView`).textContent = money(paid);
  $(`${sectionId}Remaining`).textContent = money(remaining);
  $(`${sectionId}Total`).textContent = `المجموع: ${money(after)}`;
}

function getRecordSectionId(type) {
  const map = {
    sales: "sales",
    invoices: "invoices",
    archivedInvoices: "invoices",
    salesReturns: "salesReturns",
    invoiceReturns: "invoiceReturns",
    purchases: "purchases",
    fawrySales: "fawry",
  };
  return map[type] || "";
}

function getSourceTypeEffect(type) {
  const map = {
    sales: -1,
    invoices: -1,
    archivedInvoices: 0,
    salesReturns: 1,
    invoiceReturns: 1,
    purchases: 1,
    fawrySales: 0,
  };
  return map[type] ?? 0;
}

function shouldAddDebtForStatus(status) {
  return status === "جزئي" || status === "آجل";
}

function findCustomerForEntry(entry) {
  if (!entry) return null;
  return (
    app.state.customers.find((c) => c.id === entry.customerId) ||
    app.state.customers.find((c) => (c.name || "").trim() === (entry.customerName || "").trim()) ||
    null
  );
}

function findSupplierForEntry(entry) {
  if (!entry) return null;
  return (
    app.state.suppliers.find((s) => s.id === entry.customerId) ||
    app.state.suppliers.find((s) => (s.name || "").trim() === (entry.customerName || "").trim()) ||
    null
  );
}

function updateTxEditUI(sectionId) {
  const isEditing = Boolean(app.editingTx[sectionId]);
  const saveBtn = $(`${sectionId}Save`);
  const cancelBtn = $(`${sectionId}CancelEdit`);
  if (saveBtn) saveBtn.textContent = isEditing ? "حفظ التعديل" : "حفظ";
  if (cancelBtn) cancelBtn.classList.toggle("hidden", !isEditing);
}

function clearTxInputs(sectionId) {
  app.temp[sectionId] = [];
  if ($(`${sectionId}CustomerInput`)) $(`${sectionId}CustomerInput`).value = "";
  if ($(`${sectionId}PaidAmount`)) $(`${sectionId}PaidAmount`).value = "";
  if ($(`${sectionId}DiscountValue`)) $(`${sectionId}DiscountValue`).value = "";
  if ($(`${sectionId}DiscountType`)) $(`${sectionId}DiscountType`).value = "none";
  if ($(`${sectionId}PaymentStatus`)) $(`${sectionId}PaymentStatus`).selectedIndex = 0;
  if ($(`${sectionId}Method`)) $(`${sectionId}Method`).selectedIndex = 0;
  renderTemp(sectionId);
}

function cancelTxEdit(sectionId) {
  if (!app.editingTx[sectionId]) return;
  if (!confirm("هل تريد إلغاء وضع التعديل الحالي؟")) return;
  app.editingTx[sectionId] = null;
  clearTxInputs(sectionId);
  updateTxEditUI(sectionId);
}

function saveTx(sectionId, cfg, archiveMode) {
  if (!app.temp[sectionId].length) return alert("لا توجد منتجات لإضافة البيع");
  const editingCtx = app.editingTx[sectionId];
  const isEditing = Boolean(editingCtx?.recordId);
  const targetType = isEditing
    ? editingCtx.sourceType
    : archiveMode && cfg.target === "invoices"
    ? "archivedInvoices"
    : cfg.target;
  const sourceList = app.state[targetType] || [];
  const oldIndex = isEditing ? sourceList.findIndex((x) => x.id === editingCtx.recordId) : -1;
  const oldEntry = oldIndex >= 0 ? sourceList[oldIndex] : null;
  if (isEditing && !oldEntry) {
    app.editingTx[sectionId] = null;
    updateTxEditUI(sectionId);
    return alert("لم يتم العثور على العملية الأصلية للتعديل");
  }
  const typedCustomer = $(`${sectionId}CustomerInput`)?.value?.trim() || "";
  let entity = cfg.isPurchase ? findSupplierByNameOrPhone(typedCustomer) : findCustomerByNameOrPhone(typedCustomer);

  // Auto-create customer/supplier from typed name/phone when not found.
  if (typedCustomer && !entity) {
    const normalizedTyped = normalizeDigits(typedCustomer);
    const looksLikePhone = /^\d{6,}$/.test(normalizedTyped);
    if (cfg.isPurchase) {
      entity = {
        id: id("sup"),
        name: looksLikePhone ? `المورد ${normalizedTyped}` : typedCustomer,
        phone: looksLikePhone ? normalizedTyped : "",
        address: "",
        debt: 0,
        ledger: [],
      };
      app.state.suppliers.push(entity);
    } else {
      entity = {
        id: id("cus"),
        name: looksLikePhone ? `العميل ${normalizedTyped}` : typedCustomer,
        phone: looksLikePhone ? normalizedTyped : "",
        address: "",
        debt: 0,
        ledger: [],
      };
      app.state.customers.push(entity);
    }
  }
  const pStatus = $(`${sectionId}PaymentStatus`).value;
  const paid = Number($(`${sectionId}PaidAmount`).value || 0);
  const dType = $(`${sectionId}DiscountType`).value;
  const dVal = Number($(`${sectionId}DiscountValue`).value || 0);
  const warehouseId = $(`${sectionId}Warehouse`)?.value || (cfg.fawry ? "" : app.state.warehouses[0]?.id);
  
  if (!warehouseId && !cfg.fawry) {
    return alert("يرجى اختيار المخزن قبل الحفظ");
  }

  const isReturnTx = targetType === "salesReturns" || targetType === "invoiceReturns";
  const txEffect = getSourceTypeEffect(targetType);
  const invoiceNumber =
    targetType === "invoices" || targetType === "archivedInvoices"
      ? isEditing
        ? oldEntry.invoiceNumber || null
        : sectionId === "invoices"
        ? nextInvoiceNumber()
        : null
      : null;
  const salesNumber =
    targetType === "sales"
      ? isEditing
        ? oldEntry.salesNumber || null
        : sectionId === "sales"
        ? nextSalesNumber()
        : null
      : null;
  const sub = app.temp[sectionId].reduce((a, b) => a + b.qty * b.price, 0);
  const total = discount(sub, dType, dVal);
  const discountAmount = sub - total;
  const remain = Math.max(0, total - paid);

  if (txEffect !== 0) {
    const deltaByProduct = {};
    if (isEditing && oldEntry) {
      for (const it of oldEntry.items || []) {
        deltaByProduct[it.productId] = (deltaByProduct[it.productId] || 0) - txEffect * Number(it.qty || 0);
      }
    }
    for (const it of app.temp[sectionId]) {
      deltaByProduct[it.productId] = (deltaByProduct[it.productId] || 0) + txEffect * Number(it.qty || 0);
    }
    for (const [pid, delta] of Object.entries(deltaByProduct)) {
      if (pid.startsWith("NEW_")) continue; // Skip validation for new products being purchased
      const p = app.state.products.find((x) => x.id === pid);
      if (!p) return alert("يوجد منتج غير موجود في المخزون داخل العملية");
      if (Number(p.qty || 0) + Number(delta || 0) < 0) {
        const name = p.name || "منتج";
        return alert(`الكمية غير كافية في المخزون: ${name}`);
      }
    }
    for (const [pid, delta] of Object.entries(deltaByProduct)) {
      if (!delta && !cfg.isPurchase) continue;
      
      if (pid.startsWith("NEW_")) {
        // Create new product for purchase
        const it = app.temp[sectionId].find(x => x.productId === pid);
        if (it) {
          const newP = {
            id: id("prd"),
            name: it.productName,
            barcode: it.barcode || genBarcode(),
            qty: Number(delta || 0), // Use total delta for initial quantity
            salePrice: Number(it.salePrice || 0),
            costPrice: Number(it.costPrice || 0),
            warehouseId: warehouseId || it.warehouseId, // Force transaction warehouse
          };
          app.state.products.push(newP);
          // Update temp item(s) with real ID
          app.temp[sectionId].forEach(tempItem => {
            if (tempItem.productId === pid) {
              tempItem.productId = newP.id;
              tempItem.warehouseId = newP.warehouseId;
              tempItem.isNew = false;
            }
          });
        }
      } else {
        const p = app.state.products.find((x) => x.id === pid);
        if (p) {
          p.qty = Number(p.qty || 0) + Number(delta || 0);
          if (cfg.isPurchase) {
            const it = app.temp[sectionId].find(x => x.productId === pid);
            if (it) {
              p.costPrice = Number(it.costPrice || p.costPrice);
              p.salePrice = Number(it.salePrice || p.salePrice);
              // Update existing product warehouse ONLY if it's a purchase and we want to move it?
              // No, better to keep it in its original warehouse but update qty.
              // If user selected a DIFFERENT warehouse, addTemp would have made it NEW_.
              // So p.warehouseId is already correct for this pid.
            }
          }
        }
      }
    }
  }

  const entry = {
    id: isEditing ? oldEntry.id : id("txn"),
    customerId: entity?.id || "",
    customerName: entity?.name || typedCustomer || (cfg.isPurchase ? "مورد مجهول" : "عميل مجهول"),
    warehouseId,
    date: isEditing ? oldEntry.date || nowISO() : nowISO(),
    items: structuredClone(app.temp[sectionId]),
    paymentStatus: pStatus,
    paidAmount: paid,
    remainingAmount: remain,
    discountType: dType,
    discountValue: dVal,
    subtotal: sub,
    total,
    sectionId,
    invoiceNumber,
    salesNumber,
    paymentMethod: cfg.fawry ? $(`${sectionId}Method`).value : "",
    isPurchase: cfg.isPurchase || false,
  };

  if (isEditing) app.state[targetType][oldIndex] = entry;
  else app.state[targetType].push(entry);

  let preservedLedgerId = "";
  if (isEditing && oldEntry) {
    const oldEntity = cfg.isPurchase ? findSupplierForEntry(oldEntry) : findCustomerForEntry(oldEntry);
    if (oldEntity) {
      const oldLedgerIndex = (oldEntity.ledger || []).findIndex((l) => l.refId === oldEntry.id);
      if (oldLedgerIndex >= 0) {
        preservedLedgerId = oldEntity.ledger[oldLedgerIndex].id;
        oldEntity.ledger.splice(oldLedgerIndex, 1);
      }
      if (targetType === "salesReturns" || targetType === "invoiceReturns") {
        oldEntity.debt = Number(oldEntity.debt || 0) + Number(oldEntry.total || 0);
      } else if (shouldAddDebtForStatus(oldEntry.paymentStatus || "")) {
        // For purchases, debt is what we owe, so it should decrease if we're "undoing" a purchase
        const sign = cfg.isPurchase ? -1 : 1;
        oldEntity.debt = Number(oldEntity.debt || 0) - (sign * Number(oldEntry.remainingAmount || 0));
      }
    }
  }

  if (entity) {
    let ledgerType = txName(sectionId);
    if (discountAmount > 0) {
      ledgerType += ` (تم خصم ${money(discountAmount)})`;
    }
    const beforeDebt = Number(entity.debt || 0);
    entity.ledger.push({
      id: preservedLedgerId || id("led"),
      type: ledgerType,
      amount: total,
      paidAmount: paid,
      remainingAmount: isReturnTx ? beforeDebt - total : remain, // This might need more logic for purchases
      date: entry.date,
      refId: entry.id,
      source: targetType,
      discountAmount: discountAmount > 0 ? discountAmount : 0,
    });
    if (isReturnTx) {
      entity.debt = beforeDebt - total;
    } else if (shouldAddDebtForStatus(pStatus)) {
      const sign = cfg.isPurchase ? 1 : 1; // Wait, for purchases, remain is what we OWE to supplier.
      // Customer debt: we ADD remain (what they owe us).
      // Supplier debt: we ADD remain (what we owe them).
      // So the logic is the same if 'debt' means 'outstanding balance'.
      entity.debt = beforeDebt + remain;
    }
  }

  app.editingTx[sectionId] = null;
  clearTxInputs(sectionId);
  updateTxEditUI(sectionId);
  saveState();

  if (cfg.isPurchase) {
    const whName = getWarehouseName(warehouseId);
    alert(`تم حفظ فاتورة الشراء بنجاح وإضافة المنتجات إلى مخزن: ${whName}`);
  } else {
    alert("تم حفظ العملية بنجاح");
  }
}

function bindCustomers() {
  $("customerForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const cid = $("customerId").value || id("cus");
    const row = {
      id: cid,
      name: $("customerName").value.trim(),
      phone: $("customerPhone").value.trim(),
      address: $("customerAddress").value.trim(),
      debt: Number($("customerDebt").value || 0),
      ledger: app.state.customers.find((c) => c.id === cid)?.ledger || [],
    };
    const i = app.state.customers.findIndex((x) => x.id === cid);
    if (i >= 0) app.state.customers[i] = row;
    else app.state.customers.push(row);
    $("customerForm").reset();
    $("customerId").value = "";
    saveState();
  });
  if ($("customerSearchInput")) {
    $("customerSearchInput").addEventListener("input", () => {
      renderCustomers();
    });
  }
  $("saveDebtPayment").addEventListener("click", () => {
    const typed = $("debtCustomerInput").value.trim();
    const found = findCustomerByNameOrPhone(typed);
    const cid = found?.id || "";
    const amount = Number($("debtPayment").value || 0);
    if (!cid || amount <= 0) return alert("اختر عميلًا وقم بإدخال مبلغ صحيح");
    const c = app.state.customers.find((x) => x.id === cid);
    if (!c) return;
    c.debt = Math.max(0, Number(c.debt || 0) - amount);
    const ledgerEntry = { id: id("led"), type: "دفعة سداد", amount, paidAmount: amount, remainingAmount: c.debt, date: nowISO(), source: "payments" };
    c.ledger.push(ledgerEntry);
    $("debtCustomerInput").value = c.name;
    $("debtPayment").value = "";
    saveState();
    if (confirm(`تم تسجيل سداد مبلغ ${money(amount)} بنجاح. هل تريد طباعة الوصل؟`)) {
      window.kiroPrintLedgerItem(c.id, ledgerEntry.id);
    }
  });
}

function renderCustomers() {
  const q = ($("customerSearchInput")?.value || "").trim().toLowerCase();
  let filtered = app.state.customers;
  if (q) {
    filtered = filtered.filter(c => 
      (c.name || "").toLowerCase().includes(q) || 
      (c.phone || "").toLowerCase().includes(q)
    );
  }

  $("customersTable").innerHTML =
    filtered
      .map(
        (c) => `<tr>
        <td>${c.name}</td><td>${c.phone || "-"}</td><td>${c.address || "-"}</td><td>${money(c.debt || 0)}</td>
        <td>
          <button class="btn secondary" onclick="window.kiroEditCustomer('${c.id}')">تعديل</button>
          <button class="btn danger" onclick="window.kiroDeleteCustomer('${c.id}')">حذف</button>
          <button class="btn primary" onclick="window.kiroViewCustomerLedger('${c.id}')">عرض المعاملات</button>
        </td>
      </tr>`
      )
      .join("") || "<tr><td colspan='5'>لا يوجد عملاء</td></tr>";
}

function bindSuppliers() {
  $("supplierForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const sid = $("supplierId").value || id("sup");
    const row = {
      id: sid,
      name: $("supplierName").value.trim(),
      phone: $("supplierPhone").value.trim(),
      address: $("supplierAddress").value.trim(),
      debt: Number($("supplierDebt").value || 0),
      ledger: [],
    };
    const i = app.state.suppliers.findIndex((x) => x.id === sid);
    if (i >= 0) {
      row.ledger = app.state.suppliers[i].ledger || [];
      app.state.suppliers[i] = row;
    } else {
      app.state.suppliers.push(row);
    }
    $("supplierForm").reset();
    $("supplierId").value = "";
    saveState();
  });
  $("supplierSearch").addEventListener("input", renderSuppliers);

  if ($("saveSupplierPayment")) {
    $("saveSupplierPayment").addEventListener("click", () => {
      const typed = $("supplierPaymentInput").value.trim();
      const amount = Number($("supplierPaymentAmount").value || 0);
      const found = findSupplierByNameOrPhone(typed);

      if (!found) return alert("المورد غير موجود. يرجى اختيار مورد مسجل أولاً.");
      if (amount <= 0) return alert("يرجى إدخال مبلغ صحيح.");
      if (amount > (found.debt || 0)) {
        if (!confirm(`المبلغ المدفوع (${money(amount)}) أكبر من المديونية الحالية (${money(found.debt)}). هل تريد المتابعة؟`)) return;
      }

      found.debt = Number(found.debt || 0) - amount;
      found.ledger.push({
        id: id("led"),
        type: "دفع دفعة نقدية (سداد)",
        amount: amount,
        paidAmount: amount,
        remainingAmount: found.debt,
        date: nowISO(),
      });

      $("supplierPaymentInput").value = "";
      $("supplierPaymentAmount").value = "";
      saveState();
      alert(`تم تسجيل الدفعة بنجاح. المديونية المتبقية لـ ${found.name}: ${money(found.debt)}`);
    });
  }
}

function renderSuppliers() {
  const q = $("supplierSearch").value.trim().toLowerCase();
  const filtered = app.state.suppliers.filter((s) => s.name.toLowerCase().includes(q) || (s.phone && s.phone.includes(q)));
  $("suppliersTable").innerHTML =
    filtered
      .map(
        (s) => `<tr>
      <td>${s.name}</td><td>${s.phone || "-"}</td><td>${s.address || "-"}</td><td>${money(s.debt)}</td>
      <td>
        <button class="btn secondary" onclick="window.kiroEditSupplier('${s.id}')">تعديل</button>
        <button class="btn primary" onclick="window.kiroAddSupplierPurchase('${s.id}')">إضافة فاتورة شراء</button>
        <button class="btn danger" onclick="window.kiroDeleteSupplier('${s.id}')">حذف</button>
        <button class="btn primary" onclick="window.kiroViewSupplierLedger('${s.id}')">كشف حساب</button>
      </td>
    </tr>`
      )
      .join("") || "<tr><td colspan='5'>لا يوجد موردين</td></tr>";
}

window.kiroEditSupplier = (sid) => {
  const s = app.state.suppliers.find((x) => x.id === sid);
  if (!s) return;
  $("supplierId").value = s.id;
  $("supplierName").value = s.name;
  $("supplierPhone").value = s.phone || "";
  $("supplierAddress").value = s.address || "";
  $("supplierDebt").value = s.debt || 0;
};

window.kiroAddSupplierPurchase = (sid) => {
  const s = app.state.suppliers.find((x) => x.id === sid);
  if (!s) return;
  // Navigate to purchases section
  const navItem = navItems.find(it => it[0] === "purchases");
  if (navItem) {
    showSection("purchases", "فواتير الشراء");
    $(`purchasesCustomerInput`).value = s.name;
    updateProductHintsForSection("purchases", "");
  }
};

window.kiroDeleteSupplier = (sid) => {
  if (!confirm("هل أنت متأكد من حذف المورد؟")) return;
  app.state.suppliers = app.state.suppliers.filter((x) => x.id !== sid);
  saveState();
};

window.kiroViewSupplierLedger = (sid) => {
  const s = app.state.suppliers.find((x) => x.id === sid);
  if (!s) return;
  $("recordDetailsTitle").textContent = "كشف حساب مورد";
  show("printRecordDetails");
  $("recordDetailsBody").innerHTML = `
    <div style="margin-bottom: 20px;">
      <h4>المورد: ${s.name}</h4>
      <p>الهاتف: ${s.phone || "-"}</p>
      <p><strong>المديونية الحالية المستحقة له: ${money(s.debt)}</strong></p>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>البيان</th>
            <th>مبلغ الفاتورة</th>
            <th>المدفوع</th>
            <th>المتبقي (مديونية)</th>
            <th class="no-print">إجراءات</th>
          </tr>
        </thead>
        <tbody>
          ${
            (s.ledger || [])
              .map(
                (l) => `<tr>
                  <td>${fmtDate(l.date)}</td>
                  <td>${l.type}</td>
                  <td>${money(l.amount || 0)}</td>
                  <td>${money(l.paidAmount || 0)}</td>
                  <td>${money(l.remainingAmount || 0)}</td>
                  <td class="no-print">
                    ${l.refId ? `<button class="btn secondary" onclick="window.kiroShowRecordDetails('${l.source}','${l.refId}')" style="padding: 4px 8px; font-size: 12px;">تفاصيل الفاتورة</button>` : "-"}
                  </td>
                </tr>`
              )
              .join("") || "<tr><td colspan='6'>لا توجد عمليات مسجلة</td></tr>"
          }
        </tbody>
      </table>
    </div>
  `;
  show("recordDetailsModal");
};

function bindWarehouses() {
  $("warehouseForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const wid = $("warehouseId").value;
    const name = $("warehouseName").value.trim();
    if (!name) return;
    const dup = app.state.warehouses.find((w) => w.name.trim() === name && w.id !== wid);
    if (dup) return alert("اسم المستودع مستخدم بالفعل");
    if (wid) {
      const idx = app.state.warehouses.findIndex((w) => w.id === wid);
      if (idx >= 0) app.state.warehouses[idx].name = name;
    } else {
      app.state.warehouses.push({ id: id("wh"), name });
    }
    $("warehouseForm").reset();
    $("warehouseId").value = "";
    saveState();
  });
  $("transferBtn").addEventListener("click", transferStock);
  $("transferFrom").addEventListener("change", renderTransferProducts);
  $("transferProductSearch").addEventListener("input", renderTransferProducts);
}

function transferStock() {
  const from = $("transferFrom").value;
  const to = $("transferTo").value;
  const query = $("transferProductSearch").value.trim();
  const qty = Number($("transferQty").value || 0);
  if (!from || !to || !query || qty <= 0 || from === to) return alert("الرجاء ملء جميع الحقول بشكل صحيح");

  // Find product in source warehouse by name or barcode
  const src = app.state.products.find((p) =>
    p.warehouseId === from && (p.name === query || p.barcode === query)
  );

  if (!src || src.qty < qty) return alert("المنتج غير موجود في هذا المخزن أو الكمية غير كافية");
  
  src.qty -= qty;
  let dst = app.state.products.find((p) => p.barcode === src.barcode && p.warehouseId === to);
  if (!dst) {
    dst = { ...src, id: id("prd"), qty: 0, warehouseId: to };
    app.state.products.push(dst);
  }
  dst.qty += qty;
  app.state.transfers.push({ id: id("trn"), from, to, productId: src.id, qty, date: nowISO() });
  $("transferQty").value = "";
  $("transferProductSearch").value = "";
  saveState();
}

function renderWarehouses() {
  $("warehouseList").innerHTML = app.state.warehouses
    .map(
      (w) => `<tr>
        <td>${w.name}</td>
        <td>
          <button class="btn secondary" onclick="window.kiroEnterWarehouse('${w.id}')">دخول المستودع</button>
          <button class="btn primary" onclick="window.kiroEditWarehouse('${w.id}')">تعديل</button>
          <button class="btn danger" onclick="window.kiroDeleteWarehouse('${w.id}')">حذف</button>
        </td>
      </tr>`
    )
    .join("");
}

function bindRecords() {
  $("recordType").innerHTML = recordTypes.map(([k, l]) => `<option value="${k}">${l}</option>`).join("");
  $("recordSearch").addEventListener("input", renderRecords);
  $("recordType").addEventListener("change", renderRecords);
}

function renderRecords() {
  const type = $("recordType").value || "sales";
  const q = $("recordSearch").value.trim().toLowerCase();
  $("recordsTable").innerHTML =
    (app.state[type] || [])
      .filter(
        (r) =>
          !q ||
          (r.customerName || "").toLowerCase().includes(q) ||
          (r.date || "").includes(q) ||
          String(r.invoiceNumber || "").includes(q) ||
          String(r.salesNumber || "").includes(q)
      )
      .map(
        (r) => `<tr>
        <td>${fmtDate(r.date)}</td><td>${r.invoiceNumber ? `#${r.invoiceNumber} - ` : r.salesNumber ? `#${r.salesNumber} - ` : ""}${r.customerName}</td><td>${money(r.total || 0)}</td><td>${r.paymentStatus || "-"}</td>
        <td>
          <button class="btn secondary" onclick="window.kiroShowRecordDetails('${type}','${r.id}')">عرض التفاصيل</button>
          ${getRecordSectionId(type) ? `<button class="btn primary" onclick="window.kiroEditRecord('${type}','${r.id}')">تعديل</button>` : ""}
          <button class="btn primary" onclick="window.kiroPrintRecord('${type}','${r.id}')">طباعة</button>
          <button class="btn danger" onclick="window.kiroDeleteRecord('${type}','${r.id}')">حذف</button>
        </td>
      </tr>`
      )
      .join("") || "<tr><td colspan='5'>لا يوجد نتائج</td></tr>";
}

function bindReports() {
  $("runReports").addEventListener("click", renderReports);
  $("printReport").addEventListener("click", () => printHtml($("reports").innerHTML, "تقرير"));
  if ($("runCustomProfitReport")) {
    $("runCustomProfitReport").addEventListener("click", renderCustomProfitReport);
  }
  if ($("showAllProfitReport")) {
    $("showAllProfitReport").addEventListener("click", () => {
      $("profitFromDate").value = "";
      $("profitToDate").value = "";
      renderCustomProfitReport();
    });
  }
}

function renderCustomProfitReport() {
  const from = $("profitFromDate").value.trim();
  const to = $("profitToDate").value.trim();

  const dateOk = (dt) => {
    const d = dt.slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };

  const rows = [];
  const pushRows = (entries, sourceTitle, sign, sourceKey) => {
    (entries || []).forEach((e) => {
      if (!dateOk(e.date)) return;
      rows.push({
        sourceTitle,
        sourceKey,
        label: e.customerName || "غير محدد",
        ref: e.id || "-",
        date: e.date,
        profit: calcEntryProfit(e, sign),
        sign,
      });
    });
  };

  pushRows(app.state.invoices, "فاتورة", 1, "invoices");
  pushRows(app.state.archivedInvoices, "أرشيف فواتير", 1, "archivedInvoices");
  pushRows(app.state.sales, "بيع", 1, "sales");
  pushRows(app.state.fawrySales, "بيع فوري", 1, "fawrySales");
  pushRows(app.state.salesReturns, "ارتجع بيع", -1, "salesReturns");
  pushRows(app.state.invoiceReturns, "ارتجع فاتورة", -1, "invoiceReturns");

  rows.sort((a, b) => new Date(b.date) - new Date(a.date));
  const totalProfit = rows.reduce((a, r) => a + r.profit, 0);

  // Calculate breakdown
  const breakdown = {};
  rows.forEach(r => {
    if (!breakdown[r.sourceTitle]) breakdown[r.sourceTitle] = 0;
    breakdown[r.sourceTitle] += r.profit;
  });

  const breakdownHtml = Object.entries(breakdown).map(([title, val]) => `
    <div class="kpi-card" style="padding: 10px; background: var(--bg-soft); border: 1px solid var(--line);">
      <h5 style="margin:0 0 5px;">${title}</h5>
      <strong style="color: ${val >= 0 ? "var(--success)" : "var(--danger)"}">${money(val)}</strong>
    </div>
  `).join("");

  const headerText = (from || to) 
    ? `نتائج تقرير الأرباح الشامل ${from ? 'من ' + fmtDate(from) : ''} ${to ? 'إلى ' + fmtDate(to) : ''}`
    : `نتائج تقرير الأرباح الشامل (منذ البداية)`;

  let html = `
    <div class="card" id="customProfitReportContent">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
        <h4 style="margin:0;">${headerText}</h4>
        <button class="btn secondary" onclick="window.kiroPrintCustomProfitReport()">طباعة هذا التقرير</button>
      </div>

      <div class="kpi-grid" style="margin-bottom: 15px;">
        <div class="kpi-card" style="background: var(--primary); color: #fff; grid-column: span 2;">
          <h4 style="color: #fff;">إجمالي صافي الربح النهائي</h4>
          <strong style="font-size: 28px;">${money(totalProfit)}</strong>
        </div>
        ${breakdownHtml}
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>المصدر</th>
              <th>العميل/الرقم</th>
              <th>التاريخ</th>
              <th>الربح</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            ${
              rows.length
                ? rows
                    .map(
                      (r) => `
              <tr>
                <td>${r.sourceTitle}</td>
                <td>${r.label}</td>
                <td>${fmtDate(r.date)}</td>
                <td style="color: ${r.profit >= 0 ? "var(--success)" : "var(--danger)"}">${money(r.profit)}</td>
                <td><button class="btn secondary" onclick="window.kiroShowProfitItemDetails('${r.sourceKey}','${r.ref}', ${r.sign})">التفاصيل</button></td>
              </tr>`
                    )
                    .join("")
                : "<tr><td colspan='5'>لا توجد عمليات في هذه الفترة</td></tr>"
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
  $("customProfitReportResult").innerHTML = html;
}

window.kiroPrintCustomProfitReport = () => {
  const content = $("customProfitReportContent").innerHTML;
  // Remove the print button from the HTML to be printed
  const cleanHtml = content.replace(/<button.*?>.*?<\/button>/g, "");
  printHtml(cleanHtml, "تقرير أرباح شامل");
};

function renderReports() {
  const todayStr = new Date().toISOString().slice(0, 10);
  if (!$("reportDate").value) $("reportDate").value = todayStr;
  
  if (!$("reportMonth").children.length) {
    $("reportMonth").innerHTML = Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("");
    $("reportMonth").value = String(new Date().getMonth() + 1);
  }
  
  const d = $("reportDate").value.trim();
  const month = Number($("reportMonth").value);
  const y = new Date().getFullYear();

  const ds = app.state.sales.filter((x) => x.date.startsWith(d)).reduce((a, b) => a + (b.total || 0), 0);
  const di = app.state.invoices.filter((x) => x.date.startsWith(d)).reduce((a, b) => a + (b.total || 0), 0);
  const dp = app.state.purchases.filter((x) => x.date.startsWith(d)).reduce((a, b) => a + (b.total || 0), 0);
  const dr = [...app.state.salesReturns, ...app.state.invoiceReturns].filter((x) => x.date.startsWith(d)).reduce((a, b) => a + (b.total || 0), 0);
  const df = app.state.fawrySales.filter((x) => x.date.startsWith(d)).reduce((a, b) => a + (b.total || 0), 0);
  const net = ds + di + df - dr;
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    return [...app.state.sales, ...app.state.invoices, ...app.state.fawrySales]
      .filter((x) => {
        const dt = new Date(x.date);
        return dt.getFullYear() === y && dt.getMonth() + 1 === m;
      })
      .reduce((a, b) => a + (b.total || 0), 0);
  });
  const salesR = summarizeTransactions(app.state.sales, d, month, y);
  const invoicesR = summarizeTransactions(app.state.invoices, d, month, y);
  const purchasesR = summarizeTransactions(app.state.purchases, d, month, y);
  const salesReturnsR = summarizeTransactions(app.state.salesReturns, d, month, y);
  const invoiceReturnsR = summarizeTransactions(app.state.invoiceReturns, d, month, y);
  const fawryR = summarizeTransactions(app.state.fawrySales, d, month, y);

  const stockQty = app.state.products.reduce((a, p) => a + Number(p.qty || 0), 0);
  const stockCost = app.state.products.reduce((a, p) => a + Number(p.qty || 0) * Number(p.costPrice || 0), 0);
  const stockSale = app.state.products.reduce((a, p) => a + Number(p.qty || 0) * Number(p.salePrice || 0), 0);
  const lowStock = app.state.products
    .filter((p) => Number(p.qty || 0) <= 5)
    .sort((a, b) => Number(a.qty || 0) - Number(b.qty || 0))
    .slice(0, 12);
  const warehouseStats = (app.state.warehouses || []).map((w) => {
    const rows = app.state.products.filter((p) => p.warehouseId === w.id);
    const qty = rows.reduce((a, p) => a + Number(p.qty || 0), 0);
    const value = rows.reduce((a, p) => a + Number(p.qty || 0) * Number(p.costPrice || 0), 0);
    return { name: w.name, count: rows.length, qty, value };
  });

  const debtTotal = app.state.customers.reduce((a, c) => a + Number(c.debt || 0), 0);
  const debtCustomers = app.state.customers
    .filter((c) => Number(c.debt || 0) > 0)
    .sort((a, b) => Number(b.debt || 0) - Number(a.debt || 0));
  const debtPaymentsToday = app.state.customers.reduce(
    (sum, c) =>
      sum +
      (c.ledger || [])
        .filter((l) => String(l.type || "").includes("دفعة") && String(l.date || "").startsWith(d))
        .reduce((a, l) => a + Number(l.paidAmount || l.amount || 0), 0),
    0
  );
  const topProducts = buildTopProducts([
    ...app.state.sales,
    ...app.state.invoices,
    ...app.state.fawrySales,
    ...app.state.salesReturns,
    ...app.state.invoiceReturns,
  ]);

  $("reportSummary").innerHTML = `
    <div class="kpi-card"><h4>المبيعات اليوم</h4><strong>${money(ds)}</strong></div>
    <div class="kpi-card"><h4>الفواتير اليوم</h4><strong>${money(di)}</strong></div>
    <div class="kpi-card"><h4>المشتريات اليوم</h4><strong>${money(dp)}</strong></div>
    <div class="kpi-card"><h4>المرتجعات اليوم</h4><strong>${money(dr)}</strong></div>
    <div class="kpi-card"><h4>المبيعات عبر فورى اليوم</h4><strong>${money(df)}</strong></div>
    <div class="kpi-card"><h4>الصافي اليوم</h4><strong>${money(net)}</strong></div>
    <div class="kpi-card"><h4>إيراد الشهر المحدد</h4><strong>${money(monthly[month - 1] || 0)}</strong></div>
  `;
  $("reportDetails").innerHTML = `
    <div class="card">
      <h3>تقرير شامل حسب الأقسام</h3>
      <div class="kpi-grid">
        <div class="kpi-card"><h4>عدد المنتجات</h4><strong>${app.state.products.length}</strong></div>
        <div class="kpi-card"><h4>إجمال كمية المخزون</h4><strong>${stockQty}</strong></div>
        <div class="kpi-card"><h4>قيمة المخزون (تكلفة)</h4><strong>${money(stockCost)}</strong></div>
        <div class="kpi-card"><h4>قيمة المخزون (بيع)</h4><strong>${money(stockSale)}</strong></div>
        <div class="kpi-card"><h4>إجمال الديون</h4><strong>${money(debtTotal)}</strong></div>
        <div class="kpi-card"><h4>سداد الديون اليوم</h4><strong>${money(debtPaymentsToday)}</strong></div>
      </div>
    </div>

    ${buildSectionReportHtml("المبيعات اليومية", salesR)}
    ${buildSectionReportHtml("الفواتير", invoicesR)}
    ${buildSectionReportHtml("فواتير الشراء", purchasesR)}
    ${buildSectionReportHtml("مرتجع المبيعات", salesReturnsR)}
    ${buildSectionReportHtml("مرتجع الفواتير", invoiceReturnsR)}
    ${buildSectionReportHtml("مبيعات فورى", fawryR)}

    <div class="card">
      <h3>تقرير شامل حسب الأقسام</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>القسم</th><th>عدد المنتجات</th><th>إجمال الكمية</th><th>قيمة التكلفة</th></tr></thead>
          <tbody>
            ${
              warehouseStats.map((w) => `<tr><td>${w.name}</td><td>${w.count}</td><td>${w.qty}</td><td>${money(w.value)}</td></tr>`).join("") ||
              "<tr><td colspan='4'>لا توجد بيانات</td></tr>"
            }
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h3>تقرير المنتجات منخفضة الكمية</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>المنتج</th><th>الكمية</th><th>سعر البيع</th><th>القسم</th></tr></thead>
          <tbody>
            ${
              lowStock
                .map((p) => `<tr><td>${p.name}</td><td>${p.qty}</td><td>${money(p.salePrice || 0)}</td><td>${getWarehouseName(p.warehouseId)}</td></tr>`)
                .join("") || "<tr><td colspan='4'>لا يوجد منتجات منخفضة الكمية حاليًا</td></tr>"
            }
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h3>تقرير ديون الموردين</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>المورد</th><th>الهاتف</th><th>قيمة الديون له</th><th>عدد الحركات</th></tr></thead>
          <tbody>
            ${
              (app.state.suppliers || [])
                .filter(s => (s.debt || 0) > 0)
                .sort((a, b) => b.debt - a.debt)
                .map((s) => `<tr><td>${s.name}</td><td>${s.phone || "-"}</td><td>${money(s.debt || 0)}</td><td>${(s.ledger || []).length}</td></tr>`)
                .join("") || "<tr><td colspan='4'>لا توجد مديونيات للموردين</td></tr>"
            }
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h3>تقرير الديون</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>العميل</th><th>الهاتف</th><th>قيمة الديون</th><th>عدد الحركات</th></tr></thead>
          <tbody>
            ${
              debtCustomers
                .map((c) => `<tr><td>${c.name}</td><td>${c.phone || "-"}</td><td>${money(c.debt || 0)}</td><td>${(c.ledger || []).length}</td></tr>`)
                .join("") || "<tr><td colspan='4'>لا توجد بيانات</td></tr>"
            }
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h3>أكثر المنتجات حركة</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>المنتج</th><th>إجمال الكمية</th><th>إجمال القيمة</th></tr></thead>
          <tbody>
            ${
              topProducts
                .map((p) => `<tr><td>${p.name}</td><td>${p.qty}</td><td>${money(p.value)}</td></tr>`)
                .join("") || "<tr><td colspan='3'>لا توجد عمليات كافية</td></tr>"
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
  decorateReportSections();
  renderChart(monthly);
}

function summarizeTransactions(rows, day, month, year) {
  const list = rows || [];
  const totalAll = list.reduce((a, x) => a + Number(x.total || 0), 0);
  const paidAll = list.reduce((a, x) => a + Number(x.paidAmount || 0), 0);
  const remAll = list.reduce((a, x) => a + Number(x.remainingAmount || 0), 0);
  const byDay = list.filter((x) => String(x.date || "").startsWith(day));
  const byMonth = list.filter((x) => {
    const dt = new Date(x.date);
    return dt.getFullYear() === year && dt.getMonth() + 1 === month;
  });
  return {
    countAll: list.length,
    countDay: byDay.length,
    countMonth: byMonth.length,
    totalAll,
    paidAll,
    remAll,
    totalDay: byDay.reduce((a, x) => a + Number(x.total || 0), 0),
    totalMonth: byMonth.reduce((a, x) => a + Number(x.total || 0), 0),
  };
}

function buildSectionReportHtml(title, stats) {
  return `
    <div class="card">
      <h3>${title}</h3>
      <div class="kpi-grid">
        <div class="kpi-card"><h4>عدد العمليات</h4><strong>${stats.countAll}</strong></div>
        <div class="kpi-card"><h4>العمليات اليوم</h4><strong>${stats.countDay}</strong></div>
        <div class="kpi-card"><h4>العمليات الشهر</h4><strong>${stats.countMonth}</strong></div>
        <div class="kpi-card"><h4>إجمالى القسم</h4><strong>${money(stats.totalAll)}</strong></div>
        <div class="kpi-card"><h4>مدفوع</h4><strong>${money(stats.paidAll)}</strong></div>
        <div class="kpi-card"><h4>متبق</h4><strong>${money(stats.remAll)}</strong></div>
        <div class="kpi-card"><h4>إجمالى اليوم</h4><strong>${money(stats.totalDay)}</strong></div>
        <div class="kpi-card"><h4>إجمالى الشهر</h4><strong>${money(stats.totalMonth)}</strong></div>
      </div>
    </div>
  `;
}

function buildTopProducts(entries) {
  const map = new Map();
  (entries || []).forEach((e) => {
    (e.items || []).forEach((i) => {
      const k = i.productName || "غير محدد";
      const qty = Number(i.qty || 0);
      const value = qty * Number(i.price || 0);
      if (!map.has(k)) map.set(k, { name: k, qty: 0, value: 0 });
      const row = map.get(k);
      row.qty += qty;
      row.value += value;
    });
  });
  return Array.from(map.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 12);
}

function calcEntryDiscountAmount(entry) {
  const items = entry?.items || [];
  const subTotalFromItems = items.reduce((sum, i) => sum + Number(i.price || 0) * Number(i.qty || 0), 0);
  const subTotal = Number(entry?.subtotal || 0) > 0 ? Number(entry.subtotal) : subTotalFromItems;
  const savedTotal = Number(entry?.total);
  const totalAfterDiscount = Number.isFinite(savedTotal) ? savedTotal : discount(subTotal, entry.discountType, Number(entry.discountValue || 0));
  return Math.max(0, subTotal - totalAfterDiscount);
}

function calcEntryProfit(entry, sign = 1, options = {}) {
  const { includeDiscount = true } = options;
  const items = entry?.items || [];
  const baseProfit = items.reduce((sum, i) => sum + (Number(i.price || 0) - Number(i.costPrice || 0)) * Number(i.qty || 0), 0);
  if (!includeDiscount) return baseProfit * sign;
  const discountAmount = calcEntryDiscountAmount(entry);
  return (baseProfit - discountAmount) * sign;
}

function calcProfitTotal(datePredicate, options = {}) {
  const sumBy = (entries, sign) =>
    (entries || []).reduce((sum, e) => {
      if (!datePredicate(e.date)) return sum;
      return sum + calcEntryProfit(e, sign, options);
    }, 0);
  return (
    sumBy(app.state.invoices, 1) +
    sumBy(app.state.archivedInvoices, 1) +
    sumBy(app.state.sales, 1) +
    sumBy(app.state.fawrySales, 1) +
    sumBy(app.state.purchases, 0) + // Purchases don't contribute to direct sales profit
    sumBy(app.state.salesReturns, -1) +
    sumBy(app.state.invoiceReturns, -1)
  );
}

function getProfitRows(period, customDate = null) {
  const now = new Date();
  const today = customDate || now.toISOString().slice(0, 10);
  const dateOk = (dateValue) => {
    const raw = String(dateValue || "");
    if (!raw) return false;
    if (period === "all") return true;
    if (period === "day") return raw.startsWith(today);
    const d = new Date(raw);
    if (period === "month") {
      const targetDate = new Date(today);
      return d.getFullYear() === targetDate.getFullYear() && d.getMonth() === targetDate.getMonth();
    }
    if (period === "year") {
      const targetDate = new Date(today);
      return d.getFullYear() === targetDate.getFullYear();
    }
    return false;
  };
  const rows = [];
  const pushRows = (entries, sourceTitle, sign, sourceKey) => {
    (entries || []).forEach((e) => {
      if (!dateOk(e.date)) return;
      rows.push({
        sourceTitle,
        sourceKey,
        label: e.customerName || "غير محدد",
        ref: e.id || "-",
        date: e.date,
        profit: calcEntryProfit(e, sign),
        sign
      });
    });
  };
  pushRows(app.state.invoices, "فاتورة", 1, "invoices");
  pushRows(app.state.archivedInvoices, "أرشيف فواتير", 1, "archivedInvoices");
  pushRows(app.state.sales, "بيع", 1, "sales");
  pushRows(app.state.fawrySales, "بيع فوري", 1, "fawrySales");
  pushRows(app.state.salesReturns, "ارتجع بيع", -1, "salesReturns");
  pushRows(app.state.invoiceReturns, "ارتجع فاتورة", -1, "invoiceReturns");
  rows.sort((a, b) => new Date(b.date) - new Date(a.date));
  return rows;
}

window.kiroShowProfitDetails = (period, customDate = null) => {
  if (!$("profitBody")) return;
  const titleMap = {
    day: "ربح اليوم",
    month: "ربح الشهر",
    year: "ربح السنة",
    all: "إجمالي الأرباح (منذ البداية)",
  };
  const rows = getProfitRows(period, customDate);
  const total = rows.reduce((a, r) => a + Number(r.profit || 0), 0);
  const displayTitle = customDate && period === "day" ? `ربح يوم ${fmtDate(customDate)}` : (titleMap[period] || "إجمالي الربح");
  $("profitTitle").textContent = displayTitle;
  $("profitBody").innerHTML = `
    <p><strong>إجمالي الربح:</strong> ${money(total)}</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>المصدر</th><th>اسم العملية/العميلة</th><th>التاريخ</th><th>المكسب</th><th>إجراءات</th></tr></thead>
        <tbody>
          ${
            rows.length
              ? rows.map((r) => `<tr>
                  <td>${r.sourceTitle}</td>
                  <td>${r.label} - ${r.ref}</td>
                  <td>${fmtDate(r.date)}</td>
                  <td>${money(r.profit)}</td>
                  <td><button class="btn secondary" onclick="window.kiroShowProfitItemDetails('${r.sourceKey}','${r.ref}', ${r.sign})">تفاصيل المكسب</button></td>
                </tr>`).join("")
              : "<tr><td colspan='5'>لا توجد عمليات في الفترة المحددة</td></tr>"
          }
        </tbody>
      </table>
    </div>
  `;
  show("profitModal");
};

window.kiroShowProfitItemDetails = (sourceKey, refId, sign) => {
  const entry = app.state[sourceKey].find((e) => e.id === refId);
  if (!entry) return alert("العملية غير موجودة");

  const items = entry.items || [];
  const rows = items.map((i) => {
    const unitCost = Number(i.costPrice || 0);
    const unitSale = Number(i.price || 0);
    const unitProfit = (unitSale - unitCost) * sign;
    const totalProfit = unitProfit * Number(i.qty || 0);
    return `
      <tr>
        <td>${i.productName}</td>
        <td>${i.qty}</td>
        <td>${money(unitCost)}</td>
        <td>${money(unitSale)}</td>
        <td>${money(unitProfit)}</td>
        <td>${money(totalProfit)}</td>
      </tr>
    `;
  }).join("");

  const totalProfitBeforeDiscount = calcEntryProfit(entry, sign, { includeDiscount: false });
  const totalProfitAfterDiscount = calcEntryProfit(entry, sign, { includeDiscount: true });
  const totalProfitDiscountValue = totalProfitBeforeDiscount - totalProfitAfterDiscount;

  const detailHtml = `
    <div style="padding:12px;">
      <p><strong>العميل:</strong> ${entry.customerName}</p>
      <p><strong>التاريخ:</strong> ${fmtDate(entry.date)}</p>
      <div class="table-wrap">
        <table border="1" cellpadding="6" cellspacing="0" width="100%">
          <thead>
            <tr>
              <th>المنتج</th>
              <th>الكمية</th>
              <th>سعر التكلفة</th>
              <th>سعر البيع</th>
              <th>مكسب القطعة</th>
              <th>إجمالي المكسب</th>
            </tr>
          </thead>
          <tbody>
            ${rows || "<tr><td colspan='6'>لا توجد منتجات</td></tr>"}
          </tbody>
          <tfoot>
            <tr>
              <th colspan="5" style="text-align:left;">إجمالي مكسب العملية:</th>
              <th>${money(totalProfitBeforeDiscount)}</th>
            </tr>
            <tr>
              <th colspan="5" style="text-align:left;">قيمة الخصم:</th>
              <th>${money(totalProfitDiscountValue)}</th>
            </tr>
            <tr>
              <th colspan="5" style="text-align:left;">إجمالي المكسب بعد الخصم:</th>
              <th>${money(totalProfitAfterDiscount)}</th>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;

  // We reuse recordDetailsModal for the profit breakdown
  $("recordDetailsTitle").textContent = "تفاصيل أرباح العملية";
  $("recordDetailsBody").innerHTML = detailHtml;
  show("printRecordDetails");
  show("recordDetailsModal");
};

window.kiroShowLowStock = (warehouseId) => {
  const warehouse = app.state.warehouses.find((w) => w.id === warehouseId);
  if (!warehouse || !$("lowStockBody")) return;
  const rows = app.state.products
    .filter((p) => p.warehouseId === warehouseId && Number(p.qty || 0) <= 5)
    .sort((a, b) => Number(a.qty || 0) - Number(b.qty || 0));
  $("lowStockTitle").textContent = `إجمالي البضائع المنخفضة - ${warehouse.name}`;
  $("lowStockBody").innerHTML = rows.length
    ? `
      <div class="table-wrap">
        <table>
          <thead><tr><th>المنتجات</th><th>الكمية</th><th>سعر البيع</th><th>سعر التكلفة</th></tr></thead>
          <tbody>${rows.map((p) => `<tr><td>${p.name}</td><td>${p.barcode}</td><td>${p.qty}</td><td>${money(p.salePrice || 0)}</td><td>${money(p.costPrice || 0)}</td></tr>`).join("")}</tbody>
        </table>
      </div>
    `
    : `<p>لا توجد منتجات منخفضة في ${warehouse.name}.</p>`;
  show("lowStockModal");
};

window.kiroShowDebtDetails = () => {
  const customersWithDebt = app.state.customers
    .filter((c) => Number(c.debt || 0) > 0)
    .sort((a, b) => Number(b.debt || 0) - Number(a.debt || 0));
  
  const totalDebt = customersWithDebt.reduce((a, b) => a + Number(b.debt || 0), 0);
  const todayDate = new Date().toLocaleDateString("ar-EG");

  $("debtTitle").textContent = `تفاصيل مديونيات العملاء - بتاريخ: ${todayDate}`;

  $("debtBody").innerHTML = customersWithDebt.length
    ? `
      <div class="kpi-grid" style="margin-bottom: 20px;">
        <div class="kpi-card">
          <h4>إجمالي المديونيات</h4>
          <strong style="color: var(--danger);">${money(totalDebt)}</strong>
        </div>
        <div class="kpi-card">
          <h4>عدد العملاء المدينين</h4>
          <strong>${customersWithDebt.length}</strong>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>اسم العميل</th>
              <th>رقم الهاتف</th>
              <th>المديونية (ج.م)</th>
              <th>تسديد مبلغ</th>
              <th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            ${customersWithDebt.map((c) => `
              <tr>
                <td>${c.name}</td>
                <td>${c.phone || "-"}</td>
                <td style="font-weight: bold; color: var(--danger);">${money(c.debt)}</td>
                <td>
                  <input type="number" id="payInput_${c.id}" step="0.01" min="0" max="${c.debt}" placeholder="المبلغ" style="width: 100px; padding: 5px;" />
                </td>
                <td>
                  <button class="btn success" onclick="window.kiroPayDebtFromModal('${c.id}')">حفظ</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `
    : `<p style="text-align: center; padding: 20px;">لا توجد مديونيات حالية على العملاء.</p>`;
  
  show("debtModal");
};

window.kiroPayDebtFromModal = (customerId) => {
  const amount = Number($(`payInput_${customerId}`).value || 0);
  if (amount <= 0) return alert("يرجى إدخال مبلغ صحيح للسداد");

  const customer = app.state.customers.find((c) => c.id === customerId);
  if (!customer) return alert("العميل غير موجود");

  if (amount > customer.debt) {
    if (!confirm(`المبلغ المدخل (${money(amount)}) أكبر من المديونية (${money(customer.debt)}). هل تريد تسديد المديونية بالكامل فقط؟`)) return;
  }

  const finalAmount = Math.min(amount, customer.debt);
  customer.debt = Math.max(0, Number(customer.debt || 0) - finalAmount);
  
  const ledgerEntry = {
    id: id("led"),
    type: "سداد مديونية (من كشف المديونيات)",
    amount: finalAmount,
    paidAmount: finalAmount,
    remainingAmount: customer.debt,
    date: nowISO(),
    source: "debt_modal"
  };
  customer.ledger.push(ledgerEntry);

  saveState();
  kiroShowDebtDetails(); // Refresh modal
  
  if (confirm(`تم تسجيل سداد مبلغ ${money(finalAmount)} بنجاح. هل تريد طباعة الوصل؟`)) {
    window.kiroPrintLedgerItem(customer.id, ledgerEntry.id);
  }
};

function decorateReportSections() {
  const root = $("reportDetails");
  if (!root) return;
  Array.from(root.querySelectorAll(".card")).forEach((card, idx) => {
    if (!card.id) card.id = `reportSection-${idx + 1}`;
    const heading = card.querySelector("h3");
    if (!heading || card.querySelector(".report-card-head")) return;
    const head = document.createElement("div");
    head.className = "report-card-head";
    heading.parentNode.insertBefore(head, heading);
    head.appendChild(heading);
    const btn = document.createElement("button");
    btn.className = "btn secondary report-print-btn";
    btn.type = "button";
    btn.textContent = "طباعة هذا التقرير";
    btn.addEventListener("click", () => window.kiroPrintReportSection(card.id, heading.textContent.trim() || "تقرير"));
    head.appendChild(btn);
  });
}

window.kiroPrintReportSection = (sectionId, title) => {
  const section = document.getElementById(sectionId);
  if (!section) return alert("القسم غير موجود");
  const clone = section.cloneNode(true);
  clone.querySelectorAll(".report-print-btn").forEach((btn) => btn.remove());
  printHtml(clone.innerHTML, title || "تقرير");
};

function renderChart(data) {
  if (app.chart) app.chart.destroy();
  app.chart = new Chart($("monthlyChart"), { type: "bar", data: { labels: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"], datasets: [{ label: "الإيرادات الشهرية (ج.م)", data }] }, options: { responsive: true } });
}

function bindSettings() {
  $("settingsForm").addEventListener("submit", (e) => {
    e.preventDefault();
    app.state.settings.orgName = $("orgName").value.trim() || app.state.settings.orgName;
    app.state.settings.orgPhone = $("orgPhone").value.trim() || app.state.settings.orgPhone;
    app.state.settings.orgAddress = $("orgAddress").value.trim();
    app.state.settings.defaultInvoiceStyle = $("defaultInvoiceStyle").value;
    saveState();
  });
  $("logoInput").addEventListener("change", async (e) => {
    app.state.settings.logoBase64 = await toBase64(e.target.files[0]);
    saveState();
  });
  $("invoiceBgInput").addEventListener("change", async (e) => {
    app.state.settings.invoiceBgBase64 = await toBase64(e.target.files[0]);
    saveState();
  });
  if ($("chooseBackupPathBtn")) {
    $("chooseBackupPathBtn").addEventListener("click", chooseBackupDirectory);
  }
}

function bindUsersManagement() {
  if (!$("userForm")) return;
  $("userForm").addEventListener("submit", (e) => {
    e.preventDefault();
    if (getCurrentRole() !== "manager") return alert("هذه الصلاحية متاحة للمدير فقط");
    const uid = $("userId").value || id("usr");
    const username = normalizeDigits($("userUsername").value.trim());
    const password = normalizeDigits($("userPassword").value.trim());
    const role = $("userRole").value;
    if (!username || !password) return alert("أدخل اسم مستخدم وكلمة مرور");
    const duplicate = app.state.users.find((u) => u.username === username && u.id !== uid);
    if (duplicate) return alert("اسم المستخدم مستخدم بالفعل");
    const payload = { id: uid, username, password, role };
    const idx = app.state.users.findIndex((u) => u.id === uid);
    if (idx >= 0) app.state.users[idx] = payload;
    else app.state.users.push(payload);
    $("userForm").reset();
    $("userId").value = "";
    saveState();
  });
}

function renderUsersTable() {
  if (!$("usersTable")) return;
  if (getCurrentRole() !== "manager") {
    $("usersTable").innerHTML = "<tr><td colspan='3'>هذا القسم متاح للمدير فقط</td></tr>";
    return;
  }
  const roleMap = { manager: "مدير", sales: "موظف مبيعات", accountant: "محاسب" };
  $("usersTable").innerHTML =
    app.state.users
      .map(
        (u) => `<tr>
          <td>${u.username}</td>
          <td>${roleMap[u.role] || u.role}</td>
          <td>
            <button class="btn secondary" onclick="window.kiroEditUser('${u.id}')">تعديل</button>
            <button class="btn danger" onclick="window.kiroDeleteUser('${u.id}')">حذف</button>
          </td>
        </tr>`
      )
      .join("") || "<tr><td colspan='3'>لا توجد مستخدمين</td></tr>";
}

function bindSync() {
  if (db) {
    updateSyncStatus("جاري التحقق من السحابة...");
    
    // 1. Initial Pull: Get latest data once on startup
    db.ref("kero_sync").once("value", (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const localTime = Number(localStorage.getItem(STORAGE_KEY + "_updated_at") || 0);
        if (data.updatedAt > localTime) {
          if (confirm("يوجد بيانات أحدث على السحابة، هل تريد تحديث البرنامج؟")) {
             applyCloudData(data);
             updateSyncStatus("تم تحديث البيانات من السحابة.");
          } else {
             updateSyncStatus("متصل (تجاهل التحديث).");
          }
        } else {
           updateSyncStatus("البيانات المحلية هي الأحدث.");
        }
      } else {
        updateSyncStatus("السحابة فارغة، جاري رفع البيانات الحالية...");
        saveState({ syncToCloud: true });
      }
    });

    // 2. Real-time Listening: Listen for changes from other devices
    db.ref("kero_sync").on("value", (snapshot) => {
      const data = snapshot.val();
      if (data && data.deviceId !== getDeviceId()) {
        const localTime = Number(localStorage.getItem(STORAGE_KEY + "_updated_at") || 0);
        if (data.updatedAt > localTime) {
          applyCloudData(data);
          console.log("State updated from cloud.");
        }
      }
    });
  } else {
    updateSyncStatus("حالة المحلية فقط (بدون Firebase).");
  }

  if (channel) {
    channel.onmessage = (e) => {
      if (e.data?.type === "state-updated") {
        app.state = loadState();
        renderAll();
      }
    };
  }
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      app.state = loadState();
      renderAll();
    }
  });
}

function applyCloudData(data) {
  app.isSyncing = true;
  app.state = { ...defaults(), ...data.state };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(app.state));
  localStorage.setItem(STORAGE_KEY + "_updated_at", data.updatedAt.toString());
  renderAll();
  app.isSyncing = false;
}

function getCurrentRole() {
  return app.currentUser?.role || "manager";
}

function canAccessSection(role, sectionId) {
  if (role === "manager") return true;
  const salesAllowed = new Set(["dashboard", "sales", "invoices", "salesReturns", "invoiceReturns", "purchases", "fawry", "customers", "suppliers", "records", "sync"]);
  const accountantAllowed = new Set(["dashboard", "invoices", "purchases", "customers", "suppliers", "records", "reports", "sync"]);
  if (role === "sales") return salesAllowed.has(sectionId);
  if (role === "accountant") return accountantAllowed.has(sectionId);
  return false;
}

function renderCurrentUserBadge() {
  if (!$("currentUserBadge")) return;
  const roleMap = { manager: "مدير", sales: "موظف مبيعات", accountant: "محاسب" };
  const username = app.currentUser?.username || "-";
  const role = roleMap[app.currentUser?.role] || app.currentUser?.role || "-";
  $("currentUserBadge").textContent = `${username} • ${role}`;
}

function renderLoginLogo() {
  if (!$("loginLogo")) return;
  const logo = app.state.settings.logoBase64 || "";
  if (logo) {
    $("loginLogo").src = logo;
    $("loginLogo").classList.remove("hidden");
    if ($("sidebarLogo")) {
      $("sidebarLogo").src = logo;
      $("sidebarLogo").classList.remove("hidden");
    }
  } else {
    $("loginLogo").removeAttribute("src");
    $("loginLogo").classList.add("hidden");
    if ($("sidebarLogo")) {
      $("sidebarLogo").removeAttribute("src");
      $("sidebarLogo").classList.add("hidden");
    }
  }
}

function renderBuildStamp() {
  if (!$("appFooter")) return;
  const org = app.state.settings.orgName || "كيرو للصحية";
  $("appFooter").textContent = `© جميع الحقوق محفوظة لـ كيرو تك للبرمجيات 2026`;
}

function renderAll() {
  const orgName = app.state.settings.orgName || "نظام كيرو للأدوات الصحية";
  document.title = orgName;
  $("sidebarOrgName").textContent = orgName;
  if ($("loginOrgName")) $("loginOrgName").textContent = orgName;
  $("sidebarOrgPhone").textContent = app.state.settings.orgPhone || "-";
  renderLoginLogo();
  renderBuildStamp();
  renderKpis();
  renderSelectors();
  renderInventory();
  renderCustomers();
  renderSuppliers();
  renderWarehouses();
  renderRecords();
  renderSettings();
  renderUsersTable();
  renderCurrentUserBadge();
  ["sales", "invoices", "salesReturns", "invoiceReturns", "fawry"].forEach(renderTemp);
}

function renderKpis() {
  if (!$("kpiGrid")) return;
  const searchDateRaw = ($("dashboardSearchDate")?.value || "").trim();
  
  // Convert dd/mm/yyyy back to yyyy-mm-dd for internal logic
  let searchDate = "";
  if (searchDateRaw) {
    if (searchDateRaw.includes("/")) {
      const parts = searchDateRaw.split("/");
      if (parts.length === 3) {
        // Assume dd/mm/yyyy
        searchDate = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
      }
    } else if (searchDateRaw.includes("-")) {
      searchDate = searchDateRaw; // Already ISO
    }
  }

  const today = searchDate || new Date().toISOString().slice(0, 10);
  const now = new Date(today);
  const curM = now.getMonth();
  const curY = now.getFullYear();

  const products = app.state.products.length;
  
  // Calculate historical stock value if searching a past date
  let stockValue = 0;
  const realToday = new Date().toISOString().slice(0, 10);
  if (searchDate && searchDate < realToday) {
    // Clone products to reverse-calculate quantities
    const historical = app.state.products.map(p => ({ ...p }));
    const reverse = (entries, sign) => {
      (entries || []).forEach(e => {
        if (e.date && e.date.split('T')[0] > searchDate) {
          (e.items || []).forEach(it => {
            const p = historical.find(x => x.id === it.productId);
            if (p) p.qty += (it.qty * sign);
          });
        }
      });
    };
    reverse(app.state.sales, 1);
    reverse(app.state.invoices, 1);
    reverse(app.state.archivedInvoices, 1);
    reverse(app.state.fawrySales, 1);
    reverse(app.state.purchases, -1);
    reverse(app.state.salesReturns, -1);
    reverse(app.state.invoiceReturns, -1);
    stockValue = historical.reduce((a, p) => a + (p.qty * p.costPrice), 0);
  } else {
    stockValue = app.state.products.reduce((a, p) => a + p.qty * p.costPrice, 0);
  }

  const role = getCurrentRole();
  const canViewCommercial = role !== "sales";

  const ds = app.state.sales.filter((x) => x.date.startsWith(today)).reduce((a, b) => a + (b.total || 0), 0);
  const di = app.state.invoices.filter((x) => x.date.startsWith(today)).reduce((a, b) => a + (b.total || 0), 0);
  const dp = app.state.purchases.filter((x) => x.date.startsWith(today)).reduce((a, b) => a + (b.total || 0), 0);
  const df = app.state.fawrySales.filter((x) => x.date.startsWith(today)).reduce((a, b) => a + (b.total || 0), 0);
  const returnsToday = [...app.state.salesReturns, ...app.state.invoiceReturns].filter((x) => x.date.startsWith(today)).reduce((a, b) => a + (b.total || 0), 0);
  const totalSalesToday = ds + di + df - returnsToday;

  const debt = app.state.customers.reduce((a, c) => a + (c.debt || 0), 0);
  const supplierDebt = app.state.suppliers.reduce((a, s) => a + (s.debt || 0), 0);
  
  const allSalesForTop = [...app.state.sales, ...app.state.invoices, ...app.state.fawrySales]
    .filter(x => x.date.startsWith(today));
  const topSelling = buildTopProducts(allSalesForTop).slice(0, 8);
  
  const dailyProfit = calcProfitTotal((dt) => String(dt || "").startsWith(today), { includeDiscount: false });
  const dailyProfitAfterDiscount = calcProfitTotal((dt) => String(dt || "").startsWith(today), { includeDiscount: true });
  const dailyProfitDiscount = dailyProfit - dailyProfitAfterDiscount;
  
  // Use today for monthly/yearly context as well if searching
  const monthlyProfit = calcProfitTotal((dt) => {
    const d = new Date(dt);
    return d.getFullYear() === curY && d.getMonth() === curM;
  }, { includeDiscount: false });
  const monthlyProfitAfterDiscount = calcProfitTotal((dt) => {
    const d = new Date(dt);
    return d.getFullYear() === curY && d.getMonth() === curM;
  }, { includeDiscount: true });
  const monthlyProfitDiscount = monthlyProfit - monthlyProfitAfterDiscount;
  
  const yearlyProfit = calcProfitTotal((dt) => {
    const d = new Date(dt);
    return d.getFullYear() === curY;
  }, { includeDiscount: false });
  const yearlyProfitAfterDiscount = calcProfitTotal((dt) => {
    const d = new Date(dt);
    return d.getFullYear() === curY;
  }, { includeDiscount: true });
  const yearlyProfitDiscount = yearlyProfit - yearlyProfitAfterDiscount;
  
  const totalProfitAllTime = calcProfitTotal(() => true, { includeDiscount: false });
  const totalProfitAllTimeAfterDiscount = calcProfitTotal(() => true, { includeDiscount: true });
  const totalProfitAllTimeDiscount = totalProfitAllTime - totalProfitAllTimeAfterDiscount;

  const byWarehouse = (app.state.warehouses || []).map((w) => {
    const rows = app.state.products.filter((p) => p.warehouseId === w.id);
    const itemCount = rows.length;
    const lowProducts = rows.filter((p) => Number(p.qty || 0) <= 5);
    const lowCount = lowProducts.length;
    const commercialValue = rows.reduce((a, p) => a + Number(p.qty || 0) * Number(p.costPrice || 0), 0);
    return { id: w.id, name: w.name, itemCount, lowCount, lowProducts, commercialValue };
  });

  const warehouseCards = byWarehouse
    .map((w) => `<div class="kpi-card"><h4>عدد الأصناف - ${w.name}</h4><strong>${w.itemCount}</strong></div>`)
    .join("");

  const warehouseCommercialCards = canViewCommercial
    ? byWarehouse.map((w) => `<div class="kpi-card"><h4>القيمة التجارية - ${w.name}</h4><strong>${money(w.commercialValue)}</strong></div>`).join("")
    : "";

  const lowStockCards = byWarehouse
    .filter((w) => w.lowCount > 0)
    .map(
      (w) => `<button type="button" class="kpi-card low-stock-card-btn" onclick="window.kiroShowLowStock('${w.id}')">
        <h4>منخفض المخزون (≤ 5) - ${w.name}</h4>
        <strong>${w.lowCount}</strong>
        <small>اضغط لعرض التفاصيل</small>
      </button>`
    )
    .join("");

  const labelPrefix = searchDate ? `ليوم ${fmtDate(searchDate)}` : "اليوم";
  const stockLabel = searchDate && searchDate < realToday ? `قيمة المخزون (في ${fmtDate(searchDate)})` : "قيمة المخزون التجارية";

  $("kpiGrid").innerHTML = `
    <div class="kpi-card"><h4>عدد المنتجات</h4><strong>${products}</strong></div>
    ${canViewCommercial ? `<div class="kpi-card"><h4>${stockLabel}</h4><strong>${money(stockValue)}</strong></div>` : ""}
    <div class="kpi-card"><h4>مبيعات ${labelPrefix}</h4><strong>${money(totalSalesToday)}</strong></div>
    <div class="kpi-card"><h4>مشتريات ${labelPrefix}</h4><strong>${money(dp)}</strong></div>
    <button type="button" class="kpi-card profit-card-btn" onclick="window.kiroShowDebtDetails()">
      <h4>إجمالي مديونيات العملاء</h4>
      <strong>${money(debt)}</strong>
      <small>اضغط لعرض التفاصيل والطباعة</small>
    </button>
    <div class="kpi-card"><h4>إجمالي مديونيات الموردين</h4><strong>${money(supplierDebt)}</strong></div>
    <button type="button" class="kpi-card profit-card-btn" onclick="window.kiroShowProfitDetails('day', '${today}')">
      <h4>مكسب ${labelPrefix}</h4>
      <strong>${money(dailyProfitAfterDiscount)}</strong>
      <small>قيمة الخصم: ${money(dailyProfitDiscount)}</small>
      <small>قبل الخصم: ${money(dailyProfit)}</small>
      <small>اضغط لعرض الفواتير/العمليات</small>
    </button>
    <button type="button" class="kpi-card profit-card-btn" onclick="window.kiroShowProfitDetails('month', '${today}')">
      <h4>مكسب الشهر (${searchDate ? curM + 1 + '/' + curY : 'الحالي'})</h4>
      <strong>${money(monthlyProfitAfterDiscount)}</strong>
      <small>قيمة الخصم: ${money(monthlyProfitDiscount)}</small>
      <small>قبل الخصم: ${money(monthlyProfit)}</small>
      <small>اضغط لعرض الفواتير/العمليات</small>
    </button>
    <button type="button" class="kpi-card profit-card-btn" onclick="window.kiroShowProfitDetails('year', '${today}')">
      <h4>مكسب السنة (${curY})</h4>
      <strong>${money(yearlyProfitAfterDiscount)}</strong>
      <small>قيمة الخصم: ${money(yearlyProfitDiscount)}</small>
      <small>قبل الخصم: ${money(yearlyProfit)}</small>
      <small>اضغط لعرض الفواتير/العمليات</small>
    </button>
    <button type="button" class="kpi-card profit-card-btn" onclick="window.kiroShowProfitDetails('all')">
      <h4>إجمالي الأرباح (منذ البداية)</h4>
      <strong>${money(totalProfitAllTimeAfterDiscount)}</strong>
      <small>قيمة الخصم: ${money(totalProfitAllTimeDiscount)}</small>
      <small>قبل الخصم: ${money(totalProfitAllTime)}</small>
      <small>اضغط لعرض كافة العمليات</small>
    </button>
    ${warehouseCards}
    ${warehouseCommercialCards}
    ${lowStockCards}
    <div class="kpi-card">
      <h4>أكثر المنتجات مبيعًا</h4>
      <ul class="tag-list">
        ${
          topSelling.length
            ? topSelling.map((p) => `<li>${p.name} (${p.qty})</li>`).join("")
            : "<li>لا توجد مبيعات كافية</li>"
        }
      </ul>
    </div>
  `;
}

function renderSelectors() {
  const oldFrom = $("transferFrom")?.value;
  const oldTo = $("transferTo")?.value;

  const wh = app.state.warehouses.map((w) => `<option value="${w.id}">${w.name}</option>`).join("");
  $("productWarehouse").innerHTML = wh;
  $("quickProductWarehouse").innerHTML = wh;
  $("transferFrom").innerHTML = wh;
  $("transferTo").innerHTML = wh;

  if (oldFrom) $("transferFrom").value = oldFrom;
  if (oldTo) $("transferTo").value = oldTo;

  ["sales", "invoices", "salesReturns", "invoiceReturns", "fawry", "purchases"].forEach((s) => {
    const select = $(`${s}Warehouse`);
    if (select) select.innerHTML = wh;
  });
  $("productWarehouse").value = app.inventoryViewWarehouseId || getShowroomWarehouseId();
  renderTransferProducts();
  if ($("debtCustomerHints")) {
    $("debtCustomerHints").innerHTML = app.state.customers
      .map((c) => `<option value="${c.name}"></option><option value="${c.phone || ""}"></option>`)
      .join("");
  }
  ["sales", "invoices", "salesReturns", "invoiceReturns", "fawry", "purchases", "supplierPayment"].forEach((sectionId) => {
    const list = $(sectionId === "supplierPayment" ? "suppliersListForPayment" : `${sectionId}CustomersList`);
    const cfg = app.txConfigs[sectionId];
    if (list) {
      const pool = (cfg?.isPurchase || sectionId === "supplierPayment") ? app.state.suppliers : app.state.customers;
      list.innerHTML = pool
        .map((c) => `<option value="${c.name}"></option><option value="${c.phone || ""}"></option>`)
        .join("");
    }
  });
  renderProductHints();
}

function renderProductHints() {
  ["sales", "invoices", "salesReturns", "invoiceReturns", "fawry"].forEach((sectionId) => {
    updateProductHintsForSection(sectionId, $(`${sectionId}Barcode`)?.value || "");
    const warehouseSelect = $(`${sectionId}Warehouse`);
    if (warehouseSelect && !warehouseSelect.dataset.hintsBound) {
      warehouseSelect.addEventListener("change", renderProductHints);
      warehouseSelect.dataset.hintsBound = "1";
    }
  });
}

function updateNamedProductHints(listId, rawQuery) {
  const list = $(listId);
  if (!list) return;
  const query = normalizeHintText(rawQuery);
  let ranked;
  if (query) {
    const prefixMatches = app.state.products
      .filter((p) => productStartsWithQuery(query, p))
      .sort((a, b) => scoreProductForHint(query, b) - scoreProductForHint(query, a) || Number(b.qty || 0) - Number(a.qty || 0))
      .slice(0, 25);
    const otherMatches = app.state.products
      .filter((p) => !productStartsWithQuery(query, p) && scoreProductForHint(query, p) > 0)
      .sort((a, b) => scoreProductForHint(query, b) - scoreProductForHint(query, a) || Number(b.qty || 0) - Number(a.qty || 0))
      .slice(0, 25 - prefixMatches.length);
    ranked = [...prefixMatches, ...otherMatches];
  } else {
    ranked = app.state.products.slice(0, 30);
  }
  list.innerHTML = ranked
    .map((p) => `<option value="${p.name}" label="الكمية: ${p.qty} | الباركود: ${p.barcode}"></option>`)
    .join("");
}

function bindSmartSuggestInput(inputId, getProducts, onPick) {
  if (!ENABLE_SMART_SUGGEST) return;
  const input = $(inputId);
  if (!input || input.dataset.smartBound === "1") return;
  input.dataset.smartBound = "1";
  const panel = document.createElement("div");
  panel.className = "smart-suggest hidden";
  document.body.appendChild(panel);
  smartSuggestPanels[inputId] = panel;

  const position = () => {
    const r = input.getBoundingClientRect();
    panel.style.left = `${r.left}px`;
    panel.style.top = `${r.bottom + 4}px`;
    panel.style.width = `${r.width}px`;
  };
  const close = () => {
    panel.classList.add("hidden");
    panel.innerHTML = "";
  };
  const render = () => {
    const q = input.value.trim();
    if (!q) return close();
    const products = getProducts() || [];
    
    const ranked = products
      .map((p) => ({ p, score: scoreProductForHint(q, p) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || Number(b.p.qty || 0) - Number(a.p.qty || 0))
      .slice(0, 15)
      .map((item) => item.p);

    if (!ranked.length) return close();
    panel.innerHTML = ranked
      .map((p) => `<button type="button" class="smart-suggest-item" data-name="${escapeHtmlAttr(p.name)}"><span>${p.name}</span><small>الكمية: ${p.qty} | الباركود: ${p.barcode}</small></button>`)
      .join("");
    position();
    panel.classList.remove("hidden");
  };

  input.addEventListener("input", render);
  input.addEventListener("focus", render);
  input.addEventListener("blur", () => setTimeout(close, 120));
  panel.addEventListener("mousedown", (e) => e.preventDefault());
  panel.addEventListener("click", (e) => {
    const btn = e.target.closest(".smart-suggest-item");
    if (!btn) return;
    input.value = btn.dataset.name || "";
    if (typeof onPick === "function") {
      const picked = (getProducts() || []).find((p) => p.name === input.value);
      if (picked) onPick(picked);
    }
    close();
  });
  window.addEventListener("resize", () => {
    if (!panel.classList.contains("hidden")) position();
  });
  window.addEventListener("scroll", () => {
    if (!panel.classList.contains("hidden")) position();
  });
}

function escapeHtmlAttr(v) {
  return String(v || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function updateProductHintsForSection(sectionId, rawQuery) {
  const list = $(`${sectionId}ProductHints`);
  if (!list) return;
  const wh = sectionId === "fawry" ? "" : $(`${sectionId}Warehouse`)?.value || app.state.warehouses[0]?.id;
  const candidates = app.state.products.filter((p) => !wh || p.warehouseId === wh);
  const q = rawQuery.trim();

  let ranked;
  if (!q) {
    ranked = candidates.slice(0, 30);
  } else {
    ranked = candidates
      .map((p) => ({ p, score: scoreProductForHint(q, p) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || Number(b.p.qty || 0) - Number(a.p.qty || 0))
      .slice(0, 30)
      .map((item) => item.p);
  }

  list.innerHTML = ranked
    .map((p) => `<option value="${p.name}" label="الكمية: ${p.qty} | الباركود: ${p.barcode}"></option>`)
    .join("");
}

function normalizeDigits(value) {
  const hindi = [/٠/g, /١/g, /٢/g, /٣/g, /٤/g, /٥/g, /٦/g, /٧/g, /٨/g, /٩/g];
  let s = String(value || "");
  for (let i = 0; i < 10; i++) {
    s = s.replace(hindi[i], i);
  }
  return s;
}

function normalizeHintText(v) {
  if (!v) return "";
  return normalizeDigits(String(v).toLowerCase())
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^a-z0-9\u0600-\u06ff\s\-\/\.]/g, "") // Keep alphanumeric, arabic, space, and some symbols
    .replace(/\s+/g, " ") // Collapse multiple spaces to one
    .trim();
}

function scoreProductForHint(query, product) {
  const q = normalizeHintText(query);
  if (!q) return 0;
  
  const name = normalizeHintText(product.name || "");
  const barcode = normalizeHintText(product.barcode || "");

  // Priority 1: Exact matches
  if (barcode === q) return 1000;
  if (name === q) return 950;

  // Priority 2: Starts with
  if (barcode.startsWith(q)) return 900;
  if (name.startsWith(q)) return 850;

  // Priority 3: Contains
  if (name.includes(q)) return 700;
  if (barcode.includes(q)) return 650;

  return 0;
}

function productStartsWithQuery(query, product) {
  const q = normalizeHintText(query);
  if (!q) return false;
  const name = normalizeHintText(product.name || "");
  const barcode = normalizeHintText(product.barcode || "");
  return name.startsWith(q) || barcode.startsWith(q);
}

// Remove softenArabic as it's too fuzzy
function isSubsequence(a, b) {
  let i = 0;
  for (let j = 0; j < b.length && i < a.length; j += 1) if (a[i] === b[j]) i += 1;
  return i === a.length;
}

function renderTransferProducts() {
  const from = $("transferFrom").value || app.state.warehouses[0]?.id;
  const list = $("transferProductHints");
  if (!list) return;

  const candidates = app.state.products.filter((p) => p.warehouseId === from);
  const q = $("transferProductSearch").value.trim();

  let ranked;
  if (!q) {
    ranked = candidates.slice(0, 30);
  } else {
    ranked = candidates
      .map((p) => ({ p, score: scoreProductForHint(q, p) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || Number(b.p.qty || 0) - Number(a.p.qty || 0))
      .slice(0, 30)
      .map((item) => item.p);
  }

  list.innerHTML = ranked
    .map((p) => `<option value="${p.name}" label="الكمية: ${p.qty} | الباركود: ${p.barcode}"></option>`)
    .join("");
}

function renderSettings() {
  $("orgName").value = app.state.settings.orgName || "";
  $("orgPhone").value = app.state.settings.orgPhone || "";
  $("orgAddress").value = app.state.settings.orgAddress || "";
  $("defaultInvoiceStyle").value = app.state.settings.defaultInvoiceStyle || "classic";
  if ($("backupPathDisplay")) {
    $("backupPathDisplay").value = app.state.settings.backupDirName || "مسار نسخة الاحتياطي غير محدد";
  }
}

function setupModals() {
  $("closeBarcodeModal").addEventListener("click", () => hide("barcodeModal"));
  $("printBarcodeBtn").addEventListener("click", () => {
    const qty = Number($("barcodePrintQty").value || 1);
    const content = $("barcodePrintArea").innerHTML;
    let finalHtml = "";
    for (let i = 0; i < qty; i++) {
      finalHtml += `<div style="display: inline-block; padding: 10px; border: 1px dashed #ccc; margin: 5px; text-align: center;">${content}</div>`;
    }
    printHtml(finalHtml, "طباعة باركود", { includeOrgHeader: false });
  });
  $("closeQuickAdd").addEventListener("click", () => hide("quickAddModal"));
  $("closeRecordDetails").addEventListener("click", () => {
    hide("recordDetailsModal");
    hide("printRecordDetails");
  });
  $("printRecordDetails").addEventListener("click", () => {
    const html = $("recordDetailsBody").innerHTML;
    const title = $("recordDetailsTitle").textContent;
    printHtml(html, title);
  });
  if ($("closeLowStockModal")) $("closeLowStockModal").addEventListener("click", () => hide("lowStockModal"));
  if ($("closeProfitModal")) $("closeProfitModal").addEventListener("click", () => hide("profitModal"));
  if ($("closeDebtModal")) $("closeDebtModal").addEventListener("click", () => hide("debtModal"));
  if ($("printDebtBtn")) {
    $("printDebtBtn").addEventListener("click", () => {
      const html = $("debtBody").innerHTML;
      printHtml(html, "كشف مديونيات العملاء");
    });
  }
  $("idleStay").addEventListener("click", () => {
    hide("idleModal");
    restartIdle();
  });
  $("idleLogoutNow").addEventListener("click", forceLogout);
  $("closeScannerBtn").addEventListener("click", closeScanner);

  $("closeEditProductModal").addEventListener("click", () => hide("editProductModal"));
  $("editProductForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const pid = $("editProductId").value;
    const p = app.state.products.find((x) => x.id === pid);
    if (!p) return;

    p.name = $("editProductName").value.trim();
    p.barcode = $("editProductBarcode").value.trim();
    p.qty = Number($("editProductQty").value || 0);
    p.salePrice = Number($("editProductSalePrice").value || 0);
    p.shopPrice = Number($("editProductShopPrice").value || 0);
    p.costPrice = Number($("editProductCostPrice").value || 0);
    p.warehouseId = $("editProductWarehouse").value;

    saveState();
    hide("editProductModal");
    renderInventory();
    renderKpis();
    alert("تم تحديث بيانات المنتج بنجاح");
  });
}

function setupIdle() {
  ["mousemove", "keydown", "click", "touchstart", "scroll"].forEach((ev) => window.addEventListener(ev, restartIdle, { passive: true }));
  restartIdle();
}

function restartIdle() {
  clearTimeout(app.idle.warn);
  clearTimeout(app.idle.logout);
  clearInterval(app.idle.tick);
  hide("idleModal");
  app.idle.warn = setTimeout(showIdleWarning, IDLE_WARNING_AFTER_MS);
}

function showIdleWarning() {
  app.idle.remaining = IDLE_COUNTDOWN_SECONDS;
  $("idleCountdown").textContent = String(IDLE_COUNTDOWN_SECONDS);
  show("idleModal");
  app.idle.tick = setInterval(() => {
    app.idle.remaining -= 1;
    $("idleCountdown").textContent = String(app.idle.remaining);
    if (app.idle.remaining <= 0) {
      clearInterval(app.idle.tick);
      forceLogout();
    }
  }, 1000);
  app.idle.logout = setTimeout(forceLogout, IDLE_COUNTDOWN_SECONDS * 1000);
}

async function openScanner(sectionId) {
  app.scanner.sectionId = sectionId;
  $("scannerTitle").textContent = "قراءة الباركود بالكاميرا";
  $("scannerStatus").textContent = "جاري طلب إذن الكاميرا...";
  show("scannerModal");

  stopScannerStream();
  app.scanner.detector = null;

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    $("scannerStatus").textContent = "هذا الإصدار لا يدعم الكاميرا داخل التطبيق.";
    alert("لا يمكن تشغيل الكاميرا في هذا الإصدار. يلزم APK يدعم WebView Camera API.");
    return;
  }

  try {
    app.scanner.stream = await requestCameraStream();
    const video = $("scannerVideo");
    video.srcObject = app.scanner.stream;
    await video.play();
  } catch (err) {
    const message = explainCameraError(err);
    $("scannerStatus").textContent = message;
    if (String(err?.name || "") === "NotAllowedError" || String(err?.name || "") === "SecurityError") {
      alert("تم رفض إذن الكاميرا. افتح إعدادات الهاتف > التطبيقات > التطبيق > الأذونات > الكاميرا ثم اختر سماح.");
    }
    return;
  }

  if (!("BarcodeDetector" in window)) {
    $("scannerStatus").textContent = "تم فتح الكاميرا لكن القراءة التلقائية غير مدعومة على هذا الجهاز.";
    return;
  }

  app.scanner.detector = new BarcodeDetector({
    formats: ["code_128", "ean_13", "ean_8", "upc_a", "upc_e", "qr_code"],
  });
  $("scannerStatus").textContent = "الكاميرا جاهزة. وجّهها نحو الباركود.";
  scanLoop();
}

async function requestCameraStream() {
  const constraintsList = [
    { video: { facingMode: { ideal: "environment" } }, audio: false },
    { video: { facingMode: "environment" }, audio: false },
    { video: true, audio: false },
  ];
  let lastError = null;
  for (const constraints of constraintsList) {
    try {
      // This call triggers permission dialog automatically when needed.
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("camera-unavailable");
}

function explainCameraError(err) {
  const name = String(err?.name || "");
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "إذن الكاميرا مرفوض. افتح صلاحية الكاميرا للتطبيق ثم أعد المحاولة.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "لم يتم العثور على كاميرا متاحة.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "الكاميرا قيد الاستخدام من تطبيق آخر. أغلقه وحاول مرة أخرى.";
  }
  if (name === "TypeError") {
    return "نظام الـAPK الحالي لا يدعم تشغيل الكاميرا.";
  }
  return "تعذر تشغيل الكاميرا. تأكد من الإذن وأعد المحاولة.";
}

function scanLoop() {
  const video = $("scannerVideo");
  if (!app.scanner.detector || !video || video.readyState < 2) {
    app.scanner.raf = requestAnimationFrame(scanLoop);
    return;
  }

  app.scanner.detector
    .detect(video)
    .then((codes) => {
      const now = Date.now();
      if (codes?.length && now - app.scanner.lastScanAt > 900) {
        const value = String(codes[0].rawValue || "").trim();
        if (value && app.scanner.sectionId === "inventory" && $("inventorySearch")) {
          $("inventorySearch").value = value;
          app.scanner.lastScanAt = now;
          $("scannerStatus").textContent = `تم قراءة: ${value}`;
          renderInventory();
          closeScanner();
          return;
        }
        if (value && app.scanner.sectionId && $(`${app.scanner.sectionId}Barcode`)) {
          $(`${app.scanner.sectionId}Barcode`).value = value;
          app.scanner.lastScanAt = now;
          $("scannerStatus").textContent = `تم قراءة: ${value}`;
          closeScanner();
          return;
        }
      }
      app.scanner.raf = requestAnimationFrame(scanLoop);
    })
    .catch(() => {
      app.scanner.raf = requestAnimationFrame(scanLoop);
    });
}

function closeScanner() {
  if (app.scanner.raf) cancelAnimationFrame(app.scanner.raf);
  app.scanner.raf = null;
  stopScannerStream();
  const video = $("scannerVideo");
  if (video) video.srcObject = null;
  app.scanner.detector = null;
  app.scanner.sectionId = null;
  hide("scannerModal");
}

function stopScannerStream() {
  if (!app.scanner.stream) return;
  app.scanner.stream.getTracks().forEach((t) => t.stop());
  app.scanner.stream = null;
}

async function exportJson() {
  const stamp = new Date().toISOString().replace(/[:]/g, "-").replace("T", "_").slice(0, 19);
  const fileName = `kiro_backup_${stamp}.json`;
  const data = JSON.stringify(app.state, null, 2);

  const pickerResult = await saveBackupWithFilePicker(fileName, data);
  if (pickerResult.ok) {
    alert(`تم حفظ النسخة الاحتياطية بنجاح: ${pickerResult.savedName}`);
    return;
  }

  const dirResult = await saveBackupToSelectedDirectory(fileName, data);
  if (dirResult.ok) {
    alert(`تم حفظ نسخة احتياطية داخل: ${dirResult.location}`);
    return;
  }

  const shareResult = await shareBackupFile(fileName, data);
  if (shareResult.ok) {
    alert("تم فتح نافذة المشاركة. اختر التطبيق أو المكان الذي تريد حفظ النسخة الاحتياطية فيه.");
    return;
  }

  const fallbackDownloaded = triggerBackupDownload(fileName, data);
  if (!fallbackDownloaded) {
    alert("تعذر إنشاء النسخة الاحتياطية على هذا الجهاز. هذا الإصدار لا يدعم اختيار مكان الحفظ مباشرة.");
    return;
  }
  alert("تمت محاولة تنزيل النسخة الاحتياطية. إذا لم يظهر الملف، فهذا الإصدار من APK لا يدعم حفظ الملفات بشكل مباشر.");
}

async function chooseBackupDirectory() {
  if (typeof window.showDirectoryPicker === "function") {
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      app.backupDirHandle = handle;
      app.state.settings.backupDirName = handle?.name || "";
      saveState();
      alert(`تم تحديد مسار نسخة الاحتياطية: ${app.state.settings.backupDirName}`);
    } catch {
      // User cancelled folder picker.
    }
    return;
  }

  if (typeof window.showSaveFilePicker === "function") {
    app.state.settings.backupDirName = "اختيار مكان الحفظ عند كل تصدير";
    saveState();
    alert("هذا الجهاز لا يدعم اختيار مجلد دائم. سيتم فتح نافذة اختيار مكان الحفظ عند كل نسخة احتياطية.");
    return;
  }

  alert("هذا الجهاز لا يدعم تحديد مسار حفظ مباشر. يمكنك استخدام زر التصدير ثم المشاركة لحفظ النسخة الاحتياطية.");
}

async function saveBackupToSelectedDirectory(fileName, data) {
  if (!(app.backupDirHandle && typeof app.backupDirHandle.getFileHandle === "function")) {
    return { ok: false, reason: "no-handle" };
  }
  try {
    if (typeof app.backupDirHandle.requestPermission === "function") {
      const permission = await app.backupDirHandle.requestPermission({ mode: "readwrite" });
      if (permission !== "granted") return { ok: false, reason: "permission-denied" };
    }
    const fileHandle = await app.backupDirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
    return { ok: true, location: app.state.settings.backupDirName || "المسار المحدد" };
  } catch {
    app.backupDirHandle = null;
    return { ok: false, reason: "write-failed" };
  }
}

async function saveBackupWithFilePicker(fileName, data) {
  if (typeof window.showSaveFilePicker !== "function") {
    return { ok: false, reason: "not-supported" };
  }
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: fileName,
      types: [{ description: "Backup JSON", accept: { "application/json": [".json"] } }],
      excludeAcceptAllOption: false,
    });
    const writable = await handle.createWritable();
    await writable.write(data);
    await writable.close();
    app.state.settings.backupDirName = `ملف: ${handle?.name || fileName}`;
    saveState();
    return { ok: true, savedName: handle?.name || fileName };
  } catch (err) {
    if (err && err.name === "AbortError") return { ok: false, reason: "cancelled" };
    return { ok: false, reason: "failed" };
  }
}

async function shareBackupFile(fileName, data) {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function" || typeof File !== "function") {
    return { ok: false, reason: "not-supported" };
  }
  try {
    const file = new File([data], fileName, { type: "application/json" });
    if (typeof navigator.canShare === "function" && !navigator.canShare({ files: [file] })) {
      return { ok: false, reason: "files-not-supported" };
    }
    await navigator.share({
      title: "نسخة احتياطية",
      text: "ملف النسخة الاحتياطية لنظام كيرو",
      files: [file],
    });
    return { ok: true };
  } catch (err) {
    if (err && err.name === "AbortError") return { ok: false, reason: "cancelled" };
    return { ok: false, reason: "failed" };
  }
}

function triggerBackupDownload(fileName, data) {
  try {
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return true;
  } catch {
    return false;
  }
}

function importJson(e) {
  const f = e.target.files?.[0];
  if (!f) return;
  
  // Safety Backup: Save current state to a special key before overwriting
  const currentState = localStorage.getItem(STORAGE_KEY);
  if (currentState) {
    localStorage.setItem(STORAGE_KEY + "_safety_backup", currentState);
  }

  const r = new FileReader();
  r.onload = () => {
    try {
      const newData = JSON.parse(r.result);
      if (!newData || typeof newData !== "object") throw new Error();
      
      if (!confirm("تحذير: الاستيراد سيقوم باستبدال كافة البيانات الحالية. هل أنت متأكد؟ (تم حفظ نسخة احتياطية تلقائية من بياناتك الحالية يمكنك استعادتها إذا حدث خطأ)")) {
        return;
      }

      app.state = { ...defaults(), ...newData };
      saveState();
      alert("تم الاستيراد بنجاح");
    } catch {
      alert("ملف غير صالح");
    }
  };
  r.readAsText(f);
}

window.kiroRestoreSafetyBackup = () => {
  const backup = localStorage.getItem(STORAGE_KEY + "_safety_backup");
  if (!backup) return alert("لا توجد نسخة احتياطية سابقة لاستعادتها.");
  
  if (confirm("هل تريد استعادة البيانات التي كانت موجودة قبل آخر عملية استيراد؟")) {
    try {
      app.state = { ...defaults(), ...JSON.parse(backup) };
      saveState();
      alert("تم استعادة البيانات السابقة بنجاح.");
    } catch {
      alert("حدث خطأ أثناء محاولة الاستعادة.");
    }
  }
};

function printSection(sectionId, title) {
  let items = app.temp[sectionId] || [];
  let sub = items.reduce((a, b) => a + b.qty * b.price, 0);
  let dType = $(`${sectionId}DiscountType`)?.value || "none";
  let dVal = Number($(`${sectionId}DiscountValue`)?.value || 0);
  let after = discount(sub, dType, dVal);
  let paid = Number($(`${sectionId}PaidAmount`)?.value || 0);
  let remaining = Math.max(0, after - paid);
  let status = $(`${sectionId}PaymentStatus`)?.value || "-";

  // If cart is empty, print the latest saved transaction for this section.
  if (!items.length) {
    const target = sectionStoreKey(sectionId);
    const last = (app.state[target] || [])[app.state[target].length - 1];
    if (last) {
      items = last.items || [];
      sub = Number(last.subtotal || 0);
      dType = last.discountType || "none";
      dVal = Number(last.discountValue || 0);
      after = Number(last.total || 0);
      paid = Number(last.paidAmount || 0);
      remaining = Number(last.remainingAmount || 0);
      status = last.paymentStatus || "-";
    } else {
      return alert("لا توجد معاملات للطباعة.");
    }
  }

  const entryToPrint = {
    id: id("prt_tx"),
    date: nowISO(),
    items,
    subtotal: sub,
    discountType: dType,
    discountValue: dVal,
    total: after,
    paidAmount: paid,
    remainingAmount: remaining,
    paymentStatus: status,
    customerName: "عميل",
  };
  const html = buildTransactionPrintHtml(entryToPrint, title);
  app.state.printLogs.push({ id: id("prt"), title, sectionId, date: nowISO() });
  saveState();
  printHtml(html, title, { includeOrgHeader: false });
}

function printRecord(type, rid) {
  const entry = (app.state[type] || []).find((x) => x.id === rid);
  if (!entry) return alert("العملية غير موجودة");
  const titleMap = {
    sales: "مبيعات نقدية",
    invoices: "فاتورة",
    archivedInvoices: "أرشيف فاتورة",
    salesReturns: "مرتجع مبيعات",
    invoiceReturns: "مرتجع فاتورة",
    fawrySales: "مبيعات فوري",
  };
  const title = titleMap[type] || "عملية";
  const html = buildTransactionPrintHtml(entry, title);
  app.state.printLogs.push({ id: id("prt"), title: `سجل ${title}`, sectionId: type, date: nowISO() });
  saveState();
  printHtml(html, title, { includeOrgHeader: false });
}

function buildTransactionPrintHtml(entry, title) {
  const headerHtml = getPrintHeaderHtml();
  const items = entry.items || [];
  const sub = Number(entry.subtotal || 0);
  const dType = entry.discountType || "none";
  const dVal = Number(entry.discountValue || 0);
  const total = Number(entry.total || 0);
  const paid = Number(entry.paidAmount || 0);
  const remaining = Number(entry.remainingAmount || 0);
  const status = entry.paymentStatus || "-";
  const dLabel = dType === "percent" ? `${dVal}%` : dType === "fixed" ? money(dVal) : "بدون";
  const invoiceLine = entry.invoiceNumber
    ? `<p><strong>رقم الفاتورة:</strong> ${entry.invoiceNumber}</p>`
    : entry.salesNumber
    ? `<p><strong>رقم عملية المبيعات:</strong> ${entry.salesNumber}</p>`
    : "";
  const rows = items.map((i) => `<tr><td>${i.productName}</td><td>${i.qty}</td><td>${money(i.price)}</td><td>${money(i.qty * i.price)}</td></tr>`).join("");
  
  return `<div class="half-page">
    ${headerHtml}
    <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px;">
      <h2 style="margin: 0;">${title}</h2>
      ${invoiceLine}
      <p style="margin: 5px 0;"><strong>العميل:</strong> ${entry.customerName || "عميل غير محدد"} | <strong>التاريخ:</strong> ${fmtDate(entry.date || nowISO())}</p>
    </div>
    
    <div style="flex: 1;">
      <table border="1" cellpadding="6" cellspacing="0" width="100%" style="border-collapse: collapse;">
        <thead>
          <tr style="background: #eee;"><th>المنتجات</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      
      <div style="margin-top: 15px; display: flex; justify-content: space-between; align-items: flex-start;">
        <div style="line-height: 1.6;">
          <p><strong>المبلغ الكلي:</strong> ${money(sub)}</p>
          <p><strong>الخصم:</strong> ${dLabel}</p>
          <p><strong>بعد الخصم:</strong> ${money(total)}</p>
        </div>
        <div style="text-align: left; line-height: 1.6;">
          <p><strong>حالة الدفع:</strong> ${status}</p>
          <p><strong>المدفوع:</strong> ${money(paid)}</p>
          <p><strong>المتبقي:</strong> ${money(remaining)}</p>
        </div>
      </div>
      <h2 style="text-align: center; border: 2px solid #000; padding: 10px; margin-top: 10px;">الإجمالي النهائي: ${money(total)}</h2>
    </div>
  </div>`;
}

function sectionStoreKey(sectionId) {
  const map = {
    sales: "sales",
    invoices: "invoices",
    salesReturns: "salesReturns",
    invoiceReturns: "invoiceReturns",
    fawry: "fawrySales",
  };
  return map[sectionId] || "invoices";
}

function getPrintHeaderHtml() {
  const logo = app.state.settings.logoBase64 ? `<img src="${app.state.settings.logoBase64}" alt="logo" style="width:44px;height:44px;object-fit:contain;border-radius:8px;border:1px solid #ccc;" />` : "";
  const address = app.state.settings.orgAddress ? `<span><strong>العنوان:</strong> ${app.state.settings.orgAddress}</span>` : "";
  return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;border-bottom:1px solid #ddd;padding-bottom:8px;">
         <div>${logo}</div>
         <div style="text-align:right;flex:1;">
           <div style="font-size:18px;font-weight:700;">${app.state.settings.orgName || ""}</div>
           <div style="font-size:13px;display:flex;gap:10px;flex-wrap:wrap;">
             <span><strong>الهاتف:</strong> ${app.state.settings.orgPhone || "-"}</span>
             ${address}
           </div>
         </div>
       </div>`;
}

function printHtml(html, title, opts = {}) {
  const { includeOrgHeader = true } = opts;
  const orgHeader = includeOrgHeader ? getPrintHeaderHtml() : "";
  
   const watermarkUrl = app.state.settings.invoiceBgBase64;
   const watermarkCSS = watermarkUrl 
     ? `<style>
         body::before {
           content: "";
           position: fixed;
           top: 0; left: 0; width: 100%; height: 100%;
           background-image: url('${watermarkUrl}');
           background-size: 100% 100%;
           background-repeat: no-repeat;
           background-position: center;
           opacity: 0.2;
           z-index: -1000;
           pointer-events: none;
           -webkit-print-color-adjust: exact !important;
           print-color-adjust: exact !important;
         }
       </style>`
     : "";

  const w = window.open("", "_blank", "width=1000,height=700");
  w.document.write(`<!doctype html><html dir="rtl"><head><title>${title}</title><style>
    @page { size: A4; margin: 0; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body { margin: 0; padding: 0; background: transparent !important; min-height: 297mm; }
    .print-page {
      width: 210mm;
      min-height: 297mm;
      box-sizing: border-box;
      padding: 10mm;
      margin: 0 auto;
      position: relative;
      background: transparent !important;
      display: flex;
      flex-direction: column;
    }
    .print-content { position: relative; z-index: 10; flex: 1; }
    .print-footer-global {
      margin-top: 20px;
      display: flex;
      justify-content: space-between;
      border-top: 1px solid #eee;
      padding-top: 10px;
      font-size: 14px;
    }
    .half-page {
      min-height: 145mm;
      box-sizing: border-box;
      padding: 10mm;
      border-bottom: 2px dashed #000;
      position: relative;
      page-break-inside: avoid;
      break-inside: avoid;
      display: flex;
      flex-direction: column;
    }
    .half-page:last-child {
      border-bottom: none;
    }
  </style>
  ${watermarkCSS}
  </head><body>
    <div class="print-page">
      <div class="print-content">${orgHeader}${html}</div>
      <div class="print-footer-global">
        <p>توقيع المستلم: .....................</p>
        <p>توقيع العميل: .....................</p>
      </div>
    </div>
  </body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => {
    w.print();
  }, 500);
}

function showRecordDetails(type, rid) {
  const r = (app.state[type] || []).find((x) => x.id === rid);
  if (!r) return;
  const dLabel =
    r.discountType === "percent"
      ? `${Number(r.discountValue || 0)}%`
      : r.discountType === "fixed"
      ? money(Number(r.discountValue || 0))
      : "بدون";
  $("recordDetailsTitle").textContent = "تفاصيل العملية";
  hide("printRecordDetails");
  $("recordDetailsBody").innerHTML = `
    ${
      r.invoiceNumber
        ? `<p><strong>رقم الفاتورة:</strong> ${r.invoiceNumber}</p>`
        : r.salesNumber
        ? `<p><strong>رقم عملية المبيعات:</strong> ${r.salesNumber}</p>`
        : ""
    }
    <p><strong>${r.isPurchase ? "المورد" : "العميل"}:</strong> ${r.customerName}</p>
    <p><strong>التاريخ:</strong> ${fmtDate(r.date)}</p>
    <p><strong>المبلغ الكلي:</strong> ${money(r.subtotal || 0)}</p>
    <p><strong>الخصم:</strong> ${dLabel}</p>
    <p><strong>الصافي:</strong> ${money(r.total || 0)}</p>
    <p><strong>المدفوع:</strong> ${money(r.paidAmount || 0)}</p>
    <p><strong>المتبقي:</strong> ${money(r.remainingAmount || 0)}</p>
    <p><strong>الحالة:</strong> ${r.paymentStatus || "-"}</p>
    <div class="table-wrap"><table><thead><tr><th>المنتجات</th><th>الكمية</th><th>${r.isPurchase ? "السعر التجاري" : "السعر"}</th></tr></thead><tbody>${(r.items || []).map((i) => `<tr><td>${i.productName}</td><td>${i.qty}</td><td>${money(i.price)}</td></tr>`).join("")}</tbody></table></div>
  `;
  show("recordDetailsModal");
}

function deleteRecord(type, rid) {
  const i = (app.state[type] || []).findIndex((x) => x.id === rid);
  if (i < 0) return;
  const row = app.state[type][i];
  
  // New logic: OK will delete and return items. Cancel will stop everything.
  if (!confirm("هل تريد إعادة الكميات إلى المخزون وحذف الفاتورة؟ (اضغط إلغاء لمنع الحذف)")) {
    return;
  }

  const effect = getSourceTypeEffect(type);
  if (effect !== 0) {
    (row.items || []).forEach((it) => {
      const p = app.state.products.find((x) => x.id === it.productId);
      if (p) p.qty -= (it.qty * effect); // Undo the effect (return items to stock)
    });
  }
  
  app.state[type].splice(i, 1);
  saveState();
}

function discount(sub, t, v) {
  if (t === "percent") return Math.max(0, sub - sub * (v / 100));
  if (t === "fixed") return Math.max(0, sub - v);
  return sub;
}

function nextInvoiceNumber() {
  app.state.invoiceCounter = Number(app.state.invoiceCounter || 0) + 1;
  return app.state.invoiceCounter;
}

function nextSalesNumber() {
  app.state.salesCounter = Number(app.state.salesCounter || 0) + 1;
  return app.state.salesCounter;
}

function findCustomerByNameOrPhone(value) {
  const v = normalizeDigits(String(value || "").trim().toLowerCase());
  if (!v) return null;
  return (
    app.state.customers.find((c) => normalizeDigits(String(c.name || "").trim().toLowerCase()) === v) ||
    app.state.customers.find((c) => normalizeDigits(String(c.phone || "").trim().toLowerCase()) === v) ||
    null
  );
}

function findSupplierByNameOrPhone(value) {
  const v = normalizeDigits(String(value || "").trim().toLowerCase());
  if (!v) return null;
  return (
    app.state.suppliers.find((s) => normalizeDigits(String(s.name || "").trim().toLowerCase()) === v) ||
    app.state.suppliers.find((s) => normalizeDigits(String(s.phone || "").trim().toLowerCase()) === v) ||
    null
  );
}

function defaultAdminUser() {
  return { id: "u-admin", username: "1234", password: "1234", role: "manager" };
}

function sanitizeUsers(users) {
  if (!Array.isArray(users)) return [];
  const allowedRoles = new Set(["manager", "sales", "accountant"]);
  return users
    .map((u) => ({
      id: String(u?.id || id("usr")),
      username: normalizeDigits(String(u?.username || "").trim()),
      password: normalizeDigits(String(u?.password || "").trim()),
      role: allowedRoles.has(String(u?.role || "")) ? String(u.role) : "sales",
    }))
    .filter((u) => u.username.length > 0 && u.password.length > 0);
}

function applyFieldLabels() {
  const controls = document.querySelectorAll(".form-grid input, .form-grid select, .form-grid textarea");
  controls.forEach((el) => {
    const type = (el.getAttribute("type") || "").toLowerCase();
    if (type === "hidden" || type === "file" || type === "button" || type === "submit" || type === "reset") return;
    if (!el.id) el.id = `fld_${Math.random().toString(36).slice(2, 8)}`;

    // Keep each label + control in one grid item so layout stays ordered.
    if (!el.parentElement?.classList.contains("field-wrap")) {
      const wrap = document.createElement("div");
      wrap.className = "field-wrap";
      el.parentNode.insertBefore(wrap, el);
      wrap.appendChild(el);
    }

    let lbl = el.parentElement.querySelector(`label.field-label[for="${el.id}"]`);
    if (!lbl) {
      lbl = document.createElement("label");
      lbl.className = "field-label";
      lbl.htmlFor = el.id;
      el.parentElement.insertBefore(lbl, el);
    }
    lbl.textContent = getFieldLabelText(el);
  });
}

function getFieldLabelText(el) {
  const placeholder = (el.getAttribute("placeholder") || "").trim();
  if (placeholder) return placeholder.replace(/\s*\(اختيار�\)\s*/g, "").trim();

  const byId = {
    productWarehouse: "المخزن",
    customerId: "معرف العميل",
    debtCustomerInput: "العميل",
    reportMonth: "الشهر",
    reportDate: "التاريخ",
    defaultInvoiceStyle: "شكل الفاتورة",
    transferFrom: "من مخزن",
    transferTo: "إلى مخزن",
    transferProduct: "المنتج",
    userUsername: "اسم المستخدم",
    userPassword: "كلمة المرور",
    userRole: "الدور",
  };
  if (byId[el.id]) return byId[el.id];

  const m = el.id.match(/^(sales|invoices|salesReturns|invoiceReturns|fawry|purchases)(CustomerInput|Customer|Warehouse|Barcode|Qty|Price|SalePrice|Method|PaymentStatus|PaidAmount|DiscountType|DiscountValue)$/);
  if (m) {
    const section = m[1];
    const field = m[2];
    const map = {
      CustomerInput: section === "purchases" ? "اسم المورد أو الهاتف" : "العميل (اسم/هاتف)",
      Customer: section === "purchases" ? "المورد" : "العميل",
      Warehouse: section === "purchases" ? "اسم المخزن" : "المخزن",
      Barcode: section === "purchases" ? "اسم المنتج" : "اسم المنتج أو الكود",
      Qty: "الكمية",
      Price: section === "purchases" ? "السعر التجاري" : "السعر",
      SalePrice: "سعر البيع",
      Method: "نوع السداد",
      PaymentStatus: "حالة الدفع",
      PaidAmount: "المبلغ المدفوع",
      DiscountType: "نوع الخصم",
      DiscountValue: "قيمة الخصم",
    };
    return map[field] || "غير محدد";
  }
  return "غير محدد";
}

function txName(sectionId) {
  return { sales: "مبيعات يومية", invoices: "فاتورة", salesReturns: "مرتجع مبيعات", invoiceReturns: "مرتجع فاتورة", fawry: "فوري" }[sectionId] || sectionId;
}

function genBarcode() {
  return String(Date.now()).slice(-12);
}

function showBarcode(code) {
  const p = app.state.products.find(x => x.barcode === code);
  const productName = p ? p.name : "";
  JsBarcode("#barcodeSvg", code, { width: 2, height: 60, displayValue: true });
  $("barcodeProductName").textContent = productName;
  $("barcodePrintQty").value = 1;
  show("barcodeModal");
}

function toBase64(file) {
  if (!file) return Promise.resolve("");
  return new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.readAsDataURL(file);
  });
}

function $(idv) {
  return document.getElementById(idv);
}
function id(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36)}`;
}
function nowISO() {
  return new Date().toISOString();
}
function fmtDate(x) {
  if (!x) return "-";
  const d = new Date(x);
  if (isNaN(d)) return x;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}
function money(v) {
  return `${Number(v || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م`;
}
function getShowroomWarehouseId() {
  const showroom = app.state.warehouses.find((w) => (w.name || "").trim() === "المعرض");
  return showroom?.id || app.state.warehouses[0]?.id || "";
}
function getWarehouseName(warehouseId) {
  return app.state.warehouses.find((w) => w.id === warehouseId)?.name || "غير محدد";
}
function show(idv) {
  $(idv).classList.remove("hidden");
}
function hide(idv) {
  $(idv).classList.add("hidden");
}

window.kiroEditProduct = (pid) => {
  const p = app.state.products.find((x) => x.id === pid);
  if (!p) return;
  
  // Fill the edit modal
  $("editProductId").value = p.id;
  $("editProductName").value = p.name;
  $("editProductBarcode").value = p.barcode;
  $("editProductQty").value = p.qty;
  $("editProductSalePrice").value = p.salePrice;
  $("editProductShopPrice").value = p.shopPrice || 0;
  $("editProductCostPrice").value = p.costPrice;
  
  // Fill warehouses select in edit modal
  const whSelect = $("editProductWarehouse");
  whSelect.innerHTML = app.state.warehouses.map(w => `<option value="${w.id}">${w.name}</option>`).join("");
  whSelect.value = p.warehouseId;

  show("editProductModal");
};
window.kiroDeleteProduct = (pid) => {
  if (!confirm("هل أنت متأكد من حذف المنتج؟")) return;
  app.state.products = app.state.products.filter((x) => x.id !== pid);
  saveState();
};
window.kiroPrintBarcode = showBarcode;
window.kiroRemoveTempItem = (sectionId, idx) => {
  app.temp[sectionId].splice(idx, 1);
  renderTemp(sectionId);
};
window.kiroEditCustomer = (cid) => {
  const c = app.state.customers.find((x) => x.id === cid);
  if (!c) return;
  $("customerId").value = c.id;
  $("customerName").value = c.name;
  $("customerPhone").value = c.phone || "";
  $("customerAddress").value = c.address || "";
  $("customerDebt").value = c.debt || 0;
};
window.kiroDeleteCustomer = (cid) => {
  if (!confirm("هل أنت متأكد من حذف العميل؟")) return;
  app.state.customers = app.state.customers.filter((x) => x.id !== cid);
  saveState();
};
window.kiroViewCustomerLedger = (cid) => {
  const c = app.state.customers.find((x) => x.id === cid);
  if (!c) return;
  $("recordDetailsTitle").textContent = "كشف حساب عميل";
  show("printRecordDetails");
  $("recordDetailsBody").innerHTML = `
    <h4>${c.name}</h4>
    <p>الديون الحالية: ${money(c.debt || 0)}</p>
    <div class="inline-actions" style="margin-bottom:10px;">
      <button class="btn primary" onclick="window.kiroPrintCustomerReport('${c.id}')">طباعة تقرير كامل</button>
    </div>
    <div class="table-wrap"><table><thead><tr><th>المصدر</th><th>المبلغ</th><th>المدفوع</th><th>المتبقي</th><th>التاريخ</th><th class="no-print">العملية</th></tr></thead>
    <tbody>${(c.ledger || [])
      .map((l) => {
        const hasTx = Boolean(findTransactionByLedger(l));
        return `<tr>
          <td>${l.type || "-"}</td>
          <td>${money(l.amount || 0)}</td>
          <td>${money(l.paidAmount || 0)}</td>
          <td>${money(l.remainingAmount || 0)}</td>
          <td>${fmtDate(l.date)}</td>
          <td class="no-print">
            ${hasTx ? `<button class="btn secondary" onclick="window.kiroOpenLedgerTransaction('${c.id}','${l.id}')">عرض العملية</button>
            <button class="btn primary" onclick="window.kiroEditLedgerTransaction('${c.id}','${l.id}')">تعديل</button>` : "-"}
            <button class="btn primary" onclick="window.kiroPrintLedgerItem('${c.id}','${l.id}')">طباعة</button>
          </td>
        </tr>`;
      })
      .join("")}</tbody></table></div>
  `;
  show("recordDetailsModal");
};
window.kiroEditRecord = (type, rid) => {
  const sectionId = getRecordSectionId(type);
  if (!sectionId) return alert("هذا النوع غير متاح للتعديل حالياً");
  const entry = (app.state[type] || []).find((x) => x.id === rid);
  if (!entry) return alert("العملية غير موجودة");

  const activeEdit = app.editingTx[sectionId];
  if (activeEdit && activeEdit.recordId !== rid) {
    if (!confirm("يوجد تعديل آخر قيد العمل. هل تريد استبداله؟")) return;
  }

  app.editingTx[sectionId] = { sourceType: type, recordId: rid };
  app.temp[sectionId] = structuredClone(entry.items || []);
  if ($(`${sectionId}CustomerInput`)) $(`${sectionId}CustomerInput`).value = entry.customerName || "";
  if ($(`${sectionId}PaidAmount`)) $(`${sectionId}PaidAmount`).value = Number(entry.paidAmount || 0) || "";
  if ($(`${sectionId}DiscountType`)) $(`${sectionId}DiscountType`).value = entry.discountType || "none";
  if ($(`${sectionId}DiscountValue`)) $(`${sectionId}DiscountValue`).value = Number(entry.discountValue || 0) || "";
  if ($(`${sectionId}PaymentStatus`) && entry.paymentStatus) $(`${sectionId}PaymentStatus`).value = entry.paymentStatus;
  if ($(`${sectionId}Warehouse`) && entry.warehouseId) $(`${sectionId}Warehouse`).value = entry.warehouseId;
  if ($(`${sectionId}Method`) && entry.paymentMethod) $(`${sectionId}Method`).value = entry.paymentMethod;

  renderTemp(sectionId);
  updateTxEditUI(sectionId);
  showSection(sectionId, `تعديل ${txName(sectionId)}`);
  hide("recordDetailsModal");
};

window.kiroEditLedgerTransaction = (cid, lid) => {
  const c = app.state.customers.find((x) => x.id === cid);
  if (!c) return;
  const l = (c.ledger || []).find((x) => x.id === lid);
  if (!l) return;
  const tx = findTransactionByLedger(l);
  if (!tx) return alert("لا توجد عملية مرتبطة بهذه الحركة");
  window.kiroEditRecord(tx.source, tx.entry.id);
};

window.kiroShowRecordDetails = showRecordDetails;
window.kiroDeleteRecord = deleteRecord;
window.kiroPrintRecord = printRecord;
window.kiroOpenLedgerTransaction = (cid, lid) => {
  const c = app.state.customers.find((x) => x.id === cid);
  if (!c) return;
  const l = (c.ledger || []).find((x) => x.id === lid);
  if (!l) return;
  const tx = findTransactionByLedger(l);
  if (!tx) return alert("لا توجد عملية متاحة لهذه الحركة");
  showRecordDetails(tx.source, tx.entry.id);
};
window.kiroPrintLedgerItem = (cid, lid) => {
  const c = app.state.customers.find((x) => x.id === cid);
  if (!c) return;
  const l = (c.ledger || []).find((x) => x.id === lid);
  if (!l) return;
  const tx = findTransactionByLedger(l);
  if (tx) {
    const titleMap = {
      sales: "مبيعات يومية",
      invoices: "فاتورة",
      archivedInvoices: "أرشيف فاتورة",
      salesReturns: "مرتجع مبيعات",
      invoiceReturns: "مرتجع فاتورة",
      fawrySales: "مبيعات فوري",
    };
    const html = buildTransactionPrintHtml(tx.entry, titleMap[tx.source] || "عملية");
    printHtml(html, titleMap[tx.source] || "ط¹ظ…ظ„ية", { includeOrgHeader: false });
    return;
  }
  const html = buildCustomerLedgerItemPrintHtml(c, l);
  printHtml(html, "حركة عميل");
};
window.kiroPrintCustomerReport = (cid) => {
  const c = app.state.customers.find((x) => x.id === cid);
  if (!c) return;
  const html = buildCustomerReportPrintHtml(c);
  printHtml(html, "تقرير عميل", { includeOrgHeader: false });
};

function findTransactionByLedger(ledgerRow) {
  if (!ledgerRow?.refId) return null;
  const maps = [
    "sales",
    "invoices",
    "archivedInvoices",
    "salesReturns",
    "invoiceReturns",
    "fawrySales",
  ];
  if (ledgerRow.source && Array.isArray(app.state[ledgerRow.source])) {
    const direct = app.state[ledgerRow.source].find((x) => x.id === ledgerRow.refId);
    if (direct) return { source: ledgerRow.source, entry: direct };
  }
  for (const key of maps) {
    const found = (app.state[key] || []).find((x) => x.id === ledgerRow.refId);
    if (found) return { source: key, entry: found };
  }
  return null;
}

function buildCustomerLedgerItemPrintHtml(customer, row) {
  const headerHtml = getPrintHeaderHtml();
  const isPayment = row.type && (row.type.includes("سداد") || row.type.includes("دفعة"));
  const amountBefore = isPayment ? (Number(row.remainingAmount || 0) + Number(row.paidAmount || 0)) : (row.amount || 0);
  
  return `
    <div class="half-page" style="text-align: right;">
      ${headerHtml}
      <h2 style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px;">وصل سداد</h2>
      <div style="flex: 1;">
        <div style="margin-top: 20px; font-size: 16px; line-height: 1.6;">
          <p><strong>التاريخ:</strong> ${fmtDate(row.date)}</p>
          <p><strong>العميل:</strong> ${customer.name}</p>
          <p><strong>البيان:</strong> ${row.type || "سداد مديونية"}</p>
          <hr style="border: 1px dashed #ccc;" />
          <p style="font-size: 18px;"><strong>المديونية قبل السداد:</strong> ${money(amountBefore)}</p>
          <p style="font-size: 18px;"><strong>المبلغ المدفوع:</strong> ${money(row.paidAmount || 0)}</p>
          <p style="font-size: 20px; border-top: 1px solid #000; padding-top: 10px;"><strong>المديونية المتبقية:</strong> ${money(row.remainingAmount || 0)}</p>
        </div>
      </div>
      <div style="margin-top: 40px; display: flex; justify-content: space-between;">
      </div>
    </div>
  `;
}

function buildCustomerReportPrintHtml(customer) {
  const headerHtml = getPrintHeaderHtml();
  const sections = (customer.ledger || [])
    .map((l, idx) => {
      const tx = findTransactionByLedger(l);
      let detailsHtml = "";
      
      if (tx?.entry?.items?.length) {
        detailsHtml = `
          <table border="1" cellpadding="6" cellspacing="0" width="100%" style="margin-top:10px;">
            <thead>
              <tr><th>المنتجات</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr>
            </thead>
            <tbody>
              ${tx.entry.items
                .map((i) => `<tr><td>${i.productName}</td><td>${i.qty}</td><td>${money(i.price)}</td><td>${money(i.qty * i.price)}</td></tr>`)
                .join("")}
            </tbody>
          </table>
          <div style="margin-top:10px; text-align: left; border-top: 1px solid #000; padding-top: 10px;">
            <p><strong>إجمالي العملية:</strong> ${money(tx.entry.total || 0)}</p>
            <p><strong>المدفوع في هذه العملية:</strong> ${money(tx.entry.paidAmount || 0)}</p>
            <p><strong>المتبقي من هذه العملية:</strong> ${money(tx.entry.remainingAmount || 0)}</p>
          </div>
        `;
      } else {
        detailsHtml = `
          <div style="margin-top:10px; padding: 15px; border: 1px dashed #ccc;">
            <p><strong>قيمة الحركة:</strong> ${money(l.amount || 0)}</p>
            <p><strong>المبلغ المدفوع:</strong> ${money(l.paidAmount || 0)}</p>
            <p><strong>المديونية المتبقية الكلية:</strong> ${money(l.remainingAmount || 0)}</p>
          </div>
        `;
      }

      return `
        <div class="half-page">
          ${headerHtml}
          <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px;">
            <h2 style="margin: 0;">تفاصيل حركة (#${idx + 1})</h2>
            <p style="margin: 5px 0;"><strong>العميل:</strong> ${customer.name} | <strong>التاريخ:</strong> ${fmtDate(l.date)}</p>
          </div>
          <p><strong>نوع الحركة:</strong> ${l.type || "-"}</p>
          <div style="flex: 1;">
            ${detailsHtml}
          </div>
          <div style="margin-top: 30px; display: flex; justify-content: space-between;">
          </div>
        </div>
      `;
    })
    .join("");

  return sections || `<p style="text-align:center;">لا توجد حركات لهذا العميل</p>`;
}
window.kiroEditUser = (uid) => {
  if (getCurrentRole() !== "manager") return alert("هذه الصلاحية متاحة للمدير فقط");
  const u = app.state.users.find((x) => x.id === uid);
  if (!u) return;
  $("userId").value = u.id;
  $("userUsername").value = u.username;
  $("userPassword").value = u.password;
  $("userRole").value = u.role;
  showSection("users", "إدارة المستخدمين");
};
window.kiroDeleteUser = (uid) => {
  if (getCurrentRole() !== "manager") return alert("هذه الصلاحية متاحة للمدير فقط");
  const user = app.state.users.find((x) => x.id === uid);
  if (!user) return;
  if (user.role === "manager" && app.state.users.filter((u) => u.role === "manager").length <= 1) {
    return alert("لا يمكن حذف آخر مدير في النظام");
  }
  if (!confirm("تأكيد حذف المستخدم؟")) return;
  app.state.users = app.state.users.filter((x) => x.id !== uid);
  if (app.currentUser?.id === uid) {
    saveState();
    forceLogout();
    return;
  }
  saveState();
};
window.kiroEnterWarehouse = (warehouseId) => {
  app.inventoryViewWarehouseId = warehouseId;
  showSection("inventory", "إدارة المنتجات");
  renderAll();
};
window.kiroEditWarehouse = (warehouseId) => {
  const w = app.state.warehouses.find((x) => x.id === warehouseId);
  if (!w) return;
  $("warehouseId").value = w.id;
  $("warehouseName").value = w.name;
  showSection("warehouses", "إدارة المخازن");
};
window.kiroDeleteWarehouse = (warehouseId) => {
  const w = app.state.warehouses.find((x) => x.id === warehouseId);
  if (!w) return;
  if (app.state.warehouses.length <= 1) return alert("لا يمكن حذف آخر مخزن");
  const hasProducts = app.state.products.some((p) => p.warehouseId === warehouseId);
  if (hasProducts) return alert("لا يمكن حذف مخزن عليه منتجات");
  if (!confirm(`تأكيد حذف المخزن: ${w.name}؟`)) return;
  app.state.warehouses = app.state.warehouses.filter((x) => x.id !== warehouseId);
  if (app.inventoryViewWarehouseId === warehouseId) app.inventoryViewWarehouseId = null;
  saveState();
};

function bindMobileSettingsBackupActions() {
  const mobileActionsWrap = $("mobileBackupActions");
  const mobileExportBtn = $("settingsMobileExportBtn");
  const mobileImportInput = $("settingsMobileImportInput");
  if (!mobileActionsWrap || !mobileExportBtn || !mobileImportInput) return;

  const mobileQuery = window.matchMedia("(max-width: 920px)");
  const toggleVisibility = () => {
    mobileActionsWrap.classList.toggle("hidden", !mobileQuery.matches);
  };
  toggleVisibility();
  mobileQuery.addEventListener("change", toggleVisibility);

  mobileExportBtn.addEventListener("click", exportJson);
  mobileImportInput.addEventListener("change", (e) => {
    importJson(e);
    e.target.value = "";
  });
}
