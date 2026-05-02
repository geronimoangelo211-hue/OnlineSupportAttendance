const API_BASE_URL = "https://support-backend-ldos.onrender.com/api";

document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (!token) {
        showError("Invalid Link. Please request a new link from the Support Head.");
        return;
    }

    try {
        const res = await fetch(`${API_BASE_URL}/register/validate?token=${token}`);
        const data = await res.json();
        
        if (!data.valid) {
            showError("This registration link has expired or is invalid.");
        } else {
            document.getElementById('loading-screen').style.display = 'none';
            document.getElementById('register-form-container').style.display = 'block';
        }
    } catch (err) {
        showError("Cannot connect to the server. Please try again later.");
    }
});

function showError(msg) {
    document.getElementById('loading-screen').innerHTML = `<h3 style="color: #ef4444;">❌ ${msg}</h3>`;
}

function toggleOtherGC(val) {
    document.getElementById('reg-gc-other').style.display = val === 'Other' ? 'block' : 'none';
}

async function submitRegistration(event) {
    event.preventDefault();
    
    const name = document.getElementById('reg-name').value.trim();
    const idNum = document.getElementById('reg-id').value.trim();
    let gcHandle = document.getElementById('reg-gc').value;
    
    if (gcHandle === 'Other') gcHandle = document.getElementById('reg-gc-other').value.trim();

    const days = [];
    document.querySelectorAll('input[name="schedule"]:checked').forEach(cb => days.push(cb.value));

    if (!gcHandle || days.length === 0) {
        alert("Please select a Group Chat Handle and at least one schedule day.");
        return;
    }

    try {
        // 1. Verify ID doesn't already exist
        const getRes = await fetch(`${API_BASE_URL}/students`);
        const students = await getRes.json();
        if (students.some(s => s.id === idNum)) {
            alert("This Student ID is already registered!");
            return;
        }

        // 2. Submit to database
        const newStudent = { id: idNum, name: name, gcHandle: gcHandle, assignedDays: days };
        await fetch(`${API_BASE_URL}/students`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newStudent)
        });

        // 3. Show Success Message
        document.getElementById('register-form-container').innerHTML = `
            <h2 style="color: #22c55e; margin-bottom: 20px;">✅ Registration Complete!</h2>
            <p style="color: #94a3b8; line-height: 1.5;">Your data and schedule have been successfully sent to the central database.</p>
            <p style="color: #94a3b8;">You may now close this window.</p>
        `;
    } catch(err) {
        alert("Server error while saving your registration.");
    }
}
