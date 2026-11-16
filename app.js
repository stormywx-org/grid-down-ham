(function () {
  var form = document.getElementById("lookup-form");
  var input = document.getElementById("address");
  var button = document.getElementById("lookup-btn");
  var results = document.getElementById("results");
  var inner = document.getElementById("results-inner");

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function lookupAddress(address) {
    var cfg = window.GDH_CONFIG || {};
    var base = (cfg.appsScriptUrl || "").replace(/\/$/, "");
    if (base) {
      return new Promise(function (resolve, reject) {
        var cb = "gdh_cb_" + Date.now();
        var cleanup = function () {
          try { delete window[cb]; } catch (e) { window[cb] = undefined; }
          if (script && script.parentNode) script.parentNode.removeChild(script);
        };
        var timer = setTimeout(function () {
          cleanup();
          reject(new Error("The lookup timed out. Please try again."));
        }, 25000);
        window[cb] = function (data) {
          clearTimeout(timer);
          cleanup();
          resolve(data);
        };
        var script = document.createElement("script");
        script.src = base + "?address=" + encodeURIComponent(address) + "&callback=" + cb;
        script.onerror = function () {
          clearTimeout(timer);
          cleanup();
          reject(new Error("The lookup service could not be reached."));
        };
        document.body.appendChild(script);
      });
    }
    return fetch("/exec?address=" + encodeURIComponent(address), { headers: { Accept: "application/json" } })
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok && !body) throw new Error("Lookup failed (" + res.status + ").");
          return body;
        });
      });
  }

  function badge() {
    return '<span class="badge blank">Location + NOAA (repeaters write-in)</span>';
  }

  function rowsHtml(rows) {
    if (!rows || !rows.length) return "";
    var body = rows.map(function (r) {
      var cls = r.kind === "noaa" ? ' class="noaa"' : "";
      return "<tr" + cls + ">" +
        "<td>" + escapeHtml(r.name) + "</td>" +
        "<td>" + escapeHtml(r.freq) + "</td>" +
        "<td>" + escapeHtml(r.offset) + "</td>" +
        "<td>" + escapeHtml(r.tone) + "</td>" +
        "<td>" + escapeHtml(r.mode) + "</td>" +
        "<td>" + escapeHtml(r.location) + "</td>" +
        "<td>" + escapeHtml(r.gps) + "</td>" +
        "<td>" + escapeHtml(r.dist) + "</td>" +
        "</tr>";
    }).join("");
    return '<div class="table-scroll"><table class="freq"><thead><tr>' +
      "<th>Name / call</th><th>Frequency</th><th>Offset</th><th>Tone</th>" +
      "<th>Mode</th><th>Location</th><th>GPS</th><th>Dist / dir</th>" +
      "</tr></thead><tbody>" + body + "</tbody></table></div>";
  }

  function listHtml(items) {
    if (!items || !items.length) return "";
    return "<ul>" + items.map(function (t) { return "<li>" + escapeHtml(t) + "</li>"; }).join("") + "</ul>";
  }

  function render(data) {
    if (!data || data.ok === false) {
      inner.innerHTML = '<div class="card error"><p>' + escapeHtml((data && (data.error || data.detail)) || "Lookup failed.") + "</p></div>";
      results.classList.add("is-open");
      results.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    try { sessionStorage.setItem("gdh-guide", JSON.stringify(data)); } catch (e) {}

    var modeLabel = "Custom location sheet (write in local repeaters)";
    var empty = '<p>Amateur repeater rows are left blank on purpose. This draft does not invent frequencies and does not call RepeaterBook. Look up nearby machines on RepeaterBook.com and write them on your sheet. NOAA Weather Radio for this county is filled in when the official NWS coverage file has a match.</p>';
    var nets = (data.nets && data.nets.length)
      ? "<h3>Verified local nets (this edition only)</h3>" + listHtml(data.nets)
      : "<h3>Local nets</h3><p>Nets are not auto-filled for a new address. Use the search links and write verified times on the printed sheet.</p>";
    var emLines = (data.em && data.em.lines && data.em.lines.length)
      ? "<h3>" + escapeHtml(data.em.label || "Local contacts") + "</h3>" + listHtml(data.em.lines)
      : "";
    var other = (data.other_bands && data.other_bands.length)
      ? "<h3>Other amateur bands</h3>" + rowsHtml(data.other_bands)
      : "";
    var caveats = (data.notes || []).slice();
    var pdfBtn = '<a class="btn" href="print.html">Print / save as PDF</a>';

    inner.innerHTML =
      '<div class="results-head"><div>' + badge() +
        "<h2>" + escapeHtml(data.address_line || data.matched_address) + "</h2>" +
        "<p>" + escapeHtml(modeLabel) + "</p></div>" +
        '<div class="actions">' + pdfBtn + "</div></div>" +
      '<div class="card"><h3>Location</h3><dl class="dl">' +
        "<div><dt>Address you entered</dt><dd>" + escapeHtml(data.query) + "</dd></div>" +
        "<div><dt>Geocoder match</dt><dd>" + escapeHtml(data.matched_address) + "</dd></div>" +
        "<div><dt>Coordinates</dt><dd>" + escapeHtml(data.decimal) + "<br>" + escapeHtml(data.dms) + "</dd></div>" +
        "<div><dt>County</dt><dd>" + escapeHtml(data.county_label || "—") +
          (data.same_code ? " · SAME " + escapeHtml(data.same_code) : "") + "</dd></div>" +
      "</dl><p>" + escapeHtml(data.geocode_note || "") + "</p></div>" +
      '<div class="card" style="margin-top:14px"><h3>Local frequencies</h3>' + empty +
        (data.repeater_count ? "<p>" + data.repeater_count + " local 2 m / 70 cm listings" +
          (data.other_count ? ", plus " + data.other_count + " on other bands" : "") + ".</p>" : "") +
        rowsHtml([].concat(data.repeaters || [], data.noaa || [])) +
        other +
        "<p>" + escapeHtml(data.repeater_source || "") + "</p></div>" +
      '<div class="card" style="margin-top:14px">' + nets + emLines +
        "<h3>Look these up yourself</h3>" + listHtml(data.lookup_links) + "</div>" +
      '<div class="card note" style="margin-top:14px"><p><b>Verify on the air</b></p>' +
        listHtml(caveats) +
        '<div class="actions">' + pdfBtn +
        '<a class="btn secondary" href="#crash-course">Review the crash course</a></div></div>';

    results.classList.add("is-open");
    results.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var address = (input.value || "").trim();
    if (!address) return;
    button.disabled = true;
    button.textContent = "Looking up…";
    lookupAddress(address)
      .then(render)
      .catch(function (err) {
        render({ ok: false, error: err.message || "Lookup failed. Please try again." });
      })
      .finally(function () {
        button.disabled = false;
        button.textContent = "Make my guide";
      });
  });
})();
