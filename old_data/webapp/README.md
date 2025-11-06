# KSG Production System - Webapp

This directory contains the web application files for the KSG Production System that integrates with step7.py on Raspberry Pi devices.

## Files Structure

```
webapp/
├── index.html          # Main web interface
├── script.js           # JavaScript logic with step7.py integration
├── style.css           # Additional CSS styles
└── README.md           # This file
```

## Features

### 🔐 Authentication System
- Login with KSG authorized users (admin/masterUser only)
- Session management with automatic logout
- User selection from MongoDB users collection

### 📊 Production Data Management
- QR code/hinban input with auto-fill product information
- Real-time sync with MongoDB product database (masterDB)
- Worker selection from KSG users database
- Automatic cycle time tracking from RPi sensors
- Break time calculation and management

### 🌐 Online/Offline Support
- Works online with real-time MongoDB sync
- Offline mode with local data queuing
- Automatic data submission when connection restored
- Status indicator showing online/offline state

### 🔄 Data Submission
- Submits to KSG → submittedDB collection
- Includes production logs from RPi sensor data
- Automatic field calculation (good count, cycle times)
- Queue management for offline submissions

## Integration with step7.py

The webapp communicates with step7.py running on the Raspberry Pi through these endpoints:

### Authentication & Users
- `GET /api/auth/users` - Get authorized users for login
- `GET /api/workers` - Get all KSG users for worker selection

### Product Data
- `GET /api/product/{hinban}` - Get product info by hinban
- `POST /set-current-hinban` - Set current hinban in RPi system

### Production Control
- `GET /get-current-cycle-stats` - Get current production statistics
- `GET /get-all-cycle-logs-for-submission` - Get cycle logs for submission
- `POST /reset-all-data` - Reset all production data

### Data Submission
- `POST /api/submit-production-data` - Submit production data to MongoDB

### System Status
- `GET /api/system/status` - Get system status and connectivity

## Auto-Update System

The webapp is automatically updated from GitHub repository:
- Daily at 4 AM JST
- step7.py pulls latest files from GitHub
- Serves updated webapp locally at `/webapp` endpoint

## Usage Flow

1. **Initial Setup**: User visits Render.com webpage
2. **Device Selection**: User selects Raspberry Pi device from list
3. **Redirect**: Automatically redirected to local RPi webapp
4. **Authentication**: Login with KSG authorized credentials
5. **Production**: QR scanning, data entry, automatic sensor tracking
6. **Submission**: Data submitted to MongoDB with offline queue support

## Deployment

### For Raspberry Pi:
1. Ensure step7.py is running
2. Place webapp files in `/home/pi/webapp/`
3. Access via `http://[RPI_IP]:5000/webapp`

### For Render.com:
1. Deploy webapp files to Render.com
2. Users access for device selection
3. Automatic redirect to local RPi after device selection

## Browser Compatibility

- Modern browsers with ES6+ support
- Mobile/tablet optimized interface
- Touch-friendly controls for factory environment
- Offline functionality with Service Worker (future enhancement)

## Security

- Device authentication via unique device IDs
- User authentication with MongoDB users collection
- Role-based access (admin/masterUser only)
- Secure communication between webapp and RPi

## Troubleshooting

### Connection Issues
- Check RPi IP address and port 5000
- Verify step7.py is running
- Check network connectivity

### Authentication Problems
- Verify user exists in MongoDB users collection
- Check user role (must be admin or masterUser)
- Clear browser session storage if needed

### Data Sync Issues
- Check MongoDB connection
- Verify ksgServer.js is running
- Check offline queue in browser storage
