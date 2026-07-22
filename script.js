/* ==========================================================================
   Cinema Bill App - Core Logic & PWA Functionality
   ========================================================================== */

// ------ CONSTANTS & CONFIGS ------
const WEB3FORMS_SYNC = {
  enabled: true,
  accessKey: "5132471f-04cd-486f-a8d9-32456ac56e5e"
};

const DEFAULT_SETTINGS = {
  cinemaName: "MRITYUNJAY CINEPLEX",
  defaultBalconyRate: 150.00,
  defaultReserveRate: 100.00,
  currency: "Rs.",
  darkMode: false
};

const SHOW_TIMES = ["12:00 PM", "3:00 PM", "6:00 PM", "9:00 PM"];

// ------ STATE MANAGEMENT ------
let state = {
  settings: { ...DEFAULT_SETTINGS },
  bills: [], // Array of saved daily collections
  currentBillId: null, // For edit operations
  activePage: "pageHome",
  lastDeletedBill: null, // For Undo delete
  undoTimeoutId: null,
  syncQueue: [] // Pending bills to send to Web3Forms
};

// ------ INITIALIZATION ------
document.addEventListener("DOMContentLoaded", () => {
  initApp();
});

function initApp() {
  loadDataFromStorage();
  applySettings();
  registerServiceWorker();
  initFormDefaults();
  setupEventListeners();
  renderHistory();
  renderAnalytics();
  calculateHomeAmounts();
  processSyncQueue(); // Attempt to send any offline bills

  // Hide splash screen after a short delay
  setTimeout(() => {
    const splash = document.getElementById("splashScreen");
    const appShell = document.getElementById("appShell");
    if (splash) splash.classList.add("fade-out");
    if (appShell) appShell.classList.remove("hidden");
  }, 1000);
}

// ------ STORAGE MANAGEMENT ------
function loadDataFromStorage() {
  try {
    const savedSettings = localStorage.getItem("cinebill_settings");
    if (savedSettings) {
      state.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) };
      // Auto-migrate old Rupee symbol to Rs.
      if (state.settings.currency === "\u20B9") {
        state.settings.currency = "Rs.";
      }
    } else {
      localStorage.setItem("cinebill_settings", JSON.stringify(state.settings));
    }

    const savedBills = localStorage.getItem("cinebill_bills");
    if (savedBills) {
      state.bills = JSON.parse(savedBills);
    }

    const savedQueue = localStorage.getItem("cinebill_sync_queue");
    if (savedQueue) {
      state.syncQueue = JSON.parse(savedQueue);
    }
  } catch (e) {
    showToast("Error loading saved data", "error");
    console.error(e);
  }
}

function saveDataToStorage() {
  try {
    localStorage.setItem("cinebill_settings", JSON.stringify(state.settings));
    localStorage.setItem("cinebill_bills", JSON.stringify(state.bills));
    localStorage.setItem("cinebill_sync_queue", JSON.stringify(state.syncQueue));
  } catch (e) {
    showToast("Error saving data to storage", "error");
    console.error(e);
  }
}

// ------ PWA SERVICE WORKER ------
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('ServiceWorker registered successfully', reg.scope))
        .catch(err => console.warn('ServiceWorker registration failed', err));
    });
  }
}

// ------ APPLY SETTINGS & CONFIGS ------
function applySettings() {
  // Update Cinema Name in Header
  document.getElementById("appBarTitle").textContent = state.settings.cinemaName;

  // Update Default Rates inputs on home page if they are empty
  const balconyInput = document.getElementById("balconyRate");
  const reserveInput = document.getElementById("reserveRate");

  if (!balconyInput.value) balconyInput.value = state.settings.defaultBalconyRate;
  if (!reserveInput.value) reserveInput.value = state.settings.defaultReserveRate;

  // Settings page inputs
  document.getElementById("settBalconyRate").value = state.settings.defaultBalconyRate;
  document.getElementById("settReserveRate").value = state.settings.defaultReserveRate;
  document.getElementById("settCurrency").value = state.settings.currency;
  document.getElementById("settDarkMode").checked = state.settings.darkMode;

  // Theme apply
  if (state.settings.darkMode) {
    document.documentElement.setAttribute("data-theme", "dark");
    document.querySelector("#btnThemeToggle span").textContent = "light_mode";
  } else {
    document.documentElement.setAttribute("data-theme", "light");
    document.querySelector("#btnThemeToggle span").textContent = "dark_mode";
  }
}

// ------ SET DEFAULT FORM FIELDS ------
function initFormDefaults() {
  // Auto date to today
  const today = new Date().toISOString().split("T")[0];
  document.getElementById("billDate").value = today;

  if (state.bills.length > 0) {
    const sortedBills = [...state.bills].sort((a, b) => b.timestamp - a.timestamp);
    const lastBill = sortedBills[0];
    document.getElementById("movieName").value = lastBill.movieName;
  } else {
    document.getElementById("movieName").value = "";
  }

  // Auto detect day and previous totals logic
  autoDetectDayNumber();
  populateMovieList();
}

function populateMovieList() {
  const movieList = document.getElementById("movieList");
  if (!movieList) return;

  const uniqueMovies = [...new Set(state.bills.map(b => b.movieName.trim()))];
  movieList.innerHTML = uniqueMovies.map(movie => `<option value="${escapeHTML(movie)}">`).join("");
}

function autoDetectDayNumber() {
  const movieInput = document.getElementById("movieName").value.trim().toLowerCase();
  const dayInput = document.getElementById("dayNumber");
  const prevCollInput = document.getElementById("previousCollection");
  const prevTicketsInput = document.getElementById("previousTickets");

  if (state.bills.length === 0 || !movieInput) {
    dayInput.value = 1;
    prevCollInput.value = 0;
    prevTicketsInput.value = 0;
    calculateHomeAmounts();
    return;
  }

  const sortedBills = [...state.bills].sort((a, b) => b.timestamp - a.timestamp);
  const lastBillForMovie = sortedBills.find(b => b.movieName.trim().toLowerCase() === movieInput);

  if (lastBillForMovie) {
    dayInput.value = Number(lastBillForMovie.dayNumber) + 1;
    prevCollInput.value = lastBillForMovie.grandTotal;
    prevTicketsInput.value = lastBillForMovie.grandTotalTickets || lastBillForMovie.totalTickets || 0;
  } else {
    dayInput.value = 1;
    prevCollInput.value = 0;
    prevTicketsInput.value = 0;
  }
  calculateHomeAmounts();
}

function autoDetectPreviousCollection() {
  // Maintained for direct invocation if needed
  const prevCollInput = document.getElementById("previousCollection");
  if (state.bills.length === 0) {
    prevCollInput.value = 0;
  } else {
    const sortedBills = [...state.bills].sort((a, b) => b.timestamp - a.timestamp);
    prevCollInput.value = sortedBills[0].grandTotal;
  }
  calculateHomeAmounts();
}

// ------ EVENT LISTENERS SETUP ------
function setupEventListeners() {
  // Bottom Navigation
  document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", (e) => {
      const pageId = e.currentTarget.getAttribute("data-page");
      switchPage(pageId);
    });
  });

  // Theme Toggle Button
  document.getElementById("btnThemeToggle").addEventListener("click", () => {
    state.settings.darkMode = !state.settings.darkMode;
    saveDataToStorage();
    applySettings();
    showToast(state.settings.darkMode ? "Dark mode enabled" : "Light mode enabled", "info");
  });

  // Real-time calculation on Home Form inputs
  const inputsToCalculate = [
    "balconyRate", "reserveRate", "previousCollection", "previousTickets", "movieName"
  ];
  inputsToCalculate.forEach(id => {
    document.getElementById(id).addEventListener("input", () => {
      if (id === "movieName") {
        autoDetectDayNumber();
      } else {
        calculateHomeAmounts();
      }
    });
  });

  // Date input triggers day detect
  document.getElementById("billDate").addEventListener("change", () => {
    autoDetectDayNumber();
  });

  // Show ticket inputs calculations
  document.querySelectorAll(".show-balcony, .show-reserve").forEach(input => {
    input.addEventListener("input", calculateHomeAmounts);
  });

  // Action Buttons - Home Screen
  document.getElementById("btnSaveBill").addEventListener("click", handleSaveBill);
  document.getElementById("btnResetForm").addEventListener("click", () => {
    showConfirmDialog("Reset Form", "Clear all current inputs? This cannot be undone.", () => {
      resetHomeForm();
      showToast("Form cleared", "info");
    });
  });
  document.getElementById("btnDuplicate").addEventListener("click", handleDuplicatePrevious);

  // History Search
  document.getElementById("historySearch").addEventListener("input", (e) => {
    const searchVal = e.target.value;
    const clearBtn = document.getElementById("btnClearSearch");
    if (searchVal.length > 0) {
      clearBtn.classList.remove("hidden");
    } else {
      clearBtn.classList.add("hidden");
    }
    renderHistory(searchVal);
  });

  document.getElementById("btnClearSearch").addEventListener("click", () => {
    document.getElementById("historySearch").value = "";
    document.getElementById("btnClearSearch").classList.add("hidden");
    renderHistory();
  });

  // Backup & Import
  document.getElementById("btnExportJSON").addEventListener("click", exportJSONBackup);
  document.getElementById("btnImportJSON").addEventListener("click", () => {
    document.getElementById("importFileInput").click();
  });
  document.getElementById("importFileInput").addEventListener("change", handleImportJSON);

  // Settings Save
  document.getElementById("btnSaveSettings").addEventListener("click", handleSaveSettings);
  document.getElementById("settDarkMode").addEventListener("change", (e) => {
    state.settings.darkMode = e.target.checked;
    saveDataToStorage();
    applySettings();
  });

  // Clear All Data Danger action
  document.getElementById("btnClearAllData").addEventListener("click", () => {
    showConfirmDialog("Danger: Clear Data", "Delete ALL saved bills and reset settings? This will completely wipe the database.", () => {
      localStorage.clear();
      state.settings = { ...DEFAULT_SETTINGS };
      state.bills = [];
      saveDataToStorage();
      applySettings();
      resetHomeForm();
      renderHistory();
      renderAnalytics();
      showToast("All data successfully cleared", "success");
    });
  });

  // Modals close button listeners
  document.getElementById("btnCloseEditModal").addEventListener("click", () => {
    document.getElementById("editModal").classList.add("hidden");
  });
  document.getElementById("btnCancelEdit").addEventListener("click", () => {
    document.getElementById("editModal").classList.add("hidden");
  });
  document.getElementById("btnSaveEdit").addEventListener("click", handleUpdateBill);

  document.getElementById("btnCloseViewModal").addEventListener("click", () => {
    document.getElementById("viewModal").classList.add("hidden");
  });

  // Undo delete snackbar action
  document.getElementById("btnUndo").addEventListener("click", handleUndoDelete);
}

// ------ PAGE ROUTING & NAVIGATION ------
function switchPage(pageId) {
  // Update nav UI
  document.querySelectorAll(".nav-item").forEach(item => {
    if (item.getAttribute("data-page") === pageId) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  // Switch pages visibility
  document.querySelectorAll(".page").forEach(page => {
    if (page.id === pageId) {
      page.classList.add("active");
    } else {
      page.classList.remove("active");
    }
  });

  state.activePage = pageId;

  // Refresh page dynamic components on click
  if (pageId === "pageHistory") {
    renderHistory();
  } else if (pageId === "pageAnalytics") {
    renderAnalytics();
  }
}

// ------ LIVE CALCULATIONS ------
function calculateHomeAmounts() {
  const balconyRate = parseFloat(document.getElementById("balconyRate").value) || 0;
  const reserveRate = parseFloat(document.getElementById("reserveRate").value) || 0;
  const previousCollection = parseFloat(document.getElementById("previousCollection").value) || 0;
  const previousTickets = parseInt(document.getElementById("previousTickets").value) || 0;

  let totalTickets = 0;
  let todaysCollection = 0;

  // Calculate for each show
  for (let i = 0; i < SHOW_TIMES.length; i++) {
    const balconyTicketsInput = document.querySelector(`.show-balcony[data-show="${i}"]`);
    const reserveTicketsInput = document.querySelector(`.show-reserve[data-show="${i}"]`);

    const balconyTickets = parseInt(balconyTicketsInput.value) || 0;
    const reserveTickets = parseInt(reserveTicketsInput.value) || 0;

    const showAmount = (balconyTickets * balconyRate) + (reserveTickets * reserveRate);
    todaysCollection += showAmount;
    totalTickets += (balconyTickets + reserveTickets);

    // Update individual show labels
    document.querySelector(`.show-amount-badge[data-amount="${i}"]`).textContent = formatCurrency(showAmount);
    document.querySelector(`[data-show-total="${i}"]`).textContent = formatCurrency(showAmount);
  }

  const grandTotal = todaysCollection + previousCollection;
  const grandTotalTickets = totalTickets + previousTickets;

  // Update Summary DOM
  document.getElementById("totalTickets").textContent = totalTickets.toLocaleString();
  document.getElementById("prevTicketsDisplay").textContent = previousTickets.toLocaleString();
  document.getElementById("grandTotalTickets").textContent = grandTotalTickets.toLocaleString();
  document.getElementById("todaysCollection").textContent = formatCurrency(todaysCollection);
  document.getElementById("prevCollectionDisplay").textContent = formatCurrency(previousCollection);
  document.getElementById("grandTotal").textContent = formatCurrency(grandTotal);
}

// Helper to compile current home form values into a structured Bill Object
function getFormBillObject() {
  const balconyRate = parseFloat(document.getElementById("balconyRate").value) || 0;
  const reserveRate = parseFloat(document.getElementById("reserveRate").value) || 0;
  const previousCollection = parseFloat(document.getElementById("previousCollection").value) || 0;
  const previousTickets = parseInt(document.getElementById("previousTickets").value) || 0;

  const shows = [];
  let totalTickets = 0;
  let todaysCollection = 0;

  for (let i = 0; i < SHOW_TIMES.length; i++) {
    const balcony = parseInt(document.querySelector(`.show-balcony[data-show="${i}"]`).value) || 0;
    const reserve = parseInt(document.querySelector(`.show-reserve[data-show="${i}"]`).value) || 0;
    const amount = (balcony * balconyRate) + (reserve * reserveRate);

    shows.push({
      time: SHOW_TIMES[i],
      balconyTickets: balcony,
      reserveTickets: reserve,
      amount: amount
    });

    todaysCollection += amount;
    totalTickets += (balcony + reserve);
  }

  return {
    id: state.currentBillId || generateUUID(),
    cinemaName: state.settings.cinemaName,
    movieName: document.getElementById("movieName").value.trim() || "Untitled Movie",
    date: document.getElementById("billDate").value,
    dayNumber: parseInt(document.getElementById("dayNumber").value) || 1,
    balconyRate,
    reserveRate,
    previousCollection,
    previousTickets,
    shows,
    totalTickets,
    grandTotalTickets: totalTickets + previousTickets,
    todaysCollection,
    grandTotal: todaysCollection + previousCollection,
    timestamp: Date.now()
  };
}

// ------ RESET & DUPLICATE ACTIONS ------
function resetHomeForm() {
  document.getElementById("movieName").value = "";
  document.getElementById("balconyRate").value = state.settings.defaultBalconyRate;
  document.getElementById("reserveRate").value = state.settings.defaultReserveRate;
  document.getElementById("previousCollection").value = 0;
  document.getElementById("previousTickets").value = 0;

  document.querySelectorAll(".show-balcony, .show-reserve").forEach(input => {
    input.value = "";
  });

  state.currentBillId = null;
  initFormDefaults();
  calculateHomeAmounts();
}

function handleDuplicatePrevious() {
  if (state.bills.length === 0) {
    showToast("No previous bills to duplicate", "error");
    return;
  }

  // Get most recent bill
  const sorted = [...state.bills].sort((a, b) => b.timestamp - a.timestamp);
  const prev = sorted[0];

  document.getElementById("movieName").value = prev.movieName;
  document.getElementById("balconyRate").value = prev.balconyRate;
  document.getElementById("reserveRate").value = prev.reserveRate;
  document.getElementById("previousCollection").value = prev.grandTotal; // previous grand total is next previous
  document.getElementById("previousTickets").value = prev.grandTotalTickets || prev.totalTickets || 0;

  // Set day number to prev + 1
  document.getElementById("dayNumber").value = Number(prev.dayNumber) + 1;

  // We keep ticket quantities blank for new entries
  document.querySelectorAll(".show-balcony, .show-reserve").forEach(input => {
    input.value = "";
  });

  calculateHomeAmounts();
  showToast("Duplicated fields from previous day", "success");
}

// ------ WEB3FORMS EMAIL SYNC ------
async function queueBillForSync(bill) {
  if (!WEB3FORMS_SYNC.enabled || !WEB3FORMS_SYNC.accessKey || WEB3FORMS_SYNC.accessKey.includes("PASTE_")) {
    return;
  }
  
  // Add to queue and save
  state.syncQueue.push(bill);
  saveDataToStorage();
  
  // Immediately attempt to process queue
  processSyncQueue();
}

async function processSyncQueue() {
  if (state.syncQueue.length === 0 || !navigator.onLine) return;

  // Create a copy of the queue so we can iterate safely
  const queueToProcess = [...state.syncQueue];
  let successfulIds = [];

  for (const bill of queueToProcess) {
    try {
      const formatShow = (show) => `${show.time}: ${show.balconyTickets}B + ${show.reserveTickets}R = Rs. ${show.amount.toFixed(2)}`;

      const payload = {
        access_key: WEB3FORMS_SYNC.accessKey,
        subject: `New Cinema Bill: ${bill.movieName} (Day ${bill.dayNumber})`,
        from_name: state.settings.cinemaName,
        "Movie Name": bill.movieName,
        "Date": bill.date,
        "Run Day": bill.dayNumber,
        "Show 1": bill.shows[0] ? formatShow(bill.shows[0]) : "N/A",
        "Show 2": bill.shows[1] ? formatShow(bill.shows[1]) : "N/A",
        "Show 3": bill.shows[2] ? formatShow(bill.shows[2]) : "N/A",
        "Show 4": bill.shows[3] ? formatShow(bill.shows[3]) : "N/A",
        "Today's Tickets": bill.totalTickets,
        "Previous Tickets": bill.previousTickets || 0,
        "Total Tickets": bill.grandTotalTickets || bill.totalTickets,
        "Today's Collection": `Rs. ${bill.todaysCollection.toFixed(2)}`,
        "Previous Collection": `Rs. ${bill.previousCollection.toFixed(2)}`,
        "GRAND TOTAL": `Rs. ${bill.grandTotal.toFixed(2)}`
      };

      const response = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        successfulIds.push(bill.id);
        console.log(`Email Sync Success for bill ${bill.id}`);
      } else {
        console.log(`Email Sync Failed for bill ${bill.id} with status ${response.status}`);
      }
    } catch (error) {
      console.log(`Email Sync Network Error for bill ${bill.id}`);
      // Break out of the loop on network failure to retry later
      break; 
    }
  }

  // Remove successful bills from the original queue
  if (successfulIds.length > 0) {
    state.syncQueue = state.syncQueue.filter(b => !successfulIds.includes(b.id));
    saveDataToStorage();
  }
}

// ------ SAVE BILL ------
async function handleSaveBill() {
  const movie = document.getElementById("movieName").value.trim();
  if (!movie) {
    showToast("Please enter a Movie Name", "error");
    document.getElementById("movieName").focus();
    return;
  }

  const billObj = getFormBillObject();

  // Check if date already exists for this movie to avoid simple overlaps without warning
  const duplicate = state.bills.find(b => b.date === billObj.date && b.movieName.toLowerCase() === billObj.movieName.toLowerCase());

  if (duplicate) {
    showConfirmDialog("Overwrite Bill", `A bill for '${billObj.movieName}' on date ${formatDateDisplay(billObj.date)} already exists. Overwrite?`, async () => {
      // replace duplicate
      state.bills = state.bills.filter(b => b.id !== duplicate.id);
      await saveBillAndRefresh(billObj);
    });
  } else {
    await saveBillAndRefresh(billObj);
  }
}

async function saveBillAndRefresh(billObj) {
  state.bills.push(billObj);
  saveDataToStorage();
  showToast("Bill saved successfully", "success");
  populateMovieList();
  resetHomeForm();

  // Switch to History page to show the saved card
  setTimeout(() => {
    switchPage("pageHistory");
  }, 300);

  await queueBillForSync(billObj);
}

// ------ HISTORY PAGE MANAGEMENT ------
function renderHistory(query = "") {
  const historyList = document.getElementById("historyList");
  const emptyState = document.getElementById("historyEmpty");

  // Sort newest first
  let filtered = [...state.bills].sort((a, b) => new Date(b.date) - new Date(a.date));

  // Search filter
  if (query.trim()) {
    const q = query.toLowerCase().trim();
    filtered = filtered.filter(b =>
      b.movieName.toLowerCase().includes(q) ||
      b.date.includes(q) ||
      `day ${b.dayNumber}`.toLowerCase().includes(q)
    );
  }

  if (filtered.length === 0) {
    historyList.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");

  historyList.innerHTML = filtered.map(bill => {
    return `
      <div class="bill-card" data-id="${bill.id}">
        <div class="bill-card-header">
          <div>
            <h3 class="bill-movie">${escapeHTML(bill.movieName)}</h3>
            <div class="bill-meta">${formatDateDisplay(bill.date)} • Day ${bill.dayNumber}</div>
          </div>
          <span class="bill-badge">Collection Sheet</span>
        </div>
        <div class="bill-card-body">
          <div class="bill-stats">
            <div class="bill-stat-item">
              <span class="bill-stat-label">Today's Sales</span>
              <span class="bill-stat-val">${formatCurrency(bill.todaysCollection)}</span>
            </div>
            <div class="bill-stat-item">
              <span class="bill-stat-label">Grand Total</span>
              <span class="bill-stat-val grand">${formatCurrency(bill.grandTotal)}</span>
            </div>
          </div>
        </div>
        <div class="bill-card-actions">
          <button class="btn btn-secondary btn-view" onclick="viewBillDetails('${bill.id}')">
            <span class="material-icons-round" style="font-size: 16px;">visibility</span> View
          </button>
          <button class="btn btn-outline btn-delete" onclick="handleDeleteBill('${bill.id}')" style="color: var(--error-color); border-color: rgba(211,47,47,0.2);">
            <span class="material-icons-round" style="font-size: 16px;">delete</span> Delete
          </button>
        </div>
      </div>
    `;
  }).join("");
}

// ------ VIEW BILL DETAILS ------
window.viewBillDetails = function (id) {
  const bill = state.bills.find(b => b.id === id);
  if (!bill) return;

  const viewModalBody = document.getElementById("viewModalBody");

  viewModalBody.innerHTML = `
    <div class="view-details">
      <div class="view-section">
        <div class="view-section-title">General Info</div>
        <div class="view-meta-grid">
          <div class="view-meta-item">
            <span class="view-meta-lbl">Cinema Name</span>
            <span class="view-meta-val">${escapeHTML(bill.cinemaName)}</span>
          </div>
          <div class="view-meta-item">
            <span class="view-meta-lbl">Movie Name</span>
            <span class="view-meta-val">${escapeHTML(bill.movieName)}</span>
          </div>
          <div class="view-meta-item">
            <span class="view-meta-lbl">Date</span>
            <span class="view-meta-val">${formatDateDisplay(bill.date)}</span>
          </div>
          <div class="view-meta-item">
            <span class="view-meta-lbl">Day Number</span>
            <span class="view-meta-val">${bill.dayNumber}</span>
          </div>
        </div>
      </div>

      <div class="view-section">
        <div class="view-section-title">Rates</div>
        <div class="view-meta-grid">
          <div class="view-meta-item">
            <span class="view-meta-lbl">Balcony Rate</span>
            <span class="view-meta-val">${formatCurrency(bill.balconyRate)}</span>
          </div>
          <div class="view-meta-item">
            <span class="view-meta-lbl">Reserve Rate</span>
            <span class="view-meta-val">${formatCurrency(bill.reserveRate)}</span>
          </div>
        </div>
      </div>

      <div class="view-section">
        <div class="view-section-title">Shows Breakup</div>
        <table class="view-shows-table">
          <thead>
            <tr>
              <th>Show</th>
              <th>Balcony</th>
              <th>Reserve</th>
              <th>Net Amount</th>
            </tr>
          </thead>
          <tbody>
            ${bill.shows.map(show => `
              <tr>
                <td><strong>${show.time}</strong></td>
                <td>${show.balconyTickets}</td>
                <td>${show.reserveTickets}</td>
                <td><strong>${formatCurrency(show.amount)}</strong></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      <div class="view-section">
        <div class="view-section-title">Financial Summary</div>
        <div class="view-meta-grid">
          <div class="view-meta-item">
            <span class="view-meta-lbl">Today's Tickets</span>
            <span class="view-meta-val">${bill.totalTickets}</span>
          </div>
          <div class="view-meta-item">
            <span class="view-meta-lbl">Previous Tickets</span>
            <span class="view-meta-val">${bill.previousTickets || 0}</span>
          </div>
          <div class="view-meta-item">
            <span class="view-meta-lbl">Total Tickets</span>
            <span class="view-meta-val">${bill.grandTotalTickets || bill.totalTickets}</span>
          </div>
          <div class="view-meta-item">
            <span class="view-meta-lbl">Today's Collection</span>
            <span class="view-meta-val">${formatCurrency(bill.todaysCollection)}</span>
          </div>
          <div class="view-meta-item">
            <span class="view-meta-lbl">Previous Collection</span>
            <span class="view-meta-val">${formatCurrency(bill.previousCollection)}</span>
          </div>
          <div class="view-meta-item">
            <span class="view-meta-lbl" style="font-weight:700; color:var(--primary-color);">Grand Total</span>
            <span class="view-meta-val" style="font-size:1.2rem; font-weight:800; color:var(--primary-color);">${formatCurrency(bill.grandTotal)}</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // Attach PDF Actions
  document.getElementById("btnViewPDF").onclick = () => generatePDFReport(bill);
  document.getElementById("btnSharePDF").onclick = () => sharePDFReport(bill);

  document.getElementById("viewModal").classList.remove("hidden");
};

// ------ EDIT BILL MODAL ------
window.openEditModal = function (id) {
  const bill = state.bills.find(b => b.id === id);
  if (!bill) return;

  state.currentBillId = id;
  const modalBody = document.getElementById("editModalBody");

  modalBody.innerHTML = `
    <div class="form-group">
      <label for="editMovieName" class="form-label">Movie Name</label>
      <input type="text" id="editMovieName" class="form-input" value="${escapeHTML(bill.movieName)}">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label for="editDate" class="form-label">Date</label>
        <input type="date" id="editDate" class="form-input" value="${bill.date}">
      </div>
      <div class="form-group">
        <label for="editDayNumber" class="form-label">Day Number</label>
        <input type="number" id="editDayNumber" class="form-input" value="${bill.dayNumber}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label for="editBalconyRate" class="form-label">Balcony Rate</label>
        <input type="number" id="editBalconyRate" class="form-input" value="${bill.balconyRate}" step="0.01">
      </div>
      <div class="form-group">
        <label for="editReserveRate" class="form-label">Reserve Rate</label>
        <input type="number" id="editReserveRate" class="form-input" value="${bill.reserveRate}" step="0.01">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label for="editPreviousCollection" class="form-label">Previous Collection</label>
        <input type="number" id="editPreviousCollection" class="form-input" value="${bill.previousCollection}" step="0.01">
      </div>
      <div class="form-group">
        <label for="editPreviousTickets" class="form-label">Previous Tickets</label>
        <input type="number" id="editPreviousTickets" class="form-input" value="${bill.previousTickets || 0}">
      </div>
    </div>

    <div class="view-section-title" style="margin-top: 20px;">Shows Tickets Data</div>
    ${bill.shows.map((show, i) => `
      <div class="card" style="margin-bottom:10px; padding:12px;">
        <div style="font-weight:700; margin-bottom:8px; font-size:0.9rem;">${show.time}</div>
        <div class="form-row">
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Balcony</label>
            <input type="number" class="form-input edit-show-balcony" data-show="${i}" value="${show.balconyTickets}">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Reserve</label>
            <input type="number" class="form-input edit-show-reserve" data-show="${i}" value="${show.reserveTickets}">
          </div>
        </div>
      </div>
    `).join("")}
  `;

  document.getElementById("editModal").classList.remove("hidden");
};

function handleUpdateBill() {
  if (!state.currentBillId) return;

  const movie = document.getElementById("editMovieName").value.trim();
  if (!movie) {
    showToast("Please enter a Movie Name", "error");
    return;
  }

  const balconyRate = parseFloat(document.getElementById("editBalconyRate").value) || 0;
  const reserveRate = parseFloat(document.getElementById("editReserveRate").value) || 0;
  const previousCollection = parseFloat(document.getElementById("editPreviousCollection").value) || 0;

  const shows = [];
  let totalTickets = 0;
  let todaysCollection = 0;

  const balconyInputs = document.querySelectorAll(".edit-show-balcony");
  const reserveInputs = document.querySelectorAll(".edit-show-reserve");

  for (let i = 0; i < SHOW_TIMES.length; i++) {
    const balcony = parseInt(balconyInputs[i].value) || 0;
    const reserve = parseInt(reserveInputs[i].value) || 0;
    const amount = (balcony * balconyRate) + (reserve * reserveRate);

    shows.push({
      time: SHOW_TIMES[i],
      balconyTickets: balcony,
      reserveTickets: reserve,
      amount: amount
    });

    todaysCollection += amount;
    totalTickets += (balcony + reserve);
  }

  const previousTickets = parseInt(document.getElementById("editPreviousTickets").value) || 0;

  // Update existing list
  state.bills = state.bills.map(b => {
    if (b.id === state.currentBillId) {
      return {
        ...b,
        movieName: movie,
        date: document.getElementById("editDate").value,
        dayNumber: parseInt(document.getElementById("editDayNumber").value) || 1,
        balconyRate,
        reserveRate,
        previousCollection,
        previousTickets,
        shows,
        totalTickets,
        grandTotalTickets: totalTickets + previousTickets,
        todaysCollection,
        grandTotal: todaysCollection + previousCollection,
        timestamp: Date.now() // Update stamp
      };
    }
    return b;
  });

  saveDataToStorage();
  showToast("Bill updated successfully", "success");
  document.getElementById("editModal").classList.add("hidden");
  state.currentBillId = null;
  renderHistory();
  renderAnalytics();
}

// ------ DELETE BILL (WITH UNDO) ------
window.handleDeleteBill = function (id) {
  showConfirmDialog("Delete Bill", "Are you sure you want to delete this bill? You can undo this temporarily.", () => {
    const targetBill = state.bills.find(b => b.id === id);
    if (!targetBill) return;

    // Cache the last deleted item for potential undoing
    state.lastDeletedBill = targetBill;

    // Remove from active state
    state.bills = state.bills.filter(b => b.id !== id);
    saveDataToStorage();
    renderHistory();
    renderAnalytics();

    // Trigger undo snackbar
    const snackbar = document.getElementById("undoSnackbar");
    snackbar.classList.remove("hidden");

    // Clear previous timeouts if any
    if (state.undoTimeoutId) {
      clearTimeout(state.undoTimeoutId);
    }

    // Hide undo bar after 6 seconds
    state.undoTimeoutId = setTimeout(() => {
      snackbar.classList.add("hidden");
      state.lastDeletedBill = null;
    }, 6000);
  });
};

function handleUndoDelete() {
  if (state.lastDeletedBill) {
    state.bills.push(state.lastDeletedBill);
    saveDataToStorage();

    state.lastDeletedBill = null;
    document.getElementById("undoSnackbar").classList.add("hidden");

    renderHistory();
    renderAnalytics();
    showToast("Delete undone!", "success");
  }
}

// ------ ANALYTICS PAGE ------
function renderAnalytics() {
  const totalRevenueEl = document.getElementById("statTotalRevenue");
  const totalTicketsEl = document.getElementById("statTotalTickets");
  const avgDailyEl = document.getElementById("statAvgDaily");
  const popularMovieEl = document.getElementById("statPopularMovie");
  const totalBillsEl = document.getElementById("statTotalBills");
  const bestDayEl = document.getElementById("statBestDay");

  if (state.bills.length === 0) {
    totalRevenueEl.textContent = "Rs. 0.00";
    totalTicketsEl.textContent = "0";
    avgDailyEl.textContent = "Rs. 0.00";
    popularMovieEl.textContent = "—";
    totalBillsEl.textContent = "0";
    bestDayEl.textContent = "Rs. 0.00";
    document.getElementById("monthlyChart").innerHTML = "";
    document.getElementById("monthlyChartEmpty").classList.remove("hidden");
    document.getElementById("moviePerformanceList").innerHTML = "";
    document.getElementById("moviePerfEmpty").classList.remove("hidden");
    return;
  }

  document.getElementById("monthlyChartEmpty").classList.add("hidden");
  document.getElementById("moviePerfEmpty").classList.add("hidden");

  // Get current month key
  const now = new Date();
  const currentMonthKey = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");

  // Filter bills for current month
  const currentMonthBills = state.bills.filter(b => b.date && b.date.substring(0, 7) === currentMonthKey);

  // Calculate CURRENT MONTH stats
  let monthRevenue = 0;
  let monthTickets = 0;
  let monthMaxRevenue = 0;
  const monthMovieSales = {};

  currentMonthBills.forEach(bill => {
    monthRevenue += bill.todaysCollection;
    monthTickets += bill.totalTickets;
    if (bill.todaysCollection > monthMaxRevenue) monthMaxRevenue = bill.todaysCollection;

    const mName = bill.movieName.trim();
    if (!monthMovieSales[mName]) monthMovieSales[mName] = { revenue: 0, tickets: 0, daysCount: 0 };
    monthMovieSales[mName].revenue += bill.todaysCollection;
    monthMovieSales[mName].tickets += bill.totalTickets;
    monthMovieSales[mName].daysCount += 1;
  });

  const monthAvgDaily = currentMonthBills.length > 0 ? monthRevenue / currentMonthBills.length : 0;

  let bestMonthMovie = "—";
  let bestMonthMovieRevenue = 0;
  Object.keys(monthMovieSales).forEach(mName => {
    if (monthMovieSales[mName].revenue > bestMonthMovieRevenue) {
      bestMonthMovieRevenue = monthMovieSales[mName].revenue;
      bestMonthMovie = mName;
    }
  });

  // Render current month stats
  totalRevenueEl.textContent = formatCurrency(monthRevenue);
  totalTicketsEl.textContent = monthTickets.toLocaleString();
  avgDailyEl.textContent = formatCurrency(monthAvgDaily);
  popularMovieEl.textContent = bestMonthMovie;
  totalBillsEl.textContent = currentMonthBills.length;
  bestDayEl.textContent = formatCurrency(monthMaxRevenue);

  // Build monthly revenue map from ALL bills for chart
  const monthlyRevenue = {};
  const movieSales = {};

  state.bills.forEach(bill => {
    if (bill.date) {
      const monthKey = bill.date.substring(0, 7);
      monthlyRevenue[monthKey] = (monthlyRevenue[monthKey] || 0) + bill.todaysCollection;
    }
    const mName = bill.movieName.trim();
    if (!movieSales[mName]) movieSales[mName] = { revenue: 0, tickets: 0, daysCount: 0 };
    movieSales[mName].revenue += bill.todaysCollection;
    movieSales[mName].tickets += bill.totalTickets;
    movieSales[mName].daysCount += 1;
  });

  // Render Monthly Revenue Bar Chart
  renderMonthlyChart(monthlyRevenue);

  // Render Movie Performance Table
  renderMoviePerformance(movieSales);
}

function renderMonthlyChart(monthlyData) {
  const chartContainer = document.getElementById("monthlyChart");
  chartContainer.innerHTML = "";

  const months = Object.keys(monthlyData).sort();
  if (months.length === 0) return;

  const maxVal = Math.max(...Object.values(monthlyData));

  months.forEach(mKey => {
    const val = monthlyData[mKey];
    const heightPercent = maxVal > 0 ? (val / maxVal) * 80 : 10; // Max 80% to fit top labels

    const barWrap = document.createElement("div");
    barWrap.className = "chart-bar-wrap";

    // Format Month display from "2026-07" to "Jul 26"
    const dateObj = new Date(mKey + "-02"); // Add offset to prevent timezone shift
    const formattedMonth = dateObj.toLocaleDateString("en-US", { month: "short", year: "2-digit" });

    barWrap.innerHTML = `
      <div class="chart-bar" style="height: ${heightPercent}%">
        <span class="chart-bar-val">${formatCompactCurrency(val)}</span>
      </div>
      <span class="chart-bar-label">${formattedMonth}</span>
    `;

    chartContainer.appendChild(barWrap);
  });
}

function renderMoviePerformance(movieSales) {
  const performanceList = document.getElementById("moviePerformanceList");
  performanceList.innerHTML = "";

  const sortedMovies = Object.keys(movieSales).sort((a, b) => movieSales[b].revenue - movieSales[a].revenue);

  performanceList.innerHTML = sortedMovies.map(movie => {
    const data = movieSales[movie];
    return `
      <div class="performance-item">
        <div>
          <div class="performance-movie-name">${escapeHTML(movie)}</div>
          <div class="performance-movie-meta">${data.daysCount} Run Days • ${data.tickets.toLocaleString()} Tix</div>
        </div>
        <div class="performance-revenue">${formatCurrency(data.revenue)}</div>
      </div>
    `;
  }).join("");
}

// ------ SETTINGS PAGE ACTIONS ------
function handleSaveSettings() {
  const defaultBalconyRate = parseFloat(document.getElementById("settBalconyRate").value) || 0;
  const defaultReserveRate = parseFloat(document.getElementById("settReserveRate").value) || 0;
  const currency = document.getElementById("settCurrency").value;

  state.settings.defaultBalconyRate = defaultBalconyRate;
  state.settings.defaultReserveRate = defaultReserveRate;
  state.settings.currency = currency;

  saveDataToStorage();
  applySettings();

  // Re-calculate home values with new settings
  calculateHomeAmounts();

  showToast("Settings saved successfully", "success");

  // Navigate back home
  setTimeout(() => {
    switchPage("pageHome");
  }, 400);
}

// ------ JSON BACKUP / RESTORE ------
function exportJSONBackup() {
  try {
    const backupData = {
      version: "1.0",
      settings: state.settings,
      bills: state.bills,
      exportedAt: Date.now()
    };

    const jsonStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `cinebill_backup_${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();

    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Backup exported successfully", "success");
  } catch (e) {
    showToast("Failed to export backup", "error");
    console.error(e);
  }
}

function handleImportJSON(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (evt) {
    try {
      const data = JSON.parse(evt.target.result);

      // Validation of basic data structure
      if (data && Array.isArray(data.bills)) {
        showConfirmDialog("Import Backup", `Importing will append ${data.bills.length} bills to your current logs. Do you want to proceed?`, () => {
          // De-duplicate imported bills by ID
          const existingIds = new Set(state.bills.map(b => b.id));
          let importCount = 0;

          data.bills.forEach(importedBill => {
            if (!existingIds.has(importedBill.id)) {
              state.bills.push(importedBill);
              importCount++;
            }
          });

          if (data.settings) {
            state.settings = { ...state.settings, ...data.settings };
          }

          saveDataToStorage();
          applySettings();
          renderHistory();
          renderAnalytics();
          populateMovieList();
          calculateHomeAmounts();

          showToast(`Successfully imported ${importCount} bills.`, "success");
        });
      } else {
        showToast("Invalid backup file structure", "error");
      }
    } catch (err) {
      showToast("Error parsing backup JSON", "error");
      console.error(err);
    }
  };
  reader.readAsText(file);
  e.target.value = ""; // Reset file input
}

// ------ PDF GENERATION ENGINE ------
function generatePDFReport(bill) {
  try {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) {
      showToast("PDF Engine loading. Please retry in a second.", "info");
      return;
    }

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4"
    });

    const primaryColor = [46, 125, 50]; // #2E7D32
    const textColor = [26, 35, 30]; // Dark text

    // Layout configuration
    let y = 20;

    // Header Background Accent block
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, 210, 38, "F");

    // Header text
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text(bill.cinemaName.toUpperCase(), 15, 18);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("DAILY COLLECTION STATEMENT & BILL", 15, 28);

    // Meta-data Block
    y = 48;
    doc.setTextColor(...textColor);
    doc.setFontSize(10);

    // Left side info
    doc.setFont("helvetica", "bold");
    doc.text("MOVIE NAME:", 15, y);
    doc.setFont("helvetica", "normal");
    doc.text(bill.movieName, 45, y);

    // Right side info
    doc.setFont("helvetica", "bold");
    doc.text("DATE:", 140, y);
    doc.setFont("helvetica", "normal");
    doc.text(formatDateDisplay(bill.date), 160, y);

    y += 8;
    doc.setFont("helvetica", "bold");
    doc.text("RUN DAY:", 15, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(bill.dayNumber), 45, y);

    doc.setFont("helvetica", "bold");
    doc.text("TIMING:", 140, y);
    doc.setFont("helvetica", "normal");
    doc.text("Daily 4 Shows", 160, y);

    // Rates info
    y += 12;
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(15, y, 195, y);

    y += 6;
    doc.setFont("helvetica", "bold");
    doc.text("TICKET RATE INFO:", 15, y);
    doc.setFont("helvetica", "normal");
    doc.text(`Balcony Rate: ${formatCurrency(bill.balconyRate)}  |  Reserve Rate: ${formatCurrency(bill.reserveRate)}`, 55, y);

    y += 8;
    doc.line(15, y, 195, y);

    // Shows Breakup Table Header
    y += 12;
    doc.setFillColor(240, 244, 240);
    doc.rect(15, y, 180, 8, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("SHOW TIME", 18, y + 5);
    doc.text("BALCONY SOLD", 60, y + 5);
    doc.text("RESERVE SOLD", 105, y + 5);
    doc.text("NET AMOUNT", 160, y + 5);

    // Shows data loop
    y += 8;
    bill.shows.forEach((show, index) => {
      // Row tint shading
      if (index % 2 === 1) {
        doc.setFillColor(250, 252, 250);
        doc.rect(15, y, 180, 10, "F");
      }

      doc.setFont("helvetica", "normal");
      doc.text(show.time, 18, y + 6);
      doc.text(String(show.balconyTickets), 60, y + 6);
      doc.text(String(show.reserveTickets), 105, y + 6);
      doc.setFont("helvetica", "bold");
      doc.text(formatCurrency(show.amount), 160, y + 6);

      y += 10;
    });

    // Divider
    doc.line(15, y, 195, y);

    // Financial Calculation Summary
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("TODAY'S TICKETS:", 15, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(bill.totalTickets), 65, y);

    doc.setFont("helvetica", "bold");
    doc.text("TODAY'S COLLECTION:", 120, y);
    doc.text(formatCurrency(bill.todaysCollection), 165, y);

    y += 8;
    doc.setFont("helvetica", "bold");
    doc.text("PREVIOUS TICKETS:", 15, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(bill.previousTickets || 0), 65, y);
    
    doc.setFont("helvetica", "bold");
    doc.text("PREVIOUS COLLECTION:", 120, y);
    doc.setFont("helvetica", "normal");
    doc.text(formatCurrency(bill.previousCollection), 165, y);

    y += 8;
    doc.setFont("helvetica", "bold");
    doc.text("GRAND TICKETS:", 15, y + 6);
    doc.setFont("helvetica", "normal");
    doc.text(String(bill.grandTotalTickets || bill.totalTickets), 65, y + 6);
    // Accent fill for Grand Total
    doc.setFillColor(230, 245, 230);
    doc.rect(115, y, 80, 10, "F");
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...primaryColor);
    doc.text("GRAND TOTAL:", 120, y + 6);
    doc.text(formatCurrency(bill.grandTotal), 165, y + 6);

    // Footer
    y = 275;
    doc.setDrawColor(220, 220, 220);
    doc.line(15, y, 195, y);

    doc.setTextColor(150, 150, 150);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("Generated by akshatstudio", 15, y + 6);
    doc.text("Page 1 of 1", 175, y + 6);

    // Save
    doc.save(`CinemaBill_${bill.movieName.replace(/\s+/g, '_')}_Day${bill.dayNumber}.pdf`);
    showToast("PDF report generated successfully", "success");
    return doc;
  } catch (error) {
    showToast("Failed to generate PDF", "error");
    console.error(error);
  }
}

// Share PDF using Web Share API
function sharePDFReport(bill) {
  try {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) {
      showToast("PDF Engine loading. Please retry in a second.", "info");
      return;
    }

    // Call same generation process, get doc instance
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4"
    });

    const primaryColor = [46, 125, 50];
    const textColor = [26, 35, 30];
    let y = 20;

    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, 210, 38, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text(bill.cinemaName.toUpperCase(), 15, 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("DAILY COLLECTION STATEMENT & BILL", 15, 28);

    y = 48;
    doc.setTextColor(...textColor);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("MOVIE NAME:", 15, y);
    doc.setFont("helvetica", "normal");
    doc.text(bill.movieName, 45, y);
    doc.setFont("helvetica", "bold");
    doc.text("DATE:", 140, y);
    doc.setFont("helvetica", "normal");
    doc.text(formatDateDisplay(bill.date), 160, y);

    y += 8;
    doc.setFont("helvetica", "bold");
    doc.text("RUN DAY:", 15, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(bill.dayNumber), 45, y);
    doc.setFont("helvetica", "bold");
    doc.text("TIMING:", 140, y);
    doc.setFont("helvetica", "normal");
    doc.text("Daily 4 Shows", 160, y);

    y += 12;
    doc.setDrawColor(200, 200, 200);
    doc.line(15, y, 195, y);
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.text("TICKET RATE INFO:", 15, y);
    doc.setFont("helvetica", "normal");
    doc.text(`Balcony Rate: ${formatCurrency(bill.balconyRate)}  |  Reserve Rate: ${formatCurrency(bill.reserveRate)}`, 55, y);
    y += 8;
    doc.line(15, y, 195, y);

    y += 12;
    doc.setFillColor(240, 244, 240);
    doc.rect(15, y, 180, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("SHOW TIME", 18, y + 5);
    doc.text("BALCONY SOLD", 60, y + 5);
    doc.text("RESERVE SOLD", 105, y + 5);
    doc.text("NET AMOUNT", 160, y + 5);

    y += 8;
    bill.shows.forEach((show, index) => {
      if (index % 2 === 1) {
        doc.setFillColor(250, 252, 250);
        doc.rect(15, y, 180, 10, "F");
      }
      doc.setFont("helvetica", "normal");
      doc.text(show.time, 18, y + 6);
      doc.text(String(show.balconyTickets), 60, y + 6);
      doc.text(String(show.reserveTickets), 105, y + 6);
      doc.setFont("helvetica", "bold");
      doc.text(formatCurrency(show.amount), 160, y + 6);
      y += 10;
    });

    doc.line(15, y, 195, y);

    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("TODAY'S TICKETS:", 15, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(bill.totalTickets), 65, y);
    doc.setFont("helvetica", "bold");
    doc.text("TODAY'S COLLECTION:", 120, y);
    doc.text(formatCurrency(bill.todaysCollection), 165, y);

    y += 8;
    doc.setFont("helvetica", "bold");
    doc.text("PREVIOUS TICKETS:", 15, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(bill.previousTickets || 0), 65, y);
    doc.setFont("helvetica", "bold");
    doc.text("PREVIOUS COLLECTION:", 120, y);
    doc.setFont("helvetica", "normal");
    doc.text(formatCurrency(bill.previousCollection), 165, y);

    y += 8;
    doc.setFont("helvetica", "bold");
    doc.text("GRAND TICKETS:", 15, y + 6);
    doc.setFont("helvetica", "normal");
    doc.text(String(bill.grandTotalTickets || bill.totalTickets), 65, y + 6);
    doc.setFillColor(230, 245, 230);
    doc.rect(115, y, 80, 10, "F");
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...primaryColor);
    doc.text("GRAND TOTAL:", 120, y + 6);
    doc.text(formatCurrency(bill.grandTotal), 165, y + 6);

    y = 275;
    doc.setDrawColor(220, 220, 220);
    doc.line(15, y, 195, y);
    doc.setTextColor(150, 150, 150);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("Generated by Cinema Bill App", 15, y + 6);
    doc.text("Page 1 of 1", 175, y + 6);

    const pdfOutputBlob = doc.output("blob");
    const fileName = `CinemaBill_${bill.movieName.replace(/\s+/g, '_')}_Day${bill.dayNumber}.pdf`;
    const file = new File([pdfOutputBlob], fileName, { type: "application/pdf" });

    // Web Share API check
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({
        files: [file],
        title: `Bill Report: ${bill.movieName}`,
        text: `Daily collection report for Mrityunjay Cineplex - Day ${bill.dayNumber}`
      })
        .then(() => showToast("Shared successfully", "success"))
        .catch((error) => console.log("Share failed or cancelled", error));
    } else {
      // Fallback
      doc.save(fileName);
      showToast("PDF shared via download fallback", "info");
    }
  } catch (error) {
    showToast("Sharing failed", "error");
    console.error(error);
  }
}

// ------ NOTIFICATIONS & UI ELEMENTS ------
function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  let icon = "info";
  if (type === "success") icon = "check_circle";
  if (type === "error") icon = "error";

  toast.innerHTML = `
    <span class="material-icons-round toast-icon">${icon}</span>
    <span>${escapeHTML(message)}</span>
  `;

  container.appendChild(toast);

  // Animate out and remove
  setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3000);
}

function showConfirmDialog(title, message, onConfirm) {
  const overlay = document.getElementById("dialogOverlay");
  const titleEl = document.getElementById("dialogTitle");
  const msgEl = document.getElementById("dialogMessage");
  const confirmBtn = document.getElementById("dialogConfirm");
  const cancelBtn = document.getElementById("dialogCancel");
  const iconWrap = document.getElementById("dialogIconWrap");
  const icon = document.getElementById("dialogIcon");

  titleEl.textContent = title;
  msgEl.textContent = message;

  // Custom styled dialog classes
  if (title.toLowerCase().includes("danger") || title.toLowerCase().includes("delete")) {
    iconWrap.className = "dialog-icon-wrap danger";
    icon.textContent = "warning";
  } else {
    iconWrap.className = "dialog-icon-wrap confirm";
    icon.textContent = "help_outline";
  }

  // Clear previous actions
  const newConfirmBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

  newConfirmBtn.addEventListener("click", () => {
    overlay.classList.add("hidden");
    onConfirm();
  });

  cancelBtn.onclick = () => {
    overlay.classList.add("hidden");
  };

  overlay.classList.remove("hidden");
}

// ------ UTILITY FUNCTIONS ------
function formatCurrency(amount) {
  const numericAmount = parseFloat(amount) || 0;
  const formattedNumber = numericAmount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${state.settings.currency} ${formattedNumber}`;
}

function formatCompactCurrency(amount) {
  const symbol = state.settings.currency;
  if (amount >= 10000000) {
    return `${symbol} ${(amount / 10000000).toFixed(1)}Cr`;
  }
  if (amount >= 100000) {
    return `${symbol} ${(amount / 100000).toFixed(1)}L`;
  }
  if (amount >= 1000) {
    return `${symbol} ${(amount / 1000).toFixed(1)}k`;
  }
  const numericAmount = parseFloat(amount) || 0;
  return `${symbol} ${numericAmount.toFixed(2)}`;
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return "—";
  const [year, month, day] = dateStr.split("-");
  return `${day}.${month}.${year}`;
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function escapeHTML(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>'"]/g,
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}
