<?php
/**
 * API endpoint for submitting questions
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

require_once 'room-manager.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);

if (!isset($input['room_id']) || !isset($input['question'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing required fields']);
    exit;
}

$roomId = sanitizeRoomId($input['room_id']);
$questionText = trim($input['question']);

if (empty($questionText)) {
    http_response_code(400);
    echo json_encode(['error' => 'Question cannot be empty']);
    exit;
}

$question = addQuestionToRoom($roomId, $questionText);

if ($question) {
    echo json_encode([
        'success' => true,
        'question' => $question
    ]);
} else {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to add question']);
}

