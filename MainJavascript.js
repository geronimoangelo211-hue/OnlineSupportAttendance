// 1. YOUR LIVE RENDER BACKEND URL
const API_BASE_URL = "https://support-backend-ldos.onrender.com/api";

// ==========================================
// ADMIN AUTHENTICATION & MANAGEMENT
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
            console.error("Server did not return JSON:", textResponse);
            throw new Error("Server returned an HTML error page.");
        }

        if (data.success) {
            // Hide login, show dashboard
            document.getElementById('login-section').style.display = 'none';
            document.getElementById('admin-dashboard').style.display = 'block';
            
            // Load cloud data
            fetchAdminAccounts();
            renderStudents();
            // renderAttendanceLogs(); // Un-comment if you have this function
        } else {
            errorMsg.textContent = data.message || "Invalid credentials.";
            errorMsg.style.display = 'block';
        }
    } catch (error) {
        console.error("Login error:", error);
        errorMsg.textContent = "Server error. Please try again.";
        errorMsg.style.display = 'block';
    }
}

async function fetchAdminAccounts() {
    const list = document.getElementById('admin-accounts-list');
    if (!list) return;
    
    list.innerHTML = '<li style="padding: 10px; text-align: center;">Loading accounts...</li>';

    try {
        const response = await fetch(`${API_BASE_URL}/accounts`, {
            method: 'GET',
            headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
            cache: 'no-store'
        });
        const data = await response.json();
        
        list.innerHTML = '';
        data.forEach(user => {
            const li = document.createElement('li');
            li.style.padding = '10px 15px';
            li.style.borderBottom = '1px solid #2d313c';
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';
            
            let delBtn = '';
            if(user !== 'MainHeadAcc') { 
                delBtn = `<button onclick="deleteAdminAccount('${user}')" style="background: transparent; color: var(--error); border: 1px solid var(--error); padding: 4px 8px; font-size: 10px; cursor: pointer;">DELETE</button>`;
            } else {
                delBtn = `<span style="font-size: 10px; color: var(--text-muted);">DEFAULT ADMIN</span>`;
            }

            li.innerHTML = `<span style="color: var(--text-main); font-weight: bold;">${user}</span> ${delBtn}`;
            list.appendChild(li);
        });
    } catch (err) {
        console.error("Error fetching accounts", err);
        list.innerHTML = `<li style="color: var(--error); padding: 10px; text-align: center;">Unable to load accounts.</li>`;
    }
}

async function registerNewAdmin(event) {
    event.preventDefault();
    const newUsername = document.getElementById('new-admin-username').value;
    const newPassword = document.getElementById('new-admin-password').value;

    try {
        const response = await fetch(`${API_BASE_URL}/add-account`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: newUsername, password: newPassword })
        });
        const data = await response.json();
        
        if (data.success) {
            alert("New admin account created globally!");
            document.getElementById('new-admin-username').value = '';
            document.getElementById('new-admin-password').value = '';
            fetchAdminAccounts();
        } else {
            alert(data.message || "Failed to create account.");
        }
    } catch (err) {
        console.error("Error adding account:", err);
        alert("Server error while creating account.");
    }
}

async function deleteAdminAccount(username) {
    if (!confirm(`Are you sure you want to delete ${username}?`)) return;

    try {
        const response = await fetch(`${API_BASE_URL}/delete-account/${username}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        
        if (data.success) {
            fetchAdminAccounts();
        } else {
            alert(data.message || "Failed to delete account.");
        }
    } catch (err) {
        console.error("Error deleting account:", err);
        alert("Server error while deleting account.");
    }
}

// ==========================================
// STUDENT MANAGEMENT (CLOUD CONNECTED)
// ==========================================

async function registerNewStudent(event) {
    event.preventDefault();
    const idInput = document.getElementById('new-student-id').value;
    const nameInput = document.getElementById('new-student-name').value;
    const gcInput = document.getElementById('new-student-gc').value;

    const newStudent = { id: idInput, name: nameInput, gcHandle: gcInput };

    try {
        const response = await fetch(`${API_BASE_URL}/students`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newStudent)
        });

        const data = await response.json();
        if(data.success) {
            alert("Student registered to the cloud database!");
            document.getElementById('new-student-id').value = '';
            document.getElementById('new-student-name').value = '';
            document.getElementById('new-student-gc').value = '';
            renderStudents(); 
        }
    } catch (error) {
        console.error("Error saving student:", error);
        alert("Failed to save to the server.");
    }
}

async function renderStudents() {
    const list = document.getElementById('registered-students-list');
    if (!list) return;
    
    list.innerHTML = '<li style="padding: 10px; text-align: center;">Loading students from server...</li>';

    try {
        const response = await fetch(`${API_BASE_URL}/students`);
        const students = await response.json();
        
        const searchInput = document.getElementById('search-student');
        const query = searchInput ? searchInput.value.toLowerCase() : '';
        
        list.innerHTML = '';
        
        // Filter by search query
        let filteredStudents = students.filter(student => 
            (student.name && student.name.toLowerCase().includes(query)) || 
            (student.id && student.id.toLowerCase().includes(query))
        );

        // Alphabetical sort
        filteredStudents.sort((a, b) => a.name.localeCompare(b.name));
        
        filteredStudents.forEach(student => {
            const li = document.createElement('li');
            const safeId = student.id.replace(/'/g, "\\'"); 
            let gcTag = student.gcHandle ? `<span class="gc-tag">${student.gcHandle}</span>` : '';

            li.innerHTML = `
                <div style="display: flex; flex-direction: column;">
                    <div>
                        <span style="font-weight: bold; color: var(--text-main);">${student.name}</span>
                        ${gcTag}
                    </div>
                    <span style="font-size: 0.8rem; color: var(--text-muted);">ID: ${student.id}</span>
                </div>
                <button onclick="viewPerformance('${safeId}')" style="background: rgba(var(--accent-rgb), 0.1); color: var(--accent); padding: 6px 15px; border-radius: 4px; font-size: 11px; border: 1px solid var(--accent); cursor: pointer; white-space: nowrap;">
                    VIEW PERFORMANCE
                </button>
            `;
            list.appendChild(li);
        });
    } catch (error) {
        console.error("Error fetching students:", error);
        list.innerHTML = '<li style="color:red; padding: 10px; text-align: center;">Failed to load students.</li>';
    }
}

function searchStudents() {
    // Re-trigger the render function to filter the live data
    renderStudents();
}

// ==========================================
// DEVELOPER TOOLS & SECRETS
// ==========================================

let devClickCount = 0;
function handleSettingsClick() {
    devClickCount++;
    if (devClickCount >= 20) {
        const devPanel = document.getElementById('dev-testing-tools');
        if (devPanel) {
            devPanel.style.display = 'block';
            devClickCount = 0; // Reset
            alert("Developer Tools Unlocked!");
        }
    }
}

function factoryReset() {
    const confirmation = prompt("WARNING: This will wipe local device data. Type 'RESET EVERYTHING' to confirm:");
    if (confirmation === 'RESET EVERYTHING') {
        localStorage.clear();
        sessionStorage.clear();
        alert("Local Data wiped. Note: To wipe Cloud data, you must restart the Render server.");
        window.location.reload();
    } else {
        alert("Reset cancelled.");
    }
}

function clearAllLogs() {
    if (confirm("Clear all local attendance logs?")) {
        localStorage.removeItem('attendanceLogs');
        alert("Logs cleared!");
        // If you have a render function for logs, call it here to update the UI
        // renderAttendanceLogs();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Attach 20-click secret to the Settings button/tab (ensure the ID matches your HTML)
    const settingsTab = document.getElementById('settings-tab'); 
    if (settingsTab) {
        settingsTab.addEventListener('click', handleSettingsClick);
    }
});
