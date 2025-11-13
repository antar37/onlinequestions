<?php
/**
 * Cleanup script for expired rooms
 * Run this periodically (e.g., via cron job) to clean up expired rooms
 * 
 * Usage: php cleanup-rooms.php
 * Or via web: http://yoursite.com/cleanup-rooms.php
 */

require_once 'room-manager.php';

// Run cleanup
$result = cleanupExpiredRooms();

// Output results
if (php_sapi_name() === 'cli') {
    // Command line output
    echo "Room Cleanup Results:\n";
    echo "Checked: {$result['checked']} rooms\n";
    echo "Deleted: {$result['deleted']} expired rooms\n";
} else {
    // Web output
    header('Content-Type: application/json');
    echo json_encode([
        'success' => true,
        'checked' => $result['checked'],
        'deleted' => $result['deleted'],
        'message' => "Cleaned up {$result['deleted']} expired rooms out of {$result['checked']} checked"
    ]);
}

