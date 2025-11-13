<?php
/**
 * API endpoint for voting on questions
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

require_once 'room-manager.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

// Start session to get user ID
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Generate or retrieve user ID
if (!isset($_SESSION['user_id'])) {
    $_SESSION['user_id'] = uniqid('user_', true);
}

$userId = $_SESSION['user_id'];

$input = json_decode(file_get_contents('php://input'), true);

if (!isset($input['room_id']) || !isset($input['question_id']) || !isset($input['vote_type'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing required fields']);
    exit;
}

$roomId = sanitizeRoomId($input['room_id']);
$questionId = $input['question_id'];
$voteType = $input['vote_type'];

if (!in_array($voteType, ['upvote', 'downvote'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid vote type']);
    exit;
}

$result = voteQuestion($roomId, $questionId, $voteType, $userId);

if ($result['success']) {
    echo json_encode($result);
} else {
    http_response_code(500);
    echo json_encode($result);
}

