console.log("%cSTOP!", "color: red; font-size: 50px; font-weight: bold; font-family: sans-serif; text-shadow: 2px 2px 0 #000;");
console.log("%cBawal ka dito panget", "color: white; background: red; font-size: 16px; padding: 5px 10px; border-radius: 5px;");

const API_BASE_URL = "https://support-backend-ldos.onrender.com/api";
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby5NWblcfFNB3_IaTWwV5JtNC6_bF_yKTJynQg0DaB1R6aqv97ps8PjZT63Z32bvjA/exec";
const ADMIN_SECRET_KEY = "SupportAdmin@2026"; 

let globalTimeOffset = 0;
let globalDayOverride = "";
let adminMathAns = 0; 
let pendingTimeOutStudent = null;
let pendingTimeOutAction = null;
let pendingTimeOutDate = null;
let settingsClickCount = 0; 
let pendingExemptId = null;
let pendingExemptDate = null;
let pendingExemptCheckbox = null;
let isSyncing = false;
let isBackendLocked = false; 

setInterval(() => {
    if (globalTimeOffset !== 0) {
        document.getElementById('simulated-clock-container').style.display = 'block';
        document.getElementById('simulated-time-display').textContent = getPHT().toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute:'2-digit', second:'2-digit'});
    } else {
        document.getElementById('simulated-clock-container').style.display = 'none';
    }
}, 1000);

const isAuthenticated = function() {
    const tk = sessionStorage.getItem('_auth_tkn_x92');
    if(!tk) return false;
    try {
        const parsed = JSON.parse(atob(tk));
        return parsed.valid === true && (Date.now() - parsed.timestamp < 12 * 60 * 60 * 1000); 
    } catch(e) {
        return false;
    }
};

function applyVisitorMode() {
    let tk = sessionStorage.getItem('_auth_tkn_x92');
    if (!tk) return;
    
    let userRole = 'ADMIN';
    try { 
        userRole = JSON.parse(atob(tk)).role || 'ADMIN'; 
    } catch(e) {}

    if (userRole === 'VISITOR') {
        document.querySelectorAll('.remove-btn, .history-trash-btn, button[onclick^="openEditStudentModal"], .admin-edit-icon').forEach(btn => {
            btn.style.display = 'none';
        });

        const createStudentBtn = document.querySelector('button[onclick="createStudent()"]');
        if (createStudentBtn) createStudentBtn.style.display = 'none';

        const sheetBtn = document.getElementById('history-sheet-btn');
        const exportBtn = document.getElementById('history-export-btn');
        if (sheetBtn) sheetBtn.style.display = 'none';
        if (exportBtn) exportBtn.style.display = 'none';

        const exemptAllBtn = document.getElementById('history-exempt-all-btn');
        if (exemptAllBtn) exemptAllBtn.style.display = 'none';
        
        document.querySelectorAll('input[onchange^="toggleExempt"]').forEach(chk => {
            chk.disabled = true;
            chk.style.cursor = 'not-allowed';
        });

        document.querySelectorAll('.day-toggle').forEach(btn => {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
            btn.style.pointerEvents = 'none'; 
        });

        const createDateCardBtn = document.querySelector('button[onclick="createManualHistoryDate()"]');
        if (createDateCardBtn) createDateCardBtn.style.display = 'none';

        const settingsSection = document.getElementById('sec-settings');
        if (settingsSection) {
            settingsSection.querySelectorAll('button').forEach(btn => {
                btn.disabled = true;
                btn.style.opacity = '0.3';
                btn.style.cursor = 'not-allowed';
            });
            settingsSection.querySelectorAll('input[type="checkbox"]').forEach(chk => {
                chk.disabled = true;
                chk.style.cursor = 'not-allowed';
            });
        }
    }
}

async function checkBackendLockStatus() {
    try {
        const response = await fetch(`${API_BASE_URL}/config/status`, { cache: 'no-store' });
        if (response.ok) {
            const data = await response.json();
            globalTimeOffset = data.timeOffset || 0;
            globalDayOverride = data.dayOverride || "";

            const localLockState = localStorage.getItem('attendance_closed') === 'true';
            
            if (isAuthenticated() && localLockState && !data.isLocked) {
                await fetch(`${API_BASE_URL}/config/toggle`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Admin-Key': ADMIN_SECRET_KEY },
                    body: JSON.stringify({ isLocked: true })
                });
                isBackendLocked = true;
                applyUIRestrictions();
            } else {
                if (isBackendLocked !== data.isLocked) {
                    isBackendLocked = data.isLocked;
                    localStorage.setItem('attendance_closed', isBackendLocked ? 'true' : 'false');
                    applyUIRestrictions();
                }
            }
        }
    } catch (err) {}
}

async function toggleAttendanceState(elem) {
    let tk = sessionStorage.getItem('_auth_tkn_x92');
    let userRole = 'ADMIN';
    try { userRole = JSON.parse(atob(tk)).role || 'ADMIN'; } catch(e) {}
    
    if (userRole === 'VISITOR') {
        elem.checked = !elem.checked;
        alert("Access Denied: View Only Mode.");
        return;
    }

    const isClosed = elem.checked;
    const knob = document.getElementById('sys-toggle-knob');
    if(knob) {
        knob.style.transform = isClosed ? 'translateX(20px)' : 'translateX(0px)';
        knob.parentElement.style.backgroundColor = isClosed ? 'var(--error)' : '#334155';
    }

    try {
        const response = await fetch(`${API_BASE_URL}/config/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Admin-Key': ADMIN_SECRET_KEY },
            body: JSON.stringify({ isLocked: isClosed })
        });
        
        if (response.ok) {
            const data = await response.json();
            isBackendLocked = data.isLocked;
            localStorage.setItem('attendance_closed', isBackendLocked ? 'true' : 'false');
            applyUIRestrictions();
        } else {
            elem.checked = !isClosed;
            if(knob) {
                knob.style.transform = !isClosed ? 'translateX(20px)' : 'translateX(0px)';
                knob.parentElement.style.backgroundColor = !isClosed ? 'var(--error)' : '#334155';
            }
            alert("Failed to sync lock state with server. Check security key.");
        }
    } catch (err) {
        elem.checked = !isClosed;
    }
}

function applyUIRestrictions() {
    const isLocked = localStorage.getItem('attendance_closed') === 'true';
    const lockToggle = document.getElementById('sys-attendance-toggle');
    const lockKnob = document.getElementById('sys-toggle-knob');
    if(lockToggle && lockKnob) {
        lockToggle.checked = isLocked;
        lockKnob.style.transform = isLocked ? 'translateX(20px)' : 'translateX(0px)';
        lockKnob.parentElement.style.backgroundColor = isLocked ? 'var(--error)' : '#334155';
    }
    
    const studentLockOverlay = document.getElementById('student-lock-overlay');
    if (studentLockOverlay) studentLockOverlay.style.display = isLocked ? 'flex' : 'none';

    const adminLiveLockOverlay = document.getElementById('admin-live-lock-overlay');
    if (adminLiveLockOverlay) adminLiveLockOverlay.style.display = isLocked ? 'flex' : 'none';

    document.querySelectorAll('.btn-in, .btn-out').forEach(btn => {
        if(!btn.getAttribute('onclick') || (!btn.getAttribute('onclick').includes('Modal') && !btn.getAttribute('onclick').includes('togglePortal'))) {
            btn.disabled = isLocked;
            btn.style.opacity = isLocked ? '0.5' : '1';
            btn.style.cursor = isLocked ? 'not-allowed' : 'pointer';
        }
    });
}

function promptSyncConflict(studentCount) {
    if (document.getElementById('ghost-sync-modal')) return;

    const modalHtml = `
    <div id="ghost-sync-modal" class="modal-overlay" style="display: flex; z-index: 999999;">
        <div class="modal-content" style="max-width: 400px; text-align: left; border-color: #f59e0b;">
            <h3 style="color: #f59e0b; margin-top: 0; font-size: 1.5rem;">⚠️ Server Restart Detected</h3>
            <p style="color: var(--text-main); font-size: 14px; line-height: 1.5;">The cloud server went to sleep and its memory was cleared. Your device currently has <strong>${studentCount} students</strong> saved locally.</p>
            <p style="color: var(--text-muted); font-size: 12px; margin-bottom: 25px;">If this is old "ghost" data, destroy it. If you want to restore the live system, upload it.</p>
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <button onclick="resolveSync('push')" style="background: var(--success); color: #000; font-weight: bold; border: none; padding: 12px; border-radius: 6px; cursor: pointer;">RESTORE CLOUD DATA</button>
                <button onclick="resolveSync('wipe')" style="background: var(--error); color: #fff; font-weight: bold; border: none; padding: 12px; border-radius: 6px; cursor: pointer;">DESTROY LOCAL GHOSTS</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

window.resolveSync = async function(action) {
    document.getElementById('ghost-sync-modal').remove();
    sessionStorage.setItem('sync_conflict_resolved', 'true');
    sessionStorage.setItem('sync_action', action);

    if (action === 'push') {
        await pushStudentsToCloud();
        await pushLogsToCloud();
        alert('Cloud restored successfully!');
    } else {
        localStorage.setItem('students', JSON.stringify([]));
        localStorage.setItem('attendanceLogs', JSON.stringify([]));
        localStorage.setItem('deletedDates', JSON.stringify([]));
        if (document.getElementById('admin-dashboard-view').classList.contains('active')) {
            renderStudents();
            renderLogs();
            renderMainDashboard();
            renderSchedule();
        }
        alert('Local ghost data destroyed!');
    }
}

async function pullFromCloud() {
    if (isSyncing) return;
    isSyncing = true;
    try {
        const stuRes = await fetch(`${API_BASE_URL}/students`, { cache: 'no-store' });
        if (stuRes.ok) {
            const cloudStudents = await stuRes.json();
            const localStudents = JSON.parse(localStorage.getItem('students')) || [];

            if (cloudStudents.length > 0) {
                if (cloudStudents[0].id === 'SYS_WIPE_ALL') {
                    localStorage.setItem('students', JSON.stringify([]));
                } else {
                    localStorage.setItem('students', JSON.stringify(cloudStudents));
                }
            } else if (localStudents.length > 0 && isAuthenticated()) {
                if (!sessionStorage.getItem('sync_conflict_resolved')) {
                    promptSyncConflict(localStudents.length);
                    isSyncing = false;
                    return; 
                } else if (sessionStorage.getItem('sync_action') === 'push') {
                    await pushStudentsToCloud();
                }
            }
        }
        
        const logRes = await fetch(`${API_BASE_URL}/logs`, { cache: 'no-store' });
        if (logRes.ok) {
            const cloudLogs = await logRes.json();
            const localLogs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];

            if (cloudLogs.length > 0) {
                if (cloudLogs[0].id === 'SYS_WIPE_ALL' || cloudLogs[0].id === 'SYS_WIPE_LOGS') {
                    localStorage.setItem('attendanceLogs', JSON.stringify([]));
                } else {
                    localStorage.setItem('attendanceLogs', JSON.stringify(cloudLogs));
                }
            } else if (localLogs.length > 0 && isAuthenticated()) {
                if (sessionStorage.getItem('sync_action') === 'push') {
                    await pushLogsToCloud();
                }
            }
        }
    } catch (err) {}
    isSyncing = false;
}

async function pushStudentsToCloud() {
    if (!isAuthenticated()) return; 
    const data = JSON.parse(localStorage.getItem('students')) || [];
    try {
        await fetch(`${API_BASE_URL}/students/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Admin-Key': ADMIN_SECRET_KEY },
            body: JSON.stringify(data)
        });
    } catch (err) {}
}

async function pushLogsToCloud() {
    if (!isAuthenticated()) return; 
    const data = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    try {
        const response = await fetch(`${API_BASE_URL}/logs/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Admin-Key': ADMIN_SECRET_KEY },
            body: JSON.stringify(data)
        });
        if (response.status === 403) {
            isBackendLocked = true;
            localStorage.setItem('attendance_closed', 'true');
            applyUIRestrictions();
        }
    } catch (err) {}
}

function getShiftDateDetails() {
    const pht = getPHT();
    const hour = pht.getHours();
    const min = pht.getMinutes();
    
    let shiftDate = new Date(pht);
    if (hour < 4 || (hour === 4 && min === 0)) {
        shiftDate.setDate(shiftDate.getDate() - 1);
    }
    
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    return {
        dateStr: shiftDate.toLocaleDateString('en-US'),
        dayStr: globalDayOverride || days[shiftDate.getDay()],
        hour: hour,
        min: min,
        realTimeStr: pht.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
}

const ACCENT_COLORS = {
    'Red': { hex: '#ef4444', rgb: '239, 68, 68' },
    'Yellow': { hex: '#f59e0b', rgb: '245, 158, 11' },
    'Green': { hex: '#22c55e', rgb: '34, 197, 94' },
    'Blue': { hex: '#66fcf1', rgb: '102, 252, 241' },
    'Pink': { hex: '#ec4899', rgb: '236, 72, 153' },
    'Purple': { hex: '#a855f7', rgb: '168, 85, 247' },
    'White': { hex: '#ffffff', rgb: '255, 255, 255' }
};

if (!localStorage.getItem('students')) localStorage.setItem('students', JSON.stringify([]));
if (!localStorage.getItem('attendanceLogs')) localStorage.setItem('attendanceLogs', JSON.stringify([]));
if (!localStorage.getItem('deletedDates')) localStorage.setItem('deletedDates', JSON.stringify([]));

let _studentsInit = JSON.parse(localStorage.getItem('students')) || [];
let _needsSave = false;
_studentsInit.forEach(s => {
    if (s.assignedDay !== undefined) {
        s.assignedDays = s.assignedDay === 'Unassigned' ? [] : [s.assignedDay];
        delete s.assignedDay;
        _needsSave = true;
    }
    if (!s.assignedDays) {
        s.assignedDays = [];
        _needsSave = true;
    }
    if (!s.gcHandle) {
        s.gcHandle = '';
        _needsSave = true;
    }
    if (!s.classLevel) {
        s.classLevel = 'Freshmen'; 
        _needsSave = true;
    }
});
if (_needsSave && isAuthenticated()) {
    localStorage.setItem('students', JSON.stringify(_studentsInit));
    pushStudentsToCloud();
}

document.addEventListener('DOMContentLoaded', () => {
    loadAccentColor();
    document.body.classList.add('portal-mode');

    checkBackendLockStatus().then(() => {
        applyUIRestrictions();
        initDevUI();
    });
    
    setTimeout(initSliderCaptcha, 50);

    isIncognito().then(isPrivate => {
        if (isPrivate) {
            const form = document.getElementById('turn-in-form');
            const locked = document.getElementById('locked-screen');
            const incognito = document.getElementById('incognito-screen');
            const sysLock = document.getElementById('student-lock-overlay');
            
            if(form) form.style.display = 'none';
            if(locked) locked.style.display = 'none';
            if(sysLock) sysLock.style.display = 'none';
            if(incognito) incognito.style.display = 'flex'; 
        }
    });

    generateAdminCaptcha();

    const adminCanvas = document.getElementById('admin-captcha-canvas');
    if (adminCanvas) adminCanvas.addEventListener('click', generateAdminCaptcha);

    const thumb = document.getElementById('studentSliderThumb');
    if (thumb) {
        thumb.addEventListener('mousedown', onDragStart);
        thumb.addEventListener('touchstart', onDragStart, {passive: true});
        window.addEventListener('mousemove', onDragMove, {passive: false});
        window.addEventListener('touchmove', onDragMove, {passive: false});
        window.addEventListener('mouseup', onDragEnd);
        window.addEventListener('touchend', onDragEnd);
    }

    const refreshBtn = document.getElementById('studentRefreshCaptcha');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            if(!isCaptchaSolved) initSliderCaptcha();
        });
    }

    if (isAuthenticated()) {
        switchView('admin-dashboard-view');
        const savedSec = sessionStorage.getItem('currentAdminSec') || 'sec-dashboard';
        const navItems = document.querySelectorAll('.admin-nav-item');
        let targetNav = navItems[0];
        navItems.forEach(item => {
            if (item.getAttribute('onclick') && item.getAttribute('onclick').includes(savedSec)) {
                targetNav = item;
            }
        });
        switchAdminSection(savedSec, targetNav);
    }

    pullFromCloud().then(() => {
        checkDeviceLock(); 
        if (document.getElementById('admin-dashboard-view').classList.contains('active')) {
            renderStudents();
            renderLogs();
            renderMainDashboard();
            renderDutyToday();
            renderSchedule();
        }
    });
});

setInterval(async () => {
    await pullFromCloud(); 
    await checkBackendLockStatus(); 
    checkDeviceLock(); 

    if (isAuthenticated()) {
        if (document.getElementById('admin-dashboard-view').classList.contains('active')) {
            renderStudents();
            renderSchedule();
            renderDashboardSummary();
            renderLogs();
            renderMainDashboard();
            renderDutyToday();
            
            const secHist = document.getElementById('sec-history');
            if (secHist && secHist.classList.contains('active')) {
                if (document.getElementById('history-table-container').style.display === 'none') {
                    renderHistoryView();
                }
            }
        }
    }
}, 15000);

async function loginAdmin(event) {
    if (event) event.preventDefault();
    const usernameInput = document.getElementById('admin-user').value;
    const passwordInput = document.getElementById('admin-pass').value;
    const captchaInput = document.getElementById('admin-captcha-input').value;
    const errorMsg = document.getElementById('login-message');
    
    const loginBtn = document.querySelector('#admin-login-view .btn-primary');

    if (!captchaInput || captchaInput !== currentAdminCaptchaString) {
        errorMsg.textContent = "Security check failed. Please enter the correct text.";
        errorMsg.style.display = 'block';
        generateAdminCaptcha(); 
        return;
    }

    loginBtn.textContent = "AUTHENTICATING...";
    loginBtn.disabled = true;
    loginBtn.style.opacity = "0.7";

    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: usernameInput, password: passwordInput })
        });
        
        const textResponse = await response.text();
        let data;
        try {
            data = JSON.parse(textResponse);
        } catch (err) {
            throw new Error("Server returned an HTML error page.");
        }

        if (data.success) {
            const userRole = data.role || 'ADMIN'; 
            const tokenPayload = btoa(JSON.stringify({ valid: true, timestamp: Date.now(), role: userRole, username: usernameInput }));
            sessionStorage.setItem('_auth_tkn_x92', tokenPayload);
            
            switchView('admin-dashboard-view');
            
            document.getElementById('admin-user').value = '';
            document.getElementById('admin-pass').value = '';
            document.getElementById('admin-captcha-input').value = '';
            errorMsg.textContent = '';
            
            await pullFromCloud();
            fetchAdminAccounts();
            renderStudents();
            renderLogs(); 
            renderMainDashboard();
            renderSchedule();
            renderDutyToday();
        } else {
            errorMsg.textContent = data.message || "Invalid credentials.";
            errorMsg.style.display = 'block';
            generateAdminCaptcha(); 
        }
    } catch (error) {
        errorMsg.textContent = "Server error. Please try again.";
        errorMsg.style.display = 'block';
    } finally {
        loginBtn.textContent = "Login";
        loginBtn.disabled = false;
        loginBtn.style.opacity = "1";
    }
}

function logoutAdmin() {
    sessionStorage.removeItem('_auth_tkn_x92');
    sessionStorage.removeItem('currentAdminSec');
    sessionStorage.removeItem('adminLoggedIn'); 
    switchView('student-view');
}

function generateAdminMathCaptcha() {
    const n1 = Math.floor(Math.random() * 10) + 1;
    const n2 = Math.floor(Math.random() * 10) + 1;
    adminMathAns = n1 + n2;
    const qEl = document.getElementById('admin-math-q');
    if (qEl) qEl.textContent = `${n1} + ${n2}`;
    const aEl = document.getElementById('admin-math-a');
    if (aEl) aEl.value = '';
}

async function createAdminAccount() {
    if(!isAuthenticated()) return;
    const user = document.getElementById('new-admin-user').value.trim();
    const pass = document.getElementById('new-admin-pass').value.trim();
    const mathInput = document.getElementById('admin-math-a').value.trim();
    const roleEl = document.getElementById('new-admin-role');
    const role = roleEl ? roleEl.value : 'ADMIN';
    
    if(!user || !pass || mathInput === "") {
        showMessage('acc-message', 'Please fill all fields', 'error');
        return;
    }

    if(parseInt(mathInput) !== adminMathAns) {
        showMessage('acc-message', 'Incorrect security math answer.', 'error');
        generateAdminMathCaptcha();
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/add-account`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Admin-Key': ADMIN_SECRET_KEY },
            body: JSON.stringify({ username: user, password: pass, role: role })
        });

        const data = await response.json();
        if(data.success) {
            showMessage('acc-message', 'Account created successfully!', 'success');
            document.getElementById('new-admin-user').value = '';
            document.getElementById('new-admin-pass').value = '';
            generateAdminMathCaptcha(); 
            fetchAdminAccounts();
        } else {
            showMessage('acc-message', data.message, 'error');
            generateAdminMathCaptcha(); 
        }
    } catch(err) {
        showMessage('acc-message', 'Server error connection to backend.', 'error');
    }
}

async function fetchAdminAccounts() {
    if(!isAuthenticated()) return;
    const list = document.getElementById('admin-accounts-list');
    if (!list) return;
    list.innerHTML = '<li style="padding: 10px; text-align: center;">Loading accounts...</li>';

    try {
        const response = await fetch(`${API_BASE_URL}/accounts`, { cache: 'no-store' });
        const data = await response.json();
        list.innerHTML = '';
        data.forEach(account => {
            const user = account.username;
            const role = account.role || 'ADMIN';
            const lastOnlineText = timeSinceEpoch(account.lastOnline);

            const li = document.createElement('li');
            li.style.padding = '10px 15px';
            li.style.borderBottom = '1px solid #2d313c';
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';
            
            let delBtn = user !== 'MainHeadAcc' 
                ? `<button onclick="deleteAdminAccount('${user}')" class="remove-btn" style="background: transparent; color: var(--error); border: 1px solid var(--error); padding: 4px 8px; font-size: 10px; cursor: pointer;">DELETE</button>` 
                : `<span style="font-size: 10px; color: var(--text-muted);">DEFAULT</span>`;

            li.innerHTML = `
                <div style="display: flex; flex-direction: column;">
                    <span style="color: var(--text-main); font-weight: bold;">${user} <span style="font-size: 9px; color: var(--text-muted); background: rgba(255,255,255,0.1); padding: 2px 4px; border-radius: 3px; margin-left: 5px;">${role}</span></span>
                    <span style="font-size: 10px; color: #f59e0b; margin-top: 3px;">Last Online: ${lastOnlineText}</span>
                </div>
                ${delBtn}
            `;
            list.appendChild(li);
        });
        applyVisitorMode();
    } catch (err) {
        list.innerHTML = `<li style="color: var(--error); padding: 10px; text-align: center;">Unable to load accounts.</li>`;
    }
}

function timeSinceEpoch(epochMillis) {
    if (!epochMillis) return "Never logged in";
    const seconds = Math.floor((Date.now() - epochMillis) / 1000);
    if (seconds < 0) return "Just now"; 
    
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " year(s) ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " month(s) ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m ago";
    
    if (seconds < 10) return "Just now";
    return Math.floor(seconds) + "s ago";
}

async function deleteAdminAccount(user) {
    if(!isAuthenticated()) return;
    if(!confirm(`Are you sure you want to delete the account: ${user}?`)) return;
    try {
        const response = await fetch(`${API_BASE_URL}/delete-account/${user}`, { 
            method: 'DELETE',
            headers: { 'X-Admin-Key': ADMIN_SECRET_KEY }
        });
        const data = await response.json();
        if(data.success) fetchAdminAccounts();
        else alert(data.message);
    } catch(err) {}
}

async function generateRegistrationLink() {
    if(!isAuthenticated()) return;
    try {
        const response = await fetch(`${API_BASE_URL}/register/generate`, { 
            method: 'POST',
            headers: { 'X-Admin-Key': ADMIN_SECRET_KEY }
        });
        const data = await response.json();
        const link = `https://os-register.vercel.app/?token=${data.token}`;
        document.getElementById('reg-link-container').style.display = 'block';
        document.getElementById('reg-link-output').value = link;
    } catch (err) {
        alert("Failed to generate link. Server might be offline.");
    }
}

function copyRegLink() {
    if(!isAuthenticated()) return;
    const linkInput = document.getElementById('reg-link-output');
    linkInput.select();
    document.execCommand("copy");
    alert("Secure link copied! Send this to the students.");
}

async function createStudent() {
    if(!isAuthenticated()) return;
    const btn = document.querySelector('button[onclick="createStudent()"]');
    if (btn && btn.disabled) return; 

    const name = document.getElementById('new-student-name').value.trim();
    const idNum = document.getElementById('new-student-id').value.trim();
    const gcHandle = document.getElementById('new-student-gc').value.trim();
    const classLevel = document.getElementById('new-student-class').value;

    if (!name || !idNum || !classLevel) {
        showMessage('admin-message', 'Please fill in Name, ID, and Class Level.', 'error');
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.textContent = "ADDING...";
        btn.style.opacity = "0.7";
        btn.style.cursor = "not-allowed";
    }

    try {
        await pullFromCloud();
        const students = JSON.parse(localStorage.getItem('students')) || [];
        
        if (students.some(s => String(s.id).toLowerCase() === String(idNum).toLowerCase())) {
            showMessage('admin-message', 'Student ID already exists!', 'error');
            return;
        }

        students.push({ name: name, id: idNum, assignedDays: [], gcHandle: gcHandle, classLevel: classLevel });
        localStorage.setItem('students', JSON.stringify(students));
        await pushStudentsToCloud(); 
        
        document.getElementById('new-student-name').value = '';
        document.getElementById('new-student-id').value = '';
        document.getElementById('new-student-gc').value = '';
        document.getElementById('new-student-class').value = '';
        showMessage('admin-message', 'Student created globally!', 'success');
        
        renderStudents();
        renderSchedule();
        renderMainDashboard(); 
        renderDashboardSummary();
        renderDutyToday();
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = "ADD STUDENT";
            btn.style.opacity = "1";
            btn.style.cursor = "pointer";
        }
    }
}

async function updateStudentGC() {
    if(!isAuthenticated()) return;
    const idNum = document.getElementById('edit-student-id').value.trim();
    const newGc = document.getElementById('edit-student-gc').value.trim();

    if (!idNum) {
        showMessage('edit-gc-message', 'Please enter a Student ID.', 'error');
        return;
    }

    await pullFromCloud();
    const students = JSON.parse(localStorage.getItem('students')) || [];
    const studentIndex = students.findIndex(s => String(s.id) === String(idNum));

    if (studentIndex === -1) {
        showMessage('edit-gc-message', 'Student ID not found!', 'error');
        return;
    }

    students[studentIndex].gcHandle = newGc;
    localStorage.setItem('students', JSON.stringify(students));
    await pushStudentsToCloud(); 

    document.getElementById('edit-student-id').value = '';
    document.getElementById('edit-student-gc').value = '';
    showMessage('edit-gc-message', 'GC Handle updated globally!', 'success');
    
    renderStudents();
    renderSchedule();
    renderMainDashboard(); 
    renderDashboardSummary();
    renderDutyToday();
}

function openEditStudentModal(id) {
    if(!isAuthenticated()) return;
    const students = JSON.parse(localStorage.getItem('students')) || [];
    const s = students.find(x => String(x.id) === String(id));
    if (!s) return;
    
    document.getElementById('edit-stu-orig-id').value = s.id;
    document.getElementById('edit-stu-name').value = s.name || '';
    document.getElementById('edit-stu-id').value = s.id;
    
    const gcSelect = document.getElementById('edit-stu-gc');
    const gcOther = document.getElementById('edit-stu-gc-other');
    const classSelect = document.getElementById('edit-stu-class');
    
    gcSelect.value = '';
    gcOther.style.display = 'none';
    gcOther.value = '';
    
    classSelect.value = s.classLevel || 'Freshmen';

    if (s.gcHandle) {
        const optionExists = Array.from(gcSelect.options).some(opt => opt.value === s.gcHandle);
        if (optionExists) {
            gcSelect.value = s.gcHandle;
        } else {
            gcSelect.value = 'Other';
            gcOther.style.display = 'block';
            gcOther.value = s.gcHandle;
        }
    }

    document.getElementById('edit-student-modal').style.display = 'flex';
}

function toggleEditStudentOtherGC(val) {
    const otherInput = document.getElementById('edit-stu-gc-other');
    if (val === 'Other') {
        otherInput.style.display = 'block';
    } else {
        otherInput.style.display = 'none';
        otherInput.value = '';
    }
}

function closeEditStudentModal() {
    document.getElementById('edit-student-modal').style.display = 'none';
}

async function saveStudentEdit() {
    if(!isAuthenticated()) return;
    const btn = document.querySelector('#edit-student-modal .btn-primary');
    if (btn && btn.disabled) return;

    const origId = document.getElementById('edit-stu-orig-id').value;
    const name = document.getElementById('edit-stu-name').value.trim();
    const newId = document.getElementById('edit-stu-id').value.trim();
    const classLevel = document.getElementById('edit-stu-class').value;
    let gc = document.getElementById('edit-stu-gc').value;
    
    if (gc === 'Other') gc = document.getElementById('edit-stu-gc-other').value.trim();

    if (!name || !newId) {
        alert("Name and Student ID cannot be empty.");
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.textContent = "SAVING...";
        btn.style.opacity = "0.7";
        btn.style.cursor = "not-allowed";
    }

    try {
        await pullFromCloud();
        const students = JSON.parse(localStorage.getItem('students')) || [];
        
        if (newId !== origId && students.some(x => String(x.id).toLowerCase() === String(newId).toLowerCase())) {
            alert("This Student ID is already in use by another student!");
            return;
        }

        const s = students.find(x => String(x.id) === String(origId));
        if (s) {
            s.name = name;
            s.id = newId; 
            s.gcHandle = gc;
            s.classLevel = classLevel;
            localStorage.setItem('students', JSON.stringify(students));
            await pushStudentsToCloud();
            
            if (origId !== newId) {
                let logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
                let logsUpdated = false;
                logs.forEach(l => {
                    if (String(l.id) === String(origId)) {
                        l.id = newId;
                        l.name = name; 
                        logsUpdated = true;
                    }
                });
                if (logsUpdated) {
                    localStorage.setItem('attendanceLogs', JSON.stringify(logs));
                    await pushLogsToCloud();
                }
            }
            
            renderStudents();
            renderSchedule();
            renderMainDashboard();
            renderDashboardSummary();
            renderDutyToday();
            if (document.getElementById('sec-history').classList.contains('active')) renderHistoryView();
        }
        closeEditStudentModal();
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = "Save Changes";
            btn.style.opacity = "1";
            btn.style.cursor = "pointer";
        }
    }
}

async function deleteStudent(idNum) {
    if(!isAuthenticated()) return;
    if (!confirm("Are you sure you want to remove this student? This will not delete their existing logs but will prevent them from logging in.")) return;
    
    await pullFromCloud();
    let students = JSON.parse(localStorage.getItem('students')) || [];
    students = students.filter(s => String(s.id) !== String(idNum));
    localStorage.setItem('students', JSON.stringify(students));
    await pushStudentsToCloud(); 
    
    const searchStudInput = document.getElementById('search-student');
    if (searchStudInput && searchStudInput.value.trim() !== '') {
        searchStudents();
    } else {
        renderStudents();
    }

    if (document.getElementById('admin-dashboard-view').classList.contains('active')) {
        renderSchedule(); 
        renderMainDashboard();
        renderDashboardSummary();
        renderLogs();
        renderDutyToday();
    }
}

async function toggleStudentDay(id, day) {
    if(!isAuthenticated()) return;
    const students = JSON.parse(localStorage.getItem('students')) || [];
    const student = students.find(s => String(s.id) === String(id));
    
    if (student) {
        if (!student.assignedDays) student.assignedDays = [];
        if (student.assignedDays.includes(day)) {
            student.assignedDays = student.assignedDays.filter(d => d !== day);
        } else {
            student.assignedDays.push(day);
        }
        
        localStorage.setItem('students', JSON.stringify(students));
        
        if (document.getElementById('admin-dashboard-view').classList.contains('active')) {
            renderSchedule();
            renderMainDashboard();
            renderDashboardSummary();
            renderLogs();
            renderDutyToday();
        }
        pushStudentsToCloud(); 
    }
}

async function logAttendanceAction(student, action, endOfShiftDetails = null, overrideDateStr = null) {
    if(isBackendLocked) {
        alert("The system is currently locked. Attendance cannot be recorded.");
        return;
    }

    const shift = getShiftDateDetails();
    const dateStr = overrideDateStr || shift.dateStr;
    
    const newLog = {
        name: student.name || 'Unknown',
        id: student.id,
        action: action,
        time: shift.realTimeStr,
        date: dateStr,
        details: endOfShiftDetails 
    };

    let logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    let wasTombstoned = false;
    
    if(logs.some(l => l.id === 'SYS_DELETED_DATE' && l.date === dateStr)) {
        logs = logs.filter(l => !(l.id === 'SYS_DELETED_DATE' && l.date === dateStr));
        wasTombstoned = true;
    }

    logs.push(newLog);
    localStorage.setItem('attendanceLogs', JSON.stringify(logs));

    if (wasTombstoned) {
         try {
            await fetch(`${API_BASE_URL}/logs/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Admin-Key': ADMIN_SECRET_KEY },
                body: JSON.stringify(logs)
            });
         } catch(e) {}
    } else {
         try {
            await fetch(`${API_BASE_URL}/logs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newLog)
            });
        } catch (e) {}
    }
    
    if (document.getElementById('admin-dashboard-view').classList.contains('active')) {
        renderLogs();
        renderMainDashboard();
        renderDashboardSummary();
        renderDutyToday();
        
        const secHist = document.getElementById('sec-history');
        if (secHist && secHist.classList.contains('active')) {
            if (document.getElementById('history-table-container').style.display === 'none') {
                renderHistoryView();
            }
        }
    }
}

async function deleteLog(originalIndex) {
    if(!isAuthenticated()) return;
    if (!confirm("Delete this attendance record?")) return;
    
    await pullFromCloud();
    let logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    logs.splice(originalIndex, 1); 
    
    localStorage.setItem('attendanceLogs', JSON.stringify(logs));
    await pushLogsToCloud(); 
    
    renderLogs();
    renderMainDashboard();
    renderDashboardSummary(); 
    renderDutyToday();
}

function deleteHistoryDate(dateStr, event) {
    if(!isAuthenticated()) return;
    if (event) event.stopPropagation(); 
    
    if(confirm(`⚠️ WARNING ⚠️\n\nAre you sure you want to completely delete ALL attendance logs for ${dateStr}?\n\nThis will permanently remove this day from the students' Performance Stats.`)) {
        
        let logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
        logs = logs.filter(l => l.date !== dateStr);
        logs.push({
            name: 'SYSTEM_DELETED',
            id: 'SYS_DELETED_DATE',
            action: 'DELETED',
            time: '00:00 AM',
            date: dateStr,
            details: null
        });
        
        localStorage.setItem('attendanceLogs', JSON.stringify(logs));
        pushLogsToCloud(); 
        
        renderHistoryView();
        if (document.getElementById('admin-dashboard-view').classList.contains('active')) {
            renderMainDashboard();
        }
        
        const titleEl = document.getElementById('history-table-title');
        if (titleEl && titleEl.textContent.includes(dateStr)) {
            document.getElementById('history-table-container').style.display = 'none';
        }
    }
}

function toggleExempt(idNum, dateStr, checkbox) {
    if(!isAuthenticated()) return;
    if (checkbox.checked) {
        pendingExemptId = idNum;
        pendingExemptDate = dateStr;
        pendingExemptCheckbox = checkbox;
        const modal = document.getElementById('exempt-modal');
        if (modal) modal.style.display = 'flex';
    } else {
        removeExemptions(idNum, dateStr);
    }
}

function closeExemptModal() {
    const modal = document.getElementById('exempt-modal');
    if (modal) modal.style.display = 'none';
    if (pendingExemptCheckbox) pendingExemptCheckbox.checked = false;
    pendingExemptId = null;
    pendingExemptDate = null;
    pendingExemptCheckbox = null;
}

async function applyExempt(type) {
    if(!isAuthenticated()) return;
    await pullFromCloud();
    let logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    const students = JSON.parse(localStorage.getItem('students')) || [];
    const s = students.find(x => String(x.id) === String(pendingExemptId));
    
    if (s) {
        const existingInLog = logs.find(l => String(l.id) === String(pendingExemptId) && l.date === pendingExemptDate && l.action.includes('Time In') && !l.action.includes('Exempted'));
        const existingOutLog = logs.find(l => String(l.id) === String(pendingExemptId) && l.date === pendingExemptDate && l.action.includes('Time Out') && !l.action.includes('Exempted'));

        if (type === 'IN' || type === 'BOTH') {
            logs = logs.filter(l => !(String(l.id) === String(pendingExemptId) && l.date === pendingExemptDate && l.action.includes('Time In')));
            logs.push({
                name: s.name,
                id: s.id,
                action: 'Time In (Exempted)',
                time: 'Exempted',
                date: pendingExemptDate,
                details: null,
                originalLog: existingInLog || null
            });
        }
        
        if (type === 'OUT' || type === 'BOTH') {
            logs = logs.filter(l => !(String(l.id) === String(pendingExemptId) && l.date === pendingExemptDate && l.action.includes('Time Out')));
            logs.push({
                name: s.name,
                id: s.id,
                action: 'Time Out (Exempted)',
                time: 'Exempted',
                date: pendingExemptDate,
                details: { gcHandle: '-', announcement: '-', whoPosted: '-' },
                originalLog: existingOutLog || null
            });
        }

        localStorage.setItem('attendanceLogs', JSON.stringify(logs));
        await pushLogsToCloud();
        
        renderHistoryTable(pendingExemptDate);
        renderMainDashboard();
    }
    
    const modal = document.getElementById('exempt-modal');
    if (modal) modal.style.display = 'none';
    pendingExemptId = null;
    pendingExemptDate = null;
    pendingExemptCheckbox = null;
}

async function removeExemptions(idNum, dateStr) {
    if(!isAuthenticated()) return;
    await pullFromCloud();
    let logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    
    const exemptLogs = logs.filter(l => String(l.id) === String(idNum) && l.date === dateStr && l.action.includes('Exempted'));
    logs = logs.filter(l => !(String(l.id) === String(idNum) && l.date === dateStr && l.action.includes('Exempted')));
    
    exemptLogs.forEach(el => {
        if (el.originalLog) logs.push(el.originalLog);
    });
    
    localStorage.setItem('attendanceLogs', JSON.stringify(logs));
    await pushLogsToCloud();
    
    renderHistoryTable(dateStr);
    renderMainDashboard();
}

async function exemptAllForDate(dateStr) {
    if(!isAuthenticated()) return;
    
    const verificationText = prompt(`⚠️ WARNING ⚠️\n\nThis will mark EVERYONE on ${dateStr} as Exempted.\n\nTo confirm, type exactly:\nExempt Everyone`);
    
    if (verificationText === "Exempt Everyone") {
        await pullFromCloud();
        let logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
        const students = JSON.parse(localStorage.getItem('students')) || [];

        const targetDateObj = new Date(dateStr);
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const targetDayStr = dayNames[targetDateObj.getDay()];
        
        const scheduledStudents = students.filter(s => s.assignedDays && s.assignedDays.includes(targetDayStr) && s.id !== 'SYS_CONFIG_X99' && s.id !== 'SYS_WIPE_ALL');

        scheduledStudents.forEach(s => {
            const idNum = s.id;
            const existingInLog = logs.find(l => String(l.id) === String(idNum) && l.date === dateStr && l.action.includes('Time In') && !l.action.includes('Exempted'));
            const existingOutLog = logs.find(l => String(l.id) === String(idNum) && l.date === dateStr && l.action.includes('Time Out') && !l.action.includes('Exempted'));

            logs = logs.filter(l => !(String(l.id) === String(idNum) && l.date === dateStr));

            logs.push({
                name: s.name,
                id: s.id,
                action: 'Time In (Exempted)',
                time: 'Exempted',
                date: dateStr,
                details: null,
                originalLog: existingInLog || null
            });

            logs.push({
                name: s.name,
                id: s.id,
                action: 'Time Out (Exempted)',
                time: 'Exempted',
                date: dateStr,
                details: { gcHandle: '-', announcement: '-', whoPosted: '-' },
                originalLog: existingOutLog || null
            });
        });

        localStorage.setItem('attendanceLogs', JSON.stringify(logs));
        await pushLogsToCloud();
        
        renderHistoryTable(dateStr);
        renderMainDashboard();
        
        alert(`Successfully marked everyone as exempted for ${dateStr}!`);
        
    } else if (verificationText !== null) {
        alert("Action canceled. The confirmation text did not match exactly.");
    }
}

async function createManualHistoryDate() {
    if(!isAuthenticated()) return;
    const dateInput = prompt("Enter the date for the new History Card (e.g., 5/4/2026):");
    if (!dateInput || dateInput.trim() === "") return;

    let dateStr;
    try {
        const parsed = new Date(dateInput.trim());
        if(isNaN(parsed)) throw new Error("");
        dateStr = parsed.toLocaleDateString('en-US'); 
    } catch(e) {
        alert("Invalid date format. Please use M/D/YYYY (e.g., 5/4/2026).");
        return;
    }
    
    await pullFromCloud();
    let logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    
    const isTombstoned = logs.some(l => l.id === 'SYS_DELETED_DATE' && l.date === dateStr);
    const hasActualLogs = logs.some(l => l.date === dateStr && l.id !== 'SYS_DELETED_DATE');

    if (hasActualLogs && !isTombstoned) {
        alert("A card for this date already exists.");
        return;
    }

    logs = logs.filter(l => !(l.id === 'SYS_DELETED_DATE' && l.date === dateStr));

    const initLog = {
        name: 'SYSTEM_INIT',
        id: 'SYS_INIT_DATE',
        action: 'INIT',
        time: '00:00 AM',
        date: dateStr,
        details: null
    };

    logs.push(initLog);
    localStorage.setItem('attendanceLogs', JSON.stringify(logs));
    
    try {
        if (isTombstoned) {
            await fetch(`${API_BASE_URL}/logs/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Admin-Key': ADMIN_SECRET_KEY },
                body: JSON.stringify(logs)
            });
        } else {
            await fetch(`${API_BASE_URL}/logs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(initLog)
            });
        }
    } catch(e) {}

    renderHistoryView();
    alert(`Date Card for ${dateStr} created successfully!`);
}

async function devClearLogs() {
    if(!isAuthenticated()) return;
    if(confirm("This will permanently delete ALL attendance logs from the cloud database ACROSS ALL DEVICES. Continue?")) {
        localStorage.setItem('attendanceLogs', JSON.stringify([]));
        localStorage.setItem('deletedDates', JSON.stringify([])); 
        
        try {
            await fetch(`${API_BASE_URL}/logs/clear`, {
                method: 'DELETE',
                headers: { 'X-Admin-Key': ADMIN_SECRET_KEY }
            });
        } catch(e) {}
        
        if (document.getElementById('admin-dashboard-view').classList.contains('active')) {
            renderLogs();
            renderHistoryView();
            renderMainDashboard();
            renderDutyToday();
        }
        showMessage('dev-message', 'All logs cleared globally!', 'success');
    }
}

async function factoryReset() {
    if(!isAuthenticated()) return;
    const firstConfirm = confirm("⚠️ DANGER ⚠️\n\nThis will permanently delete ALL registered students, attendance logs, custom UI settings, and custom Admin accounts ACROSS ALL DEVICES.\n\nAre you absolutely sure you want to do this?");
    
    if (firstConfirm) {
        const verificationText = prompt("To confirm GLOBAL Factory Reset, type exactly:\n\nRESET EVERYTHING");
        
        if (verificationText === "RESET EVERYTHING") {
            
            try {
                await fetch(`${API_BASE_URL}/students/factory-reset`, {
                    method: 'DELETE',
                    headers: { 'X-Admin-Key': ADMIN_SECRET_KEY }
                });
                await fetch(`${API_BASE_URL}/logs/factory-reset`, {
                    method: 'DELETE',
                    headers: { 'X-Admin-Key': ADMIN_SECRET_KEY }
                });
            } catch(e) {}

            localStorage.clear();
            sessionStorage.clear();
            
            alert("System wiped globally. All other connected devices will automatically erase their data within 15 seconds. The page will now reload.");
            window.location.reload();
            
        } else if (verificationText !== null) {
            alert("Factory Reset canceled. The text did not match exactly.");
        }
    }
}

async function handleTimeIn() {
    if (isBackendLocked) {
        showMessage('student-message', 'Access Denied: The system is locked.', 'error');
        return; 
    }

    if (!isCaptchaSolved) {
        showMessage('student-message', 'Please complete the slider puzzle.', 'error');
        initSliderCaptcha();
        checkDeviceLock(); 
        return;
    }

    const idNum = document.getElementById('student-id-input').value.trim();
    if (!idNum) { 
        showMessage('student-message', 'Please enter your ID number.', 'error'); 
        initSliderCaptcha();
        return; 
    }

    const timeInBtn = document.querySelector('.btn-in');
    if(timeInBtn) {
        timeInBtn.textContent = "PROCESSING...";
        timeInBtn.disabled = true;
        timeInBtn.style.opacity = "0.7";
    }

    try {
        await pullFromCloud();
        if (isBackendLocked) {
            showMessage('student-message', 'Access Denied: The system is locked.', 'error');
            applyUIRestrictions();
            return;
        }

        const students = JSON.parse(localStorage.getItem('students')) || [];
        const student = students.find(s => String(s.id) === String(idNum));
        if (!student) { 
            showMessage('student-message', 'ID not found.', 'error'); 
            initSliderCaptcha(); 
            checkDeviceLock();
            return; 
        }

        const shift = getShiftDateDetails();
        if (!student.assignedDays || student.assignedDays.length === 0) {
            showMessage('student-message', 'You have no assigned schedule. Please contact the Support Head.', 'error');
            initSliderCaptcha();
            checkDeviceLock();
            return;
        }
        if (!student.assignedDays.includes(shift.dayStr)) {
            showMessage('student-message', `Access Denied: You are not scheduled for today. Your shifts are on: ${student.assignedDays.join(', ')}.`, 'error');
            initSliderCaptcha();
            checkDeviceLock();
            return;
        }

        const todayLogs = getTodayLogs(idNum);
        if (todayLogs.some(l => l.action.includes('Time In') || l.action === 'No Attendance')) {
            showMessage('student-message', 'You already have an attendance record for today.', 'error');
            initSliderCaptcha();
            checkDeviceLock();
            return;
        }

        if (shift.hour < 5) {
            showMessage('student-message', 'Time In opens at 5:00 AM.', 'error');
            initSliderCaptcha();
            return;
        } else if (shift.hour > 12 || (shift.hour === 12 && shift.min >= 1)) {
            await logAttendanceAction(student, 'No Attendance', null, shift.dateStr);
            showMessage('student-message', 'Time In is closed. You are marked as No Attendance.', 'error');
        } else if (shift.hour > 8 || (shift.hour === 8 && shift.min >= 1)) { 
            await logAttendanceAction(student, 'Time In (Late)', null, shift.dateStr);
            showMessage('student-message', 'Successfully logged Time In (Late)', 'success');
        } else { 
            await logAttendanceAction(student, 'Time In', null, shift.dateStr);
            showMessage('student-message', 'Successfully logged Time In', 'success');
        }
        
        localStorage.setItem('activeDeviceStudent', student.id);
        initSliderCaptcha(); 
        checkDeviceLock(); 

    } finally {
        if(timeInBtn) {
            timeInBtn.textContent = "Time In";
            timeInBtn.disabled = false;
            timeInBtn.style.opacity = "1";
        }
    }
}

async function handleTimeOut() {
    if (isBackendLocked) {
        showMessage('student-message', 'Access Denied: The system is locked.', 'error');
        return; 
    }

    if (!isCaptchaSolved) {
        showMessage('student-message', 'Please complete the slider puzzle.', 'error');
        initSliderCaptcha();
        checkDeviceLock();
        return;
    }

    const idNum = document.getElementById('student-id-input').value.trim();
    if (!idNum) { 
        showMessage('student-message', 'Please enter your ID number.', 'error'); 
        initSliderCaptcha();
        return; 
    }

    const timeOutBtn = document.querySelector('.btn-out');
    if(timeOutBtn) {
        timeOutBtn.textContent = "PROCESSING...";
        timeOutBtn.disabled = true;
        timeOutBtn.style.opacity = "0.7";
    }

    try {
        await pullFromCloud();
        if (isBackendLocked) {
            showMessage('student-message', 'Access Denied: The system is locked.', 'error');
            applyUIRestrictions();
            return;
        }

        const students = JSON.parse(localStorage.getItem('students')) || [];
        const student = students.find(s => String(s.id) === String(idNum));
        if (!student) { 
            showMessage('student-message', 'ID not found.', 'error'); 
            initSliderCaptcha(); 
            checkDeviceLock();
            return; 
        }

        const shift = getShiftDateDetails();
        if (!student.assignedDays || student.assignedDays.length === 0) {
            showMessage('student-message', 'You have no assigned schedule.', 'error');
            initSliderCaptcha();
            checkDeviceLock();
            return;
        }
        if (!student.assignedDays.includes(shift.dayStr)) {
            showMessage('student-message', `Access Denied: You are not scheduled for this shift.`, 'error');
            initSliderCaptcha();
            checkDeviceLock();
            return;
        }

        const todayLogs = getTodayLogs(idNum);
        
        if (todayLogs.some(l => l.action === 'Time Out (Exempted)')) {
            showMessage('student-message', 'You are marked as Exempted for this shift.', 'error');
            initSliderCaptcha();
            checkDeviceLock();
            return;
        }

        const hasTimeIn = todayLogs.some(l => l.action.includes('Time In'));

        if (!hasTimeIn) {
            showMessage('student-message', 'No Time In record found for this shift.', 'error');
            initSliderCaptcha();
            checkDeviceLock();
            return;
        }

        if (todayLogs.some(l => l.action.includes('Time Out') && !l.action.includes('Exempted'))) {
            showMessage('student-message', 'You have already timed out for this shift.', 'error');
            initSliderCaptcha();
            checkDeviceLock();
            return;
        }

        if (shift.hour >= 5 && shift.hour < 17) {
            showMessage('student-message', 'Time Out opens at 5:00 PM.', 'error');
            initSliderCaptcha();
            checkDeviceLock();
            return;
        } 

        pendingTimeOutStudent = student;
        pendingTimeOutAction = (shift.hour >= 0 && shift.hour <= 4) ? 'Time Out (Late)' : 'Time Out';
        pendingTimeOutDate = shift.dateStr; 
        
        document.getElementById('gc-handle').value = student.gcHandle || '';
        document.getElementById('gc-handle-other').style.display = 'none';
        document.getElementById('gc-handle-other').value = '';
        
        if (student.gcHandle && !document.querySelector(`#gc-handle option[value="${student.gcHandle}"]`)) {
             document.getElementById('gc-handle').value = 'Other';
             document.getElementById('gc-handle-other').style.display = 'block';
             document.getElementById('gc-handle-other').value = student.gcHandle;
        }

        document.querySelectorAll('input[name="announcement"]').forEach(r => r.checked = false);
        document.querySelectorAll('input[name="who-posted"]').forEach(r => r.checked = false);
        document.getElementById('timeout-modal-message').textContent = '';
        
        const modal = document.getElementById('timeout-modal');
        if (modal) modal.style.display = 'flex';

    } finally {
        if(timeOutBtn) {
            timeOutBtn.textContent = "Time Out";
            timeOutBtn.disabled = false;
            timeOutBtn.style.opacity = "1";
        }
    }
}

async function finalizeTimeOut() {
    if(isBackendLocked) {
        alert("The system is currently locked. Attendance cannot be recorded.");
        return;
    }

    let gcHandle = document.getElementById('gc-handle').value;
    const announcement = document.querySelector('input[name="announcement"]:checked');
    const whoPosted = document.querySelector('input[name="who-posted"]:checked');

    if (gcHandle === 'Other') {
        const otherVal = document.getElementById('gc-handle-other').value.trim();
        if (!otherVal) { showMessage('timeout-modal-message', 'Please type your specific GC Handle.', 'error'); return; }
        gcHandle = otherVal;
    }

    if (!gcHandle || !announcement || !whoPosted) {
        showMessage('timeout-modal-message', 'Please answer all questions before submitting.', 'error');
        return;
    }

    const submitBtn = document.querySelector('#timeout-modal .btn-primary');
    if(submitBtn) {
        submitBtn.textContent = "SAVING...";
        submitBtn.disabled = true;
        submitBtn.style.opacity = "0.7";
    }

    try {
        await logAttendanceAction(pendingTimeOutStudent, pendingTimeOutAction, {
            gcHandle: gcHandle,
            announcement: announcement.value,
            whoPosted: whoPosted.value
        }, pendingTimeOutDate);

        const modal = document.getElementById('timeout-modal');
        if (modal) modal.style.display = 'none';
        showMessage('student-message', `Successfully logged ${pendingTimeOutAction}`, 'success');

        pendingTimeOutStudent = null;
        pendingTimeOutAction = null;
        pendingTimeOutDate = null;
        
        localStorage.removeItem('activeDeviceStudent');
        
        initSliderCaptcha(); 
        checkDeviceLock(); 
    } finally {
        if(submitBtn) {
            submitBtn.textContent = "Submit & Time Out";
            submitBtn.disabled = false;
            submitBtn.style.opacity = "1";
        }
    }
}

function enforceHistoryLimit() {}

function renderStudents() {
    if(!isAuthenticated()) return;
    const list = document.getElementById('registered-students-list');
    if (!list) return;
    
    const students = JSON.parse(localStorage.getItem('students')) || [];
    const searchInput = document.getElementById('search-student');
    const query = searchInput ? searchInput.value.toLowerCase() : '';
    
    list.innerHTML = '';
    
    let filteredStudents = students.filter(student => 
        student.id !== 'SYS_WIPE_ALL' && student.id !== 'SYS_CONFIG_X99' &&
        (((student.name || '').toLowerCase().includes(query)) || 
        (student.id && String(student.id).toLowerCase().includes(query)))
    );

    filteredStudents.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    filteredStudents.forEach(student => {
        const li = document.createElement('li');
        const safeId = String(student.id).replace(/'/g, "\\'"); 
        let gcTag = student.gcHandle ? `<span class="gc-tag">${student.gcHandle}</span>` : '';
        let classTag = student.classLevel ? `<span class="gc-tag" style="background: rgba(168, 85, 247, 0.2); color: #a855f7; border-color: #a855f7;">${student.classLevel}</span>` : '';

        li.innerHTML = `
            <div style="display: flex; flex-direction: column;">
                <div style="display: flex; align-items: center; gap: 5px;"><span style="font-weight: bold; color: var(--text-main);">${student.name || 'Unknown'}</span> ${classTag} ${gcTag}</div>
                <span style="font-size: 0.8rem; color: var(--text-muted);">ID: ${student.id}</span>
            </div>
            <div style="display: flex; gap: 5px;">
                <button class="edit-btn" onclick="openEditStudentModal('${safeId}')" style="background: rgba(var(--accent-rgb), 0.1); color: var(--accent); padding: 6px 15px; border-radius: 4px; font-size: 11px; border: 1px solid var(--accent); cursor: pointer;">EDIT</button>
                <button onclick="viewPerformance('${safeId}')" style="background: rgba(var(--accent-rgb), 0.1); color: var(--accent); padding: 6px 15px; border-radius: 4px; font-size: 11px; border: 1px solid var(--accent); cursor: pointer;">VIEW PERF</button>
            </div>
        `;
        list.appendChild(li);
    });
    applyVisitorMode();
}

function searchStudents() {
    renderStudents();
}

function changeAccentColor(colorName) {
    const colorData = ACCENT_COLORS[colorName];
    if (colorData) {
        document.documentElement.style.setProperty('--accent', colorData.hex);
        document.documentElement.style.setProperty('--accent-rgb', colorData.rgb);
        localStorage.setItem('uiAccentColor', colorName);
        
        document.querySelectorAll('.color-btn').forEach(btn => {
            btn.style.outline = 'none';
            btn.style.transform = 'scale(1)';
        });
        const activeBtn = document.getElementById('btn-color-' + colorName.toLowerCase());
        if(activeBtn) {
            activeBtn.style.outline = '2px solid white';
            activeBtn.style.outlineOffset = '2px';
            activeBtn.style.transform = 'scale(1.1)';
        }
    }
}

function loadAccentColor() {
    const savedColor = localStorage.getItem('uiAccentColor') || 'Blue';
    changeAccentColor(savedColor);
}

function togglePortal() {
    const currentView = document.querySelector('.view.active');
    if (!currentView) return;
    if (currentView.id === 'student-view') {
        switchView('admin-login-view');
    } else {
        switchView('student-view');
    }
}

async function switchView(viewId) {
    if (viewId === 'admin-dashboard-view' && !isAuthenticated()) {
        alert("Security Violation: Unauthorized access attempt blocked.");
        logoutAdmin();
        return;
    }

    document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
    const targetView = document.getElementById(viewId);
    if(targetView) targetView.classList.add('active');
    
    document.querySelectorAll('.message').forEach(msg => msg.textContent = '');
    
    if (viewId === 'student-view') {
        const isPrivate = await isIncognito();
        if (isPrivate) {
            const form = document.getElementById('turn-in-form');
            const locked = document.getElementById('locked-screen');
            const incognito = document.getElementById('incognito-screen');
            const sysLock = document.getElementById('student-lock-overlay');
            
            if(form) form.style.display = 'none';
            if(locked) locked.style.display = 'none';
            if(sysLock) sysLock.style.display = 'none';
            if(incognito) incognito.style.display = 'flex';
        } else {
            const form = document.getElementById('turn-in-form');
            const locked = document.getElementById('locked-screen');
            const incognito = document.getElementById('incognito-screen');
            if(incognito) incognito.style.display = 'none';
            if(form) form.style.display = 'block';
            
            checkDeviceLock(); 
            setTimeout(initSliderCaptcha, 50); 
        }
        checkBackendLockStatus(); 
    }
    
    generateAdminCaptcha();
    
    if (viewId === 'admin-dashboard-view') {
        document.body.classList.remove('portal-mode'); 
        const mh = document.getElementById('main-header');
        const moh = document.getElementById('mobile-header');
        if(mh) mh.style.display = 'none';
        if(moh) moh.style.display = 'none';

        try {
            const tk = sessionStorage.getItem('_auth_tkn_x92');
            if (tk) {
                const parsedTk = JSON.parse(atob(tk));
                const displayUser = document.getElementById('display-username');
                const displayRole = document.getElementById('display-role');
                if (displayUser) displayUser.textContent = parsedTk.username || 'Admin';
                if (displayRole) displayRole.textContent = parsedTk.role === 'VISITOR' ? 'VISITOR' : 'ADMIN';
            }
        } catch(e) {}
        
        enforceHistoryLimit();
        renderStudents();
        renderLogs();
        renderMainDashboard(); 
        renderDutyToday(); 
        checkBackendLockStatus(); 
    } else {
        document.body.classList.add('portal-mode'); 
        const mh = document.getElementById('main-header');
        const moh = document.getElementById('mobile-header');
        if(mh) mh.style.display = 'flex';
        if(moh) moh.style.display = 'flex';
        
        document.querySelectorAll('.portal-toggle-btn').forEach(btn => {
            btn.textContent = viewId === 'student-view' ? 'Support Head Portal' : 'Student Portal';
        });
    }
}

function openDevPasswordModal() {
    document.getElementById('dev-password-input').value = '';
    document.getElementById('dev-password-message').textContent = '';
    document.getElementById('dev-password-modal').style.display = 'flex';
}

function closeDevPasswordModal() {
    document.getElementById('dev-password-modal').style.display = 'none';
    settingsClickCount = 0; 
}

function verifyDevPassword() {
    const pwd = document.getElementById('dev-password-input').value;
    if (pwd === "PowerSettings@099") {
        document.getElementById('dev-password-modal').style.display = 'none';
        document.getElementById('dev-tools-panel').style.display = 'flex';
        showMessage('dev-message', 'Developer Tools Unlocked.', 'success');
        settingsClickCount = 0;
    } else {
        document.getElementById('dev-password-message').textContent = "Incorrect password.";
    }
}

function switchAdminSection(sectionId, navElement) {
    if(!isAuthenticated()) return;
    
    let tk = sessionStorage.getItem('_auth_tkn_x92');
    let userRole = 'ADMIN';
    try { userRole = JSON.parse(atob(tk)).role || 'ADMIN'; } catch(e) {}

    document.querySelectorAll('.admin-section').forEach(sec => sec.classList.remove('active'));
    const sec = document.getElementById(sectionId);
    if(sec) sec.classList.add('active');
    
    document.querySelectorAll('.admin-nav-item').forEach(item => item.classList.remove('active'));
    if(navElement) navElement.classList.add('active');

    sessionStorage.setItem('currentAdminSec', sectionId);

    if (sectionId === 'sec-settings') {
        if (userRole !== 'VISITOR') {
            settingsClickCount++;
            if (settingsClickCount >= 20 && document.getElementById('dev-tools-panel') && document.getElementById('dev-tools-panel').style.display !== 'flex') {
                openDevPasswordModal();
            }
        }
        fetchAdminAccounts(); 
        generateAdminMathCaptcha();
        checkBackendLockStatus(); 
    } else {
        settingsClickCount = 0; 
    }

    if (sectionId === 'sec-schedule') renderSchedule();
    if (sectionId === 'sec-dashboard') renderMainDashboard();
    if (sectionId === 'sec-history') renderHistoryView();
    if (sectionId === 'sec-attendance') {
        const tabSum = document.getElementById('tab-btn-summary');
        if(tabSum) tabSum.click();
        renderDashboardSummary();
        renderDutyToday(); 
    }
}

function switchAttendanceTab(tab) {
    const paneSummary = document.getElementById('att-pane-summary');
    const paneLogs = document.getElementById('att-pane-logs');
    const btnSummary = document.getElementById('tab-btn-summary');
    const btnLogs = document.getElementById('tab-btn-logs');

    if (tab === 'summary') {
        if(paneSummary) paneSummary.style.display = 'flex';
        if(paneLogs) paneLogs.style.display = 'none';
        if(btnSummary) btnSummary.classList.add('active');
        if(btnLogs) btnLogs.classList.remove('active');
        renderDashboardSummary();
    } else {
        if(paneSummary) paneSummary.style.display = 'none';
        if(paneLogs) paneLogs.style.display = 'flex';
        if(btnSummary) btnSummary.classList.remove('active');
        if(btnLogs) btnLogs.classList.add('active');
        renderLogs();
    }
}

function handleGlobalSearch() {
    const attPane = document.getElementById('att-pane-summary');
    if (attPane && attPane.style.display !== 'none') {
        renderDashboardSummary();
    } else {
        renderLogs();
    }
}

function renderLogs() {
    if(!isAuthenticated()) return;
    const logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    const students = JSON.parse(localStorage.getItem('students')) || [];
    const validStudents = students.filter(s => s.id !== 'SYS_CONFIG_X99' && s.id !== 'SYS_WIPE_ALL');
    const tbody = document.getElementById('attendance-logs-body');
    
    const searchInput = document.getElementById('search-attendance-global');
    const sortSelect = document.getElementById('sort-attendance-global');
    
    const query = searchInput ? searchInput.value.toLowerCase() : '';
    const sortVal = sortSelect ? sortSelect.value : 'NAME_ASC';

    if (!tbody) return;
    tbody.innerHTML = '';
    
    const shift = getShiftDateDetails();
    const todayStr = shift.dateStr;
    const currentDay = shift.dayStr;
    
    let logsWithIndex = logs.map((log, index) => ({ ...log, originalIndex: index }));

    let filteredLogs = logsWithIndex.filter(log => {
        if (log.id === 'SYS_WIPE_ALL' || log.id === 'SYS_WIPE_LOGS') return false;
        
        const student = validStudents.find(s => String(s.id) === String(log.id));
        const isScheduledToday = student && student.assignedDays && student.assignedDays.includes(currentDay);
        
        return log.date === todayStr &&
               isScheduledToday &&
               ((log.name || '').toLowerCase().includes(query) || String(log.id).toLowerCase().includes(query));
    });

    filteredLogs.sort((a, b) => {
        const stuA = validStudents.find(s => String(s.id) === String(a.id)) || {};
        const stuB = validStudents.find(s => String(s.id) === String(b.id)) || {};
        
        const nameA = (a.name || '').toLowerCase().trim();
        const nameB = (b.name || '').toLowerCase().trim();
        const idA = (a.id || '').toString().trim();
        const idB = (b.id || '').toString().trim();
        const classA = (stuA.classLevel || 'zzzz').toLowerCase().trim();
        const classB = (stuB.classLevel || 'zzzz').toLowerCase().trim();

        if (sortVal === 'NAME_ASC') return nameA < nameB ? -1 : (nameA > nameB ? 1 : 0);
        if (sortVal === 'NAME_DESC') return nameA > nameB ? -1 : (nameA < nameB ? 1 : 0);
        if (sortVal === 'ID_ASC') return idA.localeCompare(idB, undefined, {numeric: true});
        if (sortVal === 'CLASS_FRESH') {
            if (classA === 'freshmen' && classB !== 'freshmen') return -1;
            if (classA !== 'freshmen' && classB === 'freshmen') return 1;
            return nameA < nameB ? -1 : (nameA > nameB ? 1 : 0);
        }
        if (sortVal === 'CLASS_UPPER') {
            if (classA === 'upperclassmen' && classB !== 'upperclassmen') return -1;
            if (classA !== 'upperclassmen' && classB === 'upperclassmen') return 1;
            return nameA < nameB ? -1 : (nameA > nameB ? 1 : 0);
        }
        return b.originalIndex - a.originalIndex; 
    });

    filteredLogs.forEach(log => {
        const tr = document.createElement('tr');
        
        let statusColor = 'var(--text-main)';
        if (log.action.includes('Late')) statusColor = '#f59e0b'; 
        else if (log.action.includes('In')) statusColor = 'var(--success)';
        else if (log.action.includes('Out')) statusColor = 'var(--error)';
        else if (log.action === 'No Attendance') statusColor = '#6b7280';
        else if (log.action.includes('Exempted')) statusColor = '#66fcf1';

        let todayShiftBtn = '';
        if ((log.action.includes('Out') || log.action.includes('Exempted')) && log.details) {
            todayShiftBtn = `<button onclick="viewTodayShift('${log.id}', '${log.date}')" style="background: rgba(var(--accent-rgb), 0.1); color: var(--accent); padding: 5px 10px; border-radius: 4px; font-size: 10px; font-weight: bold; border: 1px solid var(--accent); margin-right: 8px; cursor: pointer;">TODAY SHIFT</button>`;
        }

        tr.innerHTML = `
            <td>${log.name || 'Unknown'}</td>
            <td>${log.id}</td>
            <td style="color: ${statusColor}; font-weight: bold;">${log.action}</td>
            <td>${log.time}</td>
            <td>
                <div class="button-cell-wrap">
                    ${todayShiftBtn}
                    <button class="remove-btn" onclick="deleteLog(${log.originalIndex})">REMOVE</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    applyVisitorMode();
}

function renderDutyToday() {
    if(!isAuthenticated()) return;
    const students = JSON.parse(localStorage.getItem('students')) || [];
    const validStudents = students.filter(s => s.id !== 'SYS_CONFIG_X99' && s.id !== 'SYS_WIPE_ALL');
    const logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    const dutyList = document.getElementById('duty-today-list');
    if (!dutyList) return;

    const shift = getShiftDateDetails();
    const currentDay = shift.dayStr;
    const todayStr = shift.dateStr;

    const scheduledToday = validStudents.filter(student => student.assignedDays && student.assignedDays.includes(currentDay));
    scheduledToday.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    dutyList.innerHTML = '';

    if (scheduledToday.length === 0) {
        dutyList.innerHTML = '<p class="placeholder-text" style="text-align:center; padding: 20px;">No one is scheduled for duty today.</p>';
        return;
    }

    scheduledToday.forEach(student => {
        const hasTimedIn = logs.some(l => String(l.id) === String(student.id) && l.date === todayStr && l.action.includes('Time In'));
        const hasTimedOut = logs.some(l => String(l.id) === String(student.id) && l.date === todayStr && l.action.includes('Time Out'));

        let statusDot = '#f59e0b'; 
        if (hasTimedOut) {
            statusDot = '#6b7280'; 
        } else if (hasTimedIn) {
            statusDot = '#22c55e'; 
        } else {
            statusDot = 'var(--error)'; 
        }

        const card = document.createElement('div');
        card.className = 'duty-card';
        card.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 10px; height: 10px; border-radius: 50%; background-color: ${statusDot}; flex-shrink: 0;"></div>
                <strong style="color: var(--text-main); font-size: 13px;">${student.name || 'Unknown'}</strong>
            </div>
            <span style="font-size: 11px; color: var(--text-muted);">${student.gcHandle || ''}</span>
        `;
        dutyList.appendChild(card);
    });
}

function exportToExcel(dateStr = null) {
    if(!isAuthenticated()) return;
    const logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    const students = JSON.parse(localStorage.getItem('students')) || [];
    const validStudents = students.filter(s => s.id !== 'SYS_CONFIG_X99' && s.id !== 'SYS_WIPE_ALL');
    const shift = getShiftDateDetails();
    const targetDate = dateStr || shift.dateStr;
    const targetLogs = logs.filter(l => l.date === targetDate);

    const targetDateObj = new Date(targetDate);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const targetDayStr = dayNames[targetDateObj.getDay()];

    const data = [
        ["NAME", "ID NUMBER", "GROUP", "TIME IN", "TIME OUT", "DATE", "GC HANDLE", "ANNOUNCEMENT", "POSTED BY"]
    ];

    const sortedStudents = [...validStudents].sort((a, b) => {
        const classA = (a.classLevel || 'zzzz').toLowerCase().trim();
        const classB = (b.classLevel || 'zzzz').toLowerCase().trim();
        const nameA = (a.name || '').toLowerCase().trim();
        const nameB = (b.name || '').toLowerCase().trim();

        if (classA === 'upperclassmen' && classB !== 'upperclassmen') return -1;
        if (classA !== 'upperclassmen' && classB === 'upperclassmen') return 1;
        
        return nameA < nameB ? -1 : (nameA > nameB ? 1 : 0);
    });

    sortedStudents.forEach(student => {
        const studentLogs = targetLogs.filter(l => String(l.id) === String(student.id));
        
        let isScheduled = student.assignedDays && student.assignedDays.includes(targetDayStr);
        if (studentLogs.some(l => l.action.includes('Time In') || l.action.includes('Time Out') || l.action === 'No Attendance')) {
            isScheduled = true;
        }

        let inText = isScheduled ? 'Absent' : 'No Duty Today';
        let outText = isScheduled ? 'Absent' : 'No Duty Today';
        let gc = '-';
        let ann = '-';
        let post = '-';

        if (studentLogs.length > 0) {
            const timeInLog = studentLogs.find(l => l.action.includes('Time In'));
            const timeOutLog = studentLogs.find(l => l.action.includes('Time Out'));
            const noAttLog = studentLogs.find(l => l.action === 'No Attendance');
            
            const inExempted = timeInLog && timeInLog.action.includes('Exempted');
            const outExempted = timeOutLog && timeOutLog.action.includes('Exempted');
            const hasAnyExemption = inExempted || outExempted;

            if (noAttLog && !hasAnyExemption) {
                inText = 'Absent';
                outText = 'Absent';
            } else {
                if (inExempted) {
                    inText = 'Exempted';
                } else if (timeInLog) {
                    const status = timeInLog.action.includes('Late') ? 'Time in(Late)' : 'Time in';
                    inText = `${timeInLog.time} - ${status}`;
                } else {
                    inText = 'Absent';
                }

                if (outExempted) {
                    outText = 'Exempted';
                } else if (timeOutLog) {
                    const status = timeOutLog.action.includes('Late') ? 'Time out(Late)' : 'Time out';
                    outText = `${timeOutLog.time} - ${status}`;
                    const details = timeOutLog.details || {};
                    gc = details.gcHandle || '-';
                    ann = details.announcement || '-';
                    post = details.whoPosted || '-';
                } else {
                    outText = 'Absent';
                }
            }
        }

        data.push([student.name || 'Unknown', student.id, student.classLevel || 'Freshmen', inText, outText, targetDate, gc, ann, post]);
    });

    const ws = XLSX.utils.aoa_to_sheet(data);

    for (let i = 0; i < 9; i++) {
        const cellRef = XLSX.utils.encode_cell({c:i, r:0});
        if (ws[cellRef]) {
            ws[cellRef].s = {
                font: { bold: true, color: { rgb: "FFFFFF" } },
                fill: { fgColor: { rgb: "334155" } }
            };
        }
    }

    ws['!cols'] = [
        { wpx: 180 }, { wpx: 120 }, { wpx: 120 }, { wpx: 150 }, { wpx: 150 },
        { wpx: 100 }, { wpx: 150 }, { wpx: 120 }, { wpx: 200 } 
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");

    const dateFileName = targetDate.replace(/\//g, '-');
    XLSX.writeFile(wb, `Support_Attendance_${dateFileName}.xlsx`);
}

async function recordToGoogleSheets(dateStr) {
    if(!isAuthenticated()) return;
    const logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    const students = JSON.parse(localStorage.getItem('students')) || [];
    const validStudents = students.filter(s => s.id !== 'SYS_CONFIG_X99' && s.id !== 'SYS_WIPE_ALL');
    const targetLogs = logs.filter(l => l.date === dateStr);

    if (validStudents.length === 0) {
        alert("No registered students found.");
        return;
    }

    const sheetBtn = document.getElementById('history-sheet-btn');
    const originalText = sheetBtn ? sheetBtn.textContent : "Record Today Google Sheets";
    
    if (sheetBtn) {
        sheetBtn.textContent = "SENDING...";
        sheetBtn.disabled = true;
        sheetBtn.style.opacity = "0.5";
    }

    const targetDateObj = new Date(dateStr);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const targetDayStr = dayNames[targetDateObj.getDay()];

    const payload = [];
    const sortedStudents = [...validStudents].sort((a, b) => {
        const classA = (a.classLevel || 'zzzz').toLowerCase().trim();
        const classB = (b.classLevel || 'zzzz').toLowerCase().trim();
        const nameA = (a.name || '').toLowerCase().trim();
        const nameB = (b.name || '').toLowerCase().trim();

        if (classA === 'upperclassmen' && classB !== 'upperclassmen') return -1;
        if (classA !== 'upperclassmen' && classB === 'upperclassmen') return 1;
        
        return nameA < nameB ? -1 : (nameA > nameB ? 1 : 0);
    });

    sortedStudents.forEach(student => {
        const studentLogs = targetLogs.filter(l => String(l.id) === String(student.id));
        
        let isScheduled = student.assignedDays && student.assignedDays.includes(targetDayStr);
        if (studentLogs.some(l => l.action.includes('Time In') || l.action.includes('Time Out') || l.action === 'No Attendance')) {
            isScheduled = true;
        }

        let inText = isScheduled ? 'Absent' : 'No Duty Today';
        let outText = isScheduled ? 'Absent' : 'No Duty Today';
        let gc = '-';
        let ann = '-';
        let post = '-';

        if (studentLogs.length > 0) {
            const timeInLog = studentLogs.find(l => l.action.includes('Time In'));
            const timeOutLog = studentLogs.find(l => l.action.includes('Time Out'));
            const noAttLog = studentLogs.find(l => l.action === 'No Attendance');
            
            const inExempted = timeInLog && timeInLog.action.includes('Exempted');
            const outExempted = timeOutLog && timeOutLog.action.includes('Exempted');
            const hasAnyExemption = inExempted || outExempted;

            if (noAttLog && !hasAnyExemption) {
                inText = 'Absent';
                outText = 'Absent';
            } else {
                if (inExempted) {
                    inText = 'Exempted';
                } else if (timeInLog) {
                    const status = timeInLog.action.includes('Late') ? 'Time in(Late)' : 'Time in';
                    inText = `${timeInLog.time} - ${status}`;
                } else {
                    inText = 'Absent';
                }

                if (outExempted) {
                    outText = 'Exempted';
                } else if (timeOutLog) {
                    const status = timeOutLog.action.includes('Late') ? 'Time out(Late)' : 'Time out';
                    outText = `${timeOutLog.time} - ${status}`;
                    const details = timeOutLog.details || {};
                    gc = details.gcHandle || '-';
                    ann = details.announcement || '-';
                    post = details.whoPosted || '-';
                } else {
                    outText = 'Absent';
                }
            }
        }

        payload.push({
            name: student.name || 'Unknown',
            id: student.id,
            classLevel: student.classLevel || 'Freshmen', 
            timeIn: inText,
            timeOut: outText,
            date: dateStr,
            gcHandle: gc,
            announcement: ann,
            postedBy: post
        });
    });

    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8', 
            },
            body: JSON.stringify(payload)
        });

        const textResponse = await response.text();
        try {
            const result = JSON.parse(textResponse);
            if (result.success) {
                alert(`Successfully saved fresh logs for ${dateStr} to Google Sheets!`);
            } else {
                alert(`Error from sheet: ${result.error}`);
            }
        } catch(e) {
            alert(`Successfully saved fresh logs for ${dateStr} to Google Sheets!`);
        }
    } catch (error) {
        alert("Network error trying to contact Google Sheets. Please ensure you deployed the New Version in Apps Script.");
    } finally {
        if (sheetBtn) {
            sheetBtn.textContent = originalText;
            sheetBtn.disabled = false;
            sheetBtn.style.opacity = "1";
        }
    }
}

function showMessage(elementId, text, type) {
    const msgElement = document.getElementById(elementId);
    if(msgElement) {
        msgElement.textContent = text;
        msgElement.className = `message ${type}`;
        setTimeout(() => { msgElement.textContent = ''; }, 4000);
    }
}

function getPHT() {
    return new Date(Date.now() + globalTimeOffset);
}

function getPHTDayString() {
    if (globalDayOverride) return globalDayOverride;
    const pht = getPHT();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[pht.getDay()];
}

function getTodayLogs(idNum) {
    const logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    const shift = getShiftDateDetails();
    return logs.filter(l => String(l.id) === String(idNum) && l.date === shift.dateStr);
}

function showLockedScreen(message) {
    const form = document.getElementById('turn-in-form');
    const locked = document.getElementById('locked-screen');
    const msg = document.getElementById('locked-message');
    if(form) form.style.display = 'none';
    if(locked) locked.style.display = 'block';
    if(msg) msg.textContent = message;
}

async function resetStudentUI() {
    const isPrivate = await isIncognito();
    if (isPrivate) {
        const form = document.getElementById('turn-in-form');
        const locked = document.getElementById('locked-screen');
        const incognito = document.getElementById('incognito-screen');
        const sysLock = document.getElementById('student-lock-overlay');
        
        if(form) form.style.display = 'none';
        if(locked) locked.style.display = 'none';
        if(sysLock) sysLock.style.display = 'none';
        if(incognito) incognito.style.display = 'flex';
        return;
    }
    
    const form = document.getElementById('turn-in-form');
    const locked = document.getElementById('locked-screen');
    const incognito = document.getElementById('incognito-screen');
    const idInput = document.getElementById('student-id-input');
    const msg = document.getElementById('student-message');
    
    if(form) form.style.display = 'block';
    if(locked) locked.style.display = 'none';
    if(incognito) incognito.style.display = 'none';
    
    if(idInput) idInput.value = '';
    if(msg) msg.textContent = '';
    
    checkDeviceLock();
    initSliderCaptcha();
}

function renderSchedule() {
    if(!isAuthenticated()) return;
    const students = JSON.parse(localStorage.getItem('students')) || [];
    const validStudents = students.filter(s => s.id !== 'SYS_CONFIG_X99' && s.id !== 'SYS_WIPE_ALL');
    const tbody = document.getElementById('schedule-logs-body');
    
    const searchInput = document.getElementById('search-schedule');
    const filterSelect = document.getElementById('filter-schedule');
    const sortSelect = document.getElementById('sort-schedule');
    
    const query = searchInput ? searchInput.value.toLowerCase() : '';
    const filterVal = filterSelect ? filterSelect.value : 'ALL';
    const sortVal = sortSelect ? sortSelect.value.toUpperCase() : 'NAME_ASC';

    if (!tbody) return;
    tbody.innerHTML = '';
    
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const dayLabels = ['M', 'T', 'W', 'Th', 'F', 'Sa', 'Su'];
    
    let filteredStudents = validStudents.filter(student => 
        ((student.name || '').toLowerCase().includes(query)) || 
        (student.id && String(student.id).toLowerCase().includes(query)) ||
        ((student.gcHandle || '').toLowerCase().includes(query)) ||
        ((student.classLevel || '').toLowerCase().includes(query))
    );

    if (filterVal === 'UNASSIGNED') {
        filteredStudents = filteredStudents.filter(s => !s.assignedDays || s.assignedDays.length === 0);
    } else if (filterVal === 'ASSIGNED') {
        filteredStudents = filteredStudents.filter(s => s.assignedDays && s.assignedDays.length > 0);
    } else if (filterVal !== 'ALL') {
        filteredStudents = filteredStudents.filter(s => s.assignedDays && s.assignedDays.includes(filterVal));
    }

    filteredStudents.sort((a, b) => {
        const nameA = (a.name || '').toLowerCase().trim();
        const nameB = (b.name || '').toLowerCase().trim();
        const idA = (a.id || '').toString().trim();
        const idB = (b.id || '').toString().trim();
        const classA = (a.classLevel || 'zzzz').toLowerCase().trim();
        const classB = (b.classLevel || 'zzzz').toLowerCase().trim();
        const tagA = (a.gcHandle || 'zzzz').toLowerCase().trim(); 
        const tagB = (b.gcHandle || 'zzzz').toLowerCase().trim();

        if (sortVal === 'NAME_ASC') return nameA < nameB ? -1 : (nameA > nameB ? 1 : 0);
        if (sortVal === 'NAME_DESC') return nameA > nameB ? -1 : (nameA < nameB ? 1 : 0);
        if (sortVal === 'ID_ASC') return idA.localeCompare(idB, undefined, {numeric: true});
        if (sortVal === 'ID_DESC') return idB.localeCompare(idA, undefined, {numeric: true});
        if (sortVal === 'TAG_ASC') {
            if (tagA === tagB) return nameA < nameB ? -1 : (nameA > nameB ? 1 : 0); 
            return tagA < tagB ? -1 : 1;
        }
        if (sortVal === 'CLASS_FRESH') {
            if (classA === 'freshmen' && classB !== 'freshmen') return -1;
            if (classA !== 'freshmen' && classB === 'freshmen') return 1;
            return nameA < nameB ? -1 : (nameA > nameB ? 1 : 0);
        }
        if (sortVal === 'CLASS_UPPER') {
            if (classA === 'upperclassmen' && classB !== 'upperclassmen') return -1;
            if (classA !== 'upperclassmen' && classB === 'upperclassmen') return 1;
            return nameA < nameB ? -1 : (nameA > nameB ? 1 : 0);
        }
        return 0; 
    });

    filteredStudents.forEach(student => {
        const tr = document.createElement('tr');
        const safeId = String(student.id).replace(/'/g, "\\'");
        
        let togglesHtml = days.map((day, index) => {
            const isActive = student.assignedDays && student.assignedDays.includes(day);
            return `<button class="day-toggle ${isActive ? 'active' : ''}" onclick="toggleStudentDay('${safeId}', '${day}')">${dayLabels[index]}</button>`;
        }).join('');
        
        let gcTagHtml = student.gcHandle ? `<span class="gc-tag" style="margin: 0 4px 0 0; font-size: 10px; padding: 2px 6px;">${student.gcHandle}</span>` : '<span style="color: var(--text-muted); font-size: 11px; margin-right:4px;">None</span>';
        let classTagHtml = student.classLevel ? `<span class="gc-tag" style="margin: 0 4px 0 0; font-size: 10px; padding: 2px 6px; background: rgba(168, 85, 247, 0.2); color: #a855f7; border-color: #a855f7;">${student.classLevel}</span>` : '';

        tr.innerHTML = `
            <td style="white-space: normal;"><strong style="color: var(--text-main);">${student.name || 'Unknown'}</strong></td>
            <td style="white-space: normal;">${classTagHtml}${gcTagHtml}</td>
            <td style="white-space: normal; color: var(--text-muted);">${student.id}</td>
            <td style="white-space: normal; width: 100%;">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 15px;">
                    <div class="day-toggles">
                        ${togglesHtml}
                    </div>
                    <button class="remove-btn" onclick="deleteStudent('${safeId}')" style="padding: 6px 12px; font-size: 10px; flex-shrink: 0;">REMOVE</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    applyVisitorMode();
}

function renderHistoryView() {
    if(!isAuthenticated()) return;
    const logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    
    const exemptAllBtn = document.getElementById('history-exempt-all-btn');
    if (exemptAllBtn) exemptAllBtn.style.display = 'none';

    const logSearchInput = document.getElementById('search-history-logs');
    if (logSearchInput) logSearchInput.value = '';

    const globalDeletedDates = logs.filter(l => l.id === 'SYS_DELETED_DATE').map(l => l.date);
    const validLogs = logs.filter(l => !globalDeletedDates.includes(l.date) && l.id !== 'SYS_WIPE_LOGS' && l.id !== 'SYS_WIPE_ALL');

    let uniqueDates = [...new Set(validLogs.map(l => l.date))];
    uniqueDates.sort((a, b) => new Date(b) - new Date(a)); 

    let displayDates = uniqueDates.slice(0, 12);

    const searchInput = document.getElementById('search-history-date');
    const query = searchInput ? searchInput.value.toLowerCase() : '';

    if (query) {
        displayDates = displayDates.filter(d => d.toLowerCase().includes(query));
    }

    const container = document.getElementById('history-cards-container');
    if(!container) return;
    container.innerHTML = '';

    if (displayDates.length === 0) {
        container.innerHTML = '<p class="placeholder-text">No history available yet.</p>';
        const tbl = document.getElementById('history-table-container');
        if(tbl) tbl.style.display = 'none';
        return;
    }

    displayDates.forEach(dateStr => {
        const card = document.createElement('div');
        card.className = 'history-card';
        card.onclick = () => renderHistoryTable(dateStr);
        
        card.innerHTML = `
            <strong style="font-size: 1.1rem; color: var(--text-main);">${dateStr}</strong>
            <button onclick="deleteHistoryDate('${dateStr}', event)" class="history-trash-btn">✖</button>
        `;
        container.appendChild(card);
    });
    
    const tbl = document.getElementById('history-table-container');
    if(tbl) tbl.style.display = 'none';
    applyVisitorMode();
}

async function renderHistoryTable(dateStr) {
    if(!isAuthenticated()) return;
    
    let tk = sessionStorage.getItem('_auth_tkn_x92');
    let userRole = 'ADMIN';
    try { userRole = JSON.parse(atob(tk)).role || 'ADMIN'; } catch(e) {}
    
    const container = document.getElementById('history-table-container');
    const title = document.getElementById('history-table-title');
    if(container) container.style.display = 'flex';
    if(title) {
        title.textContent = `Logs for ${dateStr}`;
        title.setAttribute('data-date', dateStr); 
    }
    
    const exportBtn = document.getElementById('history-export-btn');
    if (exportBtn) exportBtn.onclick = () => exportToExcel(dateStr);
    
    const sheetBtn = document.getElementById('history-sheet-btn');
    if (sheetBtn) sheetBtn.onclick = () => recordToGoogleSheets(dateStr);
    
    const exemptAllBtn = document.getElementById('history-exempt-all-btn');
    if (exemptAllBtn) {
        exemptAllBtn.style.display = 'block'; 
        exemptAllBtn.onclick = () => exemptAllForDate(dateStr);
    }
    
    const tbody = document.getElementById('history-logs-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Loading logs from secure server...</td></tr>';

    const searchInput = document.getElementById('search-history-logs');
    const query = searchInput ? searchInput.value.toLowerCase() : '';

    let dayLogs = [];
    try {
        const response = await fetch(`${API_BASE_URL}/logs/history/${encodeURIComponent(dateStr)}`);
        if (response.ok) {
            dayLogs = await response.json();
        } else {
            throw new Error("Server API Error");
        }
    } catch (err) {
        const allLogs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
        dayLogs = allLogs.filter(l => l.date === dateStr);
    }

    const students = JSON.parse(localStorage.getItem('students')) || [];
    const validStudents = students.filter(s => s.id !== 'SYS_CONFIG_X99' && s.id !== 'SYS_WIPE_ALL');
    
    const targetDateObj = new Date(dateStr);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const targetDayStr = dayNames[targetDateObj.getDay()];

    const studentsToRender = validStudents.filter(student => {
        const isScheduled = student.assignedDays && student.assignedDays.includes(targetDayStr);
        const hasLogs = dayLogs.some(l => String(l.id) === String(student.id));
        return isScheduled || hasLogs;
    });

    if (query) {
        const filtered = studentsToRender.filter(s => 
            (s.name || '').toLowerCase().includes(query) || 
            String(s.id).toLowerCase().includes(query)
        );
        studentsToRender.length = 0;
        studentsToRender.push(...filtered);
    }

    studentsToRender.sort((a, b) => {
        const classA = (a.classLevel || 'zzzz').toLowerCase().trim();
        const classB = (b.classLevel || 'zzzz').toLowerCase().trim();
        const nameA = (a.name || '').toLowerCase().trim();
        const nameB = (b.name || '').toLowerCase().trim();

        if (classA === 'upperclassmen' && classB !== 'upperclassmen') return -1;
        if (classA !== 'upperclassmen' && classB === 'upperclassmen') return 1;
        return nameA < nameB ? -1 : (nameA > nameB ? 1 : 0);
    });

    tbody.innerHTML = '';

    if (studentsToRender.length === 0) {
         tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No records found.</td></tr>';
         return;
    }

    studentsToRender.forEach(student => {
        const id = student.id;
        if (id === 'SYS_DELETED_DATE' || id === 'SYS_CONFIG_X99' || id === 'SYS_WIPE_ALL' || id === 'SYS_WIPE_LOGS' || id === 'SYS_INIT_DATE') return;

        const name = student.name || 'Unknown';
        const studentLogs = dayLogs.filter(l => String(l.id) === String(id));
        
        const timeInLog = studentLogs.find(l => l.action.includes('Time In'));
        const timeOutLog = studentLogs.find(l => l.action.includes('Time Out'));
        const noAttLog = studentLogs.find(l => l.action === 'No Attendance');
        
        const inExempted = timeInLog && timeInLog.action.includes('Exempted');
        const outExempted = timeOutLog && timeOutLog.action.includes('Exempted');
        const hasAnyExemption = inExempted || outExempted;

        let inText = '<span style="color: var(--error);">Absent</span>';
        let outText = '<span style="color: var(--error);">Absent</span>';
        let gc = '-';
        let ann = '-';
        let post = '-';

        if (noAttLog && !hasAnyExemption) {
            inText = '<span style="color: var(--error);">No Attendance</span>';
            outText = '<span style="color: var(--error);">No Attendance</span>';
        } else {
            if (inExempted) {
                inText = '<span style="color: #66fcf1;">Exempted</span>';
            } else if (timeInLog) {
                const color = timeInLog.action.includes('Late') ? '#f59e0b' : 'var(--success)';
                const cleanTime = timeInLog.time.replace('Exempted', '').trim();
                inText = `<span style="color: ${color};">${cleanTime}</span>`;
            }

            if (outExempted) {
                outText = '<span style="color: #66fcf1;">Exempted</span>';
            } else if (timeOutLog) {
                const color = timeOutLog.action.includes('Late') ? '#f59e0b' : 'var(--success)';
                const cleanTime = timeOutLog.time.replace('Exempted', '').trim();
                outText = `<span style="color: ${color};">${cleanTime}</span>`;
                
                const details = timeOutLog.details || {};
                gc = details.gcHandle || '-';
                ann = details.announcement || '-';
                post = details.whoPosted || '-';
            }
        }

        const checkedAttr = hasAnyExemption ? 'checked' : '';
        const editActionHtml = userRole === 'ADMIN' ? `<span onclick="openEditLogModal('${id}', '${dateStr}')" style="cursor: pointer; opacity: 0.8;" class="admin-edit-icon">✏️</span>` : '';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${name}</td>
            <td>${id}</td>
            <td style="font-weight: bold;">${inText}</td>
            <td style="font-weight: bold;">${outText}</td>
            <td style="color: var(--text-muted);">${gc}</td>
            <td style="color: var(--text-muted);">${ann}</td>
            <td style="color: var(--text-muted);">${post}</td>
            <td style="text-align: center;">${editActionHtml}</td>
            <td style="text-align: center;"><input type="checkbox" onchange="toggleExempt('${id}', '${dateStr}', this)" ${checkedAttr} style="margin: 0 auto; display: block; cursor: pointer;"></td>
        `;
        tbody.appendChild(tr);
    });
    applyVisitorMode();
}

function initDevUI() {}

async function applyDevSettings() {
    const dateVal = document.getElementById('dev-date').value;
    const timeVal = document.getElementById('dev-time').value;
    const dayVal = document.getElementById('dev-day').value;

    let newOffset = 0;
    
    if (dateVal && timeVal) {
        const targetDate = new Date(`${dateVal}T${timeVal}:00`);
        const now = new Date();
        newOffset = targetDate.getTime() - now.getTime();
    } else if (dateVal || timeVal) {
        alert("To simulate time, you must provide BOTH a Date and a Time.");
        return;
    }

    try {
        await fetch(`${API_BASE_URL}/config/time-travel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Admin-Key': ADMIN_SECRET_KEY },
            body: JSON.stringify({ 
                timeOffset: newOffset,
                dayOverride: dayVal || "" 
            })
        });
        
        globalTimeOffset = newOffset;
        globalDayOverride = dayVal || "";
        
        showMessage('dev-message', 'Time Travel Active! System is ticking in simulated time.', 'success');
        
        if (document.getElementById('admin-dashboard-view').classList.contains('active')) {
            renderDashboardSummary();
            renderLogs();
            renderSchedule();
            renderMainDashboard();
            renderDutyToday();
            const secHist = document.getElementById('sec-history');
            if (secHist && secHist.classList.contains('active')) renderHistoryView();
        }
    } catch(e) {
        showMessage('dev-message', 'Network Error linking to backend.', 'error');
    }
}

async function resetDevSettings() {
    try {
        await fetch(`${API_BASE_URL}/config/time-travel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Admin-Key': ADMIN_SECRET_KEY },
            body: JSON.stringify({ timeOffset: 0, dayOverride: "" })
        });
        
        globalTimeOffset = 0;
        globalDayOverride = "";
        
        const dDate = document.getElementById('dev-date');
        const dTime = document.getElementById('dev-time');
        const dDay = document.getElementById('dev-day');
        if(dDate) dDate.value = '';
        if(dTime) dTime.value = '';
        if(dDay) dDay.value = '';
        
        showMessage('dev-message', 'System reverted back to reality.', 'success');
        
        if (document.getElementById('admin-dashboard-view').classList.contains('active')) {
            renderDashboardSummary();
            renderLogs();
            renderSchedule();
            renderMainDashboard();
            renderDutyToday();
            const secHist = document.getElementById('sec-history');
            if (secHist && secHist.classList.contains('active')) renderHistoryView();
        }
    } catch(e) {
        showMessage('dev-message', 'Network Error.', 'error');
    }
}

function renderMainDashboard() {
    if(!isAuthenticated()) return;
    try {
        const students = JSON.parse(localStorage.getItem('students')) || [];
        const validStudents = students.filter(s => s.id !== 'SYS_CONFIG_X99' && s.id !== 'SYS_WIPE_ALL');
        const logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
        const shift = getShiftDateDetails();
        const todayStr = shift.dateStr;
        const currentDay = shift.dayStr;

        const dashTotal = document.getElementById('dash-total');
        if(dashTotal) dashTotal.textContent = validStudents.length;

        const scheduledToday = validStudents.filter(s => s.assignedDays && s.assignedDays.includes(currentDay));
        const totalScheduled = scheduledToday.length;

        let presentCount = 0;
        let lateCount = 0;

        scheduledToday.forEach(student => {
            const studentTodayLogs = logs.filter(l => String(l.id) === String(student.id) && l.date === todayStr);
            const timeInLog = studentTodayLogs.find(l => l.action.includes('Time In'));
            
            if (timeInLog) {
                presentCount++;
                if (timeInLog.action.includes('Late')) {
                    lateCount++;
                }
            }
        });

        const absentCount = totalScheduled - presentCount;
        const attendanceRate = totalScheduled > 0 ? Math.round((presentCount / totalScheduled) * 100) : 0;

        const dashRatio = document.getElementById('dash-ratio');
        const dashRate = document.getElementById('dash-rate');
        const dashPresent = document.getElementById('dash-present');
        const dashAbsent = document.getElementById('dash-absent');
        const dashLate = document.getElementById('dash-late');
        
        if(dashRatio) dashRatio.textContent = `${presentCount} / ${totalScheduled}`;
        if(dashRate) dashRate.textContent = `${attendanceRate}%`;
        if(dashPresent) dashPresent.textContent = presentCount;
        if(dashAbsent) dashAbsent.textContent = absentCount;
        if(dashLate) dashLate.textContent = lateCount;

        const pieChart = document.getElementById('dash-pie-chart');
        if (totalScheduled > 0 && pieChart) {
            const presentPct = (presentCount / totalScheduled) * 100;
            pieChart.style.background = `conic-gradient(var(--success) 0% ${presentPct}%, var(--error) ${presentPct}% 100%)`;
        } else if (pieChart) {
            pieChart.style.background = `conic-gradient(#334155 0% 100%)`;
        }

        const barChartEl = document.getElementById('dash-bar-chart');
        const barLabelsEl = document.getElementById('dash-bar-labels');
        if (barChartEl && barLabelsEl) {
            barChartEl.innerHTML = '';
            barLabelsEl.innerHTML = '';
            
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            let maxPresent = 100; 
            let weeklyData = [];
            
            for (let i = 6; i >= 0; i--) {
                let d = new Date(getPHT());
                d.setDate(d.getDate() - i);
                let dStr = d.toLocaleDateString('en-US');
                let dayIdx = d.getDay();
                
                let pCount = logs.filter(l => l.date === dStr && l.action.includes('Time In') && l.id !== 'SYS_DELETED_DATE').length;
                weeklyData.push({ dayLabel: dayNames[dayIdx], count: pCount });
            }
            
            weeklyData.forEach(data => {
                let heightPct = (data.count / maxPresent) * 100;
                if (heightPct > 100) heightPct = 100; 
                if (heightPct < 5) heightPct = 5; 
                
                barChartEl.innerHTML += `
                    <div style="flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; position: relative;">
                        <span style="position: absolute; top: -20px; font-size: 11px; color: var(--text-main); font-weight: bold;">${data.count}</span>
                        <div style="width: 100%; max-width: 30px; height: ${heightPct}%; background: linear-gradient(180deg, var(--accent), transparent); border-radius: 4px 4px 0 0; transition: height 0.5s;"></div>
                    </div>
                `;
                barLabelsEl.innerHTML += `<div style="flex: 1; text-align: center; font-weight: bold;">${data.dayLabel}</div>`;
            });
        }

        const timeInLogs = logs.filter(l => l.date === todayStr && l.action.includes('Time In') && !l.action.includes('Exempted'));
        const timeOutLogs = logs.filter(l => l.date === todayStr && l.action.includes('Time Out') && !l.action.includes('Exempted'));
        
        const hourlyInCounts = new Array(24).fill(0);
        const hourlyOutCounts = new Array(24).fill(0);
        
        function populateCounts(targetLogs, arr) {
            targetLogs.forEach(log => {
                if(log.time === 'Exempted') return;
                const timeMatch = log.time.match(/(\d+):(\d+)\s+(AM|PM)/i);
                if (timeMatch) {
                    let h = parseInt(timeMatch[1]);
                    const ampm = timeMatch[3].toUpperCase();
                    if (ampm === 'PM' && h !== 12) h += 12;
                    if (ampm === 'AM' && h === 12) h = 0;
                    
                    if (h >= 0 && h < 24) {
                        arr[h]++;
                    }
                }
            });
        }
        
        populateCounts(timeInLogs, hourlyInCounts);
        populateCounts(timeOutLogs, hourlyOutCounts);

        const maxLineVal = 50; 
        const lineChartContainer = document.getElementById('dash-line-chart-container');
        if (lineChartContainer) {
            let svgHTML = `<svg width="100%" height="100%" viewBox="-40 -20 1080 260" preserveAspectRatio="none" style="flex: 1; display: block; overflow: visible;">`;
            
            for(let val = 0; val <= 50; val += 10) {
                let yLine = 200 - ((val / maxLineVal) * 200);
                svgHTML += `<line x1="0" y1="${yLine}" x2="1000" y2="${yLine}" stroke="rgba(255,255,255,0.1)" stroke-width="1.5" />`;
                svgHTML += `<text x="-15" y="${yLine + 5}" fill="var(--text-muted)" font-size="14" font-weight="bold" text-anchor="end">${val}</text>`;
            }

            let inPoints = [];
            hourlyInCounts.forEach((count, i) => {
                let x = (i / 23) * 1000;
                let c = Math.min(count, maxLineVal);
                let y = 200 - ((c / maxLineVal) * 200);
                inPoints.push(`${x},${y}`);
            });

            let outPoints = [];
            hourlyOutCounts.forEach((count, i) => {
                let x = (i / 23) * 1000;
                let c = Math.min(count, maxLineVal);
                let y = 200 - ((c / maxLineVal) * 200);
                outPoints.push(`${x},${y}`);
            });
            
            svgHTML += `<polyline points="${outPoints.join(' ')}" fill="none" stroke="var(--error)" stroke-width="3.5" />`;
            svgHTML += `<polyline points="${inPoints.join(' ')}" fill="none" stroke="var(--accent)" stroke-width="3.5" />`;
            
            hourlyOutCounts.forEach((count, i) => {
                let x = (i / 23) * 1000;
                let c = Math.min(count, maxLineVal);
                let y = 200 - ((c / maxLineVal) * 200);
                svgHTML += `<circle cx="${x}" cy="${y}" r="6" fill="#1e2128" stroke="var(--error)" stroke-width="2.5" />`;
                if (count > 0) {
                    svgHTML += `<text x="${x}" y="${y + 20}" fill="var(--error)" font-size="12" text-anchor="middle" font-weight="bold">${count}</text>`;
                }
            });

            hourlyInCounts.forEach((count, i) => {
                let x = (i / 23) * 1000;
                let c = Math.min(count, maxLineVal);
                let y = 200 - ((c / maxLineVal) * 200);
                svgHTML += `<circle cx="${x}" cy="${y}" r="6" fill="#1e2128" stroke="var(--accent)" stroke-width="2.5" />`;
                if (count > 0) {
                    svgHTML += `<text x="${x}" y="${y - 12}" fill="var(--accent)" font-size="12" text-anchor="middle" font-weight="bold">${count}</text>`;
                }
            });

            svgHTML += `</svg>`;
            
            let labelsHTML = `<div style="display: flex; justify-content: space-between; margin-top: 15px; color: var(--text-muted); font-size: 11px; padding: 0;">`;
            const lineLabels = ['12a','1a','2a','3a','4a','5a','6a','7a','8a','9a','10a','11a','12p','1p','2p','3p','4p','5p','6p','7p','8p','9p','10p','11p'];
            lineLabels.forEach(lbl => {
                labelsHTML += `<span style="flex: 1; text-align: center;">${lbl}</span>`;
            });
            labelsHTML += `</div>`;
            
            lineChartContainer.innerHTML = svgHTML + labelsHTML;
        }

        const cutoffDate = new Date(getPHT());
        cutoffDate.setDate(cutoffDate.getDate() - 21); 
        
        const deadStudentsList = document.getElementById('dash-dead-students');
        if (deadStudentsList) {
            deadStudentsList.innerHTML = '';

            let deadCount = 0;

            validStudents.forEach(student => {
                const recentLog = logs.find(l => String(l.id) === String(student.id) && new Date(l.date) >= cutoffDate);
                if (!recentLog) {
                    deadCount++;
                    deadStudentsList.innerHTML += `<div style="padding: 12px 10px; border-bottom: 1px solid #2d313c; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
                        <span style="color: var(--text-main); font-size: 13px;">${student.name || 'Unknown'}</span> 
                        <span style="color:var(--error); font-weight: bold; font-size: 10px;">INACTIVE</span>
                    </div>`;
                }
            });
            if (deadCount === 0) {
                deadStudentsList.innerHTML = '<p class="placeholder-text" style="text-align: center; padding: 20px;">No inactive students.</p>';
            }
        }

        let perfList = [];

        validStudents.forEach(student => {
            const studentLogs = logs.filter(l => String(l.id) === String(student.id));
            if (studentLogs.length === 0) return;

            let onTimeIn = 0;
            let lateIn = 0;
            let onTimeOut = 0;
            let lateOut = 0;
            let bonus = 0;

            studentLogs.forEach(log => {
                if (log.action === 'Time In') onTimeIn++;
                if (log.action === 'Time In (Late)') lateIn++;
                if (log.action === 'Time Out') onTimeOut++;
                if (log.action === 'Time Out (Late)') lateOut++;
                if (log.action.includes('Out') && log.details && log.details.announcement === 'Yes') {
                    bonus += 1.5;
                }
            });

            const totalActions = onTimeIn + lateIn + onTimeOut + lateOut;
            const perfectActions = onTimeIn + onTimeOut;

            let perfRate = 0;
            if (totalActions > 0) {
                perfRate = (perfectActions / totalActions) * 100;
            }
            perfRate += bonus;
            if (perfRate > 100) perfRate = 100;

            perfList.push({ name: student.name || 'Unknown', id: student.id, rate: Math.round(perfRate) });
        });

        perfList.sort((a, b) => b.rate - a.rate);
        const top10 = perfList.slice(0, 10);

        const bestPerfEl = document.getElementById('dash-best-perf');
        if (bestPerfEl) {
            bestPerfEl.innerHTML = '';
            if (top10.length === 0) {
                bestPerfEl.innerHTML = '<p class="placeholder-text" style="text-align: center; padding: 20px;">No data available.</p>';
            } else {
                top10.forEach((p, index) => {
                    let color = p.rate >= 80 ? 'var(--success)' : (p.rate >= 50 ? '#f59e0b' : 'var(--error)');
                    let rankBadge = '';
                    if (index === 0) rankBadge = '🥇';
                    else if (index === 1) rankBadge = '🥈';
                    else if (index === 2) rankBadge = '🥉';
                    else rankBadge = `<span style="display:inline-block; width:20px; text-align:center; font-weight:bold; color:var(--text-muted); font-size:11px;">#${index+1}</span>`;

                    bestPerfEl.innerHTML += `
                        <div style="padding: 10px; border-bottom: 1px solid #2d313c; display: flex; justify-content: space-between; align-items: center; border-radius: 4px; background: rgba(0,0,0,0.2); flex-shrink: 0;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                ${rankBadge}
                                <div style="display: flex; flex-direction: column;">
                                    <span style="color: var(--text-main); font-size: 13px; font-weight: bold;">${p.name}</span>
                                    <span style="color: var(--text-muted); font-size: 10px;">ID: ${p.id}</span>
                                </div>
                            </div>
                            <span style="color: ${color}; font-weight: bold; font-size: 14px;">${p.rate}%</span>
                        </div>`;
                });
            }
        }
    } catch (e) {}
    applyVisitorMode();
}

function renderDashboardSummary() {
    if(!isAuthenticated()) return;
    const students = JSON.parse(localStorage.getItem('students')) || [];
    const validStudents = students.filter(s => s.id !== 'SYS_CONFIG_X99' && s.id !== 'SYS_WIPE_ALL');
    const logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    const tbody = document.getElementById('summary-body');
    
    const searchInput = document.getElementById('search-attendance-global');
    const sortSelect = document.getElementById('sort-attendance-global');
    
    const query = searchInput ? searchInput.value.toLowerCase() : '';
    const sortVal = sortSelect ? sortSelect.value : 'NAME_ASC';
    
    if (!tbody) return;
    tbody.innerHTML = '';

    const shift = getShiftDateDetails();
    const todayStr = shift.dateStr;
    const currentDay = shift.dayStr;

    const scheduledToday = validStudents.filter(student => student.assignedDays && student.assignedDays.includes(currentDay));

    let filteredStudents = scheduledToday.filter(student => 
        (student.name || '').toLowerCase().includes(query) || 
        String(student.id).toLowerCase().includes(query)
    );

    filteredStudents.sort((a, b) => {
        const nameA = (a.name || '').toLowerCase().trim();
        const nameB = (b.name || '').toLowerCase().trim();
        const idA = (a.id || '').toString().trim();
        const idB = (b.id || '').toString().trim();
        const classA = (a.classLevel || 'zzzz').toLowerCase().trim();
        const classB = (b.classLevel || 'zzzz').toLowerCase().trim();

        if (sortVal === 'NAME_ASC') return nameA < nameB ? -1 : (nameA > nameB ? 1 : 0);
        if (sortVal === 'NAME_DESC') return nameA > nameB ? -1 : (nameA < nameB ? 1 : 0);
        if (sortVal === 'ID_ASC') return idA.localeCompare(idB, undefined, {numeric: true});
        if (sortVal === 'CLASS_FRESH') {
            if (classA === 'freshmen' && classB !== 'freshmen') return -1;
            if (classA !== 'freshmen' && classB === 'freshmen') return 1;
            return nameA < nameB ? -1 : (nameA > nameB ? 1 : 0);
        }
        if (sortVal === 'CLASS_UPPER') {
            if (classA === 'upperclassmen' && classB !== 'upperclassmen') return -1;
            if (classA !== 'upperclassmen' && classB === 'upperclassmen') return 1;
            return nameA < nameB ? -1 : (nameA > nameB ? 1 : 0);
        }
        return 0; 
    });

    filteredStudents.forEach(student => {
        const hasTimedOutToday = logs.some(l => String(l.id) === String(student.id) && l.date === todayStr && l.action.includes('Time Out'));
        const hasTimedInToday = logs.some(l => String(l.id) === String(student.id) && l.date === todayStr && l.action.includes('Time In'));
        
        let todayShiftBtn = '';
        if (hasTimedOutToday) {
            todayShiftBtn = `<button onclick="viewTodayShift('${student.id}', '${todayStr}')" style="background: rgba(var(--accent-rgb), 0.1); color: var(--accent); padding: 6px 12px; border-radius: 4px; font-size: 10px; font-weight: bold; border: 1px solid var(--accent); cursor: pointer; white-space: nowrap;">TODAY SHIFT</button>`;
        }

        let rowBg = 'transparent';
        if (hasTimedOutToday) {
            rowBg = 'rgba(34, 197, 94, 0.15)'; 
        } else if (hasTimedInToday) {
            rowBg = 'rgba(245, 158, 11, 0.15)'; 
        }

        let classTagHtml = student.classLevel ? `<span class="gc-tag" style="margin: 0; font-size: 10px; padding: 2px 6px; background: rgba(168, 85, 247, 0.2); color: #a855f7; border-color: #a855f7;">${student.classLevel}</span>` : '';

        const tr = document.createElement('tr');
        tr.style.backgroundColor = rowBg;
        tr.innerHTML = `
            <td><strong style="color: var(--text-main);">${student.name || 'Unknown'}</strong></td>
            <td>${classTagHtml}</td>
            <td style="color: var(--text-muted);">${student.id}</td>
            <td>
                <div class="button-cell-wrap">
                    ${todayShiftBtn}
                    <button onclick="viewPerformance('${student.id}')" style="background: rgba(var(--accent-rgb), 0.1); color: var(--accent); padding: 6px 15px; border-radius: 4px; font-size: 11px; border: 1px solid var(--accent); letter-spacing: 1px; cursor: pointer;">
                        VIEW
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    applyVisitorMode();
}

function viewPerformance(idNum) {
    const students = JSON.parse(localStorage.getItem('students')) || [];
    const logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    
    const student = students.find(s => String(s.id) === String(idNum));
    if (!student) return;

    const studentLogs = logs.filter(l => String(l.id) === String(idNum));

    let onTimeIn = 0;
    let lateIn = 0;
    let onTimeOut = 0;
    let lateOut = 0;
    let bonus = 0;

    studentLogs.forEach(log => {
        if (log.action === 'Time In') onTimeIn++;
        if (log.action === 'Time In (Late)') lateIn++;
        if (log.action === 'Time Out') onTimeOut++;
        if (log.action === 'Time Out (Late)') lateOut++;
        
        if (log.action.includes('Out') && log.details && log.details.announcement === 'Yes') {
            bonus += 1.5;
        }
    });

    const totalPresent = onTimeIn + lateIn; 
    const totalActions = onTimeIn + lateIn + onTimeOut + lateOut;
    const perfectActions = onTimeIn + onTimeOut;

    let perfRate = 0;
    if (totalActions > 0) {
        perfRate = (perfectActions / totalActions) * 100;
    }

    perfRate += bonus;
    perfRate = Math.round(perfRate);
    if (perfRate > 100) perfRate = 100;

    const perfStudentName = document.getElementById('perf-student-name');
    const perfTotalPresent = document.getElementById('perf-total-present');
    const perfOnTime = document.getElementById('perf-on-time');
    const perfLateIn = document.getElementById('perf-late-in');
    const perfOutTime = document.getElementById('perf-out-time');
    const perfLateOut = document.getElementById('perf-late-out');
    
    if(perfStudentName) perfStudentName.textContent = student.name || 'Unknown';
    if(perfTotalPresent) perfTotalPresent.textContent = totalPresent;
    if(perfOnTime) perfOnTime.textContent = onTimeIn;
    if(perfLateIn) perfLateIn.textContent = lateIn;
    if(perfOutTime) perfOutTime.textContent = onTimeOut;
    if(perfLateOut) perfLateOut.textContent = lateOut;
    
    const rateEl = document.getElementById('perf-rate');
    if(rateEl) {
        rateEl.textContent = `${perfRate}%`;
        if (perfRate >= 80) rateEl.style.color = 'var(--success)';
        else if (perfRate >= 50) rateEl.style.color = '#f59e0b';
        else rateEl.style.color = 'var(--error)';
    }

    const modal = document.getElementById('performance-modal');
    if(modal) modal.style.display = 'flex';
}

function closePerformanceModal() {
    const modal = document.getElementById('performance-modal');
    if(modal) modal.style.display = 'none';
}

function cancelTimeOut() {
    pendingTimeOutStudent = null;
    pendingTimeOutAction = null;
    const modal = document.getElementById('timeout-modal');
    if(modal) modal.style.display = 'none';
}

function toggleOtherGC(val) {
    const otherInput = document.getElementById('gc-handle-other');
    if(otherInput) {
        if (val === 'Other') {
            otherInput.style.display = 'block';
        } else {
            otherInput.style.display = 'none';
            otherInput.value = ''; 
        }
    }
}

function viewTodayShift(idNum, dateStr) {
    const logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    
    const dayLogs = logs.filter(l => String(l.id) === String(idNum) && l.date === dateStr);
    const timeInLog = dayLogs.find(l => l.action.includes('Time In'));
    const timeOutLog = dayLogs.find(l => l.action.includes('Time Out'));
    
    if (!timeOutLog) return; 
    
    const tsName = document.getElementById('ts-name');
    if(tsName) tsName.textContent = timeOutLog.name || 'Unknown';
    
    const inEl = document.getElementById('ts-time-in');
    if(inEl) {
        if (timeInLog && timeInLog.action.includes('Exempted')) {
            inEl.textContent = 'Exempted';
            inEl.style.color = '#66fcf1';
        } else if (timeInLog) {
            inEl.textContent = `${timeInLog.time} (${timeInLog.action.includes('Late') ? 'LATE' : 'ON TIME'})`;
            inEl.style.color = timeInLog.action.includes('Late') ? '#f59e0b' : 'var(--success)';
        } else {
            inEl.textContent = 'No Record';
            inEl.style.color = 'var(--error)';
        }
    }

    const outEl = document.getElementById('ts-time-out');
    if(outEl) {
        if (timeOutLog.action.includes('Exempted')) {
            outEl.textContent = 'Exempted';
            outEl.style.color = '#66fcf1';
        } else {
            outEl.textContent = `${timeOutLog.time} (${timeOutLog.action.includes('Late') ? 'LATE' : 'ON TIME'})`;
            outEl.style.color = timeOutLog.action.includes('Late') ? '#f59e0b' : 'var(--success)';
        }
    }
    
    const details = timeOutLog.details || {};
    const tsGc = document.getElementById('ts-gc');
    const tsAnnounce = document.getElementById('ts-announce');
    const tsPosted = document.getElementById('ts-posted');
    
    if(tsGc) tsGc.textContent = details.gcHandle || 'Not Provided';
    if(tsAnnounce) tsAnnounce.textContent = details.announcement || 'Not Provided';
    if(tsPosted) tsPosted.textContent = details.whoPosted || 'Not Provided';
    
    const modal = document.getElementById('today-shift-modal');
    if(modal) modal.style.display = 'flex';
}

function closeTodayShiftModal() {
    const modal = document.getElementById('today-shift-modal');
    if(modal) modal.style.display = 'none';
}

let isCaptchaSolved = false;
let puzzleX = 0;
let puzzleY = 0;
let isDragging = false;
let startX = 0;
const l = 42; 
const r = 9;  

function drawAbstractBackground(ctx, w, h) {
    let grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#6ee7b7');
    grad.addColorStop(0.5, '#3b82f6');
    grad.addColorStop(1, '#9333ea');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath(); ctx.arc(w * 0.2, h * 0.3, 40, 0, 2 * Math.PI); ctx.fill();
    ctx.beginPath(); ctx.arc(w * 0.8, h * 0.7, 60, 0, 2 * Math.PI); ctx.fill();
    ctx.beginPath(); ctx.arc(w * 0.5, h * 0.9, 30, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.beginPath(); ctx.arc(w * 0.7, h * 0.2, 50, 0, 2 * Math.PI); ctx.fill();
    ctx.beginPath(); ctx.arc(w * 0.1, h * 0.8, 45, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    for(let i=0; i<w; i+=30) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); }
    for(let i=0; i<h; i+=30) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke(); }
}

function drawPuzzlePath(ctx, x, y, l, r) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + l / 2 - r, y);
    ctx.arc(x + l / 2, y, r, Math.PI, 0, false);
    ctx.lineTo(x + l, y);
    ctx.lineTo(x + l, y + l / 2 - r);
    ctx.arc(x + l, y + l / 2, r, 1.5 * Math.PI, 0.5 * Math.PI, false);
    ctx.lineTo(x + l, y + l);
    ctx.lineTo(x + l / 2 + r, y + l);
    ctx.arc(x + l / 2, y + l, r, 0, Math.PI, true);
    ctx.lineTo(x, y + l);
    ctx.lineTo(x, y + l / 2 + r);
    ctx.arc(x, y + l / 2, r, 0.5 * Math.PI, 1.5 * Math.PI, true);
    ctx.closePath();
}

function initSliderCaptcha() {
    const bgCanvas = document.getElementById('studentCaptchaBg');
    const pieceCanvas = document.getElementById('studentCaptchaPiece');
    const thumb = document.getElementById('studentSliderThumb');
    const fill = document.getElementById('studentSliderFill');
    const wrapper = document.getElementById('studentSliderWrapper');
    const errorMsg = document.getElementById('studentCaptchaError');
    const trackText = document.getElementById('studentSliderTrackText');

    if (!bgCanvas || !wrapper) return;

    const bgCtx = bgCanvas.getContext('2d');
    const pieceCtx = pieceCanvas.getContext('2d');

    isCaptchaSolved = false;
    if(errorMsg) errorMsg.style.display = 'none';
    if(thumb) {
        thumb.style.transition = 'none';
        thumb.style.transform = `translateX(0px)`;
        thumb.innerHTML = '➔';
        thumb.style.backgroundColor = '#1e2128';
        thumb.style.color = 'var(--accent)';
    }
    if(fill) {
        fill.style.transition = 'none';
        fill.style.width = `0px`;
        fill.style.backgroundColor = 'rgba(var(--accent-rgb), 0.2)';
    }
    if(pieceCanvas) {
        pieceCanvas.style.transition = 'none';
        pieceCanvas.style.transform = `translateX(0px)`;
    }
    if(trackText) trackText.style.display = 'block';

    const width = wrapper.clientWidth || 340; 
    const height = 120; 
    bgCanvas.width = width;
    bgCanvas.height = height;

    const sliderTargetX = Math.random() * (width - l - r*2 - 50) + 50; 
    puzzleX = sliderTargetX;
    puzzleY = Math.random() * (height - l - r*2) + r; 

    bgCtx.fillStyle = '#1e2128';
    bgCtx.fillRect(0, 0, width, height);
    bgCtx.fillStyle = '#9ca3af';
    bgCtx.font = '14px Arial';
    bgCtx.fillText('Loading puzzle...', width/2 - 45, height/2);
    if(pieceCtx) pieceCtx.clearRect(0,0, pieceCanvas.width, pieceCanvas.height);

    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = `https://picsum.photos/${Math.floor(width)}/${Math.floor(height)}?random=${Math.random()}`;
    
    img.onload = () => {
        bgCtx.clearRect(0, 0, width, height);
        bgCtx.drawImage(img, 0, 0, width, height);

        bgCtx.save();
        drawPuzzlePath(bgCtx, sliderTargetX + r, puzzleY, l, r);
        bgCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        bgCtx.fill();
        bgCtx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        bgCtx.lineWidth = 2;
        bgCtx.stroke();
        bgCtx.restore();

        pieceCanvas.width = l + r * 2;
        pieceCanvas.height = l + r * 2;
        pieceCanvas.style.top = `${puzzleY - r}px`;
        pieceCanvas.style.left = `0px`;

        pieceCtx.clearRect(0,0, pieceCanvas.width, pieceCanvas.height);
        pieceCtx.save();
        drawPuzzlePath(pieceCtx, r, r, l, r);
        pieceCtx.clip();
        pieceCtx.drawImage(img, sliderTargetX, puzzleY - r, pieceCanvas.width, pieceCanvas.height, 0, 0, pieceCanvas.width, pieceCanvas.height);
        pieceCtx.restore();

        pieceCtx.save();
        drawPuzzlePath(pieceCtx, r, r, l, r);
        pieceCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        pieceCtx.lineWidth = 2;
        pieceCtx.stroke();
        pieceCtx.restore();
    };

    img.onerror = () => {
        drawAbstractBackground(bgCtx, width, height);
        const offscreen = document.createElement('canvas');
        offscreen.width = width; 
        offscreen.height = height;
        drawAbstractBackground(offscreen.getContext('2d'), width, height);
        
        bgCtx.save();
        drawPuzzlePath(bgCtx, sliderTargetX + r, puzzleY, l, r);
        bgCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        bgCtx.fill();
        bgCtx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        bgCtx.lineWidth = 2;
        bgCtx.stroke();
        bgCtx.restore();

        pieceCanvas.width = l + r * 2;
        pieceCanvas.height = l + r * 2;
        pieceCanvas.style.top = `${puzzleY - r}px`;
        pieceCanvas.style.left = `0px`;

        pieceCtx.clearRect(0,0, pieceCanvas.width, pieceCanvas.height);
        pieceCtx.save();
        drawPuzzlePath(pieceCtx, r, r, l, r);
        pieceCtx.clip();
        pieceCtx.drawImage(offscreen, sliderTargetX, puzzleY - r, pieceCanvas.width, pieceCanvas.height, 0, 0, pieceCanvas.width, pieceCanvas.height);
        pieceCtx.restore();

        pieceCtx.save();
        drawPuzzlePath(pieceCtx, r, r, l, r);
        pieceCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        pieceCtx.lineWidth = 2;
        pieceCtx.stroke();
        pieceCtx.restore();
    };
}

function onDragStart(e) {
    if (isCaptchaSolved) return;
    const trackText = document.getElementById('studentSliderTrackText');
    const thumb = document.getElementById('studentSliderThumb');
    const fill = document.getElementById('studentSliderFill');
    const pieceCanvas = document.getElementById('studentCaptchaPiece');

    isDragging = true;
    startX = e.clientX || e.touches[0].clientX;
    if(thumb) thumb.style.transition = 'none';
    if(fill) fill.style.transition = 'none';
    if(pieceCanvas) pieceCanvas.style.transition = 'none';
    if(trackText) trackText.style.display = 'none';
}

function onDragMove(e) {
    if (!isDragging) return;
    e.preventDefault(); 
    
    const wrapper = document.getElementById('studentSliderWrapper');
    const thumb = document.getElementById('studentSliderThumb');
    const fill = document.getElementById('studentSliderFill');
    const pieceCanvas = document.getElementById('studentCaptchaPiece');

    if(!wrapper) return;

    let currentX = e.clientX || e.touches[0].clientX;
    let moveX = currentX - startX;
    const maxMove = wrapper.clientWidth - 42;
    
    if (moveX < 0) moveX = 0;
    if (moveX > maxMove) moveX = maxMove;

    if(thumb) thumb.style.transform = `translateX(${moveX}px)`;
    if(fill) fill.style.width = `${moveX + 21}px`;
    if(pieceCanvas) pieceCanvas.style.transform = `translateX(${moveX}px)`;
}

function onDragEnd(e) {
    if (!isDragging) return;
    isDragging = false;
    
    const wrapper = document.getElementById('studentSliderWrapper');
    const thumb = document.getElementById('studentSliderThumb');
    const fill = document.getElementById('studentSliderFill');
    const pieceCanvas = document.getElementById('studentCaptchaPiece');
    const errorMsg = document.getElementById('studentCaptchaError');
    const trackText = document.getElementById('studentSliderTrackText');

    if(!wrapper) return;

    let currentX = e.clientX || (e.changedTouches ? e.changedTouches[0].clientX : startX);
    let moveX = currentX - startX;
    const maxMove = wrapper.clientWidth - 42;
    
    if (moveX < 0) moveX = 0;
    if (moveX > maxMove) moveX = maxMove;

    if (Math.abs(moveX - puzzleX) < 8) {
        isCaptchaSolved = true;
        if(thumb) {
            thumb.innerHTML = '✔';
            thumb.style.backgroundColor = 'var(--success)';
            thumb.style.color = '#000';
            thumb.style.transform = `translateX(${puzzleX}px)`;
        }
        if(fill) {
            fill.style.backgroundColor = 'rgba(34, 197, 94, 0.3)';
            fill.style.width = `${puzzleX + 21}px`;
        }
        if(pieceCanvas) pieceCanvas.style.transform = `translateX(${puzzleX}px)`;
        if(errorMsg) errorMsg.style.display = 'none';
        
    } else {
        if(thumb) {
            thumb.style.transition = 'transform 0.3s ease';
            thumb.style.transform = `translateX(0px)`;
        }
        if(fill) {
            fill.style.transition = 'width 0.3s ease';
            fill.style.width = `0px`;
        }
        if(pieceCanvas) {
            pieceCanvas.style.transition = 'transform 0.3s ease';
            pieceCanvas.style.transform = `translateX(0px)`;
        }
        
        if(errorMsg) errorMsg.style.display = 'block';
        if(trackText) trackText.style.display = 'block';
        setTimeout(initSliderCaptcha, 500);
    }
}

let currentAdminCaptchaString = "";

function generateAdminCaptcha() {
    const canvas = document.getElementById('admin-captcha-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const chars = "abcdefghijklmnopqrstuvwxyz";
    let captchaText = "";
    for (let i = 0; i < 7; i++) { 
        captchaText += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    currentAdminCaptchaString = captchaText;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    for (let i = 0; i < 150; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(102, 252, 241, 0.4)' : 'rgba(239, 68, 68, 0.4)';
        ctx.beginPath();
        ctx.arc(Math.random() * canvas.width, Math.random() * canvas.height, Math.random() * 2, 0, Math.PI * 2);
        ctx.fill();
    }

    for (let i = 0; i < 10; i++) {
        ctx.strokeStyle = `rgba(${Math.random()*255}, ${Math.random()*255}, ${Math.random()*255}, 0.5)`;
        ctx.beginPath();
        ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
        ctx.lineTo(Math.random() * canvas.width, Math.random() * canvas.height);
        ctx.lineWidth = Math.random() * 2;
        ctx.stroke();
    }

    ctx.font = "bold 28px monospace";
    ctx.textBaseline = "middle";
    for (let i = 0; i < captchaText.length; i++) {
        const char = captchaText[i];
        ctx.save();
        const x = 20 + i * 32;
        const y = canvas.height / 2 + (Math.random() * 10 - 5);
        ctx.translate(x, y);
        const angle = (Math.random() * 0.8) - 0.4; 
        ctx.rotate(angle);
        ctx.fillStyle = `hsl(${Math.random() * 360}, 80%, 70%)`;
        ctx.shadowColor = "#000";
        ctx.shadowBlur = 5;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.fillText(char, 0, 0);
        ctx.restore();
    }
    
    const inputEl = document.getElementById('admin-captcha-input');
    if (inputEl) inputEl.value = '';
}

function checkDeviceLock() {
    const activeId = localStorage.getItem('activeDeviceStudent');
    const idInput = document.getElementById('student-id-input');
    const btnIn = document.querySelector('.btn-in');
    const lockMsg = document.getElementById('device-lock-msg');
    
    if (!idInput || !btnIn || !lockMsg) return;

    if (activeId) {
        const students = JSON.parse(localStorage.getItem('students')) || [];
        const student = students.find(s => String(s.id) === String(activeId));
        
        if (student) {
            const todayLogs = getTodayLogs(activeId);
            const hasTimeIn = todayLogs.some(l => l.action.includes('Time In'));
            const hasTimeOut = todayLogs.some(l => l.action.includes('Time Out'));
            
            if (hasTimeIn && !hasTimeOut) {
                idInput.value = activeId;
                idInput.disabled = true;
                btnIn.style.display = 'none';
                lockMsg.style.display = 'block';
                lockMsg.innerHTML = `🔒 Device locked to <strong>${student.name || 'Unknown'}</strong>.<br><span style="font-size: 0.75rem; color: var(--text-muted);">You must Time Out to free this device.</span>`;
                return; 
            }
        }
        localStorage.removeItem('activeDeviceStudent');
    }
    resetDeviceLockUI(idInput, btnIn, lockMsg);
}

function resetDeviceLockUI(idInput, btnIn, lockMsg) {
    if(idInput) {
        idInput.value = '';
        idInput.disabled = false;
    }
    if(btnIn) btnIn.style.display = 'inline-block';
    if(lockMsg) {
        lockMsg.style.display = 'none';
        lockMsg.textContent = '';
    }
}

async function isIncognito() {
    return new Promise((resolve) => {
        let isPrivate = false;

        if (navigator.storage && navigator.storage.estimate) {
            navigator.storage.estimate().then(estimate => {
                if (estimate.quota < 500000000) { 
                    resolve(true); 
                    return; 
                }
                const fs = window.RequestFileSystem || window.webkitRequestFileSystem;
                if (fs) {
                    fs(window.TEMPORARY, 100, 
                        () => { resolve(false); }, 
                        () => { resolve(true); }   
                    );
                } else {
                    resolve(false);
                }
            }).catch(() => resolve(false));
        } else {
            resolve(false);
        }
    });
}


function toggleEditLogOtherGC(val) {
    const otherInput = document.getElementById('edit-log-gc-other');
    if (val === 'Other') {
        otherInput.style.display = 'block';
    } else {
        otherInput.style.display = 'none';
        otherInput.value = '';
    }
}

function openEditLogModal(idNum, dateStr) {
    document.getElementById('edit-log-id').value = idNum;
    document.getElementById('edit-log-date').value = dateStr;

    const logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    const studentLogs = logs.filter(l => String(l.id) === String(idNum) && l.date === dateStr);

    const timeInLog = studentLogs.find(l => l.action.includes('Time In'));
    const timeOutLog = studentLogs.find(l => l.action.includes('Time Out'));

    let inTime = '';
    if (timeInLog && !timeInLog.action.includes('Exempted')) {
        inTime = timeInLog.time;
    }

    let outTime = '';
    let gc = '-';
    let ann = '-';
    let post = '-';

    if (timeOutLog && !timeOutLog.action.includes('Exempted')) {
        outTime = timeOutLog.time;
        if (timeOutLog.details) {
            gc = timeOutLog.details.gcHandle || '-';
            ann = timeOutLog.details.announcement || '-';
            post = timeOutLog.details.whoPosted || '-';
        }
    }

    document.getElementById('edit-log-in').value = inTime;
    document.getElementById('edit-log-out').value = outTime;

    const gcSelect = document.getElementById('edit-log-gc');
    const gcOther = document.getElementById('edit-log-gc-other');
    
    const knownGCs = ["-", "BSA", "BSIT", "BSED ENG", "BSPT", "BSHM", "BSTM", "BSCRIM", "BSPHARMA", "BSRESPI", "BSED FIL", "BSN", "BSPSYCH", "RAD", "BSRADTECH", "BEED", "BSBA-FM", "BSBA-MM", "BSMT"];
    if (knownGCs.includes(gc)) {
        gcSelect.value = gc;
        gcOther.style.display = 'none';
        gcOther.value = '';
    } else {
        gcSelect.value = 'Other';
        gcOther.style.display = 'block';
        gcOther.value = gc;
    }

    document.getElementById('edit-log-ann').value = ann;
    document.getElementById('edit-log-post').value = post;

    document.getElementById('edit-log-modal').style.display = 'flex';
}

function closeEditLogModal() {
    document.getElementById('edit-log-modal').style.display = 'none';
}

async function saveEditLogModal() {
    if(!isAuthenticated()) return;

    const idNum = document.getElementById('edit-log-id').value;
    const dateStr = document.getElementById('edit-log-date').value;
    
    const inVal = document.getElementById('edit-log-in').value.trim();
    const outVal = document.getElementById('edit-log-out').value.trim();
    
    let gcHandle = document.getElementById('edit-log-gc').value;
    if (gcHandle === 'Other') {
        gcHandle = document.getElementById('edit-log-gc-other').value.trim() || '-';
    }
    
    const ann = document.getElementById('edit-log-ann').value;
    const post = document.getElementById('edit-log-post').value;

    const timeRegex = /^(0?[1-9]|1[0-2]):[0-5][0-9]:[0-5][0-9]\s(AM|PM)$/i;
    
    if (inVal && !timeRegex.test(inVal)) {
        alert("Invalid Time In format. Use HH:MM:SS AM/PM (e.g., 05:00:00 AM)");
        return;
    }
    if (outVal && !timeRegex.test(outVal)) {
        alert("Invalid Time Out format. Use HH:MM:SS AM/PM (e.g., 05:00:00 PM)");
        return;
    }

    await pullFromCloud();
    let logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    const students = JSON.parse(localStorage.getItem('students')) || [];
    const student = students.find(s => String(s.id) === String(idNum));
    
    if (!student) return;

    logs = logs.filter(l => !(String(l.id) === String(idNum) && l.date === dateStr));

    if (!inVal && !outVal) {
        logs.push({
            name: student.name || 'Unknown',
            id: student.id,
            action: 'No Attendance',
            time: '00:00:00 AM', 
            date: dateStr,
            details: null
        });
    } else {
        if (inVal) {
            const timeMatch = inVal.match(/(\d+):(\d+):(\d+)\s+(AM|PM)/i);
            let h = parseInt(timeMatch[1]);
            const m = parseInt(timeMatch[2]);
            const ampm = timeMatch[4].toUpperCase();
            if (ampm === 'PM' && h !== 12) h += 12;
            if (ampm === 'AM' && h === 12) h = 0;
            
            const newAction = (h > 8 || (h === 8 && m >= 1)) ? 'Time In (Late)' : 'Time In';
            
            logs.push({
                name: student.name || 'Unknown',
                id: student.id,
                action: newAction,
                time: inVal.toUpperCase(),
                date: dateStr,
                details: null
            });
        }
        
        if (outVal) {
            const timeMatch = outVal.match(/(\d+):(\d+):(\d+)\s+(AM|PM)/i);
            let h = parseInt(timeMatch[1]);
            const ampm = timeMatch[4].toUpperCase();
            if (ampm === 'PM' && h !== 12) h += 12;
            if (ampm === 'AM' && h === 12) h = 0;
            
            const newAction = (h >= 0 && h <= 4) ? 'Time Out (Late)' : 'Time Out';

            logs.push({
                name: student.name || 'Unknown',
                id: student.id,
                action: newAction,
                time: outVal.toUpperCase(),
                date: dateStr,
                details: { gcHandle: gcHandle, announcement: ann, whoPosted: post }
            });
        }
    }

    localStorage.setItem('attendanceLogs', JSON.stringify(logs));
    await pushLogsToCloud();
    renderHistoryTable(dateStr);
    renderMainDashboard();
    closeEditLogModal();
}
