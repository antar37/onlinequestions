/**
 * Client-side JavaScript for Online Questions
 */

// Global variables (will be initialized from page data)
let ROOM_ID = null;
let CURRENT_LANG = 'en';
let TRANSLATIONS = {};
let USER_ID = null;
let IS_ADMIN = false;
let HAS_PASSWORD = false;
let ADMIN_PASSWORD = null; // Store password in memory for admin actions
let PRESENTATION_QUESTION_ID = null;
let pollInterval = null;
let isPolling = false;

// Initialize page data from JSON script tag
function initializePageData() {
    const pageDataElement = document.getElementById('page-data');
    if (pageDataElement) {
        try {
            const pageData = JSON.parse(pageDataElement.textContent);
            ROOM_ID = pageData.room_id || null;
            CURRENT_LANG = pageData.current_lang || 'en';
            TRANSLATIONS = pageData.translations || {};
            USER_ID = pageData.user_id || null;
            IS_ADMIN = pageData.is_admin || false;
            HAS_PASSWORD = pageData.has_password || false;
            PRESENTATION_QUESTION_ID = pageData.presentation_question_id || null;
        } catch (e) {
            console.error('Error parsing page data:', e);
        }
    }
}

// Translation function
function t(key, replacements = {}) {
    const keys = key.split('.');
    let value = TRANSLATIONS;

    for (const k of keys) {
        if (value && value[k]) {
            value = value[k];
        } else {
            return key;
        }
    }

    if (typeof value === 'string' && replacements) {
        for (const [placeholder, replacement] of Object.entries(replacements)) {
            value = value.replace('{' + placeholder + '}', replacement);
        }
    }

    return value;
}

// Change language function
function changeLanguage(lang) {
    // Check if we're on the create-room page (no room ID in URL)
    const url = new URL(window.location.href);
    if (!ROOM_ID && url.pathname.includes('index.php') && !url.searchParams.has('room')) {
        // On create-room page
        window.location.href = 'index.php?lang=' + lang;
    } else {
        // On room page
        url.searchParams.set('lang', lang);
        window.location.href = url.toString();
    }
}

// Copy room URL function
function copyRoomUrl() {
    if (!ROOM_ID) return;

    const url = window.location.href.split('?')[0] + '?room=' + ROOM_ID;

    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
            showNotification(t('notifications.room_url_copied'));
        }).catch(() => {
            // Fallback to older method
            fallbackCopyTextToClipboard(url);
        });
    } else {
        // Fallback for older browsers
        fallbackCopyTextToClipboard(url);
    }
}

// Fallback copy function
function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showNotification(t('notifications.room_url_copied'));
        } else {
            showNotification(t('notifications.failed_to_copy_url'), true);
        }
    } catch (err) {
        showNotification(t('notifications.failed_to_copy_url'), true);
    }

    document.body.removeChild(textArea);
}

function showNotification(message, isError = false) {
    const notification = document.createElement('div');
    notification.className = 'notification' + (isError ? ' error' : '');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        background: ${isError ? 'rgba(255, 68, 68, 0.1)' : 'rgba(0, 112, 243, 0.1)'};
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        color: ${isError ? '#ff4444' : '#0070f3'};
        padding: 1rem 1.5rem;
        border-radius: 10px;
        border: 1px solid ${isError ? 'rgba(255, 68, 68, 0.2)' : 'rgba(0, 112, 243, 0.2)'};
        font-size: 0.9375rem;
        font-weight: 500;
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function submitQuestion(event) {
    event.preventDefault();

    const questionText = document.getElementById('questionText').value.trim();
    if (!questionText) {
        const message = typeof t === 'function' ? t('notifications.please_enter_question') : 'Please enter a question';
        showNotification(message, true);
        return;
    }

    const submitButton = event.target.querySelector('button[type="submit"]');
    const originalText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = typeof t === 'function' ? t('common.submitting') : 'Submitting...';

    fetch('api.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            room_id: ROOM_ID,
            question: questionText
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Clear the form
            document.getElementById('questionText').value = '';

            // Close the modal
            const questionModal = document.getElementById('questionModal');
            if (questionModal && questionModal.classList.contains('active')) {
                questionModal.setAttribute('aria-hidden', 'true');
                questionModal.classList.remove('active');
                document.body.style.overflow = '';
            }

            // Add the new question to the display
            addQuestionToDisplay(data.question);

            // Show success notification
            const message = typeof t === 'function' ? t('notifications.question_submitted') : 'Question submitted successfully!';
            showNotification(message);

            // Scroll to the new question
            const questionsContainer = document.getElementById('questionsContainer');
            questionsContainer.scrollTop = 0;
        } else {
            const errorMsg = data.error || (typeof t === 'function' ? t('errors.failed_to_submit') : 'Failed to submit question');
            const message = typeof t === 'function' ? t('notifications.error_submit_question', {error: errorMsg}) : 'Error: ' + errorMsg;
            showNotification(message, true);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        const message = typeof t === 'function' ? t('notifications.failed_submit_question') : 'Failed to submit question. Please try again.';
        showNotification(message, true);
    })
    .finally(() => {
        submitButton.disabled = false;
        submitButton.textContent = originalText;
    });
}

function addQuestionToDisplay(question) {
    const questionsContainer = document.getElementById('questionsContainer');
    const questionElement = createQuestionElement(question);

    // Track this question ID to prevent duplicates from polling
    if (question.id) {
        lastQuestionIds.add(question.id);
    }

    // Insert at the beginning
    questionsContainer.insertBefore(questionElement, questionsContainer.firstChild);

    // Re-sort questions by votes
    sortQuestionsByVotes();

    // Animate in
    setTimeout(() => {
        questionElement.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
        questionElement.style.opacity = '1';
        questionElement.style.transform = 'translateY(0)';
    }, 10);
}

function createQuestionElement(question) {
    const questionElement = document.createElement('div');
    questionElement.className = 'question-item';
    if (question.answered) {
        questionElement.classList.add('answered');
    }
    questionElement.setAttribute('data-question-id', question.id);
    questionElement.setAttribute('data-timestamp', question.timestamp || 0);
    if (question.border_color) {
        questionElement.style.borderLeftColor = question.border_color;
    }
    questionElement.style.opacity = '0';
    questionElement.style.transform = 'translateY(10px)';

    const votes = question.votes || 0;
    const timestamp = new Date(question.timestamp * 1000).toLocaleString();
    const voteClass = votes > 0 ? 'votes-positive' : (votes < 0 ? 'votes-negative' : '');
    const upvoteLabel = typeof t === 'function' ? t('voting.upvote') : 'Upvote';
    const downvoteLabel = typeof t === 'function' ? t('voting.downvote') : 'Downvote';
    const userVote = question.user_vote || null;
    const upvoteClass = (userVote === 'upvote') ? 'voted' : '';
    const downvoteClass = (userVote === 'downvote') ? 'voted' : '';
    const answered = question.answered || false;
    const answeredBadge = answered ? `<span class="answered-badge">${t('admin.answered')}</span>` : '';

    let adminControls = '';
    if (IS_ADMIN) {
        const presentationIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path d="M8 5H6C4.89543 5 4 5.89543 4 7V19C4 20.1046 4.89543 21 6 21H18C19.1046 21 20 20.1046 20 19V7C20 5.89543 19.1046 5 18 5H16M8 5C8 3.89543 8.89543 3 10 3H14C15.1046 3 16 3.89543 16 5M8 5C8 6.10457 8.89543 7 10 7H14C15.1046 7 16 6.10457 16 5M12 12H16M12 16H16M8 12H8.01M8 16H8.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`;
        const deleteIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path d="M10 12V17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path><path d="M14 12V17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path><path d="M4 7H20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path><path d="M6 10V18C6 19.6569 7.34315 21 9 21H15C16.6569 21 18 19.6569 18 18V10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path><path d="M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5V7H9V5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></g></svg>`;
        const checkIcon = `<svg width="20" height="20" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path fill="currentColor" d="M469.402,35.492C334.09,110.664,197.114,324.5,197.114,324.5L73.509,184.176L0,254.336l178.732,222.172 l65.15-2.504C327.414,223.414,512,55.539,512,55.539L469.402,35.492z"></path></g></svg>`;
        const checkIconUnanswered = `<svg width="20" height="20" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path fill="currentColor" opacity="0.3" d="M469.402,35.492C334.09,110.664,197.114,324.5,197.114,324.5L73.509,184.176L0,254.336l178.732,222.172 l65.15-2.504C327.414,223.414,512,55.539,512,55.539L469.402,35.492z"></path></g></svg>`;

        const currentColor = question.border_color || '#0070f3';

        adminControls = `
            <div class="admin-controls">
                <button class="admin-btn presentation-btn" data-question-id="${question.id}" title="${t('admin.open_presentation_mode')}">${presentationIcon}</button>
                <button class="admin-btn delete-btn" data-question-id="${question.id}" title="${t('admin.delete_question')}">${deleteIcon}</button>
                <button class="admin-btn answered-btn" data-question-id="${question.id}" data-answered="${answered ? '1' : '0'}" title="${answered ? t('admin.mark_unanswered') : t('admin.mark_answered')}">${answered ? checkIcon : checkIconUnanswered}</button>
                <div class="color-picker-wrapper" data-question-id="${question.id}">
                    <button class="admin-btn color-toggle-btn" data-question-id="${question.id}" title="${t('admin.change_color')}" style="background: ${currentColor}; border-color: ${currentColor};">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                    <div class="color-dropdown" data-question-id="${question.id}">
                        <div class="color-options">
                            <button class="color-option ${currentColor === '#0070f3' ? 'active' : ''}" data-color="#0070f3" data-question-id="${question.id}" title="Blue" style="background: #0070f3;"></button>
                            <button class="color-option ${currentColor === '#00d9ff' ? 'active' : ''}" data-color="#00d9ff" data-question-id="${question.id}" title="Green" style="background: #00d9ff;"></button>
                            <button class="color-option ${currentColor === '#ff4444' ? 'active' : ''}" data-color="#ff4444" data-question-id="${question.id}" title="Red" style="background: #ff4444;"></button>
                            <button class="color-option ${currentColor === '#fbbf24' ? 'active' : ''}" data-color="#fbbf24" data-question-id="${question.id}" title="Yellow" style="background: #fbbf24;"></button>
                            <button class="color-option color-option-custom" data-question-id="${question.id}" title="${t('admin.custom_color')}">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            </button>
                        </div>
                        <input type="color" class="admin-color-picker" data-question-id="${question.id}" value="${currentColor}" style="display: none;">
                    </div>
                </div>
            </div>
        `;
    }

    questionElement.innerHTML = `
        <div class="question-voting">
            <button class="vote-btn vote-up ${upvoteClass}" data-question-id="${question.id}" data-vote-type="upvote" aria-label="${upvoteLabel}">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M10 15V5M5 10L10 5L15 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
            <span class="vote-count ${voteClass}">${votes}</span>
            <button class="vote-btn vote-down ${downvoteClass}" data-question-id="${question.id}" data-vote-type="downvote" aria-label="${downvoteLabel}">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M10 5V15M5 10L10 15L15 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
        </div>
        <div class="question-content">
            ${answeredBadge}
        <div class="question-text">${escapeHtml(question.text)}</div>
            <div class="question-meta">${escapeHtml(timestamp)}${adminControls}</div>
        </div>
    `;

    return questionElement;
}

function voteQuestion(questionId, voteType) {
    if (!ROOM_ID) {
        return;
    }

    const questionElement = document.querySelector(`[data-question-id="${questionId}"]`);
    if (!questionElement) {
        return;
    }

    // Disable buttons during vote
    const voteButtons = questionElement.querySelectorAll('.vote-btn');
    const upvoteBtn = questionElement.querySelector('.vote-up');
    const downvoteBtn = questionElement.querySelector('.vote-down');
    voteButtons.forEach(btn => btn.disabled = true);

    fetch('vote-api.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            room_id: ROOM_ID,
            question_id: questionId,
            vote_type: voteType
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success && data.question) {
            // Update the question element
            const votes = data.question.votes || 0;
            const voteCountElement = questionElement.querySelector('.vote-count');
            voteCountElement.textContent = votes;

            // Update vote count class
            voteCountElement.className = 'vote-count';
            if (votes > 0) {
                voteCountElement.classList.add('votes-positive');
            } else if (votes < 0) {
                voteCountElement.classList.add('votes-negative');
            }

            // Update button states based on user vote
            if (data.user_vote === 'upvote') {
                upvoteBtn.classList.add('voted');
                downvoteBtn.classList.remove('voted');
            } else if (data.user_vote === 'downvote') {
                downvoteBtn.classList.add('voted');
                upvoteBtn.classList.remove('voted');
            } else {
                // If previous vote was removed
                upvoteBtn.classList.remove('voted');
                downvoteBtn.classList.remove('voted');
            }

            // Re-sort questions
            sortQuestionsByVotes();
        } else {
            const errorMsg = data.error || (typeof t === 'function' ? t('errors.vote_failed') : 'Failed to vote');
            if (typeof showNotification === 'function') {
                showNotification(errorMsg, true);
            }
        }
    })
    .catch(error => {
        console.error('Error:', error);
        const errorMsg = typeof t === 'function' ? t('errors.vote_failed') : 'Failed to vote';
        if (typeof showNotification === 'function') {
            showNotification(errorMsg, true);
        }
    })
    .finally(() => {
        // Re-enable buttons
        voteButtons.forEach(btn => btn.disabled = false);
    });
}

// Admin action functions
function getAdminPassword() {
    // If the page rendered admin controls, the server has already authenticated
    // this browser via session or remember cookie. Do not prompt or persist the
    // raw password client-side for normal admin actions.
    if (IS_ADMIN) {
        return null;
    }

    if (ADMIN_PASSWORD) {
        return ADMIN_PASSWORD;
    }

    // Check sessionStorage only as a temporary fallback for an already-open tab.
    const stored = sessionStorage.getItem(`admin_password_${ROOM_ID}`);
    if (stored) {
        ADMIN_PASSWORD = stored;
        return stored;
    }

    // Prompt for password only if controls were somehow invoked without a valid
    // server-side admin session.
    const password = prompt(t('admin.password_placeholder'));
    if (!password) return null;

    ADMIN_PASSWORD = password;
    sessionStorage.setItem(`admin_password_${ROOM_ID}`, password);
    return password;
}

function clearCachedAdminPassword() {
    ADMIN_PASSWORD = null;
    if (ROOM_ID) {
        sessionStorage.removeItem(`admin_password_${ROOM_ID}`);
    }
}

function buildAdminPayload(action, extra = {}) {
    const payload = {
        room_id: ROOM_ID,
        action: action,
        ...extra
    };

    const password = getAdminPassword();
    if (password) {
        payload.password = password;
        payload.remember = true;
    }

    return payload;
}

function handleAdminAuthFailure(data) {
    const message = (data && data.error) ? data.error : t('admin.invalid_password');
    clearCachedAdminPassword();
    IS_ADMIN = false;
    showNotification(message, true);
}

function sendAdminAction(action, extra = {}) {
    const payload = buildAdminPayload(action, extra);

    return fetch('admin-api.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
    }).then(response => {
        return response.json().then(data => {
            if (response.status === 401) {
                handleAdminAuthFailure(data);
            } else if (response.ok && data.success && payload.password) {
                // A password fallback request succeeded. From now on this browser
                // should have a server session/remember cookie; stop retaining the
                // raw password in browser storage.
                IS_ADMIN = true;
                clearCachedAdminPassword();
            }
            return data;
        });
    });
}

function adminDeleteQuestion(questionId) {
    if (!ROOM_ID) return;

    sendAdminAction('delete_question', { question_id: questionId })
    .then(data => {
        if (data.success) {
            const questionElement = document.querySelector(`[data-question-id="${questionId}"]`);
            if (questionElement) {
                questionElement.remove();
            }
            showNotification(t('admin.delete_question') + ' - ' + t('notifications.question_submitted'));
        } else {
            if (data.error !== 'Admin authentication required') {
                showNotification(data.error || t('errors.vote_failed'), true);
            }
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showNotification(t('errors.vote_failed'), true);
    });
}

function adminMarkAnswered(questionId, answered) {
    if (!ROOM_ID) return;

    sendAdminAction('mark_answered', { question_id: questionId, answered: answered })
    .then(data => {
        if (data.success) {
            const questionElement = document.querySelector(`[data-question-id="${questionId}"]`);
            if (questionElement) {
                if (answered) {
                    questionElement.classList.add('answered');
                    const content = questionElement.querySelector('.question-content');
                    if (content && !content.querySelector('.answered-badge')) {
                        const badge = document.createElement('span');
                        badge.className = 'answered-badge';
                        badge.textContent = t('admin.answered');
                        content.insertBefore(badge, content.firstChild);
                    }
                    const btn = questionElement.querySelector('.answered-btn');
                    if (btn) {
                        btn.setAttribute('data-answered', '1');
                        btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path fill="currentColor" d="M469.402,35.492C334.09,110.664,197.114,324.5,197.114,324.5L73.509,184.176L0,254.336l178.732,222.172 l65.15-2.504C327.414,223.414,512,55.539,512,55.539L469.402,35.492z"></path></g></svg>`;
                        btn.title = t('admin.mark_unanswered');
                    }
                } else {
                    questionElement.classList.remove('answered');
                    const badge = questionElement.querySelector('.answered-badge');
                    if (badge) badge.remove();
                    const btn = questionElement.querySelector('.answered-btn');
                    if (btn) {
                        btn.setAttribute('data-answered', '0');
                        btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path fill="currentColor" opacity="0.3" d="M469.402,35.492C334.09,110.664,197.114,324.5,197.114,324.5L73.509,184.176L0,254.336l178.732,222.172 l65.15-2.504C327.414,223.414,512,55.539,512,55.539L469.402,35.492z"></path></g></svg>`;
                        btn.title = t('admin.mark_answered');
                    }
                }
            }
            // Refresh questions to get updated data
            if (pollInterval) {
                pollForNewQuestions();
            }
        } else {
            if (data.error !== 'Admin authentication required') {
                showNotification(data.error || t('errors.vote_failed'), true);
            }
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showNotification(t('errors.vote_failed'), true);
    });
}

function adminSetColor(questionId, color) {
    if (!ROOM_ID) return;

    sendAdminAction('set_color', { question_id: questionId, color: color })
    .then(data => {
        if (data.success) {
            const questionElement = document.querySelector(`[data-question-id="${questionId}"]`);
            if (questionElement) {
                questionElement.style.borderLeftColor = color;
                // Update toggle button color
                const wrapper = questionElement.querySelector('.color-picker-wrapper');
                if (wrapper) {
                    const toggleBtn = wrapper.querySelector('.color-toggle-btn');
                    if (toggleBtn) {
                        toggleBtn.style.background = color;
                        toggleBtn.style.borderColor = color;
                    }
                }
            }
        } else {
            if (data.error !== 'Admin authentication required') {
                showNotification(data.error || t('errors.vote_failed'), true);
            }
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showNotification(t('errors.vote_failed'), true);
    });
}

function sortQuestionsByVotes() {
    const questionsContainer = document.getElementById('questionsContainer');
    if (!questionsContainer) return;

    const questions = Array.from(questionsContainer.children);

    questions.sort((a, b) => {
        const answeredA = a.classList.contains('answered');
        const answeredB = b.classList.contains('answered');

        // Answered questions go to the bottom
        if (answeredA !== answeredB) {
            return answeredA ? 1 : -1; // If A is answered, it goes after B
        }

        // Both have same answered status, sort by votes then timestamp
        const votesA = parseInt(a.querySelector('.vote-count').textContent) || 0;
        const votesB = parseInt(b.querySelector('.vote-count').textContent) || 0;

        // First sort by votes (descending - highest to lowest)
        if (votesA !== votesB) {
            return votesB - votesA;
        }

        // If votes are equal, sort by timestamp (descending - newest to oldest)
        const timeA = parseInt(a.getAttribute('data-timestamp')) || 0;
        const timeB = parseInt(b.getAttribute('data-timestamp')) || 0;
        return timeB - timeA;
    });

    // Re-append in sorted order
    questions.forEach(q => questionsContainer.appendChild(q));
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Track last question count to detect new questions
let lastQuestionCount = 0;
let lastQuestionIds = new Set();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePageData);
} else {
    initializePageData();
}

// Set up event listeners for buttons (CSP-safe, no inline handlers)
document.addEventListener('DOMContentLoaded', function() {
    // Header dropdown menu
    const menuToggleBtn = document.getElementById('menuToggleBtn');
    const headerDropdown = document.getElementById('headerDropdown');

    function toggleDropdown() {
        if (headerDropdown && menuToggleBtn) {
            const isExpanded = menuToggleBtn.getAttribute('aria-expanded') === 'true';
            menuToggleBtn.setAttribute('aria-expanded', !isExpanded);
            headerDropdown.classList.toggle('active', !isExpanded);
        }
    }

    function closeDropdown() {
        if (headerDropdown && menuToggleBtn) {
            menuToggleBtn.setAttribute('aria-expanded', 'false');
            headerDropdown.classList.remove('active');
        }
    }

    if (menuToggleBtn) {
        menuToggleBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleDropdown();
        });
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        if (headerDropdown && menuToggleBtn) {
            if (!headerDropdown.contains(e.target) && !menuToggleBtn.contains(e.target)) {
                closeDropdown();
            }
        }
    });

    // Close dropdown on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && headerDropdown && headerDropdown.classList.contains('active')) {
            closeDropdown();
        }
    });

    // Share button
    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) {
        shareBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            copyRoomUrl();
            // Optionally close dropdown after sharing
            setTimeout(closeDropdown, 300);
        });
    }

    // Language selector
    const langSelect = document.getElementById('langSelect');
    if (langSelect) {
        langSelect.addEventListener('change', function(e) {
            changeLanguage(e.target.value);
        });
    }

    // Presentation mode button
    const presentationModeBtn = document.getElementById('presentationModeBtn');
    if (presentationModeBtn) {
        presentationModeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (ROOM_ID && PRESENTATION_QUESTION_ID) {
                window.location.href = `index.php?room=${encodeURIComponent(ROOM_ID)}&presentation=1&question=${encodeURIComponent(PRESENTATION_QUESTION_ID)}`;
            }
            // Optionally close dropdown after clicking
            setTimeout(closeDropdown, 300);
        });
    }

    // Modal functionality
    const floatingQuestionBtn = document.getElementById('floatingQuestionBtn');
    const questionModal = document.getElementById('questionModal');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const modalCancelBtn = document.getElementById('modalCancelBtn');

    function openModal() {
        if (questionModal) {
            questionModal.setAttribute('aria-hidden', 'false');
            questionModal.classList.add('active');
            document.body.style.overflow = 'hidden';
            // Focus on textarea
            const questionText = document.getElementById('questionText');
            if (questionText) {
                setTimeout(() => questionText.focus(), 100);
            }
        }
    }

    function closeModal() {
        if (questionModal) {
            questionModal.setAttribute('aria-hidden', 'true');
            questionModal.classList.remove('active');
            document.body.style.overflow = '';
            // Clear form
            const questionForm = document.getElementById('questionForm');
            if (questionForm) {
                questionForm.reset();
            }
        }
    }

    if (floatingQuestionBtn) {
        floatingQuestionBtn.addEventListener('click', openModal);
    }

    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', closeModal);
    }

    if (modalCancelBtn) {
        modalCancelBtn.addEventListener('click', closeModal);
    }

    // Close modal when clicking on overlay
    if (questionModal) {
        questionModal.addEventListener('click', function(e) {
            if (e.target === questionModal) {
                closeModal();
            }
        });
    }

    // Close modal on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && questionModal && questionModal.classList.contains('active')) {
            closeModal();
        }
    });

    // Question form
    const questionForm = document.getElementById('questionForm');
    if (questionForm) {
        questionForm.addEventListener('submit', function(e) {
            submitQuestion(e);
        });
    }

    // Vote buttons (using event delegation)
    document.addEventListener('click', function(e) {
        if (e.target.closest('.vote-btn')) {
            const btn = e.target.closest('.vote-btn');
            const questionId = btn.getAttribute('data-question-id');
            const voteType = btn.getAttribute('data-vote-type');
            if (questionId && voteType) {
                voteQuestion(questionId, voteType);
            }
        }

        // Admin delete button
        if (e.target.closest('.delete-btn')) {
            const btn = e.target.closest('.delete-btn');
            const questionId = btn.getAttribute('data-question-id');
            if (questionId && confirm(t('admin.delete_question') + '?')) {
                adminDeleteQuestion(questionId);
            }
        }

        // Admin answered button
        if (e.target.closest('.answered-btn')) {
            const btn = e.target.closest('.answered-btn');
            const questionId = btn.getAttribute('data-question-id');
            const answered = btn.getAttribute('data-answered') === '1';
            if (questionId) {
                adminMarkAnswered(questionId, !answered);
            }
        }

        // Presentation mode button
        if (e.target.closest('.presentation-btn')) {
            const btn = e.target.closest('.presentation-btn');
            const questionId = btn.getAttribute('data-question-id');
            if (questionId && ROOM_ID) {
                window.location.href = `index.php?room=${encodeURIComponent(ROOM_ID)}&presentation=1&question=${encodeURIComponent(questionId)}`;
            }
        }
    });

    // Color toggle button - open/close dropdown
    document.addEventListener('click', function(e) {
        if (e.target.closest('.color-toggle-btn')) {
            const btn = e.target.closest('.color-toggle-btn');
            const questionId = btn.getAttribute('data-question-id');
            const wrapper = btn.closest('.color-picker-wrapper');
            if (wrapper) {
                const dropdown = wrapper.querySelector('.color-dropdown');
                if (dropdown) {
                    // Close all other dropdowns
                    document.querySelectorAll('.color-dropdown.active').forEach(d => {
                        if (d !== dropdown) {
                            d.classList.remove('active');
                            // Reset z-index of other question items
                            const otherQuestionItem = d.closest('.question-item');
                            if (otherQuestionItem) {
                                otherQuestionItem.style.zIndex = '';
                            }
                        }
                    });

                    // Ensure the parent question item has high z-index when dropdown is open
                    const questionItem = wrapper.closest('.question-item');
                    const isActive = dropdown.classList.contains('active');

                    if (!isActive) {
                        // Opening dropdown - raise z-index of parent
                        if (questionItem) {
                            questionItem.style.zIndex = '10001';
                        }
                    } else {
                        // Closing dropdown - reset z-index
                        if (questionItem) {
                            questionItem.style.zIndex = '';
                        }
                    }

                    dropdown.classList.toggle('active');
                }
            }
            e.stopPropagation();
        }

        // Color option buttons (preset colors)
        if (e.target.closest('.color-option') && !e.target.closest('.color-option-custom')) {
            const btn = e.target.closest('.color-option');
            const questionId = btn.getAttribute('data-question-id');
            const color = btn.getAttribute('data-color');
            if (questionId && color) {
                // Update active state
                const dropdown = btn.closest('.color-dropdown');
                if (dropdown) {
                    dropdown.querySelectorAll('.color-option').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    // Update toggle button color
                    const wrapper = dropdown.closest('.color-picker-wrapper');
                    if (wrapper) {
                        const toggleBtn = wrapper.querySelector('.color-toggle-btn');
                        if (toggleBtn) {
                            toggleBtn.style.background = color;
                            toggleBtn.style.borderColor = color;
                        }
                    }
                    // Close dropdown
                    dropdown.classList.remove('active');
                }
                adminSetColor(questionId, color);
            }
            e.stopPropagation();
        }

        // Custom color option - show color picker
        if (e.target.closest('.color-option-custom')) {
            const btn = e.target.closest('.color-option-custom');
            const questionId = btn.getAttribute('data-question-id');
            const dropdown = btn.closest('.color-dropdown');
            if (dropdown) {
                const colorPicker = dropdown.querySelector('.admin-color-picker');
                if (colorPicker) {
                    colorPicker.click();
                }
            }
            e.stopPropagation();
        }

        // Close dropdowns when clicking outside
        if (!e.target.closest('.color-picker-wrapper')) {
            document.querySelectorAll('.color-dropdown.active').forEach(d => {
                d.classList.remove('active');
                // Reset z-index of parent question item
                const questionItem = d.closest('.question-item');
                if (questionItem) {
                    questionItem.style.zIndex = '';
                }
            });
        }
    });

    // Admin color picker (custom color)
    document.addEventListener('change', function(e) {
        if (e.target.classList.contains('admin-color-picker')) {
            const picker = e.target;
            const questionId = picker.getAttribute('data-question-id');
            const color = picker.value;
            if (questionId && color) {
                // Update active state - mark custom as active, remove from presets
                const dropdown = picker.closest('.color-dropdown');
                if (dropdown) {
                    dropdown.querySelectorAll('.color-option').forEach(b => {
                        if (b.classList.contains('color-option-custom')) {
                            b.classList.add('active');
                        } else {
                            b.classList.remove('active');
                        }
                    });
                    // Update toggle button color
                    const wrapper = dropdown.closest('.color-picker-wrapper');
                    if (wrapper) {
                        const toggleBtn = wrapper.querySelector('.color-toggle-btn');
                        if (toggleBtn) {
                            toggleBtn.style.background = color;
                            toggleBtn.style.borderColor = color;
                        }
                    }
                    // Close dropdown
                    dropdown.classList.remove('active');
                }
                adminSetColor(questionId, color);
            }
        }
    });

    // Close dropdowns on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            document.querySelectorAll('.color-dropdown.active').forEach(d => {
                d.classList.remove('active');
                // Reset z-index of parent question item
                const questionItem = d.closest('.question-item');
                if (questionItem) {
                    questionItem.style.zIndex = '';
                }
            });
        }
    });

    // Create Room Modal (on create-room.php page)
    const createRoomLink = document.getElementById('createRoomLink');
    const createRoomModal = document.getElementById('createRoomModal');
    const createRoomModalClose = document.getElementById('createRoomModalClose');
    const createRoomCancel = document.getElementById('createRoomCancel');
    const createRoomForm = document.getElementById('createRoomForm');

    function openCreateRoomModal() {
        if (createRoomModal) {
            createRoomModal.setAttribute('aria-hidden', 'false');
            createRoomModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    function closeCreateRoomModal() {
        if (createRoomModal) {
            createRoomModal.setAttribute('aria-hidden', 'true');
            createRoomModal.classList.remove('active');
            document.body.style.overflow = '';
            if (createRoomForm) {
                createRoomForm.reset();
            }
        }
    }

    if (createRoomLink) {
        createRoomLink.addEventListener('click', function(e) {
            e.preventDefault();
            openCreateRoomModal();
        });
    }

    if (createRoomModalClose) {
        createRoomModalClose.addEventListener('click', closeCreateRoomModal);
    }

    if (createRoomCancel) {
        createRoomCancel.addEventListener('click', closeCreateRoomModal);
    }

    if (createRoomModal) {
        createRoomModal.addEventListener('click', function(e) {
            if (e.target === createRoomModal) {
                closeCreateRoomModal();
            }
        });
    }

    if (createRoomForm) {
        createRoomForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const roomName = document.getElementById('createRoomName').value.trim();
            const roomId = document.getElementById('createRoomId').value.trim();
            const password = document.getElementById('createRoomPassword').value.trim();

            if (!roomName) {
                showNotification(t('errors.room_name_empty'), true);
                return;
            }

            const submitBtn = createRoomForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = t('common.submitting');

            fetch('create-room-api.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    room_name: roomName,
                    room_id: roomId || null,
                    password: password || null
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    window.location.href = 'index.php?room=' + data.room_id;
                } else {
                    showNotification(data.error || t('errors.failed_to_create_room'), true);
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalText;
                }
            })
            .catch(error => {
                console.error('Error:', error);
                showNotification(t('errors.failed_to_create_room'), true);
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            });
        });
    }

    // Admin Login Modal (on create-room.php page)
    const adminLoginLink = document.getElementById('adminLoginLink');
    const adminLoginModal = document.getElementById('adminLoginModal');
    const adminLoginModalClose = document.getElementById('adminLoginModalClose');
    const adminLoginCancel = document.getElementById('adminLoginCancel');

    function openAdminLoginModal() {
        if (adminLoginModal) {
            adminLoginModal.setAttribute('aria-hidden', 'false');
            adminLoginModal.classList.add('active');
            document.body.style.overflow = 'hidden';
            const input = document.getElementById('adminRoomId');
            if (input) {
                setTimeout(() => input.focus(), 100);
            }
        }
    }

    function closeAdminLoginModal() {
        if (adminLoginModal) {
            adminLoginModal.setAttribute('aria-hidden', 'true');
            adminLoginModal.classList.remove('active');
            document.body.style.overflow = '';
            const form = document.getElementById('adminLoginForm');
            if (form) {
                form.reset();
            }
        }
    }

    if (adminLoginLink) {
        adminLoginLink.addEventListener('click', function(e) {
            e.preventDefault();
            openAdminLoginModal();
        });
    }

    if (adminLoginModalClose) {
        adminLoginModalClose.addEventListener('click', closeAdminLoginModal);
    }

    if (adminLoginCancel) {
        adminLoginCancel.addEventListener('click', closeAdminLoginModal);
    }

    if (adminLoginModal) {
        adminLoginModal.addEventListener('click', function(e) {
            if (e.target === adminLoginModal) {
                closeAdminLoginModal();
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && adminLoginModal.classList.contains('active')) {
                closeAdminLoginModal();
            }
        });
    }
});

// Initialize polling after data is loaded
setTimeout(() => {
    initializePageData();

    // Poll for new questions if on a room page
    if (ROOM_ID) {
        // Initialize with current questions
        const questionsContainer = document.getElementById('questionsContainer');
        if (questionsContainer) {
            lastQuestionCount = questionsContainer.children.length;
            Array.from(questionsContainer.children).forEach(q => {
                const questionId = q.getAttribute('data-question-id');
                if (questionId) {
                    lastQuestionIds.add(questionId);
                }
            });
        }

        // Start polling for new questions after a short delay (to avoid immediate request)
        setTimeout(() => {
            console.log('Starting polling for questions...');
            pollInterval = setInterval(pollForNewQuestions, 3000);
            // Do an initial poll after 1 second
            setTimeout(() => {
                console.log('Initial poll...');
                pollForNewQuestions();
            }, 1000);
        }, 500);
    }
}, 100);

function pollForNewQuestions() {
    if (!ROOM_ID) {
        console.log('Polling skipped: No ROOM_ID');
        return;
    }

    if (document.hidden || isPolling) {
        return;
    }

    isPolling = true;

    fetch(`fetch-questions.php?room_id=${encodeURIComponent(ROOM_ID)}&t=${Date.now()}`, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
            'Accept': 'application/json'
        }
    })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success && data.questions) {
                const questionsContainer = document.getElementById('questionsContainer');
                if (!questionsContainer) {
                    console.log('Questions container not found');
                    return;
                }

                // Get current question IDs and elements
                const currentQuestionIds = new Set();
                const currentQuestionElements = new Map();
                Array.from(questionsContainer.children).forEach(q => {
                    const questionId = q.getAttribute('data-question-id');
                    if (questionId) {
                        currentQuestionIds.add(questionId);
                        currentQuestionElements.set(questionId, q);
                    }
                });

                // Get fetched question IDs
                const fetchedQuestionIds = new Set(data.questions.map(q => q.id));

                // Remove deleted questions (exist in DOM but not in fetched data)
                currentQuestionIds.forEach(questionId => {
                    if (!fetchedQuestionIds.has(questionId)) {
                        const questionElement = currentQuestionElements.get(questionId);
                        if (questionElement) {
                            questionElement.style.transition = 'all 0.3s ease';
                            questionElement.style.opacity = '0';
                            questionElement.style.transform = 'translateX(-20px)';
                            setTimeout(() => {
                                questionElement.remove();
                            }, 300);
                        }
                    }
                });

                // Find new questions
                const newQuestions = data.questions.filter(q => !currentQuestionIds.has(q.id));

                // Add new questions
                newQuestions.forEach(question => {
                    // Track this question ID
                    lastQuestionIds.add(question.id);

                    const questionElement = createQuestionElement(question);
                    questionsContainer.appendChild(questionElement);

                    // Animate in
                    setTimeout(() => {
                        questionElement.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
                        questionElement.style.opacity = '1';
                        questionElement.style.transform = 'translateY(0)';
                    }, 10);
                });

                // Update existing questions (votes, answered status, color)
                let needsResort = false;
                data.questions.forEach(question => {
                    const questionElement = questionsContainer.querySelector(`[data-question-id="${question.id}"]`);
                    if (questionElement) {
                        // Update votes
                        const votes = question.votes || 0;
                        const voteCountElement = questionElement.querySelector('.vote-count');
                        if (voteCountElement) {
                            const currentVotes = parseInt(voteCountElement.textContent) || 0;
                            if (currentVotes !== votes) {
                                needsResort = true;
                            }
                            voteCountElement.textContent = votes;

                            // Update vote count class
                            voteCountElement.className = 'vote-count';
                            if (votes > 0) {
                                voteCountElement.classList.add('votes-positive');
                            } else if (votes < 0) {
                                voteCountElement.classList.add('votes-negative');
                            }
                        }

                        // Update button states
                        const upvoteBtn = questionElement.querySelector('.vote-up');
                        const downvoteBtn = questionElement.querySelector('.vote-down');
                        if (upvoteBtn && downvoteBtn) {
                            if (question.user_vote === 'upvote') {
                                upvoteBtn.classList.add('voted');
                                downvoteBtn.classList.remove('voted');
                            } else if (question.user_vote === 'downvote') {
                                downvoteBtn.classList.add('voted');
                                upvoteBtn.classList.remove('voted');
                            } else {
                                upvoteBtn.classList.remove('voted');
                                downvoteBtn.classList.remove('voted');
                            }
                        }

                        // Update answered status
                        const answered = question.answered === true;
                        const isCurrentlyAnswered = questionElement.classList.contains('answered');
                        if (answered !== isCurrentlyAnswered) {
                            needsResort = true;
                            if (answered) {
                                questionElement.classList.add('answered');
                                // Add answered badge if it doesn't exist
                                if (!questionElement.querySelector('.answered-badge')) {
                                    const questionText = questionElement.querySelector('.question-text');
                                    if (questionText) {
                                        const badge = document.createElement('span');
                                        badge.className = 'answered-badge';
                                        badge.textContent = t('admin.answered');
                                        questionText.insertBefore(badge, questionText.firstChild);
                                    }
                                }
                            } else {
                                questionElement.classList.remove('answered');
                                // Remove answered badge
                                const badge = questionElement.querySelector('.answered-badge');
                                if (badge) {
                                    badge.remove();
                                }
                            }
                            // Update answered button icon if admin controls exist
                            const answeredBtn = questionElement.querySelector('.answered-btn');
                            if (answeredBtn && IS_ADMIN) {
                                const checkIcon = `<svg width="20" height="20" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path fill="currentColor" d="M469.402,35.492C334.09,110.664,197.114,324.5,197.114,324.5L73.509,184.176L0,254.336l178.732,222.172 l65.15-2.504C327.414,223.414,512,55.539,512,55.539L469.402,35.492z"></path></g></svg>`;
                                const checkIconUnanswered = `<svg width="20" height="20" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path fill="currentColor" opacity="0.3" d="M469.402,35.492C334.09,110.664,197.114,324.5,197.114,324.5L73.509,184.176L0,254.336l178.732,222.172 l65.15-2.504C327.414,223.414,512,55.539,512,55.539L469.402,35.492z"></path></g></svg>`;
                                answeredBtn.innerHTML = answered ? checkIcon : checkIconUnanswered;
                                answeredBtn.setAttribute('data-answered', answered ? '1' : '0');
                                answeredBtn.setAttribute('title', answered ? t('admin.mark_unanswered') : t('admin.mark_answered'));
                            }
                        }

                        // Update border color
                        const borderColor = question.border_color || '#0070f3';
                        // Get current border color from computed style or inline style
                        const computedStyle = window.getComputedStyle(questionElement);
                        const currentBorderColor = questionElement.style.borderLeftColor || computedStyle.borderLeftColor || '';
                        // Normalize colors for comparison (convert rgb to hex if needed)
                        const normalizeColor = (color) => {
                            if (!color) return '';
                            // If it's already hex, return as is
                            if (color.startsWith('#')) return color.toLowerCase();
                            // If it's rgb, convert to hex (simplified - assumes rgb format)
                            if (color.startsWith('rgb')) {
                                const matches = color.match(/\d+/g);
                                if (matches && matches.length >= 3) {
                                    const r = parseInt(matches[0]).toString(16).padStart(2, '0');
                                    const g = parseInt(matches[1]).toString(16).padStart(2, '0');
                                    const b = parseInt(matches[2]).toString(16).padStart(2, '0');
                                    return '#' + r + g + b;
                                }
                            }
                            return color.toLowerCase();
                        };
                        const normalizedCurrent = normalizeColor(currentBorderColor);
                        const normalizedNew = normalizeColor(borderColor);

                        if (normalizedCurrent !== normalizedNew) {
                            questionElement.style.borderLeftColor = borderColor;

                            // Update toggle button color if admin controls exist
                            const toggleBtn = questionElement.querySelector('.color-toggle-btn');
                            if (toggleBtn) {
                                toggleBtn.style.background = borderColor;
                                toggleBtn.style.borderColor = borderColor;
                            }

                            // Update active state of color options
                            const colorOptions = questionElement.querySelectorAll('.color-option');
                            colorOptions.forEach(option => {
                                const optionColor = option.getAttribute('data-color');
                                if (optionColor === borderColor) {
                                    option.classList.add('active');
                                } else if (!option.classList.contains('color-option-custom')) {
                                    option.classList.remove('active');
                                }
                            });

                            // Update custom button active state
                            const customBtn = questionElement.querySelector('.color-option-custom');
                            const isPresetColor = ['#0070f3', '#00d9ff', '#ff4444', '#fbbf24'].includes(borderColor);
                            if (customBtn) {
                                if (isPresetColor) {
                                    customBtn.classList.remove('active');
                                } else {
                                    customBtn.classList.add('active');
                                }
                            }
                        }
                    }
                });

                // Re-sort questions if needed
                if (newQuestions.length > 0 || needsResort) {
                    sortQuestionsByVotes();
                }
            }
        })
        .catch(error => {
            console.error('Error polling for questions:', error);
            // Don't stop polling on error, just log it. Never navigate or reload
            // the room because a transient polling request failed.
        })
        .finally(() => {
            isPolling = false;
        });
}

// Clean up polling when page is hidden
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    } else {
        if (ROOM_ID && !pollInterval) {
            pollInterval = setInterval(pollForNewQuestions, 3000);
            // Poll immediately when page becomes visible
            pollForNewQuestions();
        }
    }
});

// Presentation Mode Navigation
function initializePresentationMode() {
    const presentationDataElement = document.getElementById('presentation-data');
    if (!presentationDataElement) {
        return; // Not in presentation mode
    }

    try {
        const presentationData = JSON.parse(presentationDataElement.textContent);
        const roomId = presentationData.room_id;
        const prevQuestionId = presentationData.prev_question_id;
        const nextQuestionId = presentationData.next_question_id;

        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        const exitBtn = document.getElementById('exitBtn');

        function navigateToQuestion(questionId) {
            if (questionId && roomId) {
                window.location.href = `index.php?room=${encodeURIComponent(roomId)}&presentation=1&question=${encodeURIComponent(questionId)}`;
            }
        }

        function exitPresentationMode() {
            if (roomId) {
                window.location.href = `index.php?room=${encodeURIComponent(roomId)}`;
            }
        }

        if (prevBtn && prevQuestionId) {
            prevBtn.addEventListener('click', () => navigateToQuestion(prevQuestionId));
        }

        if (nextBtn && nextQuestionId) {
            nextBtn.addEventListener('click', () => navigateToQuestion(nextQuestionId));
        }

        if (exitBtn) {
            exitBtn.addEventListener('click', exitPresentationMode);
        }

        // Keyboard navigation
        document.addEventListener('keydown', function(e) {
            // Don't handle keyboard shortcuts if user is typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            if (e.key === 'ArrowLeft' && prevQuestionId) {
                navigateToQuestion(prevQuestionId);
            } else if (e.key === 'ArrowRight' && nextQuestionId) {
                navigateToQuestion(nextQuestionId);
            } else if (e.key === 'Escape') {
                exitPresentationMode();
            }
        });
    } catch (e) {
        console.error('Error initializing presentation mode:', e);
    }
}

// Initialize presentation mode if on presentation page
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePresentationMode);
} else {
    initializePresentationMode();
}

