// ==========================================
// CONFIGURATION
// ==========================================
// *** นำ URL ของ Web App จาก Google Apps Script มาใส่ตรงนี้ ***
const API_URL = "https://script.google.com/macros/s/AKfycbz7sEhhZBUL9Uc2H4mlBJB7QLwDpK9P9bbucoHZ5qMXzC6X2s3h0aK3Sh-yvTCLSJKO/exec"; 
const KPI_TARGET = 200000;

// Global State
let allData = [];
// ตัวแปรเก็บข้อมูล
let rawData = [];
// ตัวแปรเก็บการตั้งค่า (Settings จากชีต)
window.kpiSettings = [];
// ตัวแปรเก็บข้อมูลพนักงานและเป้าหมาย
window.usersData = [];
// ตัวแปรหมวดหมู่ฟิลเตอร์ปัจจุบัน
let currentCategoryFilter = null;

// ==========================================
// DOM ELEMENTS
// ==========================================
const els = {
    status: document.getElementById('loading-status'),
    employeeSelect: document.getElementById('employee-select'),
    startDate: document.getElementById('start-date'),
    endDate: document.getElementById('end-date'),
    btnFilter: document.getElementById('btn-filter'),
    btnReset: document.getElementById('btn-reset'),
    
    // KPI Overview
    kpiPercentage: document.getElementById('kpi-percentage-text'),
    kpiTotalAmount: document.getElementById('kpi-total-amount'),
    kpiProgressBar: document.getElementById('kpi-progress-bar'),
    
    // Summary ACC
    sumAccKpshop: document.getElementById('sum-acc-kpshop'),
    sumAccBanana: document.getElementById('sum-acc-banana'),
    kpiAccTotal: document.getElementById('kpi-acc-total'),
    
    // Summary Phone 1 & Trade-in
    sumAndroid1Normal: document.getElementById('sum-android1-normal'),
    sumAndroid1Kfin: document.getElementById('sum-android1-kfin'),
    sumIos1Normal: document.getElementById('sum-ios1-normal'),
    sumIos1Kfin: document.getElementById('sum-ios1-kfin'),
    sumTradein: document.getElementById('sum-tradein'),
    kpiPhone1Total: document.getElementById('kpi-phone1-total'),
    
    // Summary Phone 2
    sumAndroid2Normal: document.getElementById('sum-android2-normal'),
    sumAndroid2Kfin: document.getElementById('sum-android2-kfin'),
    sumIos2Normal: document.getElementById('sum-ios2-normal'),
    sumIos2Kfin: document.getElementById('sum-ios2-kfin'),
    kpiPhone2Total: document.getElementById('kpi-phone2-total'),
    
    // Table
    recordCount: document.getElementById('record-count'),
    tableBody: document.getElementById('sales-table-body'),
};

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    try {
        if (API_URL === "YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL") {
            showError("กรุณาใส่ URL ของ Google Apps Script ในไฟล์ script.js");
            // ใช้ข้อมูลจำลองชั่วคราวเพื่อให้เห็นภาพ
            allData = generateMockData();
            setTimeout(() => {
                processLoadedData();
            }, 1000);
            return;
        }

        const response = await fetch(API_URL);
        if (!response.ok) throw new Error("ไม่สามารถดาวน์โหลดข้อมูลได้");
        
        const result = await response.json();
        console.log('API Response:', result);
        if (result && result.status === 'success') {
            rawData = result.data;
            // เซฟการตั้งค่าไว้
            if (result.settings && result.settings.length > 0) {
                window.kpiSettings = result.settings;
            }
            if (result.users && result.users.length > 0) {
                window.usersData = result.users;
            }
            processLoadedData();
        } else {
            throw new Error(result.message || "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์");
        }
    } catch (error) {
        showError("เกิดข้อผิดพลาด: " + error.message);
        console.error("Fetch Data Error:", error);
    }
}

function processLoadedData() {
    // 1. กรองข้อมูลที่ชำระด้วย 'บัตรเครดิต' ออก (ไม่นับยอดตามแผน)
    allData = rawData.filter(item => {
        const paymentType = (item.saleType || "").toString().trim();
        return !paymentType.includes("บัตรเครดิต");
    });

    // 2. Populate Dropdown พนักงาน
    populateEmployees();

    // 3. เริ่มคำนวณข้อมูลทั้งหมดครั้งแรก
    filteredData = [...allData];
    updateDashboard();

    // 4. แสดงสถานะว่าโหลดสำเร็จ
    showSuccess(`โหลดข้อมูลสำเร็จ (${allData.length} รายการ)`);

    // 5. ผูก Event Listeners
    els.btnFilter.addEventListener('click', handleFilter);
    els.btnReset.addEventListener('click', handleReset);
}

// ==========================================
// FILTERING LOGIC
// ==========================================
function populateEmployees() {
    const employees = new Set();
    
    // ดึงรายชื่อพนักงานจาก usersData เป็นหลัก
    if (window.usersData && window.usersData.length > 0) {
        window.usersData.forEach(u => {
            if (u.name) employees.add(u.name);
        });
    }
    
    // ดึงจากข้อมูลจริงด้วยเผื่อตกหล่น
    allData.forEach(item => {
        if (item.employee) employees.add(item.employee);
    });

    const sortedEmps = Array.from(employees).sort();
    
    // Clear existing options except the first one
    els.employeeSelect.innerHTML = '<option value="all">-- พนักงานทั้งหมด --</option>';
    
    sortedEmps.forEach(emp => {
        const opt = document.createElement('option');
        opt.value = opt.textContent = emp;
        els.employeeSelect.appendChild(opt);
    });
}

function handleFilter(categoryFilter = null) {
    const emp = els.employeeSelect.value;
    const startStr = els.startDate.value;
    const endStr = els.endDate.value;
    
    if (categoryFilter && typeof categoryFilter === "string") {
        currentCategoryFilter = categoryFilter;
    } else if (categoryFilter && categoryFilter.type) {
        // เป็น Event ไม่ใช่ String ให้รักษาค่าเดิมของ currentCategoryFilter ไว้
    } else {
        currentCategoryFilter = null;
    }
    
    // ตั้งค่าเวลาเริ่มต้นให้เป็น 00:00:00 ของวันนั้นๆ โดยใช้ Local Time
    let startTimestamp = 0;
    if (startStr) {
        const d = new Date(startStr);
        d.setHours(0, 0, 0, 0);
        startTimestamp = d.getTime();
    }
    
    // เพิ่มเวลาเป็น 23:59:59 ของวันสิ้นสุด
    let endTimestamp = Infinity;
    if (endStr) {
        const d = new Date(endStr);
        d.setHours(23, 59, 59, 999);
        endTimestamp = d.getTime();
    }

    filteredData = allData.filter(item => {
        // กรองพนักงาน
        if (emp !== 'all' && item.employee !== emp) return false;
        
        // กรองวันที่
        // รับมือกับวันที่ที่ส่งมาจาก Google Sheet (ISO string)
        let itemTime = new Date(item.date).getTime();
        
        if (isNaN(itemTime)) return true; // ถ้าวันที่พัง ปล่อยผ่าน
        if (itemTime < startTimestamp || itemTime > endTimestamp) return false;

        // ถ้ามีการกด Card เพื่อ Filter หมวดหมู่
        if (currentCategoryFilter) {
            const kpiResult = calculateItemKPI(item);
            
            if (currentCategoryFilter === "ACC") {
                if (!kpiResult.summaryName.includes("ACC")) return false;
            } else if (currentCategoryFilter === "Phone2") {
                if (!(kpiResult.summaryName.includes("มือ 2") || kpiResult.summaryName.includes("มือ2"))) return false;
            } else if (currentCategoryFilter === "Phone1") {
                // Phone 1 คือสิ่งที่ไม่ใช่ ACC และ ไม่ใช่ มือ 2
                if (kpiResult.summaryName.includes("ACC") || kpiResult.summaryName.includes("มือ 2") || kpiResult.summaryName.includes("มือ2")) return false;
            }
        }

        return true;
    });

    updateDashboard();
}

function handleReset() {
    els.employeeSelect.value = 'all';
    els.startDate.value = '';
    els.endDate.value = '';
    currentCategoryFilter = null;
    filteredData = [...allData];
    updateDashboard();
}

// ==========================================
// KPI CALCULATION LOGIC
// ==========================================
// คืนค่ายอดเงินที่ได้จากเงื่อนไข
function calculateItemKPI(item) {
    let category = (item.category || "").trim();
    const sheet = item.sheetName;
    const b = (item.brand || "").trim().toLowerCase();
    const modelLower = (item.model || "").trim().toLowerCase();
    const type = (item.saleType || "").trim();

    // 1. ระบบจัดประเภทให้อัตโนมัติ (Auto-detect)
    if (category.includes("แลกเงิน") || type.includes("แลกเงิน")) {
        category = "iPhone แลกเงิน";
    } 
    else if (sheet === "ACC") {
        if (modelLower.includes("(bnn)")) {
            category = "ACC Banana";
        } else {
            category = "ACC Kpshop";
        }
    }
    else if (sheet === "Phone1") {
        if (b.includes("apple") || b.includes("ไอโฟน") || b.includes("iphone") || b.includes("ipad")) {
            category = "iPhone / iPad มือ1";
        } else if (b !== "") {
            category = "Android มือ1";
        }
    } 
    else if (sheet === "Phone2") {
        if (b.includes("apple") || b.includes("ไอโฟน") || b.includes("iphone") || b.includes("ipad")) {
            category = "iPhone / iPad มือ2";
        } else if (b !== "") {
            category = "Android มือ2";
        }
    }
    
    // เซฟเก็บไว้โชว์ในตาราง ว่าระบบจัดมันไปอยู่ในหมวดไหน
    item.computedCategory = category;

    const saleType = type.toLowerCase();
    const price = Number(item.price) || 0;
    const financeAmt = Number(item.financeAmount) || 0;

    let kpiValue = 0;
    let ruleName = "ไม่ระบุเงื่อนไข";
    let summaryName = "อื่นๆ";

    // 2. ค้นหาเงื่อนไขใน Settings แบบ Dynamic
    if (window.kpiSettings && window.kpiSettings.length > 0) {
        // เช็คเงื่อนไขยกเว้นทั้งหมดก่อน (เช่น บัตรเครดิต) โดยดูจากทุกประเภท
        const rejectRule = window.kpiSettings.find(s => s.category === "ทุกประเภท" && parseKeywords(s.saleKeywords).some(k => saleType.includes(k)));
        if (rejectRule) {
            return { value: 0, rule: rejectRule.calculateBy, summaryName: "" };
        }

        // หากฎที่ตรงกับประเภทสินค้า (รองรับมือ1-2 ด้วย)
        const matchedRules = window.kpiSettings.filter(s => {
            const sCatLower = s.category.toLowerCase().replace(/\s+/g, '');
            const iCatLower = item.computedCategory.toLowerCase().replace(/\s+/g, '');
            
            // ตรวจสอบความเท่ากันเป๊ะๆ (เช่น 'Android มือ1' vs 'Androidมือ1')
            if (sCatLower === iCatLower) return true;
            
            // ถ้าระบุว่า iPhone / iPad มือ1-2 ให้ครอบคลุมทั้งมือ 1 และมือ 2
            if (sCatLower.includes("มือ1") && sCatLower.includes("มือ2")) {
                if (iCatLower.includes("iphone") || iCatLower.includes("ipad")) {
                    return true;
                }
            }
            
            return false;
        });
        
        let activeRule = null;
        for (const rule of matchedRules) {
            let keywords = parseKeywords(rule.saleKeywords);
            // ตรวจสอบว่า "รูปแบบการขาย" ตรงกันไหม (รองรับทุกแบบ และตรวจสอบแบบ case-insensitive และลบพื้นที่ว่าง)
            const cleanSaleType = saleType.replace(/\s+/g, '');
            if (keywords.includes("ทุกแบบ") || keywords.includes("ทุกรูปแบบ") || keywords.includes("ทุกประเภท") || keywords.some(k => cleanSaleType.includes(k.replace(/\s+/g, '')))) {
                activeRule = rule;
                break;
            }
        }

        if (activeRule) {
            ruleName = activeRule.calculateBy;
            summaryName = activeRule.summaryName;
            
            if (ruleName.includes("ไม่นับยอด") || ruleName.includes("❌")) {
                return { value: 0, rule: ruleName, summaryName: "" };
            }

            // สกัดเปอร์เซ็นต์
            let percentMatch = ruleName.match(/(\d+)%/);
            let percent = percentMatch ? Number(percentMatch[1]) : 0;
            
            // หายอดฐาน
            let baseValue = 0;
            if (ruleName.includes("ยอดจัด")) {
                baseValue = financeAmt;
            } else if (ruleName.includes("ยอดขาย") || ruleName.includes("ราคาขาย") || ruleName.includes("ราคาเครื่อง") || ruleName.includes("ยอดที่แลก")) {
                baseValue = price; 
            }
            
            kpiValue = baseValue * (percent / 100);
            return { value: kpiValue, rule: ruleName, summaryName: summaryName, percent: percent };
        }
    }

    // ถ้าไม่เจอ Rule ให้แสดง 0 (รอกำหนดในตั้งค่า)
    return { value: 0, rule: "ไม่มีการตั้งค่าสำหรับรายการนี้", summaryName: "อื่นๆ", percent: 0 };
}

// Helper ตัดคีย์เวิร์ดด้วย , หรือ /
function parseKeywords(text) {
    if (!text) return [];
    return text.toLowerCase().split(/[,\/]/).map(s => s.trim()).filter(s => s.length > 0);
}

function updateDashboard() {
    // รีเซ็ตตัวแปรผลลัพธ์ (Dynamic Object)
    const summaryData = {};
    let totalKPIValue = 0;
    
    // เคลียร์ตาราง
    els.tableBody.innerHTML = '';
    
    // จัดกลุ่มตามวันที่ จากใหม่ไปเก่า
    const sortedData = [...filteredData].sort((a,b) => new Date(b.date) - new Date(a.date));

    if (sortedData.length === 0) {
        els.tableBody.innerHTML = '<tr><td colspan="10" class="text-center empty-state">ไม่มีข้อมูลในเงื่อนไขที่คุณเลือก</td></tr>';
    }

    sortedData.forEach(item => {
        const kpiResult = calculateItemKPI(item);
        const val = kpiResult.value;
        const sumName = kpiResult.summaryName;
        
        totalKPIValue += val;

        // บันทึกลง summaryData (แบบ Dynamic)
        if (sumName && sumName !== "อื่นๆ" && sumName !== "ไม่ระบุเงื่อนไข" && sumName !== "") {
            if (!summaryData[sumName]) summaryData[sumName] = 0;
            summaryData[sumName] += val;
        }

        // วาดลงตาราง
        renderTableRow(item, kpiResult);
    });

    // Update Totals on Screen
    updateSummaryDOM(summaryData, totalKPIValue);

    // อัปเดตการจัดอันดับพนักงานแยกสาขา
    updateRankings();
}

function updateSummaryDOM(summaryData, total) {
    // Format Money
    const f = (num) => "฿" + (Number(num)||0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    
    // Container Elements
    const accContainer = document.getElementById('acc-summary-container');
    const phone1Container = document.getElementById('phone1-summary-container');
    const phone2Container = document.getElementById('phone2-summary-container');
    
    if (accContainer) accContainer.innerHTML = '';
    if (phone1Container) phone1Container.innerHTML = '';
    if (phone2Container) phone2Container.innerHTML = '';

    let totalACC = 0;
    let totalPhone1 = 0;
    let totalPhone2 = 0;

    // วาดรายการสรุปจำแนกหมวดหมู่อัตโนมัติ
    for (const [name, val] of Object.entries(summaryData)) {
        if (val === 0) continue; // ถ้าค่านั้นเป็น 0 ไม่ต้องแสดงบรรทัดนี้

        const rowHTML = `
            <div class="stat-row">
                <span>${name}</span>
                <span class="stat-value">${f(val)}</span>
            </div>
        `;

        // แบ่งส่วนหน้าจอตามคำในชื่อ (สามารถปรับ logic ได้ถ้าชื่อเปลี่ยนไป)
        if (name.includes("ACC")) {
            if (accContainer) { accContainer.innerHTML += rowHTML; totalACC += val; }
        } else if (name.includes("มือ 2") || name.includes("มือ2")) {
            if (phone2Container) { phone2Container.innerHTML += rowHTML; totalPhone2 += val; }
        } else {
            // ถือว่าเป็นมือ 1 หรือ แลกเงิน
            if (phone1Container) { phone1Container.innerHTML += rowHTML; totalPhone1 += val; }
        }
    }

    // Set DOM Cards Total
    if (els.kpiAccTotal) els.kpiAccTotal.innerText = f(totalACC);
    if (els.kpiPhone1Total) els.kpiPhone1Total.innerText = f(totalPhone1);
    if (els.kpiPhone2Total) els.kpiPhone2Total.innerText = f(totalPhone2);

    // หาเป้าหมายที่แท้จริงจากพนักงานที่เลือก
    const emp = els.employeeSelect.value;
    let currentTarget = 0;
    if (emp === 'all') {
        // รวมเป้าหมายของทุกคน
        currentTarget = window.usersData.reduce((sum, u) => sum + u.target, 0) || KPI_TARGET;
    } else {
        const user = window.usersData.find(u => u.name === emp);
        currentTarget = user ? user.target : KPI_TARGET;
    }

    const targetElement = document.getElementById('kpi-target-amount');
    if (targetElement) targetElement.innerText = f(currentTarget);

    // Set KPI Progress
    const actualPercent = (total / currentTarget) * 100;
    const percent = Math.min(actualPercent, 100);
    els.kpiPercentage.innerText = actualPercent.toFixed(2) + "%";
    els.kpiTotalAmount.innerText = f(total);
    els.kpiProgressBar.style.width = percent + "%";
    
    // คำนวณดาว
    let stars = 0;
    if (actualPercent >= 200) stars = 5;
    else if (actualPercent >= 150) stars = 3;
    else if (actualPercent >= 100) stars = 2;
    else if (actualPercent >= 50) stars = 1;

    let starsHtml = '';
    for (let i = 0; i < stars; i++) {
        starsHtml += '<i class="fa-solid fa-star" style="color: #f1c40f; margin-left: 5px; text-shadow: 0 0 5px rgba(241,196,15,0.5);"></i>';
    }
    for (let i = stars; i < 5; i++) {
        starsHtml += '<i class="fa-regular fa-star" style="color: #ccc; margin-left: 5px;"></i>';
    }
    
    const kpiStars = document.getElementById('kpi-stars');
    if (kpiStars) kpiStars.innerHTML = starsHtml;

    // Set colors based on achievement
    if (actualPercent >= 100) {
        els.kpiProgressBar.style.background = "linear-gradient(90deg, #2ecc71, #27ae60)";
        els.kpiPercentage.style.color = "#27ae60";
    } else if (actualPercent >= 50) {
        els.kpiProgressBar.style.background = "linear-gradient(90deg, #f39c12, #e67e22)";
        els.kpiPercentage.style.color = "#e67e22";
    } else {
        els.kpiProgressBar.style.background = "linear-gradient(90deg, #4a6ee0, #9b59b6)";
        els.kpiPercentage.style.color = "var(--primary-color)";
    }

    els.recordCount.innerText = filteredData.length;
}

function renderTableRow(item, kpiResult) {
    const f = (num) => "฿" + (Number(num)||0).toLocaleString('th-TH');
    const d = new Date(item.date).toLocaleDateString('th-TH');
    
    const brandModel = (item.brand || item.model) ? `${item.brand || ''} ${item.model || ''}`.trim() : '-';

    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td>${d}</td>
        <td>${item.employee}</td>
        <td>${item.sheetName}</td>
        <td>${brandModel}</td>
        <td>${item.saleType}</td>
        <td class="text-right">${item.price ? f(item.price) : '-'}</td>
        <td class="text-right" style="color:#7f8c8d;">${item.downPayment && item.downPayment > 0 ? f(item.downPayment) : '-'}</td>
        <td class="text-right">${item.financeAmount ? f(item.financeAmount) : '-'}</td>
        <td class="text-center" style="color:#27ae60;">${kpiResult.percent > 0 ? kpiResult.percent + '%' : '-'}</td>
        <td class="text-right" style="font-weight:bold; color:var(--primary-color);" title="เงื่อนไข: ${kpiResult.rule}">
            ${f(kpiResult.value)}
        </td>
    `;
    els.tableBody.appendChild(tr);
}

// ==========================================
// UTILS & MOCK DATA (สำหรับทดสอบ)
// ==========================================
function showSuccess(msg) {
    els.status.className = "status-badge success";
    els.status.innerHTML = `<i class="fa-solid fa-check"></i> ${msg}`;
}

function showError(msg) {
    els.status.className = "status-badge error";
    els.status.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${msg}`;
}

function generateMockData() {
    window.kpiSettings = [
        { category: "ACC Kpshop", saleKeywords: "ทุกแบบ", calculateBy: "100% ของยอดขาย", summaryName: "ACC Kpshop (100% ยอดขาย)" },
        { category: "ACC Banana", saleKeywords: "ทุกแบบ", calculateBy: "20% ของราคาขาย", summaryName: "ACC Banana (20% ของราคาขาย)" },
        { category: "Android มือ1", saleKeywords: "ขายสด, ผ่อน SF+, ผ่อน Shopee", calculateBy: "10% ของราคาขาย", summaryName: "Android มือ 1 (สด/SF/Shopee 10%)" },
        { category: "Android มือ1", saleKeywords: "ผ่อน Kfinance, สินเชื่อ IT4, Samsung Finance, Ascend nano", calculateBy: "100% ของยอดจัด", summaryName: "Android มือ 1 (Kfinance/สินเชื่อ 100% ยอดจัด)" },
        { category: "Android มือ2", saleKeywords: "ขายสด", calculateBy: "20% ของราคาขาย", summaryName: "Android มือ 2 (สด 20%)" },
        { category: "Android มือ2", saleKeywords: "ผ่อน Kfinance, สินเชื่อ IT4, Samsung Finance", calculateBy: "100% ของยอดจัด", summaryName: "Android มือ 2 (Finance 100% ยอดจัด)" },
        { category: "iPhone / iPad มือ1", saleKeywords: "ขายสด", calculateBy: "5% ของยอดขาย", summaryName: "iPhone/iPad มือ 1 (สด 5%)" },
        { category: "iPhone / iPad มือ2", saleKeywords: "ขายสด, ผ่อนLM+, Vplus", calculateBy: "30% ของราคาขาย", summaryName: "iPhone/iPad มือ 2 (สด/LM+/Vplus 30%)" },
        { category: "iPhone / iPad มือ1-2", saleKeywords: "ผ่อน Kfinance", calculateBy: "100% ของยอดจัด", summaryName: "iPhone/iPad มือ 1-2 (Kfinance 100% ยอดจัด)" },
        { category: "iPhone แลกเงิน", saleKeywords: "iPhone แลกเงิน, ทุกแบบ", calculateBy: "100% ของยอดที่แลก", summaryName: "iPhone แลกเงิน (100% ยอดที่แลก)" },
        { category: "ทุกประเภท", saleKeywords: "บัตรเครดิต", calculateBy: "❌ ไม่นับยอด", summaryName: "" }
    ];

    window.usersData = [
        { name: "สมหญิง", branch: "สาขาจอหอ", target: 50000 },
        { name: "สมชาย", branch: "สาขาโคกสวาย", target: 80000 },
        { name: "สมเกียรติ", branch: "สาขาจอหอ", target: 60000 },
        { name: "สมฤดี", branch: "สาขาโคกสวาย", target: 70000 }
    ];

    return [
        { date: "2026-03-01T10:00:00", employee: "สมหญิง", sheetName: "ACC", brand: "Hoco", model: "หูฟัง Bluetooth", category: "", saleType: "ขายสด", price: 1500, downPayment: "", financeAmount: "" },
        { date: "2026-03-02T11:00:00", employee: "สมหญิง", sheetName: "ACC", brand: "Ugreen", model: "สายชาร์จ (BNN)", category: "", saleType: "ขายสด", price: 2000, downPayment: "", financeAmount: "" },
        { date: "2026-03-03T12:00:00", employee: "สมชาย", sheetName: "Phone1", brand: "Samsung", model: "S24 Ultra", category: "", saleType: "สินเชื่อ IT4", price: 45000, downPayment: 10000, financeAmount: 35000 },
        { date: "2026-03-04T14:00:00", employee: "สมหญิง", sheetName: "Phone1", brand: "Apple", model: "iPhone 15 Pro", category: "", saleType: "ขายสด", price: 35000, downPayment: "", financeAmount: "" },
        { date: "2026-03-05T15:00:00", employee: "สมชาย", sheetName: "Phone1", brand: "Apple", model: "iPhone 13", category: "iPhone แลกเงิน", saleType: "iPhone แลกเงิน", price: 18000, downPayment: "", financeAmount: "" },
        { date: "2026-03-06T16:00:00", employee: "สมชาย", sheetName: "Phone2", brand: "Apple", model: "iPad Air 5", category: "", saleType: "ผ่อนLM+", price: 15000, downPayment: "", financeAmount: "" },
        // บัตรเครดิต (ไม่ถูกนับ)
        { date: "2026-03-07T16:00:00", employee: "สมหญิง", sheetName: "Phone2", brand: "Oppo", model: "Reno 11", category: "", saleType: "บัตรเครดิต", price: 9000, downPayment: "", financeAmount: "" },
        // ข้อมูลเพิ่มเติมพนักงานสาขาอื่นๆ
        { date: "2026-03-02T12:00:00", employee: "สมเกียรติ", sheetName: "Phone1", brand: "Apple", model: "iPhone 15", category: "", saleType: "ผ่อน Kfinance", price: 32000, downPayment: 2000, financeAmount: 30000 },
        { date: "2026-03-03T10:00:00", employee: "สมฤดี", sheetName: "Phone1", brand: "Vivo", model: "V30", category: "", saleType: "ผ่อน Kfinance", price: 12000, downPayment: 0, financeAmount: 12000 }
    ];
}

function updateRankings() {
    const rankingContainer = document.getElementById('ranking-container');
    if (!rankingContainer) return;

    rankingContainer.innerHTML = '';

    // 1. ดึงเงื่อนไขวันที่
    const startStr = els.startDate.value;
    const endStr = els.endDate.value;
    
    let startTimestamp = 0;
    if (startStr) {
        const d = new Date(startStr);
        d.setHours(0, 0, 0, 0);
        startTimestamp = d.getTime();
    }
    
    let endTimestamp = Infinity;
    if (endStr) {
        const d = new Date(endStr);
        d.setHours(23, 59, 59, 999);
        endTimestamp = d.getTime();
    }

    // 2. กรองข้อมูลเฉพาะวันที่และหมวดหมู่ (แต่ไม่กรองพนักงาน)
    const dataForRanking = allData.filter(item => {
        // กรองวันที่
        let itemTime = new Date(item.date).getTime();
        if (isNaN(itemTime)) return true;
        if (itemTime < startTimestamp || itemTime > endTimestamp) return false;

        // กรองหมวดหมู่ (ถ้ามี)
        if (currentCategoryFilter) {
            const kpiResult = calculateItemKPI(item);
            if (currentCategoryFilter === "ACC") {
                if (!kpiResult.summaryName.includes("ACC")) return false;
            } else if (currentCategoryFilter === "Phone2") {
                if (!(kpiResult.summaryName.includes("มือ 2") || kpiResult.summaryName.includes("มือ2"))) return false;
            } else if (currentCategoryFilter === "Phone1") {
                if (kpiResult.summaryName.includes("ACC") || kpiResult.summaryName.includes("มือ 2") || kpiResult.summaryName.includes("มือ2")) return false;
            }
        }
        return true;
    });

    // 3. คำนวณหายอดรวม KPI ของพนักงานแต่ละคน
    const employeeKpis = {};
    
    // ตั้งค่าเริ่มต้นยอดของทุกคนใน usersData ให้เป็น 0
    if (window.usersData && window.usersData.length > 0) {
        window.usersData.forEach(u => {
            employeeKpis[u.name] = 0;
        });
    }

    // รวมยอดจากข้อมูลยอดขาย
    dataForRanking.forEach(item => {
        if (item.employee) {
            // หากไม่มีพนักงานนี้ใน usersData ให้ตั้งค่าเริ่มต้น
            if (employeeKpis[item.employee] === undefined) {
                employeeKpis[item.employee] = 0;
            }
            const kpiResult = calculateItemKPI(item);
            employeeKpis[item.employee] += kpiResult.value;
        }
    });

    // 4. จัดกลุ่มพนักงานตามสาขา
    const branchGroups = {};
    const selectedEmp = els.employeeSelect.value;

    if (window.usersData && window.usersData.length > 0) {
        window.usersData.forEach(u => {
            const branchName = u.branch || "ไม่ระบุสาขา";
            if (!branchGroups[branchName]) {
                branchGroups[branchName] = [];
            }
            
            const kpiValue = employeeKpis[u.name] || 0;
            branchGroups[branchName].push({
                name: u.name,
                target: u.target || KPI_TARGET,
                kpi: kpiValue,
                percent: u.target > 0 ? (kpiValue / u.target) * 100 : 0
            });
        });
    } else {
        // ถ้าไม่มีข้อมูลผู้ใช้เลย (เช่น หน้าเว็บพัง) ให้เอาเฉพาะที่มีจากยอดขาย
        const defaultBranch = "ไม่ระบุสาขา";
        branchGroups[defaultBranch] = [];
        for (const [name, kpiValue] of Object.entries(employeeKpis)) {
            branchGroups[defaultBranch].push({
                name: name,
                target: KPI_TARGET,
                kpi: kpiValue,
                percent: (kpiValue / KPI_TARGET) * 100
            });
        }
    }

    // 5. วาดแต่ละสาขาลงใน HTML
    const sortedBranches = Object.keys(branchGroups).sort();
    
    if (sortedBranches.length === 0) {
        rankingContainer.innerHTML = '<div class="text-center empty-state" style="width: 100%;">ไม่มีข้อมูลจัดอันดับ</div>';
        return;
    }

    sortedBranches.forEach(branchName => {
        const members = branchGroups[branchName];
        
        // เรียงลำดับสมาชิกในแต่ละสาขาตามยอด KPI จากมากไปน้อย
        members.sort((a, b) => b.kpi - a.kpi);

        // สร้างบอร์ดการ์ดสำหรับสาขานี้
        const card = document.createElement('div');
        card.className = 'ranking-card';
        
        // หัวข้อการ์ด
        card.innerHTML = `
            <div class="ranking-card-header">
                <i class="fa-solid fa-store"></i>
                <span>${branchName}</span>
            </div>
            <div class="ranking-list"></div>
        `;
        
        const listContainer = card.querySelector('.ranking-list');

        members.forEach((member, index) => {
            const rank = index + 1;
            let rankClass = 'rank-other';
            let rankBadgeContent = rank;

            // กำหนดไอคอนเหรียญรางวัล
            if (rank === 1) {
                rankClass = 'rank-1';
                rankBadgeContent = '<i class="fa-solid fa-trophy"></i>';
            } else if (rank === 2) {
                rankClass = 'rank-2';
                rankBadgeContent = '<i class="fa-solid fa-medal"></i>';
            } else if (rank === 3) {
                rankClass = 'rank-3';
                rankBadgeContent = '<i class="fa-solid fa-award"></i>';
            }

            // จัดรูปแบบจำนวนเงิน
            const f = (num) => "฿" + (Number(num)||0).toLocaleString('th-TH');
            const percentWidth = Math.min(member.percent, 100);
            
            // เลือกสีหลอดตามผลงาน
            let progressBg = "var(--primary-color)";
            if (member.percent >= 100) progressBg = "var(--success-color)";
            else if (member.percent >= 50) progressBg = "var(--warning-color)";

            // ตรวจสอบว่าพนักงานคนนี้โดนไฮไลท์อยู่หรือไม่
            const isHighlighted = (selectedEmp !== 'all' && selectedEmp === member.name);
            const highlightedClass = isHighlighted ? 'highlighted' : '';

            const itemHTML = `
                <div class="ranking-item ${highlightedClass}" title="เป้าหมาย: ${f(member.target)}">
                    <div class="rank-badge ${rankClass}">${rankBadgeContent}</div>
                    <div class="ranking-info">
                        <div class="ranking-name-row">
                            <span class="ranking-name">${member.name}</span>
                            <span class="ranking-value">${f(member.kpi)}</span>
                        </div>
                        <div class="ranking-progress-container">
                            <div class="ranking-progress-bg">
                                <div class="ranking-progress-fill" style="width: ${percentWidth}%; background-color: ${progressBg};"></div>
                            </div>
                            <div class="ranking-meta">
                                <span>ความคืบหน้า</span>
                                <span>${member.percent.toFixed(1)}%</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            listContainer.innerHTML += itemHTML;
        });

        rankingContainer.appendChild(card);
    });
}
