<?php
/**
 * API endpoint for admin actions
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

require_once 'room-manager.php';
require_once 'admin-auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);

if (!isset($input['room_id']) || !isset($input['action'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing required fields']);
    exit;
}

$roomId = sanitizeRoomId($input['room_id']);
$action = $input['action'];

// Verify existing admin session/remember cookie, or a password included in the request.
// This keeps admin actions working after page reloads without storing the raw password
// in browser storage.
if (!requireAdminAccessFromInput($roomId, $input)) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Admin authentication required']);
    exit;
}

// Handle different actions
switch ($action) {
    case 'delete_question':
        if (!isset($input['question_id'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Missing question_id']);
            exit;
        }
        $result = deleteQuestion($roomId, $input['question_id']);
        break;
        
    case 'mark_answered':
        if (!isset($input['question_id'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Missing question_id']);
            exit;
        }
        $answered = isset($input['answered']) ? (bool)$input['answered'] : true;
        $result = markQuestionAnswered($roomId, $input['question_id'], $answered);
        break;
        
    case 'set_color':
        if (!isset($input['question_id']) || !isset($input['color'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Missing question_id or color']);
            exit;
        }
        $result = setQuestionColor($roomId, $input['question_id'], $input['color']);
        break;
        
    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid action']);
        exit;
}

if ($result['success']) {
    echo json_encode($result);
} else {
    http_response_code(500);
    echo json_encode($result);
}

