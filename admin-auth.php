<?php
/**
 * Shared admin authentication helpers.
 *
 * Admin access is granted per room. A successful password check stores a PHP
 * session flag and, when requested, a 30-day HttpOnly remember token. Tokens are
 * stored hashed inside the room JSON file so raw tokens never persist server-side.
 */

require_once 'room-manager.php';

if (!defined('ADMIN_REMEMBER_SECONDS')) {
    define('ADMIN_REMEMBER_SECONDS', 60 * 60 * 24 * 30);
}

function ensureAdminSessionStarted() {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
}

function adminCookieName($roomId) {
    return 'oq_admin_' . substr(hash('sha256', $roomId), 0, 24);
}

function setAdminCookie($roomId, $token, $expires) {
    $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    setcookie(adminCookieName($roomId), $token, [
        'expires' => $expires,
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax'
    ]);
}

function clearAdminCookie($roomId) {
    $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    setcookie(adminCookieName($roomId), '', [
        'expires' => time() - 3600,
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax'
    ]);
}

function markAdminSession($roomId) {
    ensureAdminSessionStarted();
    if (!isset($_SESSION['admin_rooms']) || !is_array($_SESSION['admin_rooms'])) {
        $_SESSION['admin_rooms'] = [];
    }
    $_SESSION['admin_rooms'][$roomId] = true;
}

function hasAdminSession($roomId) {
    ensureAdminSessionStarted();
    return isset($_SESSION['admin_rooms'][$roomId]) && $_SESSION['admin_rooms'][$roomId] === true;
}

function saveRoomDataForAdminAuth($roomId, $roomData) {
    $roomFile = ROOMS_DIR . $roomId . '.json';
    if (!file_exists($roomFile)) {
        return false;
    }
    return file_put_contents($roomFile, json_encode($roomData, JSON_PRETTY_PRINT)) !== false;
}

function grantAdminAccess($roomId, $remember = true) {
    markAdminSession($roomId);

    if (!$remember) {
        return true;
    }

    $roomData = getRoomData($roomId);
    if (!$roomData) {
        return false;
    }

    $token = bin2hex(random_bytes(32));
    $expires = time() + ADMIN_REMEMBER_SECONDS;
    $tokenRecord = [
        'hash' => hash('sha256', $token),
        'expires' => $expires,
        'created' => time(),
        'last_used' => time(),
    ];

    $tokens = isset($roomData['admin_tokens']) && is_array($roomData['admin_tokens'])
        ? $roomData['admin_tokens']
        : [];

    // Drop expired tokens and cap the list so room files cannot grow forever.
    $tokens = array_values(array_filter($tokens, function($record) {
        return isset($record['hash'], $record['expires']) && $record['expires'] > time();
    }));
    $tokens[] = $tokenRecord;
    if (count($tokens) > 20) {
        $tokens = array_slice($tokens, -20);
    }

    $roomData['admin_tokens'] = $tokens;
    if (!saveRoomDataForAdminAuth($roomId, $roomData)) {
        return false;
    }

    setAdminCookie($roomId, $token, $expires);
    return true;
}

function hasValidAdminRememberToken($roomId) {
    $cookieName = adminCookieName($roomId);
    if (empty($_COOKIE[$cookieName])) {
        return false;
    }

    $token = $_COOKIE[$cookieName];
    if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/', $token)) {
        clearAdminCookie($roomId);
        return false;
    }

    $roomData = getRoomData($roomId);
    if (!$roomData || empty($roomData['admin_tokens']) || !is_array($roomData['admin_tokens'])) {
        clearAdminCookie($roomId);
        return false;
    }

    $tokenHash = hash('sha256', $token);
    $tokens = [];
    $matched = false;
    $now = time();

    foreach ($roomData['admin_tokens'] as $record) {
        if (!isset($record['hash'], $record['expires']) || $record['expires'] <= $now) {
            continue;
        }

        if (hash_equals($record['hash'], $tokenHash)) {
            $record['last_used'] = $now;
            $matched = true;
        }
        $tokens[] = $record;
    }

    if (count($tokens) !== count($roomData['admin_tokens'])) {
        $roomData['admin_tokens'] = $tokens;
        saveRoomDataForAdminAuth($roomId, $roomData);
    } elseif ($matched) {
        $roomData['admin_tokens'] = $tokens;
        saveRoomDataForAdminAuth($roomId, $roomData);
    }

    if (!$matched) {
        clearAdminCookie($roomId);
        return false;
    }

    markAdminSession($roomId);
    return true;
}

function isAdminAuthenticated($roomId) {
    if (hasAdminSession($roomId)) {
        return true;
    }

    return hasValidAdminRememberToken($roomId);
}

function authenticateAdminPassword($roomId, $password, $remember = true) {
    if (!verifyRoomPassword($roomId, $password)) {
        return false;
    }

    return grantAdminAccess($roomId, $remember);
}

function requireAdminAccessFromInput($roomId, $input) {
    if (isAdminAuthenticated($roomId)) {
        return true;
    }

    if (isset($input['password']) && is_string($input['password'])) {
        $remember = !isset($input['remember']) || (bool)$input['remember'];
        return authenticateAdminPassword($roomId, $input['password'], $remember);
    }

    return false;
}
