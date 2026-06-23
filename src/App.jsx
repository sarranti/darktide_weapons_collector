import React, { useState, useMemo } from "react";
import { useGoogleSheets } from "./useGoogleSheets";

const getExcelColumnName = (colIndex) => {
  let columnName = "";
  while (colIndex >= 0) {
    columnName = String.fromCharCode((colIndex % 26) + 65) + columnName;
    colIndex = Math.floor(colIndex / 26) - 1;
  }
  return columnName;
};

const classMap = { V: "Veteran", Z: "Zealot", P: "Psyker", O: "Ogryn", A: "Arbites", S: "Scum", SK: "Skitarii" };

export default function App() {
  const { isGapiLoaded, isAuthenticated, login } = useGoogleSheets();
  const [sheetId, setSheetId] = useState(localStorage.getItem("darktide_sheet_id") || "");
  const [rawRows, setRawRows] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeClass, setActiveClass] = useState("V"); 
  const [viewMode, setViewMode] = useState("optimal"); 

  const handleSheetInput = (inputValue) => {
    const sheetIdMatch = inputValue.match(/\/d\/([a-zA-Z0-9-_]+)/);
    setSheetId(sheetIdMatch ? sheetIdMatch[1] : inputValue);
  };

  const fetchWeapons = async () => {
    if (!sheetId) return alert("Please enter your Spreadsheet ID");
    setIsLoading(true);
    try {
      localStorage.setItem("darktide_sheet_id", sheetId);
      const response = await window.gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: "Stats!A:Z", 
      });
      if (response.result.values) setRawRows(response.result.values);
    } catch (err) {
      console.error(err);
      alert("Failed to load sheet. Check the ID and ensure you gave permission.");
    } finally {
      setIsLoading(false);
    }
  };

  const formattedWeapons = useMemo(() => {
    if (!rawRows || rawRows.length === 0) return [];
    const headers = rawRows[0];
    const className = classMap[activeClass];

    const collectedIdx = headers.findIndex(h => h.includes(`Collected (${className})`) || h.includes(`Collected (${className}`));
    const upgradedIdx = headers.findIndex(h => h.includes(`Upgraded (${className})`) || h.includes(`Upgraged (${className}`));
    const countIdx = headers.findIndex(h => h.includes(`Count (${className})`) || h.includes(`Count(${className}`));

    return rawRows.slice(1).map((row, index) => {
      const isCollected = row[collectedIdx] === "TRUE";
      const isUpgraded = row[upgradedIdx] === "TRUE";
      let status = "None";
      if (isUpgraded) status = "U";
      else if (isCollected) status = "C";

      // Parse Optimal and keep the raw string for modifications later
      const optimalString = (row[2] || "").toString().toUpperCase();
      const isOptimal = optimalString === "TRUE" || optimalString.includes(activeClass);
      
      const rawType = (row[4] || "").toString().toUpperCase();
      let itemType = 'Ranged';
      if (rawType === 'TRUE' || rawType === 'M') itemType = 'Melee';
      else if (rawType === 'C' || rawType === 'CURIO') itemType = 'Curio';

      return {
        rowIndex: index + 2,
        weaponName: row[0] || "Unknown",
        dumpStat: row[1] || "",
        availableClasses: row[3] || "",
        status,
        count: parseInt(row[countIdx], 10) || 0,
        isOptimal,
        rawOptimalString: optimalString, // Store this so we can append/remove letters from it!
        itemType,
        colCollectedLetter: collectedIdx !== -1 ? getExcelColumnName(collectedIdx) : null,
        colUpgradedLetter: upgradedIdx !== -1 ? getExcelColumnName(upgradedIdx) : null,
        colCountLetter: countIdx !== -1 ? getExcelColumnName(countIdx) : null,
      };
    });
  }, [rawRows, activeClass]);

  const displayedWeapons = useMemo(() => {
    return formattedWeapons.filter((weapon) => weapon.availableClasses.includes(activeClass));
  }, [formattedWeapons, activeClass]);

  // --- GOOGLE API UPDATE HANDLERS ---

  const handleStatusCycle = async (weapon) => {
    if (!weapon.colCollectedLetter || !weapon.colUpgradedLetter) return;
    let nextCollected = "FALSE";
    let nextUpgraded = "FALSE";
    if (weapon.status === "None") nextCollected = "TRUE";
    else if (weapon.status === "C") { nextCollected = "TRUE"; nextUpgraded = "TRUE"; }

    try {
      await window.gapi.client.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: sheetId,
        resource: {
          valueInputOption: "USER_ENTERED",
          data: [
            { range: `Stats!${weapon.colCollectedLetter}${weapon.rowIndex}`, values: [[nextCollected]] },
            { range: `Stats!${weapon.colUpgradedLetter}${weapon.rowIndex}`, values: [[nextUpgraded]] },
          ],
        },
      });
      fetchWeapons(); 
    } catch (err) { console.error("Status update failed:", err); }
  };

  const updateCountInSheet = async (weapon, value) => {
    if (!weapon.colCountLetter) return;
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
        const countIdx = prev[0].findIndex(h => h.includes(`Count (${classMap[activeClass]})`) || h.includes(`Count(${classMap[activeClass]})`));
        if (updated[weapon.rowIndex - 1] && countIdx !== -1) updated[weapon.rowIndex - 1][countIdx] = String(newCount);
        return updated;
      });
    } catch (err) { console.error("Count sync failed:", err); }
  };

  // --- NEW: Toggle Optimal Status ---
  const toggleOptimalStatus = async (weapon) => {
    let newValue = "";

    // 1. Determine what the new value in the spreadsheet should be
    if (weapon.itemType === 'Curio') {
      if (weapon.isOptimal) {
        // If it's optimal, remove the active class letter from the string
        newValue = weapon.rawOptimalString.replace(activeClass, "");
      } else {
        // If not, append the active class letter
        newValue = weapon.rawOptimalString + activeClass;
      }
    } else {
      // For standard weapons, use literal TRUE or FALSE
      newValue = weapon.isOptimal ? "FALSE" : "TRUE";
    }

    // 2. Push update to Google Sheets
    try {
      await window.gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `Stats!C${weapon.rowIndex}`, // Column C is index 2
        valueInputOption: "USER_ENTERED",
        resource: { values: [[newValue]] },
      });

      // 3. Optimistically update local data so it instantly moves in the UI
      setRawRows((prev) => {
        const updated = [...prev];
        // rowIndex - 1 corresponds to this specific data row in rawRows
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

  const renderWeaponCard = (weapon) => (
    <div key={weapon.rowIndex} className={`weapon-card status-${weapon.status}`}>
      {/* Star Toggle Button */}
      <button 
        className={`optimal-star ${weapon.isOptimal ? 'filled' : ''}`}
        onClick={() => toggleOptimalStatus(weapon)}
        title={weapon.isOptimal ? "Unmark as Optimal" : "Mark as Optimal"}
      >
        ★
      </button>

      <h3>{weapon.weaponName}</h3>
      <span className="dump-stat">Dump: {weapon.dumpStat}</span>
      <div className="card-controls">
        <button className={`status-btn ${weapon.status}`} onClick={() => handleStatusCycle(weapon)}>
          {weapon.status === "None" && "☐ Unowned"}
          {weapon.status === "C" && "☑ Collected"}
          {weapon.status === "U" && "🔥 Upgraded"}
        </button>
        <div className="count-picker">
          <label>Qty:</label>
          <input type="number" min="0" value={weapon.count} onChange={(e) => updateCountInSheet(weapon, e.target.value)} />
        </div>
      </div>
    </div>
  );

  const renderOptimalView = () => {
    const sections = [
      { title: "~~~ Optimal Melee ~~~", items: displayedWeapons.filter(w => w.isOptimal && w.itemType === 'Melee') },
      { title: "~~~ Optimal Ranged ~~~", items: displayedWeapons.filter(w => w.isOptimal && w.itemType === 'Ranged') },
      { title: "~~~ Optimal Curios ~~~", items: displayedWeapons.filter(w => w.isOptimal && w.itemType === 'Curio') },
      { title: "~~~ Non-Optimal Melee ~~~", items: displayedWeapons.filter(w => !w.isOptimal && w.itemType === 'Melee') },
      { title: "~~~ Non-Optimal Ranged ~~~", items: displayedWeapons.filter(w => !w.isOptimal && w.itemType === 'Ranged') },
      { title: "~~~ Non-Optimal Curios ~~~", items: displayedWeapons.filter(w => !w.isOptimal && w.itemType === 'Curio') },
    ];

    return sections.map(sec => sec.items.length > 0 && (
      <div key={sec.title} className="optimal-section">
        <h2 className="section-title">{sec.title}</h2>
        <div className="weapon-grid">{sec.items.map(renderWeaponCard)}</div>
      </div>
    ));
  };

  const renderGroupedView = () => {
    const grouped = displayedWeapons.reduce((acc, weapon) => {
      if (!acc[weapon.weaponName]) acc[weapon.weaponName] = { type: weapon.itemType, variants: [] };
      acc[weapon.weaponName].variants.push(weapon);
      return acc;
    }, {});

    const typeOrder = { 'Melee': 1, 'Ranged': 2, 'Curio': 3 };
    const sortedGroupNames = Object.keys(grouped).sort((a, b) => {
      const typeDiff = typeOrder[grouped[a].type] - typeOrder[grouped[b].type];
      if (typeDiff !== 0) return typeDiff;
      return a.localeCompare(b);
    });

    return (
      <div className="grouped-container">
        {sortedGroupNames.map(name => (
          <details key={name} className="weapon-accordion">
            <summary className="accordion-header">
              <span className="weapon-title">{name}</span>
              <span className="weapon-type-badge">{grouped[name].type}</span>
            </summary>
            <div className="accordion-content weapon-grid">
              {grouped[name].variants.map(renderWeaponCard)}
            </div>
          </details>
        ))}
      </div>
    );
  };

  if (!isGapiLoaded) return <div className="loading">Initializing Application...</div>;
  if (!isAuthenticated) return (
    <div className="login-screen">
      <h1>Darktide Weapons Collector</h1>
      <button onClick={login}>Authenticate with Google</button>
    </div>
  );

  return (
    <div className="dashboard">
      <header className="app-header">
        <h1>Arsenal Tracker</h1>
        <div className="connection-bar">
          <input type="text" placeholder="Paste your Google Sheet Link or ID here" value={sheetId} onChange={(e) => handleSheetInput(e.target.value)} />
          <button onClick={fetchWeapons} disabled={isLoading}>{isLoading ? "Syncing..." : "Load Data"}</button>
        </div>
      </header>

      {rawRows.length > 0 && (
        <main>
          <div className="controls-bar">
            <div className="class-tabs">
              {Object.keys(classMap).map((key) => (
                <button key={key} className={activeClass === key ? "active" : ""} onClick={() => setActiveClass(key)}>
                  {classMap[key]}
                </button>
              ))}
            </div>
            <div className="view-toggles">
              <button className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')}>List</button>
              <button className={viewMode === 'optimal' ? 'active' : ''} onClick={() => setViewMode('optimal')}>Tracker Layout</button>
              <button className={viewMode === 'grouped' ? 'active' : ''} onClick={() => setViewMode('grouped')}>Grouped</button>
            </div>
          </div>

          <div className="view-container">
            {viewMode === 'list' && <div className="weapon-grid">{displayedWeapons.map(renderWeaponCard)}</div>}
            {viewMode === 'optimal' && renderOptimalView()}
            {viewMode === 'grouped' && renderGroupedView()}
          </div>
        </main>
      )}
    </div>
  );
}