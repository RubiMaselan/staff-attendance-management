# 🏢 AttendEase – Intern & Contract Staff Attendance System

A lightweight attendance management system for small companies.

## Tech Stack
- **Backend:** Node.js + Express + sql.js (SQLite, zero native deps)
- **Frontend:** Vanilla HTML/CSS/JS (no build tools needed)

## Quick Start

```bash
cd backend
npm install
node server.js
```

Then open **http://localhost:3000** in your browser.

## Default Admin Login
| Field    | Value               |
|----------|---------------------|
| Email    | admin@company.com   |
| Password | admin123            |

---

## Features

### 👤 Staff Management (Admin)
- Add, edit, deactivate staff
- Set staff type: Intern / Contract
- Department, start/end dates

### 🕐 Clock In/Out (Staff)
- One-click clock in & out
- Duplicate clock-in prevention
- Auto-detect **Late** (after 9:00 AM)
- Auto-detect **Half-day** (under 4 hours)
- Live clock display

### 🗓️ Attendance Calendar View
- Monthly color-coded calendar
- 🟢 Present  🟡 Late  🔴 Absent  🔵 Half-day
- Available for both Admin (per-staff) and Staff (own view)

### 📋 Attendance Records
- Filter by month/year
- Export to CSV

### 📈 Monthly Summary (Admin)
- Per-staff breakdown: Present / Late / Half-day / Absent
- Export to CSV

### 🏖️ Leave Management
- Staff submits leave (Medical / Emergency / Personal / Annual)
- Admin approves or rejects
- Approved leaves auto-create attendance record

### 📊 Admin Dashboard
- Today's at-a-glance stats
- Who's in / pending leaves

### 🔐 Auth & Roles
- JWT-based login (8h expiry)
- Admin sees all; Staff sees own data only

---

## Project Structure

```
attendance-system/
├── backend/
│   ├── server.js       # Express API + SQLite DB
│   ├── package.json
│   └── attendance.db   # Auto-created on first run
├── frontend/
│   ├── index.html      # Login
│   ├── admin.html      # Admin portal
│   ├── staff.html      # Staff portal
│   ├── style.css       # Shared styles
│   └── app.js          # Shared utilities + calendar renderer
└── start.sh
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/login | Login |
| GET | /api/staff | List all staff (admin) |
| POST | /api/staff | Create staff (admin) |
| PUT | /api/staff/:id | Update staff (admin) |
| POST | /api/attendance/clockin | Clock in |
| POST | /api/attendance/clockout | Clock out |
| GET | /api/attendance/today | Today's records |
| GET | /api/attendance/my | My records (filterable) |
| GET | /api/attendance/all | All records (admin) |
| GET | /api/attendance/summary | Monthly summary (admin) |
| GET | /api/attendance/export | CSV export (admin) |
| POST | /api/leaves | Submit leave |
| GET | /api/leaves | Get leaves |
| PUT | /api/leaves/:id | Approve/reject leave (admin) |
| GET | /api/dashboard | Dashboard stats (admin) |
