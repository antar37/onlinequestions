<?php
/**
 * Application Configuration
 * 
 * This file contains all configurable settings for the application.
 * Modify these values to customize the application behavior.
 */

// Default Language
// Options: 'en' (English), 'es' (Spanish)
// This will be used when no language preference is detected from the user
define('DEFAULT_LANG', 'en');

// Supported Languages
// List of language codes that are available in the application
// Make sure corresponding language files exist in the languages/ directory
define('SUPPORTED_LANGS', ['en', 'es']);

// Room Configuration
// Minimum and maximum length for custom room IDs
define('ROOM_ID_MIN_LENGTH', 3);
define('ROOM_ID_MAX_LENGTH', 50);

// Room Expiration
// Rooms will expire after this many seconds (6 months = 15552000 seconds)
define('ROOM_EXPIRATION_SECONDS', 15552000);

// Events Directory
// Directory where event logs are stored
define('EVENTS_DIR', __DIR__ . '/events/');

