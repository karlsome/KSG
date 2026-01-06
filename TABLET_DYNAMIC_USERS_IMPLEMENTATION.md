# Tablet Dynamic User Dropdown Implementation

## Overview
The tablet interface now dynamically loads user dropdowns based on MongoDB data and shows/hides columns based on the product's `kensaMembers` value.

## Changes Made

### 1. **New API Endpoints** (ksgServer.js)

#### `/api/tablet/users/:factory`
- **Purpose**: Fetch enabled users for a specific factory
- **Method**: GET
- **Authentication**: None (public endpoint)
- **Query**: 
  ```javascript
  { enable: 'enabled', factory: factoryParam }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "users": [
      {
        "username": "hashib",
        "firstName": "hashib",
        "lastName": "asdf",
        "fullName": "asdf hashib"
      }
    ],
    "count": 1,
    "factory": "KSG加工"
  }
  ```

#### `/api/tablet/product/:productId`
- **Purpose**: Fetch product info from masterDB (specifically kensaMembers)
- **Method**: GET
- **Authentication**: None (public endpoint)
- **Query**: 
  ```javascript
  { 品番: productId }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "product": {
      "品番": "aaa",
      "製品名": "ProductA",
      "kensaMembers": 2,
      "工場": "KSG加工",
      "設備": "440D CTR RH"
    }
  }
  ```

### 2. **HTML Updates** (tablet.html)

- Added IDs to all header and cell elements for dynamic control
- Added `poster3` dropdown (hidden by default)
- Changed hardcoded user options to placeholder: "選択してください"
- Updated CSS grid to use `auto-fit` for responsive columns

**Dynamic Elements:**
```html
<!-- Headers -->
<div id="header-inspector">検査員</div>
<div id="header-poster1">投稿員_1</div>
<div id="header-poster2">投稿員_2</div>
<div id="header-poster3" style="display: none;">投稿員_3</div>

<!-- Dropdowns -->
<div id="cell-inspector">
  <select id="inspector">...</select>
</div>
<div id="cell-poster1">
  <select id="poster1">...</select>
</div>
<div id="cell-poster2">
  <select id="poster2">...</select>
</div>
<div id="cell-poster3" style="display: none;">
  <select id="poster3">...</select>
</div>
```

### 3. **JavaScript Logic** (tablet.js)

#### Initialization Flow
1. **Parse URL Parameters**
   - `factory` - determines which users to load (e.g., `?factory=KSG加工`)
   - `product` - determines product info to fetch (e.g., `?product=aaa`)

2. **Load Users**
   - Fetches enabled users for the factory
   - Populates all dropdowns with user data

3. **Load Product Info**
   - Fetches product from masterDB
   - Reads `kensaMembers` value
   - Dynamically shows/hides columns

#### Dynamic Column Display Logic
```javascript
kensaMembers = 2 → Show: 検査員, 投稿員_1
kensaMembers = 3 → Show: 検査員, 投稿員_1, 投稿員_2
kensaMembers = 4 → Show: 検査員, 投稿員_1, 投稿員_2, 投稿員_3
```

## Testing Instructions

### 1. **Restart Server**
```bash
node ksgServer.js
```

### 2. **Test URL Formats**

#### Test with 2 kensaMembers (default)
```
http://192.168.0.34:3000/public/tablet.html?factory=KSG加工&product=aaa
```
**Expected**: Shows 検査員 + 投稿員_1 only

#### Test with 3 kensaMembers
First, update the product in masterDB:
```javascript
db.masterDB.updateOne(
  { 品番: "aaa" },
  { $set: { kensaMembers: 3 } }
)
```
Then access:
```
http://192.168.0.34:3000/public/tablet.html?factory=KSG加工&product=aaa
```
**Expected**: Shows 検査員 + 投稿員_1 + 投稿員_2

#### Test with 4 kensaMembers
```javascript
db.masterDB.updateOne(
  { 品番: "aaa" },
  { $set: { kensaMembers: 4 } }
)
```
**Expected**: Shows all four columns

### 3. **Test User Filtering**

Ensure users in MongoDB have:
- `enable: "enabled"`
- `factory: "KSG加工"` (or whatever factory you're testing)

**Sample User Document:**
```javascript
{
  "firstName": "hashib",
  "lastName": "asdf",
  "username": "hashib",
  "enable": "enabled",
  "factory": "KSG加工",
  "role": "member"
}
```

### 4. **Check Browser Console**
Open DevTools (F12) and check console for:
- ✅ User loading confirmation
- ✅ Product info confirmation
- ✅ Column visibility changes

**Expected Console Output:**
```
🏭 Factory from URL: KSG加工
📦 Product ID: aaa
✅ Loaded 5 users for factory: KSG加工
✅ Populated inspector with 5 users
✅ Populated poster1 with 5 users
✅ Loaded product info: {品番: "aaa", kensaMembers: 2, ...}
👥 KensaMembers: 2
✅ Showing inspector (kensaMembers: 2 >= 1)
✅ Showing poster1 (kensaMembers: 2 >= 2)
❌ Hiding poster2 (kensaMembers: 2 < 3)
❌ Hiding poster3 (kensaMembers: 2 < 4)
```

## Database Requirements

### Collection: KSG.users
Each user document should have:
- `username` (string)
- `firstName` (string)
- `lastName` (string)
- `enable` (string): "enabled" or "disabled"
- `factory` (string): e.g., "KSG加工"

### Collection: KSG.masterDB
Each product document should have:
- `品番` (string): Product ID
- `製品名` (string): Product name
- `kensaMembers` (number): 2, 3, or 4
- `工場` (string): Factory name
- `設備` (string): Equipment name

## Next Steps

1. **Add Product Selection UI** - Allow users to select product from dropdown instead of URL parameter
2. **Save Selections** - Store selected users in localStorage or database
3. **Validation** - Ensure all required fields are filled before submission
4. **Real-time Updates** - Use WebSocket to update when users or products change

## Troubleshooting

### Dropdowns show "選択してください" only
- Check if users exist in KSG.users collection
- Verify `enable: "enabled"` and `factory` matches URL parameter
- Check browser console for API errors

### Columns not hiding/showing
- Verify product exists in KSG.masterDB
- Check `kensaMembers` field value (should be 2, 3, or 4)
- Check browser console for product loading errors

### API returns 503 error
- Verify MongoDB connection in ksgServer.js
- Check if database name is "KSG"
- Restart the server
