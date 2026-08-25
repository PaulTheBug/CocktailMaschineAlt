document.querySelectorAll("button[data-action]").forEach(button => {
    button.addEventListener("click", () => {
        const action = button.dataset.action;
        switch (action) {
            case "drinkPopup":
                openPopup("drink");
                break;
            case "adminPopup":
                openPopup("pin");
                break;
            default:
                console.warn("Unbekannte Action:", action);
        }
    });
});

async function getData() {
    const url = "http://127.0.0.1:5000/api/ingredients";
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Response status: ${response.status}`);
        }

        const result = await response.json();
        console.log(result);
    } catch (error) {
        console.error(error.message);
    }
}
getData();

let isBusy = false;
let busyTimer = null;

function setBusy(active) {
    isBusy = active;

    const overlay = document.getElementById("busyOverlay");
    if (!overlay) return;

    overlay.classList.toggle("is-active", active);
    overlay.setAttribute("aria-hidden", active ? "false" : "true");
}

function runBusyProgress(durationMs = 17000) {
    const fill = document.getElementById("busyBarFill");
    const timeText = document.getElementById("busyTimeText");
    const start = performance.now();

    // reset
    if (fill) fill.style.width = "0%";
    if (timeText) timeText.textContent = `${Math.ceil(durationMs / 1000)}s`;

    // Timer loop
    return new Promise((resolve) => {
        function tick(now) {
            const elapsed = now - start;
            const p = Math.min(1, elapsed / durationMs);

            if (fill) fill.style.width = `${Math.round(p * 100)}%`;
            if (timeText) timeText.textContent = `${Math.max(0, Math.ceil((durationMs - elapsed) / 1000))}s`;

            if (p >= 1) return resolve();
            busyTimer = requestAnimationFrame(tick);
        }
        busyTimer = requestAnimationFrame(tick);
    });
}

function resetToStartScreen() {
    // 1) Popups zu
    closePopup();

    // 2) Optional: Filter/Selection zurücksetzen (Startscreen)
    // Bei euch bedeutet "kein currentFilter" => Placeholder Screen :contentReference[oaicite:3]{index=3}
    // currentFilter ist aber im IIFE scope. Wenn du dort bist: setz currentFilter = null; renderCocktails();

    // 3) Schnell & zuverlässig: Seite neu laden (setzt alles sauber zurück)
    window.location.href = "index.html";
}



async function orderCocktail(cocktailId) {
    if (isBusy) return; // doppelklick verhindern

    // UI sperren + overlay zeigen
    setBusy(true);

    try {
        // Bestellung anstoßen
        const url = "http://127.0.0.1:5000/api/order";
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cocktail_id: cocktailId })
        });

        if (!response.ok) {
            throw new Error(`Response status: ${response.status}`);
        }

        // Optional: response auslesen
        // const result = await response.json();

        // Fortschritt laufen lassen (z.B. 20s)
        await runBusyProgress();

        // Danach zurück zum Start
        resetToStartScreen();

    } catch (error) {
        console.error("Order failed:", error.message);

        // Overlay wieder weg + Fehler anzeigen
        if (busyTimer) cancelAnimationFrame(busyTimer);
        setBusy(false);

        // Wenn ihr notify habt:
        if (typeof notify === "function") {
            notify({ title: "Fehler", message: "Bestellung fehlgeschlagen.", type: "error" });
        } else {
            alert("Bestellung fehlgeschlagen.");
        }
    }
}


let isPopupOpen = false;
let lastPopupType = null;
let pendingAlcoholHighlight = false;
let syncSelectionHighlight = null;

function closeIngredientsPanel() {
    const wrap = document.getElementById("drinkPopupWrap");
    const panel = document.getElementById("ingredientsPanel");
    const toggleBtn = document.getElementById("ingredientsToggle");

    wrap?.classList.remove("show-ingredients");
    panel?.setAttribute("aria-hidden", "true");
    if (toggleBtn) toggleBtn.textContent = "Zutaten anzeigen";
}


function openPopup(type) {
    if (isPopupOpen) return;
    isPopupOpen = true;
    lastPopupType = type;

    const bgLayer = document.getElementById("bgLayer");
    const popups = bgLayer.querySelectorAll(".popup");

    popups.forEach(p => p.classList.remove("active"));
    bgLayer.classList.add("active");

    const popup = bgLayer.querySelector(`.popup-${type}`);
    if (popup) popup.classList.add("active");
}

function closePopup() {
    if (!isPopupOpen) return;
    isPopupOpen = false;

    const bgLayer = document.getElementById("bgLayer");
    const popups = bgLayer.querySelectorAll(".popup");

    popups.forEach(p => p.classList.remove("active"));
    bgLayer.classList.remove("active");

    // ✅ NEU: Zutatenpanel immer schließen
    closeIngredientsPanel();

    if (lastPopupType === "pin" && pendingAlcoholHighlight) {
        pendingAlcoholHighlight = false;
        if (typeof syncSelectionHighlight === "function") syncSelectionHighlight();
    }

    lastPopupType = null;
}


const bgLayer = document.getElementById("bgLayer");
bgLayer.addEventListener("click", (event) => {
    if (event.target === bgLayer) closePopup();
});

// PIN Logik
(function () {
    const MAX = 4;
    const popup = document.getElementById("pinPopup");
    if (!popup) return;

    const dots = Array.from(popup.querySelectorAll('.dot'));
    const row = popup.querySelector('.numpad-row');
    let pin = "";
    let pinPurpose = null;
    let allCocktails = [];
    let currentFilter = null;

    syncSelectionHighlight = function () {
        const selections = document.querySelectorAll('.selection');
        selections.forEach(s => s.classList.remove('active'));
        if (currentFilter === "non-alcoholic") selections[0]?.classList.add('active');
        else if (currentFilter === "alcoholic") selections[1]?.classList.add('active');
    };

    const update = () => {
        dots.forEach((d, i) => d.classList.toggle("filled", i < pin.length));
        if (pin.length === MAX) onPinComplete(pin);
    };

    const add = (d) => {
        if (pin.length >= MAX) return;
        pin += d;
        update();
    };

    const backspace = () => {
        if (pin) pin = pin.slice(0, -1);
        update();
    };

    row.addEventListener('click', (e) => {
        const btn = e.target.closest('.key');
        if (!btn) return;

        if (btn.classList.contains("back")) {
            backspace();
            return;
        }
        if (btn.classList.contains("close")) {
            return;
        }

        const d = btn.getAttribute('data-key');
        if (d) add(d);
    });

    function resetPinPopup() {
        pin = "";
        dots.forEach(d => d.classList.remove("filled"));
    }

    function showPinPopup(purpose) {
        pinPurpose = purpose;
        resetPinPopup();
        openPopup("pin");
    }

    async function onPinComplete(code) {
        try {
            const res = await fetch("http://127.0.0.1:5000/api/check-pin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pin: code, purpose: pinPurpose })
            });

            const data = await res.json();

            if (!data.valid) {
                notify({
                    title: "Zugriff verweigert",
                    message: "Der eingegebene PIN ist falsch.",
                    type: "error"
                });
                resetPinPopup();
                return;
            }

            if (pinPurpose === "alcohol") {
                pendingAlcoholHighlight = false;
                currentFilter = "alcoholic";
                renderCocktails();
                syncSelectionHighlight();
                closePopup();
            } else if (pinPurpose === "admin") {
                window.location.href = "admin.html";
            }

        } catch (err) {
            console.error("PIN-Überprüfung fehlgeschlagen:", err.message);
            notify({
                title: "Serverfehler",
                message: "PIN konnte nicht überprüft werden.",
                type: "error"
            });
            resetPinPopup();
        }
    }

    async function loadCocktails() {
        const url = "http://127.0.0.1:5000/api/cocktails";
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Response status: ${response.status}`);

            allCocktails = await response.json();
            renderCocktails();
        } catch (error) {
            console.error("Fehler beim Laden der Cocktails:", error.message);
        }
    }

    function renderCocktails() {
        const list = document.getElementById("cocktailList");
        list.innerHTML = "";

        if (!currentFilter) {
            list.innerHTML = `
            <div class="placeholder-message">
                <h1>Willkommen zum Cocktailmixer!</h1>
                <p>Bitte wähle eine Kategorie aus, um die Getränke anzuzeigen.</p>
            </div>
        `;
            return;
        }

        const filtered = allCocktails.filter(c => {
            if (currentFilter === "non-alcoholic") return !c.alkoholisch;
            if (currentFilter === "alcoholic") return c.alkoholisch;
            return true;
        });

        if (filtered.length === 0) {
            list.innerHTML = `<p style="text-align:center;color:#888;">Keine Getränke gefunden.</p>`;
            return;
        }

        filtered.forEach(cocktail => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.classList.add("drink-button");
            btn.onclick = () => openCocktailPopup(cocktail);

            btn.innerHTML = `
            <img class="drink-img" draggable="false"
                src="${cocktail.image_path || 'https://placehold.jp/3d4070/ffffff/128x128.png'}"
                alt="${cocktail.name}">
            <span>${cocktail.name}</span>
        `;
            list.appendChild(btn);
        });
    }

    document.querySelectorAll('.selection').forEach((sel, idx) => {
        sel.addEventListener('click', () => {
            if (idx === 0) {
                pendingAlcoholHighlight = false;
                currentFilter = "non-alcoholic";
                renderCocktails();
                syncSelectionHighlight();
            } else {
                pendingAlcoholHighlight = true;
                showPinPopup("alcohol");
            }
        });
    });

    document.querySelectorAll('.admin-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            showPinPopup("admin");
        });
    });

    let activeCocktailId = null;
    let ingredientsLoadedFor = null;

    const wrap = document.getElementById("drinkPopupWrap");
    const toggleBtn = document.getElementById("ingredientsToggle");
    const closeBtn = document.getElementById("ingredientsClose");
    const ingList = document.getElementById("ingredientsList");
    const panel = document.getElementById("ingredientsPanel");

    function setPanelOpen(open) {
        wrap?.classList.toggle("show-ingredients", open);
        panel?.setAttribute("aria-hidden", open ? "false" : "true");
        if (toggleBtn) toggleBtn.textContent = open ? "Zutaten ausblenden" : "Zutaten";
    }

    async function loadIngredientsFor(cocktailId) {
        if (!ingList) return;
        if (ingredientsLoadedFor === cocktailId) return;

        ingList.innerHTML = `<li class="ingredient-item">Lade Zutaten…</li>`;

        try {
            const res = await fetch(`http://127.0.0.1:5000/api/cocktails/${cocktailId}/ingredients`);
            if (!res.ok) throw new Error("fetch failed");
            const ingredients = await res.json();

            ingList.innerHTML = "";

            if (!ingredients?.length) {
                ingList.innerHTML = `<li class="ingredient-item">Keine Zutaten gefunden</li>`;
            } else {
                ingredients.forEach(i => {
                    const name = i.name ?? i.ingredient_name ?? "Unbekannt";
                    const amount = i.amount_ml ?? i.amount ?? null;

                    const li = document.createElement("li");
                    li.className = "ingredient-item";
                    li.innerHTML = `
          <span>${name}</span>
          ${amount !== null ? `<span style="opacity:.7;white-space:nowrap">${amount} ml</span>` : ""}
        `;
                    ingList.appendChild(li);
                });
            }

            ingredientsLoadedFor = cocktailId;
        } catch (e) {
            ingList.innerHTML = `<li class="ingredient-item">Fehler beim Laden</li>`;
        }
    }

// Button Events einmalig
    toggleBtn?.addEventListener("click", async () => {
        const open = !wrap.classList.contains("show-ingredients");
        setPanelOpen(open);
        if (open && activeCocktailId) {
            await loadIngredientsFor(activeCocktailId);
        }
    });

    closeBtn?.addEventListener("click", () => setPanelOpen(false));

    function openCocktailPopup(cocktail) {
        const bgLayer = document.getElementById("bgLayer");
        const popupdrink = bgLayer.querySelector(".popup-drink");
        const popupingredients = bgLayer.querySelector(".popup-ingredients");

        popupdrink.querySelector(".drink-img.big").src =
            cocktail.image_path || "https://placehold.jp/3d4070/ffffff/128x128.png";
        popupdrink.querySelector(".drink-title").textContent = cocktail.name;
        popupdrink.querySelector(".drink-description").textContent =
            cocktail.description || "Keine Beschreibung verfügbar.";

        const list = document.getElementById("ingredientsList");
        list.innerHTML = "";

        cocktail.liquid_recipe.forEach(item => {
            const li = document.createElement("li");
            li.textContent = item.ingredient_name;
            li.classList.add("ingredient-item")
            list.appendChild(li);
        });


        const orderBtn = popupdrink.querySelector(".order-btn");
        orderBtn.onclick = () => orderCocktail(cocktail.id);

        openPopup("drink");
    }

    loadCocktails();
})();
