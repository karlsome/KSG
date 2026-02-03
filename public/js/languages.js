// languages.js - Internationalization (i18n) for KSG System

const translations = {
  en: {
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
      noDepartmentData: "⚠️ No department data",
      noSectionData: "⚠️ No section data",
      noFactoryData: "⚠️ No factory data",
      noEquipmentData: "⚠️ No equipment data",
      
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
    }
  },
  
  ja: {
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
      noDepartmentData: "⚠️ 部署データがありません",
      noSectionData: "⚠️ 係データがありません",
      noFactoryData: "⚠️ 工場データがありません",
      noEquipmentData: "⚠️ 設備データがありません",
      
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

// Change language function
function changeLanguage(lang) {
  if (translations[lang]) {
    currentLanguage = lang;
    localStorage.setItem('preferredLanguage', lang);
    
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
  window.changeLanguage = changeLanguage;
  window.getCurrentLanguage = getCurrentLanguage;
  window.translations = translations;
}
