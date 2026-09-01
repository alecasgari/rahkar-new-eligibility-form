(function () {
  const cfg = window.RAHKAR_CONFIG;
  const TOTAL = 10;
  const params = new URLSearchParams(window.location.search);
  const isEmbed = params.has("embed") || window.self !== window.top;

  if (isEmbed) document.documentElement.classList.add("embed");

  const utm = {};
  const utmMap = {
    utm_source: "utm_source_field",
    utm_medium: "utm_medium_field",
    utm_campaign: "utm_campaign_field",
    utm_term: "utm_term_field",
    utm_content: "utm_content_field"
  };
  Object.keys(utmMap).forEach(function (key) {
    if (params.has(key)) utm[utmMap[key]] = params.get(key);
  });

  let page = 1;
  let initialData = {};
  let aiParagraph = "";
  let selectedSlot = null;
  let selectedTimeLabel = "";
  let finalPackage = {};
  let failedAttempts = 0;
  let timer = null;
  const phoneInput = document.getElementById("final_phone");
  const iti = window.intlTelInput(phoneInput, {
    initialCountry: "ir",
    separateDialCode: true,
    preferredCountries: ["ir", "ae", "de", "ca", "tr"],
    nationalMode: false,
    utilsScript: "https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/utils.js"
  });

  const $ = function (id) { return document.getElementById(id); };
  const quiz = $("quiz");
  const loading = $("loading");
  const result = $("result");
  const otp = $("otp");
  const thanks = $("thanks");
  const nav = $("nav");

  function toEnglishNumbers(str) {
    if (typeof str !== "string") return str;
    return str
      .replace(/[۰-۹]/g, function (d) { return String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)); })
      .replace(/[٠-٩]/g, function (d) { return String("٠١٢٣٤٥٦٧٨٩".indexOf(d)); });
  }

  function normalizePhone(raw) {
    var n = toEnglishNumbers(raw || "").replace(/[^\d]/g, "");
    if (n.indexOf("00") === 0) n = n.slice(2);
    if (n.indexOf("98") === 0) n = n.slice(2);
    if (n.charAt(0) === "0") n = n.slice(1);
    if (n.length === 10 && n.charAt(0) === "9") return "98" + n;
    return "";
  }

  function notifyParentHeight() {
    if (window.parent === window) return;
    window.parent.postMessage({
      type: "rahkar-form-height",
      height: document.documentElement.scrollHeight
    }, "*");
  }

  function showPage(n) {
    document.querySelectorAll(".page").forEach(function (el) {
      el.classList.toggle("hidden", Number(el.dataset.page) !== n);
    });
    $("progress-bar").style.width = (n / TOTAL) * 100 + "%";
    $("prev").classList.toggle("hidden", n === 1);
    $("next").classList.toggle("hidden", n === TOTAL);
    $("submit-quiz").classList.toggle("hidden", n !== TOTAL);
    $("send-otp").classList.add("hidden");
    notifyParentHeight();
  }

  function showSection(section) {
    [quiz, loading, result, otp, thanks].forEach(function (el) {
      el.classList.add("hidden");
    });
    section.classList.remove("hidden");
    const onQuiz = section === quiz;
    const onResult = section === result;
    nav.classList.toggle("hidden", !onQuiz && !onResult);
    $("progress-wrap").classList.toggle("hidden", !onQuiz);
    $("prev").classList.toggle("hidden", !onQuiz || page === 1);
    $("next").classList.toggle("hidden", !onQuiz || page === TOTAL);
    $("submit-quiz").classList.toggle("hidden", !onQuiz || page !== TOTAL);
    $("send-otp").classList.toggle("hidden", !onResult);
    notifyParentHeight();
  }

  function validatePage(n) {
    if (n === 3 && !quiz.querySelector('input[name="user_gender"]:checked')) {
      alert("لطفا یک گزینه را انتخاب کنید.");
      return false;
    }
    if (n === 5 && !quiz.querySelector('input[name="user_prejob_exist"]:checked')) {
      alert("لطفا یک گزینه را انتخاب کنید.");
      return false;
    }
    if (n === 7 && quiz.querySelectorAll('input[name="user_lang[]"]:checked').length === 0) {
      alert("لطفا حداقل یک زبان را انتخاب کنید یا گزینه «هیچکدام» را بزنید.");
      return false;
    }
    if (n === 8 && !quiz.querySelector('input[name="user_marriage_status"]:checked')) {
      alert("لطفا یک گزینه را انتخاب کنید.");
      return false;
    }
    return true;
  }

  function collectQuiz() {
    const data = {};
    const formData = new FormData(quiz);
    formData.forEach(function (value, key) {
      if (key.endsWith("[]")) {
        const clean = key.slice(0, -2);
        if (!data[clean]) data[clean] = [];
        if (String(value).trim()) data[clean].push(value);
      } else {
        data[key] = value;
      }
    });
    if (data.user_intent_countries) {
      data.user_intent_countries = data.user_intent_countries.join("، ");
    }
    ["user_lang_english", "user_lang_german", "user_lang_italy", "user_lang_spain"].forEach(function (k) {
      if (!data[k]) data[k] = "0";
    });
    Object.assign(data, utm);
    data.form_id = cfg.formId;
    return data;
  }

  function fallbackParagraph(data) {
    let text = "با توجه به اطلاعات اولیه شما، ";
    if (data.user_age) text += "اینکه در سن " + data.user_age + " سالگی به فکر مهاجرت هستید، یک نقطه قوت کلیدی است. ";
    if (data.user_prejob_exist === "سابقه کار دارد") text += "سابقه کاری شما می‌تواند در بسیاری از مسیرهای شغلی به شما کمک کند. ";
    else if (data.user_prejob_exist) text += "مسیرهای تحصیلی و گزینه‌های دیگر می‌تواند برای شرایط شما مناسب باشد. ";
    if (data.user_time_force === "بله") text += "با در نظر گرفتن فورس زمانی شما، باید روی مسیرهایی تمرکز کنیم که فرآیند سریع‌تری دارند. ";
    text += "برای دریافت یک تحلیل کامل و شخصی‌سازی شده، پیشنهاد می‌کنیم در اولین فرصت یک جلسه مشاوره با کارشناسان ما در راهکار گشت رزرو نمایید.";
    return text;
  }

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    let json = {};
    try { json = text ? JSON.parse(text) : {}; } catch (e) { json = { raw: text }; }
    return { ok: res.ok, json: Array.isArray(json) ? (json[0] || {}) : json };
  }

  function generateDays() {
    const days = $("days");
    days.innerHTML = "";
    const dayFmt = new Intl.DateTimeFormat("fa-IR", { weekday: "long" });
    const dateFmt = new Intl.DateTimeFormat("fa-IR", { day: "numeric", month: "long" });
    let count = 0;
    for (let i = 0; i < 14 && count < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      if (date.getDay() === 5) continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "day-btn" + (count === 0 ? " active" : "");
      btn.dataset.date = date.toISOString().split("T")[0];
      btn.innerHTML = dayFmt.format(date) + "<small>" + dateFmt.format(date) + "</small>";
      days.appendChild(btn);
      count++;
    }
    generateTimes(days.querySelector(".day-btn").dataset.date);
  }

  function generateTimes(dateStr) {
    const times = $("times");
    times.innerHTML = "";
    selectedSlot = null;
    selectedTimeLabel = "";
    for (let hour = 9; hour <= 15; hour++) {
      const label = hour + ":00 - " + (hour + 1) + ":00";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "time-btn";
      btn.textContent = label;
      btn.dataset.slotId = dateStr + "_" + hour + "-" + (hour + 1);
      btn.dataset.timeSlot = label;
      times.appendChild(btn);
    }
  }

  function bookingText(slotId, timeSlot) {
    const dateObj = new Date(slotId.split("_")[0]);
    const shamsi = new Intl.DateTimeFormat("fa-IR-u-nu-latn", {
      weekday: "long", year: "numeric", month: "long", day: "numeric"
    }).format(dateObj);
    return shamsi + " - " + timeSlot;
  }

  $("next").addEventListener("click", function () {
    if (!validatePage(page) || page >= TOTAL) return;
    page++;
    showPage(page);
  });

  $("prev").addEventListener("click", function () {
    if (page <= 1) return;
    page--;
    showPage(page);
  });

  $("submit-quiz").addEventListener("click", async function () {
    if (!validatePage(page)) return;
    initialData = collectQuiz();
    showSection(loading);
    $("show-report").classList.add("hidden");
    let pct = 0;
    const bar = $("load-bar");
    const tick = setInterval(function () {
      if (pct < 95) {
        pct++;
        bar.style.width = pct + "%";
        bar.textContent = pct + "%";
      }
    }, 120);

    try {
      const { json } = await postJson(cfg.webhooks.ai, initialData);
      aiParagraph = json.ai_paragraph || json.result || fallbackParagraph(initialData);
    } catch (err) {
      aiParagraph = fallbackParagraph(initialData);
    }

    clearInterval(tick);
    bar.style.width = "100%";
    bar.textContent = "100%";
    $("show-report").classList.remove("hidden");
    notifyParentHeight();
  });

  $("show-report").addEventListener("click", function () {
    showSection(result);
    generateDays();
  });

  $("days").addEventListener("click", function (e) {
    const btn = e.target.closest(".day-btn");
    if (!btn) return;
    $("days").querySelectorAll(".day-btn").forEach(function (b) { b.classList.remove("active"); });
    btn.classList.add("active");
    generateTimes(btn.dataset.date);
  });

  $("times").addEventListener("click", function (e) {
    const btn = e.target.closest(".time-btn");
    if (!btn) return;
    $("times").querySelectorAll(".time-btn").forEach(function (b) { b.classList.remove("active"); });
    btn.classList.add("active");
    selectedSlot = btn.dataset.slotId;
    selectedTimeLabel = btn.dataset.timeSlot;
  });

  function startResendTimer() {
    clearInterval(timer);
    let left = 120;
    $("resend").textContent = "ارسال مجدد کد تا " + Math.floor(left / 60) + ":" + ("0" + left % 60).slice(-2) + " دیگر";
    timer = setInterval(function () {
      left--;
      if (left >= 0) {
        $("resend").textContent = "ارسال مجدد کد تا " + Math.floor(left / 60) + ":" + ("0" + left % 60).slice(-2) + " دیگر";
      } else {
        clearInterval(timer);
        $("resend").innerHTML = '<a href="#" id="resend-link">ارسال مجدد کد</a>';
        $("resend-link").addEventListener("click", function (ev) {
          ev.preventDefault();
          sendOtp();
        });
      }
    }, 1000);
  }

  async function sendOtp() {
    const name = $("final_name").value.trim();
    if (!name) {
      alert("لطفا نام و نام خانوادگی را وارد کنید.");
      return false;
    }
    if (!selectedSlot) {
      alert("لطفا یک زمان برای تماس انتخاب کنید.");
      return false;
    }

    var typed = toEnglishNumbers(phoneInput.value.trim());
    iti.setNumber(typed);
    await new Promise(function (r) { setTimeout(r, 80); });

    var phone = "";
    try {
      if (iti.isValidNumber()) phone = iti.getNumber().replace("+", "");
    } catch (e) {}
    if (!phone) phone = normalizePhone(typed);
    if (!phone) {
      alert("شماره وارد شده معتبر نیست. مثلاً 09121234567 را وارد کنید.");
      return false;
    }
    const slot = bookingText(selectedSlot, selectedTimeLabel);
    finalPackage = {
      form_id: cfg.formId,
      initialData: initialData,
      aiGeneratedParagraph: aiParagraph,
      finalContact: { name: name, phone: phone },
      bookingDetails: { slot: slot }
    };

    try {
      await postJson(cfg.webhooks.otp, {
        form_id: cfg.formId,
        formname: name,
        formnumber: phone,
        booking_slot: slot
      });
      startResendTimer();
      return true;
    } catch (err) {
      alert("خطا در ارسال کد. لطفا دوباره تلاش کنید.");
      return false;
    }
  }

  $("send-otp").addEventListener("click", async function () {
    const btn = $("send-otp");
    btn.disabled = true;
    const ok = await sendOtp();
    btn.disabled = false;
    if (ok) {
      $("subtitle").textContent = "لطفا هویت خود را تایید کنید";
      showSection(otp);
    }
  });

  $("verify-otp").addEventListener("click", async function () {
    const code = toEnglishNumbers($("otp_code").value.trim());
    const error = $("otp-error");
    if (!code || code.length < 5) {
      error.textContent = "لطفا کد ۵ رقمی را وارد کنید.";
      return;
    }
    if (failedAttempts >= 5) {
      error.textContent = "تعداد تلاش‌ها بیش از حد مجاز است. لطفا صفحه را رفرش کنید.";
      return;
    }
    const btn = $("verify-otp");
    btn.disabled = true;
    try {
      const { ok, json } = await postJson(cfg.webhooks.verify, Object.assign({}, finalPackage, { otp_code: code }));
      if (ok && json.status === "success") {
        $("title").textContent = "عملیات موفق";
        $("subtitle").textContent = "از همراهی شما سپاسگزاریم";
        $("ai-text").textContent = aiParagraph;
        $("ai-box").classList.remove("hidden");
        showSection(thanks);
        if (typeof confetti === "function") confetti({ particleCount: 140, spread: 90, origin: { y: 0.6 } });
      } else {
        failedAttempts++;
        error.textContent = failedAttempts >= 5
          ? "تعداد تلاش‌ها بیش از حد مجاز است. لطفا صفحه را رفرش کنید."
          : "کد وارد شده اشتباه است. (" + (5 - failedAttempts) + " تلاش دیگر باقیست)";
        if (failedAttempts >= 5) btn.disabled = true;
      }
    } catch (err) {
      error.textContent = "خطای شبکه. لطفا دوباره تلاش کنید.";
    }
    if (failedAttempts < 5) btn.disabled = false;
  });

  quiz.querySelectorAll('input[name="user_prejob_exist"]').forEach(function (el) {
    el.addEventListener("change", function () {
      $("job-extra").classList.toggle("hidden", this.value !== "سابقه کار دارد");
    });
  });

  $("has-children").addEventListener("change", function () {
    $("children-extra").classList.toggle("hidden", !this.checked);
  });

  $("lang-none").addEventListener("change", function () {
    const off = this.checked;
    $("lang-list").classList.toggle("hidden", off);
    $("lang-none-msg").classList.toggle("hidden", !off);
    if (off) {
      quiz.querySelectorAll("#lang-list input[type=checkbox]").forEach(function (cb) {
        cb.checked = false;
        cb.dispatchEvent(new Event("change"));
      });
    }
  });

  quiz.querySelectorAll("#lang-list input[type=checkbox]").forEach(function (cb) {
    cb.addEventListener("change", function () {
      const box = quiz.querySelector('[data-stars="' + this.dataset.level + '"]');
      if (box) box.classList.toggle("hidden", !this.checked);
      if (this.checked && $("lang-none").checked) {
        $("lang-none").checked = false;
        $("lang-list").classList.remove("hidden");
        $("lang-none-msg").classList.add("hidden");
      }
    });
  });

  quiz.querySelectorAll(".stars").forEach(function (wrap) {
    const name = wrap.dataset.name;
    const hidden = quiz.querySelector('input[name="' + name + '"]');
    wrap.querySelectorAll(".star").forEach(function (star) {
      star.addEventListener("click", function () {
        hidden.value = this.dataset.value;
        wrap.querySelectorAll(".star").forEach(function (s) {
          s.classList.toggle("on", Number(s.dataset.value) <= Number(hidden.value));
          s.textContent = Number(s.dataset.value) <= Number(hidden.value) ? "★" : "☆";
        });
      });
    });
  });

  document.querySelectorAll(".spinner").forEach(function (spin) {
    const vis = spin.querySelector("input");
    const hidden = document.querySelector('input[name="' + spin.dataset.name + '"]');
    const min = Number(spin.dataset.min || 0);
    spin.addEventListener("click", function (e) {
      const dir = e.target.dataset.dir;
      if (!dir) return;
      let value = Number(vis.value);
      if (dir === "i") value++;
      if (dir === "d" && value > min) value--;
      vis.value = value;
      hidden.value = value;
    });
  });

  document.querySelectorAll("[data-age]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const age = this.dataset.age;
      const spin = document.querySelector('.spinner[data-name="user_age"] input');
      spin.value = age;
      quiz.querySelector('input[name="user_age"]').value = age;
    });
  });

  $("add-country").addEventListener("click", function () {
    const row = document.createElement("div");
    row.className = "repeater-row";
    row.innerHTML = '<input type="text" name="user_intent_countries[]" class="persian-only" placeholder="نام کشور بعدی"><button type="button" class="remove">حذف</button>';
    $("countries").appendChild(row);
  });

  $("countries").addEventListener("click", function (e) {
    if (e.target.classList.contains("remove")) e.target.parentElement.remove();
  });

  document.addEventListener("input", function (e) {
    if (!e.target.classList.contains("persian-only")) return;
    if (/[a-zA-Z0-9]/.test(e.target.value)) {
      alert("لطفا فقط از حروف فارسی استفاده کنید.");
      e.target.value = e.target.value.replace(/[a-zA-Z0-9]/g, "");
    }
  });

  $("retest").addEventListener("click", function () { window.location.reload(); });
  $("home").addEventListener("click", function () { window.location.href = cfg.homeUrl; });
  $("share").addEventListener("click", function () {
    if (navigator.share) {
      navigator.share({
        title: "فرم ارزیابی مهاجرت راهکارگشت",
        text: "با پاسخ به چند سؤال، بهترین مسیر مهاجرتت رو پیدا کن!",
        url: window.location.href.split("?")[0]
      }).catch(function () {});
    } else {
      alert("مرورگر شما از قابلیت اشتراک‌گذاری پشتیبانی نمی‌کند.");
    }
  });

  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    $("skip-btn").classList.remove("hidden");
    $("skip-btn").addEventListener("click", function () {
      initialData = collectQuiz();
      aiParagraph = fallbackParagraph(initialData);
      showSection(result);
      generateDays();
    });
  }

  showPage(1);
  window.addEventListener("resize", notifyParentHeight);
  notifyParentHeight();
})();
