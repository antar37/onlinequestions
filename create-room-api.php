<?php
/**
 * API endpoint for creating rooms
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

// Start session for admin authentication
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once 'room-manager.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);

if (!isset($input['room_name']) || empty(trim($input['room_name']))) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Room name is required']);
    exit;
}

$roomName = trim($input['room_name']);
$customRoomId = isset($input['room_id']) && !empty(trim($input['room_id'])) ? trim($input['room_id']) : null;
$password = isset($input['password']) && !empty(trim($input['password'])) ? trim($input['password']) : null;

$result = createRoom($roomName, $customRoomId, $password);

if (is_array($result) && isset($result['error'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => $result['error']]);
} elseif ($result) {
    $roomId = $result;
    
    // If password was provided, automatically authenticate creator as admin
    if ($password) {
        if (!isset($_SESSION['admin_rooms'])) {
            $_SESSION['admin_rooms'] = [];
        }
        $_SESSION['admin_rooms'][$roomId] = true;
    }
    
    echo json_encode([
        'success' => true,
        'room_id' => $roomId
    ]);
} else {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Failed to create room']);
}

