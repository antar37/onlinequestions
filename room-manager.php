<?php
/**
 * Room management functions
 */

// Load configuration
require_once __DIR__ . '/config.php';

define('ROOMS_DIR', __DIR__ . '/rooms/');

/**
 * Event Logging Functions
 */

// Ensure events directory exists
if (!file_exists(EVENTS_DIR)) {
    mkdir(EVENTS_DIR, 0755, true);
}

/**
 * Log an event to the events directory
 * 
 * @param string $eventType Type of event (room_created, question_submitted, vote_cast, room_accessed)
 * @param string $roomId Room ID where the event occurred
 * @param array $data Additional event data
 * @param string|null $userId User ID (if available)
 * @return bool True on success, false on failure
 */
function logEvent($eventType, $roomId, $data = [], $userId = null) {
    $event = [
        'timestamp' => time(),
        'event_type' => $eventType,
        'room_id' => $roomId,
        'user_id' => $userId,
        'data' => $data
    ];
    
    // Store events by date (one file per day)
    $date = date('Y-m-d');
    $eventFile = EVENTS_DIR . $date . '.json';
    
    // Load existing events for today
    $events = [];
    if (file_exists($eventFile)) {
        $existingData = file_get_contents($eventFile);
        if ($existingData) {
            $events = json_decode($existingData, true);
            if (!is_array($events)) {
                $events = [];
            }
        }
    }
    
    // Add new event
    $events[] = $event;
    
    // Save events (keep last 1000 events per day to prevent file bloat)
    if (count($events) > 1000) {
        $events = array_slice($events, -1000);
    }
    
    return file_put_contents($eventFile, json_encode($events, JSON_PRETTY_PRINT)) !== false;
}

function sanitizeRoomId($id) {
    // Allow alphanumeric and hyphens, convert to lowercase
    $sanitized = preg_replace('/[^a-zA-Z0-9-]/', '', $id);
    $sanitized = strtolower($sanitized);
    // Remove leading/trailing hyphens
    $sanitized = trim($sanitized, '-');
    // Limit length
    if (strlen($sanitized) > ROOM_ID_MAX_LENGTH) {
        $sanitized = substr($sanitized, 0, ROOM_ID_MAX_LENGTH);
    }
    return $sanitized;
}

function slugifyRoomTitle($title) {
    // Convert to lowercase
    $slug = strtolower($title);
    
    // Replace spaces and underscores with hyphens
    $slug = preg_replace('/[\s_]+/', '-', $slug);
    
    // Remove all non-alphanumeric characters except hyphens
    $slug = preg_replace('/[^a-z0-9-]/', '', $slug);
    
    // Replace multiple consecutive hyphens with a single hyphen
    $slug = preg_replace('/-+/', '-', $slug);
    
    // Remove leading and trailing hyphens
    $slug = trim($slug, '-');
    
    // If slug is empty after processing, generate a fallback
    if (empty($slug)) {
        return generateRoomId();
    }
    
    // Ensure minimum length
    if (strlen($slug) < ROOM_ID_MIN_LENGTH) {
        // If too short, pad with random characters
        $slug .= '-' . generateRoomId();
    }
    
    // Limit maximum length
    if (strlen($slug) > ROOM_ID_MAX_LENGTH) {
        $slug = substr($slug, 0, ROOM_ID_MAX_LENGTH);
        // Remove trailing hyphen if cut off
        $slug = rtrim($slug, '-');
    }
    
    return $slug;
}

function generateRoomId() {
    $characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    $roomId = '';
    for ($i = 0; $i < 8; $i++) {
        $roomId .= $characters[rand(0, strlen($characters) - 1)];
    }
    return $roomId;
}

function createRoom($roomName, $customRoomId = null, $password = null) {
    // Load translations if not already loaded
    if (!function_exists('t')) {
        require_once __DIR__ . '/lang.php';
    }
    
    if (!file_exists(ROOMS_DIR)) {
        mkdir(ROOMS_DIR, 0755, true);
    }
    
    // If custom room ID provided, use it (sanitized)
    if ($customRoomId) {
        $roomId = sanitizeRoomId($customRoomId);
        
        // Validate room ID
        if (strlen($roomId) < ROOM_ID_MIN_LENGTH) {
            return ['error' => t('errors.room_id_too_short', ['min' => ROOM_ID_MIN_LENGTH])];
        }
        
        // Check if room already exists
        $roomFile = ROOMS_DIR . $roomId . '.json';
        if (file_exists($roomFile)) {
            // Check if existing room is expired
            $existingRoomData = json_decode(file_get_contents($roomFile), true);
            if ($existingRoomData && isRoomExpired($existingRoomData)) {
                // Delete expired room and allow creation
                deleteRoom($roomId);
            } else {
                // Room exists and is not expired
                return ['error' => t('errors.room_id_exists')];
            }
        }
    } else {
        // Generate room ID from slugified room title
        $roomId = slugifyRoomTitle($roomName);
        $roomFile = ROOMS_DIR . $roomId . '.json';
        
        // Ensure room ID is unique (skip expired rooms)
        $counter = 1;
        $originalRoomId = $roomId;
        while (file_exists($roomFile)) {
            // Check if existing room is expired
            $existingRoomData = json_decode(file_get_contents($roomFile), true);
            if ($existingRoomData && isRoomExpired($existingRoomData)) {
                // Delete expired room and use this ID
                deleteRoom($roomId);
                break;
            }
            // Room exists and is not expired, append counter to make unique
            $roomId = $originalRoomId . '-' . $counter;
            // Ensure it doesn't exceed max length
            if (strlen($roomId) > ROOM_ID_MAX_LENGTH) {
                // If too long, truncate and append counter
                $truncated = substr($originalRoomId, 0, ROOM_ID_MAX_LENGTH - strlen('-' . $counter));
                $roomId = rtrim($truncated, '-') . '-' . $counter;
            }
            $roomFile = ROOMS_DIR . $roomId . '.json';
            $counter++;
            
            // Safety limit to prevent infinite loop
            if ($counter > 1000) {
                // Fallback to random ID if too many collisions
                $roomId = generateRoomId();
                $roomFile = ROOMS_DIR . $roomId . '.json';
                break;
            }
        }
    }
    
    $roomData = [
        'id' => $roomId,
        'name' => $roomName,
        'created' => time(),
        'questions' => []
    ];
    
    // Store password hash if provided
    if ($password && !empty(trim($password))) {
        $roomData['password_hash'] = password_hash(trim($password), PASSWORD_DEFAULT);
    }
    
    if (file_put_contents($roomFile, json_encode($roomData, JSON_PRETTY_PRINT))) {
        // Log room creation event
        logEvent('room_created', $roomId, [
            'room_name' => $roomName,
            'custom_id' => $customRoomId !== null
        ]);
        
        return $roomId;
    }
    
    return ['error' => t('errors.failed_to_create_room')];
}

function addQuestionToRoom($roomId, $questionText) {
    $roomFile = ROOMS_DIR . $roomId . '.json';
    
    if (!file_exists($roomFile)) {
        return false;
    }
    
    $roomData = json_decode(file_get_contents($roomFile), true);
    if (!$roomData) {
        return false;
    }
    
    // Check if room is expired
    if (isRoomExpired($roomData)) {
        deleteRoom($roomId);
        return false;
    }
    
    $question = [
        'id' => uniqid(),
        'text' => $questionText,
        'timestamp' => time(),
        'votes' => 0
    ];
    
    $roomData['questions'][] = $question;
    
    if (file_put_contents($roomFile, json_encode($roomData, JSON_PRETTY_PRINT))) {
        // Log question submission event
        logEvent('question_submitted', $roomId, [
            'question_id' => $question['id'],
            'question_length' => strlen($questionText)
        ]);
        
        return $question;
    }
    
    return false;
}

function isRoomExpired($roomData) {
    if (!isset($roomData['created'])) {
        // If no creation timestamp, consider it expired for safety
        return true;
    }
    
    $age = time() - $roomData['created'];
    return $age > ROOM_EXPIRATION_SECONDS;
}

function deleteRoom($roomId) {
    $roomFile = ROOMS_DIR . $roomId . '.json';
    if (file_exists($roomFile)) {
        return unlink($roomFile);
    }
    return false;
}

function getRoomData($roomId) {
    $roomFile = ROOMS_DIR . $roomId . '.json';
    
    if (!file_exists($roomFile)) {
        return null;
    }
    
    $roomData = json_decode(file_get_contents($roomFile), true);
    
    if (!$roomData) {
        return null;
    }
    
    // Check if room is expired
    if (isRoomExpired($roomData)) {
        // Delete expired room
        deleteRoom($roomId);
        return null;
    }
    
    return $roomData;
}

function cleanupExpiredRooms() {
    if (!file_exists(ROOMS_DIR)) {
        return ['deleted' => 0, 'checked' => 0];
    }
    
    $deleted = 0;
    $checked = 0;
    $files = glob(ROOMS_DIR . '*.json');
    
    foreach ($files as $file) {
        $checked++;
        $roomData = json_decode(file_get_contents($file), true);
        
        if ($roomData && isRoomExpired($roomData)) {
            if (unlink($file)) {
                $deleted++;
            }
        }
    }
    
    return ['deleted' => $deleted, 'checked' => $checked];
}

function voteQuestion($roomId, $questionId, $voteType, $userId) {
    $roomFile = ROOMS_DIR . $roomId . '.json';
    
    if (!file_exists($roomFile)) {
        return ['success' => false, 'error' => 'Room not found'];
    }
    
    $roomData = json_decode(file_get_contents($roomFile), true);
    if (!$roomData) {
        return ['success' => false, 'error' => 'Invalid room data'];
    }
    
    // Check if room is expired
    if (isRoomExpired($roomData)) {
        deleteRoom($roomId);
        // Load translations if not already loaded
        if (!function_exists('t')) {
            require_once __DIR__ . '/lang.php';
        }
        return ['success' => false, 'error' => t('errors.room_expired')];
    }
    
    // Initialize votes tracking if not exists
    if (!isset($roomData['votes'])) {
        $roomData['votes'] = [];
    }
    
    // Find the question
    $questionFound = false;
    $previousVote = null;
    
    foreach ($roomData['questions'] as &$question) {
        if ($question['id'] === $questionId) {
            $questionFound = true;
            // Initialize votes if not set (for backward compatibility)
            if (!isset($question['votes'])) {
                $question['votes'] = 0;
            }
            
            // Check if user has already voted on this question
            // Note: Vote key includes questionId, so users can vote once PER QUESTION (not per room)
            // This allows users to vote on multiple questions in the same room
            $voteKey = $roomId . '_' . $questionId . '_' . $userId;
            if (isset($roomData['votes'][$voteKey])) {
                $previousVote = $roomData['votes'][$voteKey];
                
                // If voting the same way, don't allow (one vote per person per question)
                if ($previousVote === $voteType) {
                    // Load translations if not already loaded
                    if (!function_exists('t')) {
                        require_once __DIR__ . '/lang.php';
                    }
                    return ['success' => false, 'error' => t('errors.already_voted')];
                }
                
                // Remove previous vote
                if ($previousVote === 'upvote') {
                    $question['votes']--;
                } elseif ($previousVote === 'downvote') {
                    $question['votes']++;
                }
            }
            
            // Add new vote
            if ($voteType === 'upvote') {
                $question['votes']++;
            } elseif ($voteType === 'downvote') {
                $question['votes']--;
            } else {
                return ['success' => false, 'error' => 'Invalid vote type'];
            }
            
            // Record the vote
            $roomData['votes'][$voteKey] = $voteType;
            
            break;
        }
    }
    
    if (!$questionFound) {
        return ['success' => false, 'error' => 'Question not found'];
    }
    
    // Save updated room data
    if (file_put_contents($roomFile, json_encode($roomData, JSON_PRETTY_PRINT))) {
        // Find the updated question for logging
        $updatedQuestion = null;
        foreach ($roomData['questions'] as $q) {
            if ($q['id'] === $questionId) {
                $updatedQuestion = $q;
                break;
            }
        }
        
        // Log vote event
        if ($updatedQuestion) {
            logEvent('vote_cast', $roomId, [
                'question_id' => $questionId,
                'vote_type' => $voteType,
                'new_vote_count' => $updatedQuestion['votes'],
                'previous_vote' => $previousVote,
                'changed_vote' => $previousVote !== null
            ], $userId);
        }
        
        // Return the updated question
        if ($updatedQuestion) {
            return [
                'success' => true, 
                'question' => $updatedQuestion,
                'user_vote' => $voteType,
                'previous_vote' => $previousVote
            ];
        }
    }
    
    return ['success' => false, 'error' => 'Failed to save vote'];
}

function getUserVote($roomId, $questionId, $userId) {
    $roomFile = ROOMS_DIR . $roomId . '.json';
    
    if (!file_exists($roomFile)) {
        return null;
    }
    
    $roomData = json_decode(file_get_contents($roomFile), true);
    if (!$roomData || !isset($roomData['votes'])) {
        return null;
    }
    
    $voteKey = $roomId . '_' . $questionId . '_' . $userId;
    return isset($roomData['votes'][$voteKey]) ? $roomData['votes'][$voteKey] : null;
}

/**
 * Verify admin password for a room
 */
function verifyRoomPassword($roomId, $password) {
    $roomData = getRoomData($roomId);
    if (!$roomData) {
        return false;
    }
    
    if (!isset($roomData['password_hash'])) {
        return false; // No password set
    }
    
    return password_verify($password, $roomData['password_hash']);
}

/**
 * Delete a question from a room (admin only)
 */
function deleteQuestion($roomId, $questionId) {
    $roomFile = ROOMS_DIR . $roomId . '.json';
    
    if (!file_exists($roomFile)) {
        return ['success' => false, 'error' => 'Room not found'];
    }
    
    $roomData = json_decode(file_get_contents($roomFile), true);
    if (!$roomData) {
        return ['success' => false, 'error' => 'Invalid room data'];
    }
    
    // Find and remove the question
    $found = false;
    foreach ($roomData['questions'] as $key => $question) {
        if ($question['id'] === $questionId) {
            unset($roomData['questions'][$key]);
            $roomData['questions'] = array_values($roomData['questions']); // Re-index array
            $found = true;
            break;
        }
    }
    
    if (!$found) {
        return ['success' => false, 'error' => 'Question not found'];
    }
    
    if (file_put_contents($roomFile, json_encode($roomData, JSON_PRETTY_PRINT))) {
        // Log deletion event
        logEvent('question_deleted', $roomId, [
            'question_id' => $questionId
        ]);
        
        return ['success' => true];
    }
    
    return ['success' => false, 'error' => 'Failed to save'];
}

/**
 * Mark a question as answered/unanswered (admin only)
 */
function markQuestionAnswered($roomId, $questionId, $answered = true) {
    $roomFile = ROOMS_DIR . $roomId . '.json';
    
    if (!file_exists($roomFile)) {
        return ['success' => false, 'error' => 'Room not found'];
    }
    
    $roomData = json_decode(file_get_contents($roomFile), true);
    if (!$roomData) {
        return ['success' => false, 'error' => 'Invalid room data'];
    }
    
    // Find and update the question
    $found = false;
    foreach ($roomData['questions'] as &$question) {
        if ($question['id'] === $questionId) {
            $question['answered'] = $answered;
            $found = true;
            break;
        }
    }
    
    if (!$found) {
        return ['success' => false, 'error' => 'Question not found'];
    }
    
    if (file_put_contents($roomFile, json_encode($roomData, JSON_PRETTY_PRINT))) {
        return ['success' => true, 'answered' => $answered];
    }
    
    return ['success' => false, 'error' => 'Failed to save'];
}

/**
 * Change border color of a question (admin only)
 */
function setQuestionColor($roomId, $questionId, $color) {
    $roomFile = ROOMS_DIR . $roomId . '.json';
    
    if (!file_exists($roomFile)) {
        return ['success' => false, 'error' => 'Room not found'];
    }
    
    $roomData = json_decode(file_get_contents($roomFile), true);
    if (!$roomData) {
        return ['success' => false, 'error' => 'Invalid room data'];
    }
    
    // Validate color (hex color)
    if (!preg_match('/^#[0-9A-Fa-f]{6}$/', $color)) {
        return ['success' => false, 'error' => 'Invalid color format'];
    }
    
    // Find and update the question
    $found = false;
    foreach ($roomData['questions'] as &$question) {
        if ($question['id'] === $questionId) {
            $question['border_color'] = $color;
            $found = true;
            break;
        }
    }
    
    if (!$found) {
        return ['success' => false, 'error' => 'Question not found'];
    }
    
    if (file_put_contents($roomFile, json_encode($roomData, JSON_PRETTY_PRINT))) {
        return ['success' => true, 'color' => $color];
    }
    
    return ['success' => false, 'error' => 'Failed to save'];
}

