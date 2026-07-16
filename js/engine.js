(() => {
  "use strict";

  const STORAGE_KEY = "sakura_diary_v1";
  const SLOT_COUNT = 6;

  const state = {
    nodeId: "start",
    affection: { misaki: 0, haruka: 0, rin: 0 },
    route: null,
    unlocks: {},
    history: [],
    settings: {
      textSpeed: 28,
      autoDelay: 1400,
      bgmVolume: 0.5,
    },
    flags: {
      auto: false,
      skip: false,
    },
  };

  let typing = false;
  let typeTimer = null;
  let autoTimer = null;
  let fullText = "";
  let charIndex = 0;
  let currentBg = "";
  let persist = loadPersist();

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  const els = {
    title: $("#screen-title"),
    game: $("#screen-game"),
    ending: $("#screen-ending"),
    overlay: $("#overlay"),
    modal: $("#modal-root"),
    bg: $("#bg-layer"),
    cg: $("#cg-layer"),
    char: $("#char-sprite"),
    effect: $("#effect-layer"),
    chapter: $("#chapter-banner"),
    chapterLabel: $("#chapter-label"),
    choice: $("#choice-panel"),
    textbox: $("#textbox"),
    speaker: $("#speaker"),
    dialogue: $("#dialogue"),
    marker: $("#continue-marker"),
    endingBg: $("#ending-bg"),
    endingBadge: $("#ending-badge"),
    endingTitle: $("#ending-title"),
    endingText: $("#ending-text"),
    canvas: $("#petal-canvas"),
  };

  /* ========== Persist ========== */
  function loadPersist() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { slots: Array(SLOT_COUNT).fill(null), unlocks: {}, settings: null };
      const data = JSON.parse(raw);
      return {
        slots: data.slots || Array(SLOT_COUNT).fill(null),
        unlocks: data.unlocks || {},
        settings: data.settings || null,
      };
    } catch {
      return { slots: Array(SLOT_COUNT).fill(null), unlocks: {}, settings: null };
    }
  }

  function savePersist() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        slots: persist.slots,
        unlocks: persist.unlocks,
        settings: state.settings,
      })
    );
  }

  function mergeUnlocks(key) {
    if (!key) return;
    persist.unlocks[key] = true;
    state.unlocks[key] = true;
    savePersist();
  }

  /* ========== Screens ========== */
  function showScreen(name) {
    $$(".screen").forEach((s) => s.classList.remove("active"));
    const map = { title: els.title, game: els.game, ending: els.ending };
    map[name]?.classList.add("active");
  }

  function openModal(html) {
    els.modal.innerHTML = html;
    els.overlay.classList.remove("hidden");
  }

  function closeModal() {
    els.overlay.classList.add("hidden");
    els.modal.innerHTML = "";
  }

  /* ========== Visuals ========== */
  function setBackground(key) {
    const src = STORY.backgrounds[key];
    if (!src || currentBg === src) return;
    currentBg = src;
    els.bg.style.opacity = "0";
    setTimeout(() => {
      els.bg.style.backgroundImage = `url('${src}')`;
      els.bg.style.opacity = "1";
    }, 220);
  }

  function setCG(src) {
    if (!src) {
      els.cg.classList.add("hidden");
      els.cg.style.backgroundImage = "";
      return;
    }
    els.cg.style.backgroundImage = `url('${src}')`;
    els.cg.classList.remove("hidden");
  }

  function setCharacter(charId, expr) {
    if (!charId) {
      els.char.classList.add("hidden");
      els.char.removeAttribute("src");
      return;
    }
    const ch = STORY.characters[charId];
    const src = ch?.sprites?.[expr] || Object.values(ch?.sprites || {})[0];
    if (!src) {
      els.char.classList.add("hidden");
      return;
    }
    const prev = els.char.getAttribute("src");
    els.char.src = src;
    els.char.alt = ch.name;
    els.char.classList.remove("hidden");
    if (prev !== src) {
      els.char.style.animation = "none";
      void els.char.offsetWidth;
      els.char.style.animation = "";
    }
  }

  function showChapter(text) {
    if (!text) return;
    els.chapterLabel.textContent = text;
    els.chapter.classList.remove("hidden");
    setTimeout(() => els.chapter.classList.add("hidden"), 2400);
  }

  function playEffect(name) {
    if (!name) return;
    els.effect.className = "effect-layer " + name;
    setTimeout(() => {
      els.effect.className = "effect-layer";
    }, 1200);
  }

  /* ========== Typewriter ========== */
  function clearType() {
    if (typeTimer) clearInterval(typeTimer);
    if (autoTimer) clearTimeout(autoTimer);
    typeTimer = null;
    autoTimer = null;
    typing = false;
  }

  function typeText(text) {
    clearType();
    fullText = text || "";
    charIndex = 0;
    els.dialogue.textContent = "";
    els.marker.classList.remove("show");
    typing = true;

    if (state.flags.skip) {
      els.dialogue.textContent = fullText;
      typing = false;
      els.marker.classList.add("show");
      scheduleAuto();
      return;
    }

    const speed = Math.max(8, 60 - state.settings.textSpeed);
    typeTimer = setInterval(() => {
      charIndex += 1;
      els.dialogue.textContent = fullText.slice(0, charIndex);
      if (charIndex >= fullText.length) {
        clearInterval(typeTimer);
        typeTimer = null;
        typing = false;
        els.marker.classList.add("show");
        scheduleAuto();
      }
    }, speed);
  }

  function finishTyping() {
    if (!typing) return;
    clearType();
    els.dialogue.textContent = fullText;
    typing = false;
    els.marker.classList.add("show");
    scheduleAuto();
  }

  function scheduleAuto() {
    if (!state.flags.auto || els.choice.childElementCount) return;
    autoTimer = setTimeout(() => advance(), state.settings.autoDelay);
  }

  /* ========== Story flow ========== */
  function resetRuntime(fromNode = "start") {
    state.nodeId = fromNode;
    state.affection = { misaki: 0, haruka: 0, rin: 0 };
    state.route = null;
    state.history = [];
    state.flags.auto = false;
    state.flags.skip = false;
    state.unlocks = { ...persist.unlocks };
    currentBg = "";
    $$(".game-toolbar button").forEach((b) => b.classList.remove("active"));
    els.choice.classList.add("hidden");
    els.choice.innerHTML = "";
    setCG(null);
  }

  function applyAffection(map) {
    if (!map) return;
    Object.entries(map).forEach(([k, v]) => {
      state.affection[k] = (state.affection[k] || 0) + v;
    });
  }

  function renderNode(id) {
    const node = STORY.nodes[id];
    if (!node) {
      console.error("Missing node", id);
      return;
    }
    state.nodeId = id;

    if (node.chapter) showChapter(node.chapter);
    if (node.bg) setBackground(node.bg);
    if (node.unlock) mergeUnlocks(node.unlock);
    if (node.affection) applyAffection(node.affection);
    if (node.effect) playEffect(node.effect);

    if (node.cg) {
      setCG(node.cg);
      setCharacter(null);
    } else {
      setCG(null);
      setCharacter(node.char || null, node.expr);
    }

    if (node.speaker) {
      els.speaker.textContent = node.speaker;
      els.speaker.classList.remove("hidden");
      const ch = Object.values(STORY.characters).find((c) => c.name === node.speaker);
      if (ch) els.speaker.style.background = `linear-gradient(90deg, ${ch.color}, ${ch.color}cc)`;
      else els.speaker.style.background = "";
    } else {
      els.speaker.classList.add("hidden");
    }

    state.history.push({
      speaker: node.speaker || "",
      text: node.text || "",
    });
    if (state.history.length > 80) state.history.shift();

    els.choice.classList.add("hidden");
    els.choice.innerHTML = "";
    els.textbox.style.opacity = node.choices ? "0.35" : "1";

    typeText(node.text || "");

    if (node.choices) {
      clearType();
      els.dialogue.textContent = node.text || "";
      els.marker.classList.remove("show");
      showChoices(node.choices);
    }

    if (node.ending && !node.choices && !node.requireAffection) {
      // wait for player to advance into ending
    }
  }

  function showChoices(choices) {
    els.choice.classList.remove("hidden");
    els.textbox.style.opacity = "0.4";
    choices.forEach((c) => {
      const btn = document.createElement("button");
      btn.className = "choice-btn";
      btn.type = "button";
      btn.textContent = c.text;
      btn.addEventListener("click", () => {
        if (c.affection) applyAffection(c.affection);
        if (c.route) state.route = c.route;
        els.choice.classList.add("hidden");
        els.choice.innerHTML = "";
        els.textbox.style.opacity = "1";
        goTo(c.next);
      });
      els.choice.appendChild(btn);
    });
  }

  function affectionPassed(req) {
    return Object.entries(req).every(([k, min]) => (state.affection[k] || 0) >= min);
  }

  function goTo(id) {
    if (!id) return;
    const node = STORY.nodes[id];
    if (!node) {
      console.error("Missing node", id);
      return;
    }
    // 好感度不足时跳过告白检定节点，直接进入坏结局
    if (node.requireAffection && !affectionPassed(node.requireAffection)) {
      renderNode(node.failNext);
      return;
    }
    renderNode(id);
  }

  function advance() {
    if (els.overlay && !els.overlay.classList.contains("hidden")) return;
    if (!els.game.classList.contains("active")) return;
    if (els.choice.childElementCount) return;

    if (typing) {
      finishTyping();
      return;
    }

    const node = STORY.nodes[state.nodeId];
    if (!node) return;

    if (node.ending) {
      showEnding(node.ending);
      return;
    }

    if (node.next) goTo(node.next);
  }

  function showEnding(endingId) {
    clearType();
    state.flags.auto = false;
    state.flags.skip = false;
    mergeUnlocks(endingId);
    const ending = STORY.endings[endingId];
    if (!ending) return;
    els.endingBg.style.backgroundImage = `url('${ending.bg}')`;
    els.endingBadge.textContent = ending.badge;
    els.endingTitle.textContent = ending.title;
    els.endingText.textContent = ending.text;
    showScreen("ending");
  }

  /* ========== Save / Load ========== */
  function snapshot() {
    return {
      nodeId: state.nodeId,
      affection: { ...state.affection },
      route: state.route,
      unlocks: { ...state.unlocks },
      history: state.history.slice(-20),
      bg: currentBg,
      time: Date.now(),
      label: STORY.nodes[state.nodeId]?.chapter || STORY.nodes[state.nodeId]?.speaker || "进行中",
      preview: (STORY.nodes[state.nodeId]?.text || "").slice(0, 36),
    };
  }

  function applySnapshot(snap) {
    resetRuntime(snap.nodeId);
    state.affection = { ...snap.affection };
    state.route = snap.route;
    state.unlocks = { ...persist.unlocks, ...(snap.unlocks || {}) };
    state.history = snap.history || [];
    showScreen("game");
    renderNode(snap.nodeId);
  }

  function openSaveLoad(mode) {
    const rows = persist.slots
      .map((slot, i) => {
        if (!slot) {
          return `<button class="slot-btn" data-slot="${i}">
            <div class="slot-thumb"></div>
            <div class="slot-meta"><strong>栏位 ${i + 1}</strong><span>空</span></div>
          </button>`;
        }
        const date = new Date(slot.time).toLocaleString();
        return `<button class="slot-btn" data-slot="${i}">
          <div class="slot-thumb" style="background-image:url('${slot.bg || STORY.backgrounds.title}')"></div>
          <div class="slot-meta"><strong>栏位 ${i + 1} · ${slot.label}</strong><span>${date}<br>${slot.preview || ""}</span></div>
        </button>`;
      })
      .join("");

    openModal(`
      <button class="modal-close" data-close>关闭</button>
      <h3>${mode === "save" ? "保存进度" : "读取进度"}</h3>
      <p class="modal-desc">${mode === "save" ? "选择一个栏位保存当前故事。" : "选择要继续的存档。"}</p>
      <div class="slot-grid">${rows}</div>
    `);

    els.modal.querySelectorAll("[data-slot]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.slot);
        if (mode === "save") {
          if (!els.game.classList.contains("active")) return;
          persist.slots[idx] = snapshot();
          savePersist();
          closeModal();
          toast("已保存");
        } else {
          const slot = persist.slots[idx];
          if (!slot) return;
          closeModal();
          applySnapshot(slot);
        }
      });
    });
  }

  function toast(msg) {
    const t = document.createElement("div");
    t.textContent = msg;
    t.style.cssText =
      "position:absolute;top:16%;left:50%;transform:translateX(-50%);z-index:60;padding:10px 20px;background:rgba(26,35,50,.9);border:1px solid rgba(232,144,156,.5);letter-spacing:.12em;font-size:13px;animation:fade-up .3s ease";
    $("#app").appendChild(t);
    setTimeout(() => t.remove(), 1400);
  }

  /* ========== Gallery / Settings / Log / Menu ========== */
  function openGallery() {
    const items = STORY.gallery
      .map((g) => {
        const unlocked = !!persist.unlocks[g.unlock];
        return `<button class="gallery-item ${unlocked ? "" : "locked"}" data-src="${unlocked ? g.src : ""}" ${unlocked ? "" : "disabled"}>
          <span>${unlocked ? g.title : "？？？"}</span>
        </button>`;
      })
      .join("");

    openModal(`
      <button class="modal-close" data-close>关闭</button>
      <h3>回忆图鉴</h3>
      <p class="modal-desc">通关与游玩过程中解锁的画面会集中在这里。</p>
      <div class="gallery-grid">${items}</div>
    `);

    // paint thumbs
    els.modal.querySelectorAll(".gallery-item").forEach((el, i) => {
      const g = STORY.gallery[i];
      if (persist.unlocks[g.unlock]) {
        el.style.backgroundImage = `url('${g.src}')`;
        el.addEventListener("click", () => {
          openModal(`
            <button class="modal-close" data-close>关闭</button>
            <h3>${g.title}</h3>
            <div style="margin-top:12px;aspect-ratio:16/9;background:url('${g.src}') center/cover;border:1px solid rgba(232,144,156,.35)"></div>
          `);
        });
      }
    });
  }

  function openSettings() {
    openModal(`
      <button class="modal-close" data-close>关闭</button>
      <h3>游戏设置</h3>
      <p class="modal-desc">调整阅读节奏，设置会自动保存。</p>
      <div class="settings-row">
        <label>文字速度</label>
        <input id="set-speed" type="range" min="10" max="50" value="${state.settings.textSpeed}" />
      </div>
      <div class="settings-row">
        <label>自动播放间隔</label>
        <input id="set-auto" type="range" min="600" max="3000" step="100" value="${state.settings.autoDelay}" />
      </div>
      <div class="confirm-actions">
        <button class="menu-btn" data-close>完成</button>
      </div>
    `);
    const speed = els.modal.querySelector("#set-speed");
    const auto = els.modal.querySelector("#set-auto");
    speed.addEventListener("input", () => {
      state.settings.textSpeed = Number(speed.value);
      savePersist();
    });
    auto.addEventListener("input", () => {
      state.settings.autoDelay = Number(auto.value);
      savePersist();
    });
  }

  function openLog() {
    const list = state.history.length
      ? state.history
          .slice()
          .reverse()
          .map(
            (h) => `<div class="log-item">
              ${h.speaker ? `<div class="log-name">${h.speaker}</div>` : ""}
              <div class="log-text">${h.text}</div>
            </div>`
          )
          .join("")
      : `<p class="modal-desc">还没有对话记录。</p>`;

    openModal(`
      <button class="modal-close" data-close>关闭</button>
      <h3>对话回看</h3>
      <div class="log-list">${list}</div>
    `);
  }

  function openGameMenu() {
    openModal(`
      <button class="modal-close" data-close>关闭</button>
      <h3>菜单</h3>
      <div class="menu-list">
        <button class="menu-btn" data-menu="save">保存进度</button>
        <button class="menu-btn" data-menu="load">读取进度</button>
        <button class="menu-btn" data-menu="settings">游戏设置</button>
        <button class="menu-btn" data-menu="title">返回标题</button>
      </div>
    `);
    els.modal.querySelectorAll("[data-menu]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const act = btn.dataset.menu;
        if (act === "save") openSaveLoad("save");
        else if (act === "load") openSaveLoad("load");
        else if (act === "settings") openSettings();
        else if (act === "title") {
          closeModal();
          confirmTitle();
        }
      });
    });
  }

  function confirmTitle() {
    openModal(`
      <h3>返回标题？</h3>
      <p class="modal-desc">未保存的进度将会丢失。</p>
      <div class="confirm-actions">
        <button class="menu-btn" data-close>取消</button>
        <button class="menu-btn" id="confirm-title">确定</button>
      </div>
    `);
    els.modal.querySelector("#confirm-title").addEventListener("click", () => {
      closeModal();
      clearType();
      showScreen("title");
      updateContinueBtn();
    });
  }

  function updateContinueBtn() {
    const btn = document.querySelector('[data-action="continue"]');
    const has = persist.slots.some(Boolean);
    if (btn) btn.disabled = !has;
  }

  function startNewGame() {
    resetRuntime("start");
    showScreen("game");
    renderNode("start");
  }

  function continueGame() {
    const latest = persist.slots
      .filter(Boolean)
      .sort((a, b) => b.time - a.time)[0];
    if (!latest) {
      toast("没有可继续的存档");
      return;
    }
    applySnapshot(latest);
  }

  /* ========== Petals ========== */
  function initPetals() {
    const canvas = els.canvas;
    const ctx = canvas.getContext("2d");
    let w, h, petals, raf;

    function resize() {
      const rect = $("#app").getBoundingClientRect();
      w = canvas.width = rect.width;
      h = canvas.height = rect.height;
    }

    function spawn() {
      petals = Array.from({ length: 28 }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 4 + Math.random() * 6,
        vy: 0.4 + Math.random() * 1.1,
        vx: -0.4 + Math.random() * 0.8,
        rot: Math.random() * Math.PI,
        vr: (-0.02 + Math.random() * 0.04),
        a: 0.35 + Math.random() * 0.45,
      }));
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      petals.forEach((p) => {
        p.x += p.vx + Math.sin(p.y * 0.01) * 0.3;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y > h + 10) {
          p.y = -10;
          p.x = Math.random() * w;
        }
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = `rgba(232,144,156,${p.a})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r, p.r * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
      raf = requestAnimationFrame(draw);
    }

    resize();
    spawn();
    draw();
    window.addEventListener("resize", () => {
      resize();
      spawn();
    });
  }

  /* ========== Events ========== */
  function bindEvents() {
    document.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const act = btn.dataset.action;
        if (act === "new-game") startNewGame();
        else if (act === "continue") continueGame();
        else if (act === "gallery" || act === "gallery-from-end") openGallery();
        else if (act === "settings") openSettings();
        else if (act === "title") {
          showScreen("title");
          updateContinueBtn();
        }
      });
    });

    els.game.addEventListener("click", (e) => {
      if (e.target.closest(".game-toolbar") || e.target.closest(".choice-panel")) return;
      advance();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (!els.overlay.classList.contains("hidden")) closeModal();
        else if (els.game.classList.contains("active")) openGameMenu();
        return;
      }
      if (e.code === "Space" || e.key === "Enter") {
        if (!els.overlay.classList.contains("hidden")) return;
        e.preventDefault();
        advance();
      }
    });

    $$(".game-toolbar button").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const tool = btn.dataset.tool;
        if (tool === "auto") {
          state.flags.auto = !state.flags.auto;
          btn.classList.toggle("active", state.flags.auto);
          if (state.flags.auto && !typing) scheduleAuto();
          else if (!state.flags.auto && autoTimer) clearTimeout(autoTimer);
        } else if (tool === "skip") {
          state.flags.skip = !state.flags.skip;
          btn.classList.toggle("active", state.flags.skip);
          if (state.flags.skip) {
            const tick = () => {
              if (!state.flags.skip || !els.game.classList.contains("active")) return;
              if (els.choice.childElementCount) {
                state.flags.skip = false;
                btn.classList.remove("active");
                return;
              }
              advance();
              setTimeout(tick, typing ? 10 : 80);
            };
            tick();
          }
        } else if (tool === "save") openSaveLoad("save");
        else if (tool === "load") openSaveLoad("load");
        else if (tool === "log") openLog();
        else if (tool === "menu") openGameMenu();
      });
    });

    els.overlay.addEventListener("click", (e) => {
      if (e.target === els.overlay) closeModal();
    });

    els.modal.addEventListener("click", (e) => {
      if (e.target.matches("[data-close]")) closeModal();
    });
  }

  function init() {
    if (persist.settings) state.settings = { ...state.settings, ...persist.settings };
    state.unlocks = { ...persist.unlocks };
    bindEvents();
    initPetals();
    updateContinueBtn();
    showScreen("title");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
