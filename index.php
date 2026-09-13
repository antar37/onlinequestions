<?php
/**
 * Online Questions - Room-based anonymous question system
 * Based on Thorsten Thormählen's original OnlineQuestions
 */

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Load language system
require_once 'lang.php';

// Handle language switching
if (isset($_GET['lang']) && in_array($_GET['lang'], SUPPORTED_LANGS)) {
    setLang($_GET['lang']);
    // Redirect to same page without lang parameter
    $redirectUrl = strtok($_SERVER['REQUEST_URI'], '?');
    if (isset($_GET['room'])) {
        $redirectUrl .= '?room=' . urlencode($_GET['room']);
    }
    header('Location: ' . $redirectUrl);
    exit;
}

// Include room manager functions (defines ROOMS_DIR and creates EVENTS_DIR if needed)
require_once 'room-manager.php';
require_once 'admin-auth.php';

// Ensure rooms directory exists
if (!file_exists(ROOMS_DIR)) {
    mkdir(ROOMS_DIR, 0755, true);
}

// Get room ID from URL
$roomId = isset($_GET['room']) ? sanitizeRoomId($_GET['room']) : null;

// If no room ID, show room creation/selection page
if (!$roomId) {
    include 'create-room.php';
    exit;
}

// Load room data (this will check for expiration and delete if expired)
$roomData = getRoomData($roomId);

if (!$roomData) {
    // Room doesn't exist or was expired, redirect to create page
    header('Location: index.php?error=' . (isset($_GET['room']) ? 'room_expired' : 'room_not_found'));
    exit;
}

// Log room access
if (function_exists('logEvent')) {
    $userId = isset($_SESSION['user_id']) ? $_SESSION['user_id'] : null;
    logEvent('room_accessed', $roomId, [
        'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
        'user_agent' => substr($_SERVER['HTTP_USER_AGENT'] ?? 'unknown', 0, 100) // Limit length
    ], $userId);
}

$roomName = $roomData['name'] ?? t('index.untitled_room');
$questions = $roomData['questions'] ?? [];
$hasPassword = isset($roomData['password_hash']);
$isAdmin = false;

// Check if user is authenticated as admin through the active session or remember cookie
$isAdmin = $hasPassword && isAdminAuthenticated($roomId);

// Admin authentication is now handled on create-room.php page

// Sort questions: unanswered first (by votes, then timestamp), then answered at bottom (by votes, then timestamp)
usort($questions, function($a, $b) {
    $answeredA = isset($a['answered']) && $a['answered'] === true;
    $answeredB = isset($b['answered']) && $b['answered'] === true;
    
    // Answered questions go to the bottom
    if ($answeredA !== $answeredB) {
        return $answeredA ? 1 : -1; // If A is answered, it goes after B
    }
    
    // Both have same answered status, sort by votes then timestamp
    $votesA = isset($a['votes']) ? $a['votes'] : 0;
    $votesB = isset($b['votes']) ? $b['votes'] : 0;
    
    // First sort by votes (descending)
    if ($votesA !== $votesB) {
        return $votesB - $votesA;
    }
    
    // If votes are equal, sort by timestamp (newest first)
    $timeA = isset($a['timestamp']) ? $a['timestamp'] : 0;
    $timeB = isset($b['timestamp']) ? $b['timestamp'] : 0;
    return $timeB - $timeA;
});

$currentLang = getLang();

// Check if presentation mode is requested
$presentationMode = isset($_GET['presentation']) && $_GET['presentation'] === '1';
$selectedQuestionId = isset($_GET['question']) ? $_GET['question'] : null;

// If in presentation mode, render a simplified view
if ($presentationMode) {
    // Find the selected question or use the first one
    $selectedQuestion = null;
    if ($selectedQuestionId) {
        foreach ($questions as $q) {
            if ($q['id'] === $selectedQuestionId) {
                $selectedQuestion = $q;
                break;
            }
        }
    }
    if (!$selectedQuestion && count($questions) > 0) {
        $selectedQuestion = $questions[0];
    }
    
    // Get current question index
    $currentIndex = 0;
    if ($selectedQuestion) {
        foreach ($questions as $idx => $q) {
            if ($q['id'] === $selectedQuestion['id']) {
                $currentIndex = $idx;
                break;
            }
        }
    }
    
    // Get previous and next question IDs
    $prevQuestionId = null;
    $nextQuestionId = null;
    if (count($questions) > 0) {
        $prevIndex = $currentIndex > 0 ? $currentIndex - 1 : null;
        $nextIndex = $currentIndex < count($questions) - 1 ? $currentIndex + 1 : null;
        if ($prevIndex !== null) {
            $prevQuestionId = $questions[$prevIndex]['id'];
        }
        if ($nextIndex !== null) {
            $nextQuestionId = $questions[$nextIndex]['id'];
        }
    }
    
    include 'presentation-mode.php';
    exit;
}
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang); ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo htmlspecialchars($roomName); ?> - <?php echo t('index.title_suffix'); ?></title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div class="container">
        <header>
            <div class="header-top">
                <div>
                    <h1><?php echo htmlspecialchars($roomName); ?></h1>
                </div>
                <div class="header-menu">
                    <button class="menu-toggle-btn" id="menuToggleBtn" aria-label="Menu" aria-expanded="false">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M3 12H21M3 6H21M3 18H21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                    <div class="header-dropdown" id="headerDropdown">
                        <div class="dropdown-item">
                            <span class="dropdown-label"><?php echo t('common.room_id'); ?>:</span>
                            <span class="dropdown-value"><?php echo htmlspecialchars($roomId); ?></span>
                        </div>
                        <div class="dropdown-item">
                            <?php
                            // Find the highest rated, most recent question for presentation mode
                            $topQuestion = null;
                            if (count($questions) > 0) {
                                // Filter out answered questions for default selection
                                $unansweredQuestions = array_filter($questions, function($q) {
                                    return !(isset($q['answered']) && $q['answered'] === true);
                                });
                                
                                if (count($unansweredQuestions) > 0) {
                                    // Sort by votes (descending), then by timestamp (descending)
                                    usort($unansweredQuestions, function($a, $b) {
                                        $votesA = isset($a['votes']) ? $a['votes'] : 0;
                                        $votesB = isset($b['votes']) ? $b['votes'] : 0;
                                        if ($votesA !== $votesB) {
                                            return $votesB - $votesA;
                                        }
                                        $timeA = isset($a['timestamp']) ? $a['timestamp'] : 0;
                                        $timeB = isset($b['timestamp']) ? $b['timestamp'] : 0;
                                        return $timeB - $timeA;
                                    });
                                    $topQuestion = reset($unansweredQuestions);
                                } else {
                                    // If all questions are answered, use the first one
                                    $topQuestion = $questions[0];
                                }
                            }
                            $presentationQuestionId = $topQuestion ? $topQuestion['id'] : null;
                            ?>
                            <button class="share-btn presentation-mode-btn" id="presentationModeBtn" aria-label="<?php echo t('common.presentation_mode'); ?>" title="<?php echo t('common.presentation_mode'); ?>" <?php echo $presentationQuestionId ? '' : 'disabled'; ?>>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <g id="SVGRepo_bgCarrier" stroke-width="0"></g>
                                    <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
                                    <g id="SVGRepo_iconCarrier">
                                        <path d="M8 5H6C4.89543 5 4 5.89543 4 7V19C4 20.1046 4.89543 21 6 21H18C19.1046 21 20 20.1046 20 19V7C20 5.89543 19.1046 5 18 5H16M8 5C8 3.89543 8.89543 3 10 3H14C15.1046 3 16 3.89543 16 5M8 5C8 6.10457 8.89543 7 10 7H14C15.1046 7 16 6.10457 16 5M12 12H16M12 16H16M8 12H8.01M8 16H8.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                    </g>
                                </svg>
                                <span><?php echo t('common.presentation_mode'); ?></span>
                            </button>
                        </div>
                        <div class="dropdown-item">
                            <button class="share-btn" id="shareBtn" aria-label="<?php echo t('common.copy_room_url'); ?>" title="<?php echo t('common.copy_room_url'); ?>">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <g id="SVGRepo_bgCarrier" stroke-width="0"></g>
                                    <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
                                    <g id="SVGRepo_iconCarrier">
                                        <path d="M9 12C9 13.3807 7.88071 14.5 6.5 14.5C5.11929 14.5 4 13.3807 4 12C4 10.6193 5.11929 9.5 6.5 9.5C7.88071 9.5 9 10.6193 9 12Z" stroke="currentColor" stroke-width="1.5"></path>
                                        <path d="M14 6.5L9 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
                                        <path d="M14 17.5L9 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
                                        <path d="M19 18.5C19 19.8807 17.8807 21 16.5 21C15.1193 21 14 19.8807 14 18.5C14 17.1193 15.1193 16 16.5 16C17.8807 16 19 17.1193 19 18.5Z" stroke="currentColor" stroke-width="1.5"></path>
                                        <path d="M19 5.5C19 6.88071 17.8807 8 16.5 8C15.1193 8 14 6.88071 14 5.5C14 4.11929 15.1193 3 16.5 3C17.8807 3 19 4.11929 19 5.5Z" stroke="currentColor" stroke-width="1.5"></path>
                                    </g>
                                </svg>
                                <span><?php echo t('common.copy_room_url'); ?></span>
                            </button>
                        </div>
                        <div class="dropdown-item">
                            <label class="dropdown-label" for="langSelect"><?php echo t('common.language'); ?>:</label>
                            <select id="langSelect" class="lang-select">
                                <?php foreach (SUPPORTED_LANGS as $lang): ?>
                                    <option value="<?php echo $lang; ?>" <?php echo $currentLang === $lang ? 'selected' : ''; ?>>
                                        <?php echo strtoupper($lang); ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                    </div>
                </div>
            </div>
        </header>

        <div class="main-content">
            <div class="questions-section">
                <h2><?php echo t('index.questions'); ?></h2>
                <div id="questionsContainer">
                    <?php
                    // Get user ID for vote tracking
                    if (!isset($_SESSION['user_id'])) {
                        $_SESSION['user_id'] = uniqid('user_', true);
                    }
                    $userId = $_SESSION['user_id'];
                    
                    // Display questions sorted by votes
                    foreach ($questions as $question) {
                        $questionId = htmlspecialchars($question['id']);
                        $votes = isset($question['votes']) ? $question['votes'] : 0;
                        $timestamp = isset($question['timestamp']) ? date('Y-m-d H:i:s', $question['timestamp']) : t('common.unknown');
                        $voteClass = $votes > 0 ? 'votes-positive' : ($votes < 0 ? 'votes-negative' : '');
                        
                        // Check if user has voted on this question
                        $userVote = getUserVote($roomId, $questionId, $userId);
                        $upvoteClass = ($userVote === 'upvote') ? 'voted' : '';
                        $downvoteClass = ($userVote === 'downvote') ? 'voted' : '';
                        
                        // Get question properties
                        $answered = isset($question['answered']) && $question['answered'] === true;
                        $borderColor = isset($question['border_color']) ? $question['border_color'] : '';
                        $answeredClass = $answered ? 'answered' : '';
                        $styleAttr = $borderColor ? ' style="border-left-color: ' . htmlspecialchars($borderColor) . ';"' : '';
                        
                        echo '<div class="question-item ' . $answeredClass . '" data-question-id="' . $questionId . '" data-timestamp="' . (isset($question['timestamp']) ? $question['timestamp'] : 0) . '"' . $styleAttr . '>';
                        echo '<div class="question-voting">';
                        echo '<button class="vote-btn vote-up ' . $upvoteClass . '" data-question-id="' . $questionId . '" data-vote-type="upvote" aria-label="' . t('voting.upvote') . '">';
                        echo '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">';
                        echo '<path d="M10 15V5M5 10L10 5L15 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
                        echo '</svg>';
                        echo '</button>';
                        echo '<span class="vote-count ' . $voteClass . '">' . $votes . '</span>';
                        echo '<button class="vote-btn vote-down ' . $downvoteClass . '" data-question-id="' . $questionId . '" data-vote-type="downvote" aria-label="' . t('voting.downvote') . '">';
                        echo '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">';
                        echo '<path d="M10 5V15M5 10L10 15L15 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
                        echo '</svg>';
                        echo '</button>';
                        echo '</div>';
                        echo '<div class="question-content">';
                        if ($answered) {
                            echo '<span class="answered-badge">' . t('admin.answered') . '</span>';
                        }
                        echo '<div class="question-text">' . htmlspecialchars($question['text']) . '</div>';
                        echo '<div class="question-meta">' . htmlspecialchars($timestamp);
                        if ($isAdmin) {
                            echo '<div class="admin-controls">';
                            echo '<button class="admin-btn presentation-btn" data-question-id="' . $questionId . '" title="' . t('admin.open_presentation_mode') . '">';
                            echo '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path d="M8 5H6C4.89543 5 4 5.89543 4 7V19C4 20.1046 4.89543 21 6 21H18C19.1046 21 20 20.1046 20 19V7C20 5.89543 19.1046 5 18 5H16M8 5C8 3.89543 8.89543 3 10 3H14C15.1046 3 16 3.89543 16 5M8 5C8 6.10457 8.89543 7 10 7H14C15.1046 7 16 6.10457 16 5M12 12H16M12 16H16M8 12H8.01M8 16H8.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g></svg>';
                            echo '</button>';
                            echo '<button class="admin-btn delete-btn" data-question-id="' . $questionId . '" title="' . t('admin.delete_question') . '">';
                            echo '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path d="M10 12V17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path><path d="M14 12V17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path><path d="M4 7H20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path><path d="M6 10V18C6 19.6569 7.34315 21 9 21H15C16.6569 21 18 19.6569 18 18V10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path><path d="M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5V7H9V5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></g></svg>';
                            echo '</button>';
                            echo '<button class="admin-btn answered-btn" data-question-id="' . $questionId . '" data-answered="' . ($answered ? '1' : '0') . '" title="' . ($answered ? t('admin.mark_unanswered') : t('admin.mark_answered')) . '">';
                            if ($answered) {
                                echo '<svg width="20" height="20" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path fill="currentColor" d="M469.402,35.492C334.09,110.664,197.114,324.5,197.114,324.5L73.509,184.176L0,254.336l178.732,222.172 l65.15-2.504C327.414,223.414,512,55.539,512,55.539L469.402,35.492z"></path></g></svg>';
                            } else {
                                echo '<svg width="20" height="20" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path fill="currentColor" opacity="0.3" d="M469.402,35.492C334.09,110.664,197.114,324.5,197.114,324.5L73.509,184.176L0,254.336l178.732,222.172 l65.15-2.504C327.414,223.414,512,55.539,512,55.539L469.402,35.492z"></path></g></svg>';
                            }
                            echo '</button>';
                            $currentColor = $borderColor ?: '#0070f3';
                            echo '<div class="color-picker-wrapper" data-question-id="' . $questionId . '">';
                            echo '<button class="admin-btn color-toggle-btn" data-question-id="' . $questionId . '" title="' . t('admin.change_color') . '" style="background: ' . htmlspecialchars($currentColor) . '; border-color: ' . htmlspecialchars($currentColor) . ';">';
                            echo '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
                            echo '</button>';
                            echo '<div class="color-dropdown" data-question-id="' . $questionId . '">';
                            echo '<div class="color-options">';
                            echo '<button class="color-option' . ($currentColor === '#0070f3' ? ' active' : '') . '" data-color="#0070f3" data-question-id="' . $questionId . '" title="Blue" style="background: #0070f3;"></button>';
                            echo '<button class="color-option' . ($currentColor === '#00d9ff' ? ' active' : '') . '" data-color="#00d9ff" data-question-id="' . $questionId . '" title="Green" style="background: #00d9ff;"></button>';
                            echo '<button class="color-option' . ($currentColor === '#ff4444' ? ' active' : '') . '" data-color="#ff4444" data-question-id="' . $questionId . '" title="Red" style="background: #ff4444;"></button>';
                            echo '<button class="color-option' . ($currentColor === '#fbbf24' ? ' active' : '') . '" data-color="#fbbf24" data-question-id="' . $questionId . '" title="Yellow" style="background: #fbbf24;"></button>';
                            echo '<button class="color-option color-option-custom" data-question-id="' . $questionId . '" title="' . t('admin.custom_color') . '">';
                            echo '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
                            echo '</button>';
                            echo '</div>';
                            echo '<input type="color" class="admin-color-picker" data-question-id="' . $questionId . '" value="' . htmlspecialchars($currentColor) . '" style="display: none;">';
                            echo '</div>';
                            echo '</div>';
                            echo '</div>';
                        }
                        echo '</div>';
                        echo '</div>';
                        echo '</div>';
                    }
                    ?>
                </div>
            </div>
        </div>
    </div>

    <!-- Floating Ask Question Button -->
    <button class="floating-question-btn" id="floatingQuestionBtn" aria-label="<?php echo t('index.ask_question'); ?>" title="<?php echo t('index.ask_question'); ?>">
        <svg width="24" height="24" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
            <g id="SVGRepo_bgCarrier" stroke-width="0"></g>
            <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
            <g id="SVGRepo_iconCarrier">
                <path fill="currentColor" d="M257.135,19.179C103.966,19.179,0,97.273,0,218.763c0,74.744,31.074,134.641,91.108,173.176 c4.003,2.572,8.728,2.962,6.954,10.365c-7.159,29.935-19.608,83.276-19.608,83.276c-0.526,2.26,0.321,4.617,2.162,6.03 c1.841,1.402,4.335,1.607,6.381,0.507c0,0,87.864-52.066,99.583-58.573c27.333-15.625,50.877-18.654,68.557-18.654 C376.618,414.89,512,366.282,512,217.458C512,102.036,418.973,19.179,257.135,19.179z M136.911,258.117 c-16.862,0-30.529-13.666-30.529-30.528c0-16.862,13.666-30.539,30.529-30.539c16.872,0,30.538,13.677,30.538,30.539 C167.449,244.451,153.782,258.117,136.911,258.117z M255.994,258.117c-16.861,0-30.528-13.666-30.528-30.528 c0-16.862,13.666-30.539,30.528-30.539c16.873,0,30.539,13.677,30.539,30.539C286.534,244.451,272.867,258.117,255.994,258.117z M375.089,258.117c-16.862,0-30.538-13.666-30.538-30.528c0-16.862,13.676-30.539,30.538-30.539 c16.872,0,30.538,13.677,30.538,30.539C405.627,244.451,391.961,258.117,375.089,258.117z"></path>
            </g>
        </svg>
    </button>

    <!-- Question Modal -->
    <div class="modal-overlay" id="questionModal" aria-hidden="true">
        <div class="modal-content">
            <div class="modal-header">
                <h2><?php echo t('index.ask_question'); ?></h2>
                <button class="modal-close" id="modalCloseBtn" aria-label="<?php echo t('common.close'); ?>">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            </div>
            <form id="questionForm">
                <textarea 
                    id="questionText" 
                    placeholder="<?php echo t('index.question_placeholder'); ?>" 
                    required
                    rows="4"
                ></textarea>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" id="modalCancelBtn"><?php echo t('common.cancel'); ?></button>
                    <button type="submit" class="btn btn-primary"><?php echo t('index.submit_question'); ?></button>
                </div>
            </form>
        </div>
    </div>

    <script type="application/json" id="page-data">
        <?php echo json_encode([
            'room_id' => $roomId,
            'current_lang' => $currentLang,
            'translations' => $translations,
            'user_id' => $_SESSION['user_id'] ?? '',
            'is_admin' => $isAdmin,
            'has_password' => $hasPassword,
            'presentation_question_id' => $presentationQuestionId
        ]); ?>
    </script>
    <script src="app.js"></script>
</body>
</html>

