(function () {
  "use strict";

  /* =========================================================
     GK MEMBER POPUP CONFIG
     Endre dette øverst når du vil justere grupper, priser, tekst
     ========================================================= */

  var CONFIG = {
    debug: true,
    pagePath: "/customer/index",
    memberApi: "https://cold-shadow-36dc.post-cd6.workers.dev/club-members",
    minBaggUrl: "https://golfkongen.no/sider/min-bag",
    sessionKeyPrefix: "gk_member_popup_seen",

    texts: {
      introDiscount:
        "OBS: Prisene du ser i butikken er full pris. Eventuelle rabatter trekkes fra først i kassen.",
      minBaggTitle: "Bruk Min Bagg",
      minBaggText:
        "Registrer discene dine i Min Bagg og bli automatisk med i den månedlige trekningen.",
      giftcardPrefix: "Hver måned trekker vi en vinner av",
      giftcardValue: "400 kr gavekort",
      giftcardSuffix: "på GolfKongen.no blant de som har registrert baggen sin.",
      minBaggButton: "Åpne Min Bagg",
      closeButton: "Lukk",
      defaultLabel: ""
    },

    groups: {
      ansatte: {
        label: "Ansatte",
        retailText: "30% rabatt i hele butikken",
        discBookingText: "98% rabatt på booking av disc simulator",
        dartBookingText: "98% rabatt på booking av dart",
        clubNight: true,

        retailPriority: 100,
        discBookingPriority: 100,
        dartBookingPriority: 100
      },

      teamgolfkongen: {
        label: "Team GolfKongen",
        retailText: "30% rabatt på discgolf og golfutstyr",
        discBookingText: "Disc simulator til 100 kr timen",
        dartBookingText: "",
        clubNight: false,

        retailPriority: 90,
        discBookingPriority: 90,
        dartBookingPriority: 0
      },

      ambassador: {
        label: "Ambassador",
        retailText: "15% rabatt på discgolfutstyr",
        discBookingText: "Disc simulator til 100 kr timen",
        dartBookingText: "",
        clubNight: false,

        retailPriority: 80,
        discBookingPriority: 80,
        dartBookingPriority: 0
      },

      medlemmer: {
        label: "Medlem",
        retailText: "",
        discBookingText: "Disc simulator til 100 kr timen",
        dartBookingText: "",
        clubNight: false,

        retailPriority: 0,
        discBookingPriority: 70,
        dartBookingPriority: 0
      },

      frisbeeklubb: {
        label: "Frisbeeklubb",
        retailText: "10% rabatt på alt av discgolfutstyr",
        discBookingText: "Disc simulator til 120 kr timen",
        dartBookingText: "",
        clubNight: false,

        retailPriority: 50,
        discBookingPriority: 50,
        dartBookingPriority: 0
      },

      dartklubb: {
        label: "Dartklubb",
        retailText: "10% rabatt på alt av dartutstyr",
        discBookingText: "",
        dartBookingText: "Dart til 100 kr timen",
        clubNight: true,

        retailPriority: 50,
        discBookingPriority: 0,
        dartBookingPriority: 50
      }
    }
  };

  /* =========================================================
     HJELPEFUNKSJONER
     ========================================================= */

  function log() {
    if (!CONFIG.debug) return;
    try {
      console.log.apply(console, ["[GK MEMBER POPUP]"].concat([].slice.call(arguments)));
    } catch (e) {}
  }

  function normalizePath(path) {
    path = String(path || "");
    while (path.length > 1 && path.charAt(path.length - 1) === "/") {
      path = path.slice(0, -1);
    }
    return path || "/";
  }

  function normalizeText(str) {
    return String(str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function decodeHtml(str) {
    var el = document.createElement("textarea");
    el.innerHTML = String(str || "");
    return el.value;
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function fetchSameOrigin(url) {
    return fetch(url, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store"
    });
  }

  async function isLoggedIn() {
    try {
      var r = await fetchSameOrigin("/customer/index");
      var html = await r.text();

      var hasCustomerName = /customer-nav-name/i.test(html);
      var hasLogoutLink = /\/customer\/logout/i.test(html);
      var hasMyPages = /\/customer\/index/i.test(html) && /customer/i.test(html);

      if (hasCustomerName || hasLogoutLink || hasMyPages) {
        return true;
      }

      return false;
    } catch (e) {
      log("isLoggedIn error", e);
      return false;
    }
  }

  async function getLoggedInIdentity() {
    var paths = [
      "/customer/details",
      "/customer/account",
      "/customer/index",
      "/customer/orders"
    ];

    for (var i = 0; i < paths.length; i++) {
      var path = paths[i];
      try {
        var r = await fetchSameOrigin(path);
        var html = await r.text();

        var name = "";
        var email = "";

        var mClass = html.match(/<div class="customer-nav-name">([\s\S]*?)<\/div>/i);
        if (mClass && mClass[1]) name = decodeHtml(mClass[1]);

        if (!name) {
          var mAlt = html.match(/alt="([^"]+)"/i);
          if (mAlt && mAlt[1]) name = decodeHtml(mAlt[1]);
        }

        var mEmail = html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig);
        if (mEmail && mEmail.length) email = mEmail[0];

        name = String(name || "").trim();
        email = String(email || "").trim();

        if (name || email) {
          return { path: path, name: name, email: email };
        }
      } catch (e) {
        log("identity read failed for", path, e);
      }
    }

    return { path: "", name: "", email: "" };
  }

  async function fetchMembers() {
    var r = await fetch(CONFIG.memberApi, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  function parseGroups(raw) {
    if (Array.isArray(raw)) {
      return raw
        .map(function (g) { return String(g || "").toLowerCase().trim(); })
        .filter(Boolean);
    }

    return String(raw || "")
      .toLowerCase()
      .split(",")
      .map(function (g) { return g.trim(); })
      .filter(Boolean);
  }

  function findMember(identity, members) {
    var email = String(identity.email || "").trim().toLowerCase();
    var nameNorm = normalizeText(identity.name || "");

    return (members || []).find(function (m) {
      if (!m || !m.active) return false;

      var memberEmail = String(m.email || "").trim().toLowerCase();
      var memberNameNorm = normalizeText(m.name || "");

      if (email && memberEmail && email === memberEmail) return true;
      if (nameNorm && memberNameNorm && nameNorm === memberNameNorm) return true;

      return false;
    }) || null;
  }

  function getUserSessionKey(identity) {
    var raw = String(identity.email || identity.name || "guest")
      .toLowerCase()
      .trim();

    raw = raw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    return CONFIG.sessionKeyPrefix + "_" + (raw || "guest");
  }

  function uniquePush(arr, value) {
    if (value && arr.indexOf(value) === -1) arr.push(value);
  }

  function resolveBenefits(groups) {
    var activeGroups = groups
      .map(function (groupName) {
        return CONFIG.groups[groupName] ? { key: groupName, cfg: CONFIG.groups[groupName] } : null;
      })
      .filter(Boolean);

    var bestRetail = null;
    var bestDisc = null;
    var bestDart = null;
    var hasClubNight = false;
    var labels = [];

    activeGroups.forEach(function (item) {
      var cfg = item.cfg;

      if (cfg.label) uniquePush(labels, cfg.label);

      if (cfg.clubNight) hasClubNight = true;

      if (cfg.retailText) {
        if (!bestRetail || (cfg.retailPriority || 0) > (bestRetail.retailPriority || 0)) {
          bestRetail = cfg;
        }
      }

      if (cfg.discBookingText) {
        if (!bestDisc || (cfg.discBookingPriority || 0) > (bestDisc.discBookingPriority || 0)) {
          bestDisc = cfg;
        }
      }

      if (cfg.dartBookingText) {
        if (!bestDart || (cfg.dartBookingPriority || 0) > (bestDart.dartBookingPriority || 0)) {
          bestDart = cfg;
        }
      }
    });

    var lines = [];
    if (bestRetail && bestRetail.retailText) lines.push(bestRetail.retailText);
    if (bestDisc && bestDisc.discBookingText) lines.push(bestDisc.discBookingText);
    if (bestDart && bestDart.dartBookingText) lines.push(bestDart.dartBookingText);
    if (hasClubNight) lines.push("Tilgang til klubbkvelder");

    var hasAnyDiscountInfo =
      !!(bestRetail && bestRetail.retailText) ||
      !!(bestDisc && bestDisc.discBookingText) ||
      !!(bestDart && bestDart.dartBookingText);

    return {
      labels: labels,
      lines: lines,
      hasClubNight: hasClubNight,
      hasAnyDiscountInfo: hasAnyDiscountInfo
    };
  }

  function getPopupContent(identity, member) {
    var name = String(identity.name || "").trim();
    var firstName = name ? name.split(/\s+/)[0] : "der";

    if (!member) {
      return {
        greeting: "Velkommen " + firstName + " 👋",
        groupLabel: CONFIG.texts.defaultLabel,
        intro: "",
        benefitLines: [],
        showBenefitCard: false,
        minBaggTitle: CONFIG.texts.minBaggTitle,
        minBaggText: CONFIG.texts.minBaggText
      };
    }

    var groups = parseGroups(member.groups);
    var resolved = resolveBenefits(groups);

    return {
      greeting: "Velkommen " + firstName + " 👋",
      groupLabel: resolved.labels.join(" / "),
      intro: resolved.hasAnyDiscountInfo ? CONFIG.texts.introDiscount : "",
      benefitLines: resolved.lines,
      showBenefitCard: resolved.lines.length > 0,
      minBaggTitle: CONFIG.texts.minBaggTitle,
      minBaggText: CONFIG.texts.minBaggText
    };
  }

  /* =========================================================
     UI
     ========================================================= */

  function ensureStyles() {
    if (document.getElementById("gk-member-popup-style")) return;

    var css = `
#gk-member-popup-overlay{
  position:fixed; inset:0; z-index:999999;
  display:flex; align-items:center; justify-content:center;
  background:rgba(5,10,18,.72);
  padding:18px;
}
#gk-member-popup{
  width:min(92vw,580px);
  background:linear-gradient(180deg,#101826 0%,#0c121d 100%);
  color:#eef4fb;
  border:1px solid rgba(255,255,255,.08);
  border-radius:22px;
  box-shadow:0 18px 60px rgba(0,0,0,.45);
  overflow:hidden;
  font-family:inherit;
}
.gkmp-top{
  padding:20px 20px 12px 20px;
  border-bottom:1px solid rgba(255,255,255,.06);
}
.gkmp-kicker{
  display:inline-block;
  font-size:12px;
  font-weight:700;
  letter-spacing:.04em;
  text-transform:uppercase;
  color:#9fd66f;
  margin-bottom:8px;
}
.gkmp-title{
  margin:0;
  font-size:clamp(24px,3vw,32px);
  line-height:1.15;
  color:#fff;
}
.gkmp-body{
  padding:16px 20px 20px 20px;
}
.gkmp-alert{
  background:linear-gradient(180deg, rgba(255,190,60,.18) 0%, rgba(255,190,60,.10) 100%);
  border:1px solid rgba(255,190,60,.35);
  color:#fff7df;
  border-radius:16px;
  padding:14px 15px;
  font-size:14px;
  line-height:1.5;
  margin-bottom:14px;
  font-weight:700;
}
.gkmp-card{
  background:rgba(255,255,255,.04);
  border:1px solid rgba(255,255,255,.06);
  border-radius:16px;
  padding:14px;
  margin-bottom:12px;
}
.gkmp-label{
  font-size:13px;
  font-weight:700;
  color:#9fd66f;
  margin:0 0 6px 0;
  text-transform:uppercase;
  letter-spacing:.04em;
}
.gkmp-group{
  font-size:19px;
  font-weight:800;
  margin:0;
  color:#fff;
}
.gkmp-list{
  margin:0;
  padding-left:18px;
}
.gkmp-list li{
  margin:0 0 8px 0;
  line-height:1.45;
}
.gkmp-list li:last-child{
  margin-bottom:0;
}
.gkmp-p{
  margin:0 0 10px 0;
  line-height:1.55;
  color:#e6edf7;
}
.gkmp-gift{
  margin-top:10px;
  background:linear-gradient(180deg, rgba(159,214,111,.14) 0%, rgba(159,214,111,.08) 100%);
  border:1px solid rgba(159,214,111,.24);
  color:#f5ffe9;
  border-radius:16px;
  padding:14px;
  line-height:1.45;
}
.gkmp-gift-amount{
  display:inline-block;
  font-weight:900;
  font-size:20px;
  color:#9fd66f;
}
.gkmp-actions{
  display:flex;
  gap:10px;
  flex-wrap:wrap;
  margin-top:16px;
}
.gkmp-btn{
  appearance:none;
  border:none;
  text-decoration:none;
  cursor:pointer;
  border-radius:14px;
  padding:12px 16px;
  font-weight:800;
  font-size:15px;
}
.gkmp-btn-primary{
  background:#9fd66f;
  color:#0e151f;
}
.gkmp-btn-secondary{
  background:rgba(255,255,255,.08);
  color:#eef4fb;
}
.gkmp-close-x{
  position:absolute;
  right:14px;
  top:12px;
  border:none;
  background:transparent;
  color:#cdd8e7;
  font-size:28px;
  line-height:1;
  cursor:pointer;
}
.gkmp-wrap{
  position:relative;
}
@media (max-width:640px){
  #gk-member-popup-overlay{
    padding:12px;
    align-items:flex-end;
  }
  #gk-member-popup{
    width:100%;
    border-radius:18px 18px 0 0;
  }
  .gkmp-actions{
    flex-direction:column;
  }
  .gkmp-btn{
    width:100%;
    text-align:center;
  }
}
    `.trim();

    var style = document.createElement("style");
    style.id = "gk-member-popup-style";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function closePopup() {
    var overlay = document.getElementById("gk-member-popup-overlay");
    if (overlay) overlay.remove();
  }

  function openPopup(content, sessionKey) {
    closePopup();
    ensureStyles();

    var introHtml = content.intro
      ? '<div class="gkmp-alert">' + escapeHtml(content.intro) + '</div>'
      : "";

    var groupHtml = content.groupLabel
      ? `
        <div class="gkmp-card">
          <div class="gkmp-label">Din gruppe</div>
          <p class="gkmp-group">${escapeHtml(content.groupLabel)}</p>
        </div>
      `
      : "";

    var benefitHtml = content.showBenefitCard && content.benefitLines && content.benefitLines.length
      ? `
        <div class="gkmp-card">
          <div class="gkmp-label">Dine fordeler</div>
          <ul class="gkmp-list">
            ${content.benefitLines.map(function (line) {
              return "<li>" + escapeHtml(line) + "</li>";
            }).join("")}
          </ul>
        </div>
      `
      : "";

    var html = `
      <div id="gk-member-popup-overlay">
        <div id="gk-member-popup" class="gkmp-wrap" role="dialog" aria-modal="true" aria-label="Medlemsfordeler">
          <button class="gkmp-close-x" type="button" aria-label="Lukk">×</button>

          <div class="gkmp-top">
            <div class="gkmp-kicker">GolfKongen</div>
            <h2 class="gkmp-title">${escapeHtml(content.greeting)}</h2>
          </div>

          <div class="gkmp-body">
            ${introHtml}
            ${groupHtml}
            ${benefitHtml}

            <div class="gkmp-card">
              <div class="gkmp-label">${escapeHtml(content.minBaggTitle)}</div>
              <p class="gkmp-p">${escapeHtml(content.minBaggText)}</p>

              <div class="gkmp-gift">
                ${escapeHtml(CONFIG.texts.giftcardPrefix)}
                <span class="gkmp-gift-amount">${escapeHtml(CONFIG.texts.giftcardValue)}</span>
                ${escapeHtml(CONFIG.texts.giftcardSuffix)}
              </div>

              <div class="gkmp-actions">
                <a class="gkmp-btn gkmp-btn-primary" href="${escapeHtml(CONFIG.minBaggUrl)}">${escapeHtml(CONFIG.texts.minBaggButton)}</a>
                <button class="gkmp-btn gkmp-btn-secondary" type="button" id="gkmp-close-btn">${escapeHtml(CONFIG.texts.closeButton)}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML("beforeend", html);

    var overlay = document.getElementById("gk-member-popup-overlay");
    var closeX = overlay.querySelector(".gkmp-close-x");
    var closeBtn = document.getElementById("gkmp-close-btn");

    function done() {
      try {
        if (sessionKey) sessionStorage.setItem(sessionKey, "1");
      } catch (e) {}
      closePopup();
    }

    closeX.addEventListener("click", done);
    closeBtn.addEventListener("click", done);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) done();
    });
  }

  /* =========================================================
     RUN
     ========================================================= */

  async function run() {
    try {
      var path = normalizePath(location.pathname);
      if (path !== CONFIG.pagePath) {
        log("wrong path", path);
        return;
      }

      var loggedIn = await isLoggedIn();
      if (!loggedIn) {
        log("not logged in");
        return;
      }

      var identity = await getLoggedInIdentity();
      log("identity", identity);

      var userSessionKey = getUserSessionKey(identity);

      try {
        if (sessionStorage.getItem(userSessionKey) === "1") {
          log("already shown this session for user", userSessionKey);
          return;
        }
      } catch (e) {}

      var member = null;
      try {
        var members = await fetchMembers();
        member = findMember(identity, members);
        log("member match", member);
      } catch (e) {
        log("member fetch failed, using default popup", e);
      }

      var content = getPopupContent(identity, member);
      openPopup(content, userSessionKey);
    } catch (e) {
      log("fatal error", e);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
