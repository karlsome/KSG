# KSG Production Inspection System

A real-time production inspection and quality tracking system for Kasugai Kakou. The system connects factory floor OPC UA equipment to inspection tablets, logs production data to MongoDB, and syncs to Google Sheets.

---

## Architecture Overview

```
OPC UA Machine
     │
     ▼
Raspberry Pi (opcua_client.py)
     │  polls OPC UA nodes
     ▼
ksgServer.js  (Node.js / Express / Socket.IO)
     │
     ├──► MongoDB Atlas
     │      ├── Sasaki_Coating_MasterDB.masterUsers  (user accounts)
     │      └── [CompanyDB]
     │             ├── tabletDB           (registered tablets)
     │             ├── submittedDB        (submitted inspection records)
     │             ├── deviceInfo         (Raspberry Pi device registry)
     │             ├── opcua_raspberries  (Pi configs)
     │             ├── opcua_equipment    (equipment configs)
     │             ├── opcua_datapoints   (monitored OPC nodes)
     │             └── opcua_event_log    (OPC event history, 2-year TTL)
     │
     ├──► Google Sheets (webhook)
     │
     └──► Tablets (browser via Socket.IO)
            └── public/tablet.html + public/js/tablet.js
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Server | Node.js, Express, Socket.IO |
| Database | MongoDB Atlas |
| Auth | JWT + Firebase Admin SDK |
| Frontend | Vanilla JS, Socket.IO client |
| OPC UA client | Python (`opcua` library), Raspberry Pi |
| File uploads | Multer (memory storage) |

---

## Running the Server

```bash
# Install dependencies
npm install

# Development (auto-restart on change)
npm run dev

# Production
npm start
```

Server runs on port `3000` by default.

### Environment Variables (`.env`)

```
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your_jwt_secret
FIREBASE_PROJECT_ID=...
FIREBASE_PRIVATE_KEY=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_CLIENT_X509_CERT_URL=...
FIREBASE_STORAGE_BUCKET=...
GOOGLE_SHEETS_WEBHOOK_URL=https://script.google.com/...
DEVICE_CACHE_DURATION=300000
```

---

## Frontend URL Configuration

Edit `public/js/config.js` to switch between local and production:

```js
// Local development
const API_URL = 'http://localhost:3000';

// Production
// const API_URL = 'https://ksg.freyaaccess.com';
```

---

## Key Pages

| URL | Description |
|---|---|
| `/tablet.html?tabletName=<name>` | Inspection tablet UI |
| `/tablet-login.html?tabletName=<name>` | Tablet login |
| `/opcua-admin` | OPC UA admin panel (manage Pis, equipment, datapoints) |
| `/opcua-monitor` | Real-time OPC UA data monitor |
| `/masterDB.html` | Product master database viewer |
| `/submittedDB.html` | Submitted inspection records viewer |
| `/opcManagement.html` | OPC management UI |

---

## Tablet Inspection Flow

1. **User opens** `tablet.html?tabletName=<TabletName>` — redirected to login if not authenticated.
2. **User logs in** via `tablet-login.html` using their factory account (JWT issued for 12 hours).
3. **OPC UA variables** are pushed in real-time from the server via Socket.IO (`opcua_variables_update` event).
4. **Kanban ID** is read from an OPC variable (e.g. `kenyokiRHKanban`) — this auto-populates the product name and NG defect buttons.
5. **User presses 作業開始** — captures the current OPC production counter (`seisanSu`) as the start baseline.
6. **作業数** = current `seisanSu` − baseline. **合格数** = 作業数 − total defects.
7. **User presses データ送信** — validated and submitted to MongoDB (`submittedDB`) and Google Sheets.

---

## Registering a Tablet

Tablets are stored in MongoDB under `[CompanyDB].tabletDB`. Each tablet document links to a specific OPC equipment configuration.

### Document structure

```json
{
  "tabletName": "Tablet-A1",
  "company": "KSG",
  "factory": "木本",
  "enabled": true,
  "opcVariables": {
    "kanbanVariable": "kenyokiRHKanban",
    "productionCountVariable": "seisanSu",
    "boxQuantityVariable": "hakoIresu"
  },
  "ngGroup": "440D-BPillar"
}
```

### Steps to register a new tablet

1. Open the **OPC UA Admin panel** (`/opcua-admin`) and confirm the equipment and datapoints for the target factory line are configured.
2. In MongoDB Atlas, open the `[CompanyDB].tabletDB` collection and insert a new document following the structure above.
   - `tabletName` must match the `?tabletName=` URL parameter used when opening the tablet.
   - `opcVariables` must reference the exact OPC variable names configured for the equipment.
   - `ngGroup` must match a group name defined in `masterDB` for the products this tablet inspects.
3. Navigate to `tablet-login.html?tabletName=<TabletName>` on the tablet device to verify login works.

---

## OPC UA System

### Raspberry Pi Setup

The Pi runs `raspberry_pi/opcua_client.py` which:
- Connects to the OPC UA server on the factory machine.
- Polls configured datapoints and POSTs data to `/api/opcua/data`.
- Sends heartbeats to `/api/opcua/heartbeat`.
- Discovers and uploads node structure to `/api/opcua/discovered-nodes`.

See `raspberry_pi/requirements.txt` for Python dependencies.

### Adding a new Raspberry Pi

1. In `/opcua-admin`, go to **Raspberry Pi Management** → **Add Pi**.
2. Fill in the Pi's `uniqueId`, description, and company.
3. On the Pi itself, set the `UNIQUE_ID` and `SERVER_URL` environment variables to match, then run `opcua_client.py`.

### Adding Equipment and Datapoints

1. In `/opcua-admin`, select a Pi → **Add Equipment** with a name and OPC UA server endpoint URL.
2. Under the equipment, click **Discover Nodes** to browse the OPC UA address space.
3. Select the nodes to monitor and save them as **Datapoints**.
4. The datapoint variable names (e.g. `seisanSu`, `kenyokiRHKanban`) are what you reference in the tablet's `opcVariables` config.

---

## Submitted Data Fields (MongoDB `submittedDB`)

| Field | Description |
|---|---|
| `timestamp` | ISO submission datetime |
| `hinban` | Part number |
| `product_name` | Product name |
| `kanban_id` | Kanban ID from OPC |
| `lh_rh` | Left-hand / Right-hand |
| `operator1`, `operator2` | Inspector names |
| `good_count` | 合格数 (good pieces) |
| `man_hours` | Net working hours |
| `cycle_time` | Minutes per piece |
| `[defect name]` | Dynamic defect counts (Japanese field names) |
| `start_time`, `end_time` | Work period |
| `break_time`, `trouble_time` | Deducted hours |
| `submitted_from` | Logged-in tablet name (falls back to `"tablet"` if unavailable) |

---

## License

Copyright (c) 2026 Sasaki Coating Co., Ltd. All Rights Reserved.

This software is proprietary and confidential. Unauthorized copying, distribution, or modification is strictly prohibited. See [LICENSE](LICENSE) for full terms.
