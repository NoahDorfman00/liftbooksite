// Firebase and EmailJS Configuration
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

const EMAILJS_CONFIG = {
    serviceId: "service_ce9wlr6",
    templateId: "template_1x0zygs",
    publicKey: "WK1jfxvbEvUnYrw7R"
};

// Initialize Firebase
let database = null;
if (typeof firebase !== 'undefined') {
    firebase.initializeApp(FIREBASE_CONFIG);
    database = firebase.database();
}

// Initialize EmailJS
if (typeof emailjs !== 'undefined') {
    emailjs.init(EMAILJS_CONFIG.publicKey);
}

(function () {
    const form = document.getElementById('contact-form');
    const submitBtn = document.getElementById('submit-btn');
    const messageDiv = document.getElementById('form-message');

    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('name').value.trim();
        const email = document.getElementById('email').value.trim();
        const subject = document.getElementById('subject').value;
        const message = document.getElementById('message').value.trim();

        // Disable submit button
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';
        messageDiv.textContent = '';
        messageDiv.className = 'form-message';

        try {
            // Create message object
            const messageData = {
                name,
                email,
                subject,
                message,
                timestamp: firebase.database.ServerValue.TIMESTAMP,
                attended: false
            };

            // Save to Firebase Realtime Database
            if (!database) {
                throw new Error('Firebase not initialized. Please check your configuration.');
            }
            const messagesRef = database.ref('contactMessages');
            const newMessageRef = messagesRef.push();
            await newMessageRef.set(messageData);
            const messageId = newMessageRef.key;

            // Send email via EmailJS
            try {
                // Format subject type labels
                const subjectLabels = {
                    bug: 'Bug Report',
                    feature: 'Feature Request',
                    question: 'Question',
                    other: 'Other'
                };
                const subjectLabel = subjectLabels[subject] || subject;

                // Format email subject
                const emailSubject = `liftbook Contact: ${subjectLabel}`;

                // Format email message with all information
                const emailMessage = `You received a new contact form submission from liftbook.

Name: ${name}
Email: ${email}
Type: ${subjectLabel}
Message ID: ${messageId}

Message:
${message}

View and manage this message in the admin panel:
https://liftbookapp.com/admin`;

                await emailjs.send(
                    EMAILJS_CONFIG.serviceId,
                    EMAILJS_CONFIG.templateId,
                    {
                        subject: emailSubject,
                        message: emailMessage,
                        to_email: 'n.dorfman00@gmail.com'
                    }
                );
            } catch (emailError) {
                console.error('EmailJS error:', emailError);
                // Continue even if email fails - message is saved in database
            }

            // Success
            messageDiv.textContent = 'Thank you! Your message has been sent successfully.';
            messageDiv.className = 'form-message success';
            form.reset();

        } catch (error) {
            console.error('Error submitting form:', error);
            messageDiv.textContent = 'Sorry, there was an error sending your message. Please try again later.';
            messageDiv.className = 'form-message error';
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Send Message';
        }
    });
})();

