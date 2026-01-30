# Tablet Authentication System Implementation Summary

## Overview
Implemented a comprehensive tablet authentication system using a **hybrid access control approach** that combines factory/equipment-based permissions with optional tablet-level user restrictions.

---

## Architecture

### Access Control Logic (Hybrid Approach)

**Primary Access (Factory/Equipment-based)**:
- Users have `factories: []` and `equipment: []` arrays
- Access granted if: user's factory includes tablet's factoryLocation AND user's equipment includes tablet's 設備名
- Scales automatically - assign user to factory/equipment → gets all tablets there

**Override Access (Tablet-level)**:
- Tablets have optional `authorizedUsers: []` array
- If array is **empty**: Factory/equipment-based access applies (default)
- If array has **users**: ONLY those users can access, regardless of factory/equipment
- Provides granular control for sensitive equipment or training restrictions

---

## Backend Changes

### 1. MongoDB Collections Updates

#### users Collection - Added Fields:
```javascript
{
  // ... existing fields ...
  factories: [],  // Array of factory names
  equipment: [],  // Array of equipment names (設備名)
  createdAt: Date
}
```

#### tabletDB Collection - Added Field:
```javascript
{
  // ... existing fields ...
  authorizedUsers: []  // Array of usernames/userIds (empty = no restriction)
}
```

### 2. New Backend Endpoint

**POST /tabletLogin**
- **Input**: `{ dbName, username, password, tabletId }`
- **Authentication**: Validates credentials with bcrypt
- **Access Check** (Hybrid Logic):
  1. If `tablet.authorizedUsers` is not empty → Check if user is in list
  2. Otherwise → Check factory/equipment match
- **Output**: JWT token (12h expiry) + user info + tablet info
- **Error Codes**: 401 (invalid credentials), 403 (access denied), 404 (tablet not found)

### 3. Modified Endpoints

**POST /customerCreateUser**
- Now accepts `factories` and `equipment` arrays
- Creates users with tablet access permissions

**POST /createTablet**
- Now accepts `authorizedUsers` array in tabletData
- Defaults to empty array (no restriction)

---

## Frontend Changes

### 1. New Login Page: `tablet-login.html`

**Features**:
- Beautiful gradient UI with logo
- Username/password form
- Displays tablet info (name, factory, equipment)
- URL parameter: `?tabletId={id}`
- Stores auth data in localStorage
- Error handling with user-friendly messages

**Authentication Flow**:
```
1. User opens: tablet-login.html?tabletId=xxx
2. Fetches tablet info to display
3. User enters credentials
4. POST /tabletLogin with credentials + tabletId
5. Receives JWT token
6. Stores in localStorage as 'tabletAuth'
7. Redirects to tablet.html
```

### 2. Updated: `tablet.html`

**Changes**:
- Added logout button in header
- Added user info display (name/username)
- Protected - redirects to login if not authenticated

### 3. Updated: `tablet.js`

**New Features**:
- **Authentication Check** (runs on load):
  - Checks for `tabletAuth` in localStorage
  - Validates token expiry (12 hours)
  - Redirects to login if missing/expired
- **User Info Display**: Shows logged-in user's name
- **Logout Function**: Clears auth and redirects to login

### 4. Master DB User Management

**User Form Updates** (`userManagement.js`):
- Added **設備 (Equipment)** multi-select field
- Green tags for selected equipment (vs blue for factories)
- Functions added:
  - `loadAvailableEquipment()`
  - `renderUserEquipmentTags()`
  - `removeUserEquipmentTag()`

**Data Submission**:
- `submitNewUser()` now sends `factories` and `equipment` arrays
- `saveUser()` updates both arrays when editing

### 5. Master DB Tablet Management

**Tablet Form Updates** (`masterDB.js`):
- Added **アクセス制限** (Access Restriction) field
- Optional comma-separated usernames
- Help text explains hybrid logic
- Empty = all users with factory/equipment access
- With users = restricted to those users only

**Data Submission**:
- `submitNewTablet()` parses `authorizedUsers` input
- Splits by comma, trims whitespace, filters empty

---

## File Changes Summary

### Created Files:
- `/public/tablet-login.html` - Tablet authentication page

### Modified Files:
1. `/ksgServer.js`
   - Added `/tabletLogin` endpoint (hybrid access logic)
   - Updated user creation to support factories/equipment arrays
   - Updated tablet creation to support authorizedUsers array

2. `/public/tablet.html`
   - Added logout button
   - Added user info display

3. `/public/js/tablet.js`
   - Added authentication check at top of file
   - Added user info display in DOMContentLoaded
   - Added `logoutTablet()` function

4. `/public/js/userManagement.js`
   - Added `availableEquipment` and `selectedUserEquipment` variables
   - Added `loadAvailableEquipment()` function
   - Updated `loadUsers()` to fetch equipment
   - Added equipment field to user creation form
   - Added `renderUserEquipmentTags()` and `removeUserEquipmentTag()`
   - Updated `submitNewUser()` to include equipment array
   - Updated `saveUser()` to include equipment array

5. `/public/js/masterDB.js`
   - Updated `showCreateTabletForm()` to include authorizedUsers field
   - Updated `submitNewTablet()` to parse and send authorizedUsers array

---

## Usage Guide

### For Administrators (Master DB)

#### 1. Assign Factory/Equipment Access to Users
1. Go to Master DB → User Management
2. Edit or create user
3. Select factories from dropdown (blue tags appear)
4. Select equipment from dropdown (green tags appear)
5. Save user

#### 2. Register Tablets
1. Go to Master DB → Tablet tab
2. Click "Create Tablet"
3. Enter tablet name, brand
4. Select factory and equipment
5. **Optional**: Enter authorized usernames (comma-separated) to restrict access
   - Leave empty for factory/equipment-based access (recommended)
   - Enter usernames to restrict to specific users only
6. Save tablet

### For Tablet Users

#### 1. Access Tablet
1. Open tablet browser
2. Navigate to: `https://ksg.freyaaccess.com/tablet-login.html?tabletId={TABLET_ID}`
3. Enter username and password
4. Click Login

#### 2. Using Tablet
- After login, automatically redirected to tablet interface
- User's name displayed in header
- Click "ログアウト" to logout
- Session expires after 12 hours (auto-redirect to login)

---

## Security Features

1. **Password Hashing**: bcrypt with salt rounds
2. **JWT Tokens**: 12-hour expiry, includes userId, role, dbName, tabletId
3. **Session Management**: Automatic expiry check on page load
4. **Access Control**: Three-tier check (authentication → tablet-level → factory/equipment)
5. **Secure Logout**: Clears localStorage and redirects

---

## Testing Checklist

### User Access Control
- [ ] User with matching factory/equipment can login
- [ ] User with wrong factory cannot login
- [ ] User with wrong equipment cannot login
- [ ] Tablet with authorizedUsers restricts to those users only
- [ ] Tablet without authorizedUsers allows factory/equipment users

### Authentication Flow
- [ ] Login page displays tablet info
- [ ] Valid credentials grant access
- [ ] Invalid credentials show error
- [ ] Token expires after 12 hours
- [ ] Logout clears session properly

### Admin Functions
- [ ] Can assign multiple factories to user
- [ ] Can assign multiple equipment to user
- [ ] Can create tablet with no restrictions
- [ ] Can create tablet with user restrictions
- [ ] Equipment dropdown filters by selected factory

---

## Future Enhancements (Optional)

1. **User Picker UI**: Replace comma-separated input with multi-select dropdown of actual users
2. **Access Logs**: Track tablet login/logout events
3. **Session Management**: Admin can view active tablet sessions
4. **Role-Based Tablet Access**: Add role field to tablets (e.g., "operator", "admin")
5. **QR Code Login**: Generate QR codes for quick tablet access

---

## Notes

- All existing functionality remains unchanged
- Backward compatible: Tablets without authorizedUsers use factory/equipment access
- Users without factories/equipment arrays cannot access any tablets (as intended)
- Tablet URL must include `?tabletId=xxx` parameter for authentication
