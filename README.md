# ⚡ Notifai space

> Modern Multi-Platform Task & Activity Management Ecosystem with **Neon DB (PostgreSQL)**, **React**, **React Native (Expo)**, **Flutterwave Subscriptions**, and **Render Deployment**.

---

## 🌟 Highlights & Features

1. **Rebranded to Notifai space**:
   - Modernized from monolithic EJS into clean decoupled architecture: `backend/`, `web/`, and `mobile/`.
2. **Neon DB (PostgreSQL)**:
   - Serverless PostgreSQL with SSL connection pooling.
   - Robust relational schema for users, subscriptions, duration tiers, tasks, reminders, and offline sync tracking.
3. **Task Quota Enforcement & Configurable Subscription Tiers**:
   - Task creation limits tied directly to the user's active subscription (e.g. Free: 10 tasks, Pro: 100 tasks, Unlimited: 10,000 tasks).
   - Subscription periods: **1 Month, 3 Months, 6 Months, and 12 Months**.
   - Admin Panel (`/admin`) allows dynamic configuration of duration pricing and task quotas in real-time.
4. **Flutterwave Payments**:
   - Integrated with Flutterwave Standard Checkout for purchasing 1, 3, 6, and 12-month subscriptions.
   - Automatic webhook verification and instant quota upgrade.
5. **Full Deadline Reminder System & Render Emails**:
   - Automated cron worker running every 60 seconds on the backend.
   - Rich HTML emails sent via Nodemailer (configured for Render and SMTP) with 1-click interactive action buttons:
     - 🟢 **Okay I know**
     - 🟡 **Remind me in 30 minutes**
     - 🔴 **Don't remind**
   - Push notifications dispatched via **Expo Server SDK** and **Web Push**.
6. **React Native Mobile App (`mobile/`)**:
   - **Offline-First Storage**: Local database saves tasks, countdowns, and completion states without internet.
   - **3-Day Offline Limit Enforcement**: Works completely offline for up to 3 days (72 hours). After 72 hours without internet, displays the `OfflineSyncGuardModal` requiring a network sync before further offline task modifications can continue.
   - **Display Over Other Apps / Heads-Up Alarm Overlay**: When a task reaches its deadline, displays an urgent reminder dialog over other apps with the three required user confirmation buttons:
     - `✅ Okay I know`
     - `⏰ Remind me in 30 minutes` (automatically reschedules for +30m)
     - `🔕 Don't remind`
   - **Android Home Screen Note Widget Panel**: Sticky note widget that displays today's uncompleted tasks with interactive checkboxes right on the home screen.

---

## 📁 Repository Structure

```
Notifai space/
├── backend/                  # Node.js + Express + Neon PostgreSQL API
│   ├── src/
│   │   ├── database/         # Neon DB connection & auto-setup schema
│   │   ├── middleware/       # JWT auth, task quota limit guard, admin guard
│   │   ├── routes/           # Auth, Tasks, Sync, Reminders, Subscriptions, Admin
│   │   ├── services/         # Email (Render), Push (Expo), Flutterwave, Cron worker
│   │   └── server.js         # Entrypoint
│   └── package.json
│
├── web/                      # React (Vite + Tailwind CSS) Web & Admin App
│   ├── src/
│   │   ├── components/       # CountdownTimer, TaskCard, CreateTaskModal, Navbar
│   │   ├── pages/            # Dashboard, Tasks, Subscriptions, PaymentCallback
│   │   ├── pages/admin/      # AdminDashboard, AdminPlansPage, AdminUsersPage
│   │   └── context/          # AuthContext with live quota tracking
│   └── package.json
│
├── mobile/                   # React Native (Expo) Mobile App
│   ├── src/
│   │   ├── services/         # offlineStorage (3-day grace guard), syncEngine, notificationService
│   │   └── components/       # DisplayOverOtherAppsModal, HomeScreenNotePanel, OfflineSyncGuardModal
│   ├── App.js                # Mobile Companion interface
│   ├── app.json              # Android permissions (SYSTEM_ALERT_WINDOW, WAKE_LOCK, NOTIFICATIONS)
│   └── package.json
│
├── render.yaml               # Render Deployment Blueprint
└── package.json              # Monorepo orchestration scripts
```

---

## 🚀 Getting Started

### 1. Backend Setup & Neon DB
1. Open `backend/.env` and ensure your Neon DB connection string is set:
   ```env
   DATABASE_URL=postgresql://neondb_owner:YOUR_PASSWORD@ep-sample.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
2. Run database setup and initial seeding:
   ```bash
   cd backend
   npm install
   npm run db:setup
   npm start
   ```
   *The backend will automatically start listening on port 5000 and run the 60-second deadline reminder cron worker.*

### 2. Web App & Admin Portal
```bash
cd web
npm install
npm run dev
```
- Open `http://localhost:5173`
- Default Admin Login: `admin@notifai.space` / `admin123456` at `/admin/login`.

### 3. Mobile App (React Native / Expo)
```bash
cd mobile
npm install
npm start
```
- Press `a` to run on Android Emulator or scan QR code with Expo Go.
- To test the **"Display Over Other Apps"** confirmation dialog, tap the **"🔔 Test Overlay"** button in the top bar.
- To test the **3-day offline sync**, turn off Wi-Fi/cellular and observe the 72-hour countdown pill.

---

## 💳 Flutterwave & Subscription Configuration

1. In the **Admin Panel** (`/admin/plans`), configure:
   - Max task creation limits for each plan.
   - Pricing for **1 Month, 3 Months, 6 Months, and 12 Months**.
2. When users subscribe, Flutterwave opens the secure payment checkout.
3. Upon completion, the task creation quota is immediately upgraded, and a receipt email is sent to the user.
