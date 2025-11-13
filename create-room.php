<?php
/**
 * Room creation and selection page
 */

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Load language system
require_once 'lang.php';

// Handle language switching
if (isset($_GET['lang']) && in_array($_GET['lang'], SUPPORTED_LANGS)) {
    setLang($_GET['lang']);
    header('Location: index.php');
    exit;
}

// Include room manager functions (defines ROOMS_DIR and ROOM_ID_LENGTH)
require_once 'room-manager.php';

// Handle room creation (via AJAX from modal)
// This will be handled by the API endpoint

// Handle room access
if (isset($_GET['access_room'])) {
    $roomId = sanitizeRoomId($_GET['access_room']);
    $roomData = getRoomData($roomId);
    
    if ($roomData) {
        header('Location: index.php?room=' . $roomId);
        exit;
    } else {
        // Check if it was expired or just not found
        $roomFile = ROOMS_DIR . $roomId . '.json';
        if (file_exists($roomFile)) {
            // File exists but getRoomData returned null, so it was expired
            $error = t('errors.room_expired');
        } else {
            $error = t('errors.room_not_found');
        }
    }
}

// Handle admin authentication
if (isset($_POST['admin_room_id']) && isset($_POST['admin_password'])) {
    $roomId = sanitizeRoomId($_POST['admin_room_id']);
    $password = $_POST['admin_password'];
    
    if (verifyRoomPassword($roomId, $password)) {
        if (!isset($_SESSION['admin_rooms'])) {
            $_SESSION['admin_rooms'] = [];
        }
        $_SESSION['admin_rooms'][$roomId] = true;
        header('Location: index.php?room=' . $roomId);
        exit;
    } else {
        $adminError = t('admin.invalid_password');
    }
}

$currentLang = getLang();
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang); ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo t('create_room.title'); ?></title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div class="container">
        <header>
            <div class="header-top">
                <div>
                    <h1><?php echo t('create_room.heading'); ?></h1>
                    <p class="subtitle"><?php echo t('create_room.subtitle'); ?></p>
                </div>
                <div class="language-switcher">
                    <select id="langSelect" class="lang-select">
                        <?php foreach (SUPPORTED_LANGS as $lang): ?>
                            <option value="<?php echo $lang; ?>" <?php echo $currentLang === $lang ? 'selected' : ''; ?>>
                                <?php echo strtoupper($lang); ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                </div>
            </div>
        </header>

        <div class="main-content">
            <?php if (isset($error)): ?>
                <div class="error-message"><?php echo htmlspecialchars($error); ?></div>
            <?php elseif (isset($_GET['error']) && $_GET['error'] === 'room_not_found'): ?>
                <div class="error-message"><?php echo t('errors.room_not_found'); ?></div>
            <?php elseif (isset($_GET['error']) && $_GET['error'] === 'room_expired'): ?>
                <div class="error-message"><?php echo t('errors.room_expired'); ?></div>
            <?php endif; ?>

            <div class="room-actions">
                <div class="action-card main-action">
                    <h2><?php echo t('create_room.access_existing_room'); ?></h2>
                    <form method="GET" action="" id="accessRoomForm">
                        <input 
                            type="text" 
                            name="access_room" 
                            placeholder="<?php echo t('create_room.access_room_placeholder'); ?>" 
                            required
                            maxlength="50"
                            class="input-field"
                            id="accessRoomInput"
                        >
                        <button type="submit" class="btn btn-primary"><?php echo t('create_room.go_to_room'); ?></button>
                    </form>
                    <p class="create-room-link">
                        <a href="#" id="createRoomLink"><?php echo t('create_room.create_new_room_link'); ?></a>
                    </p>
                    <p class="create-room-link">
                        <a href="#" id="adminLoginLink"><?php echo t('admin.enter_password'); ?></a>
                    </p>
                </div>
            </div>

            <!-- Admin Login Modal -->
            <div class="modal-overlay" id="adminLoginModal" aria-hidden="true">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2><?php echo t('admin.enter_password'); ?></h2>
                        <button class="modal-close" id="adminLoginModalClose" aria-label="<?php echo t('common.close'); ?>">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </button>
                    </div>
                    <form method="POST" action="" id="adminLoginForm">
                        <?php if (isset($adminError)): ?>
                            <div class="error-message"><?php echo htmlspecialchars($adminError); ?></div>
                        <?php endif; ?>
                        <input 
                            type="text" 
                            name="admin_room_id" 
                            id="adminRoomId"
                            placeholder="<?php echo t('create_room.access_room_placeholder'); ?>" 
                            required
                            maxlength="50"
                            class="input-field"
                        >
                        <input 
                            type="password" 
                            name="admin_password" 
                            id="adminPassword"
                            placeholder="<?php echo t('admin.password_placeholder'); ?>" 
                            required
                            class="input-field"
                        >
                        <div class="modal-actions">
                            <button type="button" class="btn btn-secondary" id="adminLoginCancel"><?php echo t('common.cancel'); ?></button>
                            <button type="submit" class="btn btn-primary"><?php echo t('admin.authenticate'); ?></button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- Create Room Modal -->
            <div class="modal-overlay" id="createRoomModal" aria-hidden="true">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2><?php echo t('create_room.create_new_room'); ?></h2>
                        <button class="modal-close" id="createRoomModalClose" aria-label="<?php echo t('common.close'); ?>">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </button>
                    </div>
                    <form id="createRoomForm">
                        <input 
                            type="text" 
                            id="createRoomName" 
                            placeholder="<?php echo t('create_room.room_name_placeholder'); ?>" 
                            required
                            maxlength="100"
                            class="input-field"
                        >
                        <input 
                            type="text" 
                            id="createRoomId" 
                            placeholder="<?php echo t('create_room.room_id_placeholder'); ?>" 
                            maxlength="50"
                            pattern="[a-zA-Z0-9-]+"
                            class="input-field"
                            title="<?php echo t('create_room.room_id_title'); ?>"
                        >
                        <input 
                            type="password" 
                            id="createRoomPassword" 
                            placeholder="<?php echo t('create_room.password_placeholder'); ?>" 
                            class="input-field"
                        >
                        <small>
                            <?php echo t('create_room.password_hint'); ?>
                        </small>
                        <small>
                            <?php echo t('create_room.room_id_hint'); ?>
                        </small>
                        <div class="modal-actions">
                            <button type="button" class="btn btn-secondary" id="createRoomCancel"><?php echo t('common.cancel'); ?></button>
                            <button type="submit" class="btn btn-primary"><?php echo t('create_room.create_room_button'); ?></button>
                        </div>
                    </form>
                </div>
            </div>

            <div class="info-section">
                <h3><?php echo t('create_room.how_it_works'); ?></h3>
                <ul>
                    <li><?php echo t('create_room.how_it_works_1'); ?></li>
                    <li><?php echo t('create_room.how_it_works_2'); ?></li>
                    <li><?php echo t('create_room.how_it_works_3'); ?></li>
                    <li><?php echo t('create_room.how_it_works_4'); ?></li>
                </ul>
            </div>
        </div>
    </div>
    
    <script type="application/json" id="page-data">
        <?php echo json_encode([
            'current_lang' => $currentLang,
            'translations' => $translations
        ]); ?>
    </script>
    <script src="app.js"></script>
</body>
</html>

