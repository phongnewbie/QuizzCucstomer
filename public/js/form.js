// Unified Quiz Form JavaScript for Create & Edit (With i18n Support) - UPDATED WITH ANSWER REVEAL
let questions = [];
let questionCount = 0;
let autoSaveTimer;
let hasUnsavedChanges = false;
let isEditMode = false;
let quizId = null;

// Preview variables
let currentPreviewQuestion = 0;
let previewTimer = null;
let timeRemaining = 0;
let isTimerActive = false;
let selectedAnswer = null; // Track user's selected answer

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;
const DEFAULT_ANSWER_TIME = 30;

// Get translations from global object
const t = window.translations || {};

document.addEventListener('DOMContentLoaded', function() {
    setupColorObserver();
    initializeQuizForm();
});

// =================== INITIALIZATION ===================

function initializeQuizForm() {
    // Get configuration from global variable
    const config = window.quizFormConfig;
    isEditMode = config.isEdit;
    quizId = config.quizId;
    
    if (isEditMode && config.initialData) {
        loadInitialData(config.initialData);
    } else {
        // Create mode - load draft if exists
        loadDraftIfExists();
    }
    
    setupEventListeners();
    setupAutoSave();
    updateQuizStatistics();
    
    // Apply initial color classes
    setTimeout(() => {
        applyOptionColors();
    }, 100);
}

function loadInitialData(data) {
    // Load quiz info (removed language)
    document.getElementById('quizTitle').value = data.title || '';
    document.getElementById('quizMode').value = data.mode || 'online';
    
    if (data.scheduleSettings) {
        const startTime = data.scheduleSettings.startTime;
        const endTime = data.scheduleSettings.endTime;
        if (startTime) document.getElementById('startTime').value = new Date(startTime).toISOString().slice(0, 16);
        if (endTime) document.getElementById('endTime').value = new Date(endTime).toISOString().slice(0, 16);
    }
    
    // toggleScheduleSettings();
    
    // Load questions
    questions = data.questions.map((q, index) => ({
        id: index + 1,
        content: q.content || '',
        answerTime: q.answerTime || DEFAULT_ANSWER_TIME,
        options: q.options || [
            { letter: 'A', text: '' },
            { letter: 'B', text: '' }
        ],
        correctAnswer: q.correctAnswer || 'A',
        image: q.image ? {
            preview: q.image,
            file: null
        } : null
    }));
    
    questionCount = questions.length;
    renderAllQuestions();
    updateQuizStatistics();
}

function setupEventListeners() {
    // Quiz info changes (removed quizLanguage)
    ['quizTitle', 'quizMode', 'startTime', 'endTime'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', () => {
                triggerAutoSave();
                updateQuizStatistics();
            });
            element.addEventListener('change', () => {
                triggerAutoSave();
                updateQuizStatistics();
            });
        }
    });
}

// =================== QUESTION MANAGEMENT ===================

function addQuestion() {
    questionCount++;
    const newQuestion = {
        id: questionCount,
        content: '',
        answerTime: DEFAULT_ANSWER_TIME,
        options: [
            { letter: 'A', text: '' },
            { letter: 'B', text: '' }
        ],
        correctAnswer: 'A',
        image: null
    };
    
    questions.push(newQuestion);
    renderQuestion(newQuestion);
    updateQuizStatistics();
    triggerAutoSave();
    
    // Scroll to new question
    setTimeout(() => {
        const element = document.getElementById(`question-${questionCount}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 100);
}

function renderQuestion(question) {
    const container = document.getElementById('questionsContainer');
    const questionHtml = createQuestionHtml(question);
    
    // Remove add button temporarily
    const addBtn = container.querySelector('.add-question-btn');
    if (addBtn) {
        addBtn.remove();
    }
    
    container.insertAdjacentHTML('beforeend', questionHtml);
    
    // Apply color classes after DOM insertion
    setTimeout(() => {
        populateQuestionData(question);
        applyOptionColors();
    }, 0);
}

function renderAllQuestions() {
    const container = document.getElementById('questionsContainer');
    container.innerHTML = '';
    
    questions.forEach(question => {
        renderQuestion(question);
    });
}

function createQuestionHtml(question) {
    const optionsHtml = createOptionsHtml(question);
    
    return `
        <div class="question-card-modern animate-slide-up" id="question-${question.id}">
            <div class="question-header">
                <div class="d-flex align-items-center flex-grow-1">
                    <div class="question-number">${question.id}</div>
                    <h5 class="mb-0">${t.question || 'Question'} ${question.id}</h5>
                </div>
                
                <div class="question-actions">
                    <button class="action-btn" onclick="moveQuestion(${question.id}, 'up')" title="${t.moveUp || 'Move Up'}" type="button">
                        <i class="fas fa-arrow-up"></i>
                    </button>
                    <button class="action-btn" onclick="moveQuestion(${question.id}, 'down')" title="${t.moveDown || 'Move Down'}" type="button">
                        <i class="fas fa-arrow-down"></i>
                    </button>
                    <button class="action-btn" onclick="duplicateQuestion(${question.id})" title="${t.duplicate || 'Duplicate'}" type="button">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button class="action-btn danger" onclick="deleteQuestion(${question.id})" title="${t.delete || 'Delete'}" type="button">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            
            <div class="card-body-modern">
                <div class="row">
                    <div class="col-lg-8">
                        <div class="form-floating-modern">
                            <textarea class="form-control-modern" 
                                      id="question-${question.id}-content" 
                                      placeholder=" " 
                                      rows="3" 
                                      oninput="updateQuestion(${question.id}, 'content', this.value)">${question.content}</textarea>
                            <label class="form-label-modern">${t.questionContent || 'Question Content'}</label>
                        </div>
                        
                        <div class="form-floating-modern">
                            <input type="number" 
                                   class="form-control-modern" 
                                   id="question-${question.id}-time"
                                   placeholder=" "
                                   min="5" max="300" 
                                   value="${question.answerTime}"
                                   oninput="updateQuestion(${question.id}, 'answerTime', parseInt(this.value))">
                            <label class="form-label-modern">
                                <i class="fas fa-clock me-1"></i>${t.answerTime || 'Answer Time (seconds)'}
                            </label>
                        </div>
                    </div>
                    
                    <div class="col-lg-4">
                        <div class="image-upload-zone ${question.image ? 'has-image' : ''}" 
                             onclick="document.getElementById('image-${question.id}').click()">
                            <input type="file" 
                                   id="image-${question.id}" 
                                   accept="image/*" 
                                   style="display: none;" 
                                   onchange="handleImageUpload(${question.id}, this)">
                            ${question.image ? 
                                `<img src="${question.image.preview}" alt="Question Image" 
                                     style="max-width: 100%; max-height: 200px; border-radius: 8px;">
                                 <div class="mt-2">
                                     <button class="btn btn-sm btn-outline-danger" 
                                             onclick="removeImage(${question.id}, event)" type="button">
                                         <i class="fas fa-trash me-1"></i> ${t.remove || 'Remove'}
                                     </button>
                                 </div>` :
                                `<div class="upload-content">
                                     <div class="upload-icon">
                                         <i class="fas fa-cloud-upload-alt"></i>
                                     </div>
                                     <h6>${t.uploadImage || 'Upload Image'}</h6>
                                     <p class="text-muted small mb-0">${t.clickSelectImage || 'Click to select image'}</p>
                                 </div>`
                            }
                        </div>
                    </div>
                </div>
                
                <div class="answer-options">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h6 class="text-primary mb-0">${t.answerOptions || 'Answer Options'}</h6>
                        <div class="option-controls">
                            ${question.options.length > MIN_OPTIONS ? 
                                `<button class="btn btn-sm btn-outline-danger" 
                                onclick="removeLastOption(${question.id})" type="button">
                                <i class="fas fa-minus me-1"></i>${t.removeOption || 'Remove Option'}
                                </button>` :
                                `<button class="btn btn-sm btn-outline-danger" 
                                onclick="removeLastOption(${question.id})" type="button" disabled>
                                <i class="fas fa-minus me-1"></i>${t.removeOption || 'Remove Option'}
                                </button>`
                            }
                            ${question.options.length < MAX_OPTIONS ? 
                                `<button class="btn btn-sm btn-outline-primary me-2" 
                                        onclick="addOption(${question.id})" type="button">
                                    <i class="fas fa-plus me-1"></i>${t.addOption || 'Add Option'}
                                </button>` : 
                                `<button class="btn btn-sm btn-outline-primary me-2" 
                                        onclick="addOption(${question.id})" type="button" disabled>
                                    <i class="fas fa-plus me-1"></i>${t.addOption || 'Add Option'}
                                </button>`
                            }
                        </div>
                    </div>
                    <div id="options-${question.id}">
                        ${optionsHtml}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function createOptionsHtml(question) {
    return question.options.map((option, index) => {
        const colorClass = `letter-${option.letter.toLowerCase()}`;
        return `
        <div class="option-group" data-letter="${option.letter}">
            <div class="option-radio ${question.correctAnswer === option.letter ? 'checked' : ''}" 
                 id="radio-${question.id}-${option.letter}" 
                 onclick="selectCorrectAnswer(${question.id}, '${option.letter}')"></div>
            <div class="option-letter ${colorClass}">${option.letter}</div>
            <input type="text" 
                   class="form-control-modern flex-grow-1" 
                   placeholder="${t.enterOption || 'Enter option'} ${option.letter}" 
                   id="option-${question.id}-${option.letter}"
                   value="${option.text}"
                   oninput="updateQuestion(${question.id}, 'option${option.letter}', this.value)">
        </div>
    `;
    }).join('');
}

function populateQuestionData(question) {
    // Content
    const contentEl = document.getElementById(`question-${question.id}-content`);
    if (contentEl) contentEl.value = question.content;
    
    // Answer time
    const timeEl = document.getElementById(`question-${question.id}-time`);
    if (timeEl) timeEl.value = question.answerTime;
    
    // Options
    question.options.forEach(option => {
        const optionEl = document.getElementById(`option-${question.id}-${option.letter}`);
        if (optionEl) optionEl.value = option.text;
    });
    
    // Correct answer
    if (question.correctAnswer) {
        selectCorrectAnswer(question.id, question.correctAnswer);
    }
    
    // Restore image preview if available
    if (question.image && question.image.preview) {
        const uploadZone = document.querySelector(`#question-${question.id} .image-upload-zone`);
        if (uploadZone) {
            uploadZone.classList.add('has-image');
            uploadZone.innerHTML = `
                <input type="file"
                        id="image-${question.id}"
                        accept="image/*"
                        style="display: none;"
                        onchange="handleImageUpload(${question.id}, this)">
                <img src="${question.image.preview}" alt="Question Image" 
                        style="max-width: 100%; max-height: 200px; border-radius: 8px;">
                <div class="mt-2">
                    <button class="btn btn-sm btn-outline-danger" 
                            onclick="removeImage(${question.id}, event)" type="button">
                        <i class="fas fa-trash me-1"></i> ${t.remove || 'Remove'}
                    </button>
                </div>
            `;
        }
    }
}

// =================== OPTION MANAGEMENT ===================

function addOption(questionId) {
    const question = questions.find(q => q.id === questionId);
    if (!question || question.options.length >= MAX_OPTIONS) return;
    
    const nextLetter = OPTION_LETTERS[question.options.length];
    question.options.push({
        letter: nextLetter,
        text: ''
    });
    
    refreshQuestionOptions(questionId);
    triggerAutoSave();
}

function removeLastOption(questionId) {
    const question = questions.find(q => q.id === questionId);
    if (!question || question.options.length <= MIN_OPTIONS) return;
    
    const removedOption = question.options.pop();
    
    // If removed option was the correct answer, reset to A
    if (question.correctAnswer === removedOption.letter) {
        question.correctAnswer = 'A';
    }
    
    refreshQuestionOptions(questionId);
    triggerAutoSave();
}

function refreshQuestionOptions(questionId) {
    const question = questions.find(q => q.id === questionId);
    if (!question) return;
    
    const optionsContainer = document.getElementById(`options-${questionId}`);
    const controlsContainer = optionsContainer.previousElementSibling.querySelector('.option-controls');
    
    // Update options HTML
    optionsContainer.innerHTML = createOptionsHtml(question);
    
    // Update controls
    controlsContainer.innerHTML = `
        ${question.options.length > MIN_OPTIONS ? 
            `<button class="btn btn-sm btn-outline-danger" 
                onclick="removeLastOption(${question.id})" type="button">
                <i class="fas fa-minus me-1"></i>${t.removeOption || 'Remove Option'}
            </button>` :
            `<button class="btn btn-sm btn-outline-danger" 
                onclick="removeLastOption(${question.id})" type="button" disabled>
                <i class="fas fa-minus me-1"></i>${t.removeOption || 'Remove Option'}
            </button>`
        }
        ${question.options.length < MAX_OPTIONS ? 
            `<button class="btn btn-sm btn-outline-primary me-2" 
                    onclick="addOption(${question.id})" type="button">
                <i class="fas fa-plus me-1"></i>${t.addOption || 'Add Option'}
            </button>` : 
            `<button class="btn btn-sm btn-outline-primary me-2" 
                    onclick="addOption(${question.id})" type="button" disabled>
                <i class="fas fa-plus me-1"></i>${t.addOption || 'Add Option'}
            </button>`
        }
    `;
    
    // Restore values and apply colors
    setTimeout(() => {
        question.options.forEach(option => {
            const optionEl = document.getElementById(`option-${questionId}-${option.letter}`);
            if (optionEl) optionEl.value = option.text;
        });
        
        if (question.correctAnswer) {
            selectCorrectAnswer(questionId, question.correctAnswer);
        }
        
        // Apply color classes
        applyOptionColors();
    }, 50);
}

// =================== UPDATE FUNCTIONS ===================

function updateQuestion(questionId, field, value) {
    const question = questions.find(q => q.id === questionId);
    if (!question) return;
    
    if (field.startsWith('option')) {
        const letter = field.slice(-1);
        const option = question.options.find(opt => opt.letter === letter);
        if (option) {
            option.text = value;
        }
    } else {
        question[field] = value;
    }
    
    updateQuizStatistics();
    triggerAutoSave();
}

function selectCorrectAnswer(questionId, letter) {
    const question = questions.find(q => q.id === questionId);
    if (!question) return;
    
    // Clear all radio buttons
    question.options.forEach(option => {
        const radioEl = document.getElementById(`radio-${questionId}-${option.letter}`);
        if (radioEl) radioEl.classList.remove('checked');
    });
    
    // Set selected radio button
    const selectedRadio = document.getElementById(`radio-${questionId}-${letter}`);
    if (selectedRadio) selectedRadio.classList.add('checked');
    
    question.correctAnswer = letter;
    triggerAutoSave();
}

function updateQuizStatistics() {
    const questionCountEl = document.getElementById('questionCount');
    const totalDurationEl = document.getElementById('totalDuration');
    
    if (questionCountEl) {
        questionCountEl.textContent = questions.length;
    }
    
    if (totalDurationEl) {
        const totalSeconds = questions.reduce((sum, q) => sum + (q.answerTime || DEFAULT_ANSWER_TIME), 0);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        totalDurationEl.textContent = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    }
}

// =================== IMAGE HANDLING ===================

function handleImageUpload(questionId, input) {
    if (!input.files || !input.files[0]) return;
    
    const file = input.files[0];
    const reader = new FileReader();
    
    reader.onload = function(e) {
        const question = questions.find(q => q.id === questionId);
        if (question) {
            question.image = {
                file: file,
                preview: e.target.result
            };
            
            const uploadZone = document.querySelector(`#question-${questionId} .image-upload-zone`);
            if (uploadZone) {
                uploadZone.classList.add('has-image');
                uploadZone.innerHTML = `
                    <img src="${e.target.result}" alt="Question Image" 
                         style="max-width: 100%; max-height: 200px; border-radius: 8px;">
                    <div class="mt-2">
                        <button class="btn btn-sm btn-outline-danger" 
                                onclick="removeImage(${questionId}, event)" type="button">
                            <i class="fas fa-trash me-1"></i> ${t.remove || 'Remove'}
                        </button>
                    </div>
                `;
            }
            triggerAutoSave();
        }
    };
    
    reader.readAsDataURL(file);
}

function removeImage(questionId, event) {
    if (event) event.stopPropagation();
    
    const question = questions.find(q => q.id === questionId);
    if (question) {
        question.image = null;
        const uploadZone = document.querySelector(`#question-${questionId} .image-upload-zone`);
        if (uploadZone) {
            uploadZone.classList.remove('has-image');
            uploadZone.innerHTML = `
                <input type="file" 
                       id="image-${questionId}" 
                       accept="image/*" 
                       style="display: none;" 
                       onchange="handleImageUpload(${questionId}, this)">
                <div class="upload-content">
                    <div class="upload-icon">
                        <i class="fas fa-cloud-upload-alt"></i>
                    </div>
                    <h6>${t.uploadImage || 'Upload Image'}</h6>
                    <p class="text-muted small mb-0">${t.clickSelectImage || 'Click to select image'}</p>
                </div>
            `;
        }
        triggerAutoSave();
    }
}

// =================== QUESTION OPERATIONS ===================

function moveQuestion(questionId, direction) {
    const idx = questions.findIndex(q => q.id === questionId);
    if (idx === -1) return;

    let newIdx = idx;
    if (direction === 'up' && idx > 0) {
        newIdx = idx - 1;
    } else if (direction === 'down' && idx < questions.length - 1) {
        newIdx = idx + 1;
    } else {
        const position = direction === 'up' ? t.top || 'top' : t.bottom || 'bottom';
        const msg = t.cannotMove ? 
            t.cannotMove.replace('{{direction}}', t[direction] || direction).replace('{{position}}', position) :
            `Cannot move ${direction}. Question is already at the ${position}.`;
        showNotification(msg, 'warning');
        return;
    }
    // Swap ids
    [questions[idx].id, questions[newIdx].id] = [questions[newIdx].id, questions[idx].id];
    // Swap questions
    [questions[idx], questions[newIdx]] = [questions[newIdx], questions[idx]];
    renderAllQuestions();
    triggerAutoSave();
    
    const msg = t.questionMoved ? 
        t.questionMoved.replace('{{direction}}', t[direction] || direction) :
        `Question moved ${direction} successfully!`;
    showNotification(msg, 'success');
}

function duplicateQuestion(questionId) {
    const idx = questions.findIndex(q => q.id === questionId);
    if (idx === -1) return;
    
    questionCount++;
    const original = questions[idx];
    
    const copyLabel = t.copy || 'Copy';
    const newQuestion = {
        id: questionCount,
        content: `${original.content} (${copyLabel})`,
        answerTime: original.answerTime,
        options: original.options.map(opt => ({ ...opt })),
        correctAnswer: original.correctAnswer,
        image: original.image ? {
            preview: original.image.preview,
            file: original.image.file
        } : null
    };
    
    // Handle image duplication
    setTimeout(() => {
        if (newQuestion.image && newQuestion.image.preview) {
            fetch(newQuestion.image.preview)
                .then(res => res.blob())
                .then(blob => {
                    const fileName = `question_${newQuestion.id}_image.png`;
                    const file = new File([blob], fileName, { type: blob.type || 'image/png' });
                    newQuestion.image.file = file;
                })
                .catch(err => {
                    console.error('Error creating file from image:', err);
                });
        }
    }, 100);
    
    questions.splice(idx + 1, 0, newQuestion);
    questions.forEach((q, i) => {
        q.id = i + 1; // Reassign IDs
    });
    renderAllQuestions();
    updateQuizStatistics();
    triggerAutoSave();
    
    // Apply colors after rendering
    setTimeout(() => {
        applyOptionColors();
    }, 200);
    
    showNotification(t.questionDuplicated || 'Question duplicated successfully!', 'success');
}

/**
 * Color utility functions
 */
function getOptionColorClass(letter) {
    return `letter-${letter.toLowerCase()}`;
}

function applyColorToElement(element, letter) {
    const colorClass = getOptionColorClass(letter);
    element.classList.add(colorClass);
}

/**
 * Observer to apply colors to dynamically added elements
 */
function setupColorObserver() {
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(node) {
                if (node.nodeType === 1) { // Element node
                    // Apply colors to any new option letters
                    const optionLetters = node.querySelectorAll('.option-letter, .preview-option-letter, .option-indicator');
                    optionLetters.forEach(element => {
                        const letter = element.textContent.trim();
                        if (letter && letter.length === 1) {
                            applyColorToElement(element, letter);
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

function deleteQuestion(questionId) {
    Swal.fire({
        title: t.deleteQuestion || 'Delete Question?',
        text: t.deleteQuestionConfirm || 'Are you sure you want to delete this question? This action cannot be undone.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: t.yesDelete || 'Yes, Delete',
        cancelButtonText: t.cancel || 'Cancel'
    }).then((result) => {
        if (result.isConfirmed) {
            questions = questions.filter(q => q.id !== questionId);
            const element = document.getElementById(`question-${questionId}`);
            if (element) {
                element.remove();
            }
            questions.forEach((q, i) => {
                q.id = i + 1; // Reassign IDs
            });
            updateQuizStatistics();
            triggerAutoSave();
            showNotification(t.questionDeleted || 'Question deleted successfully!', 'success');
        }
    });
}

// =================== AUTO-SAVE & DRAFT ===================

function setupAutoSave() {
    if (!isEditMode) {
        // Only auto-save in create mode
        setInterval(() => {
            if (hasUnsavedChanges) {
                saveDraft();
            }
        }, 30000);
    }
}

function triggerAutoSave() {
    hasUnsavedChanges = true;
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
        if (!isEditMode) {
            saveDraft();
        }
        // showAutoSaveIndicator();
    }, 2000);
}

function saveDraft() {
    if (isEditMode) return; // Don't save draft in edit mode
    
    const draftData = {
        title: document.getElementById('quizTitle').value,
        mode: document.getElementById('quizMode').value,
        startTime: document.getElementById('startTime')?.value || '',
        endTime: document.getElementById('endTime')?.value || '',
        questions: questions.map(q => ({
            ...q,
            image: q.image ? { preview: q.image.preview } : null
        })),
        timestamp: new Date().toISOString()
    };
    
    localStorage.setItem('quiz_form_draft', JSON.stringify(draftData));
    hasUnsavedChanges = false;
}

function loadDraftIfExists() {
    if (isEditMode) return;
    
    const draft = localStorage.getItem('quiz_form_draft');
    if (draft) {
        try {
            const draftData = JSON.parse(draft);
            Swal.fire({
                title: t.draftFound || 'Draft Found',
                text: t.restoreDraftConfirm || 'Would you like to restore your previous draft?',
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#667eea',
                cancelButtonColor: '#64748b',
                confirmButtonText: t.restoreDraft || 'Restore Draft',
                cancelButtonText: t.startFresh || 'Start Fresh'
            }).then((result) => {
                if (result.isConfirmed) {
                    restoreDraft(draftData);
                } else {
                    localStorage.removeItem('quiz_form_draft');
                }
            });
        } catch (error) {
            console.error('Error loading draft:', error);
            localStorage.removeItem('quiz_form_draft');
        }
    }
}

function restoreDraft(draftData) {
    document.getElementById('quizTitle').value = draftData.title || '';
    document.getElementById('quizMode').value = draftData.mode || 'online';
    
    if (draftData.startTime) document.getElementById('startTime').value = draftData.startTime;
    if (draftData.endTime) document.getElementById('endTime').value = draftData.endTime;
    
    // toggleScheduleSettings();
    
    questions = draftData.questions || [];
    questionCount = questions.length > 0 ? Math.max(...questions.map(q => q.id)) : 0;
    
    renderAllQuestions();
    questions.forEach(question => {
        setTimeout(() => {
            if (question.image && question.image.preview) {
                fetch(question.image.preview)
                        .then(res => res.blob())
                        .then(blob => {
                            const fileName = `question_${question.id}_image.png`;
                            const file = new File([blob], fileName, { type: blob.type || 'image/png' });
                            question.image.file = file;
                        })
                        .catch(err => {
                            console.error('Error creating file from image:', err);
                        });
            }

        },100);
    });
    updateQuizStatistics();
    
    showNotification(t.draftRestored || 'Draft restored successfully!', 'success');
}

function showAutoSaveIndicator() {
    const indicator = document.getElementById('autoSaveIndicator');
    if (indicator) {
        indicator.classList.add('show');
        setTimeout(() => {
            indicator.classList.remove('show');
        }, 2000);
    }
}

// =================== NEW PREVIEW LOGIC ===================

/**
 * Initialize the preview modal with single question display
 */
function previewQuiz() {
    if (questions.length === 0) {
        showNotification(t.noQuestionsPreview || 'Please add at least one question to preview', 'warning');
        return;
    }
    
    // Reset preview state
    currentPreviewQuestion = 0;
    selectedAnswer = null;
    stopTimer();
    
    // Set quiz basic info
    document.getElementById('previewTitle').textContent = 
        document.getElementById('quizTitle').value || 'Untitled Quiz';
    document.getElementById('previewMode').textContent = 
        document.getElementById('quizMode').value.charAt(0).toUpperCase() + 
        document.getElementById('quizMode').value.slice(1);
    
    // Show current question
    displayCurrentQuestion();
    updateProgress();
    
}

/**
 * Display the current question in preview mode
 */
function displayCurrentQuestion() {
    if (currentPreviewQuestion >= questions.length) {
        finishQuiz();
        return;
    }
    
    const question = questions[currentPreviewQuestion];
    const container = document.getElementById('previewQuestionContainer');
    
    // Reset selected answer for new question
    selectedAnswer = null;
    
    // Update question progress indicator
    document.getElementById('previewQuestionProgress').textContent = 
        `${currentPreviewQuestion + 1} of ${questions.length}`;
    
    // Build question HTML
    let questionHTML = `
        <div class="preview-question-header">
            <div class="preview-question-number">${currentPreviewQuestion + 1}</div>
            <div class="preview-question-content">
                <h5 class="preview-question-title">${question.content || 'Untitled Question'}</h5>
            </div>
        </div>
    `;
    
    // Add image if exists
    if (question.image && question.image.preview) {
        questionHTML += `
            <div class="preview-question-image">
                <img src="${question.image.preview}" alt="Question Image">
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
    questionHTML += '</div>';
    
    container.innerHTML = questionHTML;
    
    // Apply color classes after DOM insertion
    applyOptionColors();
    
    // Start timer for this question
    startQuestionTimer(question.answerTime || DEFAULT_ANSWER_TIME);
    
    // Update navigation buttons
    updateNavigationButtons();
}

/**
 * Enhanced option selection with tracking
 */
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

}

/**
 * Start the countdown timer for current question
 */
function startQuestionTimer(seconds) {
    timeRemaining = seconds;
    isTimerActive = true;
    
    // Hide next button initially
    document.getElementById('nextBtn').style.display = 'none';
    document.getElementById('finishBtn').style.display = 'none';
    
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

/**
 * Stop the current timer
 */
function stopTimer() {
    if (previewTimer) {
        clearInterval(previewTimer);
        previewTimer = null;
    }
    isTimerActive = false;
}

/**
 * Update the timer display
 */
function updateTimerDisplay() {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    
    document.getElementById('timerMinutes').textContent = minutes.toString().padStart(2, '0');
    document.getElementById('timerSeconds').textContent = seconds.toString().padStart(2, '0');
    
    // Update timer circle color based on time remaining
    const timerCircle = document.querySelector('.timer-circle');
    const totalTime = questions[currentPreviewQuestion]?.answerTime || DEFAULT_ANSWER_TIME;
    const percentageLeft = (timeRemaining / totalTime) * 100;
    
    timerCircle.classList.remove('warning', 'danger');
    
    if (percentageLeft <= 10) {
        timerCircle.classList.add('danger');
    } else if (percentageLeft <= 30) {
        timerCircle.classList.add('warning');
    }
}

/**
 * Enhanced onTimeUp - Show correct answer and mark wrong if applicable
 */
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
    
    // Show appropriate navigation button
    if (currentPreviewQuestion < questions.length - 1) {
        document.getElementById('nextBtn').style.display = 'inline-block';
    } else {
        document.getElementById('finishBtn').style.display = 'inline-block';
    }
    
    // Disable option selection
    options.forEach(option => {
        option.style.pointerEvents = 'none';
        option.style.opacity = '0.8';
    });
}

/**
 * Move to next question
 */
function nextQuestion() {
    if (currentPreviewQuestion < questions.length - 1) {
        currentPreviewQuestion++;
        selectedAnswer = null; // Reset for next question
        displayCurrentQuestion();
        updateProgress();
    }
}

/**
 * Update navigation buttons visibility
 */
function updateNavigationButtons() {
    const nextBtn = document.getElementById('nextBtn');
    const finishBtn = document.getElementById('finishBtn');
    
    // Next and Finish buttons are controlled by timer
    nextBtn.style.display = 'none';
    finishBtn.style.display = 'none';
}

/**
 * Update progress bar
 */
function updateProgress() {
    const progress = ((currentPreviewQuestion + 1) / questions.length) * 100;
    const progressBar = document.getElementById('previewProgress');
    if (progressBar) {
        progressBar.style.width = `${progress}%`;
        progressBar.setAttribute('aria-valuenow', progress);
    }
}

/**
 * Finish the quiz preview
 */
function finishQuiz() {
    stopTimer();
    
    const message = t.reviewedAllQuestions ? 
        t.reviewedAllQuestions.replace('{{count}}', questions.length) :
        `You've reviewed all ${questions.length} questions.`;
    
    Swal.fire({
        title: t.previewComplete || 'Quiz Preview Complete!',
        text: message,
        icon: 'success',
        confirmButtonText: t.exitPreview || 'Close Preview',
        confirmButtonColor: '#667eea'
    }).then(() => {
        const modal = bootstrap.Modal.getInstance(document.getElementById('previewModal'));
        if (modal) modal.hide();
    });
    
}

/**
 * Close preview and return to editing
 */
function editQuiz() {
    stopTimer();
    const modal = bootstrap.Modal.getInstance(document.getElementById('previewModal'));
    if (modal) modal.hide();
}

// Clean up when modal is hidden
document.getElementById('previewModal').addEventListener('hidden.bs.modal', function() {
    stopTimer();
    currentPreviewQuestion = 0;
    selectedAnswer = null;
});

function applyOptionColors() {
    // Apply colors to form editor option letters
    document.querySelectorAll('.option-letter').forEach(element => {
        const letter = element.textContent.trim();
        const colorClass = `letter-${letter.toLowerCase()}`;
        element.classList.add(colorClass);
    });
    
    // Apply colors to preview option letters
    document.querySelectorAll('.preview-option-letter').forEach(element => {
        const letter = element.textContent.trim();
        const colorClass = `letter-${letter.toLowerCase()}`;
        element.classList.add(colorClass);
    });
    
    // Apply colors to option indicators (for quiz preview page)
    document.querySelectorAll('.option-indicator').forEach(element => {
        const letter = element.textContent.trim();
        const colorClass = `letter-${letter.toLowerCase()}`;
        element.classList.add(colorClass);
    });
}

// =================== SUBMIT FUNCTIONS ===================

function publishQuiz() {
    if (!validateQuizData()) return;
    
    Swal.fire({
        title: t.publishConfirm || 'Publish Quiz?',
        text: t.publishConfirmText || "Your quiz will be available for students to take.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#64748b',
        confirmButtonText: t.yesPublish || 'Yes, publish it!'
    }).then((result) => {
        if (result.isConfirmed) {
            submitQuizToServer(false);
        }
    });
}

function updateQuiz() {
    if (!validateQuizData()) return;
    
    Swal.fire({
        title: t.updateConfirm || 'Update Quiz?',
        text: t.updateConfirmText || "All changes will be saved.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#667eea',
        cancelButtonColor: '#64748b',
        confirmButtonText: t.yesUpdate || 'Yes, update it!'
    }).then((result) => {
        if (result.isConfirmed) {
            submitQuizToServer(true);
        }
    });
}

function validateQuizData() {
    const title = document.getElementById('quizTitle').value.trim();
    if (!title) {
        showNotification(t.enterQuizTitle || 'Please enter a quiz title', 'error');
        return false;
    }
    
    if (questions.length === 0) {
        showNotification(t.addAtLeastOneQuestion || 'Please add at least one question', 'error');
        return false;
    }
    
    for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        if (!question.content.trim()) {
            const msg = t.questionEmpty ? 
                t.questionEmpty.replace('{{number}}', i + 1) :
                `Question ${i + 1} is empty`;
            showNotification(msg, 'error');
            return false;
        }
        
        const validOptions = question.options.filter(opt => opt.text && opt.text.trim());
        if (validOptions.length < 2) {
            const msg = t.needTwoOptions ? 
                t.needTwoOptions.replace('{{number}}', i + 1) :
                `Question ${i + 1} needs at least 2 answer options`;
            showNotification(msg, 'error');
            return false;
        }
        
        if (!question.correctAnswer || !question.options.find(opt => opt.letter === question.correctAnswer && opt.text.trim())) {
            const msg = t.needValidAnswer ? 
                t.needValidAnswer.replace('{{number}}', i + 1) :
                `Question ${i + 1} needs a valid correct answer`;
            showNotification(msg, 'error');
            return false;
        }
    }
    
    return true;
}

function submitQuizToServer(isUpdate) {
    const loadingTitle = isUpdate ? 
        (t.updating || 'Updating Quiz...') : 
        (t.publishing || 'Publishing Quiz...');
    const loadingText = isUpdate ? 
        (t.updatingText || 'Please wait while we save your changes.') : 
        (t.publishingText || 'Please wait while we publish your quiz.');
    
    Swal.fire({
        title: loadingTitle,
        text: loadingText,
        allowOutsideClick: false,
        showConfirmButton: false,
        willOpen: () => Swal.showLoading()
    });

    // Prepare data (removed language)
    const quizInfo = {
        title: document.getElementById('quizTitle').value,
        mode: document.getElementById('quizMode').value,
        scheduleSettings: null
    };

    // if (quizInfo.mode === 'offline') {
    //     const startTime = document.getElementById('startTime').value;
    //     const endTime = document.getElementById('endTime').value;
    //     if (startTime && endTime) {
    //         quizInfo.scheduleSettings = { startTime, endTime };
    //     }
    // }

    const questionsData = questions.map((question, index) => {
        const imgElement = document.querySelector(`#question-${index + 1} .image-upload-zone img`);
        let imageSrc = imgElement ? imgElement.src : null;
        if (imageSrc && imageSrc.includes('data:image')) {
            imageSrc = null
        }
        return {
            number: index + 1,
            content: question.content,
            answerTime: question.answerTime || DEFAULT_ANSWER_TIME,
            options: question.options.filter(opt => opt.text && opt.text.trim()),
            correctAnswer: question.correctAnswer,
            image: imageSrc
        };
    });
    // Create FormData
    const formData = new FormData();
    formData.append('quizInfo', JSON.stringify(quizInfo));
    formData.append('questionsData', JSON.stringify(questionsData));

    // Add image files
    questions.forEach((question, index) => {
        if (question.image && question.image.file) {
            formData.append(`questionImage_${index + 1}`, question.image.file);
        }
    });

    // Submit
    const url = isUpdate ? `/quizzes/${quizId}` : '/quizzes';
    const method = isUpdate ? 'PUT' : 'POST';

    fetch(url, { method, body: formData })
        .then(response => {
            if (!response.ok) {
                return response.json().then(data => {
                    throw new Error(data.error || 'Network response was not ok');
                });
            }
            return response.json();
        })
        .then(data => {
            if (!isUpdate) {
                localStorage.removeItem('quiz_form_draft');
            }
            
            const successTitle = isUpdate ? 
                (t.quizUpdated || 'Quiz Updated!') : 
                (t.quizPublished || 'Quiz Published!');
            const successText = isUpdate ? 
                (t.quizUpdatedText || 'Your quiz has been updated successfully.') : 
                (t.quizPublishedText || 'Your quiz has been published successfully.');
            
            Swal.fire({
                title: successTitle,
                text: successText,
                icon: 'success',
                confirmButtonText: t.viewQuizDashboard || 'View Quiz Dashboard'
            }).then(() => {
                window.location.href = '/quizzes';
            });
        })
        .catch(error => {
            console.error('Error:', error);
            Swal.fire({
                icon: 'error',
                title: t.error || 'Error!',
                text: error.message || (t.failedSaveQuiz || 'Failed to save quiz. Please try again.'),
                confirmButtonColor: '#667eea'
            });
        });
}

// =================== UTILITY FUNCTIONS ===================

// function toggleScheduleSettings() {
//     const mode = document.getElementById('quizMode').value;
//     const scheduleSettings = document.getElementById('scheduleSettings');
//     scheduleSettings.style.display = mode === 'offline' ? 'block' : 'none';
// }

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        z-index: 9999;
        padding: 12px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        max-width: 350px;
        animation: slideInRight 0.3s ease-out;
        backdrop-filter: blur(10px);
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
    `;
    
    const colors = {
        success: 'linear-gradient(135deg, #10b981, #059669)',
        error: 'linear-gradient(135deg, #ef4444, #dc2626)',
        warning: 'linear-gradient(135deg, #f59e0b, #d97706)',
        info: 'linear-gradient(135deg, #3b82f6, #1d4ed8)'
    };
    
    notification.style.background = colors[type] || colors.info;
    
    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };
    
    notification.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="${icons[type] || icons.info} me-2"></i>
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-in';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Add CSS animations
if (!document.querySelector('#notificationStyles')) {
    const style = document.createElement('style');
    style.id = 'notificationStyles';
    style.textContent = `
        @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        
        @keyframes slideOutRight {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}

// Export functions for global access
window.addQuestion = addQuestion;
window.updateQuestion = updateQuestion;
window.selectCorrectAnswer = selectCorrectAnswer;
window.addOption = addOption;
window.removeLastOption = removeLastOption;
window.handleImageUpload = handleImageUpload;
window.removeImage = removeImage;
window.moveQuestion = moveQuestion;
window.duplicateQuestion = duplicateQuestion;
window.deleteQuestion = deleteQuestion;
window.previewQuiz = previewQuiz;
window.editQuiz = editQuiz;
window.publishQuiz = publishQuiz;
window.updateQuiz = updateQuiz;
// window.toggleScheduleSettings = toggleScheduleSettings;
window.nextQuestion = nextQuestion;
window.finishQuiz = finishQuiz;
window.selectPreviewOption = selectPreviewOption;
window.applyOptionColors = applyOptionColors;
window.getOptionColorClass = getOptionColorClass;
window.applyColorToElement = applyColorToElement;