import React, { useState, useMemo } from "react";
import { useGoogleSheets } from "./useGoogleSheets";

// 1. Defined outside to prevent re-creation on every render
const AboutPage = () => (
  <div className="about-page">
    <h1>Welcome to the Arsenal Tracker</h1>
    <p>
      This tool helps you manage your Darktide weapon collection by syncing with
      your Google Sheets.
    </p>
    <div className="setup-steps">
      <h2>Getting Started</h2>
      <ol>
        <li>
          <strong>Step 1:</strong> If you don't have a template yet, you can
          create one by making a copy of the default template in your google
          drive:{" "}
          <a
            href="https://docs.google.com/spreadsheets/d/1jwscnYcFndVzskmI3o8rbh9yRjyb5hEU3XJj6B326hU/edit?usp=sharing"
            target="_blank"
            rel="noreferrer"
          >
            Click here to copy the template
          </a>
          .
        </li>
        <li>
          <strong>Step 2:</strong> Authenticate using the button above.
        </li>
        <li>
          <strong>Step 3:</strong> Paste your Sheet ID by clicking share and
          copying the link, then click "Load Data".
          <ul>
            <li>
              Note: the sheet does not need to be shared publicly.This only
              loads in your browser and is not shared with anyone
            </li>
            <li>
              <strong>Finding your Sheet ID:</strong> The Sheet ID is the long
              string in the URL of your Google Sheet. For example, in the URL:
              <br />
              <code>
                https://docs.google.com/spreadsheets/d/1jwscnYcFndVzskmI3o8rbh9yRjyb5hEU3XJj6B326hU/edit
              </code>
              <br />
              The Sheet ID is:{" "}
              <code>1jwscnYcFndVzskmI3o8rbh9yRjyb5hEU3XJj6B326hU</code>
            </li>
          </ul>
        </li>
      </ol>
    </div>
  </div>
);

const getExcelColumnName = (colIndex) => {
  let columnName = "";
  while (colIndex >= 0) {
    columnName = String.fromCharCode((colIndex % 26) + 65) + columnName;
    colIndex = Math.floor(colIndex / 26) - 1;
  }
  return columnName;
};

const classMap = {
  V: "Veteran",
  Z: "Zealot",
  P: "Psyker",
  O: "Ogryn",
  A: "Arbites",
  H: "Scum",
  S: "Skitarii",
};

export default function App() {
  const { isGapiLoaded, isAuthenticated, login, tokenExpiry, silentRefresh } = useGoogleSheets();
  const [sheetId, setSheetId] = useState(
    localStorage.getItem("darktide_sheet_id") || "",
  );
  const [rawRows, setRawRows] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeClass, setActiveClass] = useState("V");
  const [viewMode, setViewMode] = useState("about");
  // NEW: Track which weapon is actively being viewed in the Master-Detail layout
  const [selectedWeaponId, setSelectedWeaponId] = useState(null);

  const handleSheetInput = (inputValue) => {
    // Use a slightly more robust regex
    // 1. Matches the standard /d/ID pattern
    // 2. Uses a non-capturing group to handle cases where the URL might end with a /
    const sheetIdMatch = inputValue.match(/\/d\/([a-zA-Z0-9-_]+)/);

    // If a match is found, use it; otherwise, trim whitespace from the raw input
    // in case they pasted just an ID with a stray space.
    setSheetId(sheetIdMatch ? sheetIdMatch[1] : inputValue.trim());
  };

const ensureAuth = async () => {
    if (!tokenExpiry || Date.now() > tokenExpiry) {
      try {
        console.log("Token expired. Refreshing silently...");
        await silentRefresh();
      } catch (err) {
        console.error("Silent refresh failed", err);
        alert("Session expired. Please click 'Authenticate' to log in again.");
        throw new Error("Auth required"); // Halts the execution of the parent function
      }
    }
  };

const fetchWeapons = async () => {
    if (!sheetId) return alert("Please enter your Spreadsheet ID");
    
    // 1. Guard check (halts execution if silent refresh fails)
    await ensureAuth(); 
    
    setIsLoading(true);
    try {
      localStorage.setItem("darktide_sheet_id", sheetId);
      const response = await window.gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: "Stats!A:ZZ",
      });
      if (response.result.values) {
        setRawRows(response.result.values);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to load sheet.");
    } finally {
      setIsLoading(false);
    }
  };

  const formattedWeapons = useMemo(() => {
    if (!rawRows || rawRows.length === 0) return [];
    const headers = rawRows[0];

    // FIX 2: Wrapped `h` in String() so empty columns don't crash the .includes() method
    const collectedIdx = headers.findIndex((h) =>
      String(h || "").includes(`Collected_${activeClass}`),
    );
    const upgradedIdx = headers.findIndex((h) =>
      String(h || "").includes(`Upgraded_${activeClass}`),
    );
    const countIdx = headers.findIndex((h) =>
      String(h || "").includes(`Count_${activeClass}`),
    );

    return rawRows.slice(1).map((row, index) => {
      const isCollected = row[collectedIdx] === "TRUE";
      const isUpgraded = row[upgradedIdx] === "TRUE";
      let status = "None";
      if (isUpgraded) status = "U";
      else if (isCollected) status = "C";

      const optimalString = (row[2] || "").toString().toUpperCase();
      const isOptimal =
        optimalString === "TRUE" ||
        new RegExp(`\\b${activeClass}\\b`).test(optimalString);
      const rawType = (row[4] || "").toString().toUpperCase();
      let itemType = "Ranged";
      if (rawType === "TRUE" || rawType === "M") itemType = "Melee";
      else if (rawType === "C" || rawType === "CURIO") itemType = "Curio";

      return {
        rowIndex: index + 2,
        weaponName: row[0] || "Unknown",
        dumpStat: row[1] || "",
        availableClasses: row[3] || "",
        status,
        count: parseInt(row[countIdx], 10) || 0,
        isOptimal,
        rawOptimalString: optimalString,
        itemType,
        colCollectedLetter:
          collectedIdx !== -1 ? getExcelColumnName(collectedIdx) : null,
        colUpgradedLetter:
          upgradedIdx !== -1 ? getExcelColumnName(upgradedIdx) : null,
        colCountLetter: countIdx !== -1 ? getExcelColumnName(countIdx) : null,
      };
    });
  }, [rawRows, activeClass]);

  const displayedWeapons = useMemo(() => {
    return formattedWeapons.filter((weapon) =>
      weapon.availableClasses.includes(activeClass),
    );
  }, [formattedWeapons, activeClass]);

  // --- GOOGLE API UPDATE HANDLERS ---

  const handleStatusCycle = async (weapon) => {
    if (!weapon.colCollectedLetter || !weapon.colUpgradedLetter) return;

    await ensureAuth();

    let nextCollected = "FALSE";
    let nextUpgraded = "FALSE";
    if (weapon.status === "None") nextCollected = "TRUE";
    else if (weapon.status === "C") {
      nextCollected = "TRUE";
      nextUpgraded = "TRUE";
    }

    try {
      await window.gapi.client.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: sheetId,
        resource: {
          valueInputOption: "USER_ENTERED",
          data: [
            {
              range: `Stats!${weapon.colCollectedLetter}${weapon.rowIndex}`,
              values: [[nextCollected]],
            },
            {
              range: `Stats!${weapon.colUpgradedLetter}${weapon.rowIndex}`,
              values: [[nextUpgraded]],
            },
          ],
        },
      });
      fetchWeapons();
    } catch (err) {
      console.error("Status update failed:", err);
    }
  };

  const updateCountInSheet = async (weapon, value) => {
    if (!weapon.colCountLetter) return;

    await ensureAuth();

    const newCount = parseInt(value, 10) || 0;
    try {
      await window.gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `Stats!${weapon.colCountLetter}${weapon.rowIndex}`,
        valueInputOption: "USER_ENTERED",
        resource: { values: [[newCount]] },
      });
      setRawRows((prev) => {
        const updated = [...prev];
        // FIX 3: Replaced .trim() with safe String().includes() to prevent crash on undefined
        const countIdx = prev[0].findIndex((h) =>
          String(h || "").includes(`Count_${activeClass}`),
        );
        if (updated[weapon.rowIndex - 1] && countIdx !== -1)
          updated[weapon.rowIndex - 1][countIdx] = String(newCount);
        return updated;
      });
    } catch (err) {
      console.error("Count sync failed:", err);
    }
  };

  const toggleOptimalStatus = async (weapon) => {
    let newValue = "";

    await ensureAuth();

    if (weapon.itemType === "Curio") {
      if (weapon.isOptimal) {
        newValue = weapon.rawOptimalString.replace(activeClass, "");
      } else {
        newValue = weapon.rawOptimalString + activeClass;
      }
    } else {
      newValue = weapon.isOptimal ? "FALSE" : "TRUE";
    }

    try {
      await window.gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `Stats!C${weapon.rowIndex}`,
        valueInputOption: "USER_ENTERED",
        resource: { values: [[newValue]] },
      });

      setRawRows((prev) => {
        const updated = [...prev];
        if (updated[weapon.rowIndex - 1]) {
          updated[weapon.rowIndex - 1][2] = newValue;
        }
        return updated;
      });
    } catch (err) {
      console.error("Optimal status toggle failed:", err);
    }
  };

  // --- RENDER HELPERS ---

  const renderWeaponCard = (weapon) => {
    const isSainted = weapon.status === "U" && weapon.isOptimal;
    return (
      <div
        key={weapon.rowIndex}
        className={`weapon-card status-${weapon.status} ${isSainted ? "optimal-border" : ""}`}
      >
        <button
          className={`optimal-star ${weapon.isOptimal ? "filled" : ""}`}
          onClick={() => toggleOptimalStatus(weapon)}
        >
          ★
        </button>

        <h3>{weapon.weaponName}</h3>
        <span className="dump-stat">Dump: {weapon.dumpStat}</span>

        <div className="card-controls">
          <button
            className={`status-btn ${weapon.status}`}
            onClick={() => handleStatusCycle(weapon)}
          >
            {weapon.status === "None" && "☐ Unowned"}
            {weapon.status === "C" && "☑ Collected"}
            {weapon.status === "U" && "🔥 Upgraded"}
          </button>
          <div className="count-picker">
            <label>Qty:</label>
            <input
              type="number"
              min="0"
              value={weapon.count}
              onChange={(e) => updateCountInSheet(weapon, e.target.value)}
            />
          </div>
        </div>
      </div>
    );
  };

  const renderOptimalView = () => {
    const sections = [
      {
        title: "~~~ Optimal Melee ~~~",
        items: displayedWeapons.filter(
          (w) => w.isOptimal && w.itemType === "Melee",
        ),
      },
      {
        title: "~~~ Optimal Ranged ~~~",
        items: displayedWeapons.filter(
          (w) => w.isOptimal && w.itemType === "Ranged",
        ),
      },
      {
        title: "~~~ Optimal Curios ~~~",
        items: displayedWeapons.filter(
          (w) => w.isOptimal && w.itemType === "Curio",
        ),
      },
      {
        title: "~~~ Non-Optimal Melee ~~~",
        items: displayedWeapons.filter(
          (w) => !w.isOptimal && w.itemType === "Melee",
        ),
      },
      {
        title: "~~~ Non-Optimal Ranged ~~~",
        items: displayedWeapons.filter(
          (w) => !w.isOptimal && w.itemType === "Ranged",
        ),
      },
      {
        title: "~~~ Non-Optimal Curios ~~~",
        items: displayedWeapons.filter(
          (w) => !w.isOptimal && w.itemType === "Curio",
        ),
      },
    ];

    return sections.map(
      (sec) =>
        sec.items.length > 0 && (
          <div key={sec.title} className="optimal-section">
            <h2 className="section-title">{sec.title}</h2>
            <div className="weapon-grid">{sec.items.map(renderWeaponCard)}</div>
          </div>
        ),
    );
  };

  const renderGroupedView = () => {
    const groupedByType = { Melee: {}, Ranged: {}, Curio: {} };

    displayedWeapons.forEach((weapon) => {
      const type = weapon.itemType;
      const name = weapon.weaponName;

      if (!groupedByType[type]) groupedByType[type] = {};
      if (!groupedByType[type][name]) groupedByType[type][name] = [];
      groupedByType[type][name].push(weapon);
    });

    const typeOrder = ["Melee", "Ranged", "Curio"];

    // Dynamically grab the freshest data for the selected weapon so the UI always updates after a sync
    const activeWeaponDetail = displayedWeapons.find(
      (w) => w.rowIndex === selectedWeaponId,
    );

    return (
      <div className="master-detail-layout">
        {/* LEFT PANE: The Scrollable Master List */}
        <div className="master-pane">
          {typeOrder.map((type) => {
            const weaponsInType = groupedByType[type];
            if (!weaponsInType || Object.keys(weaponsInType).length === 0)
              return null;
            const sortedNames = Object.keys(weaponsInType).sort((a, b) =>
              a.localeCompare(b),
            );
            return (
              <div key={type} className="master-section">
                <h2 className="master-section-title">{type}</h2>
                <div className="type-accordions">
                  {sortedNames.map((name) => (
                    // In your renderGroupedView map:
                    <details
                      key={name}
                      className="weapon-accordion"
                      onToggle={(e) => {
                        if (e.target.open) {
                          // Auto-select the first variant in the list when opened
                          const firstVariant = weaponsInType[name][0];
                          setSelectedWeaponId(firstVariant.rowIndex);
                        }
                      }}
                    >
                      <summary className="accordion-header">
                        <span className="weapon-title">{name}</span>
                      </summary>
                      <div className="accordion-content compact-list">
                        {/* Render compact clickable rows instead of huge cards */}
                        {weaponsInType[name].map((weapon) => (
                          <div
                            key={weapon.rowIndex}
                            className={`compact-list-item ${selectedWeaponId === weapon.rowIndex ? "selected" : ""}`}
                            onClick={() => setSelectedWeaponId(weapon.rowIndex)}
                          >
                            {/* Wrap Star and Dump Stat together */}
                            <span className="compact-left-group">
                              <span className="optimal-star-icon">
                                {weapon.isOptimal ? "★" : " "}
                              </span>
                              <span className="compact-dump">
                                Dump: {weapon.dumpStat}
                              </span>
                            </span>

                            <span
                              className={`tiny-status badge-${weapon.status}`}
                            >
                              {weapon.status === "C"
                                ? "Collected"
                                : weapon.status === "U"
                                  ? "Upgraded"
                                  : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* RIGHT PANE: The Detail View */}
        <div className="detail-pane">
          {selectedWeaponId ? (
            <div className="multi-card-grid">
              {/* Filter for all entries matching the selected weapon's name */}
              {displayedWeapons
                .filter(
                  (w) =>
                    w.weaponName ===
                    displayedWeapons.find(
                      (x) => x.rowIndex === selectedWeaponId,
                    )?.weaponName,
                )
                .map((weapon) => (
                  <div key={weapon.rowIndex} className="detail-card-wrapper">
                    {renderWeaponCard(weapon)}
                  </div>
                ))}
            </div>
          ) : (
            <div className="empty-detail-state">
              <h3>Select a Weapon</h3>
              <p>
                Click a weapon name on the left to display all variants and
                their respective stats on the right.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="dashboard">
      <header className="app-header">
        <h1>Armory</h1>
        <div className="connection-bar">
          {!isAuthenticated ? (
            <button onClick={login}>Authenticate with Google</button>
          ) : (
            <>
              <input
                type="text"
                placeholder="Sheet ID"
                value={sheetId}
                onChange={(e) => handleSheetInput(e.target.value)}
              />
              <button
                onClick={async () => {
                  await fetchWeapons();
                  setViewMode("grouped");
                }}
              >
                Load Data
              </button>
            </>
          )}
        </div>
      </header>

      {/* 3. Navigation Header - Always visible */}
      <nav className="main-nav">
        <button
          className={viewMode === "about" ? "active" : ""}
          onClick={() => setViewMode("about")}
        >
          About
        </button>
        {isAuthenticated && (
          <>
            <button
              className={viewMode === "grouped" ? "active" : ""}
              onClick={() => setViewMode("grouped")}
            >
              By Weapon
            </button>
            <button
              className={viewMode === "optimal" ? "active" : ""}
              onClick={() => setViewMode("optimal")}
            >
              Optimal
            </button>

            <button
              className={viewMode === "list" ? "active" : ""}
              onClick={() => setViewMode("list")}
            >
              Show All
            </button>
          </>
        )}
      </nav>

      <main>
        {viewMode === "about" && <AboutPage />}

        {viewMode !== "about" && isAuthenticated && rawRows.length > 0 && (
          <div className="controls-bar">
            <div className="class-tabs">
              {Object.keys(classMap).map((key) => (
                <button
                  key={key}
                  className={activeClass === key ? "active" : ""}
                  onClick={() => setActiveClass(key)}
                >
                  {classMap[key]}
                </button>
              ))}
            </div>
          </div>
        )}

        {viewMode !== "about" && isAuthenticated && rawRows.length > 0 && (
          <div className="view-container">
            {viewMode === "list" && (
              <div className="weapon-grid">
                {displayedWeapons.map(renderWeaponCard)}
              </div>
            )}
            {viewMode === "optimal" && renderOptimalView()}
            {viewMode === "grouped" && renderGroupedView()}
          </div>
        )}
      </main>
    </div>
  );
}
