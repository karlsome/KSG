// languages.js - Internationalization (i18n) for KSG System

const translations = {
  en: {
    // Common / Shared
    common: {
      search: "Search...",
      role: "Role",
      logout: "Logout",
      loading: "Loading...",
      loadingHistory: "Loading history...",
      save: "Save",
      cancel: "Cancel",
      edit: "Edit",
      delete: "Delete",
      close: "Close",
      actions: "Actions",
      confirm: "Confirm",
      register: "Register",
      upload: "Upload",
      preview: "Preview",
      or: "or",
      select: "Select",
      pleaseSelect: "Please select",
      noImage: "No image",
      image: "Image",
      description: "Description",
      name: "Name",
      total: "Total",
      records: "records",
      items: "items",
      pageNotFound: "Page Not Found",
      pageNotFoundMsg: "The requested page could not be found.",
      failedToLoad: "Failed to load",
      updatedSuccessfully: "Updated successfully",
      updateFailed: "Update failed",
      deleteFailed: "Delete failed",
      createFailed: "Create failed",
      createdSuccessfully: "created successfully",
      deletedSuccessfully: "deleted successfully",
      dataNotFound: "Data not found",
      noItemsSelected: "No items selected",
      error: "Error",
      required: "required",
      selectFactory: "-- Select Factory --",
      selectEquipment: "-- Select Equipment --",
      addFactory: "+ Add Factory",
      selectFactoryFirst: "Select a factory first",
      noEquipmentForFactory: "No equipment for this factory",
      noEquipmentData: "No equipment data",
      noFactoryData: "No factory data",
      moreRows: "and {count} more rows",
      fillRequiredFields: "Please fill in required fields",
      confirmDeleteMsg: "Are you sure you want to delete this?"
    },

    // Navigation
    nav: {
      dashboard: "Dashboard",
      userManagement: "User Management",
      masterDB: "Master DB",
      opcManagement: "OPC Management"
    },

    // Dashboard
    dashboard: {
      title: "Dashboard",
      welcome: "Welcome to Sasaki Coating Management System",
      selectPage: "Select a page from the sidebar to get started."
    },

    // User Management Page
    userManagement: {
      title: "User Management",
      createNewUser: "Create New User",
      firstName: "First Name",
      lastName: "Last Name",
      email: "Email",
      username: "Username",
      password: "Password",
      role: "Role",
      division: "Department",
      section: "Section",
      enable: "Enable",
      factory: "Factory",
      equipment: "Equipment",
      userID: "User ID",

      // Placeholders
      selectRole: "Select Role",
      selectDepartment: "Please select",
      selectSection: "Please select",
      addFactory: "+ Add Factory",
      addEquipment: "+ Add Equipment",

      // Options
      enabled: "enabled",
      disabled: "disabled",

      // Multi-select labels
      factoryMultiSelect: "(Multiple selection allowed)",
      equipmentMultiSelect: "(Multiple selection allowed)",

      // Button labels
      save: "Save",
      cancel: "Cancel",
      edit: "Edit",
      delete: "Delete",
      actions: "Actions",

      // Table messages
      noFactoriesSelected: "No factories selected",
      noEquipmentSelected: "No equipment selected",
      selectFactory: "Please select a factory",
      selectEquipment: "Please select equipment",

      // Warning messages
      noDepartmentData: "No department data",
      noSectionData: "No section data",
      noFactoryData: "No factory data",
      noEquipmentData: "No equipment data",

      // Validation messages
      fillRequiredFields: "Please fill in all required fields",
      passwordMinLength: "Password must be at least 6 characters long",

      // Success messages
      userCreatedSuccess: "User created successfully",
      userUpdatedSuccess: "User updated successfully",
      userDeletedSuccess: "User deleted successfully",

      // Error messages
      createFailed: "Create failed",
      updateFailed: "Update failed",
      deleteFailed: "Delete failed",
      failedToLoad: "Failed to load users",
      usernameExistsKSG: "This username already exists in KSG database",
      usernameExistsMaster: "This username already exists in a master account",
      usernameExistsOther: "This username already exists in another company",
      accessDenied: "Access denied",

      // Confirmation messages
      confirmDelete: "Are you sure you want to delete this user?"
    },

    // OPC Management Page
    opcManagement: {
      title: "OPC Management",
      connected: "Connected",
      disconnected: "Disconnected",
      raspberryPi: "Raspberry Pi",
      selectRaspberryPi: "Select Raspberry Pi...",
      realTimeData: "Real-time Data",
      refresh: "Refresh",
      variables: "Variables",
      combine: "Combine",

      // Table headers
      variableName: "Variable Name",
      opcNodeId: "OPC Node ID",
      type: "Type",
      currentValue: "Current Value",
      quality: "Quality",
      lastUpdated: "Last Updated",
      status: "Status",
      actions: "Actions",

      // Data display
      selectDeviceToView: "Select a Raspberry Pi to view data",
      noVariablesCreated: "No variables created yet",
      clickDataToCreate: "Click on data values to create variables",
      ago: "ago",

      // Quality status
      unknown: "Unknown",
      good: "Good",
      bad: "Bad",
      stale: "Stale",

      // Modal titles
      createVariable: "Create Variable",
      combineVariables: "Combine Variables",
      editVariable: "Edit Variable",

      // Form labels
      variableNameLabel: "Variable Name",
      variableNamePlaceholder: "e.g., data1, 生産数, 看板",
      variableNameHint: "Unique name for this variable",
      convertFrom: "Convert From",
      convertTo: "Convert To",
      selectSourceFormat: "Select source format...",
      selectTargetFormat: "Select target format...",
      operation: "Operation",

      // Source info
      sourceData: "Source Data",
      datapoint: "Datapoint",
      arrayIndex: "Array Index",
      rawValue: "Raw Value",
      preview: "Preview",
      previewResult: "Preview Result",

      // Conversion types
      uint16: "Unsigned Integer (16-bit)",
      uint8: "Unsigned Integer (8-bit)",
      uint32: "Unsigned Integer (32-bit)",
      int16: "Signed Integer (16-bit)",
      int8: "Signed Integer (8-bit)",
      int32: "Signed Integer (32-bit)",
      hex16: "Hexadecimal (16-bit)",
      hex8: "Hexadecimal (8-bit)",
      binary16: "Binary (16-bit)",
      binary8: "Binary (8-bit)",
      binary4: "Binary (4-bit)",
      ascii2: "ASCII (2 chars from 16-bit)",
      ascii1: "ASCII (1 char from 8-bit)",
      float32: "Float (32-bit)",
      double64: "Double (64-bit)",
      string: "String",
      boolean: "Boolean",
      none: "No Conversion (Keep Original)",

      // Operations
      concatenate: "Concatenate (String Join)",
      concatenateJoin: "Concatenate (Join values)",
      add: "Add (+)",
      subtract: "Subtract (-)",
      multiply: "Multiply (×)",
      divide: "Divide (÷)",
      average: "Average",

      // Combine form
      combinedVariableName: "Combined Variable Name",
      combinedVariable: "Combined Variable",
      combinedVariablePlaceholder: "e.g., 看板, full_data",
      selectVariablesToCombine: "Select Variables to Combine",
      noVariablesSelected: "No variables selected",
      addVariable: "+ Add variable...",

      // Edit form
      sourceVariables: "Source Variables",
      sourceDataInfo: "Source Data Information",
      nodeId: "Node ID",
      currentRawValue: "Current Raw Value",
      sourceType: "Source Type",

      // Buttons
      cancel: "Cancel",
      createVariable: "Create Variable",
      createCombinedVariable: "Create Combined Variable",
      saveChanges: "Save Changes",
      edit: "Edit",
      delete: "Delete",

      // Notifications
      failedToInitialize: "Failed to initialize",
      failedToLoadData: "Failed to load data",
      variableCreatedSuccess: "Variable created successfully",
      variableCreatedFail: "Failed to create variable",
      combinedVariableCreatedSuccess: "Combined variable created successfully",
      combinedVariableCreatedFail: "Failed to create combined variable",
      variableUpdatedSuccess: "Variable updated successfully",
      variableUpdatedFail: "Failed to update variable",
      enterVariableName: "Please enter a variable name",
      selectAtLeast2Variables: "Please select at least 2 variables",
      selectOperation: "Please select an operation",
      selectAtLeast2SourceVariables: "Please select at least 2 source variables",
      selectBothConversionTypes: "Please select both conversion types",

      // Required field indicator
      required: "*"
    },

    // Master DB Page
    masterDB: {
      title: "Master DB",
      csvBulkRegister: "CSV Bulk Register",
      newRegistration: "New Registration",

      // Tabs
      tabMaster: "Master",
      tabFactory: "Factory",
      tabEquipment: "Equipment",
      tabRoles: "Role",
      tabDepartment: "Department",
      tabSection: "Section",
      tabRpiServer: "Rpi Server",
      tabTablet: "Tablet",

      // Sub tabs
      dataList: "Data List",
      createDeleteHistory: "Create/Delete History",
      deviceList: "Device List",
      tabletList: "Tablet List",

      // Loading
      loadingDevices: "Loading Raspberry Pi devices...",
      loadingTablets: "Loading tablets...",

      // Detail Modal
      productDetails: "Product Details",
      factoryDetails: "Factory Details",
      equipmentDetails: "Equipment Details",
      roleDetails: "Role Details",
      departmentDetails: "Department Details",
      sectionDetails: "Section Details",
      tabletDetails: "Tablet Details",
      details: "Details",
      changeHistory: "Change History",

      // Delete
      deleteConfirmation: "Delete Confirmation",
      deleteConfirmMsg: "Are you sure you want to delete the following data?",
      deleteSelectedItems: "Delete selected items",
      itemsDeletedSuccess: "item(s) deleted successfully",

      // History table
      dateTime: "Date/Time",
      action: "Action",
      user: "User",
      recordCount: "Records",
      noHistoryFound: "No history found",
      created: "Created",
      deleted: "Deleted",
      failedToLoadHistory: "Failed to load history",
      noChangeHistory: "No change history",
      by: "By",

      // Master table
      productNumber: "Product Number",
      productName: "Product Name",
      lhrh: "LH/RH",
      kanbanId: "kanbanID",
      equipment: "Equipment",
      factory: "Factory",
      cycleTime: "Cycle Time",
      inspectionMembers: "Inspection Members",
      capacity: "Capacity",
      productImage: "Product Image",

      // Factory
      factoryName: "Factory Name",
      address: "Address",
      phone: "Phone",
      factories: "factories",
      factoryCreatedSuccess: "Factory created successfully",
      factoryUpdated: "Factory updated",
      factoryDeleted: "Factory deleted",
      factoryNameRequired: "Factory name is required",
      deleteThisFactory: "Delete this factory?",
      createNewFactory: "Create New Factory",
      deleteSelected: "Delete Selected",

      // Equipment
      equipmentName: "Equipment Name",
      factoriesLabel: "Factories",
      selectMultiple: "Select multiple",
      createEquipment: "Create Equipment",
      equipmentCreated: "Equipment created",
      equipmentDeleted: "Equipment deleted",
      equipmentNameRequired: "Equipment name is required",
      deleteThisEquipment: "Delete this equipment?",
      opcVariables: "OPC Variables",
      opcVariableMappings: "OPC Variable Mappings (for Tablets)",
      kanbanVariable: "Kanban Variable",
      productionCountVariable: "Production Count Variable",
      boxQuantityVariable: "Box Quantity Variable",
      selectVariable: "-- Select Variable --",
      forProductLookup: "For product title/lookup in tablet",
      forProductionCalc: "For production count calculation in tablet",
      forBoxQtyDisplay: "For box quantity display in tablet",

      // Roles
      roleName: "Role Name",
      roles: "roles",
      createRole: "Create Role",
      roleCreated: "Role created",
      roleDeleted: "Role deleted",
      roleNameRequired: "Role name is required",
      deleteThisRole: "Delete this role?",

      // Department
      departmentName: "Department Name",
      departments: "departments",
      failedToLoadDepartments: "Failed to load departments",

      // Section
      sectionName: "Section Name",
      sections: "sections",
      failedToLoadSections: "Failed to load sections",

      // Division
      addDivision: "Add Division",
      addNewDivision: "Add New Division",
      code: "Code",
      manager: "Manager",
      divisionAdded: "Division added",
      divisionDeleted: "Division deleted",
      deleteThisDivision: "Delete this division?",
      selectAFactory: "Select a factory",
      nameRequired: "Name is required",
      pleaseSelectFactory: "Please select a factory",

      // Tablet
      tabletName: "Tablet Name",
      brand: "Brand",
      factoryLocation: "Factory Location",
      registeredDate: "Registered Date",
      registeredBy: "Registered By",
      quickAccess: "Quick Access",
      showQRCode: "Show QR Code",
      hideQRCode: "Hide QR Code",
      tabletAccessUrl: "Tablet Access URL",
      copy: "Copy",
      copied: "Copied!",
      downloadQRCode: "Download QR Code",
      downloadComplete: "Download Complete!",
      openTablet: "Open Tablet",

      // Master form
      createNewMasterRecord: "Create New Master Record",
      imageUpload: "Image Upload",
      selectEquipment: "Select Equipment",
      selectFactory: "Select Factory",
      masterRecordCreated: "Master record created successfully",
      recordCreatedFailed: "Failed to create record",
      recordNotFound: "Record not found",
      confirmDeleteRecord: "Are you sure you want to delete this record?",
      recordDeleted: "Record deleted successfully",

      // CSV
      csvUploadTitle: "CSV Bulk Register",
      csvDescription: "Select a CSV file to bulk register data",
      dragAndDrop: "Drag & drop a CSV file",
      selectFile: "Select file",
      noCSVData: "No CSV data",
      recordsRegistered: "{success}/{total} records registered",
      uploadError: "Upload error",

      // Quick create
      example: "Example",
      enterCycleTime: "Enter cycle time",
      enterCapacity: "Enter capacity",

      // RPI Server
      rpiServer: "Rpi Server",
      deviceName: "Device Name",
      ipAddress: "IP Address",
      port: "Port",
      status: "Status",
      lastSeen: "Last Seen",
      online: "Online",
      offline: "Offline",
      noDevicesRegistered: "No Raspberry Pi devices registered yet",
      devicesAppearAutomatically: "Devices will appear here automatically when they connect",
      deviceId: "Device ID",
      localIp: "Local IP",
      owner: "Owner",
      active: "Active",
      inactive: "Inactive",
      validUntil: "Valid until",
      editDevice: "Edit Raspberry Pi Device",
      deviceIdReadOnly: "Device ID (Read-only)",
      friendlyNameHint: "Friendly name for this device (e.g., KSG2, Factory Line 1)",
      localIpReadOnly: "Local IP (Read-only)",
      authorizedUntil: "Authorized Until",
      deviceNameRequired: "Device name is required",
      deviceUpdatedSuccess: "Raspberry Pi device updated successfully",
      failedToUpdateDevice: "Failed to update device",
      failedToLoadDeviceDetails: "Failed to load device details",
      failedToLoadDevices: "Failed to load Raspberry Pi devices",

      // Tablet extra
      tabletNameExists: "This tablet name is already in use. Please enter a different name.",
      tabletNameInUse: "This name is already in use",
      tabletCreated: "Tablet registered successfully",
      tabletDeleted: "Tablet deleted successfully",
      deleteTabletConfirm: "Delete this tablet?",
      accessRestriction: "Access Restriction (Optional)",
      accessRestrictionDesc: "If left empty, all users matching the factory/equipment will have access. To restrict to specific users, enter usernames separated by commas.",
      accessRestrictionPlaceholder: "e.g., user1, user2, user3 (empty=no restriction)",
      tabletRegistration: "Tablet Registration",

      // Misc
      urlCopyFailed: "Failed to copy URL",
      opcConfigTip: "Tip: Configure these variables from",
      opcManagementPage: "OPC Management",
      saveChanges: "Save Changes",
      departmentNameRequired: "Department name is required",
      sectionNameRequired: "Section name is required",
      fillAllRequired: "Please fill in all required fields"
    }
  },

  ja: {
    // Common / Shared
    common: {
      search: "検索...",
      role: "役割",
      logout: "ログアウト",
      loading: "読み込み中...",
      loadingHistory: "履歴を読み込み中...",
      save: "保存",
      cancel: "キャンセル",
      edit: "編集",
      delete: "削除",
      close: "閉じる",
      actions: "操作",
      confirm: "確認",
      register: "登録",
      upload: "アップロード",
      preview: "プレビュー",
      or: "または",
      select: "選択",
      pleaseSelect: "選択してください",
      noImage: "画像なし",
      image: "画像",
      description: "説明",
      name: "名前",
      total: "合計",
      records: "件",
      items: "件",
      pageNotFound: "ページが見つかりません",
      pageNotFoundMsg: "リクエストされたページが見つかりませんでした。",
      failedToLoad: "読み込みに失敗しました",
      updatedSuccessfully: "正常に更新されました",
      updateFailed: "更新に失敗しました",
      deleteFailed: "削除に失敗しました",
      createFailed: "作成に失敗しました",
      createdSuccessfully: "正常に作成されました",
      deletedSuccessfully: "正常に削除されました",
      dataNotFound: "データが見つかりません",
      noItemsSelected: "項目が選択されていません",
      error: "エラー",
      required: "必須",
      selectFactory: "-- 工場を選択 --",
      selectEquipment: "-- 設備を選択 --",
      addFactory: "+ 工場を追加",
      selectFactoryFirst: "まず工場を選択してください",
      noEquipmentForFactory: "この工場に設備がありません",
      noEquipmentData: "設備データがありません",
      noFactoryData: "工場データがありません",
      moreRows: "他{count}行",
      fillRequiredFields: "必須項目を入力してください",
      confirmDeleteMsg: "削除してもよろしいですか？"
    },

    // Navigation
    nav: {
      dashboard: "ダッシュボード",
      userManagement: "ユーザー管理",
      masterDB: "マスターDB",
      opcManagement: "OPC管理"
    },

    // Dashboard
    dashboard: {
      title: "ダッシュボード",
      welcome: "佐々木コーティング管理システムへようこそ",
      selectPage: "サイドバーからページを選択してください。"
    },

    // User Management Page
    userManagement: {
      title: "ユーザー管理",
      createNewUser: "新規ユーザー作成",
      firstName: "名",
      lastName: "姓",
      email: "メールアドレス",
      username: "ユーザー名",
      password: "パスワード",
      role: "役割",
      division: "所属部署",
      section: "所属係",
      enable: "有効",
      factory: "工場",
      equipment: "設備",
      userID: "ユーザーID",

      // Placeholders
      selectRole: "役割を選択",
      selectDepartment: "選択してください",
      selectSection: "選択してください",
      addFactory: "+ 工場を追加",
      addEquipment: "+ 設備を追加",

      // Options
      enabled: "有効",
      disabled: "無効",

      // Multi-select labels
      factoryMultiSelect: "（複数選択可能）",
      equipmentMultiSelect: "（複数選択可能）",

      // Button labels
      save: "保存",
      cancel: "キャンセル",
      edit: "編集",
      delete: "削除",
      actions: "操作",

      // Table messages
      noFactoriesSelected: "工場が選択されていません",
      noEquipmentSelected: "設備が選択されていません",
      selectFactory: "工場を選択してください",
      selectEquipment: "設備を選択してください",

      // Warning messages
      noDepartmentData: "部署データがありません",
      noSectionData: "係データがありません",
      noFactoryData: "工場データがありません",
      noEquipmentData: "設備データがありません",

      // Validation messages
      fillRequiredFields: "必須項目をすべて入力してください",
      passwordMinLength: "パスワードは6文字以上である必要があります",

      // Success messages
      userCreatedSuccess: "ユーザーが正常に作成されました",
      userUpdatedSuccess: "ユーザーが正常に更新されました",
      userDeletedSuccess: "ユーザーが正常に削除されました",

      // Error messages
      createFailed: "作成に失敗しました",
      updateFailed: "更新に失敗しました",
      deleteFailed: "削除に失敗しました",
      failedToLoad: "ユーザーの読み込みに失敗しました",
      usernameExistsKSG: "このユーザー名はKSGデータベースに既に存在します",
      usernameExistsMaster: "このユーザー名はマスターアカウントに既に存在します",
      usernameExistsOther: "このユーザー名は他の会社に既に存在します",
      accessDenied: "アクセスが拒否されました",

      // Confirmation messages
      confirmDelete: "このユーザーを削除してもよろしいですか？"
    },

    // OPC Management Page
    opcManagement: {
      title: "OPC管理",
      connected: "接続中",
      disconnected: "切断",
      raspberryPi: "Raspberry Pi",
      selectRaspberryPi: "Raspberry Piを選択...",
      realTimeData: "リアルタイムデータ",
      refresh: "更新",
      variables: "変数",
      combine: "結合",

      // Table headers
      variableName: "変数名",
      opcNodeId: "OPCノードID",
      type: "タイプ",
      currentValue: "現在値",
      quality: "品質",
      lastUpdated: "最終更新",
      status: "ステータス",
      actions: "操作",

      // Data display
      selectDeviceToView: "Raspberry Piを選択してデータを表示",
      noVariablesCreated: "変数がまだ作成されていません",
      clickDataToCreate: "データ値をクリックして変数を作成",
      ago: "前",

      // Quality status
      unknown: "不明",
      good: "良好",
      bad: "不良",
      stale: "古い",

      // Modal titles
      createVariable: "変数を作成",
      combineVariables: "変数を結合",
      editVariable: "変数を編集",

      // Form labels
      variableNameLabel: "変数名",
      variableNamePlaceholder: "例: data1, 生産数, 看板",
      variableNameHint: "この変数の一意の名前",
      convertFrom: "変換元",
      convertTo: "変換先",
      selectSourceFormat: "ソースフォーマットを選択...",
      selectTargetFormat: "ターゲットフォーマットを選択...",
      operation: "操作",

      // Source info
      sourceData: "ソースデータ",
      datapoint: "データポイント",
      arrayIndex: "配列インデックス",
      rawValue: "生の値",
      preview: "プレビュー",
      previewResult: "プレビュー結果",

      // Conversion types
      uint16: "符号なし整数（16ビット）",
      uint8: "符号なし整数（8ビット）",
      uint32: "符号なし整数（32ビット）",
      int16: "符号付き整数（16ビット）",
      int8: "符号付き整数（8ビット）",
      int32: "符号付き整数（32ビット）",
      hex16: "16進数（16ビット）",
      hex8: "16進数（8ビット）",
      binary16: "2進数（16ビット）",
      binary8: "2進数（8ビット）",
      binary4: "2進数（4ビット）",
      ascii2: "ASCII（16ビットから2文字）",
      ascii1: "ASCII（8ビットから1文字）",
      float32: "浮動小数点数（32ビット）",
      double64: "倍精度浮動小数点数（64ビット）",
      string: "文字列",
      boolean: "ブール値",
      none: "変換なし（元のまま）",

      // Operations
      concatenate: "連結（文字列結合）",
      concatenateJoin: "連結（値を結合）",
      add: "加算（+）",
      subtract: "減算（-）",
      multiply: "乗算（×）",
      divide: "除算（÷）",
      average: "平均",

      // Combine form
      combinedVariableName: "結合変数名",
      combinedVariable: "結合変数",
      combinedVariablePlaceholder: "例: 看板, full_data",
      selectVariablesToCombine: "結合する変数を選択",
      noVariablesSelected: "変数が選択されていません",
      addVariable: "+ 変数を追加...",

      // Edit form
      sourceVariables: "ソース変数",
      sourceDataInfo: "ソースデータ情報",
      nodeId: "ノードID",
      currentRawValue: "現在の生の値",
      sourceType: "ソースタイプ",

      // Buttons
      cancel: "キャンセル",
      createVariable: "変数を作成",
      createCombinedVariable: "結合変数を作成",
      saveChanges: "変更を保存",
      edit: "編集",
      delete: "削除",

      // Notifications
      failedToInitialize: "初期化に失敗しました",
      failedToLoadData: "データの読み込みに失敗しました",
      variableCreatedSuccess: "変数が正常に作成されました",
      variableCreatedFail: "変数の作成に失敗しました",
      combinedVariableCreatedSuccess: "結合変数が正常に作成されました",
      combinedVariableCreatedFail: "結合変数の作成に失敗しました",
      variableUpdatedSuccess: "変数が正常に更新されました",
      variableUpdatedFail: "変数の更新に失敗しました",
      enterVariableName: "変数名を入力してください",
      selectAtLeast2Variables: "少なくとも2つの変数を選択してください",
      selectOperation: "操作を選択してください",
      selectAtLeast2SourceVariables: "少なくとも2つのソース変数を選択してください",
      selectBothConversionTypes: "両方の変換タイプを選択してください",

      // Required field indicator
      required: "*"
    },

    // Master DB Page
    masterDB: {
      title: "マスターDB",
      csvBulkRegister: "CSV一括登録",
      newRegistration: "新規登録",

      // Tabs
      tabMaster: "マスター",
      tabFactory: "工場",
      tabEquipment: "設備",
      tabRoles: "ロール",
      tabDepartment: "所属部署",
      tabSection: "所属係",
      tabRpiServer: "Rpiサーバー",
      tabTablet: "タブレット",

      // Sub tabs
      dataList: "データ一覧",
      createDeleteHistory: "作成・削除履歴",
      deviceList: "デバイス一覧",
      tabletList: "タブレット一覧",

      // Loading
      loadingDevices: "Raspberry Piデバイスを読み込み中...",
      loadingTablets: "タブレットを読み込み中...",

      // Detail Modal
      productDetails: "製品詳細",
      factoryDetails: "工場詳細",
      equipmentDetails: "設備詳細",
      roleDetails: "ロール詳細",
      departmentDetails: "所属部署詳細",
      sectionDetails: "所属係詳細",
      tabletDetails: "タブレット詳細",
      details: "詳細",
      changeHistory: "変更履歴",

      // Delete
      deleteConfirmation: "削除確認",
      deleteConfirmMsg: "以下のデータを削除しますか？",
      deleteSelectedItems: "選択した項目を削除",
      itemsDeletedSuccess: "件が正常に削除されました",

      // History table
      dateTime: "日時",
      action: "アクション",
      user: "ユーザー",
      recordCount: "レコード数",
      noHistoryFound: "履歴がありません",
      created: "作成",
      deleted: "削除",
      failedToLoadHistory: "履歴の読み込みに失敗しました",
      noChangeHistory: "変更履歴がありません",
      by: "実行者",

      // Master table
      productNumber: "品番",
      productName: "製品名",
      lhrh: "LH/RH",
      kanbanId: "kanbanID",
      equipment: "設備",
      factory: "工場",
      cycleTime: "サイクルタイム",
      inspectionMembers: "検査メンバー数",
      capacity: "収容数",
      productImage: "製品画像",

      // Factory
      factoryName: "工場名",
      address: "住所",
      phone: "電話番号",
      factories: "工場",
      factoryCreatedSuccess: "工場が正常に作成されました",
      factoryUpdated: "工場が更新されました",
      factoryDeleted: "工場が削除されました",
      factoryNameRequired: "工場名は必須です",
      deleteThisFactory: "この工場を削除しますか？",
      createNewFactory: "新規工場作成",
      deleteSelected: "選択した項目を削除",

      // Equipment
      equipmentName: "設備名",
      factoriesLabel: "工場",
      selectMultiple: "複数選択可能",
      createEquipment: "設備を作成",
      equipmentCreated: "設備が作成されました",
      equipmentDeleted: "設備が削除されました",
      equipmentNameRequired: "設備名は必須です",
      deleteThisEquipment: "この設備を削除しますか？",
      opcVariables: "OPC変数",
      opcVariableMappings: "OPC変数マッピング（タブレット用）",
      kanbanVariable: "製品看板変数",
      productionCountVariable: "生産数変数",
      boxQuantityVariable: "箱入数変数",
      selectVariable: "-- 変数を選択 --",
      forProductLookup: "タブレットでの製品タイトル/検索用",
      forProductionCalc: "タブレットでの作業数計算用",
      forBoxQtyDisplay: "タブレットでの合格数追加表示用",

      // Roles
      roleName: "ロール名",
      roles: "ロール",
      createRole: "ロールを作成",
      roleCreated: "ロールが作成されました",
      roleDeleted: "ロールが削除されました",
      roleNameRequired: "ロール名は必須です",
      deleteThisRole: "このロールを削除しますか？",

      // Department
      departmentName: "部署名",
      departments: "部署",
      failedToLoadDepartments: "部署の読み込みに失敗しました",

      // Section
      sectionName: "係名",
      sections: "係",
      failedToLoadSections: "係の読み込みに失敗しました",

      // Division
      addDivision: "部門を追加",
      addNewDivision: "新規部門追加",
      code: "コード",
      manager: "管理者",
      divisionAdded: "部門が追加されました",
      divisionDeleted: "部門が削除されました",
      deleteThisDivision: "この部門を削除しますか？",
      selectAFactory: "工場を選択してください",
      nameRequired: "名前は必須です",
      pleaseSelectFactory: "工場を選択してください",

      // Tablet
      tabletName: "タブレット名",
      brand: "ブランド",
      factoryLocation: "工場名",
      registeredDate: "登録日",
      registeredBy: "登録者",
      quickAccess: "クイックアクセス",
      showQRCode: "QRコードを表示",
      hideQRCode: "QRコードを非表示",
      tabletAccessUrl: "タブレットアクセスURL",
      copy: "コピー",
      copied: "コピーしました！",
      downloadQRCode: "QRコードをダウンロード",
      downloadComplete: "ダウンロード完了！",
      openTablet: "タブレットを開く",

      // Master form
      createNewMasterRecord: "新規マスターレコード作成",
      imageUpload: "画像アップロード",
      selectEquipment: "設備を選択",
      selectFactory: "工場を選択",
      masterRecordCreated: "マスターレコードが正常に作成されました",
      recordCreatedFailed: "レコードの作成に失敗しました",
      recordNotFound: "レコードが見つかりません",
      confirmDeleteRecord: "このレコードを削除してもよろしいですか？",
      recordDeleted: "レコードが正常に削除されました",

      // CSV
      csvUploadTitle: "CSV一括登録",
      csvDescription: "CSVファイルを選択して一括でデータを登録できます",
      dragAndDrop: "CSVファイルをドラッグ＆ドロップ",
      selectFile: "ファイルを選択",
      noCSVData: "CSVデータがありません",
      recordsRegistered: "{success}/{total} レコードを登録しました",
      uploadError: "アップロードエラー",

      // Quick create
      example: "例",
      enterCycleTime: "サイクル時間を入力",
      enterCapacity: "収容数を入力",

      // RPI Server
      rpiServer: "Rpiサーバー",
      deviceName: "デバイス名",
      ipAddress: "IPアドレス",
      port: "ポート",
      status: "ステータス",
      lastSeen: "最終接続",
      online: "オンライン",
      offline: "オフライン",
      noDevicesRegistered: "Raspberry Piデバイスがまだ登録されていません",
      devicesAppearAutomatically: "デバイスは接続時に自動的にここに表示されます",
      deviceId: "デバイスID",
      localIp: "ローカルIP",
      owner: "オーナー",
      active: "アクティブ",
      inactive: "非アクティブ",
      validUntil: "有効期限",
      editDevice: "Raspberry Piデバイスを編集",
      deviceIdReadOnly: "デバイスID（読み取り専用）",
      friendlyNameHint: "このデバイスの表示名（例：KSG2、工場ライン1）",
      localIpReadOnly: "ローカルIP（読み取り専用）",
      authorizedUntil: "認証期限",
      deviceNameRequired: "デバイス名は必須です",
      deviceUpdatedSuccess: "Raspberry Piデバイスが正常に更新されました",
      failedToUpdateDevice: "デバイスの更新に失敗しました",
      failedToLoadDeviceDetails: "デバイス詳細の読み込みに失敗しました",
      failedToLoadDevices: "Raspberry Piデバイスの読み込みに失敗しました",

      // Tablet extra
      tabletNameExists: "このタブレット名は既に使用されています。別の名前を入力してください。",
      tabletNameInUse: "この名前は既に使用されています",
      tabletCreated: "タブレットを登録しました",
      tabletDeleted: "タブレットを削除しました",
      deleteTabletConfirm: "このタブレットを削除しますか？",
      accessRestriction: "アクセス制限（オプション）",
      accessRestrictionDesc: "空欄の場合、工場・設備が一致する全ユーザーがアクセス可能です。特定のユーザーのみに制限する場合は、ユーザー名をカンマ区切りで入力してください。",
      accessRestrictionPlaceholder: "例: user1, user2, user3 (空欄=制限なし)",
      tabletRegistration: "タブレット登録",

      // Misc
      urlCopyFailed: "URLのコピーに失敗しました",
      opcConfigTip: "ヒント：これらの変数は以下から設定できます：",
      opcManagementPage: "OPC管理",
      saveChanges: "変更を保存",
      departmentNameRequired: "部署名は必須です",
      sectionNameRequired: "係名は必須です",
      fillAllRequired: "すべての必須項目を入力してください"
    }
  }
};

// Current language (default to English, can be changed by user)
let currentLanguage = localStorage.getItem('preferredLanguage') || 'en';

// Get translation function
function t(key) {
  const keys = key.split('.');
  let value = translations[currentLanguage];

  for (const k of keys) {
    if (value && typeof value === 'object') {
      value = value[k];
    } else {
      console.warn(`Translation key not found: ${key}`);
      return key;
    }
  }

  return value || key;
}

// Apply translations to all elements with data-i18n attribute
function applyTranslations(container = document) {
  // Handle data-i18n attributes (set textContent)
  container.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (key) {
      el.textContent = t(key);
    }
  });

  // Handle data-i18n-placeholder attributes (set placeholder)
  container.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) {
      el.placeholder = t(key);
    }
  });

  // Handle data-i18n-title attributes (set title)
  container.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (key) {
      el.title = t(key);
    }
  });
}

// Change language function
function changeLanguage(lang) {
  if (translations[lang]) {
    currentLanguage = lang;
    localStorage.setItem('preferredLanguage', lang);

    // Apply translations to all data-i18n elements
    applyTranslations();

    // Trigger a custom event to notify all components
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: lang } }));

    return true;
  }
  return false;
}

// Get current language
function getCurrentLanguage() {
  return currentLanguage;
}

// Export functions to global scope
if (typeof window !== 'undefined') {
  window.t = t;
  window.applyTranslations = applyTranslations;
  window.changeLanguage = changeLanguage;
  window.getCurrentLanguage = getCurrentLanguage;
  window.translations = translations;
}
