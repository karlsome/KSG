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
      analytics: "Analytics",
      userManagement: "User Management",
      masterDB: "Master DB",
      opcManagement: "OPC Management",
      submittedDB: "Submitted Data"
    },

    // Dashboard
    dashboard: {
      title: "Dashboard",
      welcome: "Live production overview built from submitted data.",
      selectPage: "Select a page from the sidebar to get started.",
      refresh: "Refresh",
      lastUpdated: "Last updated",
      todayOverview: "Today Overview",
      todaySubmissions: "Submissions Today",
      goodPiecesToday: "Good Pieces Today",
      defectsToday: "Defect Pieces Today",
      issueCasesToday: "Issue Cases Today",
      activeOperators: "Active Operators",
      avgCycleTime: "Average Cycle Time",
      troubleHours: "Trouble Hours",
      activeKanbans: "Active Kanbans",
      activeRecords: "Active Records",
      trashItems: "Trash Items",
      recentSubmissions: "Recent Submissions",
      problemsToday: "Problems Today",
      topDefects: "Top Defects",
      latestIssueCases: "Latest Issue Cases",
      topProductsToday: "Top Products Today",
      topOperatorsToday: "Top Operators Today",
      workerHoursToday: "Worker Hours Today",
      dailyTrend: "7-Day Trend",
      viewSubmittedData: "Open Submitted Data",
      clickToView: "Click to view details",
      detailTitle: "Submission Details",
      quickLookTitle: "Quick Look",
      product: "Product",
      hinban: "Hinban",
      kanbanId: "Kanban ID",
      lhRh: "LH/RH",
      operators: "Operators",
      goodPieces: "Good",
      defects: "Defects",
      problemCount: "Issues",
      time: "Time",
      start: "Start",
      end: "End",
      breakTime: "Break",
      createdTotal: "Created",
      ngCount: "NG",
      defectRate: "Defect Rate",
      justNow: "just now",
      source: "Source",
      remarks: "Remarks",
      otherDescription: "Other Description",
      defectBreakdown: "Defect Breakdown",
      cycleTimeShort: "CT",
      submissions: "Submissions",
      quickLookHint: "Click for a quick list",
      loadingDetails: "Loading details...",
      failedToLoadDetails: "Failed to load submission details.",
      noTodaySubmissions: "No submissions today.",
      noIssueCases: "No issue cases today.",
      noActiveOperators: "No active operators today.",
      noCycleTimeRecords: "No cycle-time records today.",
      noDefectRecords: "No defect records today.",
      operatorSummary: "Operator Summary",
      noRecentSubmissions: "No recent submissions.",
      noProblemsToday: "No problems recorded today.",
      noDefects: "No defects recorded.",
      noTopProducts: "No product data for today.",
      noTopOperators: "No operator data for today.",
      noWorkerHoursToday: "No worker-hour data for today.",
      noTrendData: "No trend data for the last 7 days."
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
  confirmDelete: "Are you sure you want to delete this user?",

  // Password reset
  resetPassword: "Reset Password",
  newPassword: "New Password",
  confirmPassword: "Confirm Password",
  resetPasswordTitle: "Reset User Password",
  passwordsDoNotMatch: "Passwords do not match",
  passwordResetSuccess: "Password reset successfully",
  passwordResetFailed: "Failed to reset password"
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
      availableVariables: "Available Variables",
      selectedVariables: "Selected Variables",
      clickVariablesToAdd: "Click variables to add",
      variableSettings: "Variable Settings",
      enterVariableNamePlaceholder: "Enter variable name",
      selectOperationPlaceholder: "Select operation...",
      noVariablesAvailable: "No variables available",
      value: "Value",
      saveCombinedVariable: "Save Combined Variable",

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
    },

    // Analytics Page
    analytics: {
      title: "Analytics",
      description: "Organized by what an admin actually needs to answer: overall health, worker performance, machine stability, quality risks, and product behavior.",
      lastUpdated: "Last updated:",
      refresh: "Refresh",
      refreshing: "Refreshing...",

      filters: {
        startDate: "Start date",
        endDate: "End date",
        machineSource: "Machine source",
        lhRh: "LH/RH",
        hinban: "Hinban",
        product: "Product",
        workerContains: "Worker contains",
        focusWorkerChart: "Focus worker chart",
        shiftStart: "Shift start",
        shiftEnd: "Shift end",
        allSources: "All sources",
        allDirections: "All directions",
        autoTopWorker: "Auto (top worker)",
        applyFilters: "Apply filters",
        reset: "Reset",
        resetShift: "Reset shift",
        filterByHinban: "Filter by hinban",
        filterByProduct: "Filter by product",
        searchOperator: "Search operator"
      },

      scopeSummary: {
        title: "Scope Summary",
        description: "A compact view of output, quality, labor, and operating footprint for the current filter."
      },

      tabs: {
        overview: "Overview",
        worker: "Worker",
        machine: "Machine",
        quality: "Quality",
        product: "Product"
      },

      meta: {
        range: "Range",
        records: "Records",
        workers: "Workers",
        machines: "Machines",
        machine: "Machine",
        direction: "Direction",
        hinban: "Hinban",
        product: "Product",
        worker: "Worker",
        shift: "Shift",
        all: "All",
        rangeValuePattern: "{start} to {end}",
        shiftValuePattern: "{start} to {end} ({hours})"
      },

      common: {
        value: "Value",
        unknown: "Unknown",
        hoursUnit: "h",
        piecesPerHourUnit: "pcs/h"
      },

      shift: {
        defaultLabel: "Morning shift",
        shiftPattern: "Shift: {start} to {end} ({hours})",
        focusedOnText: "Focused on {name}. Daily output is treated as one {label} ({start}-{end}), while hours remain full participation time.",
        autoSelectText: "Auto-selecting the busiest worker in the current filter.",
        focusedSkillText: "Focused on {name}. Benchmarks compare that worker against all workers on the same machine and product contexts.",
        autoSkillText: "Comparing the focused worker against the same machine and product contexts."
      },

      kpi: {
        goodPieces: "Good Pieces",
        defectRate: "Defect Rate",
        issueRecords: "Issue Records",
        manHours: "Man Hours",
        activeWorkers: "Active Workers",
        activeMachines: "Active Machines",
        recordsInScope: "{n} records in scope",
        totalDefects: "{n} total defects",
        recordsWithIssues: "Records with defects, trouble, or remarks",
        troubleTime: "{n} trouble time",
        kanbans: "{n} kanbans",
        products: "{n} products"
      },

      overview: {
        outputTrendTitle: "Output and issue trend",
        outputTrendDesc: "See whether production, labor, and issues are moving together or drifting apart.",
        attentionTitle: "What needs attention",
        attentionDesc: "Shortlist of the biggest quality, labor, and machine signals in the selected range.",
        mainDefectDriver: "Main Defect Driver",
        mostLoadedWorker: "Most Loaded Worker",
        mostUnstableMachine: "Most Unstable Machine",
        leadProduct: "Lead Product",
        qualitySignal: "Quality signal",
        machineSignal: "Machine signal",
        laborSignal: "Labor signal",
        dailyPattern: "Daily pattern",
        noDefects: "No defects",
        noWorkerData: "No worker data",
        noMachineData: "No machine data",
        noProductData: "No product data",
        noTrendData: "No trend data for the selected filters.",
        defectHits: "{n} defect hits in scope",
        noQualityLoss: "No quality loss in the current filter",
        workerHoursRecords: "{hours} across {records} records",
        noWorkerActivity: "No worker activity for the current filter",
        machineTroubleRate: "{hours} trouble time, {rate} defect rate",
        noMachineActivity: "No machine activity for the current filter",
        productGoodDefect: "{good} good pieces, {rate} defect rate",
        noProductActivity: "No product activity for the current filter",
        qualitySignalText: "{name} is the leading defect with {count} hits.",
        noDefectSignal: "No defect signal in the current filter.",
        machineAlertText: "{source} is carrying {hours} of trouble time with {rate} defect rate.",
        noMachineAlert: "No machine alerts for the selected filter.",
        workerAlertText: "{name} logged {hours} with {issues} issue records.",
        noWorkerAlert: "No worker alerts for the selected filter.",
        dayAlertText: "{day} had {issues} issue records and {rate} defect rate.",
        noDayPattern: "No daily issue pattern available."
      },

      worker: {
        sharedNote: "Shared records split output and defect counts evenly across listed operators. Time-based metrics use full participation hours for each worker, and shift-normalized views follow the admin-configured shift window.",
        productivityTitle: "Productivity",
        productivityDesc: "Rank workers by average output per configured shift and compare how much output they generate per active hour.",
        qualityTitle: "Quality",
        qualityDesc: "See which workers accumulate the most attributed defects and where defect rate is persistently high.",
        efficiencyTitle: "Time Efficiency",
        efficiencyDesc: "Track downtime behavior with break time, trouble time, and how much of each configured shift is actually occupied by work.",
        consistencyTitle: "Consistency Over Time",
        skillTitle: "Skill Fit",
        leaderboardTitle: "Worker leaderboard",
        leaderboardDesc: "Use this table to compare attributed output, shared-work mix, downtime, and defect pressure.",
        highestAvgOutput: "Highest Avg Shift Output",
        bestOutputHour: "Best Output / Hour",
        highestDefectLoad: "Highest Defect Load",
        mostConsistent: "Most Consistent Worker",
        noData: "No worker data",
        noCandidate: "No candidate",
        noProductivityData: "No worker productivity data for the selected filters.",
        noQualityData: "No worker quality data for the selected filters.",
        noEfficiencyData: "No worker time-efficiency data for the selected filters.",
        noConsistencyData: "No daily worker history for the selected focus worker.",
        noSkillData: "No worker skill-fit contexts for the selected focus worker.",
        noWorkerTableData: "No worker data for the selected filters.",
        detailHighestOutput: "{count} pieces per {start}-{end} shift",
        detailNoOutput: "No output signal in this filter",
        detailBestThroughput: "{pph} or {pieces} pieces per configured shift",
        detailNeedMoreRecords: "Need at least 2 records and 1 active hour",
        detailHighestDefect: "{count} attributed defects at {rate}",
        detailNoQualityLoss: "No quality loss in this filter",
        detailConsistency: "{score} consistency score across {days} configured shifts",
        detailNeedMoreShifts: "Need at least 3 active shifts to compare stability",
        tableWorker: "Worker",
        tableRecords: "Records",
        tableShared: "Shared",
        tableDays: "Days",
        tableAvgShift: "Avg/Shift",
        tableOutputHour: "Output/Hour",
        tableShiftUtil: "Shift Util.",
        tableHours: "Hours",
        tableIssues: "Issues",
        tableDowntime: "Downtime",
        tableDefectRate: "Defect Rate",
        tableAvgCT: "Avg CT",
        chartAvgOutputShift: "Avg Output/Shift",
        chartOutputHour: "Output/Hour",
        chartAttributedDefects: "Attributed Defects",
        chartDefectRate: "Defect Rate",
        chartBreakTime: "Break Time",
        chartTroubleTime: "Trouble Time",
        chartShiftUtil: "Shift Utilization",
        chartShiftOutput: "Shift Output",
        chartSkillDelta: "Skill Delta",
        yAxisPiecesShift: "Pieces/shift",
        yAxisPcsH: "pcs/h",
        yAxisDefects: "Defects",
        yAxisPercent: "%",
        yAxisHours: "Hours",
        yAxisPercentShift: "% of shift",
        yAxisVsBaseline: "% vs baseline",
        tooltipOutputHour: "Worker output/hour",
        tooltipBaselineHour: "Baseline output/hour",
        tooltipDelta: "Delta vs baseline",
        tooltipDefectRate: "Worker defect rate",
        tooltipBaselineDefect: "Baseline defect rate",
        scopeMachine: "Machine",
        scopeProduct: "Product"
      },

      machine: {
        performanceTitle: "Machine source performance",
        performanceDesc: "Output, downtime, and defect rate by submitted source.",
        spotlightTitle: "Machine spotlight",
        spotlightDesc: "Quick cards for the most productive and most unstable sources.",
        tableTitle: "Machine table",
        tableDesc: "Compare source stability, labor, and issue frequency in one place.",
        highestOutput: "Highest Output Machine",
        mostTrouble: "Most Trouble Time",
        mostIssues: "Most Issue Records",
        highestDefect: "Highest Defect Rate",
        noData: "No machine data",
        noOutputData: "No machine output data",
        noTroubleSignal: "No trouble signal",
        noIssueSignal: "No issue signal",
        noQualitySignal: "No quality signal",
        noMachineData: "No machine data for the selected filters.",
        noMachineCards: "No machine/source records for the selected filters.",
        detailGoodPieces: "{n} good pieces",
        detailTroubleTime: "{n} trouble time",
        detailIssueRecords: "{n} issue records",
        detailDefectRate: "{n} defect rate",
        cardSubtext: "{records} records, {issues} issue records",
        cardGood: "Good",
        cardTrouble: "Trouble",
        tableSource: "Machine Source",
        tableRecords: "Records",
        tableGood: "Good",
        tableHours: "Hours",
        tableTrouble: "Trouble",
        tableIssues: "Issues",
        tableDefectRate: "Defect Rate",
        chartGoodPieces: "Good Pieces",
        chartTroubleTime: "Trouble Time",
        chartDefectRate: "Defect Rate",
        yAxisPiecesHours: "Pieces / Hours",
        yAxisPercent: "%"
      },

      quality: {
        paretoTitle: "Defect Pareto",
        paretoDesc: "The defect types that explain most of the quality loss in the selected period.",
        watchlistTitle: "Quality watchlist",
        watchlistDesc: "Signals to inspect first when quality starts drifting.",
        hotspotsTitle: "Quality hotspots",
        hotspotsDesc: "The most defect-heavy or trouble-heavy records, including remarks for inspection.",
        kpiDefectRate: "Defect Rate",
        kpiIssueRecords: "Issue Records",
        kpiTopDefect: "Top Defect",
        kpiHighestRisk: "Highest-Risk Product",
        kpiRecordsReview: "Records needing review",
        kpiNoDefects: "No defects",
        kpiNoDefectActivity: "No defect activity in this filter",
        kpiNoProductData: "No product data",
        kpiNoProductSignal: "No product quality signal",
        alertTopDefect: "Top defect",
        alertWorstDay: "Worst day",
        alertMachineInspect: "Machine to inspect",
        alertProductInspect: "Product to inspect",
        alertTopDefectText: "{name} accounts for {n} counted defects.",
        alertNoDefectSignal: "No defect signal in the current filter.",
        alertWorstDayText: "{day} reached {rate} defect rate with {n} issue records.",
        alertNoWorstDay: "No day-level quality signal in the current filter.",
        alertMachineText: "{machine} is running at {rate} defect rate.",
        alertNoMachineSignal: "No machine quality signal in the current filter.",
        alertProductText: "{product} is running at {rate} defect rate.",
        alertNoProductSignal: "No product quality signal in the current filter.",
        noDefectRecords: "No defect records for the selected filters.",
        noHotspots: "No issue-heavy records for the selected filters.",
        loadingHotspots: "Loading analytics...",
        tableTimestamp: "Timestamp",
        tableProduct: "Product",
        tableWorker: "Worker",
        tableDefectFocus: "Defect Focus",
        tableTrouble: "Trouble",
        tableRemarks: "Remarks",
        tableDefectsCount: "{n} defects",
        tableNoDefectDetail: "No defect detail",
        detailTotalDefects: "{n} total defects",
        detailCountedEvents: "{n} counted events",
        detailDefectRate: "{n} defect rate"
      },

      product: {
        chartTitle: "Product output and defect rate",
        chartDesc: "Find which products are carrying throughput and which ones are creating quality risk.",
        notesTitle: "Product notes",
        notesDesc: "Fast scan of lead products, high-risk products, and slow-cycle items.",
        tableTitle: "Product table",
        tableDesc: "Throughput, quality, and cycle-time summary by product.",
        leadProduct: "Lead Product",
        highestDefect: "Highest Defect Rate",
        slowestCycle: "Slowest Cycle",
        mostIssues: "Most Issue Records",
        noData: "No product data",
        noOutputData: "No product output data",
        noQualitySignal: "No quality signal",
        noCycleSignal: "No cycle-time signal",
        noIssueSignal: "No issue signal",
        noProductData: "No product data for the selected filters.",
        detailGoodPieces: "{n} good pieces",
        detailDefectRate: "{n} defect rate",
        detailAvgCycleTime: "{n} average cycle time",
        detailIssueRecords: "{n} issue records",
        noteLead: "Lead product",
        noteRiskiest: "Riskiest product",
        noteSlowest: "Slowest cycle",
        highlightLeadText: "{name} produced {n} good pieces.",
        highlightNoLead: "No lead product in the current filter.",
        highlightRiskiestText: "{name} is running at {rate} defect rate.",
        highlightNoRiskiest: "No product quality signal in the current filter.",
        highlightSlowestText: "{name} is averaging {ct} cycle time.",
        highlightNoSlowest: "No cycle-time signal in the current filter.",
        tableProduct: "Product",
        tableRecords: "Records",
        tableGood: "Good",
        tableHours: "Hours",
        tableIssues: "Issues",
        tableDefectRate: "Defect Rate",
        tableAvgCT: "Avg CT",
        chartGoodPieces: "Good Pieces",
        chartDefectRate: "Defect Rate",
        yAxisPieces: "Pieces",
        yAxisPercent: "%"
      },

      errors: {
        loadFailed: "Failed to load analytics"
      },

      empty: {
        noData: "No data for this section.",
        chartNotAvailable: "Chart library not available"
      }
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
      analytics: "分析",
      userManagement: "ユーザー管理",
      masterDB: "マスターDB",
      opcManagement: "OPC管理",
      submittedDB: "提出データ"
    },

    // Dashboard
    dashboard: {
      title: "ダッシュボード",
      welcome: "提出データから今日の動きと異常をすぐ確認できます。",
      selectPage: "サイドバーからページを選択してください。",
      refresh: "更新",
      lastUpdated: "最終更新",
      todayOverview: "本日の概要",
      todaySubmissions: "本日の提出件数",
      goodPiecesToday: "本日の良品数",
      defectsToday: "本日の不良数",
      issueCasesToday: "本日の異常件数",
      activeOperators: "稼働作業者",
      avgCycleTime: "平均CT",
      troubleHours: "トラブル時間",
      activeKanbans: "稼働看板",
      activeRecords: "有効データ",
      trashItems: "ゴミ箱件数",
      recentSubmissions: "直近の提出",
      problemsToday: "本日の問題",
      topDefects: "不良上位",
      latestIssueCases: "最新の問題データ",
      topProductsToday: "本日の上位製品",
      topOperatorsToday: "本日の上位作業者",
      workerHoursToday: "本日の作業時間",
      dailyTrend: "直近7日トレンド",
      viewSubmittedData: "提出データを開く",
      clickToView: "クリックして詳細を表示",
      detailTitle: "提出データ詳細",
      quickLookTitle: "クイック確認",
      product: "製品",
      hinban: "品番",
      kanbanId: "看板ID",
      lhRh: "LH/RH",
      operators: "作業者",
      goodPieces: "良品",
      defects: "不良",
      problemCount: "問題",
      time: "時刻",
      start: "開始",
      end: "終了",
      breakTime: "休憩",
      createdTotal: "総数",
      ngCount: "NG",
      defectRate: "不良率",
      justNow: "たった今",
      source: "送信元",
      remarks: "備考",
      otherDescription: "その他詳細",
      defectBreakdown: "不良内訳",
      cycleTimeShort: "CT",
      submissions: "件数",
      quickLookHint: "クリックして一覧を確認",
      loadingDetails: "詳細を読み込み中...",
      failedToLoadDetails: "提出データ詳細の読み込みに失敗しました。",
      noTodaySubmissions: "本日の提出データはありません。",
      noIssueCases: "本日の異常データはありません。",
      noActiveOperators: "本日の稼働作業者はいません。",
      noCycleTimeRecords: "本日のCTデータはありません。",
      noDefectRecords: "本日の不良データはありません。",
      operatorSummary: "作業者サマリー",
      noRecentSubmissions: "直近の提出データはありません。",
      noProblemsToday: "本日の問題データはありません。",
      noDefects: "不良データはありません。",
      noTopProducts: "本日の製品データはありません。",
      noTopOperators: "本日の作業者データはありません。",
      noWorkerHoursToday: "本日の作業時間データはありません。",
      noTrendData: "直近7日分のデータはありません。"
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
  confirmDelete: "このユーザーを削除してもよろしいですか？",

  // Password reset
  resetPassword: "パスワードリセット",
  newPassword: "新しいパスワード",
  confirmPassword: "パスワード確認",
  resetPasswordTitle: "ユーザーパスワードのリセット",
  passwordsDoNotMatch: "パスワードが一致しません",
  passwordResetSuccess: "パスワードが正常にリセットされました",
  passwordResetFailed: "パスワードのリセットに失敗しました"
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
      availableVariables: "利用可能な変数",
      selectedVariables: "選択された変数",
      clickVariablesToAdd: "変数をクリックして追加",
      variableSettings: "変数設定",
      enterVariableNamePlaceholder: "変数名を入力",
      selectOperationPlaceholder: "操作を選択...",
      noVariablesAvailable: "利用可能な変数がありません",
      value: "値",
      saveCombinedVariable: "結合変数を保存",

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
    },

    // Analytics Page
    analytics: {
      title: "アナリティクス",
      description: "全体の状況、作業者のパフォーマンス、設備の安定性、品質リスク、製品動向を管理者が把握しやすい形で整理しています。",
      lastUpdated: "最終更新：",
      refresh: "更新",
      refreshing: "更新中...",

      filters: {
        startDate: "開始日",
        endDate: "終了日",
        machineSource: "設備ソース",
        lhRh: "LH/RH",
        hinban: "品番",
        product: "製品",
        workerContains: "作業者検索",
        focusWorkerChart: "フォーカス作業者",
        shiftStart: "シフト開始",
        shiftEnd: "シフト終了",
        allSources: "全ソース",
        allDirections: "全方向",
        autoTopWorker: "自動（上位作業者）",
        applyFilters: "フィルター適用",
        reset: "リセット",
        resetShift: "シフトリセット",
        filterByHinban: "品番で絞り込み",
        filterByProduct: "製品で絞り込み",
        searchOperator: "作業者を検索"
      },

      scopeSummary: {
        title: "スコープサマリー",
        description: "現在のフィルター条件における生産量、品質、労働力、稼働状況のコンパクトな概要です。"
      },

      tabs: {
        overview: "概要",
        worker: "作業者",
        machine: "設備",
        quality: "品質",
        product: "製品"
      },

      meta: {
        range: "期間",
        records: "件数",
        workers: "作業者",
        machines: "設備",
        machine: "設備",
        direction: "方向",
        hinban: "品番",
        product: "製品",
        worker: "作業者",
        shift: "シフト",
        all: "全期間",
        rangeValuePattern: "{start}〜{end}",
        shiftValuePattern: "{start}〜{end} ({hours})"
      },

      common: {
        value: "値",
        unknown: "不明",
        hoursUnit: "時間",
        piecesPerHourUnit: "個/時"
      },

      shift: {
        defaultLabel: "日勤シフト",
        shiftPattern: "シフト: {start}〜{end} ({hours})",
        focusedOnText: "{name}にフォーカス中。日別出力は{label}（{start}〜{end}）として計算し、時間は実参加時間を使用します。",
        autoSelectText: "現在のフィルター内で最も稼働の多い作業者を自動選択しています。",
        focusedSkillText: "{name}にフォーカス中。同じ設備・製品条件の全作業者と比較します。",
        autoSkillText: "フォーカス作業者を同じ設備・製品条件と比較しています。"
      },

      kpi: {
        goodPieces: "良品数",
        defectRate: "不良率",
        issueRecords: "問題件数",
        manHours: "工数",
        activeWorkers: "稼働作業者",
        activeMachines: "稼働設備",
        recordsInScope: "{n}件のデータ",
        totalDefects: "不良数合計 {n}",
        recordsWithIssues: "不良・トラブル・備考を含むデータ",
        troubleTime: "トラブル時間 {n}",
        kanbans: "看板 {n}",
        products: "製品 {n}種"
      },

      overview: {
        outputTrendTitle: "生産量・問題件数トレンド",
        outputTrendDesc: "生産、労働、問題件数が連動しているか、乖離していないか確認できます。",
        attentionTitle: "要注意項目",
        attentionDesc: "選択期間における品質、労働、設備の主要シグナルの一覧です。",
        mainDefectDriver: "主な不良要因",
        mostLoadedWorker: "最多稼働作業者",
        mostUnstableMachine: "最も不安定な設備",
        leadProduct: "主力製品",
        qualitySignal: "品質シグナル",
        machineSignal: "設備シグナル",
        laborSignal: "労働シグナル",
        dailyPattern: "日別パターン",
        noDefects: "不良なし",
        noWorkerData: "作業者データなし",
        noMachineData: "設備データなし",
        noProductData: "製品データなし",
        noTrendData: "選択したフィルターのトレンドデータがありません。",
        defectHits: "{n}件の不良",
        noQualityLoss: "現在のフィルターで品質損失なし",
        workerHoursRecords: "{records}件で{hours}",
        noWorkerActivity: "現在のフィルターで作業者活動なし",
        machineTroubleRate: "トラブル時間{hours}、不良率{rate}",
        noMachineActivity: "現在のフィルターで設備活動なし",
        productGoodDefect: "良品{good}個、不良率{rate}",
        noProductActivity: "現在のフィルターで製品活動なし",
        qualitySignalText: "{name}が{count}件でトップの不良です。",
        noDefectSignal: "現在のフィルターで不良シグナルなし。",
        machineAlertText: "{source}はトラブル時間{hours}、不良率{rate}があります。",
        noMachineAlert: "選択したフィルターで設備アラートなし。",
        workerAlertText: "{name}は{hours}で問題件数{issues}件です。",
        noWorkerAlert: "選択したフィルターで作業者アラートなし。",
        dayAlertText: "{day}は問題件数{issues}件、不良率{rate}でした。",
        noDayPattern: "日別問題パターンデータなし。"
      },

      worker: {
        sharedNote: "共有レコードは出力と不良数を登録作業者間で均等に分配します。時間ベースの指標は各作業者の実参加時間を使用し、シフト正規化ビューは管理者設定のシフト時間に従います。",
        productivityTitle: "生産性",
        productivityDesc: "設定シフトあたりの平均出力で作業者をランク付けし、稼働時間あたりの出力を比較します。",
        qualityTitle: "品質",
        qualityDesc: "帰属不良が多い作業者と不良率が継続して高い作業者を確認します。",
        efficiencyTitle: "時間効率",
        efficiencyDesc: "休憩時間、トラブル時間、設定シフトのどれだけが実作業に使われているかを追跡します。",
        consistencyTitle: "継続的な安定性",
        skillTitle: "スキル適合",
        leaderboardTitle: "作業者リーダーボード",
        leaderboardDesc: "このテーブルで帰属出力、共有作業の割合、ダウンタイム、不良負荷を比較できます。",
        highestAvgOutput: "シフト平均出力最多",
        bestOutputHour: "時間あたり出力最大",
        highestDefectLoad: "不良負荷最大",
        mostConsistent: "最も安定した作業者",
        noData: "作業者データなし",
        noCandidate: "候補なし",
        noProductivityData: "選択したフィルターの生産性データがありません。",
        noQualityData: "選択したフィルターの品質データがありません。",
        noEfficiencyData: "選択したフィルターの時間効率データがありません。",
        noConsistencyData: "選択したフォーカス作業者の日別履歴がありません。",
        noSkillData: "選択したフォーカス作業者のスキル適合データがありません。",
        noWorkerTableData: "選択したフィルターの作業者データがありません。",
        detailHighestOutput: "{start}〜{end}シフトで{count}個",
        detailNoOutput: "このフィルターで出力シグナルなし",
        detailBestThroughput: "{pph}、設定シフト{pieces}個",
        detailNeedMoreRecords: "最低2件のデータと1時間の稼働が必要",
        detailHighestDefect: "帰属不良{count}個（{rate}）",
        detailNoQualityLoss: "このフィルターで品質損失なし",
        detailConsistency: "{days}シフトの一貫性スコア{score}",
        detailNeedMoreShifts: "安定性比較には最低3シフトが必要",
        tableWorker: "作業者",
        tableRecords: "件数",
        tableShared: "共有",
        tableDays: "日数",
        tableAvgShift: "シフト平均",
        tableOutputHour: "出力/時間",
        tableShiftUtil: "シフト稼働率",
        tableHours: "時間",
        tableIssues: "問題",
        tableDowntime: "ダウンタイム",
        tableDefectRate: "不良率",
        tableAvgCT: "平均CT",
        chartAvgOutputShift: "シフト平均出力",
        chartOutputHour: "出力/時間",
        chartAttributedDefects: "帰属不良数",
        chartDefectRate: "不良率",
        chartBreakTime: "休憩時間",
        chartTroubleTime: "トラブル時間",
        chartShiftUtil: "シフト稼働率",
        chartShiftOutput: "シフト出力",
        chartSkillDelta: "スキルデルタ",
        yAxisPiecesShift: "個/シフト",
        yAxisPcsH: "個/時",
        yAxisDefects: "不良数",
        yAxisPercent: "%",
        yAxisHours: "時間",
        yAxisPercentShift: "シフト占有率",
        yAxisVsBaseline: "ベースライン比 %",
        tooltipOutputHour: "作業者の出力/時間",
        tooltipBaselineHour: "ベースライン出力/時間",
        tooltipDelta: "ベースライン比デルタ",
        tooltipDefectRate: "作業者の不良率",
        tooltipBaselineDefect: "ベースライン不良率",
        scopeMachine: "設備",
        scopeProduct: "製品"
      },

      machine: {
        performanceTitle: "設備ソース別パフォーマンス",
        performanceDesc: "提出ソース別の生産量、ダウンタイム、不良率です。",
        spotlightTitle: "設備スポットライト",
        spotlightDesc: "最も生産性の高い・不安定なソースのクイックカードです。",
        tableTitle: "設備テーブル",
        tableDesc: "ソースの安定性、労働、問題頻度を一覧で比較できます。",
        highestOutput: "最高生産設備",
        mostTrouble: "最多トラブル時間",
        mostIssues: "最多問題件数",
        highestDefect: "最高不良率",
        noData: "設備データなし",
        noOutputData: "設備生産データなし",
        noTroubleSignal: "トラブルシグナルなし",
        noIssueSignal: "問題シグナルなし",
        noQualitySignal: "品質シグナルなし",
        noMachineData: "選択したフィルターの設備データがありません。",
        noMachineCards: "選択したフィルターの設備・ソースデータがありません。",
        detailGoodPieces: "良品数{n}個",
        detailTroubleTime: "トラブル時間{n}",
        detailIssueRecords: "問題件数{n}件",
        detailDefectRate: "不良率{n}",
        cardSubtext: "{records}件・問題{issues}件",
        cardGood: "良品",
        cardTrouble: "トラブル",
        tableSource: "設備ソース",
        tableRecords: "件数",
        tableGood: "良品",
        tableHours: "時間",
        tableTrouble: "トラブル",
        tableIssues: "問題",
        tableDefectRate: "不良率",
        chartGoodPieces: "良品数",
        chartTroubleTime: "トラブル時間",
        chartDefectRate: "不良率",
        yAxisPiecesHours: "個 / 時間",
        yAxisPercent: "%"
      },

      quality: {
        paretoTitle: "不良パレート",
        paretoDesc: "選択期間において品質損失の大部分を占める不良種別です。",
        watchlistTitle: "品質ウォッチリスト",
        watchlistDesc: "品質が悪化し始めたときに最初に確認すべきシグナルです。",
        hotspotsTitle: "品質ホットスポット",
        hotspotsDesc: "不良またはトラブルが最も多いレコード（備考を含む）です。",
        kpiDefectRate: "不良率",
        kpiIssueRecords: "問題件数",
        kpiTopDefect: "主要不良",
        kpiHighestRisk: "最高リスク製品",
        kpiRecordsReview: "要確認のデータ",
        kpiNoDefects: "不良なし",
        kpiNoDefectActivity: "このフィルターでは不良活動なし",
        kpiNoProductData: "製品データなし",
        kpiNoProductSignal: "製品品質シグナルなし",
        alertTopDefect: "主要不良",
        alertWorstDay: "最悪日",
        alertMachineInspect: "確認が必要な設備",
        alertProductInspect: "確認が必要な製品",
        alertTopDefectText: "{name}が{n}件の不良を占めています。",
        alertNoDefectSignal: "現在のフィルターで不良シグナルなし。",
        alertWorstDayText: "{day}は不良率{rate}、問題件数{n}件に達しました。",
        alertNoWorstDay: "現在のフィルターで日別品質シグナルなし。",
        alertMachineText: "{machine}は不良率{rate}で稼働中です。",
        alertNoMachineSignal: "現在のフィルターで設備品質シグナルなし。",
        alertProductText: "{product}は不良率{rate}で稼働中です。",
        alertNoProductSignal: "現在のフィルターで製品品質シグナルなし。",
        noDefectRecords: "選択したフィルターの不良データがありません。",
        noHotspots: "選択したフィルターの問題レコードがありません。",
        loadingHotspots: "読み込み中...",
        tableTimestamp: "タイムスタンプ",
        tableProduct: "製品",
        tableWorker: "作業者",
        tableDefectFocus: "不良フォーカス",
        tableTrouble: "トラブル",
        tableRemarks: "備考",
        tableDefectsCount: "{n}件の不良",
        tableNoDefectDetail: "不良詳細なし",
        detailTotalDefects: "不良数合計{n}",
        detailCountedEvents: "{n}件",
        detailDefectRate: "不良率{n}"
      },

      product: {
        chartTitle: "製品別生産量・不良率",
        chartDesc: "スループットを担っている製品と品質リスクを生み出している製品を特定できます。",
        notesTitle: "製品メモ",
        notesDesc: "主力製品、高リスク製品、サイクルタイムが遅い製品のクイックスキャンです。",
        tableTitle: "製品テーブル",
        tableDesc: "製品別のスループット、品質、サイクルタイムの概要です。",
        leadProduct: "主力製品",
        highestDefect: "最高不良率",
        slowestCycle: "最遅サイクル",
        mostIssues: "最多問題件数",
        noData: "製品データなし",
        noOutputData: "製品生産データなし",
        noQualitySignal: "品質シグナルなし",
        noCycleSignal: "サイクルタイムシグナルなし",
        noIssueSignal: "問題シグナルなし",
        noProductData: "選択したフィルターの製品データがありません。",
        detailGoodPieces: "良品数{n}個",
        detailDefectRate: "不良率{n}",
        detailAvgCycleTime: "平均CT {n}",
        detailIssueRecords: "問題件数{n}件",
        noteLead: "主力製品",
        noteRiskiest: "最高リスク製品",
        noteSlowest: "最遅サイクル",
        highlightLeadText: "{name}が良品{n}個を生産しました。",
        highlightNoLead: "現在のフィルターで主力製品なし。",
        highlightRiskiestText: "{name}は不良率{rate}で稼働中です。",
        highlightNoRiskiest: "現在のフィルターで製品品質シグナルなし。",
        highlightSlowestText: "{name}の平均CT {ct}です。",
        highlightNoSlowest: "現在のフィルターでサイクルタイムシグナルなし。",
        tableProduct: "製品",
        tableRecords: "件数",
        tableGood: "良品",
        tableHours: "時間",
        tableIssues: "問題",
        tableDefectRate: "不良率",
        tableAvgCT: "平均CT",
        chartGoodPieces: "良品数",
        chartDefectRate: "不良率",
        yAxisPieces: "個数",
        yAxisPercent: "%"
      },

      errors: {
        loadFailed: "分析データを読み込めませんでした"
      },

      empty: {
        noData: "このセクションのデータがありません。",
        chartNotAvailable: "チャートライブラリが利用できません"
      }
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
