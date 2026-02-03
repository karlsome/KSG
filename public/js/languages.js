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
