<?php
/**
 * Language Manager
 * Handles loading and managing translations
 */

// Load configuration
require_once __DIR__ . '/config.php';

define('LANG_DIR', __DIR__ . '/languages/');

// Get current language from session, cookie, or default
function getCurrentLang() {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    
    // Check if language is set in session
    if (isset($_SESSION['lang']) && in_array($_SESSION['lang'], SUPPORTED_LANGS)) {
        return $_SESSION['lang'];
    }
    
    // Check if language is set in cookie
    if (isset($_COOKIE['lang']) && in_array($_COOKIE['lang'], SUPPORTED_LANGS)) {
        $_SESSION['lang'] = $_COOKIE['lang'];
        return $_COOKIE['lang'];
    }
    
    // Check browser language
    if (isset($_SERVER['HTTP_ACCEPT_LANGUAGE'])) {
        $browserLang = substr($_SERVER['HTTP_ACCEPT_LANGUAGE'], 0, 2);
        if (in_array($browserLang, SUPPORTED_LANGS)) {
            $_SESSION['lang'] = $browserLang;
            setcookie('lang', $browserLang, time() + (365 * 24 * 60 * 60), '/');
            return $browserLang;
        }
    }
    
    // Default to English
    return DEFAULT_LANG;
}

// Set language
function setLang($lang) {
    if (!in_array($lang, SUPPORTED_LANGS)) {
        return false;
    }
    
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    
    $_SESSION['lang'] = $lang;
    setcookie('lang', $lang, time() + (365 * 24 * 60 * 60), '/');
    return true;
}

// Load language file
$currentLang = getCurrentLang();
$langFile = LANG_DIR . $currentLang . '.json';

if (!file_exists($langFile)) {
    $langFile = LANG_DIR . DEFAULT_LANG . '.json';
}

$translations = [];
if (file_exists($langFile)) {
    $translations = json_decode(file_get_contents($langFile), true);
    if (!$translations) {
        $translations = [];
    }
}

// Translation function
function t($key, $replacements = []) {
    global $translations;
    
    $keys = explode('.', $key);
    $value = $translations;
    
    foreach ($keys as $k) {
        if (isset($value[$k])) {
            $value = $value[$k];
        } else {
            return $key; // Return key if translation not found
        }
    }
    
    // Replace placeholders
    if (!empty($replacements)) {
        foreach ($replacements as $placeholder => $replacement) {
            $value = str_replace('{' . $placeholder . '}', $replacement, $value);
        }
    }
    
    return $value;
}

// Get current language code
function getLang() {
    return getCurrentLang();
}

// Get all supported languages
function getSupportedLangs() {
    return SUPPORTED_LANGS;
}

// Get language name
function getLangName($langCode = null) {
    global $translations;
    
    if ($langCode === null) {
        $langCode = getCurrentLang();
    }
    
    $langFile = LANG_DIR . $langCode . '.json';
    if (file_exists($langFile)) {
        $langData = json_decode(file_get_contents($langFile), true);
        if (isset($langData['meta']['name'])) {
            return $langData['meta']['name'];
        }
    }
    
    return strtoupper($langCode);
}

