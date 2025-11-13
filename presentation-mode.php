<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang); ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo htmlspecialchars($roomName); ?> - <?php echo t('presentation.title'); ?></title>
    <link rel="stylesheet" href="styles.css">
</head>
<body class="presentation-mode">
    <div class="presentation-container">
        <?php if ($selectedQuestion): ?>
            <button class="presentation-nav-btn presentation-nav-prev" id="prevBtn" <?php echo $prevQuestionId ? '' : 'disabled'; ?> aria-label="<?php echo t('presentation.previous_question'); ?>">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
            
            <div class="presentation-content">
                <div class="presentation-question">
                    <?php if (isset($selectedQuestion['answered']) && $selectedQuestion['answered']): ?>
                        <div class="presentation-answered-badge"><?php echo t('admin.answered'); ?></div>
                    <?php endif; ?>
                    <div class="presentation-question-text"><?php echo htmlspecialchars($selectedQuestion['text']); ?></div>
                    <div class="presentation-question-meta">
                        <span class="presentation-vote-count"><?php echo isset($selectedQuestion['votes']) ? $selectedQuestion['votes'] : 0; ?> <?php echo t('presentation.votes'); ?></span>
                        <span class="presentation-question-counter"><?php echo ($currentIndex + 1); ?> / <?php echo count($questions); ?></span>
                    </div>
                </div>
            </div>
            
            <button class="presentation-nav-btn presentation-nav-next" id="nextBtn" <?php echo $nextQuestionId ? '' : 'disabled'; ?> aria-label="<?php echo t('presentation.next_question'); ?>">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
            
            <button class="presentation-exit-btn" id="exitBtn" aria-label="<?php echo t('presentation.exit'); ?>" title="<?php echo t('presentation.exit'); ?>">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
        <?php else: ?>
            <div class="presentation-empty">
                <h2><?php echo t('presentation.no_questions'); ?></h2>
                <p><?php echo t('presentation.no_questions_desc'); ?></p>
                <a href="index.php?room=<?php echo urlencode($roomId); ?>" class="btn btn-primary"><?php echo t('presentation.back_to_room'); ?></a>
            </div>
        <?php endif; ?>
    </div>

    <script type="application/json" id="presentation-data">
        <?php echo json_encode([
            'room_id' => $roomId,
            'current_question_id' => $selectedQuestion ? $selectedQuestion['id'] : null,
            'prev_question_id' => $prevQuestionId,
            'next_question_id' => $nextQuestionId,
            'current_index' => $currentIndex,
            'total_questions' => count($questions)
        ]); ?>
    </script>
    <script src="app.js"></script>
</body>
</html>

