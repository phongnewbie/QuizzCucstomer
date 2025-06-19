// Player Dashboard JavaScript
document.addEventListener('DOMContentLoaded', function() {
    // Initialize dashboard
    initializeAnimations();
    initializeInteractions();
    initializeStats();
    setupRippleEffects();
});

/**
 * Initialize page animations
 */
function initializeAnimations() {
    // Animate elements on page load
    const elements = document.querySelectorAll('.fade-in, .fade-in-up, .fade-in-up-delay');
    
    elements.forEach((el, index) => {
        // Set initial state
        el.style.opacity = '0';
        if (el.classList.contains('fade-in-up') || el.classList.contains('fade-in-up-delay')) {
            el.style.transform = 'translateY(20px)';
        }
        
        // Animate with delay
        setTimeout(() => {
            el.style.transition = 'all 0.6s ease-out';
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        }, index * 100);
    });
}

/**
 * Initialize card hover interactions
 */
function initializeInteractions() {
    // Action card hover effects
    const actionCards = document.querySelectorAll('.action-card');
    actionCards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-8px)';
        });
        
        card.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
        });
    });

    // Stat card hover effects
    const statCards = document.querySelectorAll('.stat-card');
    statCards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-4px)';
        });
        
        card.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
        });
    });

    // Quick action button hover effects
    const quickButtons = document.querySelectorAll('.quick-action-btn');
    quickButtons.forEach(button => {
        button.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-2px)';
        });
        
        button.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
        });
    });
}

/**
 * Initialize and animate statistics counters
 */
function initializeStats() {
    // Wait a bit before animating stats
    setTimeout(() => {
        const statElements = document.querySelectorAll('.stat-value');
        
        statElements.forEach(element => {
            const target = parseInt(element.dataset.target) || 0;
            const suffix = element.dataset.suffix || '';
            
            if (target > 0) {
                animateCounter(element, target, suffix);
            }
        });
    }, 1000);
}

/**
 * Animate counter from 0 to target value
 * @param {HTMLElement} element - The element to animate
 * @param {number} target - Target number
 * @param {string} suffix - Suffix to add (like %)
 */
function animateCounter(element, target, suffix = '') {
    let current = 0;
    const increment = target / 30; // Complete animation in ~30 steps
    const duration = 1500; // Total duration in ms
    const stepTime = duration / 30;
    
    const timer = setInterval(() => {
        current += increment;
        
        if (current >= target) {
            current = target;
            clearInterval(timer);
        }
        
        element.textContent = Math.floor(current) + suffix;
    }, stepTime);
}

/**
 * Setup ripple effects for buttons
 */
function setupRippleEffects() {
    const buttons = document.querySelectorAll('.action-button, .quick-action-btn');
    
    buttons.forEach(button => {
        button.addEventListener('click', function(e) {
            createRipple(e, this);
        });
    });
}

/**
 * Create ripple effect on button click
 * @param {Event} e - Click event
 * @param {HTMLElement} element - Button element
 */
function createRipple(e, element) {
    const ripple = document.createElement('div');
    const rect = element.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    
    ripple.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        left: ${x}px;
        top: ${y}px;
        background: rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        transform: scale(0);
        animation: ripple 0.6s ease-out;
        pointer-events: none;
        z-index: 1;
    `;
    
    // Ensure button has relative positioning
    element.style.position = 'relative';
    element.style.overflow = 'hidden';
    
    element.appendChild(ripple);
    
    // Remove ripple after animation
    setTimeout(() => {
        if (ripple.parentNode) {
            ripple.parentNode.removeChild(ripple);
        }
    }, 600);
}

/**
 * Show loading state on action buttons
 * @param {HTMLElement} button - Button to show loading state
 */
function showLoading(button) {
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Loading...';
    button.disabled = true;
    button.classList.add('loading');
    
    return originalText;
}

/**
 * Hide loading state and restore button
 * @param {HTMLElement} button - Button to restore
 * @param {string} originalText - Original button text
 */
function hideLoading(button, originalText) {
    button.innerHTML = originalText;
    button.disabled = false;
    button.classList.remove('loading');
}

/**
 * Show notification toast
 * @param {string} message - Message to show
 * @param {string} type - Type of notification (success, error, info, warning)
 */
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} notification-toast`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 9999;
        min-width: 300px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
        border-radius: 12px;
        border: none;
        animation: slideInRight 0.3s ease-out;
    `;
    
    const icon = getNotificationIcon(type);
    notification.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="${icon} me-2"></i>
            <span>${message}</span>
            <button type="button" class="btn-close ms-auto" onclick="this.parentElement.parentElement.remove()"></button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOutRight 0.3s ease-in';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }
    }, 5000);
}

/**
 * Get appropriate icon for notification type
 * @param {string} type - Notification type
 * @returns {string} - Font Awesome icon class
 */
function getNotificationIcon(type) {
    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };
    return icons[type] || icons.info;
}

/**
 * Smooth scroll to element
 * @param {string} selector - CSS selector of target element
 */
function scrollToElement(selector) {
    const element = document.querySelector(selector);
    if (element) {
        element.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }
}

/**
 * Handle quick action clicks
 * @param {string} action - Action type
 * @param {HTMLElement} button - Clicked button
 */
function handleQuickAction(action, button) {
    const originalText = showLoading(button);
    
    // Simulate action processing
    setTimeout(() => {
        hideLoading(button, originalText);
        
        switch (action) {
            case 'join-quiz':
                window.location.href = '/player/join-quiz';
                break;
            case 'history':
                window.location.href = '/player/history';
                break;
            case 'leaderboard':
                showNotification('Leaderboard feature coming soon!', 'info');
                break;
            case 'achievements':
                showNotification('Achievements feature coming soon!', 'info');
                break;
            case 'study-guide':
                showNotification('Study guide feature coming soon!', 'info');
                break;
            default:
                showNotification('Feature not implemented yet', 'warning');
        }
    }, 1000);
}

/**
 * Update user stats (can be called from external sources)
 * @param {Object} stats - Stats object with new values
 */
function updateStats(stats) {
    if (stats.quizzesCompleted !== undefined) {
        const element = document.querySelector('.stat-card.primary .stat-value');
        element.dataset.target = stats.quizzesCompleted;
        animateCounter(element, stats.quizzesCompleted);
    }
    
    if (stats.averageScore !== undefined) {
        const element = document.querySelector('.stat-card.success .stat-value');
        element.dataset.target = stats.averageScore;
        animateCounter(element, stats.averageScore, '%');
    }
    
    if (stats.activeStreaks !== undefined) {
        const element = document.querySelector('.stat-card.warning .stat-value');
        element.dataset.target = stats.activeStreaks;
        animateCounter(element, stats.activeStreaks);
    }
    
    if (stats.totalPoints !== undefined) {
        const element = document.querySelector('.stat-card.info .stat-value');
        element.dataset.target = stats.totalPoints;
        animateCounter(element, stats.totalPoints);
    }
}

/**
 * Refresh dashboard data
 */
function refreshDashboard() {
    // Show loading state
    document.querySelectorAll('.stat-card').forEach(card => {
        card.classList.add('loading');
    });
    
    // Simulate API call to refresh data
    // In real implementation, this would fetch from your API
    setTimeout(() => {
        // Remove loading state
        document.querySelectorAll('.stat-card').forEach(card => {
            card.classList.remove('loading');
        });
        
        // Update with new data (example)
        updateStats({
            quizzesCompleted: Math.floor(Math.random() * 20),
            averageScore: Math.floor(Math.random() * 100),
            activeStreaks: Math.floor(Math.random() * 10),
            totalPoints: Math.floor(Math.random() * 1000)
        });
        
        showNotification('Dashboard refreshed successfully!', 'success');
    }, 2000);
}

// Add CSS for animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .notification-toast {
        animation: slideInRight 0.3s ease-out;
    }
`;
document.head.appendChild(style);

// Export functions for external use
window.PlayerDashboard = {
    showNotification,
    updateStats,
    refreshDashboard,
    showLoading,
    hideLoading,
    handleQuickAction
};