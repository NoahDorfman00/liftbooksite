(function () {
    var DB_NAME = 'liftbook-heavy';
    var DB_VERSION = 1;
    var STORE_NAME = 'liftdata';
    var DATA_KEY = 'current';

    var FIREBASE_CONFIG = {
        apiKey: "AIzaSyDzF2iZACmgD9uwJRKipGbLgGqh0b9Bkx8",
        authDomain: "liftbook-695fc.firebaseapp.com",
        databaseURL: "https://liftbook-695fc-default-rtdb.firebaseio.com",
        projectId: "liftbook-695fc",
        storageBucket: "liftbook-695fc.firebasestorage.app",
        messagingSenderId: "186341079070",
        appId: "1:186341079070:web:0f0a565f038132a8f5d60f"
    };

    var SESSION_TTL = 5 * 60 * 1000;
    var RTC_CONFIG = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

    // DOM elements
    var savedSection = document.getElementById('saved-section');
    var savedDisplay = document.getElementById('saved-display');
    var savedMeta = document.getElementById('saved-meta');
    var newTransferBtn = document.getElementById('new-transfer-btn');
    var clearDataBtn = document.getElementById('clear-data-btn');
    var qrSection = document.getElementById('qr-section');
    var qrContainer = document.getElementById('qr-code');
    var statusText = document.getElementById('status-text');
    var dataSection = document.getElementById('data-section');
    var dataDisplay = document.getElementById('data-display');
    var errorSection = document.getElementById('error-section');
    var errorText = document.getElementById('error-text');
    var fallbackSection = document.getElementById('fallback-section');

    // State
    var sessionId = null;
    var sessionRef = null;
    var peerConnection = null;
    var dataBuffer = '';
    var cleanedUp = false;

    // --- IndexedDB helpers ---

    function openDB() {
        return new Promise(function (resolve, reject) {
            var request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = function (e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
            request.onsuccess = function (e) { resolve(e.target.result); };
            request.onerror = function (e) { reject(e.target.error); };
        });
    }

    function saveData(parsed) {
        return openDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(STORE_NAME, 'readwrite');
                var store = tx.objectStore(STORE_NAME);
                store.put({ data: parsed, savedAt: new Date().toISOString() }, DATA_KEY);
                tx.oncomplete = function () { resolve(); };
                tx.onerror = function (e) { reject(e.target.error); };
            });
        });
    }

    function loadData() {
        return openDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(STORE_NAME, 'readonly');
                var store = tx.objectStore(STORE_NAME);
                var request = store.get(DATA_KEY);
                request.onsuccess = function () { resolve(request.result || null); };
                request.onerror = function (e) { reject(e.target.error); };
            });
        });
    }

    function clearStoredData() {
        return openDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(STORE_NAME, 'readwrite');
                var store = tx.objectStore(STORE_NAME);
                store.delete(DATA_KEY);
                tx.oncomplete = function () { resolve(); };
                tx.onerror = function (e) { reject(e.target.error); };
            });
        });
    }

    // --- UI helpers ---

    function hideAll() {
        savedSection.style.display = 'none';
        qrSection.style.display = 'none';
        dataSection.style.display = 'none';
        errorSection.style.display = 'none';
        fallbackSection.style.display = 'none';
    }

    function showSaved(record) {
        hideAll();
        var introText = document.getElementById('intro-text');
        if (introText) introText.style.display = 'none';
        savedSection.style.display = 'block';
        var data = record.data;
        var date = new Date(record.savedAt);
        var workoutCount = data.workouts ? data.workouts.length : 0;
        savedMeta.textContent = workoutCount + ' workout' + (workoutCount !== 1 ? 's' : '') +
            ' \u00B7 last synced ' + date.toLocaleDateString() + ' at ' + date.toLocaleTimeString();
        if (window.HeavyChart) {
            window.HeavyChart.load(data);
        }
    }

    function showQR() {
        hideAll();
        var introText = document.getElementById('intro-text');
        if (introText) introText.style.display = '';
        qrSection.style.display = 'block';
    }

    function showConnected() {
        hideAll();
        dataSection.style.display = 'block';
    }

    function showError(msg) {
        hideAll();
        errorSection.style.display = 'block';
        errorText.textContent = msg;
    }

    // --- Check for session param (mobile fallback) ---

    var params = new URLSearchParams(window.location.search);
    var incomingSession = params.get('session');

    if (incomingSession) {
        hideAll();
        fallbackSection.style.display = 'block';
        var openBtn = document.getElementById('open-in-app-btn');
        if (openBtn) {
            openBtn.href = 'liftbook://heavy?session=' + incomingSession;
        }
        return;
    }

    // --- Button handlers ---

    newTransferBtn.addEventListener('click', function () {
        startTransferFlow();
    });

    var downloadDataBtn = document.getElementById('download-data-btn');
    downloadDataBtn.addEventListener('click', function () {
        loadData().then(function (record) {
            if (!record || !record.data) return;
            var json = JSON.stringify(record.data, null, 2);
            var blob = new Blob([json], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'liftbook-data.json';
            a.click();
            URL.revokeObjectURL(url);
        });
    });

    clearDataBtn.addEventListener('click', function () {
        if (!confirm('Clear all saved lift data from this browser?')) return;
        clearStoredData().then(function () {
            startTransferFlow();
        }).catch(function () {
            startTransferFlow();
        });
    });

    // --- WebRTC / Firebase ---

    function cleanup() {
        if (cleanedUp) return;
        cleanedUp = true;
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        if (sessionRef) {
            sessionRef.remove().catch(function () {});
            sessionRef = null;
        }
    }

    function startTTLTimer() {
        setTimeout(function () {
            if (!cleanedUp && (!peerConnection || peerConnection.connectionState !== 'connected')) {
                showError('Session expired. Please refresh to start a new session.');
                cleanup();
            }
        }, SESSION_TTL);
    }

    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0;
            var v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function startTransferFlow() {
        cleanedUp = false;
        dataBuffer = '';

        if (typeof firebase === 'undefined') {
            showError('Firebase SDK failed to load. Please refresh the page.');
            return;
        }
        if (!firebase.apps.length) {
            firebase.initializeApp(FIREBASE_CONFIG);
        }
        var database = firebase.database();

        sessionId = generateUUID();
        sessionRef = database.ref('heavy-sessions/' + sessionId);

        showQR();
        statusText.textContent = 'Generating session...';
        qrContainer.innerHTML = '';

        sessionRef.set({
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            status: 'waiting'
        }).then(function () {
            renderQR();
            statusText.textContent = 'Scan this QR code with your iPhone';
            startTTLTimer();
            listenForOffer();
        }).catch(function (err) {
            showError('Failed to create session: ' + err.message);
        });
    }

    function renderQR() {
        var host = window.location.hostname;
        var base = (host === 'localhost' || host === '127.0.0.1' || /^192\.168|^10\.|^172\.(1[6-9]|2\d|3[01])/.test(host))
            ? window.location.protocol + '//' + window.location.host
            : 'https://liftbookapp.com';
        var url = base + '/heavy.html?session=' + sessionId;
        new QRCode(qrContainer, {
            text: url,
            width: 240,
            height: 240,
            colorDark: '#111111',
            colorLight: '#f9faf9',
            correctLevel: QRCode.CorrectLevel.M
        });
    }

    function listenForOffer() {
        var offerRef = sessionRef.child('offer');
        offerRef.on('value', function (snapshot) {
            var offer = snapshot.val();
            if (!offer) return;
            offerRef.off();
            statusText.textContent = 'Connecting...';
            handleOffer(offer);
        });
    }

    function handleOffer(offer) {
        peerConnection = new RTCPeerConnection(RTC_CONFIG);

        sessionRef.child('iceCandidates/app').on('child_added', function (snapshot) {
            var candidate = snapshot.val();
            if (candidate) {
                peerConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch(function (err) {
                    console.error('Error adding ICE candidate:', err);
                });
            }
        });

        peerConnection.onicecandidate = function (event) {
            if (event.candidate) {
                sessionRef.child('iceCandidates/web').push({
                    candidate: event.candidate.candidate,
                    sdpMid: event.candidate.sdpMid,
                    sdpMLineIndex: event.candidate.sdpMLineIndex
                });
            }
        };

        peerConnection.ondatachannel = function (event) {
            var channel = event.channel;

            channel.onopen = function () {
                showConnected();
                sessionRef.update({ status: 'connected' });
            };

            channel.onmessage = function (event) {
                handleDataMessage(event.data);
            };

            channel.onclose = function () {
                if (!cleanedUp) {
                    statusText.textContent = 'Connection closed.';
                }
            };
        };

        peerConnection.onconnectionstatechange = function () {
            if (peerConnection.connectionState === 'failed') {
                showError('Connection failed. Please refresh and try again.');
                cleanup();
            }
        };

        peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
            .then(function () {
                return peerConnection.createAnswer();
            })
            .then(function (answer) {
                return peerConnection.setLocalDescription(answer);
            })
            .then(function () {
                return sessionRef.child('answer').set({
                    type: peerConnection.localDescription.type,
                    sdp: peerConnection.localDescription.sdp
                });
            })
            .catch(function (err) {
                showError('WebRTC error: ' + err.message);
                cleanup();
            });
    }

    function handleDataMessage(data) {
        if (typeof data !== 'string') {
            try {
                data = new TextDecoder().decode(data);
            } catch (e) {
                return;
            }
        }

        if (data === '__END__') {
            if (dataBuffer.length > 0) {
                finishTransfer(dataBuffer);
            }
            dataBuffer = '';
            return;
        }

        if (data.endsWith('\n__END__')) {
            dataBuffer += data.slice(0, -7);
            finishTransfer(dataBuffer);
            dataBuffer = '';
            return;
        }

        dataBuffer += data;

        try {
            JSON.parse(dataBuffer);
            finishTransfer(dataBuffer);
            dataBuffer = '';
        } catch (e) {
            // keep buffering
        }
    }

    function finishTransfer(raw) {
        var parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (e) {
            dataDisplay.textContent = raw;
            return;
        }

        // Display immediately
        dataDisplay.textContent = JSON.stringify(parsed, null, 2);

        // Save to IndexedDB then show saved view
        var record = { data: parsed, savedAt: new Date().toISOString() };
        saveData(parsed).then(function () {
            showSaved(record);
            cleanup();
        }).catch(function (err) {
            console.error('[Heavy] Failed to save to IndexedDB:', err);
            showSaved(record);
            cleanup();
        });
    }

    // Cleanup on page unload
    window.addEventListener('beforeunload', cleanup);

    // --- Boot: check IndexedDB for existing data ---

    loadData().then(function (record) {
        if (record && record.data) {
            showSaved(record);
        } else {
            startTransferFlow();
        }
    }).catch(function () {
        startTransferFlow();
    });
})();
