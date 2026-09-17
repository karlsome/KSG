// Test script for OPC Raspberry Pi switching without external dependencies
const fs = require("fs");
const path = require("path");

class MockElement {
    constructor(tagName, id = "") {
        this.tagName = tagName;
        this.id = id;
        this.innerHTML = "";
        this.textContent = "";
        this.value = "";
        this.options = [];
        this.dataset = {};
        this.listeners = {};
        this.className = "";
        this.disabled = false;
    }
    appendChild(child) {
        this.options.push(child);
    }
    querySelector(selector) {
        const valMatch = selector.match(/value="([^"]+)"/);
        if (valMatch) {
            return this.options.find(o => o.value === valMatch[1]) || null;
        }
        return null;
    }
    querySelectorAll() {
        return [];
    }
    addEventListener(event, fn) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(fn);
    }
    async dispatchEvent(event) {
        if (this.listeners[event.type]) {
            for (const fn of this.listeners[event.type]) {
                await fn({ target: this });
            }
        }
    }
}

class MockDocument {
    constructor() {
        this.elements = {
            "opc-raspberry-filter": new MockElement("SELECT", "opc-raspberry-filter"),
            "opc-raw-data-container": new MockElement("DIV", "opc-raw-data-container"),
            "opc-variables-container": new MockElement("DIV", "opc-variables-container"),
            "refresh-data-btn": new MockElement("BUTTON", "refresh-data-btn"),
            "opc-connection-status": new MockElement("SPAN", "opc-connection-status"),
            "opc-conversion-form": new MockElement("FORM", "opc-conversion-form"),
            "opc-combine-form": new MockElement("FORM", "opc-combine-form"),
            "opc-edit-variable-form": new MockElement("FORM", "opc-edit-variable-form"),
            "opcManagementTitle": new MockElement("H1", "opcManagementTitle")
        };
    }
    getElementById(id) {
        return this.elements[id] || null;
    }
    createElement(tagName) {
        return new MockElement(tagName);
    }
    addEventListener() {}
}

(async () => {
    try {
        console.log("Starting pure node OPC switching test...");

        // Setup global mock environment
        global.document = new MockDocument();
        global.window = {
            addEventListener: () => {},
            opcManagementState: undefined
        };
        global.localStorage = {
            _data: { company: "KSG" },
            getItem: (k) => global.localStorage._data[k] || null,
            setItem: (k, v) => { global.localStorage._data[k] = v; },
            removeItem: (k) => { delete global.localStorage._data[k]; }
        };
        global.fetch = fetch;
        global.t = (k) => k;
        global.API_URL = "http://localhost:3000";
        global.COMPANY = "KSG";
        global.io = () => ({
            on: () => {},
            emit: () => {},
            connected: true
        });

        // Load opcManagement.js
        const opcJs = fs.readFileSync(path.join(__dirname, "../public/js/opcManagement.js"), "utf8");
        eval(opcJs);

        // Set initial device to KSG2 (6C10F6) in localStorage to test initial load
        global.localStorage.setItem("opcLastSelectedDevice", "6C10F6");

        // Step 1: Initialize OPC Management
        console.log("Step 1: Running initializeOPCManagement()...");
        await initializeOPCManagement();

        const filterSelect = document.getElementById("opc-raspberry-filter");
        console.log("Populated options:", filterSelect.options.map(o => ({ value: o.value, text: o.textContent })));
        console.log("Auto-selected value:", filterSelect.value);

        const ksg2Id = "6C10F6";
        const ksg3Id = "8NCDIU";

        // Check variables initially rendered
        console.log("Variables container HTML length:", document.getElementById("opc-variables-container").innerHTML.length);
        const ksg2Html = document.getElementById("opc-variables-container").innerHTML;
        if (!ksg2Html.includes("440DCUPRRHSeisanSu")) {
            throw new Error("Expected KSG2 variable 440DCUPRRHSeisanSu in variables container");
        }
        console.log("✓ Initial KSG2 variables rendered correctly");

        // Step 2: Switch to ksg3
        console.log("\nStep 2: Switching to ksg3 (" + ksg3Id + ")...");
        filterSelect.value = ksg3Id;
        await filterSelect.dispatchEvent({ type: "change" });

        // Dynamically fetch current expected value for ARRAY0[27]
        const ksg3DataRes = await fetch("http://localhost:3000/api/deviceInfo/" + ksg3Id + "/opcua-data?company=KSG");
        const ksg3Data = await ksg3DataRes.json();
        const expectedVal = String(ksg3Data.datapoints.find(d => d.opcNodeId === "ns=4;s=ARRAY0")?.value?.[27]);
        console.log("Expected live value for seisanSu_L686 is:", expectedVal);

        const ksg3Html = document.getElementById("opc-variables-container").innerHTML;
        console.log("ksg3 variables container HTML contains 'seisanSu_L686':", ksg3Html.includes("seisanSu_L686"));
        console.log(`ksg3 variables container HTML contains '${expectedVal}':`, ksg3Html.includes(expectedVal));

        if (!ksg3Html.includes("seisanSu_L686")) {
            throw new Error("Expected ksg3 variable seisanSu_L686 to be rendered after switching to ksg3");
        }
        if (!ksg3Html.includes(expectedVal)) {
            throw new Error(`Expected ksg3 variable value ${expectedVal} to be rendered in table`);
        }
        if (ksg3Html.includes("440DCUPRRHSeisanSu")) {
            throw new Error("KSG2 variable should NOT be rendered when ksg3 is selected");
        }
        console.log(`✓ Successfully switched to ksg3! Correct variables and live data (${expectedVal}) are displayed.`);

        // Step 3: Switch back to KSG2
        console.log("\nStep 3: Switching back to KSG2 (" + ksg2Id + ")...");
        filterSelect.value = ksg2Id;
        await filterSelect.dispatchEvent({ type: "change" });

        const backHtml = document.getElementById("opc-variables-container").innerHTML;
        if (!backHtml.includes("440DCUPRRHSeisanSu")) {
            throw new Error("Expected KSG2 variable to be rendered after switching back");
        }
        if (backHtml.includes("seisanSu_L686")) {
            throw new Error("ksg3 variable should NOT be rendered when KSG2 is selected");
        }
        console.log("✓ Successfully switched back to KSG2! Correct variables are displayed.");

        // Step 4: Re-entry simulation (navigating away and back)
        console.log("\nStep 4: Testing re-entry (SPA navigation)...");
        // Create brand new DOM elements as if fetch('/opcManagement.html') ran
        global.document = new MockDocument();
        const newSelect = document.getElementById("opc-raspberry-filter");
        
        await initializeOPCManagement();
        if (newSelect.dataset.listenerBound !== "true") {
            throw new Error("Listener was not bound to new select element upon re-entry!");
        }

        newSelect.value = ksg3Id;
        await newSelect.dispatchEvent({ type: "change" });

        const reenteredHtml = document.getElementById("opc-variables-container").innerHTML;
        if (!reenteredHtml.includes("seisanSu_L686")) {
            throw new Error("Failed to switch Raspberry Pi after re-entering page!");
        }
        console.log("✓ Re-entry test passed! Change listener works after page navigation.");

        console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉");
    } catch (err) {
        console.error("❌ Test failed:", err);
        process.exit(1);
    }
})();
