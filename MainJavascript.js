// ==========================================
// 1. LIVE RENDER BACKEND URL & CLOUD SYNC
// ==========================================
const API_BASE_URL = "https://support-backend-ldos.onrender.com/api";

// CLOUD PULL: Gets data from Render and updates LocalStorage
async function pullFromCloud() {
    try {
        const stuRes = await fetch(`${API_BASE_URL}/students`);
        if (stuRes.ok) {
            const students = await stuRes.json();
            if (students.length > 0) localStorage.setItem('students', JSON.stringify(students));
        }
        
        const logRes = await fetch(`${API_BASE_URL}/logs`);
        if (logRes.ok) {
            const logs = await logRes.json();
            if (logs.length > 0) localStorage.setItem('attendanceLogs', JSON.stringify(logs));
        }
    } catch (err) {
        console.warn("Cloud pull delayed. Render might be sleeping.");
    }
}

// CLOUD PUSH: Sends LocalStorage arrays to Render
async function pushStudentsToCloud() {
    const data = JSON.parse(localStorage.getItem('students')) || [];
    try {
        await fetch(`${API_BASE_URL}/students/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } catch (err) { console.error("Cloud Student Sync Failed"); }
}

async function pushLogsToCloud() {
    const data = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    try {
        await fetch(`${API_BASE_URL}/logs/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } catch (err) { console.error("Cloud Log Sync Failed"); }
}

// ==========================================
// 2. INITIALIZATION & STATE
// ==========================================
let pendingTimeOutStudent = null;
let pendingTimeOutAction = null;
let settingsClickCount = 0; 

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
});
if (_needsSave) {
    localStorage.setItem('students', JSON.stringify(_studentsInit));
    pushStudentsToCloud(); // Sync fix to cloud
}

document.addEventListener('DOMContentLoaded', async () => {
    // Attempt to download the latest data from the cloud on load
    await pullFromCloud();

    initDevUI();
    loadAccentColor(); 
    document.body.classList.add('portal-mode'); 
    
    checkAndApplyAutoNoAttendance();
    checkAndApplyAutoTimeOut(); 

    const isPrivate = await isIncognito();
    if (isPrivate) {
        document.getElementById('turn-in-form').style.display = 'none';
        document.getElementById('locked-screen').style.display = 'none';
        document.getElementById('incognito-screen').style.display = 'block';
    } else {
        checkDeviceLock(); 
        setTimeout(initSliderCaptcha, 50); 
    }

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
    
    if (sessionStorage.getItem('adminLoggedIn') === 'true') {
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
});

setInterval(() => {
    let updatedNoAtt = checkAndApplyAutoNoAttendance();
    let updatedTimeOut = checkAndApplyAutoTimeOut(); 
    
    if (updatedNoAtt || updatedTimeOut) {
        if (document.getElementById('admin-dashboard-view').classList.contains('active')) {
            renderDashboardSummary();
            renderLogs();
            renderMainDashboard();
            renderDutyToday();
        }
    }
}, 60000);

// ==========================================
// 3. ADMIN AUTHENTICATION
// ==========================================
async function loginAdmin(event) {
    event.preventDefault();
    const usernameInput = document.getElementById('admin-username').value;
    const passwordInput = document.getElementById('admin-password').value;
    const errorMsg = document.getElementById('login-error');

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
            document.getElementById('login-section').style.display = 'none';
            document.getElementById('admin-dashboard').style.display = 'block';
            
            // Sync completely upon login
            await pullFromCloud();
            fetchAdminAccounts();
            renderStudents();
            renderLogs(); 
            renderMainDashboard();
        } else {
            errorMsg.textContent = data.message || "Invalid credentials.";
            errorMsg.style.display = 'block';
        }
    } catch (error) {
        errorMsg.textContent = "Server error. Please try again.";
        errorMsg.style.display = 'block';
    }
}

function logoutAdmin() {
    sessionStorage.removeItem('adminLoggedIn');
    sessionStorage.removeItem('currentAdminSec');
    switchView('student-view');
}

// ==========================================
// 4. ADMIN ACCOUNTS (CLOUD DIRECT)
// ==========================================
async function createAdminAccount() {
    const user = document.getElementById('new-admin-user').value.trim();
    const pass = document.getElementById('new-admin-pass').value.trim();
    
    if(!user || !pass) {
        showMessage('acc-message', 'Please fill all fields', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/add-account`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });

        const data = await response.json();
        if(data.success) {
            showMessage('acc-message', 'Account created successfully!', 'success');
            document.getElementById('new-admin-user').value = '';
            document.getElementById('new-admin-pass').value = '';
            fetchAdminAccounts();
        } else {
            showMessage('acc-message', data.message, 'error');
        }
    } catch(err) {
        showMessage('acc-message', 'Server error connection to backend.', 'error');
    }
}

async function fetchAdminAccounts() {
    const list = document.getElementById('admin-accounts-list');
    if (!list) return;
    list.innerHTML = '<li style="padding: 10px; text-align: center;">Loading accounts...</li>';

    try {
        const response = await fetch(`${API_BASE_URL}/accounts`, { cache: 'no-store' });
        const data = await response.json();
        list.innerHTML = '';
        data.forEach(user => {
            const li = document.createElement('li');
            li.style.padding = '10px 15px';
            li.style.borderBottom = '1px solid #2d313c';
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';
            
            let delBtn = user !== 'MainHeadAcc' 
                ? `<button onclick="deleteAdminAccount('${user}')" style="background: transparent; color: var(--error); border: 1px solid var(--error); padding: 4px 8px; font-size: 10px; cursor: pointer;">DELETE</button>` 
                : `<span style="font-size: 10px; color: var(--text-muted);">DEFAULT</span>`;

            li.innerHTML = `<span style="color: var(--text-main); font-weight: bold;">${user}</span> ${delBtn}`;
            list.appendChild(li);
        });
    } catch (err) {
        list.innerHTML = `<li style="color: var(--error); padding: 10px; text-align: center;">Unable to load accounts.</li>`;
    }
}

async function deleteAdminAccount(user) {
    if(!confirm(`Are you sure you want to delete the account: ${user}?`)) return;
    try {
        const response = await fetch(`${API_BASE_URL}/delete-account/${user}`, { method: 'DELETE' });
        const data = await response.json();
        if(data.success) fetchAdminAccounts();
        else alert(data.message);
    } catch(err) { alert('Server error connecting to backend.'); }
}

// ==========================================
// 5. STUDENT DATA MANAGEMENT
// ==========================================
function createStudent() {
    const name = document.getElementById('new-student-name').value.trim();
    const idNum = document.getElementById('new-student-id').value.trim();
    const gcHandle = document.getElementById('new-student-gc').value.trim();

    if (!name || !idNum) {
        showMessage('admin-message', 'Please fill in Name and ID fields.', 'error');
        return;
    }

    const students = JSON.parse(localStorage.getItem('students')) || [];
    
    if (students.some(s => s.id === idNum)) {
        showMessage('admin-message', 'Student ID already exists!', 'error');
        return;
    }

    students.push({ 
        name: name, 
        id: idNum, 
        assignedDays: [],
        gcHandle: gcHandle
    });
    
    localStorage.setItem('students', JSON.stringify(students));
    pushStudentsToCloud(); // Sync to cloud
    
    document.getElementById('new-student-name').value = '';
    document.getElementById('new-student-id').value = '';
    document.getElementById('new-student-gc').value = '';
    
    showMessage('admin-message', 'Student created globally!', 'success');
    
    renderStudents();
    renderSchedule();
    renderMainDashboard(); 
    renderDashboardSummary();
    renderDutyToday();
}

function updateStudentGC() {
    const idNum = document.getElementById('edit-student-id').value.trim();
    const newGc = document.getElementById('edit-student-gc').value.trim();

    if (!idNum) {
        showMessage('edit-gc-message', 'Please enter a Student ID.', 'error');
        return;
    }

    const students = JSON.parse(localStorage.getItem('students')) || [];
    const studentIndex = students.findIndex(s => s.id === idNum);

    if (studentIndex === -1) {
        showMessage('edit-gc-message', 'Student ID not found!', 'error');
        return;
    }

    students[studentIndex].gcHandle = newGc;
    localStorage.setItem('students', JSON.stringify(students));
    pushStudentsToCloud(); // Sync to cloud

    document.getElementById('edit-student-id').value = '';
    document.getElementById('edit-student-gc').value = '';

    showMessage('edit-gc-message', 'GC Handle updated globally!', 'success');
    
    renderStudents();
    renderSchedule();
    renderMainDashboard(); 
    renderDashboardSummary();
    renderDutyToday();
}

function deleteStudent(idNum) {
    if (!confirm("Are you sure you want to remove this student? This will not delete their existing logs but will prevent them from logging in.")) return;
    
    let students = JSON.parse(localStorage.getItem('students')) || [];
    students = students.filter(s => s.id !== idNum);
    localStorage.setItem('students', JSON.stringify(students));
    pushStudentsToCloud(); // Sync to cloud
    
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

function toggleStudentDay(id, day) {
    const students = JSON.parse(localStorage.getItem('students')) || [];
    const student = students.find(s => s.id === id);
    
    if (student) {
        if (!student.assignedDays) student.assignedDays = [];
        
        if (student.assignedDays.includes(day)) {
            student.assignedDays = student.assignedDays.filter(d => d !== day);
        } else {
            student.assignedDays.push(day);
        }
        
        localStorage.setItem('students', JSON.stringify(students));
        pushStudentsToCloud(); // Sync to cloud
        
        if (document.getElementById('admin-dashboard-view').classList.contains('active')) {
            renderSchedule();
            renderMainDashboard();
            renderDashboardSummary();
            renderLogs();
            renderDutyToday();
        }
    }
}

// ==========================================
// 6. ATTENDANCE LOGGING & SYNCING
// ==========================================
function logAttendanceAction(student, action, endOfShiftDetails = null) {
    const logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    const pht = getPHT();
    const timeStr = pht.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = pht.toLocaleDateString('en-US');
    
    logs.push({
        name: student.name,
        id: student.id,
        action: action,
        time: timeStr,
        date: dateStr,
        details: endOfShiftDetails 
    });
    
    localStorage.setItem('attendanceLogs', JSON.stringify(logs));
    pushLogsToCloud(); // Sync to cloud

    enforceHistoryLimit(); 
    
    if (document.getElementById('admin-dashboard-view').classList.contains('active')) {
        renderLogs();
        renderMainDashboard();
        renderDashboardSummary();
        renderDutyToday();
    }
}

function deleteLog(originalIndex) {
    if (!confirm("Delete this attendance record?")) return;
    
    let logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    logs.splice(originalIndex, 1); 
    
    localStorage.setItem('attendanceLogs', JSON.stringify(logs));
    pushLogsToCloud(); // Sync to cloud
    
    renderLogs();
    renderMainDashboard();
    renderDashboardSummary(); 
    renderDutyToday();
}

function deleteHistoryDate(dateStr, event) {
    event.stopPropagation(); 
    if(confirm(`⚠️ WARNING ⚠️\n\nAre you sure you want to completely delete ALL attendance logs for ${dateStr}?\n\nThis action cannot be undone.`)) {
        let logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
        logs = logs.filter(l => l.date !== dateStr);
        localStorage.setItem('attendanceLogs', JSON.stringify(logs));
        pushLogsToCloud(); // Sync to cloud
        
        renderHistoryView();
        
        const currentTitle = document.getElementById('history-table-title').textContent;
        if (currentTitle.includes(dateStr)) {
            document.getElementById('history-table-container').style.display = 'none';
        }
    }
}

function devClearLogs() {
    if(confirm("This will permanently delete ALL attendance logs from the cloud database. Continue?")) {
        localStorage.setItem('attendanceLogs', JSON.stringify([]));
        pushLogsToCloud(); // Sync to cloud
        
        if (document.getElementById('admin-dashboard-view').classList.contains('active')) {
            renderLogs();
            renderHistoryView();
            renderMainDashboard();
            renderDutyToday();
        }
        showMessage('dev-message', 'All logs cleared from cloud!', 'success');
    }
}

// ==========================================
// 7. TIME IN / TIME OUT LOGIC (Unchanged UI)
// ==========================================
function handleTimeIn() {
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

    const students = JSON.parse(localStorage.getItem('students')) || [];
    const student = students.find(s => s.id === idNum);
    if (!student) { 
        showMessage('student-message', 'ID not found.', 'error'); 
        initSliderCaptcha(); 
        checkDeviceLock();
        return; 
    }

    const currentDay = getPHTDayString();
    if (!student.assignedDays || student.assignedDays.length === 0) {
        showMessage('student-message', 'You have no assigned schedule. Please contact the Support Head.', 'error');
        initSliderCaptcha();
        checkDeviceLock();
        return;
    }
    if (!student.assignedDays.includes(currentDay)) {
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

    const hour = getPHT().getHours();

    if (hour < 7) {
        showMessage('student-message', 'Time In opens at 7:00 AM.', 'error');
        initSliderCaptcha();
        return;
    } else if (hour >= 19) { 
        logAttendanceAction(student, 'No Attendance');
        showLockedScreen('You missed your Time In for today. You are marked as No Attendance.');
    } else if (hour >= 9) { 
        logAttendanceAction(student, 'Time In (Late)');
        showMessage('student-message', 'Successfully logged Time In (Late)', 'success');
    } else { 
        logAttendanceAction(student, 'Time In');
        showMessage('student-message', 'Successfully logged Time In', 'success');
    }
    
    localStorage.setItem('activeDeviceStudent', student.id);
    initSliderCaptcha(); 
    checkDeviceLock(); 
}

function handleTimeOut() {
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

    const students = JSON.parse(localStorage.getItem('students')) || [];
    const student = students.find(s => s.id === idNum);
    if (!student) { 
        showMessage('student-message', 'ID not found.', 'error'); 
        initSliderCaptcha(); 
        checkDeviceLock();
        return; 
    }

    const currentDay = getPHTDayString();
    if (!student.assignedDays || student.assignedDays.length === 0) {
        showMessage('student-message', 'You have no assigned schedule. Please contact the Support Head.', 'error');
        initSliderCaptcha();
        checkDeviceLock();
        return;
    }
    if (!student.assignedDays.includes(currentDay)) {
        showMessage('student-message', `Access Denied: You are not scheduled for today. Your shifts are on: ${student.assignedDays.join(', ')}.`, 'error');
        initSliderCaptcha();
        checkDeviceLock();
        return;
    }

    const todayLogs = getTodayLogs(idNum);
    const hasTimeIn = todayLogs.some(l => l.action.includes('Time In'));
    const hour = getPHT().getHours();

    if (!hasTimeIn) {
        if (hour >= 19) {
            logAttendanceAction(student, 'No Attendance');
            showLockedScreen('You missed your Time In for today. You are marked as No Attendance.');
        } else {
            showMessage('student-message', 'No Time In record found for today.', 'error');
            initSliderCaptcha();
            checkDeviceLock();
        }
        return;
    }

    if (todayLogs.some(l => l.action.includes('Time Out'))) {
        showMessage('student-message', 'You have already timed out today.', 'error');
        initSliderCaptcha();
        checkDeviceLock();
        return;
    }

    if (hour < 19) {
        showMessage('student-message', 'Time Out opens at 7:00 PM.', 'error');
        initSliderCaptcha();
        checkDeviceLock();
        return;
    } 

    pendingTimeOutStudent = student;
    pendingTimeOutAction = (hour >= 21) ? 'Time Out (Late)' : 'Time Out';
    
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
    
    document.getElementById('timeout-modal').style.display = 'flex';
}

function finalizeTimeOut() {
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

    logAttendanceAction(pendingTimeOutStudent, pendingTimeOutAction, {
        gcHandle: gcHandle,
        announcement: announcement.value,
        whoPosted: whoPosted.value
    });

    document.getElementById('timeout-modal').style.display = 'none';
    showMessage('student-message', `Successfully logged ${pendingTimeOutAction}`, 'success');

    pendingTimeOutStudent = null;
    pendingTimeOutAction = null;
    
    localStorage.removeItem('activeDeviceStudent');
    
    initSliderCaptcha(); 
    checkDeviceLock(); 
}

// ==========================================
// 8. AUTO-CALCULATIONS
// ==========================================
function checkAndApplyAutoNoAttendance() {
    const pht = getPHT();
    if (pht.getHours() < 19) return false; 
    
    let logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    const students = JSON.parse(localStorage.getItem('students')) || [];
    const todayStr = pht.toLocaleDateString('en-US');
    const currentDay = getPHTDayString();
    
    let updated = false;
    
    const scheduledToday = students.filter(s => s.assignedDays && s.assignedDays.includes(currentDay));
    
    scheduledToday.forEach(student => {
        const hasLogToday = logs.some(l => l.id === student.id && l.date === todayStr);
        if (!hasLogToday) {
            const timeStr = pht.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            logs.push({
                name: student.name,
                id: student.id,
                action: 'No Attendance',
                time: timeStr,
                date: todayStr,
                details: null
            });
            updated = true;
        }
    });
    
    if (updated) {
        localStorage.setItem('attendanceLogs', JSON.stringify(logs));
        pushLogsToCloud(); // Sync to cloud
    }
    return updated;
}

function checkAndApplyAutoTimeOut() {
    const pht = getPHT();
    const todayStr = pht.toLocaleDateString('en-US');
    let logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    let updated = false;

    const uniqueDates = [...new Set(logs.map(l => l.date))];

    uniqueDates.forEach(dateStr => {
        if (dateStr !== todayStr) {
            const dayLogs = logs.filter(l => l.date === dateStr);
            const studentIds = [...new Set(dayLogs.map(l => l.id))];

            studentIds.forEach(id => {
                const sLogs = dayLogs.filter(l => l.id === id);
                const hasTimeIn = sLogs.some(l => l.action.includes('Time In'));
                const hasTimeOut = sLogs.some(l => l.action.includes('Time Out'));

                if (hasTimeIn && !hasTimeOut) {
                    const studentName = sLogs[0].name;
                    logs.push({
                        name: studentName,
                        id: id,
                        action: 'Time Out (Late)',
                        time: '11:59:59 PM',
                        date: dateStr,
                        details: {
                            gcHandle: 'Auto-Logged by System',
                            announcement: 'No',
                            whoPosted: 'System Auto-Log'
                        }
                    });
                    updated = true;
                }
            });
        }
    });

    if (updated) {
        localStorage.setItem('attendanceLogs', JSON.stringify(logs));
        pushLogsToCloud(); // Sync to cloud
        enforceHistoryLimit(); 
    }
    return updated;
}

function enforceHistoryLimit() {
    let logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    let uniqueDates = [...new Set(logs.map(l => l.date))];
    
    uniqueDates.sort((a, b) => new Date(a) - new Date(b));

    if (uniqueDates.length > 30) {
        const datesToKeep = uniqueDates.slice(-30);
        logs = logs.filter(l => datesToKeep.includes(l.date));
        localStorage.setItem('attendanceLogs', JSON.stringify(logs));
        pushLogsToCloud(); // Sync to cloud
    }
}

// ==========================================
// 9. UI RENDERING LOGIC (Local Arrays for Speed)
// ==========================================
function renderStudents() {
    const list = document.getElementById('registered-students-list');
    if (!list) return;
    
    const students = JSON.parse(localStorage.getItem('students')) || [];
    const searchInput = document.getElementById('search-student');
    const query = searchInput ? searchInput.value.toLowerCase() : '';
    
    list.innerHTML = '';
    let filteredStudents = students.filter(student => 
        (student.name && student.name.toLowerCase().includes(query)) || 
        (student.id && student.id.toLowerCase().includes(query))
    );

    filteredStudents.sort((a, b) => a.name.localeCompare(b.name));
    filteredStudents.forEach(student => {
        const li = document.createElement('li');
        const safeId = student.id.replace(/'/g, "\\'"); 
        let gcTag = student.gcHandle ? `<span class="gc-tag">${student.gcHandle}</span>` : '';

        li.innerHTML = `
            <div style="display: flex; flex-direction: column;">
                <div><span style="font-weight: bold; color: var(--text-main);">${student.name}</span> ${gcTag}</div>
                <span style="font-size: 0.8rem; color: var(--text-muted);">ID: ${student.id}</span>
            </div>
            <button onclick="viewPerformance('${safeId}')" style="background: rgba(var(--accent-rgb), 0.1); color: var(--accent); padding: 6px 15px; border-radius: 4px; font-size: 11px; border: 1px solid var(--accent); cursor: pointer;">
                VIEW PERFORMANCE
            </button>
        `;
        list.appendChild(li);
    });
}

function searchStudents() {
    renderStudents();
}

// ==========================================
// 10. ALL UNMODIFIED UI & CAPTCHA FUNCTIONS BELOW
// ==========================================
// (These were kept exactly as you had them since they don't modify data)
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
    const currentView = document.querySelector('.view.active').id;
    if (currentView === 'student-view') {
        switchView('admin-login-view');
    } else {
        switchView('student-view');
    }
}

async function switchView(viewId) {
    document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    
    document.querySelectorAll('.message').forEach(msg => msg.textContent = '');
    
    if (viewId === 'student-view') {
        const isPrivate = await isIncognito();
        if (isPrivate) {
            document.getElementById('turn-in-form').style.display = 'none';
            document.getElementById('locked-screen').style.display = 'none';
            document.getElementById('incognito-screen').style.display = 'block';
        } else {
            document.getElementById('incognito-screen').style.display = 'none';
            document.getElementById('turn-in-form').style.display = 'block';
            checkDeviceLock(); 
            setTimeout(initSliderCaptcha, 50); 
        }
    }
    
    generateAdminCaptcha();
    
    if (viewId === 'admin-dashboard-view') {
        document.body.classList.remove('portal-mode'); 
        document.getElementById('main-header').style.display = 'none';
        document.getElementById('mobile-header').style.display = 'none';
        
        enforceHistoryLimit();
        renderStudents();
        renderLogs();
        renderMainDashboard(); 
        renderDutyToday(); 
    } else {
        document.body.classList.add('portal-mode'); 
        document.getElementById('main-header').style.display = 'flex';
        document.getElementById('mobile-header').style.display = 'flex';
        
        document.querySelectorAll('.portal-toggle-btn').forEach(btn => {
            btn.textContent = viewId === 'student-view' ? 'Support Head Portal' : 'Student Portal';
        });
    }
}

function switchAdminSection(sectionId, navElement) {
    document.querySelectorAll('.admin-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');
    
    document.querySelectorAll('.admin-nav-item').forEach(item => item.classList.remove('active'));
    if(navElement) navElement.classList.add('active');

    sessionStorage.setItem('currentAdminSec', sectionId);

    if (sectionId === 'sec-settings') {
        settingsClickCount++;
        if (settingsClickCount >= 20) {
            document.getElementById('dev-tools-panel').style.display = 'flex';
        }
        fetchAdminAccounts(); 
    } else {
        settingsClickCount = 0; 
    }

    if (sectionId === 'sec-schedule') renderSchedule();
    if (sectionId === 'sec-dashboard') renderMainDashboard();
    if (sectionId === 'sec-history') renderHistoryView();
    if (sectionId === 'sec-attendance') {
        document.getElementById('tab-btn-summary').click();
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
        paneSummary.style.display = 'flex';
        paneLogs.style.display = 'none';
        btnSummary.classList.add('active');
        btnLogs.classList.remove('active');
        renderDashboardSummary();
    } else {
        paneSummary.style.display = 'none';
        paneLogs.style.display = 'flex';
        btnSummary.classList.remove('active');
        btnLogs.classList.add('active');
        renderLogs();
    }
}

function handleGlobalSearch() {
    if (document.getElementById('att-pane-summary').style.display !== 'none') {
        renderDashboardSummary();
    } else {
        renderLogs();
    }
}

function renderLogs() {
    const logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    const students = JSON.parse(localStorage.getItem('students')) || [];
    const tbody = document.getElementById('attendance-logs-body');
    
    const searchInput = document.getElementById('search-attendance-global');
    const query = searchInput ? searchInput.value.toLowerCase() : '';

    if (!tbody) return;
    tbody.innerHTML = '';
    
    const todayStr = getPHT().toLocaleDateString('en-US');
    const currentDay = getPHTDayString();
    const logsWithIndex = logs.map((log, index) => ({ ...log, originalIndex: index }));

    logsWithIndex.reverse().filter(log => {
        const student = students.find(s => s.id === log.id);
        const isScheduledToday = student && student.assignedDays && student.assignedDays.includes(currentDay);
        
        return log.date === todayStr &&
               isScheduledToday &&
               (log.name.toLowerCase().includes(query) || log.id.toLowerCase().includes(query));
    }).forEach(log => {
        const tr = document.createElement('tr');
        
        let statusColor = 'var(--text-main)';
        if (log.action.includes('Late')) statusColor = '#f59e0b'; 
        else if (log.action.includes('In')) statusColor = 'var(--success)';
        else if (log.action.includes('Out')) statusColor = 'var(--error)';
        else if (log.action === 'No Attendance') statusColor = '#6b7280';

        let todayShiftBtn = '';
        if (log.action.includes('Out') && log.details) {
            todayShiftBtn = `<button onclick="viewTodayShift('${log.id}', '${log.date}')" style="background: rgba(var(--accent-rgb), 0.1); color: var(--accent); padding: 5px 10px; border-radius: 4px; font-size: 10px; font-weight: bold; border: 1px solid var(--accent); margin-right: 8px; cursor: pointer;">TODAY SHIFT</button>`;
        }

        tr.innerHTML = `
            <td>${log.name}</td>
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
}

function renderDutyToday() {
    const students = JSON.parse(localStorage.getItem('students')) || [];
    const logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    const dutyList = document.getElementById('duty-today-list');
    if (!dutyList) return;

    const currentDay = getPHTDayString();
    const todayStr = getPHT().toLocaleDateString('en-US');

    const scheduledToday = students.filter(student => student.assignedDays && student.assignedDays.includes(currentDay));
    scheduledToday.sort((a, b) => a.name.localeCompare(b.name));

    dutyList.innerHTML = '';

    if (scheduledToday.length === 0) {
        dutyList.innerHTML = '<p class="placeholder-text" style="text-align:center; padding: 20px;">No one is scheduled for duty today.</p>';
        return;
    }

    scheduledToday.forEach(student => {
        const hasTimedIn = logs.some(l => l.id === student.id && l.date === todayStr && l.action.includes('In'));
        const hasTimedOut = logs.some(l => l.id === student.id && l.date === todayStr && l.action.includes('Out'));

        let statusDot = '#f59e0b'; 
        if (hasTimedOut) {
            statusDot = '#6b7280'; 
        } else if (hasTimedIn) {
            statusDot = '#22c55e'; 
        }

        const card = document.createElement('div');
        card.className = 'duty-card';
        card.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 10px; height: 10px; border-radius: 50%; background-color: ${statusDot}; flex-shrink: 0;"></div>
                <strong style="color: var(--text-main); font-size: 13px;">${student.name}</strong>
            </div>
            <span style="font-size: 11px; color: var(--text-muted);">${student.gcHandle || ''}</span>
        `;
        dutyList.appendChild(card);
    });
}

function exportToExcel(dateStr = null) {
    const logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    const targetDate = dateStr || getPHT().toLocaleDateString('en-US');
    const targetLogs = logs.filter(l => l.date === targetDate);

    if (targetLogs.length === 0) {
        alert(`No attendance logs found for ${targetDate} to export.`);
        return;
    }

    const data = [
        ["NAME", "ID NUMBER", "TIME IN", "TIME OUT", "DATE", "GC HANDLE", "ANNOUNCEMENT", "POSTED BY"]
    ];

    const studentIds = new Set(targetLogs.map(l => l.id));

    studentIds.forEach(id => {
        const studentLogs = targetLogs.filter(l => l.id === id);
        const name = studentLogs[0].name;

        const timeInLog = studentLogs.find(l => l.action.includes('In'));
        const timeOutLog = studentLogs.find(l => l.action.includes('Out'));
        const noAttLog = studentLogs.find(l => l.action === 'No Attendance');

        let inText = '--';
        let outText = '--';
        let gc = '';
        let ann = '';
        let post = '';

        if (noAttLog) {
            inText = 'No Attendance';
            outText = 'No Attendance';
        } else {
            if (timeInLog) {
                inText = `${timeInLog.time} (${timeInLog.action.includes('Late') ? 'Late' : 'On Time'})`;
            }
            if (timeOutLog) {
                outText = `${timeOutLog.time} (${timeOutLog.action.includes('Late') ? 'Late' : 'On Time'})`;
                const details = timeOutLog.details || {};
                gc = details.gcHandle || '';
                ann = details.announcement || '';
                post = details.whoPosted || '';
            }
        }

        data.push([name, id, inText, outText, targetDate, gc, ann, post]);
    });

    const ws = XLSX.utils.aoa_to_sheet(data);

    for (let i = 0; i < 8; i++) {
        const cellRef = XLSX.utils.encode_cell({c:i, r:0});
        if (ws[cellRef]) {
            ws[cellRef].s = {
                font: { bold: true, color: { rgb: "FFFFFF" } },
                fill: { fgColor: { rgb: "334155" } }
            };
        }
    }

    ws['!cols'] = [
        { wpx: 180 }, { wpx: 120 }, { wpx: 150 }, { wpx: 150 },
        { wpx: 100 }, { wpx: 150 }, { wpx: 120 }, { wpx: 200 } 
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");

    const dateFileName = targetDate.replace(/\//g, '-');
    XLSX.writeFile(wb, `Support_Attendance_${dateFileName}.xlsx`);
}

function showMessage(elementId, text, type) {
    const msgElement = document.getElementById(elementId);
    msgElement.textContent = text;
    msgElement.className = `message ${type}`;
    setTimeout(() => { msgElement.textContent = ''; }, 4000);
}

function getPHT() {
    let pht = new Date();
    
    const devDate = localStorage.getItem('devDateOverride');
    const devTime = localStorage.getItem('devTimeOverride');

    if (devDate) {
        const [y, m, d] = devDate.split('-');
        pht.setFullYear(parseInt(y), parseInt(m) - 1, parseInt(d));
    }

    if (devTime) {
        const [h, min] = devTime.split(':');
        pht.setHours(parseInt(h), parseInt(min), 0, 0);
    }

    return pht;
}

function getPHTDayString() {
    const devDay = localStorage.getItem('devDayOverride');
    if (devDay) return devDay;

    const pht = getPHT();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[pht.getDay()];
}

function getTodayLogs(idNum) {
    const logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    const todayStr = getPHT().toLocaleDateString('en-US');
    return logs.filter(l => l.id === idNum && l.date === todayStr);
}

function showLockedScreen(message) {
    document.getElementById('turn-in-form').style.display = 'none';
    document.getElementById('locked-screen').style.display = 'block';
    document.getElementById('locked-message').textContent = message;
}

async function resetStudentUI() {
    const isPrivate = await isIncognito();
    if (isPrivate) {
        document.getElementById('turn-in-form').style.display = 'none';
        document.getElementById('locked-screen').style.display = 'none';
        document.getElementById('incognito-screen').style.display = 'block';
        return;
    }
    
    document.getElementById('turn-in-form').style.display = 'block';
    document.getElementById('locked-screen').style.display = 'none';
    document.getElementById('incognito-screen').style.display = 'none';
    
    document.getElementById('student-id-input').value = '';
    document.getElementById('student-message').textContent = '';
    
    checkDeviceLock();
    initSliderCaptcha();
}

function renderSchedule() {
    const students = JSON.parse(localStorage.getItem('students')) || [];
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
    
    let filteredStudents = students.filter(student => 
        (student.name && student.name.toLowerCase().includes(query)) || 
        (student.id && student.id.toLowerCase().includes(query)) ||
        (student.gcHandle && student.gcHandle.toLowerCase().includes(query))
    );

    if (filterVal === 'UNASSIGNED') {
        filteredStudents = filteredStudents.filter(s => !s.assignedDays || s.assignedDays.length === 0);
    } else if (filterVal === 'ASSIGNED') {
        filteredStudents = filteredStudents.filter(s => s.assignedDays && s.assignedDays.length > 0);
    }

    filteredStudents.sort((a, b) => {
        const nameA = (a.name || '').toLowerCase().trim();
        const nameB = (b.name || '').toLowerCase().trim();
        const idA = (a.id || '').toString().trim();
        const idB = (b.id || '').toString().trim();
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
        return 0; 
    });

    filteredStudents.forEach(student => {
        const tr = document.createElement('tr');
        const safeId = student.id.replace(/'/g, "\\'");
        
        let togglesHtml = days.map((day, index) => {
            const isActive = student.assignedDays && student.assignedDays.includes(day);
            return `<button class="day-toggle ${isActive ? 'active' : ''}" onclick="toggleStudentDay('${safeId}', '${day}')">${dayLabels[index]}</button>`;
        }).join('');
        
        let gcTagHtml = student.gcHandle ? `<span class="gc-tag" style="margin: 0; font-size: 10px; padding: 2px 6px;">${student.gcHandle}</span>` : '<span style="color: var(--text-muted); font-size: 11px;">None</span>';

        tr.innerHTML = `
            <td style="white-space: normal;"><strong style="color: var(--text-main);">${student.name}</strong></td>
            <td style="white-space: normal;">${gcTagHtml}</td>
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
}

function renderHistoryView() {
    const logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    let uniqueDates = [...new Set(logs.map(l => l.date))];
    
    uniqueDates.sort((a, b) => new Date(b) - new Date(a)); 

    const container = document.getElementById('history-cards-container');
    if(!container) return;
    container.innerHTML = '';

    if (uniqueDates.length === 0) {
        container.innerHTML = '<p class="placeholder-text">No history available yet.</p>';
        document.getElementById('history-table-container').style.display = 'none';
        return;
    }

    uniqueDates.forEach(dateStr => {
        const card = document.createElement('div');
        card.className = 'history-card';
        card.onclick = () => renderHistoryTable(dateStr);
        
        card.innerHTML = `
            <strong style="font-size: 1.1rem; color: var(--text-main);">${dateStr}</strong>
            <button onclick="deleteHistoryDate('${dateStr}', event)" class="history-trash-btn">✖</button>
        `;
        container.appendChild(card);
    });
    
    document.getElementById('history-table-container').style.display = 'none';
}

function renderHistoryTable(dateStr) {
    const logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    const dayLogs = logs.filter(l => l.date === dateStr);
    
    document.getElementById('history-table-container').style.display = 'flex';
    document.getElementById('history-table-title').textContent = `Logs for ${dateStr}`;
    
    document.getElementById('history-export-btn').onclick = () => exportToExcel(dateStr);
    
    const tbody = document.getElementById('history-logs-body');
    tbody.innerHTML = '';

    const studentIds = new Set(dayLogs.map(l => l.id));

    studentIds.forEach(id => {
        const studentLogs = dayLogs.filter(l => l.id === id);
        const name = studentLogs[0].name;

        const timeInLog = studentLogs.find(l => l.action.includes('In'));
        const timeOutLog = studentLogs.find(l => l.action.includes('Out'));
        const noAttLog = studentLogs.find(l => l.action === 'No Attendance');

        let inText = '--';
        let outText = '--';
        let gc = '-';
        let ann = '-';
        let post = '-';

        if (noAttLog) {
            inText = '<span style="color: var(--error);">No Attendance</span>';
            outText = '<span style="color: var(--error);">No Attendance</span>';
        } else {
            if (timeInLog) {
                const color = timeInLog.action.includes('Late') ? '#f59e0b' : 'var(--success)';
                inText = `<span style="color: ${color};">${timeInLog.time}</span>`;
            }
            if (timeOutLog) {
                const color = timeOutLog.action.includes('Late') ? '#f59e0b' : 'var(--success)';
                outText = `<span style="color: ${color};">${timeOutLog.time}</span>`;

                const details = timeOutLog.details || {};
                gc = details.gcHandle || '-';
                ann = details.announcement || '-';
                post = details.whoPosted || '-';
            }
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${name}</td>
            <td>${id}</td>
            <td style="font-weight: bold;">${inText}</td>
            <td style="font-weight: bold;">${outText}</td>
            <td style="color: var(--text-muted);">${gc}</td>
            <td style="color: var(--text-muted);">${ann}</td>
            <td style="color: var(--text-muted);">${post}</td>
        `;
        tbody.appendChild(tr);
    });
}

function initDevUI() {
    const dDate = localStorage.getItem('devDateOverride');
    const dTime = localStorage.getItem('devTimeOverride');
    const dDay = localStorage.getItem('devDayOverride');
    
    if(dDate) document.getElementById('dev-date').value = dDate;
    if(dTime) document.getElementById('dev-time').value = dTime;
    if(dDay) document.getElementById('dev-day').value = dDay;
}

function applyDevSettings() {
    const dateVal = document.getElementById('dev-date').value;
    const timeVal = document.getElementById('dev-time').value;
    const dayVal = document.getElementById('dev-day').value;

    if (dateVal) localStorage.setItem('devDateOverride', dateVal);
    else localStorage.removeItem('devDateOverride');

    if (timeVal) localStorage.setItem('devTimeOverride', timeVal);
    else localStorage.removeItem('devTimeOverride');

    if (dayVal) localStorage.setItem('devDayOverride', dayVal);
    else localStorage.removeItem('devDayOverride');

    showMessage('dev-message', 'Time Travel Active! UI is updated. System Date Changed.', 'success');
    checkAndApplyAutoNoAttendance();
    
    if (document.getElementById('admin-dashboard-view').classList.contains('active')) {
        renderDashboardSummary();
        renderLogs();
        renderSchedule();
        renderMainDashboard();
        renderDutyToday();
        if (document.getElementById('sec-history').classList.contains('active')) renderHistoryView();
    }
}

function resetDevSettings() {
    localStorage.removeItem('devDateOverride');
    localStorage.removeItem('devTimeOverride');
    localStorage.removeItem('devDayOverride');
    
    document.getElementById('dev-date').value = '';
    document.getElementById('dev-time').value = '';
    document.getElementById('dev-day').value = '';
    
    showMessage('dev-message', 'System reverted back to reality.', 'success');
    
    if (document.getElementById('admin-dashboard-view').classList.contains('active')) {
        renderDashboardSummary();
        renderLogs();
        renderSchedule();
        renderMainDashboard();
        renderDutyToday();
        if (document.getElementById('sec-history').classList.contains('active')) renderHistoryView();
    }
}

function renderMainDashboard() {
    try {
        const students = JSON.parse(localStorage.getItem('students')) || [];
        const logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
        const todayStr = getPHT().toLocaleDateString('en-US');
        const currentDay = getPHTDayString();

        document.getElementById('dash-total').textContent = students.length;

        const scheduledToday = students.filter(s => s.assignedDays && s.assignedDays.includes(currentDay));
        const totalScheduled = scheduledToday.length;

        let presentCount = 0;
        let lateCount = 0;

        scheduledToday.forEach(student => {
            const studentTodayLogs = logs.filter(l => l.id === student.id && l.date === todayStr);
            const timeInLog = studentTodayLogs.find(l => l.action.includes('In'));
            
            if (timeInLog) {
                presentCount++;
                if (timeInLog.action.includes('Late')) {
                    lateCount++;
                }
            }
        });

        const absentCount = totalScheduled - presentCount;
        const attendanceRate = totalScheduled > 0 ? Math.round((presentCount / totalScheduled) * 100) : 0;

        document.getElementById('dash-ratio').textContent = `${presentCount} / ${totalScheduled}`;
        document.getElementById('dash-rate').textContent = `${attendanceRate}%`;
        document.getElementById('dash-present').textContent = presentCount;
        document.getElementById('dash-absent').textContent = absentCount;
        document.getElementById('dash-late').textContent = lateCount;

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
                
                let pCount = logs.filter(l => l.date === dStr && l.action.includes('In')).length;
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

        const thirtyDaysAgo = new Date(getPHT());
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const deadStudentsList = document.getElementById('dash-dead-students');
        if (deadStudentsList) {
            deadStudentsList.innerHTML = '';
            let deadCount = 0;

            students.forEach(student => {
                const recentLog = logs.find(l => l.id === student.id && new Date(l.date) >= thirtyDaysAgo);
                if (!recentLog) {
                    deadCount++;
                    deadStudentsList.innerHTML += `<div style="padding: 10px; border-bottom: 1px solid #2d313c;">${student.name} <span style="color:var(--error); font-size: 10px; float:right;">INACTIVE</span></div>`;
                }
            });
            if (deadCount === 0) {
                deadStudentsList.innerHTML = '<p class="placeholder-text">No inactive students.</p>';
            }
        }

        let bestStudent = "None";
        let bestScore = -1;

        students.forEach(student => {
            const studentLogs = logs.filter(l => l.id === student.id);
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

            if (perfRate > bestScore) {
                bestScore = perfRate;
                bestStudent = `${student.name} (${Math.round(perfRate)}%)`;
            }
        });

        const bestPerfEl = document.getElementById('dash-best-perf');
        if (bestPerfEl) {
            bestPerfEl.textContent = bestStudent;
        }
    } catch (e) {
        console.error("Dashboard Render Error:", e);
    }
}

function renderDashboardSummary() {
    const students = JSON.parse(localStorage.getItem('students')) || [];
    const logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    const tbody = document.getElementById('summary-body');
    
    const searchInput = document.getElementById('search-attendance-global');
    const query = searchInput ? searchInput.value.toLowerCase() : '';
    
    if (!tbody) return;
    tbody.innerHTML = '';

    const todayStr = getPHT().toLocaleDateString('en-US');
    const currentDay = getPHTDayString();

    const scheduledToday = students.filter(student => student.assignedDays && student.assignedDays.includes(currentDay));

    const filteredStudents = scheduledToday.filter(student => 
        student.name.toLowerCase().includes(query) || 
        student.id.toLowerCase().includes(query)
    );

    filteredStudents.forEach(student => {
        const hasTimedOutToday = logs.some(l => l.id === student.id && l.date === todayStr && l.action.includes('Out'));
        const hasTimedInToday = logs.some(l => l.id === student.id && l.date === todayStr && l.action.includes('In'));
        
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

        const tr = document.createElement('tr');
        tr.style.backgroundColor = rowBg;
        tr.innerHTML = `
            <td><strong style="color: var(--text-main);">${student.name}</strong></td>
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
}

function viewPerformance(idNum) {
    const students = JSON.parse(localStorage.getItem('students')) || [];
    const logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    
    const student = students.find(s => s.id === idNum);
    if (!student) return;

    const studentLogs = logs.filter(l => l.id === idNum);

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

    document.getElementById('perf-student-name').textContent = student.name;
    document.getElementById('perf-total-present').textContent = totalPresent;
    document.getElementById('perf-on-time').textContent = onTimeIn;
    document.getElementById('perf-late-in').textContent = lateIn;
    document.getElementById('perf-out-time').textContent = onTimeOut;
    document.getElementById('perf-late-out').textContent = lateOut;
    
    const rateEl = document.getElementById('perf-rate');
    rateEl.textContent = `${perfRate}%`;
    
    if (perfRate >= 80) rateEl.style.color = 'var(--success)';
    else if (perfRate >= 50) rateEl.style.color = '#f59e0b';
    else rateEl.style.color = 'var(--error)';

    document.getElementById('performance-modal').style.display = 'flex';
}

function closePerformanceModal() {
    document.getElementById('performance-modal').style.display = 'none';
}

function cancelTimeOut() {
    pendingTimeOutStudent = null;
    pendingTimeOutAction = null;
    document.getElementById('timeout-modal').style.display = 'none';
}

function toggleOtherGC(val) {
    const otherInput = document.getElementById('gc-handle-other');
    if (val === 'Other') {
        otherInput.style.display = 'block';
    } else {
        otherInput.style.display = 'none';
        otherInput.value = ''; 
    }
}

function viewTodayShift(idNum, dateStr) {
    const logs = JSON.parse(localStorage.getItem('attendanceLogs')) || [];
    
    const dayLogs = logs.filter(l => l.id === idNum && l.date === dateStr);
    const timeInLog = dayLogs.find(l => l.action.includes('In'));
    const timeOutLog = dayLogs.find(l => l.action.includes('Out'));
    
    if (!timeOutLog) return; 
    
    document.getElementById('ts-name').textContent = timeOutLog.name;
    
    const inEl = document.getElementById('ts-time-in');
    if (timeInLog) {
        inEl.textContent = `${timeInLog.time} (${timeInLog.action.includes('Late') ? 'LATE' : 'ON TIME'})`;
        inEl.style.color = timeInLog.action.includes('Late') ? '#f59e0b' : 'var(--success)';
    } else {
        inEl.textContent = 'No Record';
        inEl.style.color = 'var(--error)';
    }

    const outEl = document.getElementById('ts-time-out');
    outEl.textContent = `${timeOutLog.time} (${timeOutLog.action.includes('Late') ? 'LATE' : 'ON TIME'})`;
    outEl.style.color = timeOutLog.action.includes('Late') ? '#f59e0b' : 'var(--success)';
    
    const details = timeOutLog.details || {};
    document.getElementById('ts-gc').textContent = details.gcHandle || 'Not Provided';
    document.getElementById('ts-announce').textContent = details.announcement || 'Not Provided';
    document.getElementById('ts-posted').textContent = details.whoPosted || 'Not Provided';
    
    document.getElementById('today-shift-modal').style.display = 'flex';
}

function closeTodayShiftModal() {
    document.getElementById('today-shift-modal').style.display = 'none';
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
    errorMsg.style.display = 'none';
    thumb.style.transition = 'none';
    fill.style.transition = 'none';
    pieceCanvas.style.transition = 'none';
    thumb.style.transform = `translateX(0px)`;
    fill.style.width = `0px`;
    pieceCanvas.style.transform = `translateX(0px)`;
    thumb.innerHTML = '➔';
    thumb.style.backgroundColor = '#1e2128';
    thumb.style.color = 'var(--accent)';
    fill.style.backgroundColor = 'rgba(var(--accent-rgb), 0.2)';
    trackText.style.display = 'block';

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
    pieceCtx.clearRect(0,0, pieceCanvas.width, pieceCanvas.height);

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
    thumb.style.transition = 'none';
    fill.style.transition = 'none';
    pieceCanvas.style.transition = 'none';
    trackText.style.display = 'none';
}

function onDragMove(e) {
    if (!isDragging) return;
    e.preventDefault(); 
    
    const wrapper = document.getElementById('studentSliderWrapper');
    const thumb = document.getElementById('studentSliderThumb');
    const fill = document.getElementById('studentSliderFill');
    const pieceCanvas = document.getElementById('studentCaptchaPiece');

    let currentX = e.clientX || e.touches[0].clientX;
    let moveX = currentX - startX;
    const maxMove = wrapper.clientWidth - 42;
    
    if (moveX < 0) moveX = 0;
    if (moveX > maxMove) moveX = maxMove;

    thumb.style.transform = `translateX(${moveX}px)`;
    fill.style.width = `${moveX + 21}px`;
    pieceCanvas.style.transform = `translateX(${moveX}px)`;
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

    let currentX = e.clientX || (e.changedTouches ? e.changedTouches[0].clientX : startX);
    let moveX = currentX - startX;
    const maxMove = wrapper.clientWidth - 42;
    
    if (moveX < 0) moveX = 0;
    if (moveX > maxMove) moveX = maxMove;

    if (Math.abs(moveX - puzzleX) < 8) {
        isCaptchaSolved = true;
        thumb.innerHTML = '✔';
        thumb.style.backgroundColor = 'var(--success)';
        thumb.style.color = '#000';
        fill.style.backgroundColor = 'rgba(34, 197, 94, 0.3)';
        errorMsg.style.display = 'none';
        
        thumb.style.transform = `translateX(${puzzleX}px)`;
        pieceCanvas.style.transform = `translateX(${puzzleX}px)`;
        fill.style.width = `${puzzleX + 21}px`;
    } else {
        thumb.style.transition = 'transform 0.3s ease';
        fill.style.transition = 'width 0.3s ease';
        pieceCanvas.style.transition = 'transform 0.3s ease';
        
        thumb.style.transform = `translateX(0px)`;
        fill.style.width = `0px`;
        pieceCanvas.style.transform = `translateX(0px)`;
        
        errorMsg.style.display = 'block';
        trackText.style.display = 'block';
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
        const student = students.find(s => s.id === activeId);
        
        if (student) {
            const todayLogs = getTodayLogs(activeId);
            const hasTimeIn = todayLogs.some(l => l.action.includes('Time In'));
            const hasTimeOut = todayLogs.some(l => l.action.includes('Time Out'));
            
            if (hasTimeIn && !hasTimeOut) {
                idInput.value = activeId;
                idInput.disabled = true;
                btnIn.style.display = 'none';
                lockMsg.style.display = 'block';
                lockMsg.innerHTML = `🔒 Device locked to <strong>${student.name}</strong>.<br><span style="font-size: 0.75rem; color: var(--text-muted);">You must Time Out to free this device.</span>`;
                return; 
            }
        }
        localStorage.removeItem('activeDeviceStudent');
    }
    resetDeviceLockUI(idInput, btnIn, lockMsg);
}

function resetDeviceLockUI(idInput, btnIn, lockMsg) {
    idInput.value = '';
    idInput.disabled = false;
    btnIn.style.display = 'inline-block';
    lockMsg.style.display = 'none';
    lockMsg.textContent = '';
}

async function isIncognito() {
    return new Promise((resolve) => {
        const fs = window.RequestFileSystem || window.webkitRequestFileSystem;
        if (!fs) {
            if (navigator.storage && navigator.storage.estimate) {
                navigator.storage.estimate().then(estimate => resolve(estimate.quota < 120000000));
            } else {
                resolve(false);
            }
        } else {
            fs(window.TEMPORARY, 100, () => resolve(false), () => resolve(true));
        }
    });
}

function factoryReset() {
    const firstConfirm = confirm("⚠️ DANGER ⚠️\n\nThis will permanently delete ALL registered students, attendance logs, custom UI settings, and custom Admin accounts.\n\nAre you absolutely sure you want to do this?");
    
    if (firstConfirm) {
        const verificationText = prompt("To confirm Factory Reset, type exactly:\n\nRESET EVERYTHING");
        
        if (verificationText === "RESET EVERYTHING") {
            localStorage.clear();
            sessionStorage.clear();
            pushStudentsToCloud(); // Wipe cloud
            pushLogsToCloud(); // Wipe cloud
            alert("System wiped successfully. The page will now reload.");
            window.location.reload();
        } else if (verificationText !== null) {
            alert("Factory Reset canceled. The text did not match exactly.");
        }
    }
}
