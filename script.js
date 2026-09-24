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
// ตัวแปรเก็บข้อมูลงานซ่อม
window.repairsRawData = [];
let rawRepairs = [];
let filteredRepairs = [];
let selectedRepairBrand = 'all';
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
            rawData = result.data || [];
            window.buybackRawData = result.buyback || [];
            window.repairsRawData = (result.repairs && result.repairs.length > 0) ? result.repairs : generateMockRepairData();
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

    // 2.5 ผูก Event ปุ่มเลือกแบรนด์
    initBrandFilterEvents();

    // 3. เริ่มคำนวณข้อมูลทั้งหมดครั้งแรก
    filteredData = [...allData];
    updateDashboard();

    // 4. แสดงสถานะว่าโหลดสำเร็จ
    showSuccess(`โหลดข้อมูลสำเร็จ (${allData.length} รายการขาย, ${(window.repairsRawData || []).length} รายการงานซ่อม)`);

    // 5. ผูก Event Listeners
    els.btnFilter.addEventListener('click', handleFilter);
    els.btnReset.addEventListener('click', handleReset);

    // 6. เริ่มต้นระบบงานซ่อมช่าง
    initRepairModule();
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
    selectedBrandFilter = 'all';
    document.querySelectorAll('.btn-brand').forEach(btn => {
        if (btn.getAttribute('data-brand') === 'all') btn.classList.add('active');
        else btn.classList.remove('active');
    });
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

    // อัปเดตตารางสรุปยอดตามรูปแบบการขายและรายเดือน
    renderMonthlyBreakdown();
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

// ==========================================
// MONTHLY SALES & BUYBACK BREAKDOWN LOGIC
// ==========================================
let selectedBrandFilter = 'all';
window.buybackRawData = [];

function initBrandFilterEvents() {
    const brandBtns = document.querySelectorAll('.btn-brand');
    brandBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            brandBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedBrandFilter = btn.getAttribute('data-brand');
            renderMonthlyBreakdown();
        });
    });
}

function renderMonthlyBreakdown() {
    const thead = document.getElementById('monthly-breakdown-thead');
    const tbody = document.getElementById('monthly-breakdown-tbody');
    const tfoot = document.getElementById('monthly-breakdown-tfoot');
    
    if (!thead || !tbody) return;

    const emp = els.employeeSelect.value;
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

    // Helper check Brand
    // Rule: "โดยจะอ้างอิงจากคอลั้ม C ถ้าเท่ากับ Apple คือ Apple ถ้าไม่ใช่ คือ Android ทั้งหมด"
    const isMatchBrand = (brandOrCat) => {
        const str = (brandOrCat || "").toString().trim().toLowerCase();
        const isApple = (str === "apple");
        if (selectedBrandFilter === 'apple') return isApple;
        if (selectedBrandFilter === 'android') return !isApple;
        return true;
    };

    // Filter Sales Data (Exclude ACC per user feedback: "Acc ไม่ต้อง")
    const filteredSales = allData.filter(item => {
        if (item.sheetName === "ACC") return false;
        if (emp !== 'all' && item.employee !== emp) return false;
        
        let itemTime = new Date(item.date).getTime();
        if (!isNaN(itemTime)) {
            if (itemTime < startTimestamp || itemTime > endTimestamp) return false;
        }
        
        // Col C check (category or brand)
        const brandOrCat = item.category || item.brand;
        if (!isMatchBrand(brandOrCat)) return false;

        return true;
    });

    // Filter Buyback Data
    const filteredBuyback = (window.buybackRawData || []).filter(item => {
        if (emp !== 'all' && item.employee !== emp) return false;
        
        let itemTime = new Date(item.date).getTime();
        if (!isNaN(itemTime)) {
            if (itemTime < startTimestamp || itemTime > endTimestamp) return false;
        }

        const brandOrCat = item.brand || item.category;
        if (!isMatchBrand(brandOrCat)) return false;

        return true;
    });

    // Collect all unique YYYY-MM
    const monthSet = new Set();
    const getMonthKey = (dateVal) => {
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return null;
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${yyyy}-${mm}`;
    };

    filteredSales.forEach(item => {
        const m = getMonthKey(item.date);
        if (m) monthSet.add(m);
    });

    filteredBuyback.forEach(item => {
        const m = getMonthKey(item.date);
        if (m) monthSet.add(m);
    });

    const months = Array.from(monthSet).sort();

    const monthNamesThai = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const formatMonthHeader = (yyyyMM) => {
        const [y, m] = yyyyMM.split('-');
        const monthIdx = parseInt(m, 10) - 1;
        return `${monthNamesThai[monthIdx]} ${y}`;
    };

    // 7 Categories
    const categories = [
        "1. ขายส่ง",
        "2. ขายสด มือ1",
        "3. ขายสด มือ2",
        "4. ขายสินเชื่อ Kfinance",
        "5. ขายสินเชื่อ IT4",
        "6. ทำสินเชื่อ iPhone แลกเงิน",
        "7. การรับซื้อเครื่อง"
    ];

    // Data Matrix: matrix[catIdx][mKey] = { count: 0, amount: 0 }
    const matrix = Array.from({ length: 7 }, () => ({}));
    categories.forEach((_, catIdx) => {
        months.forEach(m => {
            matrix[catIdx][m] = { count: 0, amount: 0 };
        });
    });

    // Helper classify sales item
    const getSalesCatIndex = (item) => {
        const st = (item.saleType || "").trim();
        const stLower = st.toLowerCase();
        const cat = (item.category || "").trim();
        const sheet = (item.sheetName || "").trim();

        if (st.includes("ส่งร้านพาร์ทเนอร์")) return 0;
        if (st.includes("แลกเงิน") || cat.includes("แลกเงิน")) return 5;
        if (stLower.includes("kfinance") || stLower.includes("k-finance")) return 3;
        if (stLower.includes("it4")) return 4;
        if (st.includes("ขายสด")) {
            if (sheet === "Phone2" || cat.includes("มือ2") || cat.includes("มือ 2")) {
                return 2;
            } else {
                return 1;
            }
        }
        if (sheet === "Phone2" || cat.includes("มือ2") || cat.includes("มือ 2")) return 2;
        return 1;
    };

    // Populate Sales Data
    filteredSales.forEach(item => {
        const m = getMonthKey(item.date);
        if (!m || !months.includes(m)) return;

        const catIdx = getSalesCatIndex(item);
        const amt = (item.financeAmount && item.financeAmount > 0) ? Number(item.financeAmount) : (Number(item.price) || 0);

        if (matrix[catIdx][m]) {
            matrix[catIdx][m].count += 1;
            matrix[catIdx][m].amount += amt;
        }
    });

    // Populate Buyback Data
    filteredBuyback.forEach(item => {
        const m = getMonthKey(item.date);
        if (!m || !months.includes(m)) return;

        const catIdx = 6; // 7. การรับซื้อเครื่อง
        const amt = Number(item.price) || 0;

        if (matrix[catIdx][m]) {
            matrix[catIdx][m].count += 1;
            matrix[catIdx][m].amount += amt;
        }
    });

    // Handle Empty State
    if (months.length === 0) {
        thead.innerHTML = `
            <tr>
                <th class="text-left">รูปแบบการขาย</th>
                <th class="text-center">รวมทั้งหมด</th>
            </tr>`;
        tbody.innerHTML = `
            <tr>
                <td colspan="2" class="text-center empty-state">ไม่มีข้อมูลในช่วงเวลาหรือแบรนด์ที่คุณเลือก</td>
            </tr>`;
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    // Render Table Header
    let headHTML1 = `<tr><th rowspan="2" class="text-left" style="vertical-align: middle; min-width: 180px;">รูปแบบการขาย</th>`;
    months.forEach(m => {
        headHTML1 += `<th colspan="2" class="text-center" style="min-width: 160px;">${formatMonthHeader(m)}</th>`;
    });
    headHTML1 += `<th colspan="2" class="text-center highlight-header" style="min-width: 170px;">รวมทั้งหมด</th></tr>`;

    let headHTML2 = `<tr>`;
    months.forEach(() => {
        headHTML2 += `<th class="text-center" style="width: 70px;">จำนวน</th><th class="text-right" style="width: 100px;">จำนวนเงิน</th>`;
    });
    headHTML2 += `<th class="text-center highlight-header" style="width: 70px;">จำนวน</th><th class="text-right highlight-header" style="width: 110px;">จำนวนเงิน</th></tr>`;

    thead.innerHTML = headHTML1 + headHTML2;

    // Render Table Body
    let bodyHTML = '';
    const monthTotals = months.map(() => ({ count: 0, amount: 0 }));
    let grandTotalCount = 0;
    let grandTotalAmount = 0;

    const fNum = (val) => (Number(val) || 0).toLocaleString('th-TH');
    const fMoney = (val) => "฿" + (Number(val) || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

    categories.forEach((catName, catIdx) => {
        let rowCount = 0;
        let rowAmount = 0;
        let rowColsHTML = '';

        months.forEach((m, mIdx) => {
            const cell = matrix[catIdx][m] || { count: 0, amount: 0 };
            rowCount += cell.count;
            rowAmount += cell.amount;

            monthTotals[mIdx].count += cell.count;
            monthTotals[mIdx].amount += cell.amount;

            rowColsHTML += `<td class="text-center">${cell.count > 0 ? fNum(cell.count) : '-'}</td>`;
            rowColsHTML += `<td class="text-right">${cell.amount > 0 ? fMoney(cell.amount) : '-'}</td>`;
        });

        grandTotalCount += rowCount;
        grandTotalAmount += rowAmount;

        bodyHTML += `
            <tr>
                <td><strong>${catName}</strong></td>
                ${rowColsHTML}
                <td class="text-center highlight-cell"><strong>${rowCount > 0 ? fNum(rowCount) : '-'}</strong></td>
                <td class="text-right highlight-cell"><strong>${rowAmount > 0 ? fMoney(rowAmount) : '-'}</strong></td>
            </tr>`;
    });

    tbody.innerHTML = bodyHTML;

    // Render Table Footer
    let footColsHTML = '';
    months.forEach((_, mIdx) => {
        const mt = monthTotals[mIdx];
        footColsHTML += `<td class="text-center"><strong>${fNum(mt.count)}</strong></td>`;
        footColsHTML += `<td class="text-right"><strong>${fMoney(mt.amount)}</strong></td>`;
    });

    if (tfoot) {
        tfoot.innerHTML = `
            <tr class="total-footer-row">
                <td><strong>รวมสุทธิ</strong></td>
                ${footColsHTML}
                <td class="text-center"><strong>${fNum(grandTotalCount)}</strong></td>
                <td class="text-right"><strong>${fMoney(grandTotalAmount)}</strong></td>
            </tr>`;
    }
}

// ==========================================
// REPAIR MODULE LOGIC (ระบบงานซ่อมช่าง)
// ==========================================
let repairEls = null;

function getRepairEls() {
    if (!repairEls) {
        repairEls = {
            techSelect: document.getElementById('repair-tech-select'),
            customerType: document.getElementById('repair-customer-type'),
            statusSelect: document.getElementById('repair-status-select'),
            startDate: document.getElementById('repair-start-date'),
            endDate: document.getElementById('repair-end-date'),
            btnFilter: document.getElementById('btn-repair-filter'),
            btnReset: document.getElementById('btn-repair-reset'),
            sumTotalCount: document.getElementById('repair-sum-total-count'),
            sumTotalAmount: document.getElementById('repair-sum-total-amount'),
            sumStoreCount: document.getElementById('repair-sum-store-count'),
            sumStoreAmount: document.getElementById('repair-sum-store-amount'),
            sumOnlineCount: document.getElementById('repair-sum-online-count'),
            sumOnlineAmount: document.getElementById('repair-sum-online-amount'),
            sumRatio: document.getElementById('repair-sum-ratio'),
            sumAvgAmount: document.getElementById('repair-sum-avg-amount'),
            recordCount: document.getElementById('repair-record-count'),
            searchInput: document.getElementById('repair-search-input'),
            tableBody: document.getElementById('repair-table-body'),
            monthlyThead: document.getElementById('repair-monthly-breakdown-thead'),
            monthlyTbody: document.getElementById('repair-monthly-breakdown-tbody'),
            monthlyTfoot: document.getElementById('repair-monthly-breakdown-tfoot'),
            techRankingContainer: document.getElementById('technician-ranking-container')
        };
    }
    return repairEls;
}

// ระบบสลับแท็บหน้าจอหลัก (Sales KPI vs Repairs vs Commission Voucher)
window.switchView = function(view) {
    const salesContainer = document.getElementById('sales-view-container');
    const repairContainer = document.getElementById('repair-view-container');
    const commContainer = document.getElementById('commission-view-container');
    
    const tabSales = document.getElementById('tab-btn-sales');
    const tabRepair = document.getElementById('tab-btn-repair');
    const tabComm = document.getElementById('tab-btn-commission');
    
    const headerTitle = document.getElementById('header-main-title');
    const headerIcon = document.getElementById('header-main-icon');

    // ล้าง active tabs ทั้งหมด
    if (tabSales) tabSales.classList.remove('active');
    if (tabRepair) tabRepair.classList.remove('active');
    if (tabComm) tabComm.classList.remove('active');

    // ซ่อน containers ทั้งหมด
    if (salesContainer) salesContainer.style.display = 'none';
    if (repairContainer) repairContainer.style.display = 'none';
    if (commContainer) commContainer.style.display = 'none';

    if (view === 'sales') {
        if (salesContainer) salesContainer.style.display = 'block';
        if (tabSales) tabSales.classList.add('active');
        if (headerTitle) headerTitle.innerText = "ระบบติดตาม KPI ยอดขายพนักงาน";
        if (headerIcon) headerIcon.className = "fa-solid fa-chart-line";
    } else if (view === 'repair') {
        if (repairContainer) repairContainer.style.display = 'block';
        if (tabRepair) tabRepair.classList.add('active');
        if (headerTitle) headerTitle.innerText = "ระบบติดตามข้อมูลงานซ่อมช่าง";
        if (headerIcon) headerIcon.className = "fa-solid fa-screwdriver-wrench";
        updateRepairDashboard();
    } else if (view === 'commission') {
        if (commContainer) commContainer.style.display = 'block';
        if (tabComm) tabComm.classList.add('active');
        if (headerTitle) headerTitle.innerText = "ระบบออกเอกสารสรุปเบิกจ่ายค่าคอมมิชชัน";
        if (headerIcon) headerIcon.className = "fa-solid fa-file-invoice-dollar";
        initCommissionModule();
    }
};

// เริ่มต้นโมดูลงานซ่อม
function initRepairModule() {
    rawRepairs = window.repairsRawData || [];
    if (rawRepairs.length === 0) {
        rawRepairs = generateMockRepairData();
        window.repairsRawData = rawRepairs;
    }

    populateRepairTechnicians();
    initRepairEvents();

    filteredRepairs = [...rawRepairs];
    // ค่าเริ่มต้นกรองเฉพาะงานที่จบ
    const elements = getRepairEls();
    if (elements.statusSelect) {
        elements.statusSelect.value = "ลูกค้ารับเครื่องแล้ว";
    }
    handleRepairFilter();
}

// รายชื่อช่างใน Dropdown
function populateRepairTechnicians() {
    const elements = getRepairEls();
    if (!elements.techSelect) return;

    const techSet = new Set();
    rawRepairs.forEach(r => {
        if (r.technician && r.technician.trim()) {
            techSet.add(r.technician.trim());
        }
    });

    const sortedTechs = Array.from(techSet).sort();
    elements.techSelect.innerHTML = '<option value="all">-- ช่างทั้งหมด --</option>';
    sortedTechs.forEach(tech => {
        const opt = document.createElement('option');
        opt.value = opt.textContent = tech;
        elements.techSelect.appendChild(opt);
    });
}

// ผูก Event ให้กับปุ่มและอินพุตในหน้างงานซ่อม
function initRepairEvents() {
    const elements = getRepairEls();
    if (elements.btnFilter) elements.btnFilter.addEventListener('click', handleRepairFilter);
    if (elements.btnReset) elements.btnReset.addEventListener('click', handleRepairReset);
    if (elements.searchInput) {
        elements.searchInput.addEventListener('input', () => {
            renderRepairTable();
        });
    }

    // ปุ่มแบรนด์ในตารางเทียบรายเดือนของงานซ่อม
    document.querySelectorAll('.btn-repair-brand').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.btn-repair-brand').forEach(b => b.classList.remove('active'));
            const target = e.currentTarget;
            target.classList.add('active');
            selectedRepairBrand = target.getAttribute('data-brand') || 'all';
            renderRepairMonthlyBreakdown();
        });
    });
}

// กรองข้อมูลงานซ่อม
function handleRepairFilter() {
    const elements = getRepairEls();
    const selectedTech = elements.techSelect ? elements.techSelect.value : 'all';
    const selectedCustType = elements.customerType ? elements.customerType.value : 'all';
    const selectedStatus = elements.statusSelect ? elements.statusSelect.value : 'ลูกค้ารับเครื่องแล้ว';
    const startStr = elements.startDate ? elements.startDate.value : '';
    const endStr = elements.endDate ? elements.endDate.value : '';

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

    filteredRepairs = rawRepairs.filter(item => {
        // กรองช่าง
        if (selectedTech !== 'all' && (item.technician || '').trim() !== selectedTech) return false;

        // กรองประเภทลูกค้า
        if (selectedCustType !== 'all' && (item.customerType || '').trim() !== selectedCustType) return false;

        // กรองสถานะงาน
        if (selectedStatus !== 'all') {
            if ((item.status || '').trim() !== selectedStatus) return false;
        }

        // กรองวันที่
        const dateObj = parseTimestampToDate(item.date);
        if (dateObj) {
            const time = dateObj.getTime();
            if (time < startTimestamp || time > endTimestamp) return false;
        }

        return true;
    });

    updateRepairDashboard();
}

// รีเซ็ตตัวกรองงานซ่อม
function handleRepairReset() {
    const elements = getRepairEls();
    if (elements.techSelect) elements.techSelect.value = 'all';
    if (elements.customerType) elements.customerType.value = 'all';
    if (elements.statusSelect) elements.statusSelect.value = 'ลูกค้ารับเครื่องแล้ว';
    if (elements.startDate) elements.startDate.value = '';
    if (elements.endDate) elements.endDate.value = '';
    if (elements.searchInput) elements.searchInput.value = '';

    selectedRepairBrand = 'all';
    document.querySelectorAll('.btn-repair-brand').forEach(b => {
        if (b.getAttribute('data-brand') === 'all') b.classList.add('active');
        else b.classList.remove('active');
    });

    handleRepairFilter();
}

// อัปเดตการแสดงผลหน้างานซ่อม
function updateRepairDashboard() {
    const elements = getRepairEls();
    const fMoney = (num) => "฿" + (Number(num) || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    const fNum = (num) => (Number(num) || 0).toLocaleString('th-TH');

    // คำนวณเฉพาะงานที่จบ (ลูกค้ารับเครื่องแล้ว) สำหรับการ์ดยอดรวม
    // หากผู้ใช้เลือกสถานะอื่นในฟิลเตอร์ ให้คำนวณตามที่กรองมาได้
    const isCompletedOnly = !elements.statusSelect || elements.statusSelect.value === 'ลูกค้ารับเครื่องแล้ว';
    const targetRepairs = isCompletedOnly 
        ? filteredRepairs.filter(r => (r.status || '').trim() === 'ลูกค้ารับเครื่องแล้ว')
        : filteredRepairs;

    let totalCompletedCount = 0;
    let totalCompletedAmount = 0;

    let storeCount = 0;
    let storeAmount = 0;

    let onlineCount = 0;
    let onlineAmount = 0;

    targetRepairs.forEach(r => {
        const price = Number(r.actualPrice) || 0;
        const custType = (r.customerType || '').trim();

        totalCompletedCount += 1;
        totalCompletedAmount += price;

        if (custType.includes('หน้าร้าน')) {
            storeCount += 1;
            storeAmount += price;
        } else if (custType.includes('ออนไลน์')) {
            onlineCount += 1;
            onlineAmount += price;
        }
    });

    const avgAmount = totalCompletedCount > 0 ? (totalCompletedAmount / totalCompletedCount) : 0;
    const storeRatio = totalCompletedCount > 0 ? ((storeCount / totalCompletedCount) * 100).toFixed(0) : 0;
    const onlineRatio = totalCompletedCount > 0 ? ((onlineCount / totalCompletedCount) * 100).toFixed(0) : 0;

    // อัปเดต Summary Cards
    if (elements.sumTotalCount) elements.sumTotalCount.innerText = `${fNum(totalCompletedCount)} งาน`;
    if (elements.sumTotalAmount) elements.sumTotalAmount.innerText = fMoney(totalCompletedAmount);

    if (elements.sumStoreCount) elements.sumStoreCount.innerText = `${fNum(storeCount)} งาน`;
    if (elements.sumStoreAmount) elements.sumStoreAmount.innerText = fMoney(storeAmount);

    if (elements.sumOnlineCount) elements.sumOnlineCount.innerText = `${fNum(onlineCount)} งาน`;
    if (elements.sumOnlineAmount) elements.sumOnlineAmount.innerText = fMoney(onlineAmount);

    if (elements.sumRatio) elements.sumRatio.innerText = `หน้าร้าน ${storeRatio}% / ออนไลน์ ${onlineRatio}%`;
    if (elements.sumAvgAmount) elements.sumAvgAmount.innerText = fMoney(avgAmount);

    // อัปเดตการจัดอันดับและสรุปช่าง
    renderTechnicianRankings(targetRepairs);

    // อัปเดตตารางเทียบรายเดือน
    renderRepairMonthlyBreakdown();

    // อัปเดตตารางรายละเอียด
    renderRepairTable();
}

// แสดงการ์ดผลงานช่างแต่ละคน
function renderTechnicianRankings(completedRepairs) {
    const elements = getRepairEls();
    if (!elements.techRankingContainer) return;

    const fMoney = (num) => "฿" + (Number(num) || 0).toLocaleString('th-TH');
    const fNum = (num) => (Number(num) || 0).toLocaleString('th-TH');

    // จัดกลุ่มช่าง
    const techStats = {};
    // ดึงช่างทั้งหมดที่มี
    rawRepairs.forEach(r => {
        const t = (r.technician || '').trim();
        if (t && !techStats[t]) {
            techStats[t] = { name: t, totalCount: 0, totalAmount: 0, storeCount: 0, storeAmount: 0, onlineCount: 0, onlineAmount: 0 };
        }
    });

    // รวมยอดจากงานที่เสร็จตามช่วงเวลาที่กรอง
    completedRepairs.forEach(r => {
        const t = (r.technician || '').trim() || 'ไม่ระบุช่าง';
        if (!techStats[t]) {
            techStats[t] = { name: t, totalCount: 0, totalAmount: 0, storeCount: 0, storeAmount: 0, onlineCount: 0, onlineAmount: 0 };
        }
        const price = Number(r.actualPrice) || 0;
        const cType = (r.customerType || '').trim();

        techStats[t].totalCount += 1;
        techStats[t].totalAmount += price;

        if (cType.includes('หน้าร้าน')) {
            techStats[t].storeCount += 1;
            techStats[t].storeAmount += price;
        } else if (cType.includes('ออนไลน์')) {
            techStats[t].onlineCount += 1;
            techStats[t].onlineAmount += price;
        }
    });

    const techList = Object.values(techStats).sort((a, b) => b.totalAmount - a.totalAmount);
    const selectedTech = elements.techSelect ? elements.techSelect.value : 'all';

    if (techList.length === 0) {
        elements.techRankingContainer.innerHTML = '<div class="text-center empty-state" style="width: 100%;">ไม่มีข้อมูลช่าง</div>';
        return;
    }

    // หายอดสูงสุดเพื่อทำ progress bar
    const maxAmount = Math.max(...techList.map(t => t.totalAmount), 1);

    elements.techRankingContainer.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'ranking-card';
    card.style.width = '100%';
    card.innerHTML = `
        <div class="ranking-card-header">
            <i class="fa-solid fa-users-gear"></i>
            <span>สรุปงานจบของช่าง (เรียงตามยอดเงินจบงานจริง)</span>
        </div>
        <div class="ranking-list" id="repair-ranking-list"></div>
    `;

    const listContainer = card.querySelector('#repair-ranking-list');

    techList.forEach((tech, index) => {
        const rank = index + 1;
        let rankClass = 'rank-other';
        let rankBadgeContent = rank;

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

        const percentWidth = Math.min((tech.totalAmount / maxAmount) * 100, 100);
        const isHighlighted = (selectedTech !== 'all' && selectedTech === tech.name);
        const highlightedClass = isHighlighted ? 'highlighted' : '';

        const itemHTML = `
            <div class="ranking-item ${highlightedClass}">
                <div class="rank-badge ${rankClass}">${rankBadgeContent}</div>
                <div class="ranking-info">
                    <div class="ranking-name-row">
                        <span class="ranking-name">${tech.name}</span>
                        <div style="text-align: right;">
                            <span class="ranking-value" style="color: #27ae60;">${fMoney(tech.totalAmount)}</span>
                            <span style="font-size: 0.85rem; color: #64748b; margin-left: 8px;">(${fNum(tech.totalCount)} งาน)</span>
                        </div>
                    </div>
                    <div class="ranking-progress-container">
                        <div class="ranking-progress-bg">
                            <div class="ranking-progress-fill" style="width: ${percentWidth}%; background: linear-gradient(90deg, #4a6ee0, #2ecc71);"></div>
                        </div>
                        <div class="ranking-meta" style="font-size: 0.8rem; color: #64748b;">
                            <span>หน้าร้าน: <strong>${fNum(tech.storeCount)}</strong> งาน (${fMoney(tech.storeAmount)})</span>
                            <span>ออนไลน์: <strong>${fNum(tech.onlineCount)}</strong> งาน (${fMoney(tech.onlineAmount)})</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        listContainer.innerHTML += itemHTML;
    });

    elements.techRankingContainer.appendChild(card);
}

// ตารางสรุปเปรียบเทียบรายเดือนสำหรับงานซ่อม (รูปแบบเดียวกับพนักงานขาย)
function renderRepairMonthlyBreakdown() {
    const elements = getRepairEls();
    const thead = elements.monthlyThead;
    const tbody = elements.monthlyTbody;
    const tfoot = elements.monthlyTfoot;
    if (!thead || !tbody) return;

    // กรองเฉพาะงานที่จบ (ลูกค้ารับเครื่องแล้ว)
    let jobs = filteredRepairs.filter(r => (r.status || '').trim() === 'ลูกค้ารับเครื่องแล้ว');

    // กรองตามแบรนด์
    if (selectedRepairBrand === 'apple') {
        jobs = jobs.filter(r => {
            const b = (r.brand || '').toLowerCase();
            const m = (r.model || '').toLowerCase();
            return b.includes('apple') || m.includes('iphone') || m.includes('ipad') || m.includes('airpod');
        });
    } else if (selectedRepairBrand === 'android') {
        jobs = jobs.filter(r => {
            const b = (r.brand || '').toLowerCase();
            const m = (r.model || '').toLowerCase();
            const androidList = ['samsung', 'oppo', 'vivo', 'redmi', 'xiaomi', 'realme', 'infinix', 'honor', 'huawei'];
            return androidList.some(brand => b.includes(brand) || m.includes(brand));
        });
    } else if (selectedRepairBrand === 'other') {
        jobs = jobs.filter(r => {
            const b = (r.brand || '').toLowerCase();
            const m = (r.model || '').toLowerCase();
            const androidList = ['apple', 'iphone', 'ipad', 'airpod', 'samsung', 'oppo', 'vivo', 'redmi', 'xiaomi', 'realme', 'infinix', 'honor', 'huawei'];
            return !androidList.some(brand => b.includes(brand) || m.includes(brand));
        });
    }

    // ดึงเดือนที่ไม่ซ้ำกัน
    const monthSet = new Set();
    jobs.forEach(r => {
        const dt = parseTimestampToDate(r.date);
        if (dt) {
            const y = dt.getFullYear();
            const m = String(dt.getMonth() + 1).padStart(2, '0');
            monthSet.add(`${y}-${m}`);
        }
    });

    const months = Array.from(monthSet).sort();
    const monthNamesThai = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const formatMonthHeader = (yyyyMM) => {
        const [y, m] = yyyyMM.split('-');
        const monthIdx = parseInt(m, 10) - 1;
        return `${monthNamesThai[monthIdx]} ${y}`;
    };

    // หมวดหมู่งานซ่อมตามประเภทลูกค้า
    const categories = [
        "1. ลูกค้าหน้าร้าน",
        "2. ลูกค้าออนไลน์"
    ];

    // Data Matrix: matrix[catIdx][monthKey] = { count: 0, amount: 0 }
    const matrix = Array.from({ length: 2 }, () => ({}));
    categories.forEach((_, catIdx) => {
        months.forEach(m => {
            matrix[catIdx][m] = { count: 0, amount: 0 };
        });
    });

    // รวมข้อมูลลง Matrix
    jobs.forEach(r => {
        const dt = parseTimestampToDate(r.date);
        if (!dt) return;
        const mKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
        if (!months.includes(mKey)) return;

        const cType = (r.customerType || '').trim();
        const catIdx = cType.includes('ออนไลน์') ? 1 : 0;
        const price = Number(r.actualPrice) || 0;

        if (matrix[catIdx][mKey]) {
            matrix[catIdx][mKey].count += 1;
            matrix[catIdx][mKey].amount += price;
        }
    });

    const fNum = (val) => (Number(val) || 0).toLocaleString('th-TH');
    const fMoney = (val) => "฿" + (Number(val) || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

    if (months.length === 0) {
        thead.innerHTML = `
            <tr>
                <th class="text-left">ประเภทลูกค้า</th>
                <th class="text-center">รวมทั้งหมด</th>
            </tr>`;
        tbody.innerHTML = `
            <tr>
                <td colspan="2" class="text-center empty-state">ไม่มีข้อมูลงานซ่อมในช่วงเวลาหรือแบรนด์ที่คุณเลือก</td>
            </tr>`;
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    // Render Table Header
    let headHTML1 = `<tr><th rowspan="2" class="text-left" style="vertical-align: middle; min-width: 180px;">ประเภทลูกค้า</th>`;
    months.forEach(m => {
        headHTML1 += `<th colspan="2" class="text-center" style="min-width: 160px;">${formatMonthHeader(m)}</th>`;
    });
    headHTML1 += `<th colspan="2" class="text-center highlight-header" style="min-width: 170px;">รวมทั้งหมด</th></tr>`;

    let headHTML2 = `<tr>`;
    months.forEach(() => {
        headHTML2 += `<th class="text-center" style="width: 70px;">จำนวน</th><th class="text-right" style="width: 100px;">จำนวนเงิน</th>`;
    });
    headHTML2 += `<th class="text-center highlight-header" style="width: 70px;">จำนวน</th><th class="text-right highlight-header" style="width: 110px;">จำนวนเงิน</th></tr>`;

    thead.innerHTML = headHTML1 + headHTML2;

    // Render Table Body
    let bodyHTML = '';
    const monthTotals = months.map(() => ({ count: 0, amount: 0 }));
    let grandTotalCount = 0;
    let grandTotalAmount = 0;

    categories.forEach((catName, catIdx) => {
        let rowCount = 0;
        let rowAmount = 0;
        let rowColsHTML = '';

        months.forEach((m, mIdx) => {
            const cell = matrix[catIdx][m] || { count: 0, amount: 0 };
            rowCount += cell.count;
            rowAmount += cell.amount;

            monthTotals[mIdx].count += cell.count;
            monthTotals[mIdx].amount += cell.amount;

            rowColsHTML += `<td class="text-center">${cell.count > 0 ? fNum(cell.count) : '-'}</td>`;
            rowColsHTML += `<td class="text-right">${cell.amount > 0 ? fMoney(cell.amount) : '-'}</td>`;
        });

        grandTotalCount += rowCount;
        grandTotalAmount += rowAmount;

        bodyHTML += `
            <tr>
                <td><strong>${catName}</strong></td>
                ${rowColsHTML}
                <td class="text-center highlight-cell"><strong>${rowCount > 0 ? fNum(rowCount) : '-'}</strong></td>
                <td class="text-right highlight-cell"><strong>${rowAmount > 0 ? fMoney(rowAmount) : '-'}</strong></td>
            </tr>`;
    });

    tbody.innerHTML = bodyHTML;

    // Render Table Footer
    let footColsHTML = '';
    months.forEach((_, mIdx) => {
        const mt = monthTotals[mIdx];
        footColsHTML += `<td class="text-center"><strong>${fNum(mt.count)}</strong></td>`;
        footColsHTML += `<td class="text-right"><strong>${fMoney(mt.amount)}</strong></td>`;
    });

    if (tfoot) {
        tfoot.innerHTML = `
            <tr class="total-footer-row">
                <td><strong>รวมสุทธิ</strong></td>
                ${footColsHTML}
                <td class="text-center"><strong>${fNum(grandTotalCount)}</strong></td>
                <td class="text-right"><strong>${fMoney(grandTotalAmount)}</strong></td>
            </tr>`;
    }
}

// เรนเดอร์ตารางรายการงานซ่อมแบบละเอียด
function renderRepairTable() {
    const elements = getRepairEls();
    if (!elements.tableBody) return;

    const query = elements.searchInput ? elements.searchInput.value.trim().toLowerCase() : '';
    const fMoney = (num) => "฿" + (Number(num) || 0).toLocaleString('th-TH');

    let displayList = [...filteredRepairs];

    // ค้นหาตามช่อง Search
    if (query) {
        displayList = displayList.filter(r => {
            const text = `${r.jobId} ${r.technician} ${r.brand} ${r.model} ${r.deviceType} ${r.symptom} ${r.customerType} ${r.status}`.toLowerCase();
            return text.includes(query);
        });
    }

    // เรียงตามวันที่ล่าสุดก่อน
    displayList.sort((a, b) => {
        const da = parseTimestampToDate(a.date);
        const db = parseTimestampToDate(b.date);
        const ta = da ? da.getTime() : 0;
        const tb = db ? db.getTime() : 0;
        return tb - ta;
    });

    if (elements.recordCount) elements.recordCount.innerText = displayList.length;

    elements.tableBody.innerHTML = '';

    if (displayList.length === 0) {
        elements.tableBody.innerHTML = '<tr><td colspan="10" class="text-center empty-state">ไม่มีข้อมูลงานซ่อมในเงื่อนไขที่คุณเลือก</td></tr>';
        return;
    }

    displayList.forEach(item => {
        const dt = parseTimestampToDate(item.date);
        let dateStr = '-';
        if (dt) {
            const day = String(dt.getDate()).padStart(2, '0');
            const month = String(dt.getMonth() + 1).padStart(2, '0');
            const year = dt.getFullYear();
            const hour = String(dt.getHours()).padStart(2, '0');
            const min = String(dt.getMinutes()).padStart(2, '0');
            dateStr = `${day}/${month}/${year} ${hour}:${min}`;
        } else if (item.date) {
            dateStr = item.date.toString();
        }

        // สถานะ Badge
        const status = (item.status || '').trim();
        let statusBadge = `<span class="badge badge-status-default">${status || '-'}</span>`;
        if (status.includes('รับเครื่องแล้ว')) {
            statusBadge = `<span class="badge badge-status-completed"><i class="fa-solid fa-circle-check"></i> ${status}</span>`;
        } else if (status.includes('รับเครื่องใหม่')) {
            statusBadge = `<span class="badge badge-status-new"><i class="fa-solid fa-clock"></i> ${status}</span>`;
        } else if (status.includes('ไม่ซ่อม') || status.includes('คืนลูกค้า')) {
            statusBadge = `<span class="badge badge-status-return"><i class="fa-solid fa-circle-xmark"></i> ${status}</span>`;
        }

        // ประเภทลูกค้า Badge
        const custType = (item.customerType || '').trim();
        let custBadge = `<span class="badge badge-status-default">${custType || '-'}</span>`;
        if (custType.includes('หน้าร้าน')) {
            custBadge = `<span class="badge badge-cust-store"><i class="fa-solid fa-shop"></i> ${custType}</span>`;
        } else if (custType.includes('ออนไลน์')) {
            custBadge = `<span class="badge badge-cust-online"><i class="fa-solid fa-globe"></i> ${custType}</span>`;
        }

        // ลิงก์สลิปใบเสร็จ PaymentSlip
        const pSlip = (item.paymentSlip || '').trim();
        let slipBtn = `<span class="btn-proof-link btn-proof-disabled" title="ไม่มีหลักฐานสลิป"><i class="fa-solid fa-receipt"></i> ไม่มี</span>`;
        if (pSlip.startsWith('http')) {
            slipBtn = `<a href="${pSlip}" target="_blank" rel="noopener noreferrer" class="btn-proof-link btn-slip-active" title="คลิกเพื่อดูสลิปใบเสร็จ"><i class="fa-solid fa-receipt"></i> ดูสลิป</a>`;
        }

        // ลิงก์หลักฐานนัดรับ AppointmentSlip
        const aSlip = (item.appointmentSlip || '').trim();
        let apptBtn = `<span class="btn-proof-link btn-proof-disabled" title="ไม่มีหลักฐานนัดรับ"><i class="fa-solid fa-file-invoice"></i> ไม่มี</span>`;
        if (aSlip.startsWith('http')) {
            apptBtn = `<a href="${aSlip}" target="_blank" rel="noopener noreferrer" class="btn-proof-link btn-proof-active" title="คลิกเพื่อดูหลักฐานลูกค้าออนไลน์"><i class="fa-solid fa-file-invoice"></i> ดูหลักฐาน</a>`;
        }

        const deviceBrandModel = [item.deviceType, item.brand, item.model].filter(Boolean).join(' • ');

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-size: 0.9rem; color: #475569;">${dateStr}</td>
            <td><strong style="color: var(--primary-color);">${item.jobId || '-'}</strong></td>
            <td><strong>${item.technician || '-'}</strong></td>
            <td>${deviceBrandModel || '-'}</td>
            <td>${item.symptom || '-'}</td>
            <td class="text-center">${statusBadge}</td>
            <td class="text-center">${custBadge}</td>
            <td class="text-right" style="font-weight: 600; color: #27ae60;">${item.actualPrice ? fMoney(item.actualPrice) : '-'}</td>
            <td class="text-center">${slipBtn}</td>
            <td class="text-center">${apptBtn}</td>
        `;
        elements.tableBody.appendChild(tr);
    });
}

// แปลงรูปแบบวันที่ที่มาจากชีต (รองรับ DD/MM/YYYY HH:mm:ss, ISO, Date object)
function parseTimestampToDate(val) {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    if (typeof val === 'number') return new Date(val);
    const str = val.toString().trim();
    if (!str) return null;

    // รูปแบบ วัน/เดือน/ปี เช่น 24/08/2026 13:36:22
    const parts = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (parts) {
        const d = parseInt(parts[1], 10);
        const m = parseInt(parts[2], 10) - 1;
        let y = parseInt(parts[3], 10);
        if (y > 2500) y -= 543; // พ.ศ. เป็น ค.ศ.
        const hr = parts[4] ? parseInt(parts[4], 10) : 0;
        const min = parts[5] ? parseInt(parts[5], 10) : 0;
        const sec = parts[6] ? parseInt(parts[6], 10) : 0;
        return new Date(y, m, d, hr, min, sec);
    }

    const dt = new Date(str);
    return isNaN(dt.getTime()) ? null : dt;
}

// ข้อมูลจำลองงานซ่อม อ้างอิงจากชีตจริงของผู้ใช้
function generateMockRepairData() {
    return [
        { jobId: "REP-2608-5621", date: "24/08/2026 13:36:22", deviceType: "มือถือ", brand: "Apple", model: "Iphone15 Pro Max", symptom: "เปลี่ยนแบต", estPrice: 500, technician: "นาย ศรานุวัฒน์ นิมิตบัณฑิตทองดี (ต้อ)", status: "ลูกค้ารับเครื่องแล้ว", actualPrice: 500, customerType: "ลูกค้าหน้าร้าน", paymentSlip: "https://drive.google.com/file/d/sample1/view", appointmentSlip: "" },
        { jobId: "REP-2608-5622", date: "24/08/2026 15:00:22", deviceType: "มือถือ", brand: "Apple", model: "Iphone13Pro Max", symptom: "เปลี่ยนก้นชาร์จ", estPrice: 3000, technician: "นาย ศรานุวัฒน์ นิมิตบัณฑิตทองดี (ต้อ)", status: "ลูกค้ารับเครื่องแล้ว", actualPrice: 3000, customerType: "ลูกค้าออนไลน์", paymentSlip: "https://drive.google.com/file/d/sample2/view", appointmentSlip: "https://drive.google.com/file/d/sample3/view" },
        { jobId: "REP-2608-5623", date: "24/08/2026 15:04:13", deviceType: "มือถือ", brand: "Apple", model: "iphone16", symptom: "แพรชาร์จเสีย", estPrice: 2500, technician: "นาย วรภัทร คุ้มเมือง (กิมเฮง)", status: "ไม่ซ่อมคืนลูกค้า", actualPrice: 0, customerType: "ลูกค้าหน้าร้าน", paymentSlip: "", appointmentSlip: "" },
        { jobId: "REP-2608-5624", date: "24/08/2026 16:25:28", deviceType: "คอม", brand: "Apple", model: "Airpod Pro2", symptom: "เปลี่ยนแบต", estPrice: 1500, technician: "นาย มายีน กือสันเทียะ (มาย)", status: "ลูกค้ารับเครื่องแล้ว", actualPrice: 1500, customerType: "ลูกค้าหน้าร้าน", paymentSlip: "https://drive.google.com/file/d/sample4/view", appointmentSlip: "" },
        { jobId: "REP-2608-5625", date: "24/08/2026 17:51:41", deviceType: "มือถือ", brand: "Oppo", model: "a5", symptom: "เปลี่ยนจอ", estPrice: 1400, technician: "นาย มายีน กือสันเทียะ (มาย)", status: "รับเครื่องใหม่", actualPrice: 0, customerType: "ลูกค้าหน้าร้าน", paymentSlip: "", appointmentSlip: "" },
        { jobId: "REP-2608-5627", date: "25/08/2026 14:37:11", deviceType: "มือถือ", brand: "Oppo", model: "A7", symptom: "ปุ่มพาวเวอร์ เสีย", estPrice: 400, technician: "นาย วรภัทร คุ้มเมือง (กิมเฮง)", status: "ลูกค้ารับเครื่องแล้ว", actualPrice: 400, customerType: "ลูกค้าหน้าร้าน", paymentSlip: "https://drive.google.com/file/d/sample5/view", appointmentSlip: "" },
        { jobId: "REP-2608-5628", date: "25/08/2026 14:59:15", deviceType: "มือถือ", brand: "Samsung", model: "a02", symptom: "เปลี่ยนตูดชาร์จ", estPrice: 400, technician: "นาย มายีน กือสันเทียะ (มาย)", status: "ลูกค้ารับเครื่องแล้ว", actualPrice: 400, customerType: "ลูกค้าหน้าร้าน", paymentSlip: "https://drive.google.com/file/d/sample6/view", appointmentSlip: "" },
        { jobId: "REP-2608-5629", date: "25/08/2026 15:03:54", deviceType: "มือถือ", brand: "Apple", model: "8plus", symptom: "ล้างเครื่อง", estPrice: 1000, technician: "นาย มายีน กือสันเทียะ (มาย)", status: "ลูกค้ารับเครื่องแล้ว", actualPrice: 1000, customerType: "ลูกค้าหน้าร้าน", paymentSlip: "https://drive.google.com/file/d/sample7/view", appointmentSlip: "" },
        { jobId: "REP-2608-5630", date: "25/08/2026 15:20:02", deviceType: "คอม", brand: "อื่นๆ", model: "-", symptom: "เปลี่ยนก้นชาร์จ poket WiFi", estPrice: 400, technician: "นาย ทศวิษ ทิพย์สาคร (ชาบุน)", status: "ลูกค้ารับเครื่องแล้ว", actualPrice: 400, customerType: "ลูกค้าหน้าร้าน", paymentSlip: "https://drive.google.com/file/d/sample8/view", appointmentSlip: "" },
        { jobId: "REP-2608-5631", date: "25/08/2026 18:11:06", deviceType: "มือถือ", brand: "Apple", model: "8 Plus", symptom: "บายพาสเครื่อง", estPrice: 1000, technician: "นาย มายีน กือสันเทียะ (มาย)", status: "ลูกค้ารับเครื่องแล้ว", actualPrice: 1000, customerType: "ลูกค้าหน้าร้าน", paymentSlip: "https://drive.google.com/file/d/sample9/view", appointmentSlip: "" },
        { jobId: "REP-2608-5632", date: "26/08/2026 15:28:05", deviceType: "แท็บเล็ต", brand: "Apple", model: "ipad pro 11 นิ้ว 2", symptom: "ลอกกระจกใหม่ 3500 บาท", estPrice: 3500, technician: "นาย ทศวิษ ทิพย์สาคร (ชาบุน)", status: "ลูกค้ารับเครื่องแล้ว", actualPrice: 6500, customerType: "ลูกค้าหน้าร้าน", paymentSlip: "https://drive.google.com/file/d/sample10/view", appointmentSlip: "" },
        { jobId: "REP-2608-5633", date: "26/08/2026 15:45:27", deviceType: "มือถือ", brand: "Apple", model: "iphone8", symptom: "เปลี่ยนแบต", estPrice: 1500, technician: "นาย มายีน กือสันเทียะ (มาย)", status: "ลูกค้ารับเครื่องแล้ว", actualPrice: 1500, customerType: "ลูกค้าหน้าร้าน", paymentSlip: "https://drive.google.com/file/d/sample11/view", appointmentSlip: "" },
        { jobId: "REP-2608-5634", date: "27/08/2026 11:19:32", deviceType: "มือถือ", brand: "อื่นๆ", model: "Honor 200 pro", symptom: "รับจ้างเปลี่ยนจอ และ เลนส์กล้อง", estPrice: 600, technician: "นาย วรภัทร คุ้มเมือง (กิมเฮง)", status: "ลูกค้ารับเครื่องแล้ว", actualPrice: 600, customerType: "ลูกค้าหน้าร้าน", paymentSlip: "https://drive.google.com/file/d/sample12/view", appointmentSlip: "" },
        { jobId: "REP-2608-5636", date: "28/08/2026 11:57:52", deviceType: "แท็บเล็ต", brand: "Apple", model: "ipad Gen 7", symptom: "เปลี่ยนจอ", estPrice: 1800, technician: "นาย วรภัทร คุ้มเมือง (กิมเฮง)", status: "ลูกค้ารับเครื่องแล้ว", actualPrice: 1800, customerType: "ลูกค้าหน้าร้าน", paymentSlip: "https://drive.google.com/file/d/sample13/view", appointmentSlip: "" },
        { jobId: "REP-2608-5637", date: "28/08/2026 14:05:37", deviceType: "มือถือ", brand: "Apple", model: "12 pro max", symptom: "เปลี่ยนฝาหลังและแพรชาร์จ", estPrice: 5000, technician: "นาย มายีน กือสันเทียะ (มาย)", status: "ลูกค้ารับเครื่องแล้ว", actualPrice: 5000, customerType: "ลูกค้าออนไลน์", paymentSlip: "https://drive.google.com/file/d/sample14/view", appointmentSlip: "https://drive.google.com/file/d/sample15/view" },
        { jobId: "REP-2608-5638", date: "29/08/2026 09:11:50", deviceType: "มือถือ", brand: "Redmi", model: "Note 13", symptom: "ตูดชาร์จเริ่มชาร์จเข้าบ้างไม่เข้าบ้าง", estPrice: 800, technician: "นาย มายีน กือสันเทียะ (มาย)", status: "ลูกค้ารับเครื่องแล้ว", actualPrice: 800, customerType: "ลูกค้าหน้าร้าน", paymentSlip: "https://drive.google.com/file/d/sample16/view", appointmentSlip: "" },
        { jobId: "REP-2608-5639", date: "29/08/2026 14:15:08", deviceType: "มือถือ", brand: "Oppo", model: "A78 5G", symptom: "เปลี่ยนจอ", estPrice: 1200, technician: "นาย วรภัทร คุ้มเมือง (กิมเฮง)", status: "ลูกค้ารับเครื่องแล้ว", actualPrice: 1200, customerType: "ลูกค้าหน้าร้าน", paymentSlip: "https://drive.google.com/file/d/sample17/view", appointmentSlip: "" },
        { jobId: "REP-2608-5640", date: "29/08/2026 17:22:27", deviceType: "มือถือ", brand: "Apple", model: "Iphone 11", symptom: "เปลี่ยนจอ", estPrice: 2500, technician: "นาย ศรานุวัฒน์ นิมิตบัณฑิตทองดี (ต้อ)", status: "ลูกค้ารับเครื่องแล้ว", actualPrice: 2500, customerType: "ลูกค้าหน้าร้าน", paymentSlip: "https://drive.google.com/file/d/sample18/view", appointmentSlip: "" },
        { jobId: "REP-2608-5641", date: "29/08/2026 17:51:07", deviceType: "มือถือ", brand: "Apple", model: "Iphone 15 Pro", symptom: "เปลี่ยนฝาหลัง", estPrice: 2500, technician: "นาย ศรานุวัฒน์ นิมิตบัณฑิตทองดี (ต้อ)", status: "ลูกค้ารับเครื่องแล้ว", actualPrice: 2500, customerType: "ลูกค้าหน้าร้าน", paymentSlip: "https://drive.google.com/file/d/sample19/view", appointmentSlip: "" },
        { jobId: "REP-2608-5642", date: "30/08/2026 17:10:10", deviceType: "มือถือ", brand: "Apple", model: "Iphone14", symptom: "เปลี่ยนจอ", estPrice: 2500, technician: "นาย ศรานุวัฒน์ นิมิตบัณฑิตทองดี (ต้อ)", status: "ลูกค้ารับเครื่องแล้ว", actualPrice: 2500, customerType: "ลูกค้าหน้าร้าน", paymentSlip: "https://drive.google.com/file/d/sample20/view", appointmentSlip: "" },
        { jobId: "REP-2608-5643", date: "30/08/2026 17:17:25", deviceType: "มือถือ", brand: "Infinix", model: "hot 50 i", symptom: "เปลี่ยนจอ 1300 บาท และ ฟิล์ม 150 บาท", estPrice: 1300, technician: "นาย วรภัทร คุ้มเมือง (กิมเฮง)", status: "ลูกค้ารับเครื่องแล้ว", actualPrice: 1300, customerType: "ลูกค้าหน้าร้าน", paymentSlip: "https://drive.google.com/file/d/sample21/view", appointmentSlip: "" },
        { jobId: "REP-2608-5644", date: "31/08/2026 08:42:37", deviceType: "มือถือ", brand: "Samsung", model: "A06", symptom: "จอแตก/เปลี่ยนจอ", estPrice: 1500, technician: "นาย บัญญัติ ไม้กลาง (นนท์)", status: "ลูกค้ารับเครื่องแล้ว", actualPrice: 1500, customerType: "ลูกค้าหน้าร้าน", paymentSlip: "https://drive.google.com/file/d/sample22/view", appointmentSlip: "" },
        { jobId: "REP-2608-5646", date: "31/08/2026 17:00:00", deviceType: "มือถือ", brand: "Samsung", model: "A36 5G", symptom: "จอดับ/ซ่อมช็อกเก็ต", estPrice: 800, technician: "นาย บัญญัติ ไม้กลาง (นนท์)", status: "ลูกค้ารับเครื่องแล้ว", actualPrice: 1900, customerType: "ลูกค้าหน้าร้าน", paymentSlip: "https://drive.google.com/file/d/sample23/view", appointmentSlip: "" },
        { jobId: "REP-2608-5647", date: "01/09/2026 11:19:02", deviceType: "มือถือ", brand: "Samsung", model: "a 13 5g", symptom: "ล้างไวรัส 150 บาท", estPrice: 150, technician: "นาย บัญญัติ ไม้กลาง (นนท์)", status: "ลูกค้ารับเครื่องแล้ว", actualPrice: 150, customerType: "ลูกค้าหน้าร้าน", paymentSlip: "https://drive.google.com/file/d/sample24/view", appointmentSlip: "" },
        { jobId: "REP-2608-5649", date: "01/09/2026 11:44:36", deviceType: "มือถือ", brand: "Vivo", model: "y16s", symptom: "เปลี่ยนจอ 1300 บาท และติดฟิล์ม 150 บาท", estPrice: 1300, technician: "นาย วรภัทร คุ้มเมือง (กิมเฮง)", status: "ลูกค้ารับเครื่องแล้ว", actualPrice: 1300, customerType: "ลูกค้าหน้าร้าน", paymentSlip: "https://drive.google.com/file/d/sample25/view", appointmentSlip: "" },
        { jobId: "REP-2608-5651", date: "01/09/2026 12:33:56", deviceType: "มือถือ", brand: "Samsung", model: "A12", symptom: "เปลี่ยนจอ+ติดฟิล์ม", estPrice: 1650, technician: "นาย บัญญัติ ไม้กลาง (นนท์)", status: "ลูกค้ารับเครื่องแล้ว", actualPrice: 1650, customerType: "ลูกค้าหน้าร้าน", paymentSlip: "https://drive.google.com/file/d/sample26/view", appointmentSlip: "" },
        { jobId: "REP-2608-5652", date: "01/09/2026 16:46:37", deviceType: "แท็บเล็ต", brand: "Apple", model: "ipad air 5", symptom: "เปลี่ยนจอ", estPrice: 7500, technician: "นาย วรภัทร คุ้มเมือง (กิมเฮง)", status: "ลูกค้ารับเครื่องแล้ว", actualPrice: 7500, customerType: "ลูกค้าหน้าร้าน", paymentSlip: "https://drive.google.com/file/d/sample27/view", appointmentSlip: "" }
    ];
}

// ==========================================
// MODULE: COMMISSION VOUCHER (เอกสารสรุปเบิกจ่ายค่าคอมมิชชัน)
// ==========================================
let isCommInitialized = false;

// เริ่มต้นโมดูลค่าคอมมิชชัน
function initCommissionModule() {
    populateCommissionEmployees();

    if (!isCommInitialized) {
        // กำหนดวันที่เริ่มต้น-สิ้นสุดอัตโนมัติ (ย้อนหลัง 7 วันตามรอบสัปดาห์)
        const endD = new Date();
        const startD = new Date();
        startD.setDate(startD.getDate() - 6);

        const formatDateVal = (d) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };

        const startDateInput = document.getElementById('comm-start-date');
        const endDateInput = document.getElementById('comm-end-date');
        if (startDateInput && !startDateInput.value) startDateInput.value = formatDateVal(startD);
        if (endDateInput && !endDateInput.value) endDateInput.value = formatDateVal(endD);

        isCommInitialized = true;
    }

    renderCommissionVoucher();
}

// เติมรายชื่อพนักงานลงใน Dropdown
function populateCommissionEmployees() {
    const empSelect = document.getElementById('comm-employee-select');
    if (!empSelect) return;

    const currentVal = empSelect.value;
    const employees = new Set();

    // ดึงจาก usersData
    if (window.usersData && window.usersData.length > 0) {
        window.usersData.forEach(u => {
            if (u.name && u.name.trim()) employees.add(u.name.trim());
        });
    }

    // ดึงจาก rawData ชีต Phone2
    rawData.forEach(r => {
        if (r.sheetName === "Phone2" && r.employee && r.employee.trim()) {
            employees.add(r.employee.trim());
        }
    });

    const sortedEmps = Array.from(employees).sort();
    empSelect.innerHTML = '';
    
    // ถ้าไม่มีข้อมูล ให้สร้างตัวอย่าง
    if (sortedEmps.length === 0) {
        sortedEmps.push("น.ส. รัตนาภรณ์ สาระยิ่ง (ตูน)");
        sortedEmps.push("น.ส. ธนาภา รักพุดชา (ปาล์ม)");
    }

    sortedEmps.forEach(emp => {
        const opt = document.createElement('option');
        opt.value = opt.textContent = emp;
        empSelect.appendChild(opt);
    });

    if (currentVal && sortedEmps.includes(currentVal)) {
        empSelect.value = currentVal;
    }
}

// สลับรูปแบบเอกสาร (รอบสัปดาห์, รายเดือน, ทีมหลังบ้าน)
function handleCommDocTypeChange() {
    const docType = document.getElementById('comm-doc-type').value;
    const empGroup = document.getElementById('comm-emp-group');
    const startDateInput = document.getElementById('comm-start-date');
    const endDateInput = document.getElementById('comm-end-date');

    const now = new Date();
    const formatDateVal = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    if (docType === 'weekly') {
        if (empGroup) empGroup.style.display = 'flex';
        // รอบสัปดาห์: ย้อนหลัง 7 วัน
        const startD = new Date();
        startD.setDate(startD.getDate() - 6);
        if (startDateInput) startDateInput.value = formatDateVal(startD);
        if (endDateInput) endDateInput.value = formatDateVal(now);
    } else if (docType === 'monthly') {
        if (empGroup) empGroup.style.display = 'flex';
        // รายเดือน: วันที่ 1 ถึงสิ้นเดือน
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        if (startDateInput) startDateInput.value = formatDateVal(firstDay);
        if (endDateInput) endDateInput.value = formatDateVal(lastDay);
    } else if (docType === 'backoffice') {
        // ทีมหลังบ้าน
        if (empGroup) empGroup.style.display = 'none';
        const startD = new Date();
        startD.setDate(startD.getDate() - 6);
        if (startDateInput) startDateInput.value = formatDateVal(startD);
        if (endDateInput) endDateInput.value = formatDateVal(now);
    }

    renderCommissionVoucher();
}

// ฟังก์ชันแปลงวันที่เป็นรูปแบบ วัน/เดือน/ปี เช่น 8/9/2026
function formatThaiDateDisplay(dateInput) {
    if (!dateInput) return '-';
    let d = null;
    if (dateInput instanceof Date) {
        d = dateInput;
    } else {
        d = parseTimestampToDate(dateInput);
    }
    if (!d || isNaN(d.getTime())) return String(dateInput);
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

// ==========================================
// สถานะและตัวแปรจัดการการตัดออกไม่คิดค่าคอมมิชชัน
// ==========================================
let excludedCommissionMap = new Map(); // key -> { excludedQty, totalQty, reason, excludedAt }
window.commAvailableItems = new Map();  // key -> item info for preview & restoring
window.currentPendingExcludeKey = null;

// เปิด Modal ระบุเหตุผลและการเลือกจำนวนเครื่องที่จะตัดออก
function openExcludeModal(itemKey) {
    const item = window.commAvailableItems.get(itemKey);
    if (!item) return;

    window.currentPendingExcludeKey = itemKey;
    const previewEl = document.getElementById('exclude-modal-item-preview');
    if (previewEl) {
        previewEl.innerHTML = `
            <div style="font-weight: 600; color: #0f172a; margin-bottom: 2px;">
                ${item.desc || item.title}
            </div>
            <div style="font-size: 12px; color: #475569;">
                ประเภท: <b>${item.type}</b> &nbsp;|&nbsp; 
                จำนวนทั้งหมด: <b>${item.qty}</b> เครื่อง &nbsp;|&nbsp; 
                ราคา/เครื่อง: <b>${(item.price || 0).toLocaleString('th-TH')}</b> บ. 
                (ยอดรวมทั้งหมด ${(item.amount || 0).toLocaleString('th-TH')} บ.)
            </div>
            <div style="font-size: 11.5px; color: #64748b; margin-top: 2px;">
                ลูกค้า: <b>${item.customer || '-'}</b> &nbsp;|&nbsp; วันที่: <b>${item.date || '-'}</b>
            </div>
        `;
    }

    // จัดการจำนวนเครื่องที่ต้องการตัดออก
    const existing = excludedCommissionMap.get(itemKey);
    const maxQty = item.qty || 1;
    // ถ้าเคยตัดไว้ ให้ดึงค่านั้นขึ้นมา ถ้ายังไม่เคยตัด ค่าเริ่มต้นเป็น 1 เครื่อง
    const defaultQty = existing ? existing.excludedQty : (maxQty > 1 ? 1 : 1);

    const qtyInput = document.getElementById('exclude-qty-input');
    if (qtyInput) {
        qtyInput.min = 1;
        qtyInput.max = maxQty;
        qtyInput.value = defaultQty;
    }

    const totalDisplay = document.getElementById('exclude-qty-total-display');
    if (totalDisplay) totalDisplay.innerText = maxQty;

    updateExcludeQtyCalculation();

    // ดึงเหตุผลเดิม หรือล้างค่า
    const reasonInput = document.getElementById('exclude-reason-input');
    if (reasonInput) {
        reasonInput.value = existing ? existing.reason : '';
    }

    // รีเซ็ต active pills
    const pills = document.querySelectorAll('.reason-pill');
    pills.forEach(p => {
        if (existing && p.textContent.includes(existing.reason)) {
            p.classList.add('active');
        } else {
            p.classList.remove('active');
        }
    });

    const dialog = document.getElementById('comm-exclude-modal');
    if (dialog) {
        if (typeof dialog.showModal === 'function') {
            dialog.showModal();
        } else {
            dialog.setAttribute('open', '');
        }
    }
}

// ปรับจำนวนเครื่องที่ต้องการตัดออกด้วยปุ่ม + / -
function changeExcludeQtyStep(delta) {
    const item = window.commAvailableItems.get(window.currentPendingExcludeKey);
    const maxQty = item ? item.qty : 1;
    const qtyInput = document.getElementById('exclude-qty-input');
    if (!qtyInput) return;

    let curVal = parseInt(qtyInput.value) || 1;
    let nextVal = curVal + delta;
    if (nextVal < 1) nextVal = 1;
    if (nextVal > maxQty) nextVal = maxQty;

    qtyInput.value = nextVal;
    updateExcludeQtyCalculation();
}

// คำนวณจำนวนเครื่องคงเหลือที่ยังได้รับค่าคอม
function updateExcludeQtyCalculation() {
    const item = window.commAvailableItems.get(window.currentPendingExcludeKey);
    const maxQty = item ? item.qty : 1;
    const qtyInput = document.getElementById('exclude-qty-input');
    if (!qtyInput) return;

    let curVal = parseInt(qtyInput.value) || 1;
    if (curVal < 1) curVal = 1;
    if (curVal > maxQty) curVal = maxQty;
    qtyInput.value = curVal;

    const remaining = maxQty - curVal;
    const remainEl = document.getElementById('exclude-qty-remain-display');
    if (remainEl) {
        remainEl.innerText = remaining;
        remainEl.className = remaining > 0 ? 'text-green font-bold' : 'text-red font-bold';
    }
}

// เลือกเหตุผลสำเร็จรูป
function selectQuickReason(reasonText) {
    const reasonInput = document.getElementById('exclude-reason-input');
    if (reasonInput) {
        reasonInput.value = reasonText;
        reasonInput.focus();
    }

    const pills = document.querySelectorAll('.reason-pill');
    pills.forEach(p => {
        if (p.textContent.includes(reasonText.replace('🏷️ ', '').replace('🤝 ', '').replace('📉 ', '').replace('🔄 ', '').replace('❌ ', '').replace('⚠️ ', ''))) {
            p.classList.add('active');
        } else {
            p.classList.remove('active');
        }
    });
}

// ยืนยันการตัดออกตามจำนวนเครื่องที่เลือก
function confirmExcludeItem() {
    if (!window.currentPendingExcludeKey) return;
    const item = window.commAvailableItems.get(window.currentPendingExcludeKey);
    const maxQty = item ? item.qty : 1;

    const qtyInput = document.getElementById('exclude-qty-input');
    let excludedQty = parseInt(qtyInput ? qtyInput.value : 1) || 1;
    if (excludedQty < 1) excludedQty = 1;
    if (excludedQty > maxQty) excludedQty = maxQty;

    const reasonInput = document.getElementById('exclude-reason-input');
    const reason = (reasonInput && reasonInput.value.trim()) 
        ? reasonInput.value.trim() 
        : 'ตกลงไม่คิดค่าคอมมิชชัน';

    excludedCommissionMap.set(window.currentPendingExcludeKey, {
        excludedQty: excludedQty,
        totalQty: maxQty,
        reason: reason,
        excludedAt: Date.now()
    });

    closeExcludeModal();
    renderCommissionVoucher();
}

// ปิด Modal
function closeExcludeModal() {
    window.currentPendingExcludeKey = null;
    const dialog = document.getElementById('comm-exclude-modal');
    if (dialog) {
        if (typeof dialog.close === 'function') {
            dialog.close();
        } else {
            dialog.removeAttribute('open');
        }
    }
}

// คืนค่ารายการที่ตัดออก (นำกลับมาคิดค่าคอมมิชชันเต็มจำนวน)
function restoreExcludedItem(itemKey) {
    if (excludedCommissionMap.has(itemKey)) {
        excludedCommissionMap.delete(itemKey);
        renderCommissionVoucher();
    }
}

// คืนค่ารายการที่ตัดออกทั้งหมด
function resetAllExcludedItems() {
    if (excludedCommissionMap.size === 0) return;
    if (confirm("ต้องการคืนค่ารายการที่ตัดออกทั้งหมดกลับมาคำนวณค่าคอมมิชชันตามเดิมหรือไม่?")) {
        excludedCommissionMap.clear();
        renderCommissionVoucher();
    }
}

// ฟังก์ชันประมวลผลและสร้างเอกสารสรุปเบิกจ่ายค่าคอมมิชชัน
function renderCommissionVoucher() {
    const docTypeSelect = document.getElementById('comm-doc-type');
    const docType = docTypeSelect ? docTypeSelect.value : 'weekly';
    const empSelect = document.getElementById('comm-employee-select');
    const selectedEmp = empSelect ? empSelect.value : '';

    const startDateVal = document.getElementById('comm-start-date').value;
    const endDateVal = document.getElementById('comm-end-date').value;

    let startTimestamp = 0;
    if (startDateVal) {
        const sd = new Date(startDateVal);
        sd.setHours(0, 0, 0, 0);
        startTimestamp = sd.getTime();
    }

    let endTimestamp = Infinity;
    if (endDateVal) {
        const ed = new Date(endDateVal);
        ed.setHours(23, 59, 59, 999);
        endTimestamp = ed.getTime();
    }

    // 1. อัปเดตหัวเอกสาร
    const mainTitleEl = document.getElementById('comm-main-title');
    const docEmpNameEl = document.getElementById('comm-doc-emp-name');
    const docDateRangeEl = document.getElementById('comm-doc-date-range');
    const sumEmpTitleEl = document.getElementById('comm-sum-emp-title');

    const startDisplayStr = startDateVal ? formatThaiDateDisplay(new Date(startDateVal)) : '-';
    const endDisplayStr = endDateVal ? formatThaiDateDisplay(new Date(endDateVal)) : '-';
    if (docDateRangeEl) docDateRangeEl.innerText = `${startDisplayStr}  ถึง  ${endDisplayStr}`;

    if (docType === 'backoffice') {
        if (mainTitleEl) mainTitleEl.innerText = "สรุปเบิกจ่ายค่าคอมมิชชัน ทีมหลังบ้าน (รายการขายส่ง)";
        if (docEmpNameEl) docEmpNameEl.innerText = "ทีมหลังบ้าน KP Shop";
        if (sumEmpTitleEl) sumEmpTitleEl.innerText = "ทีมหลังบ้าน";
    } else if (docType === 'monthly') {
        if (mainTitleEl) mainTitleEl.innerText = "สรุปเบิกจ่ายค่าคอมมิชชัน รายการขายสด iPhone มือ 2 หน้าร้าน (รายเดือน)";
        if (docEmpNameEl) docEmpNameEl.innerText = selectedEmp || "-";
        if (sumEmpTitleEl) sumEmpTitleEl.innerText = selectedEmp || "ชื่อพนักงาน";
    } else {
        if (mainTitleEl) mainTitleEl.innerText = "สรุปเบิกจ่ายค่าคอมมิชชัน การขายเครื่องราคาส่ง & รับซื้อเครื่อง";
        if (docEmpNameEl) docEmpNameEl.innerText = selectedEmp || "-";
        if (sumEmpTitleEl) sumEmpTitleEl.innerText = selectedEmp || "ชื่อพนักงาน";
    }

    // 2. ดึงข้อมูลจาก rawData และ buybackRawData
    const allSales = rawData || [];
    const allBuyback = window.buybackRawData || [];

    // กรองสินค้า Phone2 ที่เป็น Apple ในช่วงวันที่
    const phone2AppleSales = allSales.filter(item => {
        if (item.sheetName !== "Phone2") return false;
        
        // เช็คแบรนด์ Apple
        const brandStr = (item.brand || '').toString().toLowerCase();
        const modelStr = (item.model || '').toString().toLowerCase();
        const isApple = brandStr.includes('apple') || modelStr.includes('iphone') || modelStr.includes('ipad');
        if (!isApple) return false;

        // เช็ควันที่
        const d = parseTimestampToDate(item.date);
        if (!d) return false;
        const t = d.getTime();
        if (t < startTimestamp || t > endTimestamp) return false;

        // เช็คพนักงาน (ถ้าเป็นหลังบ้าน ไม่กรองพนักงาน เพราะคิดยอดขายส่งรวมทั้งหมด)
        if (docType !== 'backoffice') {
            const empName = (item.employee || '').trim();
            if (empName !== selectedEmp.trim()) return false;
        }

        return true;
    });

    // กรองรายการรับซื้อ (Apple)
    const filteredBuybacks = allBuyback.filter(item => {
        const brandStr = (item.brand || '').toString().toLowerCase();
        const modelStr = (item.model || '').toString().toLowerCase();
        const isApple = brandStr.includes('apple') || modelStr.includes('iphone') || modelStr.includes('ipad');
        if (!isApple) return false;

        const d = parseTimestampToDate(item.date);
        if (!d) return false;
        const t = d.getTime();
        if (t < startTimestamp || t > endTimestamp) return false;

        if (docType !== 'backoffice') {
            const empName = (item.employee || '').trim();
            if (empName !== selectedEmp.trim()) return false;
        }

        return true;
    });

    // 3. จำแนกรายการขายส่ง VS ขายสด iPhone มือ 2
    const wholesaleItems = [];
    const usedPhoneItems = [];

    phone2AppleSales.forEach(item => {
        const saleType = (item.saleType || '').toString().trim();
        // รายการขายส่ง: ต้องเป็น "ส่งร้านพาร์ทเนอร์ (เงินสด)" เท่านั้น (ไม่นับเงินเชื่อ)
        if (saleType.includes("ส่งร้านพาร์ทเนอร์") && !saleType.includes("เงินเชื่อ")) {
            wholesaleItems.push(item);
        } else {
            // รายการขายอื่นๆ ใน Phone2 เช่น ขายสด, สินเชื่อ IT4, Kfinance
            usedPhoneItems.push(item);
        }
    });

    // จัดการ Map ลำดับเอกสาร 001, 002, 003... ตาม SaleID
    const saleIdDocMap = new Map();
    let currentDocNumber = 1;
    const getDocNumber = (saleId) => {
        const sid = (saleId || '').toString().trim();
        if (!sid) {
            const numStr = String(currentDocNumber++).padStart(3, '0');
            return numStr;
        }
        if (!saleIdDocMap.has(sid)) {
            const numStr = String(currentDocNumber++).padStart(3, '0');
            saleIdDocMap.set(sid, numStr);
        }
        return saleIdDocMap.get(sid);
    };

    // ฟังก์ชันแปลง Model Code: ZP/A, TH/A -> ศูนย์ไทย, นอกนั้น -> แท้นอก
    const formatModelOrigin = (mCode) => {
        const mc = (mCode || '').toString().toUpperCase();
        if (!mc) return 'แท้นอก';
        if (mc.includes('ZP') || mc.includes('TH')) return 'ศูนย์ไทย';
        return 'แท้นอก';
    };

    // ฟังก์ชันทำความสะอาดฟิลด์ความจุ ดึงเฉพาะตัวเลขความจุ เช่น 128, 256, 512
    const formatCapacity = (cap) => {
        const str = (cap || '').toString().trim();
        const match = str.match(/(\d+\s*(?:TB|GB)?)/i);
        if (match) {
            let res = match[1].replace(/\s*GB/i, '').trim();
            return res || '-';
        }
        return str.replace(/^\/+/, '').trim() || '-';
    };

    // อ้างอิง Element ของตารางทั้ง 4 ส่วน
    const secWholesale = document.getElementById('comm-sec-wholesale');
    const secUsedPhone = document.getElementById('comm-sec-usedphone');
    const secBuyback = document.getElementById('comm-sec-buyback');
    const secExcluded = document.getElementById('comm-sec-excluded');

    // รายการที่ตัดออกที่รวบรวมเพื่อนำไปแสดงในตารางที่ 4
    const excludedRowsToRender = [];

    // ==========================================
    // ตารางที่ 1: รายการขายเครื่องราคาส่ง (สีฟ้า)
    // ==========================================
    const wsTbody = document.getElementById('comm-table-wholesale-body');
    let totalWsQty = 0;
    let totalWsAmount = 0;
    let totalWsCommission = 0;

    // จัดกลุ่มรายการขายส่ง: รวมรายการที่ SaleID เดียวกัน, รุ่นเดียวกัน, ความจุเดียวกัน, Model เดียวกัน, ราคาเดียวกัน เป็น 1 แถว
    const wsGroupMap = new Map();
    wholesaleItems.forEach(item => {
        const sid = (item.saleId || '').toString().trim();
        const modelName = (item.model || item.category || '-').trim();
        const cap = formatCapacity(item.capacity);
        const origin = formatModelOrigin(item.modelCode);
        const price = Number(item.price) || 0;
        const customer = (item.customerName || '-').trim();
        const payment = (item.paymentMethod || 'เงินโอน').trim();
        const dateStr = formatThaiDateDisplay(item.date);

        const groupKey = `${sid}_${modelName}_${cap}_${origin}_${price}_${customer}_${payment}`;

        if (!wsGroupMap.has(groupKey)) {
            wsGroupMap.set(groupKey, {
                saleId: sid,
                date: dateStr,
                modelName: modelName,
                capacity: cap,
                origin: origin,
                price: price,
                qty: 1,
                customer: customer,
                payment: payment,
                groupKey: groupKey
            });
        } else {
            wsGroupMap.get(groupKey).qty += 1;
        }
    });

    let wsRowsHtml = '';
    let wsRenderedCount = 0;

    wsGroupMap.forEach(grp => {
        const docNum = getDocNumber(grp.saleId);
        const itemKey = `ws_${grp.groupKey}`;

        // ลงทะเบียนใน Available Items Registry (เก็บจำนวนเต็มของแถวนั้นเสมอ)
        window.commAvailableItems.set(itemKey, {
            key: itemKey,
            docNum: docNum,
            date: grp.date,
            type: 'ขายส่ง',
            desc: `${grp.modelName} ${grp.capacity} (${grp.origin})`,
            qty: grp.qty,
            price: grp.price,
            amount: grp.price * grp.qty,
            customer: grp.customer,
            comm: (docType === 'backoffice') ? 0 : (grp.qty * 70)
        });

        // ตรวจสอบการตัดออก (รองรับทั้งตัดทั้งหมดและตัดบางเครื่อง)
        const excInfo = excludedCommissionMap.get(itemKey);
        const excQty = excInfo ? Math.min(excInfo.excludedQty, grp.qty) : 0;
        const paidQty = grp.qty - excQty;

        // ถ้ามีการตัดออกบางส่วนหรือทั้งหมด -> ส่งเข้าตารางรายการที่ตัดออก (ตารางที่ 4)
        if (excQty > 0) {
            excludedRowsToRender.push({
                key: itemKey,
                docNum: docNum,
                date: grp.date,
                type: 'ขายส่ง',
                desc: `${grp.modelName} ${grp.capacity} (${grp.origin})`,
                qty: excQty,
                totalQty: grp.qty,
                price: grp.price,
                amount: grp.price * excQty,
                customer: grp.customer,
                reason: excInfo.reason
            });
        }

        // ถ้ายังมีจำนวนที่ได้รับค่าคอมมิชชัน (> 0) -> แสดงในตารางหลัก
        if (paidQty > 0) {
            const paidRowAmount = grp.price * paidQty;
            const paidComm = (docType === 'backoffice') ? 0 : (paidQty * 70);

            totalWsQty += paidQty;
            totalWsAmount += paidRowAmount;
            totalWsCommission += paidComm;
            wsRenderedCount++;

            // ปุ่ม Action: ถ้าตัดบางส่วนแสดงปุ่มส้ม "ตัดแล้ว X/Total" ถ้ายังไม่ตัดแสดงปุ่มแดง "ตัดออก"
            const actionBtnHtml = (excQty > 0)
                ? `<button type="button" class="btn-row-action btn-row-partial" onclick="openExcludeModal('${itemKey}')" title="ปรับจำนวนตัดออก (ตัดแล้ว ${excQty} จากทั้งหมด ${grp.qty} เครื่อง)">
                       <i class="fa-solid fa-pen-to-square"></i> ตัดแล้ว ${excQty}/${grp.qty}
                   </button>`
                : `<button type="button" class="btn-row-action btn-row-exclude" onclick="openExcludeModal('${itemKey}')" title="ตัดออกไม่จ่ายค่าคอม">
                       <i class="fa-solid fa-ban"></i> ตัดออก
                   </button>`;

            // การแสดงจำนวนเครื่อง: ถ้าตัดบางส่วน แสดงจำนวนที่คิดค่าคอม พร้อมระบุจำนวนเต็มเดิม
            const qtyDisplayHtml = (excQty > 0)
                ? `<span class="text-green font-bold">${paidQty}</span> <span style="font-size: 11px; color: #64748b;">(จาก ${grp.qty})</span>`
                : `<span class="font-bold">${paidQty}</span>`;

            wsRowsHtml += `
                <tr>
                    <td class="text-center">${docNum}</td>
                    <td class="text-center">${grp.date}</td>
                    <td>${grp.modelName}</td>
                    <td class="text-center">${grp.capacity}</td>
                    <td class="text-center">${grp.origin}</td>
                    <td class="text-center">${qtyDisplayHtml}</td>
                    <td class="text-right">${grp.price.toLocaleString('th-TH')}</td>
                    <td class="text-right">${paidRowAmount.toLocaleString('th-TH')}</td>
                    <td>${grp.customer}</td>
                    <td class="text-right font-bold">${paidComm > 0 ? paidComm.toLocaleString('th-TH') : '-'}</td>
                    <td class="text-center">${grp.payment}</td>
                    <td class="text-center no-print">
                        ${actionBtnHtml}
                    </td>
                </tr>
            `;
        }
    });

    if (wsRenderedCount === 0) {
        wsRowsHtml = `<tr><td colspan="12" class="text-center" style="color: #94a3b8; padding: 12px;">- ไม่มีรายการขายราคาส่ง (หรือถูกตัดออกทั้งหมด) -</td></tr>`;
    }
    if (wsTbody) wsTbody.innerHTML = wsRowsHtml;

    document.getElementById('comm-ws-total-qty').innerText = totalWsQty.toLocaleString('th-TH');
    document.getElementById('comm-ws-total-amount').innerText = totalWsAmount.toLocaleString('th-TH');
    document.getElementById('comm-ws-total-comm').innerText = totalWsCommission.toLocaleString('th-TH');


    // ==========================================
    // ตารางที่ 2: รายการขาย iPhone มือ 2 (สีเขียว)
    // ==========================================
    const usedTbody = document.getElementById('comm-table-usedphone-body');
    let totalUsedQty = 0;
    let totalUsedAmount = 0;
    let totalUsedCommission = 0;

    // จัดกลุ่มรายการขาย iPhone มือ 2
    const usedGroupMap = new Map();
    usedPhoneItems.forEach(item => {
        const sid = (item.saleId || '').toString().trim();
        const modelName = (item.model || item.category || '-').trim();
        const cap = formatCapacity(item.capacity);
        const origin = formatModelOrigin(item.modelCode);
        const price = Number(item.price) || 0;
        const customer = (item.customerName || '-').trim();
        const payType = (item.paymentMethod || item.saleType || 'เงินโอน').trim();
        const dateStr = formatThaiDateDisplay(item.date);

        const groupKey = `${sid}_${modelName}_${cap}_${origin}_${price}_${customer}_${payType}`;

        if (!usedGroupMap.has(groupKey)) {
            usedGroupMap.set(groupKey, {
                saleId: sid,
                date: dateStr,
                modelName: modelName,
                capacity: cap,
                origin: origin,
                price: price,
                qty: 1,
                customer: customer,
                payment: payType,
                groupKey: groupKey
            });
        } else {
            usedGroupMap.get(groupKey).qty += 1;
        }
    });

    // นับจำนวนเครื่องที่ยังจ่ายคอมมิชชันเพื่อเช็คเกณฑ์เป้า 5 เครื่อง (นับเฉพาะ paidQty)
    let activeUsedCount = 0;
    usedGroupMap.forEach(grp => {
        const itemKey = `used_${grp.groupKey}`;
        const excInfo = excludedCommissionMap.get(itemKey);
        const excQty = excInfo ? Math.min(excInfo.excludedQty, grp.qty) : 0;
        const paidQty = grp.qty - excQty;
        activeUsedCount += paidQty;
    });
    const meetsUsedTarget = (activeUsedCount >= 5);

    let usedRowsHtml = '';
    let usedRenderedCount = 0;

    if (docType === 'monthly') {
        usedGroupMap.forEach(grp => {
            const docNum = getDocNumber(grp.saleId);
            const itemKey = `used_${grp.groupKey}`;
            
            // อัตราค่าคอมมิชชันตามช่วงราคาต่อเครื่อง (เฉพาะเมื่อผ่านเป้า 5 เครื่อง)
            let unitComm = 0;
            if (meetsUsedTarget) {
                if (grp.price >= 20001) unitComm = 300;
                else if (grp.price >= 15000) unitComm = 200;
                else if (grp.price >= 10000) unitComm = 100;
            }

            // ลงทะเบียน Registry
            window.commAvailableItems.set(itemKey, {
                key: itemKey,
                docNum: docNum,
                date: grp.date,
                type: 'ขายสด iPhone มือ 2',
                desc: `${grp.modelName} ${grp.capacity} (${grp.origin})`,
                qty: grp.qty,
                price: grp.price,
                amount: grp.price * grp.qty,
                customer: grp.customer,
                comm: unitComm * grp.qty
            });

            // ตรวจสอบการตัดออก
            const excInfo = excludedCommissionMap.get(itemKey);
            const excQty = excInfo ? Math.min(excInfo.excludedQty, grp.qty) : 0;
            const paidQty = grp.qty - excQty;

            // ถ้ามีการตัดออกบางส่วนหรือทั้งหมด -> ส่งเข้าตารางที่ 4
            if (excQty > 0) {
                excludedRowsToRender.push({
                    key: itemKey,
                    docNum: docNum,
                    date: grp.date,
                    type: 'ขายสด iPhone มือ 2',
                    desc: `${grp.modelName} ${grp.capacity} (${grp.origin})`,
                    qty: excQty,
                    totalQty: grp.qty,
                    price: grp.price,
                    amount: grp.price * excQty,
                    customer: grp.customer,
                    reason: excInfo.reason
                });
            }

            // ถ้ายังมีจำนวนที่จ่ายค่าคอมมิชชัน
            if (paidQty > 0) {
                const paidRowAmount = grp.price * paidQty;
                const paidRowComm = unitComm * paidQty;

                totalUsedQty += paidQty;
                totalUsedAmount += paidRowAmount;
                totalUsedCommission += paidRowComm;
                usedRenderedCount++;

                const actionBtnHtml = (excQty > 0)
                    ? `<button type="button" class="btn-row-action btn-row-partial" onclick="openExcludeModal('${itemKey}')" title="ปรับจำนวนตัดออก (ตัดออกแล้ว ${excQty} จากทั้งหมด ${grp.qty} เครื่อง)">
                           <i class="fa-solid fa-pen-to-square"></i> ตัดแล้ว ${excQty}/${grp.qty}
                       </button>`
                    : `<button type="button" class="btn-row-action btn-row-exclude" onclick="openExcludeModal('${itemKey}')" title="ตัดออกไม่จ่ายค่าคอม">
                           <i class="fa-solid fa-ban"></i> ตัดออก
                       </button>`;

                const qtyDisplayHtml = (excQty > 0)
                    ? `<span class="text-green font-bold">${paidQty}</span> <span style="font-size: 11px; color: #64748b;">(จาก ${grp.qty})</span>`
                    : `<span class="font-bold">${paidQty}</span>`;

                usedRowsHtml += `
                    <tr>
                        <td class="text-center">${docNum}</td>
                        <td class="text-center">${grp.date}</td>
                        <td>${grp.modelName}</td>
                        <td class="text-center">${grp.capacity}</td>
                        <td class="text-center">${grp.origin}</td>
                        <td class="text-center">${qtyDisplayHtml}</td>
                        <td class="text-right">${grp.price.toLocaleString('th-TH')}</td>
                        <td class="text-right">${paidRowAmount.toLocaleString('th-TH')}</td>
                        <td>${grp.customer}</td>
                        <td class="text-center">${grp.payment}</td>
                        <td class="text-right font-bold">${paidRowComm > 0 ? paidRowComm.toLocaleString('th-TH') : '0'}</td>
                        <td class="text-center no-print">
                            ${actionBtnHtml}
                        </td>
                    </tr>
                `;
            }
        });

        if (usedRenderedCount === 0) {
            usedRowsHtml = `<tr><td colspan="12" class="text-center" style="color: #94a3b8; padding: 12px;">- ไม่มีรายการขายสด iPhone มือ 2 (หรือถูกตัดออกทั้งหมด) -</td></tr>`;
        } else if (!meetsUsedTarget) {
            usedRowsHtml += `<tr><td colspan="12" class="text-center" style="color: #dc2626; background: #fff1f2; font-weight: 600; padding: 8px;">⚠️ ขายได้รวม ${totalUsedQty} เครื่อง (ไม่ถึงเกณฑ์ขั้นต่ำ 5 เครื่อง/เดือน จึงยังไม่ได้รับค่าคอมมิชชัน)</td></tr>`;
        }
    }

    if (usedTbody) usedTbody.innerHTML = usedRowsHtml;

    document.getElementById('comm-used-total-qty').innerText = totalUsedQty.toLocaleString('th-TH');
    document.getElementById('comm-used-total-amount').innerText = totalUsedAmount.toLocaleString('th-TH');
    document.getElementById('comm-used-total-comm').innerText = totalUsedCommission.toLocaleString('th-TH');


    // ==========================================
    // ตารางที่ 3: รายการรับซื้อเครื่อง (iPhone) (สีส้ม/ชมพู)
    // ==========================================
    const bbTbody = document.getElementById('comm-table-buyback-body');
    let totalBbQty = 0;
    let totalBbAmount = 0;
    let totalBbCommission = 0;
    let bbRenderedCount = 0;

    let bbRowsHtml = '';
    if (docType === 'weekly') {
        filteredBuybacks.forEach((item, idx) => {
            const docNum = String(idx + 1).padStart(3, '0');
            const dateStr = formatThaiDateDisplay(item.date);
            const modelName = item.model || '-';
            const cap = formatCapacity(item.capacity);
            const colorModel = item.color || '-';
            const price = Number(item.price) || 0;
            const qty = 1;
            const rowAmount = price * qty;

            // ค่าคอมมิชชันรับซื้อ: 10k-14.9k = 100, 15k-20k = 200, 20k+ = 300
            let comm = 0;
            if (price >= 20001) comm = 300;
            else if (price >= 15000) comm = 200;
            else if (price >= 10000) comm = 100;

            const itemKey = `bb_${item.buybackId || (idx + '_' + item.date + '_' + item.model + '_' + price)}`;

            // ลงทะเบียน Registry
            window.commAvailableItems.set(itemKey, {
                key: itemKey,
                docNum: docNum,
                date: dateStr,
                type: 'รับซื้อเครื่อง',
                desc: `${modelName} ${cap} (${colorModel})`,
                qty: qty,
                price: price,
                amount: rowAmount,
                customer: 'ลูกค้าหน้าร้าน',
                comm: comm
            });

            // ตรวจสอบการตัดออก
            const excInfo = excludedCommissionMap.get(itemKey);
            const excQty = excInfo ? Math.min(excInfo.excludedQty, qty) : 0;
            const paidQty = qty - excQty;

            if (excQty > 0) {
                excludedRowsToRender.push({
                    key: itemKey,
                    docNum: docNum,
                    date: dateStr,
                    type: 'รับซื้อเครื่อง',
                    desc: `${modelName} ${cap} (${colorModel})`,
                    qty: excQty,
                    totalQty: qty,
                    price: price,
                    amount: price * excQty,
                    customer: 'ลูกค้าหน้าร้าน',
                    reason: excInfo.reason
                });
            }

            if (paidQty > 0) {
                totalBbQty += paidQty;
                totalBbAmount += price * paidQty;
                totalBbCommission += comm * paidQty;
                bbRenderedCount++;

                bbRowsHtml += `
                    <tr>
                        <td class="text-center">${docNum}</td>
                        <td class="text-center">${dateStr}</td>
                        <td>${modelName}</td>
                        <td class="text-center">${cap}</td>
                        <td class="text-center">${colorModel}</td>
                        <td class="text-center">${paidQty}</td>
                        <td class="text-right">${price.toLocaleString('th-TH')}</td>
                        <td class="text-right">${(price * paidQty).toLocaleString('th-TH')}</td>
                        <td>ลูกค้าหน้าร้าน</td>
                        <td class="text-right font-bold">${comm > 0 ? comm.toLocaleString('th-TH') : '0'}</td>
                        <td class="text-center">รับซื้อ</td>
                        <td class="text-center no-print">
                            <button type="button" class="btn-row-action btn-row-exclude" onclick="openExcludeModal('${itemKey}')" title="ตัดออกไม่จ่ายค่าคอม">
                                <i class="fa-solid fa-ban"></i> ตัดออก
                            </button>
                        </td>
                    </tr>
                `;
            }
        });
    }

    if (bbRenderedCount === 0 || docType !== 'weekly') {
        bbRowsHtml = `<tr><td colspan="12" class="text-center" style="color: #94a3b8; padding: 12px;">- ไม่มีรายการรับซื้อเครื่อง (หรือถูกตัดออกทั้งหมด) -</td></tr>`;
    }
    if (bbTbody) bbTbody.innerHTML = bbRowsHtml;

    document.getElementById('comm-bb-total-qty').innerText = totalBbQty.toLocaleString('th-TH');
    document.getElementById('comm-bb-total-amount').innerText = totalBbAmount.toLocaleString('th-TH');
    document.getElementById('comm-bb-total-comm').innerText = totalBbCommission.toLocaleString('th-TH');


    // ==========================================
    // ตารางที่ 4: รายการที่ไม่คิดค่าคอมมิชชัน (รายการที่ตัดออก)
    // ==========================================
    const excTbody = document.getElementById('comm-table-excluded-body');
    let totalExcQty = 0;
    let totalExcAmount = 0;
    let excRowsHtml = '';

    excludedRowsToRender.forEach((exc, index) => {
        totalExcQty += exc.qty;
        totalExcAmount += exc.amount;

        const qtyDisplay = (exc.totalQty && exc.totalQty > exc.qty)
            ? `<span class="font-bold text-red">${exc.qty}</span> <span style="font-size: 11px; color: #64748b;">(จาก ${exc.totalQty})</span>`
            : `<span class="font-bold text-red">${exc.qty}</span>`;

        excRowsHtml += `
            <tr>
                <td class="text-center font-bold">${String(index + 1).padStart(3, '0')}</td>
                <td class="text-center">${exc.date}</td>
                <td class="text-center"><span class="badge" style="background: #f1f5f9; color: #475569; font-size: 11px;">${exc.type}</span></td>
                <td><b>${exc.desc}</b></td>
                <td class="text-center">${qtyDisplay}</td>
                <td class="text-right">${exc.price.toLocaleString('th-TH')}</td>
                <td class="text-right">${exc.amount.toLocaleString('th-TH')}</td>
                <td>${exc.customer}</td>
                <td><span class="reason-tag"><i class="fa-solid fa-circle-info"></i> ${exc.reason}</span></td>
                <td class="text-center no-print">
                    <button type="button" class="btn-row-action btn-row-restore" onclick="restoreExcludedItem('${exc.key}')" title="นำกลับมาจ่ายค่าคอมมิชชันเต็มจำนวน">
                        <i class="fa-solid fa-rotate-left"></i> คืนค่า
                    </button>
                </td>
            </tr>
        `;
    });

    if (excTbody) excTbody.innerHTML = excRowsHtml;

    const excTotalQtyEl = document.getElementById('comm-exc-total-qty');
    const excTotalAmountEl = document.getElementById('comm-exc-total-amount');
    if (excTotalQtyEl) excTotalQtyEl.innerText = `${totalExcQty.toLocaleString('th-TH')} เครื่อง`;
    if (excTotalAmountEl) excTotalAmountEl.innerText = `${totalExcAmount.toLocaleString('th-TH')} บาท`;

    // ควบคุมการแสดงผลตารางรายการที่ตัดออก: แสดงเฉพาะเมื่อมีรายการถูกตัดออก
    if (secExcluded) {
        secExcluded.style.display = (excludedRowsToRender.length > 0) ? 'block' : 'none';
    }

    // อัปเดตปุ่ม Reset ใน Filter Section
    const resetExcBtn = document.getElementById('btn-comm-reset-exc');
    const excCountBadge = document.getElementById('comm-exc-count-badge');
    if (resetExcBtn) {
        resetExcBtn.style.display = (excludedRowsToRender.length > 0) ? 'inline-flex' : 'none';
    }
    if (excCountBadge) {
        excCountBadge.innerText = String(excludedRowsToRender.length);
    }


    // ==========================================
    // การเปิด/ซ่อนตารางตามรูปแบบเอกสารที่เลือก
    // ==========================================
    if (docType === 'weekly') {
        // รอบสัปดาห์: แสดงเฉพาะ ขายส่ง + รับซื้อ (ซ่อนตารางมือ 2 ออกไปเลย ไม่แทรก)
        if (secWholesale) secWholesale.style.display = 'block';
        if (secUsedPhone) secUsedPhone.style.display = 'none';
        if (secBuyback) secBuyback.style.display = 'block';
    } else if (docType === 'monthly') {
        // รายเดือน: แสดงเฉพาะ ขายสด iPhone มือ 2 เท่านั้น
        if (secWholesale) secWholesale.style.display = 'none';
        if (secUsedPhone) secUsedPhone.style.display = 'block';
        if (secBuyback) secBuyback.style.display = 'none';
    } else if (docType === 'backoffice') {
        // ทีมหลังบ้าน: แสดงเฉพาะ รายการขายส่ง
        if (secWholesale) secWholesale.style.display = 'block';
        if (secUsedPhone) secUsedPhone.style.display = 'none';
        if (secBuyback) secBuyback.style.display = 'none';
    }


    // ==========================================
    // ส่วนสรุปยอดท้ายเอกสาร (Footer Summary)
    // ==========================================
    // กล่องสรุปเซลส์
    document.getElementById('comm-sum-ws-qty').innerText = totalWsQty.toLocaleString('th-TH');
    document.getElementById('comm-sum-ws-comm').innerText = totalWsCommission.toLocaleString('th-TH');

    document.getElementById('comm-sum-used-qty').innerText = totalUsedQty.toLocaleString('th-TH');
    document.getElementById('comm-sum-used-comm').innerText = totalUsedCommission.toLocaleString('th-TH');

    document.getElementById('comm-sum-bb-qty').innerText = totalBbQty.toLocaleString('th-TH');
    document.getElementById('comm-sum-bb-comm').innerText = totalBbCommission.toLocaleString('th-TH');

    // สรุปยอดตัดออกในกล่องสรุปเซลส์
    const sumExcRow = document.getElementById('comm-row-sum-excluded');
    const sumExcQtyEl = document.getElementById('comm-sum-exc-qty');
    if (sumExcRow && sumExcQtyEl) {
        if (totalExcQty > 0) {
            sumExcRow.style.display = 'flex';
            sumExcQtyEl.innerText = totalExcQty.toLocaleString('th-TH');
        } else {
            sumExcRow.style.display = 'none';
        }
    }

    let grandTotalCommission = 0;
    if (docType === 'weekly') {
        grandTotalCommission = totalWsCommission + totalBbCommission;
    } else if (docType === 'monthly') {
        grandTotalCommission = totalUsedCommission;
    } else {
        grandTotalCommission = 0;
    }
    document.getElementById('comm-sum-grand-total').innerText = grandTotalCommission.toLocaleString('th-TH');

    // กล่องทีมหลังบ้าน (ยอดขายส่งทั้งหมด x 30 บาท/เครื่อง)
    const totalBackofficeWsQty = allSales.filter(item => {
        if (item.sheetName !== "Phone2") return false;
        const brandStr = (item.brand || '').toString().toLowerCase();
        const modelStr = (item.model || '').toString().toLowerCase();
        const isApple = brandStr.includes('apple') || modelStr.includes('iphone') || modelStr.includes('ipad');
        if (!isApple) return false;

        const d = parseTimestampToDate(item.date);
        if (!d) return false;
        const t = d.getTime();
        if (t < startTimestamp || t > endTimestamp) return false;

        const saleType = (item.saleType || '').toString().trim();
        return saleType.includes("ส่งร้านพาร์ทเนอร์") && !saleType.includes("เงินเชื่อ");
    }).length;

    const backofficeCommission = totalBackofficeWsQty * 30;
    document.getElementById('comm-bo-sum-qty').innerText = totalBackofficeWsQty.toLocaleString('th-TH');
    document.getElementById('comm-bo-sum-comm').innerText = backofficeCommission.toLocaleString('th-TH');

    // ปรับการแสดงผลกล่องสรุปตามประเภทเอกสาร
    const empBox = document.getElementById('comm-box-emp-summary');
    const boBox = document.getElementById('comm-box-bo-summary');

    // แถวต่างๆ ในกล่องสรุปเซลส์
    const rowWsQty = document.getElementById('comm-row-sum-ws-qty');
    const rowWsComm = document.getElementById('comm-row-sum-ws-comm');
    const rowUsedQty = document.getElementById('comm-row-sum-used-qty');
    const rowUsedComm = document.getElementById('comm-row-sum-used-comm');
    const rowBbQty = document.getElementById('comm-row-sum-bb-qty');
    const rowBbComm = document.getElementById('comm-row-sum-bb-comm');

    if (docType === 'weekly') {
        if (empBox) empBox.style.display = 'block';
        if (boBox) boBox.style.display = 'block';

        // รอบสัปดาห์: แสดง ขายส่ง + รับซื้อ, ซ่อน ขายมือ 2
        if (rowWsQty) rowWsQty.style.display = 'flex';
        if (rowWsComm) rowWsComm.style.display = 'flex';
        if (rowUsedQty) rowUsedQty.style.display = 'none';
        if (rowUsedComm) rowUsedComm.style.display = 'none';
        if (rowBbQty) rowBbQty.style.display = 'flex';
        if (rowBbComm) rowBbComm.style.display = 'flex';

    } else if (docType === 'monthly') {
        if (empBox) empBox.style.display = 'block';
        if (boBox) boBox.style.display = 'none'; // ซ่อนหลังบ้านในใบรายเดือน

        // รายเดือน: แสดงเฉพาะ ขายมือ 2, ซ่อน ขายส่ง และ รับซื้อ
        if (rowWsQty) rowWsQty.style.display = 'none';
        if (rowWsComm) rowWsComm.style.display = 'none';
        if (rowUsedQty) rowUsedQty.style.display = 'flex';
        if (rowUsedComm) rowUsedComm.style.display = 'flex';
        if (rowBbQty) rowBbQty.style.display = 'none';
        if (rowBbComm) rowBbComm.style.display = 'none';

    } else if (docType === 'backoffice') {
        if (empBox) empBox.style.display = 'none';
        if (boBox) {
            boBox.style.display = 'block';
            boBox.style.border = '2px solid #3b82f6';
        }
    }
}

// ฟังก์ชันสั่งพิมพ์ / เซฟเป็น PDF
function printCommissionVoucher() {
    window.print();
}


