# Mrityunjay Cineplex - Daily Collection PWA

A mobile-first, offline-ready Progressive Web App (PWA) designed to replace the Excel-based daily collection sheets for **Mrityunjay Cineplex**. Built with modern, high-performance vanilla web technologies.

---

## 🌟 Key Features

* **Offline-First**: Fully functional offline. Updates are cached via Service Worker so it runs smoothly even with zero connectivity.
* **Instant Calculations**: No "Calculate" button. Amounts, Ticket counts, Today's Collection, and Grand Totals update live as you type.
* **Complete Bill History**: Displays all previous statements in card-based designs with sorting (newest first) and search by Movie, Date, or Day.
* **Interactive Analytics**:
  * Total revenue & total ticket sales trackers.
  * Average daily collection.
  * Popular movie ranking.
  * Custom dynamic monthly revenue bar charts.
* **Professional PDF Generation**: Generates clean, formatted collection statement PDF reports complete with cinema branding and totals.
* **Direct Web Sharing**: Allows sharing PDF statements instantly to other messaging apps or email using Android's native share menu.
* **Theme Customization**: Beautiful, premium light and dark themes. Remembers preferences.
* **Safety & Backups**: Import/Export all historical records as simple JSON backup files.
* **Efficiency Boosters**: Duplicate previous day's general fields instantly (rates, movie details, grand totals) to minimize typing.

---

## 📂 Project Structure

```text
CinemaBillApp/
├── index.html          # Shell layout & semantic views (Home, History, Analytics, Settings)
├── style.css           # Premium dark/light themes & design token definitions
├── script.js           # Live math engine, modal controls, PDF renderer & JSON operations
├── manifest.json       # Web app manifest for Android/Chrome installability
├── sw.js               # Service worker for assets caching & offline availability
└── assets/
    └── icons/
        └── icon-512.png # High-res app icon launcher
```

---

## 🚀 Quick Start Guide

### 1. Running locally
Simply open the `index.html` file using **Live Server** in VS Code or any local web server:
```bash
# E.g. using npx http-server
npx http-server ./CinemaBillApp
```
*Open `http://localhost:8080` (or the port provided by the tool) in Google Chrome.*

### 2. Installing on Android (PWA)
1. Serve the application over `HTTPS` or run on `localhost`.
2. Open the page inside **Google Chrome** on your Android device.
3. Tap the **three-dots menu** at the top right.
4. Select **Add to Home screen** or **Install app**.
5. Once installed, it will launch full-screen without Chrome browser UI.

---

## 🧾 Technical Specs & Math Formulations

* **Net Show Amount Formula**:
  $$\text{Net Amount} = (\text{Balcony Tickets} \times \text{Balcony Rate}) + (\text{Reserve Tickets} \times \text{Reserve Rate})$$
* **Today's Total Tickets**:
  $$\text{Total Tickets} = \sum (\text{Balcony Tickets} + \text{Reserve Tickets})$$
* **Today's Collection**:
  $$\text{Today's Collection} = \sum \text{Show Net Amounts}$$
* **Grand Total**:
  $$\text{Grand Total} = \text{Today's Collection} + \text{Previous Day's Collection}$$

---

## ⚡ Future Additions
* Future-ready structure for Excel file exports using client-side sheet parsers.
* Dynamic configuration to support variable numbers of daily shows.
