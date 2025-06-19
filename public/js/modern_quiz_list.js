// Modern Quiz List JavaScript
document.addEventListener('DOMContentLoaded', function() {
    initializeQuizList();
});

/**
 * Initialize the quiz list functionality
 */
function initializeQuizList() {
    setupFilters();
    setupViewToggle();
    setupAnimations();
    setupKeyboardShortcuts();
    updateQuizCount();
}

/**
 * Setup filter functionality
 */
function setupFilters() {
    const searchInput = document.getElementById('searchQuiz');
    const modeFilter = document.getElementById('filterMode');
    const languageFilter = document.getElementById('filterLanguage');
    const sortSelect = document.getElementById('sortBy');

    // Real-time search with debouncing
    let searchTimeout;
    searchInput?.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            applyFilters();
        }, 300);
    });

    // Filter change events
    modeFilter?.addEventListener('change', applyFilters);
    languageFilter?.addEventListener('change', applyFilters);
    sortSelect?.addEventListener('change', applySorting);

    // Clear filters functionality
    window.clearFilters = function() {
        if (searchInput) searchInput.value = '';
        if (modeFilter) modeFilter.value = '';
        if (languageFilter) languageFilter.value = '';
        if (sortSelect) sortSelect.value = 'newest';
        
        applyFilters();
        
        // Show success feedback
        showNotification('Filters cleared successfully', 'success');
    };
}

/**
 * Apply filters to quiz cards
 */
function applyFilters() {
    const searchText = document.getElementById('searchQuiz')?.value.toLowerCase() || '';
    const modeFilter = document.getElementById('filterMode')?.value || '';
    const languageFilter = document.getElementById('filterLanguage')?.value || '';
    
    const quizCards = document.querySelectorAll('.quiz-card');
    let visibleCount = 0;

    // Show loading state
    showLoadingState(true);

    setTimeout(() => {
        quizCards.forEach((card, index) => {
            const title = card.dataset.title || '';
            const mode = card.dataset.mode || '';
            const language = card.dataset.language || '';

            const matchesSearch = !searchText || title.includes(searchText);
            const matchesMode = !modeFilter || mode === modeFilter;
            const matchesLanguage = !languageFilter || language === languageFilter;

            const shouldShow = matchesSearch && matchesMode && matchesLanguage;

            if (shouldShow) {
                card.style.display = 'block';
                card.style.animation = `fadeInUp 0.6s ease-out ${index * 0.1}s both`;
                visibleCount++;
            } else {
                card.style.display = 'none';
            }
        });

        // Show/hide no results state
        const noResults = document.getElementById('noResults');
        if (visibleCount === 0 && quizCards.length > 0) {
            noResults.style.display = 'block';
        } else {
            noResults.style.display = 'none';
        }

        // Hide loading state
        showLoadingState(false);
        
        // Update count
        updateQuizCount(visibleCount);
    }, 500);
}

/**
 * Apply sorting to quiz cards - UPDATED with quiz number sorting
 */
function applySorting() {
    const sortBy = document.getElementById('sortBy')?.value || 'newest';
    const quizGrid = document.getElementById('quizGrid');
    const quizCards = Array.from(document.querySelectorAll('.quiz-card'));

    quizCards.sort((a, b) => {
        switch (sortBy) {
            case 'newest':
                return new Date(b.dataset.date) - new Date(a.dataset.date);
            case 'oldest':
                return new Date(a.dataset.date) - new Date(b.dataset.date);
            case 'name':
                return a.dataset.title.localeCompare(b.dataset.title);
            case 'number':
                // NEW: Sort by quiz number
                const numberA = parseInt(a.dataset.number) || 0;
                const numberB = parseInt(b.dataset.number) || 0;
                return numberA - numberB; // Ascending order (1, 2, 3...)
            case 'questions':
                return parseInt(b.dataset.questions) - parseInt(a.dataset.questions);
            default:
                return 0;
        }
    });

    // Re-append sorted cards
    quizCards.forEach((card, index) => {
        card.style.animation = `fadeInUp 0.6s ease-out ${index * 0.05}s both`;
        quizGrid.appendChild(card);
    });
}

/**
 * Setup view toggle functionality
 */
function setupViewToggle() {
    const viewButtons = document.querySelectorAll('.view-btn');
    const quizGrid = document.getElementById('quizGrid');

    viewButtons.forEach(button => {
        button.addEventListener('click', function() {
            const view = this.dataset.view;
            
            // Update active state
            viewButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            // Update grid class
            if (view === 'list') {
                quizGrid?.classList.add('list-view');
            } else {
                quizGrid?.classList.remove('list-view');
            }
            
            // Store preference
            localStorage.setItem('quizListView', view);
            
            // Show feedback
            showNotification(`Switched to ${view} view`, 'info');
        });
    });

    // Load saved preference
    const savedView = localStorage.getItem('quizListView');
    if (savedView) {
        const button = document.querySelector(`[data-view="${savedView}"]`);
        if (button) {
            button.click();
        }
    }
}

/**
 * Setup animations for quiz cards
 */
function setupAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.animation = 'fadeInUp 0.6s ease-out';
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.quiz-card').forEach(card => {
        observer.observe(card);
    });
}

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + K for search focus
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            document.getElementById('searchQuiz')?.focus();
        }
        
        // Escape to clear search
        if (e.key === 'Escape') {
            const searchInput = document.getElementById('searchQuiz');
            if (searchInput && searchInput === document.activeElement) {
                searchInput.value = '';
                applyFilters();
                searchInput.blur();
            }
        }
    });
}

/**
 * Show/hide loading state
 */
function showLoadingState(show) {
    const loadingState = document.getElementById('loadingState');
    const quizGrid = document.getElementById('quizGrid');
    
    if (show) {
        loadingState.style.display = 'block';
        quizGrid.style.opacity = '0.5';
    } else {
        loadingState.style.display = 'none';
        quizGrid.style.opacity = '1';
    }
}

/**
 * Update quiz count display
 */
function updateQuizCount(visibleCount = null) {
    const totalQuizzes = document.querySelectorAll('.quiz-card').length;
    const displayCount = visibleCount !== null ? visibleCount : totalQuizzes;
    
    // Update stats in header
    const statNumbers = document.querySelectorAll('.stat-number');
    if (statNumbers[0]) {
        animateCounter(statNumbers[0], displayCount);
    }
}

/**
 * Animate counter numbers
 */
function animateCounter(element, target) {
    const start = parseInt(element.textContent) || 0;
    const duration = 500;
    const startTime = performance.now();
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const current = Math.floor(start + (target - start) * progress);
        
        element.textContent = current;
        
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    
    requestAnimationFrame(update);
}

/**
 * Delete quiz functionality
 */
async function deleteQuiz(quizId) {
    try {
        const result = await Swal.fire({
            title: 'Delete Quiz?',
            text: "This action cannot be undone. All quiz data will be permanently removed.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Yes, Delete Quiz',
            cancelButtonText: 'Cancel',
            customClass: {
                popup: 'swal-modern',
                confirmButton: 'swal-confirm-modern',
                cancelButton: 'swal-cancel-modern'
            }
        });

        if (result.isConfirmed) {
            // Show loading
            Swal.fire({
                title: 'Deleting Quiz...',
                text: 'Please wait while we remove the quiz.',
                icon: 'info',
                allowOutsideClick: false,
                showConfirmButton: false,
                customClass: {
                    popup: 'swal-modern'
                }
            });

            const response = await fetch(`/quizzes/${quizId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to delete quiz');
            }

            // Remove card with animation
            const quizCard = document.querySelector(`[data-quiz-id="${quizId}"]`) || 
                            document.querySelector(`.quiz-card:has(a[href*="${quizId}"])`);
            
            if (quizCard) {
                quizCard.style.animation = 'fadeOut 0.5s ease-out';
                setTimeout(() => {
                    quizCard.remove();
                    updateQuizCount();
                    applyFilters(); // Reapply filters to update counts
                }, 500);
            }

            Swal.fire({
                title: 'Quiz Deleted!',
                text: 'The quiz has been successfully removed.',
                icon: 'success',
                timer: 3000,
                timerProgressBar: true,
                showConfirmButton: false,
                customClass: {
                    popup: 'swal-modern'
                }
            });

        }
    } catch (error) {
        console.error('Delete quiz error:', error);
        Swal.fire({
            title: 'Error!',
            text: 'Failed to delete the quiz. Please try again.',
            icon: 'error',
            confirmButtonColor: '#667eea',
            customClass: {
                popup: 'swal-modern'
            }
        });
    }
}

/**
 * Duplicate quiz functionality
 */
async function duplicateQuiz(quizId) {
    try {
        const result = await Swal.fire({
            title: 'Duplicate Quiz?',
            text: "This will create an exact copy of the quiz with a new number.",
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#667eea',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Yes, Duplicate',
            cancelButtonText: 'Cancel',
            customClass: {
                popup: 'swal-modern'
            }
        });

        if (result.isConfirmed) {
            // Show loading
            Swal.fire({
                title: 'Duplicating Quiz...',
                text: 'Creating a copy of your quiz with a new quiz number.',
                icon: 'info',
                allowOutsideClick: false,
                showConfirmButton: false,
                customClass: {
                    popup: 'swal-modern'
                }
            });

            // Simulate API call (implement actual duplication)
            await new Promise(resolve => setTimeout(resolve, 2000));

            Swal.fire({
                title: 'Quiz Duplicated!',
                text: 'The quiz copy has been created successfully with a new quiz number.',
                icon: 'success',
                timer: 3000,
                timerProgressBar: true,
                showConfirmButton: false,
                customClass: {
                    popup: 'swal-modern'
                }
            });

            // Refresh page to show new quiz
            setTimeout(() => {
                window.location.reload();
            }, 3000);
        }
    } catch (error) {
        console.error('Duplicate quiz error:', error);
        Swal.fire({
            title: 'Error!',
            text: 'Failed to duplicate the quiz. Please try again.',
            icon: 'error',
            confirmButtonColor: '#667eea',
            customClass: {
                popup: 'swal-modern'
            }
        });
    }
}

/**
 * Share quiz functionality
 */
async function shareQuiz(quizId) {
    try {
        const shareUrl = `${window.location.origin}/quiz/${quizId}/join`;
        
        const result = await Swal.fire({
            title: 'Share Quiz',
            html: `
                <div class="share-content">
                    <p class="mb-3">Share this quiz with participants:</p>
                    <div class="input-group mb-3">
                        <input type="text" class="form-control" value="${shareUrl}" id="shareUrl" readonly>
                        <button class="btn btn-outline-secondary" onclick="copyToClipboard('shareUrl')">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                    <div class="share-buttons">
                        <button class="btn btn-primary me-2" onclick="shareViaEmail('${shareUrl}')">
                            <i class="fas fa-envelope me-1"></i> Email
                        </button>
                        <button class="btn btn-success me-2" onclick="shareViaWhatsApp('${shareUrl}')">
                            <i class="fab fa-whatsapp me-1"></i> WhatsApp
                        </button>
                        <button class="btn btn-info" onclick="generateQRCode('${shareUrl}')">
                            <i class="fas fa-qrcode me-1"></i> QR Code
                        </button>
                    </div>
                </div>
            `,
            showConfirmButton: false,
            showCancelButton: true,
            cancelButtonText: 'Close',
            cancelButtonColor: '#64748b',
            customClass: {
                popup: 'swal-modern swal-wide'
            }
        });

    } catch (error) {
        console.error('Share quiz error:', error);
        showNotification('Failed to share quiz', 'error');
    }
}

/**
 * Copy text to clipboard
 */
function copyToClipboard(inputId) {
    const input = document.getElementById(inputId);
    input.select();
    document.execCommand('copy');
    showNotification('Link copied to clipboard!', 'success');
}

/**
 * Share via email
 */
function shareViaEmail(url) {
    const subject = encodeURIComponent('Join my quiz!');
    const body = encodeURIComponent(`Hi! I'd like to invite you to take my quiz. You can access it here: ${url}`);
    window.open(`mailto:?subject=${subject}&body=${body}`);
}

/**
 * Share via WhatsApp
 */
function shareViaWhatsApp(url) {
    const text = encodeURIComponent(`Join my quiz: ${url}`);
    window.open(`https://wa.me/?text=${text}`);
}

/**
 * Generate QR Code
 */
function generateQRCode(url) {
    // This would integrate with a QR code library
    showNotification('QR Code generation feature coming soon!', 'info');
}

/**
 * Refresh quizzes
 */
function refreshQuizzes() {
    showLoadingState(true);
    
    // Simulate refresh delay
    setTimeout(() => {
        showLoadingState(false);
        showNotification('Quizzes refreshed successfully!', 'success');
        
        // Re-animate cards
        document.querySelectorAll('.quiz-card').forEach((card, index) => {
            card.style.animation = `fadeInUp 0.6s ease-out ${index * 0.1}s both`;
        });
    }, 1500);
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas ${getNotificationIcon(type)} me-2"></i>
            <span>${message}</span>
        </div>
    `;
    
    // Style the notification
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 9999;
        padding: 1rem 1.5rem;
        border-radius: 12px;
        color: white;
        font-weight: 500;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
        animation: slideInRight 0.3s ease-out;
        max-width: 400px;
    `;
    
    // Set background color based on type
    const colors = {
        success: '#10b981',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6'
    };
    notification.style.background = colors[type] || colors.info;
    
    document.body.appendChild(notification);
    
    // Auto remove
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-in';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 4000);
}

/**
 * Get notification icon
 */
function getNotificationIcon(type) {
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    return icons[type] || icons.info;
}

// Add CSS for animations and notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOutRight {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    @keyframes fadeOut {
        from { opacity: 1; transform: scale(1); }
        to { opacity: 0; transform: scale(0.8); }
    }
    
    .swal-modern {
        border-radius: 16px !important;
    }
    
    .swal-wide {
        width: 600px !important;
        max-width: 90vw !important;
    }
    
    .share-content {
        text-align: center;
    }
    
    .share-buttons {
        display: flex;
        justify-content: center;
        gap: 0.5rem;
        flex-wrap: wrap;
    }
    
    .notification-content {
        display: flex;
        align-items: center;
    }
`;
document.head.appendChild(style);

// Make functions available globally
window.deleteQuiz = deleteQuiz;
window.duplicateQuiz = duplicateQuiz;
window.shareQuiz = shareQuiz;
window.refreshQuizzes = refreshQuizzes;
window.copyToClipboard = copyToClipboard;
window.shareViaEmail = shareViaEmail;
window.shareViaWhatsApp = shareViaWhatsApp;
window.generateQRCode = generateQRCode;