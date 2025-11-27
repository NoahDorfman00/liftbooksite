// Firebase Configuration
// TODO: Replace these with your actual configuration values
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDzF2iZACmgD9uwJRKipGbLgGqh0b9Bkx8",
    authDomain: "liftbook-695fc.firebaseapp.com",
    databaseURL: "https://liftbook-695fc-default-rtdb.firebaseio.com",
    projectId: "liftbook-695fc",
    storageBucket: "liftbook-695fc.firebasestorage.app",
    messagingSenderId: "186341079070",
    appId: "1:186341079070:web:0f0a565f038132a8f5d60f"
};

// Admin email - only this email can access the admin panel
const ADMIN_EMAIL = "n.dorfman00@gmail.com"; // TODO: Replace with your email

// Initialize Firebase
let auth = null;
let database = null;
if (typeof firebase !== 'undefined') {
    firebase.initializeApp(FIREBASE_CONFIG);
    auth = firebase.auth();
    database = firebase.database();
}

(function () {
    const loginSection = document.getElementById('login-section');
    const adminSection = document.getElementById('admin-section');
    const googleSigninBtn = document.getElementById('google-signin-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const messagesContainer = document.getElementById('messages-container');
    const refreshBtn = document.getElementById('refresh-btn');
    const showAttendedCheckbox = document.getElementById('show-attended');
    const filterTypeSelect = document.getElementById('filter-type');
    const loginMessage = document.getElementById('login-message');

    console.log('Admin script initialized');
    console.log('Google signin button found:', !!googleSigninBtn);
    console.log('Firebase auth initialized:', !!auth);

    let messagesRef = null;
    let messagesListener = null;

    // Check authentication state
    if (auth) {
        auth.onAuthStateChanged((user) => {
            if (user) {
                // Check if user's email matches admin email
                const userEmail = user.email || (user.providerData && user.providerData[0] && user.providerData[0].email);
                if (userEmail === ADMIN_EMAIL) {
                    // User is authenticated and is the admin
                    showAdminSection();
                    loadMessages();
                } else {
                    // User is authenticated but not the admin
                    auth.signOut();
                    showLoginSection();
                    if (messagesListener) {
                        messagesRef.off('value', messagesListener);
                        messagesListener = null;
                    }
                }
            } else {
                // User is not authenticated
                showLoginSection();
                if (messagesListener) {
                    messagesRef.off('value', messagesListener);
                    messagesListener = null;
                }
            }
        });
    } else {
        console.warn('Firebase Auth not initialized. Please check your configuration.');
    }

    function showLoginSection() {
        loginSection.style.display = 'block';
        adminSection.style.display = 'none';
        logoutBtn.style.display = 'none';
    }

    function showAdminSection() {
        loginSection.style.display = 'none';
        adminSection.style.display = 'block';
        logoutBtn.style.display = 'block';
    }

    // Google Sign-In handler
    if (googleSigninBtn) {
        googleSigninBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (!auth) {
                loginMessage.textContent = 'Firebase Auth not initialized. Please check your configuration.';
                loginMessage.className = 'form-message error';
                return;
            }

            loginMessage.textContent = '';
            loginMessage.className = 'form-message';
            googleSigninBtn.disabled = true;
            const originalHTML = googleSigninBtn.innerHTML;
            googleSigninBtn.innerHTML = '<span>Signing in...</span>';

            try {
                const provider = new firebase.auth.GoogleAuthProvider();
                const userCredential = await auth.signInWithPopup(provider);

                // Verify it's the admin email
                const userEmail = userCredential.user.email;
                if (userEmail !== ADMIN_EMAIL) {
                    await auth.signOut();
                    throw new Error('Access denied. This email is not authorized.');
                }

                // Success - onAuthStateChanged will handle showing admin section
            } catch (error) {
                console.error('Google Sign-In error:', error);
                loginMessage.textContent = error.message || 'Google Sign-In failed. Please try again.';
                loginMessage.className = 'form-message error';
            } finally {
                googleSigninBtn.disabled = false;
                googleSigninBtn.innerHTML = originalHTML;
            }
        });
    }

    // Logout handler
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                if (!auth) {
                    throw new Error('Firebase Auth not initialized.');
                }
                await auth.signOut();
                // onAuthStateChanged will handle showing login section
            } catch (error) {
                console.error('Logout error:', error);
            }
        });
    }

    // Load messages from Firebase
    function loadMessages() {
        if (!database) {
            messagesContainer.innerHTML = '<p class="error">Firebase Database not initialized. Please check your configuration.</p>';
            return;
        }

        messagesContainer.innerHTML = '<p>Loading messages...</p>';

        messagesRef = database.ref('contactMessages');

        messagesListener = messagesRef.on('value', (snapshot) => {
            const messages = snapshot.val();
            const showAttended = showAttendedCheckbox.checked;
            const filterType = filterTypeSelect ? filterTypeSelect.value : 'all';

            if (!messages) {
                messagesContainer.innerHTML = '<p>No messages yet.</p>';
                return;
            }

            // Convert to array and sort by timestamp (newest first)
            let messagesArray = Object.entries(messages)
                .map(([id, data]) => ({
                    id,
                    ...data
                }))
                .filter(msg => showAttended || !msg.attended)
                .filter(msg => filterType === 'all' || msg.subject === filterType)
                .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            if (messagesArray.length === 0) {
                messagesContainer.innerHTML = '<p>No messages to display.</p>';
                return;
            }

            // Render messages
            messagesContainer.innerHTML = messagesArray.map(msg => {
                const date = new Date(msg.timestamp);
                const dateStr = date.toLocaleString();
                const subjectLabels = {
                    bug: 'Bug Report',
                    feature: 'Feature Request',
                    question: 'Question',
                    other: 'Other'
                };
                const attendedClass = msg.attended ? 'attended' : '';
                const attendedBadge = msg.attended ? '<span class="attended-badge">Attended</span>' : '';

                return `
                    <div class="message-card ${attendedClass}" data-id="${msg.id}">
                        <div class="message-header">
                            <div>
                                <strong>${escapeHtml(msg.name)}</strong> &lt;${escapeHtml(msg.email)}&gt;
                                <span class="message-subject">${subjectLabels[msg.subject] || msg.subject}</span>
                                ${attendedBadge}
                            </div>
                            <div class="message-date">${dateStr}</div>
                        </div>
                        <div class="message-body">
                            ${escapeHtml(msg.message).replace(/\n/g, '<br>')}
                        </div>
                        <div class="message-actions">
                            ${msg.attended ? `
                                <button class="unmark-attended-btn" data-id="${msg.id}">Mark as Unattended</button>
                            ` : `
                                <button class="mark-attended-btn" data-id="${msg.id}">Mark as Attended</button>
                            `}
                            <button class="delete-message-btn" data-id="${msg.id}">Delete</button>
                        </div>
                    </div>
                `;
            }).join('');

            // Attach event listeners to mark as attended buttons
            document.querySelectorAll('.mark-attended-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const messageId = e.target.getAttribute('data-id');
                    try {
                        if (!database) {
                            throw new Error('Firebase Database not initialized.');
                        }
                        await database.ref(`contactMessages/${messageId}/attended`).set(true);
                        // The listener will automatically update the UI
                    } catch (error) {
                        console.error('Error marking as attended:', error);
                        alert('Error updating message. Please try again.');
                    }
                });
            });

            // Attach event listeners to unmark as attended buttons
            document.querySelectorAll('.unmark-attended-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const messageId = e.target.getAttribute('data-id');
                    try {
                        if (!database) {
                            throw new Error('Firebase Database not initialized.');
                        }
                        await database.ref(`contactMessages/${messageId}/attended`).set(false);
                        // The listener will automatically update the UI
                    } catch (error) {
                        console.error('Error unmarking as attended:', error);
                        alert('Error updating message. Please try again.');
                    }
                });
            });

            // Attach event listeners to delete buttons
            document.querySelectorAll('.delete-message-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const messageId = e.target.getAttribute('data-id');
                    if (!confirm('Are you sure you want to delete this message? This action cannot be undone.')) {
                        return;
                    }
                    try {
                        if (!database) {
                            throw new Error('Firebase Database not initialized.');
                        }
                        await database.ref(`contactMessages/${messageId}`).remove();
                        // The listener will automatically update the UI
                    } catch (error) {
                        console.error('Error deleting message:', error);
                        alert('Error deleting message. Please try again.');
                    }
                });
            });
        }, (error) => {
            console.error('Error loading messages:', error);
            messagesContainer.innerHTML = '<p class="error">Error loading messages. Please refresh.</p>';
        });
    }

    // Refresh button
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            if (messagesListener) {
                messagesRef.off('value', messagesListener);
            }
            loadMessages();
        });
    }

    // Filter checkbox
    if (showAttendedCheckbox) {
        showAttendedCheckbox.addEventListener('change', () => {
            // Reload messages with new filter
            if (messagesListener) {
                messagesRef.off('value', messagesListener);
            }
            loadMessages();
        });
    }

    // Filter by type select
    if (filterTypeSelect) {
        filterTypeSelect.addEventListener('change', () => {
            // Reload messages with new filter
            if (messagesListener) {
                messagesRef.off('value', messagesListener);
            }
            loadMessages();
        });
    }

    // Helper function to escape HTML
    // Helper function to escape HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
})();

