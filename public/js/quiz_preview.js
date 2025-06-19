// Standalone Quiz Preview JavaScript - Updated with i18n support
let questions = [];
let currentPreviewQuestion = 0;
let previewTimer = null;
let timeRemaining = 0;
let isTimerActive = false;
let selectedAnswer = null;

const DEFAULT_ANSWER_TIME = 30;

// Get translations from global object
const t = window.translations || {};

document.addEventListener('DOMContentLoaded', function() {
    initializePreview();
    setupColorObserver();
});

// =================== INITIALIZATION ===================

function initializePreview() {
    // Load quiz data from hidden script tag
    const quizDataElement = document.getElementById('quiz-data');
    if (quizDataElement) {
        try {
            const quizData = JSON.parse(quizDataElement.textContent);
            questions = quizData.questions || [];
            
            if (questions.length === 0) {
                showNoQuestionsMessage();
                return;
            }
            
            // Initialize preview
            currentPreviewQuestion = 0;
            selectedAnswer = null;
            
            // Display first question
            displayCurrentQuestion();
            updateButtonStates();
        } catch (error) {
            console.error('Error parsing quiz data:', error);
            showErrorMessage();
        }
    } else {
        console.error('Quiz data not found');
        showErrorMessage();
    }
}

// =================== QUESTION DISPLAY ===================

function displayCurrentQuestion() {
    if (currentPreviewQuestion >= questions.length) {
        finishQuiz();
        return;
    }
    
    const question = questions[currentPreviewQuestion];
    const container = document.getElementById('previewQuestionContainer');
    
    // Reset selected answer for new question
    selectedAnswer = null;
    
    // Build question HTML
    let questionHTML = `
        <div class="question-display-container">
            <div class="preview-question-header">
                <div class="preview-question-number">${currentPreviewQuestion + 1}</div>
                <div class="preview-question-content">
                    <h5 class="preview-question-title">${question.content || t.noQuestionsAvailable || 'Untitled Question'}</h5>
                </div>
            </div>
    `;
    
    // Add image if exists
    if (question.image) {
        questionHTML += `
            <div class="preview-question-image">
                <img src="${question.image}" alt="Question Image">
            </div>
        `;
    }
    
    // Add answer options with color classes
    questionHTML += '<div class="preview-options">';
    question.options.forEach(option => {
        if (option.text && option.text.trim()) {
            const colorClass = `letter-${option.letter.toLowerCase()}`;
            questionHTML += `
                <div class="preview-option" 
                     data-letter="${option.letter}" 
                     data-correct="${question.correctAnswer === option.letter ? 'true' : 'false'}"
                     onclick="selectPreviewOption(this, '${option.letter}')">
                    <div class="preview-option-content">
                        <div class="preview-option-letter ${colorClass}">${option.letter}</div>
                        <div class="preview-option-text">${option.text}</div>
                        <div class="preview-option-status"></div>
                    </div>
                </div>
            `;
        }
    });
    questionHTML += '</div></div>';
    
    container.innerHTML = questionHTML;
    
    // Apply color classes after DOM insertion
    setTimeout(() => {
        applyOptionColors();
    }, 100);
    
    // Start timer for this question
    startQuestionTimer(question.answerTime || DEFAULT_ANSWER_TIME);
    
    // Update button states
    updateButtonStates();
}

// =================== OPTION SELECTION ===================

function selectPreviewOption(element, letter) {
    if (!isTimerActive) return; // Can't select after time is up
    
    // Store selected answer
    selectedAnswer = letter;
    
    // Remove previous selection
    const parent = element.closest('.preview-options');
    if (parent) {
        parent.querySelectorAll('.preview-option').forEach(opt => {
            opt.classList.remove('selected');
        });
        element.classList.add('selected');
    }
    
    console.log('Selected option:', letter, 'for question', currentPreviewQuestion + 1);
}

// =================== TIMER MANAGEMENT ===================

function startQuestionTimer(seconds) {
    timeRemaining = seconds;
    isTimerActive = true;
    
    // Disable navigation buttons during timer
    updateButtonStates();
    
    updateTimerDisplay();
    
    previewTimer = setInterval(() => {
        timeRemaining--;
        updateTimerDisplay();
        
        if (timeRemaining <= 0) {
            stopTimer();
            onTimeUp();
        }
    }, 1000);
}

function stopTimer() {
    if (previewTimer) {
        clearInterval(previewTimer);
        previewTimer = null;
    }
    isTimerActive = false;
    
    // Enable navigation buttons after timer
    updateButtonStates();
}

function updateTimerDisplay() {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    
    document.getElementById('timerMinutes').textContent = minutes.toString().padStart(2, '0');
    document.getElementById('timerSeconds').textContent = seconds.toString().padStart(2, '0');
    
    // Update timer circle color based on time remaining
    const timerCircle = document.querySelector('.quiz-timer-compact .timer-circle');
    if (!timerCircle) return;
    
    const totalTime = questions[currentPreviewQuestion]?.answerTime || DEFAULT_ANSWER_TIME;
    const percentageLeft = (timeRemaining / totalTime) * 100;
    
    timerCircle.classList.remove('warning', 'danger');
    
    if (percentageLeft <= 10) {
        timerCircle.classList.add('danger');
    } else if (percentageLeft <= 30) {
        timerCircle.classList.add('warning');
    }
}

// =================== BUTTON STATE MANAGEMENT ===================

function updateButtonStates() {
    const nextBtn = document.getElementById('nextBtn');
    const finishBtn = document.getElementById('finishBtn');
    const rankingBtn = document.getElementById('rankingBtn');
    
    // Always show buttons but control their enabled/disabled state
    if (nextBtn) {
        nextBtn.style.display = 'inline-block';
        // Enable Next button only when timer is not active and not on last question
        nextBtn.disabled = isTimerActive || (currentPreviewQuestion >= questions.length - 1);
    }
    
    if (finishBtn) {
        finishBtn.style.display = 'inline-block';
        // Enable Finish button only when timer is not active and on last question
        finishBtn.disabled = isTimerActive || (currentPreviewQuestion < questions.length - 1);
    }
    
    // Ranking button is always enabled
    if (rankingBtn) {
        rankingBtn.disabled = false;
    }
}

// =================== TIME UP HANDLING ===================

function onTimeUp() {
    const currentQuestion = questions[currentPreviewQuestion];
    const correctAnswer = currentQuestion.correctAnswer;
    
    // Find all options in current question
    const options = document.querySelectorAll('.preview-option');
    
    options.forEach(option => {
        const optionLetter = option.getAttribute('data-letter');
        const isCorrect = option.getAttribute('data-correct') === 'true';
        const statusElement = option.querySelector('.preview-option-status');
        
        if (isCorrect) {
            // Mark correct answer
            option.classList.add('correct');
            statusElement.innerHTML = '<i class="fas fa-check-circle text-success"></i>';
        } else if (selectedAnswer === optionLetter) {
            // Mark user's wrong selection
            option.classList.add('wrong');
            statusElement.innerHTML = '<i class="fas fa-times-circle text-danger"></i>';
        }
    });
    
    // Disable option selection
    options.forEach(option => {
        option.style.pointerEvents = 'none';
        option.style.opacity = '0.8';
    });
}

// =================== NAVIGATION ===================

function nextQuestion() {
    if (currentPreviewQuestion < questions.length - 1 && !isTimerActive) {
        currentPreviewQuestion++;
        selectedAnswer = null; // Reset for next question
        displayCurrentQuestion();
        console.log('Moved to question', currentPreviewQuestion + 1);
    }
}

// =================== QUIZ COMPLETION ===================

function finishQuiz() {
    if (isTimerActive) return; // Can't finish during timer
    
    stopTimer();
    
    // Show completion message with options - using translations
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            title: t.previewComplete || 'Quiz Preview Complete!',
            text: (t.reviewedAllQuestions || "You've reviewed all {{count}} questions.").replace('{{count}}', questions.length),
            icon: 'success',
            showCancelButton: true,
            confirmButtonText: t.restartPreview || 'Restart Preview',
            cancelButtonText: t.exitPreview || 'Exit Preview',
            confirmButtonColor: '#667eea',
            cancelButtonColor: '#64748b'
        }).then((result) => {
            if (result.isConfirmed) {
                restartPreview();
            } else {
                // Could redirect back to dashboard or stay on page
                window.history.back();
            }
        });
    } else {
        // Fallback if SweetAlert is not available - using translations
        const message = (t.reviewedAllQuestions || "You've reviewed all {{count}} questions.").replace('{{count}}', questions.length);
        const confirmText = (t.previewComplete || 'Quiz preview complete!') + '\n\n' + message + '\n\n' + (t.restartPreview || 'Would you like to restart the preview?');
        const restart = confirm(confirmText);
        if (restart) {
            restartPreview();
        } else {
            window.history.back();
        }
    }
    
    console.log('Quiz preview finished');
}

function restartPreview() {
    currentPreviewQuestion = 0;
    selectedAnswer = null;
    stopTimer();
    displayCurrentQuestion();
}

// =================== RANKING FUNCTION ===================

function showRanking() {
    // Placeholder for ranking functionality - using translations
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            title: t.rankingTitle || 'Ranking',
            text: t.rankingFeatureText || 'Ranking feature will be implemented here.',
            icon: 'info',
            confirmButtonText: t.ok || 'OK',
            confirmButtonColor: '#667eea'
        });
    } else {
        alert(t.rankingFeatureText || 'Ranking feature will be implemented here.');
    }
    
    console.log('Show ranking clicked');
}

// =================== COLOR MANAGEMENT ===================

function applyOptionColors() {
    // Apply colors to preview option letters
    document.querySelectorAll('.preview-option-letter').forEach(element => {
        const letter = element.textContent.trim();
        const colorClass = `letter-${letter.toLowerCase()}`;
        element.classList.add(colorClass);
    });
    
    // Apply colors to option indicators (fallback)
    document.querySelectorAll('.option-indicator').forEach(element => {
        const letter = element.textContent.trim();
        const colorClass = `letter-${letter.toLowerCase()}`;
        element.classList.add(colorClass);
    });
}

function setupColorObserver() {
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(node) {
                if (node.nodeType === 1) { // Element node
                    // Apply colors to any new option letters
                    const optionLetters = node.querySelectorAll('.preview-option-letter, .option-indicator');
                    optionLetters.forEach(element => {
                        const letter = element.textContent.trim();
                        if (letter && letter.length === 1) {
                            const colorClass = `letter-${letter.toLowerCase()}`;
                            element.classList.add(colorClass);
                        }
                    });
                }
            });
        });
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// =================== ERROR HANDLING ===================

function showNoQuestionsMessage() {
    const container = document.getElementById('previewQuestionContainer');
    container.innerHTML = `
        <div class="question-display-container">
            <div class="text-center py-5">
                <i class="fas fa-question-circle fa-3x text-muted mb-3"></i>
                <h5 class="text-muted">${t.noQuestionsAvailable || 'No Questions Available'}</h5>
                <p class="text-muted">${t.noQuestionsPreview || "This quiz doesn't have any questions to preview."}</p>
                <a href="/quizzes" class="btn btn-primary">
                    <i class="fas fa-arrow-left me-2"></i>${t.backToDashboard || 'Back to Dashboard'}
                </a>
            </div>
        </div>
    `;

    // Hide timer
    const timerElement = document.querySelector('.quiz-timer-compact');
    if (timerElement) timerElement.style.display = 'none';
    
    // Disable all buttons
    const buttons = document.querySelectorAll('#nextBtn, #finishBtn, #rankingBtn');
    buttons.forEach(btn => {
        if (btn) btn.disabled = true;
    });
}

function showErrorMessage() {
    const container = document.getElementById('previewQuestionContainer');
    container.innerHTML = `
        <div class="question-display-container">
            <div class="text-center py-5">
                <i class="fas fa-exclamation-triangle fa-3x text-warning mb-3"></i>
                <h5 class="text-warning">${t.errorLoadingQuiz || 'Error Loading Quiz'}</h5>
                <p class="text-muted">${t.errorLoadingQuizDesc || 'There was an error loading the quiz data.'}</p>
                <button onclick="location.reload()" class="btn btn-primary me-2">
                    <i class="fas fa-refresh me-2"></i>${t.retry || 'Retry'}
                </button>
                <a href="/quizzes" class="btn btn-secondary">
                    <i class="fas fa-arrow-left me-2"></i>${t.backToDashboard || 'Back to Dashboard'}
                </a>
            </div>
        </div>
    `;
    
    // Hide timer
    const timerElement = document.querySelector('.quiz-timer-compact');
    if (timerElement) timerElement.style.display = 'none';
    
    // Disable all buttons
    const buttons = document.querySelectorAll('#nextBtn, #finishBtn, #rankingBtn');
    buttons.forEach(btn => {
        if (btn) btn.disabled = true;
    });
}

// =================== GLOBAL FUNCTIONS ===================

// Make functions available globally
window.selectPreviewOption = selectPreviewOption;
window.nextQuestion = nextQuestion;
window.finishQuiz = finishQuiz;
window.restartPreview = restartPreview;
window.showRanking = showRanking;