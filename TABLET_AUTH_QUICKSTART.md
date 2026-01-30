# Tablet Authentication - Quick Start Guide

## Setup Steps (One-time)

### 1. Assign User Permissions
```
Master DB → User Management → Edit User
1. Select factories: Factory A, Factory B (blue tags)
2. Select equipment: 440D CTR RH, 440D CTR LH (green tags)
3. Click Save
```

### 2. Register Tablet
```
Master DB → Tablet tab → Create Tablet
1. Tablet Name: Tablet-001
2. Brand: iPad Pro
3. Factory: Factory A
4. Equipment: 440D CTR RH
5. Access Restriction: (leave empty for normal access)
6. Click Register
```

### 3. Get Tablet ID
```
After creating tablet, click on the tablet row to see details
Copy the _id value (e.g., "507f1f77bcf86cd799439011")
```

## Daily Usage

### For Tablet Users

**Step 1: Open Login Page**
```
URL: https://ksg.freyaaccess.com/tablet-login.html?tabletId=YOUR_TABLET_ID
Example: https://ksg.freyaaccess.com/tablet-login.html?tabletId=507f1f77bcf86cd799439011
```

**Step 2: Login**
- Enter your username
- Enter your password
- Click "ログイン / Login"

**Step 3: Use Tablet**
- Automatically redirected to tablet interface
- Your name appears in top-right corner
- Work as normal

**Step 4: Logout**
- Click "ログアウト" button in top-right
- Returns to login screen

## Access Control Examples

### Example 1: Standard Access (Factory/Equipment-based)
```
Tablet: Tablet-001
  Factory: Factory A
  Equipment: 440D CTR RH
  Authorized Users: (empty)

User: john
  Factories: [Factory A, Factory B]
  Equipment: [440D CTR RH]
  
Result: ✅ GRANTED (factory and equipment match)
```

### Example 2: Wrong Equipment
```
Tablet: Tablet-001
  Factory: Factory A
  Equipment: 440D CTR RH
  Authorized Users: (empty)

User: jane
  Factories: [Factory A]
  Equipment: [440D CTR LH]  ← Wrong equipment!
  
Result: ❌ DENIED (equipment mismatch)
```

### Example 3: Restricted Tablet
```
Tablet: Tablet-Special
  Factory: Factory A
  Equipment: 440D CTR RH
  Authorized Users: [john, alice]  ← Restricted!

User: bob
  Factories: [Factory A]
  Equipment: [440D CTR RH]
  
Result: ❌ DENIED (not in authorized list, even though factory/equipment match)
```

### Example 4: Restricted Tablet Access
```
Tablet: Tablet-Special
  Factory: Factory A
  Equipment: 440D CTR RH
  Authorized Users: [john, alice]

User: john
  Factories: [Factory B]  ← Different factory, but...
  Equipment: [440D CTR LH]  ← Different equipment
  
Result: ✅ GRANTED (john is in authorized list, overrides factory/equipment check)
```

## Troubleshooting

### "Access denied: You are not authorized to use this tablet"

**Check:**
1. User's factories include tablet's factory? → Master DB → Users
2. User's equipment include tablet's equipment? → Master DB → Users
3. Tablet has authorized users? → If yes, is your username in the list?

**Fix:**
- Admin adds your factory/equipment in User Management
- Or admin adds you to tablet's authorized users list
- Or admin removes authorized users from tablet (makes it accessible to all with factory/equipment)

### "Tablet ID not specified"

**Cause:** Missing `?tabletId=xxx` in URL

**Fix:** Add tablet ID to URL:
```
✅ Correct: tablet-login.html?tabletId=507f1f77bcf86cd799439011
❌ Wrong: tablet-login.html
```

### Token Expired

**Cause:** Logged in more than 12 hours ago

**Fix:** Just login again, your session expired for security

### Login Button Greyed Out

**Check:** Did you enter both username AND password?

## Admin Tips

### Create QR Code for Easy Access
1. Get tablet ID from Master DB
2. Generate QR code for URL: `https://ksg.freyaaccess.com/tablet-login.html?tabletId=YOUR_ID`
3. Print and stick on physical tablet
4. Users scan QR → opens login page automatically

### Bulk User Setup
For new factory/equipment:
1. Create factory in Master DB → 工場 tab
2. Create equipment in Master DB → 設備 tab
3. Assign users: Edit each user → Select new factory → Select new equipment
4. Register tablet with that factory/equipment

### Testing Access
1. Create test user with specific factory/equipment
2. Register test tablet with same factory/equipment
3. Try logging in with test credentials
4. Verify access granted/denied as expected
