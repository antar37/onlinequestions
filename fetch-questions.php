<?php
/**
 * API endpoint for fetching room questions
 * Used for real-time updates
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');
header('Access-Control-Allow-Headers: Content-Type');

require_once 'room-manager.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

if (!isset($_GET['room_id'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing room_id parameter']);
    exit;
}

$roomId = sanitizeRoomId($_GET['room_id']);
$roomData = getRoomData($roomId);

if (!$roomData) {
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Room not found or expired']);
    exit;
}

// Get user ID for vote tracking
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

if (!isset($_SESSION['user_id'])) {
    $_SESSION['user_id'] = uniqid('user_', true);
}

$userId = $_SESSION['user_id'];

// Add user vote information to each question
$questions = $roomData['questions'] ?? [];
foreach ($questions as &$question) {
    $question['user_vote'] = getUserVote($roomId, $question['id'], $userId);
    // Ensure votes field exists
    if (!isset($question['votes'])) {
        $question['votes'] = 0;
    }
    // Ensure answered and border_color fields exist
    if (!isset($question['answered'])) {
        $question['answered'] = false;
    }
    if (!isset($question['border_color'])) {
        $question['border_color'] = null;
    }
}

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

echo json_encode([
    'success' => true,
    'questions' => $questions,
    'room_name' => $roomData['name'] ?? 'Untitled Room'
]);

