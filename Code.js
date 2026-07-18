/**
 * HOME INVENTORY API
 *
 * POST:
 *   action=add       Add a detected batch
 *   action=search    Search inventory
 *
 * GET:
 *   ?action=search&q=charger
 *   ?action=bin&bin_id=OFC-A01
 *   ?action=status
 */

const SPREADSHEET_ID = "1DBVNLuw4E7fLNvpvOvZ18LBe7O4ppmuqzhdFB7zkTyk";
const MIN_SEARCH_SCORE = 10;

const SHEETS = {
  BINS: "Bins",
  INVENTORY: "Inventory",
  REVIEW: "Needs_Review",
  SETTINGS: "Settings",
  ITEM_MAP: "Item_Map",
  SEARCH_LOG: "Search_Log",
  TRANSACTIONS: "Transactions",
  SEARCH: "Search"
};

const DEFAULT_MINIMUM_CONFIDENCE = 0.75;
const MAX_SEARCH_RESULTS = 25;

function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const action = cleanText(params.action || "status").toLowerCase();

    if (action === "search") {
      return jsonResponse(
        searchInventory({
          query: params.q || params.query,
          source: params.source || "web",
          limit: params.limit
        })
      );
    }

    if (action === "bin") {
      return jsonResponse(getBinContents(params.bin_id));
    }

       if (action === "bins") {
      return jsonResponse(getBins());
    }

    return jsonResponse({
      success: true,
      service: "Home Inventory API",
      status: "running",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error.message || String(error)
    });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);

    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("No request body was received.");
    }

    let rawBody = String(e.postData.contents).trim();

    rawBody = rawBody
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    let requestBody;

    try {
      requestBody = JSON.parse(rawBody);
    } catch (error) {
      throw new Error(
        "Body was not valid JSON. Received: " +
        rawBody.substring(0, 500)
      );
    }

    let payload = requestBody.data || requestBody;

    if (typeof payload === "string") {
      payload = JSON.parse(payload);
    }

    const action = cleanText(
      requestBody.action || payload.action || "add"
    ).toLowerCase();

    if (action === "add_bin") {
      return jsonResponse({
        success: true,
        ...addBin(payload)
  });

}

    if (action === "search") {
      return jsonResponse(searchInventory(payload));
    }

    if (action === "bin") {
      return jsonResponse(getBinContents(payload.bin_id));
    }

    return jsonResponse({
      success: true,
      ...addInventoryBatch(payload)
    });
  } catch (error) {
    console.error(error);

    return jsonResponse({
      success: false,
      error: error.message || String(error)
    });
  } finally {
    try {
      lock.releaseLock();
    } catch (_) {}
  }
}

/**
 * ADD INVENTORY
 */
function addInventoryBatch(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Request payload must be a JSON object.");
  }

  const binId = cleanText(payload.bin_id).toUpperCase();

  if (!binId) {
    throw new Error("bin_id is required.");
  }

  if (
    payload.items &&
    !Array.isArray(payload.items) &&
    typeof payload.items === "object"
  ) {
    payload.items = [payload.items];
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new Error("A non-empty items array is required.");
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  const binsSheet = requireSheet(ss, SHEETS.BINS);
  const inventorySheet = requireSheet(ss, SHEETS.INVENTORY);
  const reviewSheet = requireSheet(ss, SHEETS.REVIEW);
  const settingsSheet = requireSheet(ss, SHEETS.SETTINGS);
  const mapSheet = requireSheet(ss, SHEETS.ITEM_MAP);
  const transactionsSheet = requireSheet(ss, SHEETS.TRANSACTIONS);

  verifyBinExists(binsSheet, binId);

  const minimumConfidence = getMinimumConfidence(settingsSheet);
  const itemMap = loadItemMap(mapSheet);

  const batchId = Utilities.getUuid();
  const timestamp = new Date();
  const photoUrl = cleanText(payload.photo_url);

  const normalized = payload.items.map(item =>
    normalizeItem(item, itemMap, minimumConfidence)
  );

  const mergedItems = mergeDuplicateItems(normalized);

  const inventoryRows = [];
  const reviewRows = [];
  const transactionRows = [];

  mergedItems.forEach(item => {
    const inventoryId = Utilities.getUuid();

    inventoryRows.push([
      inventoryId,
      binId,
      safeSheetText(item.standardName),
      safeSheetText(item.originalName),
      item.quantity,
      safeSheetText(item.category),
      safeSheetText(item.subcategory),
      safeSheetText(item.description),
      safeSheetText(item.keywords.join(", ")),
      item.confidence,
      item.needsReview,
      "Active",
      batchId,
      safeSheetText(photoUrl),
      timestamp,
      timestamp
    ]);

    transactionRows.push([
      Utilities.getUuid(),
      "ADD",
      inventoryId,
      safeSheetText(item.standardName),
      item.quantity,
      "",
      binId,
      batchId,
      "",
      timestamp
    ]);

    if (item.needsReview) {
      reviewRows.push([
        Utilities.getUuid(),
        binId,
        safeSheetText(item.standardName),
        item.quantity,
        safeSheetText(item.reviewReason),
        item.confidence,
        safeSheetText(item.description),
        safeSheetText(photoUrl),
        "Pending",
        timestamp
      ]);
    }
  });

  appendRows(inventorySheet, inventoryRows);
  appendRows(reviewSheet, reviewRows);
  appendRows(transactionsSheet, transactionRows);

  refreshBinStats(ss, binId);

  return {
    message: `Added ${mergedItems.length} item types to ${binId}.`,
    batch_id: batchId,
    bin_id: binId,
    item_types_added: mergedItems.length,
    total_quantity_added: mergedItems.reduce(
      (sum, item) => sum + item.quantity,
      0
    ),
    review_count: reviewRows.length,
    items: mergedItems.map(item => ({
      name: item.standardName,
      original_name: item.originalName,
      quantity: item.quantity,
      category: item.category,
      needs_review: item.needsReview
    }))
  };
}

/**
 * SEARCH
 */
function searchInventory(payload) {
  const query = cleanText(payload.query || payload.q);

  if (!query) {
    throw new Error("A search query is required.");
  }

  const requestedBinId = cleanText(
    payload.bin_id || payload.binId || ""
  ).toUpperCase();

  const requestedLimit = Number(payload.limit);
  const limit =
    Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 100)
      : MAX_SEARCH_RESULTS;

  const source = cleanText(payload.source) || "unknown";

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const inventorySheet = requireSheet(ss, SHEETS.INVENTORY);
  const binsSheet = requireSheet(ss, SHEETS.BINS);
  const searchLogSheet = requireSheet(ss, SHEETS.SEARCH_LOG);

  const inventory = getRowsAsObjects(inventorySheet);
  const bins = getRowsAsObjects(binsSheet);

  const binMap = {};

  bins.forEach(bin => {
    const binId = cleanText(bin.Bin_ID).toUpperCase();

    if (binId) {
      binMap[binId] = bin;
    }
  });

  const queryTokens = tokenize(query);

  const results = inventory
    .filter(row => {
      const isActive =
        cleanText(row.Status || "Active").toLowerCase() === "active";

      const rowBinId = cleanText(row.Bin_ID).toUpperCase();

      return (
        isActive &&
        (!requestedBinId || rowBinId === requestedBinId)
      );
    })
    .map(row => {
      const binId = cleanText(row.Bin_ID).toUpperCase();
      const bin = binMap[binId] || {};

      const searchableText = [
        row.Standard_Name,
        row.Original_Name,
        row.Category,
        row.Subcategory,
        row.Description,
        row.Keywords
      ]
        .map(cleanText)
        .join(" ")
        .toLowerCase();

      const score = calculateSearchScore(
        query,
        queryTokens,
        row,
        bin,
        searchableText
      );

      return {
        score,
        inventory_id: cleanText(row.Inventory_ID),
        item_name: cleanText(row.Standard_Name),
        original_name: cleanText(row.Original_Name),
        quantity: Number(row.Quantity) || 0,
        category: cleanText(row.Category),
        subcategory: cleanText(row.Subcategory),
        description: cleanText(row.Description),
        keywords: splitKeywords(row.Keywords),
        bin_id: binId,
        bin_name: cleanText(bin.Bin_Name),
        location: cleanText(bin.Location),
        shelf: cleanText(bin.Shelf),
        photo_url: cleanText(row.Photo_URL || bin.Photo_URL)
      };
    })
    .filter(result => result.score >= MIN_SEARCH_SCORE)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return a.item_name.localeCompare(b.item_name);
    })
    .slice(0, limit);

  const groupedResults = groupSearchResults(results);

  const suggestions =
    groupedResults.length === 0
      ? getSearchSuggestions(
          query,
          inventory,
          bins,
          5,
          requestedBinId
        )
      : [];

  appendRows(searchLogSheet, [[
    Utilities.getUuid(),
    safeSheetText(query),
    groupedResults.length,
    groupedResults[0] ? groupedResults[0].item_name : "",
    groupedResults[0] ? groupedResults[0].bin_id : "",
    safeSheetText(source),
    new Date()
  ]]);

  updateSearchSheet(ss, query, groupedResults);

  return {
  success: true,
  query,
  result_count: groupedResults.length,
  results: groupedResults,
  suggestions,
  spoken_summary: createSearchSummary(
    query,
    groupedResults,
    suggestions
    )
  };
}

function calculateSearchScore(
  rawQuery,
  queryTokens,
  row,
  bin,
  searchableText
) {
  const query = rawQuery.toLowerCase();
  const standardName = cleanText(row.Standard_Name).toLowerCase();
  const originalName = cleanText(row.Original_Name).toLowerCase();
  const keywords = cleanText(row.Keywords).toLowerCase();
  const category = cleanText(row.Category).toLowerCase();
  const binName = cleanText(bin.Bin_Name).toLowerCase();
  const binId = cleanText(row.Bin_ID).toLowerCase();

  let score = 0;
  if (binId === query) score += 120;
  if (binId.includes(query)) score += 70;
  if (standardName === query) score += 100;
  if (originalName === query) score += 90;
  if (standardName.includes(query)) score += 60;
  if (originalName.includes(query)) score += 50;
  if (keywords.includes(query)) score += 40;
  if (category.includes(query)) score += 25;
  if (binName.includes(query)) score += 20;

  queryTokens.forEach(token => {
    if (standardName.includes(token)) score += 15;
    if (originalName.includes(token)) score += 12;
    if (keywords.includes(token)) score += 10;
    if (searchableText.includes(token)) score += 4;
  });

  return score;
}

function groupSearchResults(results) {
  const grouped = {};

  results.forEach(result => {
    const key = [
      result.item_name.toLowerCase(),
      result.bin_id
    ].join("|");

    if (!grouped[key]) {
      grouped[key] = { ...result };
    } else {
      grouped[key].quantity += result.quantity;
      grouped[key].score = Math.max(
        grouped[key].score,
        result.score
      );
    }
  });

  return Object.values(grouped).sort((a, b) => b.score - a.score);
}

function createSearchSummary(query, results, suggestions) {
  if (results.length === 0) {
    if (suggestions && suggestions.length > 0) {
      const names = suggestions
        .slice(0, 3)
        .map(result => result.item_name)
        .join(", ");

      return (
        `I could not find an exact match for ${query}. ` +
        `Possible matches include ${names}.`
      );
    }

    return `I could not find anything matching ${query}.`;
  }

  if (results.length === 1) {
    const result = results[0];

    return `${result.item_name} is in bin ${result.bin_id}` +
      locationSuffix(result) +
      `. Quantity ${result.quantity}.`;
  }

  const first = results[0];

  return `I found ${results.length} matches for ${query}. ` +
    `The best match is ${first.item_name} in bin ${first.bin_id}` +
    locationSuffix(first) +
    `.`;
}

function locationSuffix(result) {
  const parts = [result.location, result.shelf].filter(Boolean);

  return parts.length ? `, ${parts.join(", ")}` : "";
}

/**
 * GET BIN CONTENTS
 */
function getBinContents(binIdInput) {
  const binId = cleanText(binIdInput).toUpperCase();

  if (!binId) {
    throw new Error("bin_id is required.");
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const binsSheet = requireSheet(ss, SHEETS.BINS);
  const inventorySheet = requireSheet(ss, SHEETS.INVENTORY);

  const bins = getRowsAsObjects(binsSheet);
  const inventory = getRowsAsObjects(inventorySheet);

  const bin = bins.find(
    row => cleanText(row.Bin_ID).toUpperCase() === binId
  );

  if (!bin) {
    throw new Error(`Bin ${binId} was not found.`);
  }

  const items = inventory
    .filter(row =>
      cleanText(row.Bin_ID).toUpperCase() === binId &&
      cleanText(row.Status || "Active") === "Active"
    )
    .map(row => ({
      inventory_id: cleanText(row.Inventory_ID),
      name: cleanText(row.Standard_Name),
      quantity: Number(row.Quantity) || 0,
      category: cleanText(row.Category),
      subcategory: cleanText(row.Subcategory),
      description: cleanText(row.Description),
      keywords: splitKeywords(row.Keywords)
    }));

  return {
    success: true,
    bin: {
      bin_id: binId,
      bin_name: cleanText(bin.Bin_Name),
      location: cleanText(bin.Location),
      shelf: cleanText(bin.Shelf),
      notes: cleanText(bin.Notes),
      photo_url: cleanText(bin.Photo_URL),
      summary: cleanText(bin.Bin_Summary)
    },
    item_type_count: items.length,
    total_quantity: items.reduce(
      (sum, item) => sum + item.quantity,
      0
    ),
    items
  };
}

/**
 * List Bins
 */

function getBins() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const binsSheet = requireSheet(ss, SHEETS.BINS);

  const bins = getRowsAsObjects(binsSheet)
    .map(row => ({
      bin_id: cleanText(row.Bin_ID).toUpperCase(),
      bin_name: cleanText(row.Bin_Name),
      location: cleanText(row.Location),
      shelf: cleanText(row.Shelf),
      summary: cleanText(row.Bin_Summary),
      item_type_count: Number(row.Item_Type_Count) || 0,
      total_quantity: Number(row.Total_Quantity) || 0
    }))
    .filter(bin => bin.bin_id)
    .sort((a, b) => {
      const locationComparison =
        a.location.localeCompare(b.location);

      if (locationComparison !== 0) {
        return locationComparison;
      }

      return a.bin_id.localeCompare(b.bin_id);
    });

  return {
    success: true,
    bin_count: bins.length,
    bins
  };
}

/**
 * NORMALIZATION
 */
function loadItemMap(sheet) {
  if (sheet.getLastRow() < 2) {
    return [];
  }

  return getRowsAsObjects(sheet)
    .filter(row => parseBoolean(row.Active, true))
    .map(row => ({
      originalName: cleanText(row.Original_Name),
      standardName: cleanText(row.Standard_Name),
      category: cleanText(row.Category),
      subcategory: cleanText(row.Subcategory),
      additionalKeywords: splitKeywords(row.Additional_Keywords),
      matchMode: cleanText(row.Match_Mode || "exact").toLowerCase()
    }))
    .filter(row => row.originalName && row.standardName);
}

function normalizeItem(rawItem, itemMap, minimumConfidence) {
  const originalName = cleanText(
    rawItem.name || rawItem.item_name
  );

  if (!originalName) {
    throw new Error("Every item must have a name.");
  }

  const match = findItemMapMatch(originalName, itemMap);

  const confidenceValue = Number(rawItem.confidence);
  const confidence = Number.isFinite(confidenceValue)
    ? Math.min(Math.max(confidenceValue, 0), 1)
    : 0;

  const modelReview =
    rawItem.needs_review === true ||
    String(rawItem.needs_review).toLowerCase() === "true";

  const needsReview =
    modelReview || confidence < minimumConfidence;

  const quantityValue = parseInt(rawItem.quantity, 10);
  const quantity =
    Number.isFinite(quantityValue) && quantityValue > 0
      ? quantityValue
      : 1;

  const modelKeywords = normalizeKeywords(rawItem.keywords);
  const mappedKeywords = match
    ? match.additionalKeywords
    : [];

  const keywords = uniqueStrings([
    ...modelKeywords,
    ...mappedKeywords,
    originalName,
    match ? match.standardName : originalName
  ]);

  let reviewReason = cleanText(rawItem.review_reason);

  if (!reviewReason && confidence < minimumConfidence) {
    reviewReason =
      `Confidence ${confidence} is below ${minimumConfidence}.`;
  }

  if (!reviewReason && modelReview) {
    reviewReason = "The model marked this item for review.";
  }

  return {
    originalName,
    standardName: match
      ? match.standardName
      : originalName,
    quantity,
    category:
      (match && match.category) ||
      cleanText(rawItem.category) ||
      "Miscellaneous",
    subcategory:
      (match && match.subcategory) ||
      cleanText(rawItem.subcategory),
    description: cleanText(rawItem.description),
    keywords,
    confidence,
    needsReview,
    reviewReason
  };
}

function findItemMapMatch(itemName, itemMap) {
  const normalizedName = normalizeSearchText(itemName);

  const exactMatch = itemMap.find(entry =>
    entry.matchMode === "exact" &&
    normalizeSearchText(entry.originalName) === normalizedName
  );

  if (exactMatch) {
    return exactMatch;
  }

  return itemMap.find(entry =>
    entry.matchMode === "contains" &&
    normalizedName.includes(
      normalizeSearchText(entry.originalName)
    )
  ) || null;
}

function mergeDuplicateItems(items) {
  const merged = {};

  items.forEach(item => {
    const key = [
      normalizeSearchText(item.standardName),
      normalizeSearchText(item.category),
      normalizeSearchText(item.subcategory)
    ].join("|");

    if (!merged[key]) {
      merged[key] = { ...item };
      return;
    }

    merged[key].quantity += item.quantity;
    merged[key].keywords = uniqueStrings([
      ...merged[key].keywords,
      ...item.keywords
    ]);

    merged[key].confidence = Math.min(
      merged[key].confidence,
      item.confidence
    );

    merged[key].needsReview =
      merged[key].needsReview || item.needsReview;

    if (!merged[key].reviewReason && item.reviewReason) {
      merged[key].reviewReason = item.reviewReason;
    }
  });

  return Object.values(merged);
}

/**
 * BIN STATISTICS
 */
function refreshBinStats(ss, binId) {
  const binsSheet = requireSheet(ss, SHEETS.BINS);
  const inventorySheet = requireSheet(ss, SHEETS.INVENTORY);

  const inventory = getRowsAsObjects(inventorySheet)
    .filter(row =>
      cleanText(row.Bin_ID).toUpperCase() === binId &&
      cleanText(row.Status || "Active") === "Active"
    );

  const itemTypeCount = inventory.length;
  const totalQuantity = inventory.reduce(
    (sum, row) => sum + (Number(row.Quantity) || 0),
    0
  );

  const itemNames = uniqueStrings(
    inventory.map(row => cleanText(row.Standard_Name))
  );

  const categories = uniqueStrings(
    inventory.map(row => cleanText(row.Category))
  );

  const summary = createBinSummary(itemNames, categories);
  const searchTerms = uniqueStrings([
    ...itemNames,
    ...categories
  ]).join(", ");

  const headers = getHeaders(binsSheet);

  const rowNumber = findRowByColumnValue(
    binsSheet,
    "Bin_ID",
    binId
  );

  if (!rowNumber) {
    return;
  }

  setCellByHeader(
    binsSheet,
    headers,
    rowNumber,
    "Bin_Summary",
    summary
  );

  setCellByHeader(
    binsSheet,
    headers,
    rowNumber,
    "Search_Terms",
    searchTerms
  );

  setCellByHeader(
    binsSheet,
    headers,
    rowNumber,
    "Item_Type_Count",
    itemTypeCount
  );

  setCellByHeader(
    binsSheet,
    headers,
    rowNumber,
    "Total_Quantity",
    totalQuantity
  );

  setCellByHeader(
    binsSheet,
    headers,
    rowNumber,
    "Last_Updated",
    new Date()
  );
}

function createBinSummary(itemNames, categories) {
  if (itemNames.length === 0) {
    return "Empty bin";
  }

  const categoryText = categories.slice(0, 3).join(", ");
  const itemText = itemNames.slice(0, 6).join(", ");

  return `${categoryText || "Mixed items"} including ${itemText}.`;
}

/**
 * SETTINGS AND SHEET HELPERS
 */
function getMinimumConfidence(settingsSheet) {
  const rows = getRowsAsObjects(settingsSheet);

  const setting = rows.find(
    row =>
      cleanText(row.Setting) === "Minimum_Confidence"
  );

  const value = setting ? Number(setting.Value) : NaN;

  return Number.isFinite(value)
    ? value
    : DEFAULT_MINIMUM_CONFIDENCE;
}

function verifyBinExists(sheet, binId) {
  const rowNumber = findRowByColumnValue(
    sheet,
    "Bin_ID",
    binId
  );

  if (!rowNumber) {
    throw new Error(
      `Bin ${binId} was not found in the Bins sheet.`
    );
  }
}

function getRowsAsObjects(sheet) {
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return [];
  }

  const headers = values[0].map(cleanText);

  return values.slice(1).map(row => {
    const object = {};

    headers.forEach((header, index) => {
      object[header] = row[index];
    });

    return object;
  });
}

function getHeaders(sheet) {
  if (sheet.getLastColumn() === 0) {
    return [];
  }

  return sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getDisplayValues()[0]
    .map(cleanText);
}

function findRowByColumnValue(sheet, headerName, value) {
  const headers = getHeaders(sheet);
  const columnIndex = headers.indexOf(headerName);

  if (columnIndex === -1 || sheet.getLastRow() < 2) {
    return null;
  }

  const values = sheet
    .getRange(2, columnIndex + 1, sheet.getLastRow() - 1, 1)
    .getDisplayValues()
    .flat();

  const target = cleanText(value).toUpperCase();

  const matchIndex = values.findIndex(
    current => cleanText(current).toUpperCase() === target
  );

  return matchIndex === -1 ? null : matchIndex + 2;
}

function setCellByHeader(
  sheet,
  headers,
  rowNumber,
  headerName,
  value
) {
  const columnIndex = headers.indexOf(headerName);

  if (columnIndex !== -1) {
    sheet.getRange(rowNumber, columnIndex + 1).setValue(value);
  }
}

function appendRows(sheet, rows) {
  if (!rows || rows.length === 0) {
    return;
  }

  sheet
    .getRange(
      sheet.getLastRow() + 1,
      1,
      rows.length,
      rows[0].length
    )
    .setValues(rows);
}

function requireSheet(ss, name) {
  const sheet = ss.getSheetByName(name);

  if (!sheet) {
    throw new Error(`Required sheet "${name}" was not found.`);
  }

  return sheet;
}

/**
 * TEXT HELPERS
 */
function tokenize(value) {
  return normalizeSearchText(value)
    .split(" ")
    .filter(token => token.length >= 2);
}

function normalizeSearchText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKeywords(value) {
  if (Array.isArray(value)) {
    return uniqueStrings(value.map(cleanText));
  }

  return splitKeywords(value);
}

function splitKeywords(value) {
  return uniqueStrings(
    cleanText(value)
      .split(",")
      .map(cleanText)
      .filter(Boolean)
  );
}

function uniqueStrings(values) {
  const seen = {};

  return values
    .map(cleanText)
    .filter(Boolean)
    .filter(value => {
      const key = value.toLowerCase();

      if (seen[key]) {
        return false;
      }

      seen[key] = true;
      return true;
    });
}

function parseBoolean(value, defaultValue) {
  if (value === true || value === false) {
    return value;
  }

  const text = cleanText(value).toLowerCase();

  if (["true", "yes", "1"].includes(text)) {
    return true;
  }

  if (["false", "no", "0"].includes(text)) {
    return false;
  }

  return defaultValue;
}

function safeSheetText(value) {
  const text = cleanText(value);

  return /^[=+\-@]/.test(text)
    ? `'${text}`
    : text;
}

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSearchSuggestions(
  query,
  inventory,
  bins,
  limit,
  requestedBinId
) {
  const queryTokens = tokenize(query);

  const binMap = {};

  bins.forEach(bin => {
    const binId = cleanText(bin.Bin_ID).toUpperCase();

    if (binId) {
      binMap[binId] = bin;
    }
  });

  const suggestions = inventory
    .filter(row => {
      const isActive =
        cleanText(row.Status || "Active").toLowerCase() === "active";

      const rowBinId = cleanText(row.Bin_ID).toUpperCase();

      const matchesRequestedBin =
        !requestedBinId || rowBinId === requestedBinId;

      return isActive && matchesRequestedBin;
    })
    .map(row => {
      const binId = cleanText(row.Bin_ID).toUpperCase();
      const bin = binMap[binId] || {};

      const fields = [
        row.Standard_Name,
        row.Original_Name,
        row.Category,
        row.Subcategory,
        row.Keywords,
        row.Description
      ]
        .map(cleanText)
        .join(" ")
        .toLowerCase();

      let tokenMatches = 0;

      queryTokens.forEach(token => {
        if (fields.includes(token)) {
          tokenMatches += 1;
        }
      });

      return {
        item_name: cleanText(row.Standard_Name),
        original_name: cleanText(row.Original_Name),
        quantity: Number(row.Quantity) || 0,
        category: cleanText(row.Category),
        subcategory: cleanText(row.Subcategory),
        description: cleanText(row.Description),
        bin_id: binId,
        bin_name: cleanText(bin.Bin_Name),
        location: cleanText(bin.Location),
        shelf: cleanText(bin.Shelf),
        token_matches: tokenMatches
      };
    })
    .filter(result => result.token_matches > 0)
    .sort((a, b) => {
      if (b.token_matches !== a.token_matches) {
        return b.token_matches - a.token_matches;
      }

      return a.item_name.localeCompare(b.item_name);
    })
    .slice(0, limit);

  return suggestions;
}

function updateSearchSheet(ss, query, results) {
  const sheet = requireSheet(ss, SHEETS.SEARCH);

  const topResult = results.length > 0
    ? results[0].item_name
    : "";

  const topBin = results.length > 0
    ? results[0].bin_id
    : "";

  sheet.getRange(2, 1, 1, 5).setValues([[
    query,
    new Date(),
    results.length,
    topResult,
    topBin
  ]]);
}

function addBin(payload) {
  const binId = cleanText(payload.bin_id).toUpperCase();
  const binName = cleanText(payload.bin_name);
  const location = cleanText(payload.location);
  const shelf = cleanText(payload.shelf);
  const notes = cleanText(payload.notes);

  if (!binId) {
    throw new Error("bin_id is required.");
  }

  if (!binName) {
    throw new Error("bin_name is required.");
  }

  if (!location) {
    throw new Error("location is required.");
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const binsSheet = requireSheet(ss, SHEETS.BINS);

  const existingRow = findRowByColumnValue(
    binsSheet,
    "Bin_ID",
    binId
  );

  if (existingRow) {
    throw new Error(`Bin ${binId} already exists.`);
  }

  const headers = getHeaders(binsSheet);
  const row = new Array(headers.length).fill("");

  setArrayValueByHeader(row, headers, "Bin_ID", binId);
  setArrayValueByHeader(row, headers, "Bin_Name", binName);
  setArrayValueByHeader(row, headers, "Location", location);
  setArrayValueByHeader(row, headers, "Shelf", shelf);
  setArrayValueByHeader(row, headers, "Notes", notes);
  setArrayValueByHeader(row, headers, "Item_Type_Count", 0);
  setArrayValueByHeader(row, headers, "Total_Quantity", 0);
  setArrayValueByHeader(row, headers, "Last_Updated", new Date());

  binsSheet
    .getRange(
      binsSheet.getLastRow() + 1,
      1,
      1,
      headers.length
    )
    .setValues([row]);

  return {
    message: `Created ${binId}.`,
    bin: {
      bin_id: binId,
      bin_name: binName,
      location,
      shelf,
      notes
    }
  };
}

function setArrayValueByHeader(
  row,
  headers,
  headerName,
  value
) {
  const index = headers.indexOf(headerName);

  if (index !== -1) {
    row[index] = value;
  }
}